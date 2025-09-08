import { logger } from '../utils/logger';
import { Image as ExpoImage } from 'expo-image';

interface CachedImage {
  url: string;
  localPath: string;
  timestamp: number;
  expiresAt: number;
  size?: number; // Track approximate memory usage
  accessCount: number; // Track usage frequency
  lastAccessed: number; // Track last access time
}

class ImageCacheService {
  private cache = new Map<string, CachedImage>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 100; // Increased maximum number of cached images
  private readonly MAX_MEMORY_MB = 150; // Increased maximum memory usage in MB
  private currentMemoryUsage = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval every 30 minutes (less churn)
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 30 * 60 * 1000);
  }

  /**
   * Get a cached image URL or cache the original if not present
   */
  public async getCachedImageUrl(originalUrl: string): Promise<string> {
    if (!originalUrl || originalUrl.includes('placeholder')) {
      return originalUrl; // Don't cache placeholder images
    }

    // Check if we have a valid cached version
    const cached = this.cache.get(originalUrl);
    if (cached && cached.expiresAt > Date.now()) {
      // Update access tracking
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      // Skip verbose logging to reduce CPU load
      return cached.localPath;
    }

    // Check memory pressure before adding new entries (more lenient)
    if (this.cache.size >= this.MAX_CACHE_SIZE * 0.95) {
      // Skip verbose logging to reduce CPU load
      return originalUrl;
    }

    try {
      // Estimate image size (rough approximation)
      const estimatedSize = this.estimateImageSize(originalUrl);

      const cachedImage: CachedImage = {
        url: originalUrl,
        localPath: originalUrl, // In production, this would be a local file path
        timestamp: Date.now(),
        expiresAt: Date.now() + this.CACHE_DURATION,
        size: estimatedSize,
        accessCount: 1,
        lastAccessed: Date.now()
      };

      this.cache.set(originalUrl, cachedImage);
      this.currentMemoryUsage += estimatedSize;
      this.enforceMemoryLimits();

      // Skip verbose logging to reduce CPU load
      return cachedImage.localPath;
    } catch (error) {
      logger.error('[ImageCache] Failed to cache image:', error);
      return originalUrl; // Fallback to original URL
    }
  }

  /**
   * Check if an image is cached
   */
  public isCached(url: string): boolean {
    const cached = this.cache.get(url);
    return cached !== undefined && cached.expiresAt > Date.now();
  }

  /**
   * Log cache status (for debugging)
   */
  public logCacheStatus(): void {
    const stats = this.getCacheStats();
    logger.log(`[ImageCache] 📊 Cache Status: ${stats.size} total, ${stats.expired} expired`);

    // Log first 5 cached URLs for debugging
    const entries = Array.from(this.cache.entries()).slice(0, 5);
    entries.forEach(([url, cached]) => {
      const isExpired = cached.expiresAt <= Date.now();
      const timeLeft = Math.max(0, cached.expiresAt - Date.now()) / 1000 / 60; // minutes
      logger.log(`[ImageCache] - ${url.substring(0, 60)}... (${isExpired ? 'EXPIRED' : `${timeLeft.toFixed(1)}m left`})`);
    });
  }

  /**
   * Clear expired cache entries
   */
  public clearExpiredCache(): void {
    const now = Date.now();
    for (const [url, cached] of this.cache.entries()) {
      if (cached.expiresAt <= now) {
        this.cache.delete(url);
      }
    }
  }

  /**
   * Clear all cached images
   */
  public clearAllCache(): void {
    this.cache.clear();
    logger.log('[ImageCache] Cleared all cached images');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; expired: number } {
    const now = Date.now();
    let expired = 0;

    for (const cached of this.cache.values()) {
      if (cached.expiresAt <= now) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      expired,
    };
  }

  /**
   * Enforce maximum cache size by removing oldest entries
   */
  private enforceMaxCacheSize(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) {
      return;
    }

    // Convert to array and sort by timestamp (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    // Remove oldest entries
    const toRemove = this.cache.size - this.MAX_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    logger.log(`[ImageCache] Removed ${toRemove} old entries to enforce cache size limit`);
  }

  /**
   * Enforce memory limits using LRU eviction
   */
  private enforceMemoryLimits(): void {
    const maxMemoryBytes = this.MAX_MEMORY_MB * 1024 * 1024;

    if (this.currentMemoryUsage <= maxMemoryBytes) {
      return;
    }

    // Sort by access frequency and recency (LRU)
    const entries = Array.from(this.cache.entries()).sort((a, b) => {
      const scoreA = a[1].accessCount * 0.3 + (Date.now() - a[1].lastAccessed) * 0.7;
      const scoreB = b[1].accessCount * 0.3 + (Date.now() - b[1].lastAccessed) * 0.7;
      return scoreB - scoreA; // Higher score = more likely to be evicted
    });

    let removedCount = 0;
    for (const [url, cached] of entries) {
      if (this.currentMemoryUsage <= maxMemoryBytes * 0.8) { // Leave 20% buffer
        break;
      }

      this.cache.delete(url);
      this.currentMemoryUsage -= cached.size || 0;
      removedCount++;
    }

    // Skip verbose memory eviction logging to reduce CPU load
  }

  /**
   * Estimate image size based on URL patterns
   */
  private estimateImageSize(url: string): number {
    // Rough estimates in bytes based on common image types
    if (url.includes('poster')) return 150 * 1024; // 150KB for posters
    if (url.includes('banner') || url.includes('backdrop')) return 300 * 1024; // 300KB for banners
    if (url.includes('logo')) return 50 * 1024; // 50KB for logos
    if (url.includes('thumb')) return 75 * 1024; // 75KB for thumbnails
    return 200 * 1024; // Default 200KB
  }

  /**
   * Check if we should skip caching due to memory pressure
   */
  private shouldSkipCaching(): boolean {
    const maxMemoryBytes = this.MAX_MEMORY_MB * 1024 * 1024;
    return this.currentMemoryUsage > maxMemoryBytes * 0.9 || this.cache.size >= this.MAX_CACHE_SIZE;
  }

  /**
   * Perform comprehensive cleanup
   */
  private performCleanup(): void {
    const initialSize = this.cache.size;
    const initialMemory = this.currentMemoryUsage;

    // Remove expired entries
    this.clearExpiredCache();

    // Recalculate memory usage
    this.recalculateMemoryUsage();

    // Enforce limits
    this.enforceMemoryLimits();
    this.enforceMaxCacheSize();

    // Avoid clearing Expo's global memory cache to prevent re-decode churn

    const finalSize = this.cache.size;
    const finalMemory = this.currentMemoryUsage;

    // Skip verbose cleanup logging to reduce CPU load
  }

  /**
   * Recalculate memory usage from cache entries
   */
  private recalculateMemoryUsage(): void {
    this.currentMemoryUsage = 0;
    for (const cached of this.cache.values()) {
      this.currentMemoryUsage += cached.size || 0;
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAllCache();
  }
}

export const imageCacheService = new ImageCacheService(); 