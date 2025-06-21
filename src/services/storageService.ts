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
  private watchProgressSubscribers: (() => void)[] = [];
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

  private getWatchProgressKey(id: string, type: string, episodeId?: string): string {
    return `${this.WATCH_PROGRESS_KEY}${type}:${id}${episodeId ? `:${episodeId}` : ''}`;
  }

  private getContentDurationKey(id: string, type: string, episodeId?: string): string {
    return `${this.CONTENT_DURATION_KEY}${type}:${id}${episodeId ? `:${episodeId}` : ''}`;
  }

  public async setContentDuration(
    id: string,
    type: string,
    duration: number,
    episodeId?: string
  ): Promise<void> {
    try {
      const key = this.getContentDurationKey(id, type, episodeId);
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
      const key = this.getContentDurationKey(id, type, episodeId);
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
      const key = this.getWatchProgressKey(id, type, episodeId);
      
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
      
      await AsyncStorage.setItem(key, JSON.stringify(progress));
      
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
    episodeId?: string,
    exactTime?: number
  ): Promise<void> {
    try {
      const existingProgress = await this.getWatchProgress(id, type, episodeId);
      if (existingProgress) {
        const updatedProgress: WatchProgress = {
          ...existingProgress,
          traktSynced,
          traktLastSynced: traktSynced ? Date.now() : existingProgress.traktLastSynced,
          traktProgress: traktProgress !== undefined ? traktProgress : existingProgress.traktProgress,
          // Update current time with exact time if provided
          ...(exactTime && exactTime > 0 && { currentTime: exactTime })
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
        
        const timeSource = exactTime ? 'exact' : 'calculated';
        const durationSource = await this.getContentDuration(id, type, episodeId) ? 'stored' : 'estimated';
        logger.log(`[StorageService] Created progress from Trakt: ${(currentTime/60).toFixed(1)}min (${timeSource}) of ${(duration/60).toFixed(0)}min (${durationSource})`);
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
        
        // Only log significant changes
        if (progressDiff > 10 || traktProgress === 100) {
          const timeSource = exactTime ? 'exact' : 'calculated';
          logger.log(`[StorageService] Updated progress: ${(currentTime/60).toFixed(1)}min (${timeSource}) = ${traktProgress}%`);
        }
      }
    } catch (error) {
      logger.error('Error merging with Trakt progress:', error);
    }
  }
}

export const storageService = StorageService.getInstance(); 