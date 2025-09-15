import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from './supabaseClient';
import accountService from './AccountService';
import { storageService } from './storageService';
import { addonEmitter, ADDON_EVENTS, stremioService } from './stremioService';
import { catalogService, StreamingContent } from './catalogService';
// import localScraperService from './localScraperService';
import { settingsEmitter } from '../hooks/useSettings';
import { logger } from '../utils/logger';
import { traktService } from './traktService';

type WatchProgressRow = {
  user_id: string;
  media_type: string;
  media_id: string;
  episode_id: string;
  current_time_seconds: number;
  duration_seconds: number;
  last_updated_ms: number;
  trakt_synced?: boolean;
  trakt_last_synced_ms?: number | null;
  trakt_progress_percent?: number | null;
};

const SYNC_QUEUE_KEY = '@sync_queue';

class SyncService {
  private static instance: SyncService;
  private syncing = false;
  private suppressPush = false;
  private realtimeChannels: any[] = [];
  private pullDebounceTimer: NodeJS.Timeout | null = null;
  private addonsPollInterval: NodeJS.Timeout | null = null;
  private suppressLibraryPush: boolean = false;
  private libraryUnsubscribe: (() => void) | null = null;

  static getInstance(): SyncService {
    if (!SyncService.instance) SyncService.instance = new SyncService();
    return SyncService.instance;
  }

  init(): void {
    // Watch progress updates
    storageService.subscribeToWatchProgressUpdates(() => {
      if (this.suppressPush) return;
      logger.log('[Sync] watch_progress local change → push');
      this.pushWatchProgress().catch(() => undefined);
    });
    storageService.onWatchProgressRemoved((id, type, episodeId) => {
      if (this.suppressPush) return;
      logger.log(`[Sync] watch_progress removed → soft delete ${type}:${id}:${episodeId || ''}`);
      this.softDeleteWatchProgress(type, id, episodeId).catch(() => undefined);
    });

    // Addon order and changes
    addonEmitter.on(ADDON_EVENTS.ORDER_CHANGED, () => { logger.log('[Sync] addon order changed → push'); this.pushAddons(); });
    addonEmitter.on(ADDON_EVENTS.ADDON_ADDED, () => { logger.log('[Sync] addon added → push'); this.pushAddons(); });
    addonEmitter.on(ADDON_EVENTS.ADDON_REMOVED, () => { logger.log('[Sync] addon removed → push'); this.pushAddons(); });

    // Settings updates: no realtime push; sync only on app restart
    logger.log('[Sync] init completed (listeners wired; settings push disabled)');

    // Library local change → push
    if (this.libraryUnsubscribe) {
      try { this.libraryUnsubscribe(); } catch {}
      this.libraryUnsubscribe = null;
    }
    const unsubAdd = catalogService.onLibraryAdd((item) => {
      if (this.suppressLibraryPush) return;
      logger.log(`[Sync] library add → push ${item.type}:${item.id}`);
      this.pushLibraryAdd(item).catch(() => undefined);
    });
    const unsubRem = catalogService.onLibraryRemove((type, id) => {
      if (this.suppressLibraryPush) return;
      logger.log(`[Sync] library remove → push ${type}:${id}`);
      this.pushLibraryRemove(type, id).catch(() => undefined);
    });
    this.libraryUnsubscribe = () => { try { unsubAdd(); unsubRem(); } catch {} };
  }

