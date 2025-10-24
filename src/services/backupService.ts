import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';
import { AppSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { StreamingContent } from './catalogService';
import { DownloadItem } from '../contexts/DownloadsContext';

export interface BackupData {
  version: string;
  timestamp: number;
  appVersion: string;
  platform: 'ios' | 'android';
  userScope: string;
  data: {
    settings: AppSettings;
    library: StreamingContent[];
    watchProgress: Record<string, any>;
    addons: any[];
    downloads: DownloadItem[];
    subtitles: {
      subtitleSize?: number;
      subtitleBackground?: boolean;
      subtitleTextColor?: string;
      subtitleBgOpacity?: number;
      subtitleTextShadow?: boolean;
      subtitleOutline?: boolean;
      subtitleOutlineColor?: string;
      subtitleOutlineWidth?: number;
      subtitleAlign?: 'center' | 'left' | 'right';
      subtitleBottomOffset?: number;
      subtitleLetterSpacing?: number;
      subtitleLineHeightMultiplier?: number;
      subtitleOffsetSec?: number;
      [key: string]: any; // Allow for additional subtitle preferences
    };
    tombstones: Record<string, number>;
    continueWatchingRemoved: Record<string, number>;
    contentDuration: Record<string, number>;
    syncQueue: any[];
    traktSettings?: any;
    localScrapers?: {
      scrapers: any;
      repositoryUrl?: string;
      repositories: any;
      currentRepository?: string;
      scraperSettings: any;
      scraperCode: Record<string, string>;
    };
    // API Keys
    apiKeys?: {
      mdblistApiKey?: string;
      openRouterApiKey?: string;
    };
    // User preferences
    catalogSettings?: any;
    addonOrder?: string[];
    removedAddons?: string[];
    globalSeasonViewMode?: string;
    // Onboarding/flags
    hasCompletedOnboarding?: boolean;
    showLoginHintToastOnce?: boolean;
  };
  metadata: {
    totalItems: number;
    libraryCount: number;
    watchProgressCount: number;
    downloadsCount: number;
    addonsCount: number;
    scrapersCount?: number;
  };
}

export interface BackupOptions {
  includeLibrary?: boolean;
  includeWatchProgress?: boolean;
  includeDownloads?: boolean;
  includeAddons?: boolean;
  includeSettings?: boolean;
  includeTraktData?: boolean;
  includeLocalScrapers?: boolean;
  includeApiKeys?: boolean;
  includeCatalogSettings?: boolean;
  includeUserPreferences?: boolean;
}

export class BackupService {
  private static instance: BackupService;
  private readonly BACKUP_VERSION = '1.0.0';
  private readonly BACKUP_FILENAME_PREFIX = 'nuvio_backup_';

  private constructor() {}

  public static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  /**
   * Create a comprehensive backup of all user data
   */
  public async createBackup(options: BackupOptions = {}): Promise<string> {
    try {
      logger.info('[BackupService] Starting backup creation...');
      
      const userScope = await this.getUserScope();
      const timestamp = Date.now();
      const filename = `${this.BACKUP_FILENAME_PREFIX}${timestamp}.json`;
      
      // Collect all data
      const backupData: BackupData = {
        version: this.BACKUP_VERSION,
        timestamp,
        appVersion: '1.0.0', // You might want to get this from package.json
        platform: Platform.OS as 'ios' | 'android',
        userScope,
        data: {
          settings: options.includeSettings !== false ? await this.getSettings() : DEFAULT_SETTINGS,
          library: options.includeLibrary !== false ? await this.getLibrary() : [],
          watchProgress: options.includeWatchProgress !== false ? await this.getWatchProgress() : {},
          addons: options.includeAddons !== false ? await this.getAddons() : [],
          downloads: options.includeDownloads !== false ? await this.getDownloads() : [],
          subtitles: await this.getSubtitleSettings(),
          tombstones: await this.getTombstones(),
          continueWatchingRemoved: await this.getContinueWatchingRemoved(),
          contentDuration: await this.getContentDuration(),
          syncQueue: await this.getSyncQueue(),
          traktSettings: options.includeTraktData !== false ? await this.getTraktSettings() : undefined,
          localScrapers: options.includeLocalScrapers !== false ? await this.getLocalScrapers() : undefined,
          apiKeys: options.includeApiKeys !== false ? await this.getApiKeys() : undefined,
          catalogSettings: options.includeCatalogSettings !== false ? await this.getCatalogSettings() : undefined,
          addonOrder: options.includeUserPreferences !== false ? await this.getAddonOrder() : undefined,
          removedAddons: options.includeUserPreferences !== false ? await this.getRemovedAddons() : undefined,
          globalSeasonViewMode: options.includeUserPreferences !== false ? await this.getGlobalSeasonViewMode() : undefined,
          hasCompletedOnboarding: options.includeUserPreferences !== false ? await this.getHasCompletedOnboarding() : undefined,
          showLoginHintToastOnce: options.includeUserPreferences !== false ? await this.getShowLoginHintToastOnce() : undefined,
        },
        metadata: {
          totalItems: 0,
          libraryCount: 0,
          watchProgressCount: 0,
          downloadsCount: 0,
          addonsCount: 0,
        }
      };

      // Calculate metadata
      backupData.metadata.libraryCount = backupData.data.library.length;
      backupData.metadata.watchProgressCount = Object.keys(backupData.data.watchProgress).length;
      backupData.metadata.downloadsCount = backupData.data.downloads.length;
      backupData.metadata.addonsCount = backupData.data.addons.length;

      // Count scraper items if available
      const scraperCount = backupData.data.localScrapers?.scrapers ?
        Object.keys(backupData.data.localScrapers.scrapers).length : 0;
      backupData.metadata.scrapersCount = scraperCount;

      backupData.metadata.totalItems =
        backupData.metadata.libraryCount +
        backupData.metadata.watchProgressCount +
        backupData.metadata.downloadsCount +
        backupData.metadata.addonsCount +
        scraperCount;

      // Save to file
      const fileUri = `${(FileSystem as any).documentDirectory || '/tmp/'}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backupData, null, 2));

      logger.info(`[BackupService] Backup created successfully: ${filename}`);
      logger.info(`[BackupService] Backup contains: ${backupData.metadata.totalItems} items`);
      
      return fileUri;
    } catch (error) {
      logger.error('[BackupService] Failed to create backup:', error);
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get backup preview information without creating the backup
   */
  public async getBackupPreview(): Promise<{
    library: number;
    watchProgress: number;
    addons: number;
    downloads: number;
    scrapers: number;
    total: number;
  }> {
    try {
      const [
        libraryData,
        watchProgressData,
        addonsData,
        downloadsData,
        scrapersData
      ] = await Promise.all([
        this.getLibrary(),
        this.getWatchProgress(),
        this.getAddons(),
        this.getDownloads(),
        this.getLocalScrapers()
      ]);

      const libraryCount = Array.isArray(libraryData) ? libraryData.length : 0;
      const watchProgressCount = Object.keys(watchProgressData).length;
      const addonsCount = Array.isArray(addonsData) ? addonsData.length : 0;
      const downloadsCount = Array.isArray(downloadsData) ? downloadsData.length : 0;
      const scrapersCount = scrapersData.scrapers ? Object.keys(scrapersData.scrapers).length : 0;

      return {
        library: libraryCount,
        watchProgress: watchProgressCount,
        addons: addonsCount,
        downloads: downloadsCount,
        scrapers: scrapersCount,
        total: libraryCount + watchProgressCount + addonsCount + downloadsCount + scrapersCount
      };
    } catch (error) {
      logger.error('[BackupService] Failed to get backup preview:', error);
      return { library: 0, watchProgress: 0, addons: 0, downloads: 0, scrapers: 0, total: 0 };
    }
  }

  /**
   * Restore data from a backup file
   */
  public async restoreBackup(fileUri: string, options: BackupOptions = {}): Promise<void> {
    try {
      logger.info('[BackupService] Starting backup restore...');
      
      // Read and validate backup file
      const backupContent = await FileSystem.readAsStringAsync(fileUri);
      const backupData: BackupData = JSON.parse(backupContent);
      
      // Validate backup format
      this.validateBackupData(backupData);
      
      logger.info(`[BackupService] Restoring backup from ${backupData.timestamp}`);
      logger.info(`[BackupService] Backup contains: ${backupData.metadata.totalItems} items`);

      // Restore data based on options
      if (options.includeSettings !== false && backupData.data.settings) {
        await this.restoreSettings(backupData.data.settings);
      }
      
      if (options.includeLibrary !== false && backupData.data.library) {
        await this.restoreLibrary(backupData.data.library);
      }
      
      if (options.includeWatchProgress !== false && backupData.data.watchProgress) {
        await this.restoreWatchProgress(backupData.data.watchProgress);
      }
      
      if (options.includeAddons !== false && backupData.data.addons) {
        await this.restoreAddons(backupData.data.addons);
      }
      
      if (options.includeDownloads !== false && backupData.data.downloads) {
        await this.restoreDownloads(backupData.data.downloads);
      }
      
      if (options.includeTraktData !== false && backupData.data.traktSettings) {
        await this.restoreTraktSettings(backupData.data.traktSettings);
      }
      
      if (options.includeLocalScrapers !== false && backupData.data.localScrapers) {
        await this.restoreLocalScrapers(backupData.data.localScrapers);
      }

      if (options.includeApiKeys !== false && backupData.data.apiKeys) {
        await this.restoreApiKeys(backupData.data.apiKeys);
      }

      if (options.includeCatalogSettings !== false && backupData.data.catalogSettings) {
        await this.restoreCatalogSettings(backupData.data.catalogSettings);
      }

      if (options.includeUserPreferences !== false) {
        if (backupData.data.addonOrder) {
          await this.restoreAddonOrder(backupData.data.addonOrder);
        }
        if (backupData.data.removedAddons) {
          await this.restoreRemovedAddons(backupData.data.removedAddons);
        }
        if (backupData.data.globalSeasonViewMode) {
          await this.restoreGlobalSeasonViewMode(backupData.data.globalSeasonViewMode);
        }
        if (backupData.data.hasCompletedOnboarding !== undefined) {
          await this.restoreHasCompletedOnboarding(backupData.data.hasCompletedOnboarding);
        }
        if (backupData.data.showLoginHintToastOnce !== undefined) {
          await this.restoreShowLoginHintToastOnce(backupData.data.showLoginHintToastOnce);
        }
      }

      // Restore additional data
      if (backupData.data.subtitles) {
        await this.restoreSubtitleSettings(backupData.data.subtitles);
      }
      if (backupData.data.tombstones) {
        await this.restoreTombstones(backupData.data.tombstones);
      }
      if (backupData.data.continueWatchingRemoved) {
        await this.restoreContinueWatchingRemoved(backupData.data.continueWatchingRemoved);
      }
      if (backupData.data.contentDuration) {
        await this.restoreContentDuration(backupData.data.contentDuration);
      }
      if (backupData.data.syncQueue) {
        await this.restoreSyncQueue(backupData.data.syncQueue);
      }

      logger.info('[BackupService] Backup restore completed successfully');
    } catch (error) {
      logger.error('[BackupService] Failed to restore backup:', error);
      throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get backup file info without loading full data
   */
  public async getBackupInfo(fileUri: string): Promise<Partial<BackupData>> {
    try {
      const backupContent = await FileSystem.readAsStringAsync(fileUri);
      const backupData: BackupData = JSON.parse(backupContent);
      
      return {
        version: backupData.version,
        timestamp: backupData.timestamp,
        appVersion: backupData.appVersion,
        platform: backupData.platform,
        userScope: backupData.userScope,
        metadata: backupData.metadata
      };
    } catch (error) {
      logger.error('[BackupService] Failed to read backup info:', error);
      throw new Error(`Invalid backup file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all backup files in the document directory
   */
  public async listBackups(): Promise<string[]> {
    try {
      const files = await FileSystem.readDirectoryAsync((FileSystem as any).documentDirectory || '/tmp/');
      return files
        .filter(file => file.startsWith(this.BACKUP_FILENAME_PREFIX) && file.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a)); // Sort by filename (newest first)
    } catch (error) {
      logger.error('[BackupService] Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Delete a backup file
   */
  public async deleteBackup(fileUri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(fileUri);
      logger.info('[BackupService] Backup file deleted:', fileUri);
    } catch (error) {
      logger.error('[BackupService] Failed to delete backup:', error);
      throw new Error(`Failed to delete backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods for data collection
  private async getUserScope(): Promise<string> {
    try {
      const scope = await AsyncStorage.getItem('@user:current');
      return scope || 'local';
    } catch {
      return 'local';
    }
  }

  private async getSettings(): Promise<AppSettings> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:app_settings`;
      const settingsJson = await AsyncStorage.getItem(scopedKey);
      return settingsJson ? JSON.parse(settingsJson) : DEFAULT_SETTINGS;
    } catch (error) {
      logger.error('[BackupService] Failed to get settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  private async getLibrary(): Promise<StreamingContent[]> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:stremio-library`;
      const libraryJson = await AsyncStorage.getItem(scopedKey);
      if (libraryJson) {
        const parsed = JSON.parse(libraryJson);
        return Array.isArray(parsed) ? parsed : Object.values(parsed);
      }
      return [];
    } catch (error) {
      logger.error('[BackupService] Failed to get library:', error);
      return [];
    }
  }

  private async getWatchProgress(): Promise<Record<string, any>> {
    try {
      const scope = await this.getUserScope();
      const allKeys = await AsyncStorage.getAllKeys();
      const watchProgressKeys = allKeys.filter(key => 
        key.startsWith(`@user:${scope}:@watch_progress:`)
      );
      
      const watchProgress: Record<string, any> = {};
      if (watchProgressKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(watchProgressKeys);
        for (const [key, value] of pairs) {
          if (value) {
            watchProgress[key] = JSON.parse(value);
          }
        }
      }
      return watchProgress;
    } catch (error) {
      logger.error('[BackupService] Failed to get watch progress:', error);
      return {};
    }
  }

  private async getAddons(): Promise<any[]> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:stremio-addons`;
      const addonsJson = await AsyncStorage.getItem(scopedKey);
      return addonsJson ? JSON.parse(addonsJson) : [];
    } catch (error) {
      logger.error('[BackupService] Failed to get addons:', error);
      return [];
    }
  }

  private async getDownloads(): Promise<DownloadItem[]> {
    try {
      const downloadsJson = await AsyncStorage.getItem('downloads_state_v1');
      return downloadsJson ? JSON.parse(downloadsJson) : [];
    } catch (error) {
      logger.error('[BackupService] Failed to get downloads:', error);
      return [];
    }
  }

  private async getSubtitleSettings(): Promise<any> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:@subtitle_settings`;
      const subtitlesJson = await AsyncStorage.getItem(scopedKey);
      let subtitleSettings = subtitlesJson ? JSON.parse(subtitlesJson) : {};
      
      // Also check for legacy subtitle size preference
      const legacySubtitleSize = await AsyncStorage.getItem('@subtitle_size_preference');
      if (legacySubtitleSize && !subtitleSettings.subtitleSize) {
        const legacySize = parseInt(legacySubtitleSize, 10);
        if (!Number.isNaN(legacySize) && legacySize > 0) {
          subtitleSettings.subtitleSize = legacySize;
        }
      }
      
      return subtitleSettings;
    } catch (error) {
      logger.error('[BackupService] Failed to get subtitle settings:', error);
      return {};
    }
  }

  private async getTombstones(): Promise<Record<string, number>> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:@wp_tombstones`;
      const tombstonesJson = await AsyncStorage.getItem(scopedKey);
      return tombstonesJson ? JSON.parse(tombstonesJson) : {};
    } catch (error) {
      logger.error('[BackupService] Failed to get tombstones:', error);
      return {};
    }
  }

  private async getContinueWatchingRemoved(): Promise<Record<string, number>> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:@continue_watching_removed`;
      const removedJson = await AsyncStorage.getItem(scopedKey);
      return removedJson ? JSON.parse(removedJson) : {};
    } catch (error) {
      logger.error('[BackupService] Failed to get continue watching removed:', error);
      return {};
    }
  }

  private async getContentDuration(): Promise<Record<string, number>> {
    try {
      const scope = await this.getUserScope();
      const allKeys = await AsyncStorage.getAllKeys();
      const durationKeys = allKeys.filter(key => 
        key.startsWith(`@user:${scope}:@content_duration:`)
      );
      
      const contentDuration: Record<string, number> = {};
      if (durationKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(durationKeys);
        for (const [key, value] of pairs) {
          if (value) {
            contentDuration[key] = JSON.parse(value);
          }
        }
      }
      return contentDuration;
    } catch (error) {
      logger.error('[BackupService] Failed to get content duration:', error);
      return {};
    }
  }

  private async getSyncQueue(): Promise<any[]> {
    try {
      const syncQueueJson = await AsyncStorage.getItem('@sync_queue');
      return syncQueueJson ? JSON.parse(syncQueueJson) : [];
    } catch (error) {
      logger.error('[BackupService] Failed to get sync queue:', error);
      return [];
    }
  }

  private async getTraktSettings(): Promise<any> {
    try {
      // Get general Trakt settings
      const traktSettingsJson = await AsyncStorage.getItem('trakt_settings');
      const traktSettings = traktSettingsJson ? JSON.parse(traktSettingsJson) : {};
      
      // Get authentication tokens
      const [
        accessToken,
        refreshToken,
        tokenExpiry,
        autosyncEnabled,
        syncFrequency,
        completionThreshold
      ] = await Promise.all([
        AsyncStorage.getItem('trakt_access_token'),
        AsyncStorage.getItem('trakt_refresh_token'),
        AsyncStorage.getItem('trakt_token_expiry'),
        AsyncStorage.getItem('trakt_autosync_enabled'),
        AsyncStorage.getItem('trakt_sync_frequency'),
        AsyncStorage.getItem('trakt_completion_threshold')
      ]);
      
      return {
        ...traktSettings,
        authentication: {
          accessToken,
          refreshToken,
          tokenExpiry: tokenExpiry ? parseInt(tokenExpiry, 10) : null
        },
        autosync: {
          enabled: autosyncEnabled ? (() => {
            try { return JSON.parse(autosyncEnabled); } 
            catch { return true; }
          })() : true,
          frequency: syncFrequency ? parseInt(syncFrequency, 10) : 60000,
          completionThreshold: completionThreshold ? parseInt(completionThreshold, 10) : 95
        }
      };
    } catch (error) {
      logger.error('[BackupService] Failed to get Trakt settings:', error);
      return {};
    }
  }

  private async getLocalScrapers(): Promise<any> {
    try {
      // Get main scraper configurations
      const localScrapersJson = await AsyncStorage.getItem('local-scrapers');

      // Get repository settings
      const repoUrl = await AsyncStorage.getItem('scraper-repository-url');
      const repositories = await AsyncStorage.getItem('scraper-repositories');
      const currentRepo = await AsyncStorage.getItem('current-repository-id');
      const scraperSettings = await AsyncStorage.getItem('scraper-settings');

      // Get all scraper code cache keys
      const allKeys = await AsyncStorage.getAllKeys();
      const scraperCodeKeys = allKeys.filter(key => key.startsWith('scraper-code-'));
      const scraperCode: Record<string, string> = {};

      if (scraperCodeKeys.length > 0) {
        const codePairs = await AsyncStorage.multiGet(scraperCodeKeys);
        for (const [key, value] of codePairs) {
          if (value) {
            scraperCode[key] = value;
          }
        }
      }

      return {
        scrapers: localScrapersJson ? JSON.parse(localScrapersJson) : {},
        repositoryUrl: repoUrl,
        repositories: repositories ? JSON.parse(repositories) : {},
        currentRepository: currentRepo,
        scraperSettings: scraperSettings ? JSON.parse(scraperSettings) : {},
        scraperCode: scraperCode
      };
    } catch (error) {
      logger.error('[BackupService] Failed to get local scrapers:', error);
      return {};
    }
  }

  private async getApiKeys(): Promise<{ mdblistApiKey?: string; openRouterApiKey?: string }> {
    try {
      const [mdblistKey, openRouterKey] = await Promise.all([
        AsyncStorage.getItem('mdblist_api_key'),
        AsyncStorage.getItem('openrouter_api_key')
      ]);
      
      return {
        mdblistApiKey: mdblistKey || undefined,
        openRouterApiKey: openRouterKey || undefined
      };
    } catch (error) {
      logger.error('[BackupService] Failed to get API keys:', error);
      return {};
    }
  }

  private async getCatalogSettings(): Promise<any> {
    try {
      const catalogSettingsJson = await AsyncStorage.getItem('catalog_settings');
      return catalogSettingsJson ? JSON.parse(catalogSettingsJson) : null;
    } catch (error) {
      logger.error('[BackupService] Failed to get catalog settings:', error);
      return null;
    }
  }

  private async getAddonOrder(): Promise<string[]> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:stremio-addon-order`;
      
      // Try scoped key first, then legacy keys
      const [scopedOrder, legacyOrder, localOrder] = await Promise.all([
        AsyncStorage.getItem(scopedKey),
        AsyncStorage.getItem('stremio-addon-order'),
        AsyncStorage.getItem('@user:local:stremio-addon-order')
      ]);
      
      const orderJson = scopedOrder || legacyOrder || localOrder;
      return orderJson ? JSON.parse(orderJson) : [];
    } catch (error) {
      logger.error('[BackupService] Failed to get addon order:', error);
      return [];
    }
  }

  private async getRemovedAddons(): Promise<string[]> {
    try {
      const removedAddonsJson = await AsyncStorage.getItem('user_removed_addons');
      return removedAddonsJson ? JSON.parse(removedAddonsJson) : [];
    } catch (error) {
      logger.error('[BackupService] Failed to get removed addons:', error);
      return [];
    }
  }

  private async getGlobalSeasonViewMode(): Promise<string | undefined> {
    try {
      const mode = await AsyncStorage.getItem('global_season_view_mode');
      return mode || undefined;
    } catch (error) {
      logger.error('[BackupService] Failed to get global season view mode:', error);
      return undefined;
    }
  }

  private async getHasCompletedOnboarding(): Promise<boolean | undefined> {
    try {
      const value = await AsyncStorage.getItem('hasCompletedOnboarding');
      return value === 'true' ? true : value === 'false' ? false : undefined;
    } catch (error) {
      logger.error('[BackupService] Failed to get has completed onboarding:', error);
      return undefined;
    }
  }

  private async getShowLoginHintToastOnce(): Promise<boolean | undefined> {
    try {
      const value = await AsyncStorage.getItem('showLoginHintToastOnce');
      return value === 'true' ? true : value === 'false' ? false : undefined;
    } catch (error) {
      logger.error('[BackupService] Failed to get show login hint toast once:', error);
      return undefined;
    }
  }

  // Private helper methods for data restoration
  private async restoreSettings(settings: AppSettings): Promise<void> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:app_settings`;
      await AsyncStorage.setItem(scopedKey, JSON.stringify(settings));
      logger.info('[BackupService] Settings restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore settings:', error);
    }
  }

  private async restoreLibrary(library: StreamingContent[]): Promise<void> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:stremio-library`;
      await AsyncStorage.setItem(scopedKey, JSON.stringify(library));
      logger.info('[BackupService] Library restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore library:', error);
    }
  }

  private async restoreWatchProgress(watchProgress: Record<string, any>): Promise<void> {
    try {
      const pairs: [string, string][] = Object.entries(watchProgress).map(([key, value]) => [key, JSON.stringify(value)]);
      await AsyncStorage.multiSet(pairs);
      logger.info('[BackupService] Watch progress restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore watch progress:', error);
    }
  }

  private async restoreAddons(addons: any[]): Promise<void> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:stremio-addons`;
      await AsyncStorage.setItem(scopedKey, JSON.stringify(addons));
      logger.info('[BackupService] Addons restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore addons:', error);
    }
  }

  private async restoreDownloads(downloads: DownloadItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem('downloads_state_v1', JSON.stringify(downloads));
      logger.info('[BackupService] Downloads restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore downloads:', error);
    }
  }

  private async restoreSubtitleSettings(subtitles: any): Promise<void> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:@subtitle_settings`;
      await AsyncStorage.setItem(scopedKey, JSON.stringify(subtitles));
      
      // Also restore legacy subtitle size preference for backward compatibility
      if (subtitles && typeof subtitles.subtitleSize === 'number') {
        await AsyncStorage.setItem('@subtitle_size_preference', subtitles.subtitleSize.toString());
      }
      
      logger.info('[BackupService] Subtitle settings restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore subtitle settings:', error);
    }
  }

  private async restoreTombstones(tombstones: Record<string, number>): Promise<void> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:@wp_tombstones`;
      await AsyncStorage.setItem(scopedKey, JSON.stringify(tombstones));
      logger.info('[BackupService] Tombstones restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore tombstones:', error);
    }
  }

  private async restoreContinueWatchingRemoved(removed: Record<string, number>): Promise<void> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:@continue_watching_removed`;
      await AsyncStorage.setItem(scopedKey, JSON.stringify(removed));
      logger.info('[BackupService] Continue watching removed restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore continue watching removed:', error);
    }
  }

  private async restoreContentDuration(contentDuration: Record<string, number>): Promise<void> {
    try {
      const pairs: [string, string][] = Object.entries(contentDuration).map(([key, value]) => [key, JSON.stringify(value)]);
      await AsyncStorage.multiSet(pairs);
      logger.info('[BackupService] Content duration restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore content duration:', error);
    }
  }

  private async restoreSyncQueue(syncQueue: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem('@sync_queue', JSON.stringify(syncQueue));
      logger.info('[BackupService] Sync queue restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore sync queue:', error);
    }
  }

  private async restoreTraktSettings(traktSettings: any): Promise<void> {
    try {
      // Restore general Trakt settings
      if (traktSettings && typeof traktSettings === 'object') {
        const { authentication, autosync, ...generalSettings } = traktSettings;
        
        // Restore general settings
        await AsyncStorage.setItem('trakt_settings', JSON.stringify(generalSettings));
        
        // Restore authentication tokens if available
        if (authentication) {
          const tokenPromises = [];
          
          if (authentication.accessToken) {
            tokenPromises.push(AsyncStorage.setItem('trakt_access_token', authentication.accessToken));
          }
          
          if (authentication.refreshToken) {
            tokenPromises.push(AsyncStorage.setItem('trakt_refresh_token', authentication.refreshToken));
          }
          
          if (authentication.tokenExpiry) {
            tokenPromises.push(AsyncStorage.setItem('trakt_token_expiry', authentication.tokenExpiry.toString()));
          }
          
          await Promise.all(tokenPromises);
        }
        
        // Restore autosync settings if available
        if (autosync) {
          const autosyncPromises = [];
          
          if (autosync.enabled !== undefined) {
            autosyncPromises.push(AsyncStorage.setItem('trakt_autosync_enabled', JSON.stringify(autosync.enabled)));
          }
          
          if (autosync.frequency !== undefined) {
            autosyncPromises.push(AsyncStorage.setItem('trakt_sync_frequency', autosync.frequency.toString()));
          }
          
          if (autosync.completionThreshold !== undefined) {
            autosyncPromises.push(AsyncStorage.setItem('trakt_completion_threshold', autosync.completionThreshold.toString()));
          }
          
          await Promise.all(autosyncPromises);
        }
        
        logger.info('[BackupService] Trakt settings and authentication restored');
      }
    } catch (error) {
      logger.error('[BackupService] Failed to restore Trakt settings:', error);
    }
  }

  private async restoreLocalScrapers(localScrapers: any): Promise<void> {
    try {
      // Restore main scraper configurations
      if (localScrapers.scrapers) {
        await AsyncStorage.setItem('local-scrapers', JSON.stringify(localScrapers.scrapers));
      }

      // Restore repository settings
      if (localScrapers.repositoryUrl) {
        await AsyncStorage.setItem('scraper-repository-url', localScrapers.repositoryUrl);
      }

      if (localScrapers.repositories) {
        await AsyncStorage.setItem('scraper-repositories', JSON.stringify(localScrapers.repositories));
      }

      if (localScrapers.currentRepository) {
        await AsyncStorage.setItem('current-repository-id', localScrapers.currentRepository);
      }

      if (localScrapers.scraperSettings) {
        await AsyncStorage.setItem('scraper-settings', JSON.stringify(localScrapers.scraperSettings));
      }

      // Restore scraper code cache
      if (localScrapers.scraperCode && typeof localScrapers.scraperCode === 'object') {
        const codePairs: [string, string][] = Object.entries(localScrapers.scraperCode).map(([key, value]) => [key, value as string]);
        if (codePairs.length > 0) {
          await AsyncStorage.multiSet(codePairs);
        }
      }

      logger.info('[BackupService] Local scrapers and plugin settings restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore local scrapers:', error);
    }
  }

  private async restoreApiKeys(apiKeys: { mdblistApiKey?: string; openRouterApiKey?: string }): Promise<void> {
    try {
      const setPromises: Promise<void>[] = [];
      
      if (apiKeys.mdblistApiKey) {
        setPromises.push(AsyncStorage.setItem('mdblist_api_key', apiKeys.mdblistApiKey));
      }
      
      if (apiKeys.openRouterApiKey) {
        setPromises.push(AsyncStorage.setItem('openrouter_api_key', apiKeys.openRouterApiKey));
      }
      
      await Promise.all(setPromises);
      logger.info('[BackupService] API keys restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore API keys:', error);
    }
  }

  private async restoreCatalogSettings(catalogSettings: any): Promise<void> {
    try {
      await AsyncStorage.setItem('catalog_settings', JSON.stringify(catalogSettings));
      logger.info('[BackupService] Catalog settings restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore catalog settings:', error);
    }
  }

  private async restoreAddonOrder(addonOrder: string[]): Promise<void> {
    try {
      const scope = await this.getUserScope();
      const scopedKey = `@user:${scope}:stremio-addon-order`;
      
      // Restore to both scoped and legacy keys for compatibility
      await Promise.all([
        AsyncStorage.setItem(scopedKey, JSON.stringify(addonOrder)),
        AsyncStorage.setItem('stremio-addon-order', JSON.stringify(addonOrder))
      ]);
      
      logger.info('[BackupService] Addon order restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore addon order:', error);
    }
  }

  private async restoreRemovedAddons(removedAddons: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem('user_removed_addons', JSON.stringify(removedAddons));
      logger.info('[BackupService] Removed addons restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore removed addons:', error);
    }
  }

  private async restoreGlobalSeasonViewMode(mode: string): Promise<void> {
    try {
      await AsyncStorage.setItem('global_season_view_mode', mode);
      logger.info('[BackupService] Global season view mode restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore global season view mode:', error);
    }
  }

  private async restoreHasCompletedOnboarding(value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem('hasCompletedOnboarding', value.toString());
      logger.info('[BackupService] Has completed onboarding restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore has completed onboarding:', error);
    }
  }

  private async restoreShowLoginHintToastOnce(value: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem('showLoginHintToastOnce', value.toString());
      logger.info('[BackupService] Show login hint toast once restored');
    } catch (error) {
      logger.error('[BackupService] Failed to restore show login hint toast once:', error);
    }
  }

  private validateBackupData(backupData: any): void {
    if (!backupData.version || !backupData.timestamp || !backupData.data) {
      throw new Error('Invalid backup file format');
    }
    
    if (backupData.version !== this.BACKUP_VERSION) {
      throw new Error(`Unsupported backup version: ${backupData.version}`);
    }
  }
}

export const backupService = BackupService.getInstance();
