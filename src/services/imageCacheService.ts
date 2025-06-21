import { logger } from '../utils/logger';

interface CachedImage {
  url: string;
  localPath: string;
  timestamp: number;
  expiresAt: number;
}

class ImageCacheService {
  private cache = new Map<string, CachedImage>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 100; // Maximum number of cached images

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
      logger.log(`[ImageCache] Retrieved from cache: ${originalUrl}`);
      return cached.localPath;
    }

    try {
      // For now, return the original URL but mark it as cached
      // In a production app, you would implement actual local caching here
      const cachedImage: CachedImage = {
        url: originalUrl,
        localPath: originalUrl, // In production, this would be a local file path
        timestamp: Date.now(),
        expiresAt: Date.now() + this.CACHE_DURATION,
      };

      this.cache.set(originalUrl, cachedImage);
      this.enforceMaxCacheSize();

      logger.log(`[ImageCache] ✅ NEW CACHE ENTRY: ${originalUrl} (Cache size: ${this.cache.size})`);
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
}

export const imageCacheService = new ImageCacheService(); 