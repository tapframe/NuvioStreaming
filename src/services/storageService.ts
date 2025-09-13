import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

interface WatchProgress {
  currentTime: number;
  duration: number;
  lastUpdated: number;
  traktSynced?: boolean;
  traktLastSynced?: number;
  traktProgress?: number;
}

class StorageService {
  private static instance: StorageService;
  private readonly WATCH_PROGRESS_KEY = '@watch_progress:';
  private readonly CONTENT_DURATION_KEY = '@content_duration:';
  private readonly SUBTITLE_SETTINGS_KEY = '@subtitle_settings';
  private readonly WP_TOMBSTONES_KEY = '@wp_tombstones';
  private readonly CONTINUE_WATCHING_REMOVED_KEY = '@continue_watching_removed';
  private watchProgressSubscribers: (() => void)[] = [];
  private watchProgressRemoveListeners: ((id: string, type: string, episodeId?: string) => void)[] = [];
  private notificationDebounceTimer: NodeJS.Timeout | null = null;
  private lastNotificationTime: number = 0;
  private readonly NOTIFICATION_DEBOUNCE_MS = 1000; // 1 second debounce
  private readonly MIN_NOTIFICATION_INTERVAL = 500; // Minimum 500ms between notifications

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async getUserScope(): Promise<string> {
    try {
      const scope = await AsyncStorage.getItem('@user:current');
      return scope || 'local';
    } catch {
      return 'local';
    }
  }

  private async getWatchProgressKeyScoped(id: string, type: string, episodeId?: string): Promise<string> {
    const scope = await this.getUserScope();
    return `@user:${scope}:${this.WATCH_PROGRESS_KEY}${type}:${id}${episodeId ? `:${episodeId}` : ''}`;
  }

  private async getContentDurationKeyScoped(id: string, type: string, episodeId?: string): Promise<string> {
    const scope = await this.getUserScope();
    return `@user:${scope}:${this.CONTENT_DURATION_KEY}${type}:${id}${episodeId ? `:${episodeId}` : ''}`;
  }

  private async getSubtitleSettingsKeyScoped(): Promise<string> {
    const scope = await this.getUserScope();
    return `@user:${scope}:${this.SUBTITLE_SETTINGS_KEY}`;
  }

  private async getTombstonesKeyScoped(): Promise<string> {
    const scope = await this.getUserScope();
    return `@user:${scope}:${this.WP_TOMBSTONES_KEY}`;
  }

  private async getContinueWatchingRemovedKeyScoped(): Promise<string> {
    const scope = await this.getUserScope();
    return `@user:${scope}:${this.CONTINUE_WATCHING_REMOVED_KEY}`;
  }

  private buildWpKeyString(id: string, type: string, episodeId?: string): string {
    return `${type}:${id}${episodeId ? `:${episodeId}` : ''}`;
  }

