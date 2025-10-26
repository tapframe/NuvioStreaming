import { mmkvStorage } from './mmkvStorage';
import { logger } from '../utils/logger';

export interface CachedStream {
  stream: any; // Stream object
  metadata: any; // Metadata object
  episodeId?: string; // For series episodes
  season?: number;
  episode?: number;
  episodeTitle?: string;
  imdbId?: string; // IMDb ID for subtitle fetching
  timestamp: number; // When it was cached
  url: string; // Stream URL for quick validation
}

export interface StreamCacheEntry {
  cachedStream: CachedStream;
  expiresAt: number; // Timestamp when cache expires
}

const DEFAULT_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds (fallback)
const CACHE_KEY_PREFIX = 'stream_cache_';

class StreamCacheService {
  /**
   * Save a stream to cache
   */
  async saveStreamToCache(
    id: string, 
    type: string, 
    stream: any, 
    metadata: any,
    episodeId?: string,
    season?: number,
    episode?: number,
    episodeTitle?: string,
    imdbId?: string,
    cacheDuration?: number
  ): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(id, type, episodeId);
      const now = Date.now();
      
      const cachedStream: CachedStream = {
        stream,
        metadata,
        episodeId,
        season,
        episode,
        episodeTitle,
        imdbId,
        timestamp: now,
        url: stream.url
      };

      const ttl = cacheDuration || DEFAULT_CACHE_DURATION;
      const cacheEntry: StreamCacheEntry = {
        cachedStream,
        expiresAt: now + ttl
      };

      await mmkvStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      logger.log(`💾 [StreamCache] Saved stream cache for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
      logger.log(`💾 [StreamCache] Cache key: ${cacheKey}`);
      logger.log(`💾 [StreamCache] Stream URL: ${stream.url}`);
      logger.log(`💾 [StreamCache] TTL: ${ttl / 1000 / 60} minutes`);
      logger.log(`💾 [StreamCache] Expires at: ${new Date(now + ttl).toISOString()}`);
    } catch (error) {
      logger.warn('[StreamCache] Failed to save stream to cache:', error);
    }
  }

  /**
   * Get cached stream if it exists and is still valid
   */
  async getCachedStream(id: string, type: string, episodeId?: string): Promise<CachedStream | null> {
    try {
      const cacheKey = this.getCacheKey(id, type, episodeId);
      logger.log(`🔍 [StreamCache] Looking for cached stream with key: ${cacheKey}`);
      
      const cachedData = await mmkvStorage.getItem(cacheKey);
      
      if (!cachedData) {
        logger.log(`❌ [StreamCache] No cached data found for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
        return null;
      }

      const cacheEntry: StreamCacheEntry = JSON.parse(cachedData);
      const now = Date.now();

      logger.log(`🔍 [StreamCache] Found cached data, expires at: ${new Date(cacheEntry.expiresAt).toISOString()}`);
      logger.log(`🔍 [StreamCache] Current time: ${new Date(now).toISOString()}`);

      // Check if cache has expired
      if (now > cacheEntry.expiresAt) {
        logger.log(`⏰ [StreamCache] Cache expired for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
        await this.removeCachedStream(id, type, episodeId);
        return null;
      }

      // Skip URL validation for now - many CDNs block HEAD requests
      // This was causing valid streams to be rejected
      logger.log(`🔍 [StreamCache] Skipping URL validation (CDN compatibility)`);

      logger.log(`✅ [StreamCache] Using cached stream for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
      return cacheEntry.cachedStream;
    } catch (error) {
      logger.warn('[StreamCache] Failed to get cached stream:', error);
      return null;
    }
  }

  /**
   * Remove cached stream
   */
  async removeCachedStream(id: string, type: string, episodeId?: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(id, type, episodeId);
      await mmkvStorage.removeItem(cacheKey);
      logger.log(`🗑️ [StreamCache] Removed cached stream for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
    } catch (error) {
      logger.warn('[StreamCache] Failed to remove cached stream:', error);
    }
  }

  /**
   * Clear all cached streams
   */
  async clearAllCachedStreams(): Promise<void> {
    try {
      const allKeys = await mmkvStorage.getAllKeys();
      const cacheKeys = allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
      
      for (const key of cacheKeys) {
        await mmkvStorage.removeItem(key);
      }
      
      logger.log(`🧹 [StreamCache] Cleared ${cacheKeys.length} cached streams`);
    } catch (error) {
      logger.warn('[StreamCache] Failed to clear all cached streams:', error);
    }
  }

  /**
   * Get cache key for a specific content item
   */
  private getCacheKey(id: string, type: string, episodeId?: string): string {
    const baseKey = `${CACHE_KEY_PREFIX}${type}:${id}`;
    return episodeId ? `${baseKey}:${episodeId}` : baseKey;
  }

  /**
   * Validate if a stream URL is still accessible
   */
  private async validateStreamUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal as any,
      } as any);
      
      clearTimeout(timeout);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cache info for debugging
   */
  async getCacheInfo(): Promise<{ totalCached: number; expiredCount: number; validCount: number }> {
    try {
      const allKeys = await mmkvStorage.getAllKeys();
      const cacheKeys = allKeys.filter((key: string) => key.startsWith(CACHE_KEY_PREFIX));
      
      let expiredCount = 0;
      let validCount = 0;
      const now = Date.now();

      for (const key of cacheKeys) {
        try {
          const cachedData = await mmkvStorage.getItem(key);
          if (cachedData) {
            const cacheEntry: StreamCacheEntry = JSON.parse(cachedData);
            if (now > cacheEntry.expiresAt) {
              expiredCount++;
            } else {
              validCount++;
            }
          }
        } catch (error) {
          // Skip invalid entries
        }
      }

      return {
        totalCached: cacheKeys.length,
        expiredCount,
        validCount
      };
    } catch (error) {
      return { totalCached: 0, expiredCount: 0, validCount: 0 };
    }
  }
}

export const streamCacheService = new StreamCacheService();
