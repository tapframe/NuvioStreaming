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
  private watchProgressSubscribers: (() => void)[] = [];

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private getWatchProgressKey(id: string, type: string, episodeId?: string): string {
    return this.WATCH_PROGRESS_KEY + `${type}:${id}${episodeId ? `:${episodeId}` : ''}`;
  }

  public async setWatchProgress(
    id: string, 
    type: string, 
    progress: WatchProgress,
    episodeId?: string
  ): Promise<void> {
    try {
      const key = this.getWatchProgressKey(id, type, episodeId);
      await AsyncStorage.setItem(key, JSON.stringify(progress));
      // Notify subscribers
      this.notifyWatchProgressSubscribers();
    } catch (error) {
      logger.error('Error saving watch progress:', error);
    }
  }

  private notifyWatchProgressSubscribers(): void {
    this.watchProgressSubscribers.forEach(callback => callback());
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

  public async getWatchProgress(
    id: string, 
    type: string,
    episodeId?: string
  ): Promise<WatchProgress | null> {
    try {
      const key = this.getWatchProgressKey(id, type, episodeId);
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
      const key = this.getWatchProgressKey(id, type, episodeId);
      await AsyncStorage.removeItem(key);
      // Notify subscribers
      this.notifyWatchProgressSubscribers();
    } catch (error) {
      logger.error('Error removing watch progress:', error);
    }
  }

  public async getAllWatchProgress(): Promise<Record<string, WatchProgress>> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const watchProgressKeys = keys.filter(key => key.startsWith(this.WATCH_PROGRESS_KEY));
      const pairs = await AsyncStorage.multiGet(watchProgressKeys);
      return pairs.reduce((acc, [key, value]) => {
        if (value) {
          acc[key.replace(this.WATCH_PROGRESS_KEY, '')] = JSON.parse(value);
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
    episodeId?: string
  ): Promise<void> {
    try {
      const existingProgress = await this.getWatchProgress(id, type, episodeId);
      if (existingProgress) {
        const updatedProgress: WatchProgress = {
          ...existingProgress,
          traktSynced,
          traktLastSynced: traktSynced ? Date.now() : existingProgress.traktLastSynced,
          traktProgress: traktProgress !== undefined ? traktProgress : existingProgress.traktProgress
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
      const unsynced: Array<{
        key: string;
        id: string;
        type: string;
        episodeId?: string;
        progress: WatchProgress;
      }> = [];

      for (const [key, progress] of Object.entries(allProgress)) {
        // Check if needs sync (either never synced or local progress is newer)
        const needsSync = !progress.traktSynced || 
          (progress.traktLastSynced && progress.lastUpdated > progress.traktLastSynced);
        
        if (needsSync) {
          const parts = key.split(':');
          const type = parts[0];
          const id = parts[1];
          const episodeId = parts[2] || undefined;

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
   * Merge Trakt progress with local progress
   */
  public async mergeWithTraktProgress(
    id: string,
    type: string,
    traktProgress: number,
    traktPausedAt: string,
    episodeId?: string
  ): Promise<void> {
    try {
      const localProgress = await this.getWatchProgress(id, type, episodeId);
      const traktTimestamp = new Date(traktPausedAt).getTime();
      
      if (!localProgress) {
        // No local progress, use Trakt data (estimate duration)
        const estimatedDuration = traktProgress > 0 ? (100 / traktProgress) * 100 : 3600; // Default 1 hour
        const newProgress: WatchProgress = {
          currentTime: (traktProgress / 100) * estimatedDuration,
          duration: estimatedDuration,
          lastUpdated: traktTimestamp,
          traktSynced: true,
          traktLastSynced: Date.now(),
          traktProgress
        };
        await this.setWatchProgress(id, type, newProgress, episodeId);
      } else {
        // Always prioritize Trakt progress when merging
        const localProgressPercent = (localProgress.currentTime / localProgress.duration) * 100;
        
        if (localProgress.duration > 0) {
          // Use Trakt progress, keeping the existing duration
          const updatedProgress: WatchProgress = {
            ...localProgress,
            currentTime: (traktProgress / 100) * localProgress.duration,
            lastUpdated: traktTimestamp,
            traktSynced: true,
            traktLastSynced: Date.now(),
            traktProgress
          };
          await this.setWatchProgress(id, type, updatedProgress, episodeId);
          logger.log(`[StorageService] Replaced local progress (${localProgressPercent.toFixed(1)}%) with Trakt progress (${traktProgress}%)`);
        } else {
          // If no duration, estimate it from Trakt progress
          const estimatedDuration = traktProgress > 0 ? (100 / traktProgress) * 100 : 3600;
          const updatedProgress: WatchProgress = {
            currentTime: (traktProgress / 100) * estimatedDuration,
            duration: estimatedDuration,
            lastUpdated: traktTimestamp,
            traktSynced: true,
            traktLastSynced: Date.now(),
            traktProgress
          };
          await this.setWatchProgress(id, type, updatedProgress, episodeId);
          logger.log(`[StorageService] Replaced local progress (${localProgressPercent.toFixed(1)}%) with Trakt progress (${traktProgress}%) - estimated duration`);
        }
      }
    } catch (error) {
      logger.error('Error merging with Trakt progress:', error);
    }
  }
}

export const storageService = StorageService.getInstance(); 