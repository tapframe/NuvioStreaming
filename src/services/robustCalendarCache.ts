import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// Define the structure of cached data
interface CachedData<T> {
  timestamp: number;
  hash: string;
  data: T;
}

// Define the structure for Trakt collections
interface TraktCollections {
  watchlist: any[];
  continueWatching: any[];
  watched?: any[];
}

const THIS_WEEK_CACHE_KEY = 'this_week_episodes_cache';
const CALENDAR_CACHE_KEY = 'calendar_data_cache';
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ERROR_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes for error recovery

class RobustCalendarCache {
  private generateHash(libraryItems: any[], traktCollections: TraktCollections): string {
    const libraryIds = libraryItems.map(item => item.id).sort().join('|');
    const watchlistIds = (traktCollections.watchlist || []).map(item => item.show?.ids?.imdb || '').filter(Boolean).sort().join('|');
    const continueWatchingIds = (traktCollections.continueWatching || []).map(item => item.show?.ids?.imdb || '').filter(Boolean).sort().join('|');
    const watchedIds = (traktCollections.watched || []).map(item => item.show?.ids?.imdb || '').filter(Boolean).sort().join('|');
    
    return `${libraryIds}:${watchlistIds}:${continueWatchingIds}:${watchedIds}`;
  }

  private async getCachedData<T>(key: string, libraryItems: any[], traktCollections: TraktCollections): Promise<T | null> {
    try {
      const storedCache = await AsyncStorage.getItem(key);
      if (!storedCache) return null;

      const cache: CachedData<T> = JSON.parse(storedCache);
      const currentHash = this.generateHash(libraryItems, traktCollections);

      if (cache.hash !== currentHash) {
        logger.log(`[Cache] Hash mismatch for key ${key}, cache invalidated`);
        return null;
      }

      const isCacheExpired = Date.now() - cache.timestamp > CACHE_DURATION_MS;
      if (isCacheExpired) {
        logger.log(`[Cache] Cache expired for key ${key}`);
        return null;
      }
      
      logger.log(`[Cache] Valid cache found for key ${key}`);
      return cache.data;
    } catch (error) {
      logger.error(`[Cache] Error getting cached data for key ${key}:`, error);
      return null;
    }
  }

  private async setCachedData<T>(key: string, data: T, libraryItems: any[], traktCollections: TraktCollections, isErrorRecovery = false): Promise<void> {
    try {
      const hash = this.generateHash(libraryItems, traktCollections);
      const cache: CachedData<T> = {
        timestamp: Date.now(),
        hash,
        data,
      };

      if (isErrorRecovery) {
        // Use a shorter cache duration for error states
        cache.timestamp = Date.now() - CACHE_DURATION_MS + ERROR_CACHE_DURATION_MS;
        logger.log(`[Cache] Saving error recovery cache for key ${key}`);
      } else {
        logger.log(`[Cache] Saving successful data to cache for key ${key}`);
      }
      
      await AsyncStorage.setItem(key, JSON.stringify(cache));
    } catch (error) {
      logger.error(`[Cache] Error setting cached data for key ${key}:`, error);
    }
  }

  // Methods for This Week section
  public async getCachedThisWeekData(libraryItems: any[], traktCollections: TraktCollections): Promise<any[] | null> {
    return this.getCachedData<any[]>(THIS_WEEK_CACHE_KEY, libraryItems, traktCollections);
  }

  public async setCachedThisWeekData(data: any[], libraryItems: any[], traktCollections: TraktCollections, isErrorRecovery = false): Promise<void> {
    await this.setCachedData<any[]>(THIS_WEEK_CACHE_KEY, data, libraryItems, traktCollections, isErrorRecovery);
  }

  // Methods for Calendar screen
  public async getCachedCalendarData(libraryItems: any[], traktCollections: TraktCollections): Promise<any[] | null> {
    return this.getCachedData<any[]>(CALENDAR_CACHE_KEY, libraryItems, traktCollections);
  }

  public async setCachedCalendarData(data: any[], libraryItems: any[], traktCollections: TraktCollections, isErrorRecovery = false): Promise<void> {
    await this.setCachedData<any[]>(CALENDAR_CACHE_KEY, data, libraryItems, traktCollections, isErrorRecovery);
  }
}

export const robustCalendarCache = new RobustCalendarCache(); 