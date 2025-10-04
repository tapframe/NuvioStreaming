import { localScraperCacheService, CachedScraperResult } from './localScraperCacheService';
import { supabaseGlobalCacheService, GlobalCachedScraperResult } from './supabaseGlobalCacheService';
import { logger } from '../utils/logger';
import { Stream } from '../types/streams';

export interface HybridCacheResult {
  validResults: Array<CachedScraperResult | GlobalCachedScraperResult>;
  expiredScrapers: string[];
  allExpired: boolean;
  source: 'local' | 'global' | 'hybrid';
}

export interface HybridCacheStats {
  local: {
    totalEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  };
  global: {
    totalEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    hitRate: number;
  };
  combined: {
    totalEntries: number;
    hitRate: number;
  };
}

class HybridCacheService {
  private static instance: HybridCacheService;
  private readonly ENABLE_GLOBAL_CACHE = true; // Can be made configurable
  private readonly FALLBACK_TO_LOCAL = true; // Fallback to local if global fails

  private constructor() {}

  public static getInstance(): HybridCacheService {
    if (!HybridCacheService.instance) {
      HybridCacheService.instance = new HybridCacheService();
    }
    return HybridCacheService.instance;
  }

  /**
   * Get cached results with hybrid approach (global first, then local)
   */
  async getCachedResults(
    type: string, 
    tmdbId: string, 
    season?: number, 
    episode?: number
  ): Promise<HybridCacheResult> {
    try {
      // Try global cache first if enabled
      if (this.ENABLE_GLOBAL_CACHE) {
        try {
          const globalResults = await supabaseGlobalCacheService.getCachedResults(type, tmdbId, season, episode);
          
          if (globalResults.validResults.length > 0) {
            logger.log(`[HybridCache] Using global cache: ${globalResults.validResults.length} results`);
            return {
              ...globalResults,
              source: 'global'
            };
          }
        } catch (error) {
          logger.warn('[HybridCache] Global cache failed, falling back to local:', error);
        }
      }

      // Fallback to local cache
      if (this.FALLBACK_TO_LOCAL) {
        const localResults = await localScraperCacheService.getCachedResults(type, tmdbId, season, episode);
        
        if (localResults.validResults.length > 0) {
          logger.log(`[HybridCache] Using local cache: ${localResults.validResults.length} results`);
          return {
            ...localResults,
            source: 'local'
          };
        }
      }

      // No valid results found
      return {
        validResults: [],
        expiredScrapers: [],
        allExpired: true,
        source: 'hybrid'
      };

    } catch (error) {
      logger.error('[HybridCache] Error getting cached results:', error);
      return {
        validResults: [],
        expiredScrapers: [],
        allExpired: true,
        source: 'hybrid'
      };
    }
  }