  public async addWatchProgressTombstone(
    id: string,
    type: string,
    episodeId?: string,
    deletedAtMs?: number
  ): Promise<void> {
    try {
      const key = await this.getTombstonesKeyScoped();
      const json = (await AsyncStorage.getItem(key)) || '{}';
      const map = JSON.parse(json) as Record<string, number>;
      map[this.buildWpKeyString(id, type, episodeId)] = deletedAtMs || Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(map));
    } catch {}
  }

  public async clearWatchProgressTombstone(
    id: string,
    type: string,
    episodeId?: string
  ): Promise<void> {
    try {
      const key = await this.getTombstonesKeyScoped();
      const json = (await AsyncStorage.getItem(key)) || '{}';
      const map = JSON.parse(json) as Record<string, number>;
      const k = this.buildWpKeyString(id, type, episodeId);
      if (map[k] != null) {
        delete map[k];
        await AsyncStorage.setItem(key, JSON.stringify(map));
      }
    } catch {}
  }

  public async getWatchProgressTombstones(): Promise<Record<string, number>> {
    try {
      const key = await this.getTombstonesKeyScoped();
      const json = (await AsyncStorage.getItem(key)) || '{}';
      return JSON.parse(json) as Record<string, number>;
    } catch {
      return {};
    }
  }

  public async addContinueWatchingRemoved(
    id: string,
    type: string,
    removedAtMs?: number
  ): Promise<void> {
    try {
      const key = await this.getContinueWatchingRemovedKeyScoped();
      const json = (await AsyncStorage.getItem(key)) || '{}';
      const map = JSON.parse(json) as Record<string, number>;
      map[this.buildWpKeyString(id, type)] = removedAtMs || Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(map));
    } catch (error) {
      logger.error('Error adding continue watching removed item:', error);
    }
  }

  public async removeContinueWatchingRemoved(
    id: string,
    type: string
  ): Promise<void> {
    try {
      const key = await this.getContinueWatchingRemovedKeyScoped();
      const json = (await AsyncStorage.getItem(key)) || '{}';
      const map = JSON.parse(json) as Record<string, number>;
      const k = this.buildWpKeyString(id, type);
      if (map[k] != null) {
        delete map[k];
        await AsyncStorage.setItem(key, JSON.stringify(map));
      }
    } catch (error) {
      logger.error('Error removing continue watching removed item:', error);
    }
  }

  public async getContinueWatchingRemoved(): Promise<Record<string, number>> {
    try {
      const key = await this.getContinueWatchingRemovedKeyScoped();
      const json = (await AsyncStorage.getItem(key)) || '{}';
      return JSON.parse(json) as Record<string, number>;
    } catch (error) {
      logger.error('Error getting continue watching removed items:', error);
      return {};
    }
  }

  public async isContinueWatchingRemoved(id: string, type: string): Promise<boolean> {
    try {
      const removedItems = await this.getContinueWatchingRemoved();
      const key = this.buildWpKeyString(id, type);
      return removedItems[key] != null;
    } catch {
      return false;
    }
  }

  public async setContentDuration(
    id: string,
    type: string,
    duration: number,
    episodeId?: string
  ): Promise<void> {
    try {
      const key = await this.getContentDurationKeyScoped(id, type, episodeId);
      await AsyncStorage.setItem(key, duration.toString());
    } catch (error) {
      logger.error('Error setting content duration:', error);
    }
  }

  public async getContentDuration(
    id: string,
    type: string,
    episodeId?: string
  ): Promise<number | null> {
    try {
      const key = await this.getContentDurationKeyScoped(id, type, episodeId);
      const data = await AsyncStorage.getItem(key);
      return data ? parseFloat(data) : null;
    } catch (error) {
      logger.error('Error getting content duration:', error);
      return null;
    }
  }

  public async updateProgressDuration(
    id: string,
    type: string,
    newDuration: number,
    episodeId?: string
  ): Promise<void> {
    try {
      const existingProgress = await this.getWatchProgress(id, type, episodeId);
      if (existingProgress && Math.abs(existingProgress.duration - newDuration) > 60) {
        // Calculate the new current time to maintain the same percentage
        const progressPercent = (existingProgress.currentTime / existingProgress.duration) * 100;
        const updatedProgress: WatchProgress = {
          ...existingProgress,
          currentTime: (progressPercent / 100) * newDuration,
          duration: newDuration,
          lastUpdated: Date.now()
        };
        await this.setWatchProgress(id, type, updatedProgress, episodeId);
        logger.log(`[StorageService] Updated progress duration from ${(existingProgress.duration/60).toFixed(0)}min to ${(newDuration/60).toFixed(0)}min`);
      }
    } catch (error) {
      logger.error('Error updating progress duration:', error);
    }
  }

  public async setWatchProgress(
    id: string, 
    type: string, 
    progress: WatchProgress,
    episodeId?: string
  ): Promise<void> {
    try {
      const key = await this.getWatchProgressKeyScoped(id, type, episodeId);
      // Do not resurrect if tombstone exists and is newer than this progress
      try {
        const tombstones = await this.getWatchProgressTombstones();
        const exactKey = this.buildWpKeyString(id, type, episodeId);
        const baseKey = this.buildWpKeyString(id, type, undefined);
        const exactTombAt = tombstones[exactKey];
        const baseTombAt = tombstones[baseKey];
        const newestTombAt = Math.max(exactTombAt || 0, baseTombAt || 0);
        if (newestTombAt && (progress.lastUpdated == null || progress.lastUpdated <= newestTombAt)) {
          return;
        }
      } catch {}
      
      // Check if progress has actually changed significantly
      const existingProgress = await this.getWatchProgress(id, type, episodeId);
      if (existingProgress) {
        const timeDiff = Math.abs(progress.currentTime - existingProgress.currentTime);
        const durationDiff = Math.abs(progress.duration - existingProgress.duration);
        
        // Only update if there's a significant change (>5 seconds or duration change)
        if (timeDiff < 5 && durationDiff < 1) {
          return; // Skip update for minor changes
        }
      }
      
       const updated = { ...progress, lastUpdated: Date.now() };
       await AsyncStorage.setItem(key, JSON.stringify(updated));
      
      // Use debounced notification to reduce spam
      this.debouncedNotifySubscribers();
    } catch (error) {
      logger.error('Error setting watch progress:', error);
    }
  }

  private debouncedNotifySubscribers(): void {
    const now = Date.now();
    
    // Clear existing timer
    if (this.notificationDebounceTimer) {
      clearTimeout(this.notificationDebounceTimer);
    }
    
    // If we notified recently, debounce longer
    const timeSinceLastNotification = now - this.lastNotificationTime;
    if (timeSinceLastNotification < this.MIN_NOTIFICATION_INTERVAL) {
      this.notificationDebounceTimer = setTimeout(() => {
        this.notifyWatchProgressSubscribers();
      }, this.NOTIFICATION_DEBOUNCE_MS);
    } else {
      // Notify immediately if enough time has passed
      this.notifyWatchProgressSubscribers();
    }
  }

  private notifyWatchProgressSubscribers(): void {
    this.lastNotificationTime = Date.now();
    this.notificationDebounceTimer = null;
    
    // Only notify if we have subscribers
    if (this.watchProgressSubscribers.length > 0) {
    this.watchProgressSubscribers.forEach(callback => callback());
    }
  }

  public subscribeToWatchProgressUpdates(callback: () => void): () => void {
    this.watchProgressSubscribers.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.watchProgressSubscribers.indexOf(callback);
      if (index > -1) {
        this.watchProgressSubscribers.splice(index, 1);
      }
    };
  }

  public onWatchProgressRemoved(listener: (id: string, type: string, episodeId?: string) => void): () => void {
    this.watchProgressRemoveListeners.push(listener);
    return () => {
      const index = this.watchProgressRemoveListeners.indexOf(listener);
      if (index > -1) this.watchProgressRemoveListeners.splice(index, 1);
    };
  }

  public async getWatchProgress(
    id: string, 
    type: string,
    episodeId?: string
  ): Promise<WatchProgress | null> {
    try {
      const key = await this.getWatchProgressKeyScoped(id, type, episodeId);
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting watch progress:', error);
      return null;
    }
  }

  public async removeWatchProgress(
    id: string, 
    type: string,
    episodeId?: string
  ): Promise<void> {
    try {
      const key = await this.getWatchProgressKeyScoped(id, type, episodeId);
      await AsyncStorage.removeItem(key);
      await this.addWatchProgressTombstone(id, type, episodeId);
      // Notify subscribers
      this.notifyWatchProgressSubscribers();
      // Emit explicit remove event for sync layer
      try { this.watchProgressRemoveListeners.forEach(l => l(id, type, episodeId)); } catch {}
    } catch (error) {
      logger.error('Error removing watch progress:', error);
    }
  }

  public async getAllWatchProgress(): Promise<Record<string, WatchProgress>> {
    try {
      const scope = await this.getUserScope();
      const prefix = `@user:${scope}:${this.WATCH_PROGRESS_KEY}`;
      const keys = await AsyncStorage.getAllKeys();
      const watchProgressKeys = keys.filter(key => key.startsWith(prefix));
      const pairs = await AsyncStorage.multiGet(watchProgressKeys);
      return pairs.reduce((acc, [key, value]) => {
        if (value) {
          acc[key.replace(prefix, '')] = JSON.parse(value);
        }
        return acc;
      }, {} as Record<string, WatchProgress>);
    } catch (error) {
      logger.error('Error getting all watch progress:', error);
      return {};
    }
  }

  /**
   * Update Trakt sync status for a watch progress entry
   */
  public async updateTraktSyncStatus(
    id: string,
    type: string,
    traktSynced: boolean,
    traktProgress?: number,
    episodeId?: string,
    exactTime?: number
  ): Promise<void> {
    try {
        const existingProgress = await this.getWatchProgress(id, type, episodeId);
      if (existingProgress) {
        // Preserve the highest Trakt progress and currentTime values to avoid accidental regressions
        const highestTraktProgress = (() => {
          if (traktProgress === undefined) return existingProgress.traktProgress;
          if (existingProgress.traktProgress === undefined) return traktProgress;
          return Math.max(traktProgress, existingProgress.traktProgress);
        })();

        const highestCurrentTime = (() => {
          if (!exactTime || exactTime <= 0) return existingProgress.currentTime;
          return Math.max(exactTime, existingProgress.currentTime);
        })();

        const updatedProgress: WatchProgress = {
          ...existingProgress,
          traktSynced,
          traktLastSynced: traktSynced ? Date.now() : existingProgress.traktLastSynced,
          traktProgress: highestTraktProgress,
          currentTime: highestCurrentTime,
        };
        await this.setWatchProgress(id, type, updatedProgress, episodeId);
      }
    } catch (error) {
      logger.error('Error updating Trakt sync status:', error);
    }
  }

  /**
   * Get all watch progress entries that need Trakt sync
   */
  public async getUnsyncedProgress(): Promise<Array<{
    key: string;
    id: string;
    type: string;
    episodeId?: string;
    progress: WatchProgress;
  }>> {
    try {
      const allProgress = await this.getAllWatchProgress();
      const tombstones = await this.getWatchProgressTombstones();
      const unsynced: Array<{
        key: string;
        id: string;
        type: string;
        episodeId?: string;
        progress: WatchProgress;
      }> = [];

      for (const [key, progress] of Object.entries(allProgress)) {
        // Skip if tombstoned (either exact entry or base content) and tombstone is newer
        const parts = key.split(':');
        const baseKey = `${parts[0]}:${parts[1]}`;
        const exactTombAt = tombstones[key];
        const baseTombAt = tombstones[baseKey];
        const newestTombAt = Math.max(exactTombAt || 0, baseTombAt || 0);
        if (newestTombAt && (progress.lastUpdated == null || progress.lastUpdated <= newestTombAt)) {
          continue;
        }
        // Check if needs sync (either never synced or local progress is newer)
        const needsSync = !progress.traktSynced || 
          (progress.traktLastSynced && progress.lastUpdated > progress.traktLastSynced);
        
        if (needsSync) {
          const parts = key.split(':');
          const type = parts[0];
          const id = parts[1];
          // Preserve full episodeId even if it contains additional ':' segments (e.g., "<showId>:<season>:<episode>")
          const episodeId = parts.length > 2 ? parts.slice(2).join(':') : undefined;

          unsynced.push({
            key,
            id,
            type,
            episodeId,
            progress
          });
        }
      }

      return unsynced;
    } catch (error) {
      logger.error('Error getting unsynced progress:', error);
      return [];
    }
  }

  /**
   * Remove all watch progress entries for a given content id and type.
   * Optionally add a base tombstone to prevent reappearance.
   */
  public async removeAllWatchProgressForContent(
    id: string,
    type: string,
    options?: { addBaseTombstone?: boolean }
  ): Promise<void> {
    try {
      logger.log(`🗑️ [StorageService] removeAllWatchProgressForContent called for ${type}:${id}`);
      
      const all = await this.getAllWatchProgress();
      const prefix = `${type}:${id}`;
      logger.log(`🔍 [StorageService] Looking for keys with prefix: ${prefix}`);
      
      const matchingKeys = Object.keys(all).filter(key => key === prefix || key.startsWith(`${prefix}:`));
      logger.log(`📊 [StorageService] Found ${matchingKeys.length} matching keys:`, matchingKeys);
      
      const removals: Array<Promise<void>> = [];
      for (const key of matchingKeys) {
        // Compute episodeId if present
        const episodeId = key.length > prefix.length + 1 ? key.slice(prefix.length + 1) : undefined;
        logger.log(`🗑️ [StorageService] Removing progress for key: ${key} (episodeId: ${episodeId})`);
        removals.push(this.removeWatchProgress(id, type, episodeId));
      }
      
      await Promise.allSettled(removals);
      logger.log(`✅ [StorageService] All watch progress removals completed`);
      
      if (options?.addBaseTombstone) {
        logger.log(`🪦 [StorageService] Adding tombstone for ${type}:${id}`);
        await this.addWatchProgressTombstone(id, type);
        logger.log(`✅ [StorageService] Tombstone added successfully`);
      }
      
      logger.log(`✅ [StorageService] removeAllWatchProgressForContent completed for ${type}:${id}`);
    } catch (error) {
      logger.error(`❌ [StorageService] Error removing all watch progress for content ${type}:${id}:`, error);
    }
  }

  /**
   * Merge Trakt progress with local progress using exact time when available
   */
  public async mergeWithTraktProgress(
    id: string,
    type: string,
    traktProgress: number,
    traktPausedAt: string,
    episodeId?: string,
    exactTime?: number // Optional exact time in seconds from Trakt scrobble data
  ): Promise<void> {
    try {
      const localProgress = await this.getWatchProgress(id, type, episodeId);
      const traktTimestamp = new Date(traktPausedAt).getTime();
      
      if (!localProgress) {
        // No local progress - use stored duration or estimate
        let duration = await this.getContentDuration(id, type, episodeId);
        let currentTime: number;
        
        if (exactTime && exactTime > 0) {
          // Use exact time from Trakt if available
          currentTime = exactTime;
          if (!duration) {
            // Calculate duration from exact time and percentage
            duration = (exactTime / traktProgress) * 100;
          }
        } else {
          // Fallback to percentage-based calculation
          if (!duration) {
            // Use reasonable duration estimates as fallback
            if (type === 'movie') {
              duration = 6600; // 110 minutes for movies
            } else if (episodeId) {
              duration = 2700; // 45 minutes for TV episodes
            } else {
              duration = 3600; // 60 minutes default
            }
          }
          currentTime = (traktProgress / 100) * duration;
        }
        
        const newProgress: WatchProgress = {
          currentTime,
          duration,
          lastUpdated: traktTimestamp,
          traktSynced: true,
          traktLastSynced: Date.now(),
          traktProgress
        };
        await this.setWatchProgress(id, type, newProgress, episodeId);
        
        // Progress creation logging removed
      } else {
        // Local progress exists - merge intelligently
        const localProgressPercent = (localProgress.currentTime / localProgress.duration) * 100;
        
        // Only proceed if there's a significant difference (>5% or different completion status)
        const progressDiff = Math.abs(traktProgress - localProgressPercent);
        if (progressDiff < 5 && traktProgress < 100 && localProgressPercent < 100) {
          return; // Skip minor updates
        }
        
        let currentTime: number;
        let duration = localProgress.duration;
        
        if (exactTime && exactTime > 0 && localProgress.duration > 0) {
          // Use exact time from Trakt, keep local duration
          currentTime = exactTime;
          
          // If exact time doesn't match the duration well, recalculate duration
          const calculatedDuration = (exactTime / traktProgress) * 100;
          const durationDiff = Math.abs(calculatedDuration - localProgress.duration);
          if (durationDiff > 300) { // More than 5 minutes difference
            duration = calculatedDuration;
            logger.log(`[StorageService] Updated duration based on exact time: ${(localProgress.duration/60).toFixed(0)}min → ${(duration/60).toFixed(0)}min`);
          }
        } else if (localProgress.duration > 0) {
          // Use percentage calculation with local duration
          currentTime = (traktProgress / 100) * localProgress.duration;
        } else {
                     // No local duration, check stored duration
           const storedDuration = await this.getContentDuration(id, type, episodeId);
           duration = storedDuration || 0;
           
           if (!duration || duration <= 0) {
            if (exactTime && exactTime > 0) {
              duration = (exactTime / traktProgress) * 100;
              currentTime = exactTime;
            } else {
              // Final fallback to estimates
              if (type === 'movie') {
                duration = 6600; // 110 minutes for movies
              } else if (episodeId) {
                duration = 2700; // 45 minutes for TV episodes
              } else {
                duration = 3600; // 60 minutes default
              }
              currentTime = (traktProgress / 100) * duration;
            }
          } else {
                         currentTime = exactTime && exactTime > 0 ? exactTime : (traktProgress / 100) * duration;
          }
        }
        
          const updatedProgress: WatchProgress = {
          ...localProgress,
          currentTime,
          duration,
            lastUpdated: traktTimestamp,
            traktSynced: true,
            traktLastSynced: Date.now(),
            traktProgress
          };
          await this.setWatchProgress(id, type, updatedProgress, episodeId);
        
        // Progress update logging removed
      }
    } catch (error) {
      logger.error('Error merging with Trakt progress:', error);
    }
  }

  public async saveSubtitleSettings(settings: Record<string, any>): Promise<void> {
    try {
      const key = await this.getSubtitleSettingsKeyScoped();
      await AsyncStorage.setItem(key, JSON.stringify(settings));
    } catch (error) {
      logger.error('Error saving subtitle settings:', error);
    }
  }

  public async getSubtitleSettings(): Promise<Record<string, any> | null> {
    try {
      const key = await this.getSubtitleSettingsKeyScoped();
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error loading subtitle settings:', error);
      return null;
    }
  }
}

export const storageService = StorageService.getInstance();