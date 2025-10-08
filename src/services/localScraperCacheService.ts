import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { Stream } from '../types/streams';

export interface CachedScraperResult {
  streams: Stream[];
  timestamp: number;
  success: boolean;
  error?: string;
  scraperId: string;
  scraperName: string;
}

export interface CachedContentResult {
  contentKey: string; // e.g., "movie:123" or "tv:123:1:2"
  results: CachedScraperResult[];
  timestamp: number;
  ttl: number;
}

class LocalScraperCacheService {
  private static instance: LocalScraperCacheService;
  private readonly CACHE_KEY_PREFIX = 'local-scraper-cache';
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes default TTL
  private readonly MAX_CACHE_SIZE = 200; // Maximum number of cached content items
  private readonly FAILED_RETRY_TTL_MS = 5 * 60 * 1000; // 5 minutes for failed scrapers
  private readonly SUCCESS_TTL_MS = 60 * 60 * 1000; // 1 hour for successful scrapers

  private constructor() {}

  public static getInstance(): LocalScraperCacheService {
    if (!LocalScraperCacheService.instance) {
      LocalScraperCacheService.instance = new LocalScraperCacheService();
    }
    return LocalScraperCacheService.instance;
  }

  /**
   * Generate cache key for content
   */
  private getContentKey(type: string, tmdbId: string, season?: number, episode?: number): string {
    if (season !== undefined && episode !== undefined) {
      return `${type}:${tmdbId}:${season}:${episode}`;
    }
    return `${type}:${tmdbId}`;
  }

  /**
   * Generate AsyncStorage key for cached content
   */
  private getStorageKey(contentKey: string): string {
    return `${this.CACHE_KEY_PREFIX}:${contentKey}`;
  }

  /**
   * Check if cached result is still valid based on TTL
   */
  private isCacheValid(timestamp: number, ttl: number): boolean {
    return Date.now() - timestamp < ttl;
  }

  /**
   * Get cached results for content, filtering out expired results
   */
  async getCachedResults(
    type: string, 
    tmdbId: string, 
    season?: number, 
    episode?: number
  ): Promise<{
    validResults: CachedScraperResult[];
    expiredScrapers: string[];
    allExpired: boolean;
  }> {
    try {
      const contentKey = this.getContentKey(type, tmdbId, season, episode);
      const storageKey = this.getStorageKey(contentKey);
      
      const cachedData = await AsyncStorage.getItem(storageKey);
      if (!cachedData) {
        return {
          validResults: [],
          expiredScrapers: [],
          allExpired: true
        };
      }

      const parsed: CachedContentResult = JSON.parse(cachedData);
      
      // Check if the entire cache entry is expired
      if (!this.isCacheValid(parsed.timestamp, parsed.ttl)) {
        // Remove expired entry
        await AsyncStorage.removeItem(storageKey);
        return {
          validResults: [],
          expiredScrapers: parsed.results.map(r => r.scraperId),
          allExpired: true
        };
      }

      // Filter valid results and identify expired scrapers
      const validResults: CachedScraperResult[] = [];
      const expiredScrapers: string[] = [];

      for (const result of parsed.results) {
        // Use different TTL based on success/failure
        const ttl = result.success ? this.SUCCESS_TTL_MS : this.FAILED_RETRY_TTL_MS;
        
        if (this.isCacheValid(result.timestamp, ttl)) {
          validResults.push(result);
        } else {
          expiredScrapers.push(result.scraperId);
        }
      }

      logger.log(`[LocalScraperCache] Retrieved ${validResults.length} valid results, ${expiredScrapers.length} expired scrapers for ${contentKey}`);

      return {
        validResults,
        expiredScrapers,
        allExpired: validResults.length === 0
      };

    } catch (error) {
      logger.error('[LocalScraperCache] Error getting cached results:', error);
      return {
        validResults: [],
        expiredScrapers: [],
        allExpired: true
      };
    }
  }

