import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

interface WatchProgress {
  currentTime: number;
  duration: number;
  lastUpdated: number;
}

class StorageService {
  private static instance: StorageService;
  private readonly WATCH_PROGRESS_KEY = '@watch_progress:';

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
    } catch (error) {
      logger.error('Error saving watch progress:', error);
    }
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
}

export const storageService = StorageService.getInstance(); 