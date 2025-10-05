import { localScraperCacheService, CachedScraperResult } from './localScraperCacheService';
import { logger } from '../utils/logger';
import { Stream } from '../types/streams';

export interface HybridCacheResult {
  validResults: Array<CachedScraperResult>;
  expiredScrapers: string[];
  allExpired: boolean;
  source: 'local';
}

export interface HybridCacheStats {
  local: {
    totalEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  };
}

class HybridCacheService {
  private static instance: HybridCacheService;
  // Global caching removed; local-only

  private constructor() {}

  public static getInstance(): HybridCacheService {
    if (!HybridCacheService.instance) {
      HybridCacheService.instance = new HybridCacheService();
    }
    return HybridCacheService.instance;
  }

  /**
   * Get cached results (local-only)
   */
  async getCachedResults(
    type: string,
    tmdbId: string,
    season?: number,
    episode?: number,
    userSettings?: { enableLocalScrapers?: boolean; enabledScrapers?: Set<string> }
  ): Promise<HybridCacheResult> {
    try {
      // Filter function to check if scraper is enabled for current user
      const isScraperEnabled = (scraperId: string): boolean => {
        if (!userSettings?.enableLocalScrapers) return false;
        if (userSettings?.enabledScrapers) {
          return userSettings.enabledScrapers.has(scraperId);
        }
        // If no specific scraper settings, assume all are enabled if local scrapers are enabled
        return true;
      };

      // Local cache only
      const localResults = await localScraperCacheService.getCachedResults(type, tmdbId, season, episode);

      // Filter results based on user settings
      const filteredLocalResults = {
        ...localResults,
        validResults: localResults.validResults.filter(result => isScraperEnabled(result.scraperId)),
        expiredScrapers: localResults.expiredScrapers.filter(scraperId => isScraperEnabled(scraperId))
      };

      logger.log(`[HybridCache] Using local cache: ${filteredLocalResults.validResults.length} results (filtered from ${localResults.validResults.length})`);
      return {
        ...filteredLocalResults,
        source: 'local'
      };

    } catch (error) {
      logger.error('[HybridCache] Error getting cached results:', error);
      return {
        validResults: [],
        expiredScrapers: [],
        allExpired: true,
        source: 'local'
      };
    }
  }

  /**
   * Cache results (local-only)
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
      // Cache in local storage
      const localPromises = results.map(result => 
        localScraperCacheService.cacheScraperResult(
          type, tmdbId, result.scraperId, result.scraperName, 
          result.streams, result.error, season, episode
        )
      );
      await Promise.all(localPromises);
      logger.log(`[HybridCache] Cached ${results.length} results in local cache`);

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
    episode?: number,
    userSettings?: { enableLocalScrapers?: boolean; enabledScrapers?: Set<string> }
  ): Promise<string[]> {
    const { validResults, expiredScrapers } = await this.getCachedResults(type, tmdbId, season, episode, userSettings);
    
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
    episode?: number,
    userSettings?: { enableLocalScrapers?: boolean; enabledScrapers?: Set<string> }
  ): Promise<Stream[]> {
    const { validResults } = await this.getCachedResults(type, tmdbId, season, episode, userSettings);

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
   * Invalidate cache for specific content (local-only)
   */
  async invalidateContent(
    type: string,
    tmdbId: string,
    season?: number,
    episode?: number
  ): Promise<void> {
    try {
      await localScraperCacheService.invalidateContent(type, tmdbId, season, episode);
      logger.log(`[HybridCache] Invalidated cache for ${type}:${tmdbId}`);
    } catch (error) {
      logger.error('[HybridCache] Error invalidating cache:', error);
    }
  }

  /**
   * Invalidate cache for specific scraper (local-only)
   */
  async invalidateScraper(scraperId: string): Promise<void> {
    try {
      await localScraperCacheService.invalidateScraper(scraperId);
      logger.log(`[HybridCache] Invalidated cache for scraper ${scraperId}`);
    } catch (error) {
      logger.error('[HybridCache] Error invalidating scraper cache:', error);
    }
  }

  /**
   * Clear all cached results (local-only)
   */
  async clearAllCache(): Promise<void> {
    try {
      await localScraperCacheService.clearAllCache();
      logger.log('[HybridCache] Cleared all local cache');
    } catch (error) {
      logger.error('[HybridCache] Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics (local-only)
   */
  async getCacheStats(): Promise<HybridCacheStats> {
    try {
      const localStats = await localScraperCacheService.getCacheStats();
      return { local: localStats };
    } catch (error) {
      logger.error('[HybridCache] Error getting cache stats:', error);
      return { local: { totalEntries: 0, totalSize: 0, oldestEntry: null, newestEntry: null } };
    }
  }

  /**
   * Clean up old entries (local-only)
   */
  async cleanupOldEntries(): Promise<void> {
    try {
      await localScraperCacheService.clearAllCache();
      logger.log('[HybridCache] Cleaned up old entries');
    } catch (error) {
      logger.error('[HybridCache] Error cleaning up old entries:', error);
    }
  }

  // Configuration APIs removed; local-only
}

export const hybridCacheService = HybridCacheService.getInstance();
export default hybridCacheService;