  /**
   * Cache results for specific scrapers
   */
  async cacheResults(
    type: string,
    tmdbId: string,
    results: CachedScraperResult[],
    season?: number,
    episode?: number
  ): Promise<void> {
    try {
      const contentKey = this.getContentKey(type, tmdbId, season, episode);
      const storageKey = this.getStorageKey(contentKey);

      // Get existing cached data
      const existingData = await AsyncStorage.getItem(storageKey);
      let cachedContent: CachedContentResult;

      if (existingData) {
        cachedContent = JSON.parse(existingData);
        
        // Update existing results or add new ones
        for (const newResult of results) {
          const existingIndex = cachedContent.results.findIndex(r => r.scraperId === newResult.scraperId);
          if (existingIndex >= 0) {
            // Update existing result
            cachedContent.results[existingIndex] = newResult;
          } else {
            // Add new result
            cachedContent.results.push(newResult);
          }
        }
      } else {
        // Create new cache entry
        cachedContent = {
          contentKey,
          results,
          timestamp: Date.now(),
          ttl: this.DEFAULT_TTL_MS
        };
      }

      // Update timestamp
      cachedContent.timestamp = Date.now();

      // Store updated cache
      await AsyncStorage.setItem(storageKey, JSON.stringify(cachedContent));

      // Clean up old cache entries if we exceed the limit
      await this.cleanupOldEntries();

      logger.log(`[LocalScraperCache] Cached ${results.length} results for ${contentKey}`);

    } catch (error) {
      logger.error('[LocalScraperCache] Error caching results:', error);
    }
  }

  /**
   * Cache a single scraper result
   */
  async cacheScraperResult(
    type: string,
    tmdbId: string,
    scraperId: string,
    scraperName: string,
    streams: Stream[] | null,
    error: Error | null,
    season?: number,
    episode?: number
  ): Promise<void> {
    const result: CachedScraperResult = {
      streams: streams || [],
      timestamp: Date.now(),
      success: !error && streams !== null,
      error: error?.message,
      scraperId,
      scraperName
    };

    await this.cacheResults(type, tmdbId, [result], season, episode);
  }

  /**
   * Get list of scrapers that need to be re-run (expired, failed, or not cached)
   */
  async getScrapersToRerun(
    type: string,
    tmdbId: string,
    availableScrapers: Array<{ id: string; name: string }>,
    season?: number,
    episode?: number
  ): Promise<string[]> {
    const { validResults, expiredScrapers } = await this.getCachedResults(type, tmdbId, season, episode);
    
    const validScraperIds = new Set(validResults.map(r => r.scraperId));
    const expiredScraperIds = new Set(expiredScrapers);
    
    // Get scrapers that previously failed (returned no streams)
    const failedScraperIds = new Set(
      validResults
        .filter(r => !r.success || r.streams.length === 0)
        .map(r => r.scraperId)
    );
    
    // Return scrapers that are:
    // 1. Not cached at all
    // 2. Expired
    // 3. Previously failed (regardless of cache status)
    const scrapersToRerun = availableScrapers
      .filter(scraper => 
        !validScraperIds.has(scraper.id) || 
        expiredScraperIds.has(scraper.id) ||
        failedScraperIds.has(scraper.id)
      )
      .map(scraper => scraper.id);

    logger.log(`[LocalScraperCache] Scrapers to re-run: ${scrapersToRerun.join(', ')} (not cached: ${availableScrapers.filter(s => !validScraperIds.has(s.id)).length}, expired: ${expiredScrapers.length}, failed: ${failedScraperIds.size})`);
    
    return scrapersToRerun;
  }

  /**
   * Get all valid cached streams for content
   */
  async getCachedStreams(
    type: string,
    tmdbId: string,
    season?: number,
    episode?: number
  ): Promise<Stream[]> {
    const { validResults } = await this.getCachedResults(type, tmdbId, season, episode);
    
    // Flatten all valid streams
    const allStreams: Stream[] = [];
    for (const result of validResults) {
      if (result.success && result.streams) {
        allStreams.push(...result.streams);
      }
    }

    return allStreams;
  }