  /**
   * Cache results in both local and global cache
   */
  async cacheResults(
    type: string,
    tmdbId: string,
    results: Array<{
      scraperId: string;
      scraperName: string;
      streams: Stream[] | null;
      error: Error | null;
    }>,
    season?: number,
    episode?: number
  ): Promise<void> {
    try {
      // Cache in local storage first (fastest)
      const localPromises = results.map(result => 
        localScraperCacheService.cacheScraperResult(
          type, tmdbId, result.scraperId, result.scraperName, 
          result.streams, result.error, season, episode
        )
      );
      await Promise.all(localPromises);

      // Cache in global storage (shared across users)
      if (this.ENABLE_GLOBAL_CACHE) {
        try {
          await supabaseGlobalCacheService.cacheResults(type, tmdbId, results, season, episode);
          logger.log(`[HybridCache] Cached ${results.length} results in both local and global cache`);
        } catch (error) {
          logger.warn('[HybridCache] Failed to cache in global storage:', error);
          // Local cache succeeded, so we continue
        }
      }

    } catch (error) {
      logger.error('[HybridCache] Error caching results:', error);
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
    await this.cacheResults(type, tmdbId, [{
      scraperId,
      scraperName,
      streams,
      error
    }], season, episode);
  }

  /**
   * Get list of scrapers that need to be re-run
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
    
    // Return scrapers that are either expired or not cached
    const scrapersToRerun = availableScrapers
      .filter(scraper => 
        !validScraperIds.has(scraper.id) || expiredScraperIds.has(scraper.id)
      )
      .map(scraper => scraper.id);

    logger.log(`[HybridCache] Scrapers to re-run: ${scrapersToRerun.join(', ')}`);
    
    return scrapersToRerun;
  }

  /**
   * Get all valid cached streams
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
      // Invalidate both local and global cache
      const promises = [
        localScraperCacheService.invalidateContent(type, tmdbId, season, episode)
      ];

      if (this.ENABLE_GLOBAL_CACHE) {
        promises.push(
          supabaseGlobalCacheService.invalidateContent(type, tmdbId, season, episode)
        );
      }

      await Promise.all(promises);
      logger.log(`[HybridCache] Invalidated cache for ${type}:${tmdbId}`);
    } catch (error) {
      logger.error('[HybridCache] Error invalidating cache:', error);
    }
  }

  /**
   * Invalidate cache for specific scraper
   */
  async invalidateScraper(scraperId: string): Promise<void> {
    try {
      // Invalidate both local and global cache
      const promises = [
        localScraperCacheService.invalidateScraper(scraperId)
      ];

      if (this.ENABLE_GLOBAL_CACHE) {
        promises.push(
          supabaseGlobalCacheService.invalidateScraper(scraperId)
        );
      }

      await Promise.all(promises);
      logger.log(`[HybridCache] Invalidated cache for scraper ${scraperId}`);
    } catch (error) {
      logger.error('[HybridCache] Error invalidating scraper cache:', error);
    }
  }

  /**
   * Clear all cached results
   */
  async clearAllCache(): Promise<void> {
    try {
      // Clear both local and global cache
      const promises = [
        localScraperCacheService.clearAllCache()
      ];

      if (this.ENABLE_GLOBAL_CACHE) {
        promises.push(
          supabaseGlobalCacheService.clearAllCache()
        );
      }

      await Promise.all(promises);
      logger.log('[HybridCache] Cleared all cache (local and global)');
    } catch (error) {
      logger.error('[HybridCache] Error clearing cache:', error);
    }
  }

  /**
   * Get combined cache statistics
   */
  async getCacheStats(): Promise<HybridCacheStats> {
    try {
      const [localStats, globalStats] = await Promise.all([
        localScraperCacheService.getCacheStats(),
        this.ENABLE_GLOBAL_CACHE ? supabaseGlobalCacheService.getCacheStats() : Promise.resolve({
          totalEntries: 0,
          totalSize: 0,
          oldestEntry: null,
          newestEntry: null,
          hitRate: 0
        })
      ]);

      return {
        local: localStats,
        global: globalStats,
        combined: {
          totalEntries: localStats.totalEntries + globalStats.totalEntries,
          hitRate: globalStats.hitRate // Global cache hit rate is more meaningful
        }
      };
    } catch (error) {
      logger.error('[HybridCache] Error getting cache stats:', error);
      return {
        local: { totalEntries: 0, totalSize: 0, oldestEntry: null, newestEntry: null },
        global: { totalEntries: 0, totalSize: 0, oldestEntry: null, newestEntry: null, hitRate: 0 },
        combined: { totalEntries: 0, hitRate: 0 }
      };
    }
  }

  /**
   * Clean up old entries in both caches
   */
  async cleanupOldEntries(): Promise<void> {
    try {
      const promises = [
        localScraperCacheService.clearAllCache() // Local cache handles cleanup automatically
      ];

      if (this.ENABLE_GLOBAL_CACHE) {
        promises.push(
          supabaseGlobalCacheService.cleanupOldEntries()
        );
      }

      await Promise.all(promises);
      logger.log('[HybridCache] Cleaned up old entries');
    } catch (error) {
      logger.error('[HybridCache] Error cleaning up old entries:', error);
    }
  }

  /**
   * Get cache configuration
   */
  getConfig(): {
    enableGlobalCache: boolean;
    fallbackToLocal: boolean;
  } {
    return {
      enableGlobalCache: this.ENABLE_GLOBAL_CACHE,
      fallbackToLocal: this.FALLBACK_TO_LOCAL
    };
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: {
    enableGlobalCache?: boolean;
    fallbackToLocal?: boolean;
  }): void {
    if (config.enableGlobalCache !== undefined) {
      (this as any).ENABLE_GLOBAL_CACHE = config.enableGlobalCache;
    }
    if (config.fallbackToLocal !== undefined) {
      (this as any).FALLBACK_TO_LOCAL = config.fallbackToLocal;
    }
    
    logger.log('[HybridCache] Configuration updated:', this.getConfig());
  }
}

export const hybridCacheService = HybridCacheService.getInstance();
export default hybridCacheService;
