import { supabase } from './supabaseClient';
import { logger } from '../utils/logger';
import { Stream } from '../types/streams';

export interface GlobalCachedScraperResult {
  streams: Stream[];
  timestamp: number;
  success: boolean;
  error?: string;
  scraperId: string;
  scraperName: string;
  contentKey: string; // e.g., "movie:123" or "tv:123:1:2"
}

export interface GlobalCacheStats {
  totalEntries: number;
  totalSize: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  hitRate: number;
}

class SupabaseGlobalCacheService {
  private static instance: SupabaseGlobalCacheService;
  private readonly TABLE_NAME = 'scraper_cache';
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes default TTL
  private readonly FAILED_RETRY_TTL_MS = 5 * 60 * 1000; // 5 minutes for failed scrapers
  private readonly SUCCESS_TTL_MS = 60 * 60 * 1000; // 1 hour for successful scrapers
  private readonly MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max age
  private readonly BATCH_SIZE = 50; // Batch size for operations

  // Cache hit/miss tracking
  private cacheHits = 0;
  private cacheMisses = 0;

  private constructor() {}

  public static getInstance(): SupabaseGlobalCacheService {
    if (!SupabaseGlobalCacheService.instance) {
      SupabaseGlobalCacheService.instance = new SupabaseGlobalCacheService();
    }
    return SupabaseGlobalCacheService.instance;
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
   * Generate unique key for scraper result
   */
  private getScraperKey(contentKey: string, scraperId: string): string {
    return `${contentKey}:${scraperId}`;
  }

  /**
   * Check if cached result is still valid based on TTL
   */
  private isCacheValid(timestamp: number, success: boolean): boolean {
    const ttl = success ? this.SUCCESS_TTL_MS : this.FAILED_RETRY_TTL_MS;
    return Date.now() - timestamp < ttl;
  }

  /**
   * Get cached results for content from global cache
   */
  async getCachedResults(
    type: string, 
    tmdbId: string, 
    season?: number, 
    episode?: number
  ): Promise<{
    validResults: GlobalCachedScraperResult[];
    expiredScrapers: string[];
    allExpired: boolean;
  }> {
    try {
      const contentKey = this.getContentKey(type, tmdbId, season, episode);
      
      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .select('*')
        .eq('content_key', contentKey)
        .gte('created_at', new Date(Date.now() - this.MAX_CACHE_AGE_MS).toISOString());

      if (error) {
        logger.error('[GlobalCache] Error fetching cached results:', error);
        this.cacheMisses++;
        return {
          validResults: [],
          expiredScrapers: [],
          allExpired: true
        };
      }

      if (!data || data.length === 0) {
        this.cacheMisses++;
        return {
          validResults: [],
          expiredScrapers: [],
          allExpired: true
        };
      }

      // Filter valid results and identify expired scrapers
      const validResults: GlobalCachedScraperResult[] = [];
      const expiredScrapers: string[] = [];

      for (const row of data) {
        const result: GlobalCachedScraperResult = {
          streams: row.streams || [],
          timestamp: new Date(row.created_at).getTime(),
          success: row.success,
          error: row.error,
          scraperId: row.scraper_id,
          scraperName: row.scraper_name,
          contentKey: row.content_key
        };

        if (this.isCacheValid(result.timestamp, result.success)) {
          validResults.push(result);
        } else {
          expiredScrapers.push(result.scraperId);
        }
      }

      // Track cache hits
      if (validResults.length > 0) {
        this.cacheHits++;
      } else {
        this.cacheMisses++;
      }

      logger.log(`[GlobalCache] Retrieved ${validResults.length} valid results, ${expiredScrapers.length} expired scrapers for ${contentKey}`);

      return {
        validResults,
        expiredScrapers,
        allExpired: validResults.length === 0
      };

    } catch (error) {
      logger.error('[GlobalCache] Error getting cached results:', error);
      this.cacheMisses++;
      return {
        validResults: [],
        expiredScrapers: [],
        allExpired: true
      };
    }
  }

  /**
   * Cache results for specific scrapers in global cache
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
      const contentKey = this.getContentKey(type, tmdbId, season, episode);
      const now = new Date().toISOString();

      // Prepare batch insert data
      const insertData = results.map(result => ({
        scraper_key: this.getScraperKey(contentKey, result.scraperId),
        content_key: contentKey,
        scraper_id: result.scraperId,
        scraper_name: result.scraperName,
        streams: result.streams || [],
        success: !result.error && result.streams !== null,
        error: result.error?.message || null,
        created_at: now,
        updated_at: now
      }));

      // Use upsert to handle duplicates
      const { error } = await supabase
        .from(this.TABLE_NAME)
        .upsert(insertData, { 
          onConflict: 'scraper_key',
          ignoreDuplicates: false 
        });

      if (error) {
        logger.error('[GlobalCache] Error caching results:', error);
      } else {
        logger.log(`[GlobalCache] Cached ${results.length} results for ${contentKey}`);
      }

    } catch (error) {
      logger.error('[GlobalCache] Error caching results:', error);
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
   * Get list of scrapers that need to be re-run (expired or not cached globally)
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
    
    // Return scrapers that are either expired or not cached globally
    const scrapersToRerun = availableScrapers
      .filter(scraper => 
        !validScraperIds.has(scraper.id) || expiredScraperIds.has(scraper.id)
      )
      .map(scraper => scraper.id);

    logger.log(`[GlobalCache] Scrapers to re-run: ${scrapersToRerun.join(', ')}`);
    
    return scrapersToRerun;
  }

  /**
   * Get all valid cached streams for content from global cache
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
   * Invalidate cache for specific content globally
   */
  async invalidateContent(
    type: string,
    tmdbId: string,
    season?: number,
    episode?: number
  ): Promise<void> {
    try {
      const contentKey = this.getContentKey(type, tmdbId, season, episode);
      
      const { error } = await supabase
        .from(this.TABLE_NAME)
        .delete()
        .eq('content_key', contentKey);

      if (error) {
        logger.error('[GlobalCache] Error invalidating cache:', error);
      } else {
        logger.log(`[GlobalCache] Invalidated global cache for ${contentKey}`);
      }
    } catch (error) {
      logger.error('[GlobalCache] Error invalidating cache:', error);
    }
  }

  /**
   * Invalidate cache for specific scraper across all content globally
   */
  async invalidateScraper(scraperId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from(this.TABLE_NAME)
        .delete()
        .eq('scraper_id', scraperId);

      if (error) {
        logger.error('[GlobalCache] Error invalidating scraper cache:', error);
      } else {
        logger.log(`[GlobalCache] Invalidated global cache for scraper ${scraperId}`);
      }
    } catch (error) {
      logger.error('[GlobalCache] Error invalidating scraper cache:', error);
    }
  }