  /**
   * Invalidate cache for specific content
   */
  async invalidateContent(
    type: string,
    tmdbId: string,
    season?: number,
    episode?: number
  ): Promise<void> {
    try {
      const contentKey = this.getContentKey(type, tmdbId, season, episode);
      const storageKey = this.getStorageKey(contentKey);
      
      await AsyncStorage.removeItem(storageKey);
      logger.log(`[LocalScraperCache] Invalidated cache for ${contentKey}`);
    } catch (error) {
      logger.error('[LocalScraperCache] Error invalidating cache:', error);
    }
  }

  /**
   * Invalidate cache for specific scraper across all content
   */
  async invalidateScraper(scraperId: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_KEY_PREFIX));
      
      for (const key of cacheKeys) {
        const cachedData = await AsyncStorage.getItem(key);
        if (cachedData) {
          const parsed: CachedContentResult = JSON.parse(cachedData);
          
          // Remove results from this scraper
          parsed.results = parsed.results.filter(r => r.scraperId !== scraperId);
          
          if (parsed.results.length === 0) {
            // Remove entire cache entry if no results left
            await AsyncStorage.removeItem(key);
          } else {
            // Update cache with remaining results
            await AsyncStorage.setItem(key, JSON.stringify(parsed));
          }
        }
      }
      
      logger.log(`[LocalScraperCache] Invalidated cache for scraper ${scraperId}`);
    } catch (error) {
      logger.error('[LocalScraperCache] Error invalidating scraper cache:', error);
    }
  }

  /**
   * Clear all cached results
   */
  async clearAllCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_KEY_PREFIX));
      
      await AsyncStorage.multiRemove(cacheKeys);
      logger.log(`[LocalScraperCache] Cleared ${cacheKeys.length} cache entries`);
    } catch (error) {
      logger.error('[LocalScraperCache] Error clearing cache:', error);
    }
  }

  /**
   * Clean up old cache entries to stay within size limit
   */
  private async cleanupOldEntries(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_KEY_PREFIX));
      
      if (cacheKeys.length <= this.MAX_CACHE_SIZE) {
        return; // No cleanup needed
      }

      // Get all cache entries with their timestamps
      const entriesWithTimestamps = await Promise.all(
        cacheKeys.map(async (key) => {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const parsed: CachedContentResult = JSON.parse(data);
            return { key, timestamp: parsed.timestamp };
          }
          return { key, timestamp: 0 };
        })
      );

      // Sort by timestamp (oldest first)
      entriesWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);

      // Remove oldest entries
      const entriesToRemove = entriesWithTimestamps.slice(0, cacheKeys.length - this.MAX_CACHE_SIZE);
      const keysToRemove = entriesToRemove.map(entry => entry.key);
      
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        logger.log(`[LocalScraperCache] Cleaned up ${keysToRemove.length} old cache entries`);
      }

    } catch (error) {
      logger.error('[LocalScraperCache] Error cleaning up cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_KEY_PREFIX));
      
      let totalSize = 0;
      let oldestTimestamp: number | null = null;
      let newestTimestamp: number | null = null;

      for (const key of cacheKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          totalSize += data.length;
          const parsed: CachedContentResult = JSON.parse(data);
          
          if (oldestTimestamp === null || parsed.timestamp < oldestTimestamp) {
            oldestTimestamp = parsed.timestamp;
          }
          if (newestTimestamp === null || parsed.timestamp > newestTimestamp) {
            newestTimestamp = parsed.timestamp;
          }
        }
      }

      return {
        totalEntries: cacheKeys.length,
        totalSize,
        oldestEntry: oldestTimestamp,
        newestEntry: newestTimestamp
      };
    } catch (error) {
      logger.error('[LocalScraperCache] Error getting cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }
  }
}

export const localScraperCacheService = LocalScraperCacheService.getInstance();
export default localScraperCacheService;
