import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CachedImage {
  url: string;
  localPath: string;
  timestamp: number;
  expiresAt: number;
}

interface PersistentCacheEntry {
  url: string;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

class ImageCacheService {
  private cache = new Map<string, CachedImage>();
  private persistentCache = new Map<string, PersistentCacheEntry>();
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days (longer cache)
  private readonly MAX_CACHE_SIZE = 200; // Increased cache size for better performance
  private readonly PERSISTENT_CACHE_KEY = 'image_cache_persistent';
  private isInitialized = false;

  /**
   * Initialize the persistent cache from storage
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(this.PERSISTENT_CACHE_KEY);
      if (stored) {
        const entries = JSON.parse(stored) as PersistentCacheEntry[];
        entries.forEach(entry => {
          this.persistentCache.set(entry.url, entry);
        });
        logger.log(`[ImageCache] Loaded ${entries.length} persistent cache entries`);
      }
      this.isInitialized = true;
    } catch (error) {
      logger.error('[ImageCache] Failed to load persistent cache:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Save persistent cache to storage
   */
  private async savePersistentCache(): Promise<void> {
    try {
      const entries = Array.from(this.persistentCache.values());
      await AsyncStorage.setItem(this.PERSISTENT_CACHE_KEY, JSON.stringify(entries));
    } catch (error) {
      logger.error('[ImageCache] Failed to save persistent cache:', error);
    }
  }

  /**
   * Get a cached image URL or cache the original if not present
   */
  public async getCachedImageUrl(originalUrl: string): Promise<string> {
    if (!originalUrl || originalUrl.includes('placeholder')) {
      return originalUrl; // Don't cache placeholder images
    }

    await this.initialize();

    // Check memory cache first (fastest)
    const cached = this.cache.get(originalUrl);
    if (cached && cached.expiresAt > Date.now()) {
      logger.log(`[ImageCache] Retrieved from memory cache: ${originalUrl}`);
      return cached.localPath;
    }

    // Check persistent cache
    const persistent = this.persistentCache.get(originalUrl);
    if (persistent && persistent.expiresAt > Date.now()) {
      // Update access stats
      persistent.accessCount++;
      persistent.lastAccessed = Date.now();
      
      // Add to memory cache for faster access
      const cachedImage: CachedImage = {
        url: originalUrl,
        localPath: originalUrl,
        timestamp: persistent.timestamp,
        expiresAt: persistent.expiresAt,
      };
      this.cache.set(originalUrl, cachedImage);
      
      logger.log(`[ImageCache] Retrieved from persistent cache: ${originalUrl}`);
      return originalUrl;
    }

    try {
      // Create new cache entry
      const now = Date.now();
      const expiresAt = now + this.CACHE_DURATION;
      
      const cachedImage: CachedImage = {
        url: originalUrl,
        localPath: originalUrl,
        timestamp: now,
        expiresAt,
      };

      const persistentEntry: PersistentCacheEntry = {
        url: originalUrl,
        timestamp: now,
        expiresAt,
        accessCount: 1,
        lastAccessed: now,
      };

      this.cache.set(originalUrl, cachedImage);
      this.persistentCache.set(originalUrl, persistentEntry);
      
      this.enforceMaxCacheSize();
      
      // Save persistent cache periodically (every 10 new entries)
      if (this.persistentCache.size % 10 === 0) {
        this.savePersistentCache();
      }

      logger.log(`[ImageCache] ✅ NEW CACHE ENTRY: ${originalUrl} (Memory: ${this.cache.size}, Persistent: ${this.persistentCache.size})`);
      return cachedImage.localPath;
    } catch (error) {
      logger.error('[ImageCache] Failed to cache image:', error);
      return originalUrl; // Fallback to original URL
    }
  }

  /**
   * Check if an image is cached
   */
  public async isCached(url: string): Promise<boolean> {
    await this.initialize();
    
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return true;
    }
    
    const persistent = this.persistentCache.get(url);
    return persistent !== undefined && persistent.expiresAt > Date.now();
  }

  /**
   * Log cache status (for debugging)
   */
  public async logCacheStatus(): Promise<void> {
    await this.initialize();
    
    const memoryStats = this.getCacheStats();
    const persistentCount = this.persistentCache.size;
    const persistentExpired = Array.from(this.persistentCache.values())
      .filter(entry => entry.expiresAt <= Date.now()).length;
    
    logger.log(`[ImageCache] 📊 Memory Cache: ${memoryStats.size} total, ${memoryStats.expired} expired`);
    logger.log(`[ImageCache] 📊 Persistent Cache: ${persistentCount} total, ${persistentExpired} expired`);
    
    // Log most accessed images
    const topImages = Array.from(this.persistentCache.entries())
      .sort(([, a], [, b]) => b.accessCount - a.accessCount)
      .slice(0, 5);
    
    topImages.forEach(([url, entry]) => {
      logger.log(`[ImageCache] 🔥 Popular: ${url.substring(0, 60)}... (${entry.accessCount} accesses)`);
    });
  }

  /**
   * Clear expired cache entries
   */
  public async clearExpiredCache(): Promise<void> {
    await this.initialize();
    
    const now = Date.now();
    let removedMemory = 0;
    let removedPersistent = 0;
    
    // Clear memory cache
    for (const [url, cached] of this.cache.entries()) {
      if (cached.expiresAt <= now) {
        this.cache.delete(url);
        removedMemory++;
      }
    }
    
    // Clear persistent cache
    for (const [url, entry] of this.persistentCache.entries()) {
      if (entry.expiresAt <= now) {
        this.persistentCache.delete(url);
        removedPersistent++;
      }
    }
    
    if (removedPersistent > 0) {
      await this.savePersistentCache();
    }
    
    logger.log(`[ImageCache] Cleared ${removedMemory} memory entries, ${removedPersistent} persistent entries`);
  }

  /**
   * Clear all cached images
   */
  public async clearAllCache(): Promise<void> {
    this.cache.clear();
    this.persistentCache.clear();
    await AsyncStorage.removeItem(this.PERSISTENT_CACHE_KEY);
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
   * Enforce maximum cache size by removing oldest/least accessed entries
   */
  private enforceMaxCacheSize(): void {
    // Enforce memory cache limit
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const toRemove = this.cache.size - this.MAX_CACHE_SIZE;
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }

      logger.log(`[ImageCache] Removed ${toRemove} old memory entries to enforce cache size limit`);
    }
    
    // Enforce persistent cache limit (larger limit)
    const persistentLimit = this.MAX_CACHE_SIZE * 3;
    if (this.persistentCache.size > persistentLimit) {
      // Remove least recently accessed entries
      const entries = Array.from(this.persistentCache.entries()).sort(
        (a, b) => a[1].lastAccessed - b[1].lastAccessed
      );

      const toRemove = this.persistentCache.size - persistentLimit;
      for (let i = 0; i < toRemove; i++) {
        this.persistentCache.delete(entries[i][0]);
      }

      this.savePersistentCache();
      logger.log(`[ImageCache] Removed ${toRemove} old persistent entries to enforce cache size limit`);
    }
  }
}

export const imageCacheService = new ImageCacheService(); 