  subscribeRealtime = async (): Promise<void> => {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    const userId = user.id;
    const traktActive = await traktService.isAuthenticated();

    const addChannel = (table: string, handler: (payload: any) => void) => {
      const channel = supabase
        .channel(`rt-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, handler)
        .subscribe();
      this.realtimeChannels.push(channel);
      logger.log(`[Sync] Realtime subscribed: ${table}`);
    };

    // Watch progress realtime is disabled when Trakt is active
    if (!traktActive) {
      // Watch progress: apply granular updates (ignore self-caused pushes via suppressPush)
      addChannel('watch_progress', async (payload) => {
        try {
          const row = (payload.new || payload.old);
          if (!row) return;
          const type = row.media_type as string;
          const id = row.media_id as string;
          const episodeId = (payload.eventType === 'DELETE') ? (row.episode_id || '') : (row.episode_id || '');
          this.suppressPush = true;
          const deletedAt = (row as any).deleted_at;
          if (payload.eventType === 'DELETE' || deletedAt) {
            await storageService.removeWatchProgress(id, type, episodeId || undefined);
            // Record tombstone with remote timestamp if available
            try {
              const remoteUpdated = (row as any).updated_at ? new Date((row as any).updated_at).getTime() : Date.now();
              await storageService.addWatchProgressTombstone(id, type, episodeId || undefined, remoteUpdated);
            } catch {}
          } else {
            await storageService.setWatchProgress(
              id,
              type,
              {
                currentTime: row.current_time_seconds || 0,
                duration: row.duration_seconds || 0,
                lastUpdated: row.last_updated_ms || Date.now(),
                traktSynced: row.trakt_synced ?? undefined,
                traktLastSynced: row.trakt_last_synced_ms ?? undefined,
                traktProgress: row.trakt_progress_percent ?? undefined,
              },
              // Ensure we pass through the full remote episode_id as-is; empty string becomes undefined
              (row.episode_id && row.episode_id.length > 0) ? row.episode_id : undefined
            );
          }
        } catch {}
        finally {
          this.suppressPush = false;
        }
      });
    } else {
      logger.log('[Sync] Trakt active → skipping watch_progress realtime subscription');
    }

    const debouncedPull = (payload?: any) => {
      if (payload?.table) logger.log(`[Sync][rt] change on ${payload.table} → debounced fullPull`);
      if (this.pullDebounceTimer) clearTimeout(this.pullDebounceTimer);
      this.pullDebounceTimer = setTimeout(() => {
        logger.log('[Sync] fullPull (debounced) start');
        this.fullPull()
          .then(() => logger.log('[Sync] fullPull (debounced) done'))
          .catch((e) => { if (__DEV__) console.warn('[Sync] fullPull (debounced) error', e); });
      }, 300);
    };

    // Addons: just re-pull snapshot quickly
    addChannel('installed_addons', () => debouncedPull({ table: 'installed_addons' }));
    // Library realtime: apply row-level changes
    addChannel('user_library', async (payload) => {
      try {
        const row = (payload.new || payload.old);
        if (!row) return;
        const mediaType = (row.media_type as string) === 'movie' ? 'movie' : 'series';
        const mediaId = row.media_id as string;
        this.suppressLibraryPush = true;
        const deletedAt = (row as any).deleted_at;
        if (payload.eventType === 'DELETE' || deletedAt) {
          await catalogService.removeFromLibrary(mediaType, mediaId);
          logger.log(`[Sync][rt] user_library DELETE ${mediaType}:${mediaId}`);
        } else {
          const content: StreamingContent = {
            id: mediaId,
            type: mediaType,
            name: (row.title as string) || mediaId,
            poster: (row.poster_url as string) || '',
            inLibrary: true,
            year: row.year ?? undefined,
          } as any;
          await catalogService.addToLibrary(content);
          logger.log(`[Sync][rt] user_library ${payload.eventType} ${mediaType}:${mediaId}`);
        }
      } catch (e) {
        if (__DEV__) console.warn('[Sync][rt] user_library handler error', e);
      } finally {
        this.suppressLibraryPush = false;
      }
    });
    // Excluded: local_scrapers, scraper_repository from realtime sync
    logger.log('[Sync] Realtime subscriptions active');

    // Fallback polling for addons (in case realtime isn't enabled)
    if (this.addonsPollInterval) clearInterval(this.addonsPollInterval);
    this.addonsPollInterval = setInterval(async () => {
      try {
        const u = await accountService.getCurrentUser();
        if (!u) return;
        // Compare excluding preinstalled
        const exclude = new Set(['com.linvo.cinemeta', 'org.stremio.opensubtitlesv3']);
        const localIds = new Set(
          (await stremioService.getInstalledAddonsAsync())
            .map((a: any) => a.id)
            .filter((id: string) => !exclude.has(id))
        );
        const { data: remote } = await supabase
          .from('installed_addons')
          .select('addon_id')
          .eq('user_id', u.id);
        const remoteIds = new Set(
          ((remote || []) as any[])
            .map(r => r.addon_id as string)
            .filter((id: string) => !exclude.has(id))
        );
        if (localIds.size !== remoteIds.size) {
          logger.log('[Sync][poll] addons mismatch by count → pull snapshot');
          await this.pullAddonsSnapshot(u.id);
          return;
        }
        for (const id of remoteIds) {
          if (!localIds.has(id)) {
            logger.log('[Sync][poll] addons mismatch by set → pull snapshot');
            await this.pullAddonsSnapshot(u.id);
            break;
          }
        }
      } catch (e) {
        // silent
      }
    }, 21600000); // Increased from 4 hours to 6 hours to reduce background CPU
  };

  unsubscribeRealtime = (): void => {
    try {
      logger.log(`[Sync] Realtime unsubscribe (${this.realtimeChannels.length})`);
      for (const ch of this.realtimeChannels) {
        try { ch.unsubscribe?.(); } catch {}
      }
    } finally {
      this.realtimeChannels = [];
      if (this.addonsPollInterval) {
        clearInterval(this.addonsPollInterval);
        this.addonsPollInterval = null;
      }
      if (this.libraryUnsubscribe) {
        try { this.libraryUnsubscribe(); } catch {}
        this.libraryUnsubscribe = null;
      }
    }
  };

  async migrateLocalScopeToUser(): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    const userId = user.id;
    const keys = await AsyncStorage.getAllKeys();
    const migrations: Array<Promise<void>> = [];
    const moveKey = async (from: string, to: string) => {
      const val = await AsyncStorage.getItem(from);
      if (val == null) return;
      const exists = await AsyncStorage.getItem(to);
      if (!exists) {
        await AsyncStorage.setItem(to, val);
      } else {
        // Prefer the one with newer lastUpdated if JSON
        try {
          const a = JSON.parse(val);
          const b = JSON.parse(exists);
          const aLU = a?.lastUpdated ?? 0;
          const bLU = b?.lastUpdated ?? 0;
          if (aLU > bLU) await AsyncStorage.setItem(to, val);
        } catch {
          // Keep existing if equal
        }
      }
      await AsyncStorage.removeItem(from);
    };

    // Watch progress/content durations/subtitles/app settings
    for (const k of keys) {
      if (k.startsWith('@user:local:@watch_progress:')) {
        const suffix = k.replace('@user:local:@watch_progress:', '');
        migrations.push(moveKey(k, `@user:${userId}:@watch_progress:${suffix}`));
      } else if (k.startsWith('@user:local:@content_duration:')) {
        const suffix = k.replace('@user:local:@content_duration:', '');
        migrations.push(moveKey(k, `@user:${userId}:@content_duration:${suffix}`));
      } else if (k === '@user:local:@subtitle_settings') {
        migrations.push(moveKey(k, `@user:${userId}:@subtitle_settings`));
      } else if (k === 'app_settings') {
        migrations.push(moveKey('app_settings', `@user:${userId}:app_settings`));
      } else if (k === '@user:local:app_settings') {
        migrations.push(moveKey(k, `@user:${userId}:app_settings`));
      } else if (k === '@user:local:stremio-addons') {
        migrations.push(moveKey(k, `@user:${userId}:stremio-addons`));
      } else if (k === '@user:local:stremio-addon-order') {
        migrations.push(moveKey(k, `@user:${userId}:stremio-addon-order`));
      // Do NOT migrate local scraper keys; they are device-local and unscoped
      } else if (k === '@user:local:local-scrapers') {
        // intentionally skip
      } else if (k === '@user:local:scraper-repository-url') {
        // intentionally skip
      } else if (k === '@user:local:stremio-library') {
        migrations.push((async () => {
          const val = (await AsyncStorage.getItem(k)) || '{}';
          await moveKey(k, `@user:${userId}:stremio-library`);
          try {
            const parsed = JSON.parse(val) as Record<string, any>;
            const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
            if (count > 0) await AsyncStorage.setItem(`@user:${userId}:library_initialized`, 'true');
          } catch {}
        })());
      } else if (k === 'stremio-library') {
        migrations.push((async () => {
          const val = (await AsyncStorage.getItem(k)) || '{}';
          await moveKey(k, `@user:${userId}:stremio-library`);
          try {
            const parsed = JSON.parse(val) as Record<string, any>;
            const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
            if (count > 0) await AsyncStorage.setItem(`@user:${userId}:library_initialized`, 'true');
          } catch {}
        })());
      }
    }
    // Migrate legacy theme keys into scoped app_settings
    try {
      const legacyThemeId = await AsyncStorage.getItem('current_theme');
      const legacyCustomThemesJson = await AsyncStorage.getItem('custom_themes');
      const scopedSettingsKey = `@user:${userId}:app_settings`;
      let scopedSettings: any = {};
      try { scopedSettings = JSON.parse((await AsyncStorage.getItem(scopedSettingsKey)) || '{}'); } catch {}
      let changed = false;
      if (legacyThemeId && scopedSettings.themeId !== legacyThemeId) {
        scopedSettings.themeId = legacyThemeId;
        changed = true;
      }
      if (legacyCustomThemesJson) {
        const legacyCustomThemes = JSON.parse(legacyCustomThemesJson);
        if (Array.isArray(legacyCustomThemes)) {
          scopedSettings.customThemes = legacyCustomThemes;
          changed = true;
        }
      }
      if (changed) {
        await AsyncStorage.setItem(scopedSettingsKey, JSON.stringify(scopedSettings));
      }
    } catch {}
    await Promise.all(migrations);
    logger.log(`[Sync] migrateLocalScopeToUser done (moved ~${migrations.length} keys)`);
  }

  async fullPush(): Promise<void> {
    logger.log('[Sync] fullPush start');
    await Promise.allSettled([
      this.pushWatchProgress(),
      // Settings push only at app start/sign-in handled by fullPush itself; keep here OK
      this.pushSettings(),
      this.pushAddons(),
      // Excluded: this.pushLocalScrapers(),
      this.pushLibrary(),
    ]);
    logger.log('[Sync] fullPush done');
  }

  async fullPull(): Promise<void> {
    logger.log('[Sync] fullPull start');
    const user = await accountService.getCurrentUser();
    if (!user) return;
    const userId = user.id;
    const traktActive = await traktService.isAuthenticated();

    await Promise.allSettled([
      (!traktActive ? (async () => {
        logger.log('[Sync] pull watch_progress');
        const { data: wp } = await supabase
          .from('watch_progress')
          .select('*')
          .eq('user_id', userId)
          .is('deleted_at', null);
        if (wp && Array.isArray(wp)) {
          const remoteActiveKeys = new Set<string>();
          for (const row of wp as any[]) {
            await storageService.setWatchProgress(
              row.media_id,
              row.media_type,
              {
                currentTime: row.current_time_seconds,
                duration: row.duration_seconds,
                lastUpdated: row.last_updated_ms,
                traktSynced: row.trakt_synced ?? undefined,
                traktLastSynced: row.trakt_last_synced_ms ?? undefined,
                traktProgress: row.trakt_progress_percent ?? undefined,
              },
              // Ensure full episode_id is preserved; treat empty as undefined
              (row.episode_id && row.episode_id.length > 0) ? row.episode_id : undefined
            );
            remoteActiveKeys.add(`${row.media_type}|${row.media_id}|${row.episode_id || ''}`);
          }
          // Remove any local progress not present on server (server is source of truth)
          try {
            const allLocal = await storageService.getAllWatchProgress();
            for (const [key] of Object.entries(allLocal)) {
              const parts = key.split(':');
              const type = parts[0];
              const id = parts[1];
              const ep = parts[2] || '';
              const k = `${type}|${id}|${ep}`;
              if (!remoteActiveKeys.has(k)) {
                this.suppressPush = true;
                await storageService.removeWatchProgress(id, type, ep || undefined);
                this.suppressPush = false;
              }
            }
          } catch {}
        }
      })() : Promise.resolve()),
      (async () => {
        logger.log('[Sync] pull user_settings');
        const { data: us } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single();
        if (us) {
          // Merge remote settings with existing local settings, preferring remote values
          // but preserving any local-only keys (e.g., newly added client-side settings
          // not yet present on the server). This avoids losing local preferences on restart.
          try {
            const localScopedJson = (await AsyncStorage.getItem(`@user:${userId}:app_settings`)) || '{}';
            const localLegacyJson = (await AsyncStorage.getItem('app_settings')) || '{}';
            // Prefer scoped local if available; fall back to legacy
            let localSettings: Record<string, any> = {};
            try { localSettings = JSON.parse(localScopedJson); } catch {}
            if (!localSettings || Object.keys(localSettings).length === 0) {
              try { localSettings = JSON.parse(localLegacyJson); } catch { localSettings = {}; }
            }

            const remoteRaw: Record<string, any> = (us.app_settings || {}) as Record<string, any>;
            // Exclude episodeLayoutStyle from remote to keep it local-only
            const { episodeLayoutStyle: _remoteEpisodeLayoutStyle, ...remoteSettingsSansLocalOnly } = remoteRaw || {};
            // Merge: start from local, override with remote (sans excluded keys)
            const mergedSettings = { ...(localSettings || {}), ...(remoteSettingsSansLocalOnly || {}) };

            await AsyncStorage.setItem(`@user:${userId}:app_settings`, JSON.stringify(mergedSettings));
            await AsyncStorage.setItem('app_settings', JSON.stringify(mergedSettings));

            // Sync continue watching removed items (stored in app_settings)
            if (remoteSettingsSansLocalOnly?.continue_watching_removed) {
              await AsyncStorage.setItem(`@user:${userId}:@continue_watching_removed`, JSON.stringify(remoteSettingsSansLocalOnly.continue_watching_removed));
            }

            await storageService.saveSubtitleSettings(us.subtitle_settings || {});
            // Notify listeners that settings changed due to sync
            try { settingsEmitter.emit(); } catch {}
          } catch (e) {
            // Fallback to writing remote settings as-is if merge fails
            const remoteRaw: Record<string, any> = (us.app_settings || {}) as Record<string, any>;
            const { episodeLayoutStyle: _remoteEpisodeLayoutStyle, ...remoteSettingsSansLocalOnly } = remoteRaw || {};
            await AsyncStorage.setItem(`@user:${userId}:app_settings`, JSON.stringify(remoteSettingsSansLocalOnly));
            await AsyncStorage.setItem('app_settings', JSON.stringify(remoteSettingsSansLocalOnly));

            // Sync continue watching removed items in fallback (stored in app_settings)
            if (remoteSettingsSansLocalOnly?.continue_watching_removed) {
              await AsyncStorage.setItem(`@user:${userId}:@continue_watching_removed`, JSON.stringify(remoteSettingsSansLocalOnly.continue_watching_removed));
            }

            await storageService.saveSubtitleSettings(us.subtitle_settings || {});
            try { settingsEmitter.emit(); } catch {}
          }
        }
      })(),
      this.pullAddonsSnapshot(userId),
      this.pullLibrary(userId),
    ]);
    logger.log('[Sync] fullPull done');
  }

  private async pullLibrary(userId: string): Promise<void> {
    try {
      logger.log('[Sync] pull user_library');
      const { data, error } = await supabase
        .from('user_library')
        .select('media_type, media_id, title, poster_url, year, deleted_at, updated_at')
        .eq('user_id', userId);
      if (error) {
        if (__DEV__) console.warn('[SyncService] pull library error', error);
        return;
      }
      const obj: Record<string, any> = {};
      for (const row of (data || []) as any[]) {
        if (row.deleted_at) continue;
        const key = `${row.media_type}:${row.media_id}`;
        obj[key] = {
          id: row.media_id,
          type: row.media_type,
          name: row.title || row.media_id,
          poster: row.poster_url || '',
          year: row.year || undefined,
          inLibrary: true,
        };
      }
      await AsyncStorage.setItem(`@user:${userId}:stremio-library`, JSON.stringify(obj));
      await AsyncStorage.setItem('stremio-library', JSON.stringify(obj));
      logger.log(`[Sync] pull user_library wrote items=${Object.keys(obj).length}`);
    } catch (e) {
      if (__DEV__) console.warn('[SyncService] pullLibrary exception', e);
    }
  }

  private async pushLibrary(): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    try {
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const json =
        (await AsyncStorage.getItem(`@user:${scope}:stremio-library`)) ||
        (await AsyncStorage.getItem('stremio-library')) || '{}';
      const itemsObj = JSON.parse(json) as Record<string, any>;
      const entries = Object.values(itemsObj) as any[];
      logger.log(`[Sync] push user_library entries=${entries.length}`);
      const initialized = (await AsyncStorage.getItem(`@user:${user.id}:library_initialized`)) === 'true';
      // If not initialized and local entries are 0, attempt to import from server first
      if (!initialized && entries.length === 0) {
        logger.log('[Sync] user_library not initialized and local empty → pulling before deletions');
        await this.pullLibrary(user.id);
        const post = (await AsyncStorage.getItem(`@user:${user.id}:stremio-library`)) || '{}';
        const postObj = JSON.parse(post) as Record<string, any>;
        const postEntries = Object.values(postObj) as any[];
        if (postEntries.length > 0) {
          await AsyncStorage.setItem(`@user:${user.id}:library_initialized`, 'true');
        }
      }
      // Upsert rows
      if (entries.length > 0) {
        const rows = entries.map((it) => ({
          user_id: user.id,
          media_type: it.type === 'movie' ? 'movie' : 'series',
          media_id: it.id,
          title: it.name || it.title || it.id,
          poster_url: it.poster || it.poster_url || null,
          year: normalizeYear(it.year),
          updated_at: new Date().toISOString(),
        }));
        const { error: upErr } = await supabase
          .from('user_library')
          .upsert(rows, { onConflict: 'user_id,media_type,media_id' });
        if (upErr && __DEV__) console.warn('[SyncService] push library upsert error', upErr);
        else await AsyncStorage.setItem(`@user:${user.id}:library_initialized`, 'true');
      }
      // No computed deletions; removals happen only via explicit user action (soft delete)
    } catch (e) {
      if (__DEV__) console.warn('[SyncService] pushLibrary exception', e);
    }
  }

  private async pushLibraryAdd(item: StreamingContent): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    try {
      const row = {
        user_id: user.id,
        media_type: item.type === 'movie' ? 'movie' : 'series',
        media_id: item.id,
        title: (item as any).name || (item as any).title || item.id,
        poster_url: (item as any).poster || null,
        year: normalizeYear((item as any).year),
        deleted_at: null as any,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('user_library').upsert(row, { onConflict: 'user_id,media_type,media_id' });
      if (error && __DEV__) console.warn('[SyncService] pushLibraryAdd error', error);
    } catch (e) {
      if (__DEV__) console.warn('[SyncService] pushLibraryAdd exception', e);
    }
  }

  private async pushLibraryRemove(type: string, id: string): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    try {
      const { error } = await supabase
        .from('user_library')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('media_type', type === 'movie' ? 'movie' : 'series')
        .eq('media_id', id);
      if (error && __DEV__) console.warn('[SyncService] pushLibraryRemove error', error);
    } catch (e) {
      if (__DEV__) console.warn('[SyncService] pushLibraryRemove exception', e);
    }
  }

  private async pullAddonsSnapshot(userId: string): Promise<void> {
    logger.log('[Sync] pull installed_addons');
    const { data: addons, error: addonsErr } = await supabase
      .from('installed_addons')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });
    if (addonsErr) {
      if (__DEV__) console.warn('[SyncService] pull addons error', addonsErr);
      return;
    }
    if (!(addons && Array.isArray(addons))) return;

    // Start from currently installed (to preserve pre-installed like Cinemeta/OpenSubtitles)
    const map = new Map<string, any>();

    for (const a of addons as any[]) {
      try {
        let manifest = a.manifest_data;
        if (!manifest) {
          const urlToUse = a.original_url || a.url;
          if (urlToUse) {
            manifest = await stremioService.getManifest(urlToUse);
          }
        }
        if (!manifest) {
          manifest = {
            id: a.addon_id,
            name: a.name || a.addon_id,
            version: a.version || '1.0.0',
            description: a.description || '',
            url: a.url || a.original_url || '',
            originalUrl: a.original_url || a.url || '',
            catalogs: [],
            resources: [],
            types: [],
          };
        }
        manifest.id = a.addon_id;
        map.set(a.addon_id, manifest);
      } catch (e) {
        if (__DEV__) console.warn('[SyncService] failed to fetch manifest for', a.addon_id, e);
      }
    }

    // Always include preinstalled regardless of server
    try { map.set('com.linvo.cinemeta', await stremioService.getManifest('https://v3-cinemeta.strem.io/manifest.json')); } catch {}
    try { map.set('org.stremio.opensubtitlesv3', await stremioService.getManifest('https://opensubtitles-v3.strem.io/manifest.json')); } catch {}

    (stremioService as any).installedAddons = map;
    let order = (addons as any[]).map(a => a.addon_id);
    const ensureFront = (arr: string[], id: string) => {
      const idx = arr.indexOf(id);
      if (idx === -1) arr.unshift(id);
      else if (idx > 0) { arr.splice(idx, 1); arr.unshift(id); }
    };
    ensureFront(order, 'com.linvo.cinemeta');
    ensureFront(order, 'org.stremio.opensubtitlesv3');
    // Prefer local order if it exists; otherwise use remote
    try {
      const userScope = `@user:${userId}:stremio-addon-order`;
      const [localScopedOrder, localLegacyOrder, localGuestOrder] = await Promise.all([
        AsyncStorage.getItem(userScope),
        AsyncStorage.getItem('stremio-addon-order'),
        AsyncStorage.getItem('@user:local:stremio-addon-order'),
      ]);
      const localOrderRaw = localScopedOrder || localLegacyOrder || localGuestOrder;
      if (localOrderRaw) {
        const localOrder = JSON.parse(localOrderRaw) as string[];
        // Filter to only installed ids
        const localFiltered = localOrder.filter(id => map.has(id));
        if (localFiltered.length > 0) {
          order = localFiltered;
        }
      }
    } catch {}

    (stremioService as any).addonOrder = order;
    await (stremioService as any).saveInstalledAddons();
    await (stremioService as any).saveAddonOrder();
    // Push merged order to server to preserve across devices
    try {
      const rows = order.map((addonId: string, idx: number) => ({
        user_id: userId,
        addon_id: addonId,
        position: idx,
      }));
      const { error } = await supabase
        .from('installed_addons')
        .upsert(rows, { onConflict: 'user_id,addon_id' });
      if (error) logger.warn('[SyncService] push merged addon order error', error);
    } catch (e) {
      logger.warn('[SyncService] push merged addon order exception', e);
    }
  }

  async pushWatchProgress(): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    // When Trakt is authenticated, disable account push for continue watching
    try {
      if (await traktService.isAuthenticated()) {
        logger.log('[Sync] Trakt active → skipping push watch_progress');
        return;
      }
    } catch {}
    const userId = user.id;
    const unsynced = await storageService.getUnsyncedProgress();
    logger.log(`[Sync] push watch_progress rows=${unsynced.length}`);
    const rows: any[] = unsynced.map(({ id, type, episodeId, progress }) => ({
      user_id: userId,
      media_type: type,
      media_id: id,
      episode_id: episodeId || '',
      current_time_seconds: Math.floor(progress.currentTime || 0),
      duration_seconds: Math.floor(progress.duration || 0),
      last_updated_ms: progress.lastUpdated || Date.now(),
      trakt_synced: progress.traktSynced ?? undefined,
      trakt_last_synced_ms: progress.traktLastSynced ?? undefined,
      trakt_progress_percent: progress.traktProgress ?? undefined,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      // Prevent resurrecting remotely-deleted rows when server has newer update
      try {
        const keys = rows.map(r => ({ media_type: r.media_type, media_id: r.media_id, episode_id: r.episode_id }));
        const { data: remote } = await supabase
          .from('watch_progress')
          .select('media_type,media_id,episode_id,deleted_at,updated_at')
          .eq('user_id', userId)
          .in('media_type', keys.map(k => k.media_type))
          .in('media_id', keys.map(k => k.media_id))
          .in('episode_id', keys.map(k => k.episode_id));
        const shouldSkip = new Set<string>();
        if (remote) {
          for (const r of remote as any[]) {
            const key = `${r.media_type}|${r.media_id}|${r.episode_id || ''}`;
            if (r.deleted_at && r.updated_at) {
              const remoteUpdatedMs = new Date(r.updated_at as string).getTime();
              // Find matching local row
              const local = rows.find(x => x.media_type === r.media_type && x.media_id === r.media_id && x.episode_id === (r.episode_id || ''));
              const localUpdatedMs = local?.last_updated_ms ?? 0;
              if (remoteUpdatedMs >= localUpdatedMs) {
                shouldSkip.add(key);
                // also write a tombstone locally
                try { await storageService.addWatchProgressTombstone(r.media_id, r.media_type, r.episode_id || undefined, remoteUpdatedMs); } catch {}
              }
            }
          }
        }
        if (shouldSkip.size > 0) {
          logger.log(`[Sync] push watch_progress skipping resurrect count=${shouldSkip.size}`);
        }
        // Filter rows to upsert
        const filteredRows = rows.filter(r => !shouldSkip.has(`${r.media_type}|${r.media_id}|${r.episode_id}`));
        if (filteredRows.length > 0) {
          const { error } = await supabase
            .from('watch_progress')
            .upsert(filteredRows, { onConflict: 'user_id,media_type,media_id,episode_id' });
          if (error && __DEV__) console.warn('[SyncService] push watch_progress error', error);
          else logger.log('[Sync] push watch_progress upsert ok');
        }
      } catch (e) {
        // Fallback to normal upsert if pre-check fails
        const { error } = await supabase
          .from('watch_progress')
          .upsert(rows, { onConflict: 'user_id,media_type,media_id,episode_id' });
        if (error && __DEV__) console.warn('[SyncService] push watch_progress error', error);
        else logger.log('[Sync] push watch_progress upsert ok');
      }
    }

    // Deletions occur only on explicit remove; no bulk deletions here
  }

  private async softDeleteWatchProgress(type: string, id: string, episodeId?: string): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    // When Trakt is authenticated, do not propagate deletes to account server for watch progress
    try {
      if (await traktService.isAuthenticated()) {
        logger.log('[Sync] Trakt active → skipping softDelete watch_progress');
        return;
      }
    } catch {}
    try {
      const { error } = await supabase
        .from('watch_progress')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('media_type', type)
        .eq('media_id', id)
        .eq('episode_id', episodeId || '');
      if (error && __DEV__) console.warn('[SyncService] softDeleteWatchProgress error', error);
    } catch (e) {
      if (__DEV__) console.warn('[SyncService] softDeleteWatchProgress exception', e);
    }
  }

  async pushSettings(): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    const userId = user.id;
    logger.log('[Sync] push user_settings start');
    const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
    const appSettingsJson =
      (await AsyncStorage.getItem(`@user:${scope}:app_settings`)) ||
      (await AsyncStorage.getItem('app_settings')) ||
      '{}';
    const parsed = JSON.parse(appSettingsJson) as Record<string, any>;
    // Exclude local-only settings from push
    const { episodeLayoutStyle: _localEpisodeLayoutStyle, ...appSettings } = parsed || {};
    const subtitleSettings = (await storageService.getSubtitleSettings()) || {};
    const continueWatchingRemoved = await storageService.getContinueWatchingRemoved();

    // Include continue watching removed items in app_settings
    const appSettingsWithRemoved = {
      ...appSettings,
      continue_watching_removed: continueWatchingRemoved
    };

    const { error } = await supabase.from('user_settings').upsert({
      user_id: userId,
      app_settings: appSettingsWithRemoved,
      subtitle_settings: subtitleSettings,
    });
    if (error && __DEV__) console.warn('[SyncService] push settings error', error);
    else logger.log('[Sync] push user_settings ok');
  }

  async pushAddons(): Promise<void> {
    const user = await accountService.getCurrentUser();
    if (!user) return;
    const userId = user.id;
    const addons = await stremioService.getInstalledAddonsAsync();
    logger.log(`[Sync] push installed_addons count=${addons.length}`);
    const order = (stremioService as any).addonOrder as string[];
    const rows = addons.map((a: any) => ({
      user_id: userId,
      addon_id: a.id,
      name: a.name,
      url: a.url,
      original_url: a.originalUrl,
      version: a.version,
      description: a.description,
      position: Math.max(0, order.indexOf(a.id)),
      manifest_data: a,
    }));
    // Delete remote addons that no longer exist locally (excluding pre-installed to be safe)
    try {
      const { data: remote, error: rErr } = await supabase
        .from('installed_addons')
        .select('addon_id')
        .eq('user_id', userId);
      if (!rErr && remote) {
        const localIds = new Set(addons.map((a: any) => a.id));
        const toDelete = (remote as any[])
          .map(r => r.addon_id as string)
          .filter(id => !localIds.has(id) && id !== 'com.linvo.cinemeta' && id !== 'org.stremio.opensubtitlesv3');
        logger.log(`[Sync] push installed_addons deletions=${toDelete.length}`);
        if (toDelete.length > 0) {
          const del = await supabase
            .from('installed_addons')
            .delete()
            .eq('user_id', userId)
            .in('addon_id', toDelete);
          if (del.error && __DEV__) console.warn('[SyncService] delete addons error', del.error);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[SyncService] deletion sync for addons failed', e);
    }
    const { error } = await supabase.from('installed_addons').upsert(rows, { onConflict: 'user_id,addon_id' });
    if (error && __DEV__) console.warn('[SyncService] push addons error', error);
  }

  // Excluded: pushLocalScrapers (local scrapers are device-local only)
}

export const syncService = SyncService.getInstance();
export default syncService;

// Small helper to batch delete operations
function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

// Normalize year values to integer or null
function normalizeYear(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    // Extract first 4 consecutive digits
    const m = value.match(/\d{4}/);
    if (m) {
      const y = parseInt(m[0], 10);
      if (y >= 1900 && y <= 2100) return y;
      return y;
    }
  }
  return null;
}