  /**
   * Clear all cached results globally (admin function)
   */
  async clearAllCache(): Promise<void> {
    try {
      const { error } = await supabase
        .from(this.TABLE_NAME)
        .delete()
        .neq('id', 0); // Delete all rows

      if (error) {
        logger.error('[GlobalCache] Error clearing cache:', error);
      } else {
        logger.log('[GlobalCache] Cleared all global cache');
      }
    } catch (error) {
      logger.error('[GlobalCache] Error clearing cache:', error);
    }
  }

  /**
   * Clean up old cache entries (older than MAX_CACHE_AGE_MS)
   */
  async cleanupOldEntries(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.MAX_CACHE_AGE_MS).toISOString();
      
      const { error } = await supabase
        .from(this.TABLE_NAME)
        .delete()
        .lt('created_at', cutoffDate);

      if (error) {
        logger.error('[GlobalCache] Error cleaning up old entries:', error);
      } else {
        logger.log('[GlobalCache] Cleaned up old cache entries');
      }
    } catch (error) {
      logger.error('[GlobalCache] Error cleaning up old entries:', error);
    }
  }

  /**
   * Get global cache statistics
   */
  async getCacheStats(): Promise<GlobalCacheStats> {
    try {
      // Get total count
      const { count: totalEntries, error: countError } = await supabase
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact', head: true });

      if (countError) {
        logger.error('[GlobalCache] Error getting cache stats:', countError);
        return {
          totalEntries: 0,
          totalSize: 0,
          oldestEntry: null,
          newestEntry: null,
          hitRate: 0
        };
      }

      // Get oldest and newest entries
      const { data: oldestData } = await supabase
        .from(this.TABLE_NAME)
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

      const { data: newestData } = await supabase
        .from(this.TABLE_NAME)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

      const oldestEntry = oldestData?.[0] ? new Date(oldestData[0].created_at).getTime() : null;
      const newestEntry = newestData?.[0] ? new Date(newestData[0].created_at).getTime() : null;

      // Calculate hit rate
      const totalRequests = this.cacheHits + this.cacheMisses;
      const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;

      return {
        totalEntries: totalEntries || 0,
        totalSize: 0, // Size calculation would require additional queries
        oldestEntry,
        newestEntry,
        hitRate
      };
    } catch (error) {
      logger.error('[GlobalCache] Error getting cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null,
        hitRate: 0
      };
    }
  }

  /**
   * Reset cache hit/miss statistics
   */
  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get cache hit/miss statistics
   */
  getHitMissStats(): { hits: number; misses: number; hitRate: number } {
    const totalRequests = this.cacheHits + this.cacheMisses;
    const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;
    
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate
    };
  }
}

export const supabaseGlobalCacheService = SupabaseGlobalCacheService.getInstance();
export default supabaseGlobalCacheService;
