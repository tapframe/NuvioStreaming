import { StreamingContent } from './catalogService';
import { GroupedStreams } from '../types/streams';
import { TMDBEpisode } from './tmdbService';
import { Cast } from '../types/cast';

interface CachedContent {
  metadata: StreamingContent;
  streams?: GroupedStreams;
  episodes?: TMDBEpisode[];
  cast?: Cast[];
  episodeStreams?: { [episodeId: string]: GroupedStreams };
  timestamp: number;
}

class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CachedContent> = new Map();
  private metadataScreenCache: Map<string, any> = new Map();
  private readonly MAX_METADATA_SCREENS = 5;
  private readonly MAX_CACHE_SIZE = 100; // Max size for the main cache
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for main cache items

  private constructor() {
    // Initialize any other necessary properties
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  public getCacheKey(id: string, type: string): string {
    return `${type}:${id}`;
  }

  // Helper to ensure the main cache does not exceed its size limit
  private ensureCacheLimit(): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove the least recently used item (first key in Map iteration order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  // Helper to mark an item as recently used (by deleting and re-inserting)
  // Also ensures the timestamp is updated.
  private touch(key: string, existingData: CachedContent): void {
    this.cache.delete(key);
    this.cache.set(key, { ...existingData, timestamp: Date.now() });
  }

  public setMetadata(id: string, type: string, metadata: StreamingContent): void {
    const key = this.getCacheKey(id, type);
    let existing = this.cache.get(key);

    if (existing) {
        // Update existing entry and mark as recent
        existing = { ...existing, metadata, timestamp: Date.now() };
        this.touch(key, existing);
    } else {
        // Adding a new entry, first check limit
        this.ensureCacheLimit();
        // Add the new entry
        this.cache.set(key, {
            metadata,
            timestamp: Date.now()
        } as CachedContent);
    }
  }

  public setStreams(id: string, type: string, streams: GroupedStreams): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    // Can only set streams if metadata already exists in cache
    if (!existing?.metadata) return; 

    const updatedData = {
      ...existing,
      streams,
      timestamp: Date.now() // Update timestamp on modification
    };
    this.touch(key, updatedData); // Mark as recently used
  }

  public setEpisodes(id: string, type: string, episodes: TMDBEpisode[]): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    if (!existing?.metadata) return;

    const updatedData = {
      ...existing,
      episodes,
      timestamp: Date.now()
    };
     this.touch(key, updatedData);
  }

  public setCast(id: string, type: string, cast: Cast[]): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    if (!existing?.metadata) return;

     const updatedData = {
      ...existing,
      cast,
      timestamp: Date.now()
    };
    this.touch(key, updatedData);
  }

  public setEpisodeStreams(id: string, type: string, episodeId: string, streams: GroupedStreams): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    if (!existing?.metadata) return;

    const updatedData = {
      ...existing,
      episodeStreams: {
        ...(existing.episodeStreams || {}),
        [episodeId]: streams
      },
      timestamp: Date.now()
    };
    this.touch(key, updatedData);
  }

  // --- Getters for the main cache ---

  public getMetadata(id: string, type: string): StreamingContent | null {
    const key = this.getCacheKey(id, type);
    const data = this.cache.get(key);
    if (data) {
      // Check for expiration first
      if (Date.now() - data.timestamp > this.CACHE_TTL_MS) {
        this.cache.delete(key); // Remove expired item
        return null;
      }
      // Not expired, proceed with LRU update
      this.touch(key, data); // Mark as recently used on access
      return data.metadata;
    }
    return null;
  }

  public getStreams(id: string, type: string): GroupedStreams | null {
    const key = this.getCacheKey(id, type);
    const data = this.cache.get(key);
     if (data) {
      // Check for expiration first
      if (Date.now() - data.timestamp > this.CACHE_TTL_MS) {
        this.cache.delete(key); // Remove expired item
        return null;
      }
      // Not expired, proceed with LRU update
      this.touch(key, data); // Mark as recently used on access
      return data.streams || null;
    }
    return null;
  }

  public getEpisodes(id: string, type: string): TMDBEpisode[] | null {
    const key = this.getCacheKey(id, type);
    const data = this.cache.get(key);
    if (data) {
      // Check for expiration first
      if (Date.now() - data.timestamp > this.CACHE_TTL_MS) {
        this.cache.delete(key); // Remove expired item
        return null;
      }
      // Not expired, proceed with LRU update
      this.touch(key, data); // Mark as recently used on access
      return data.episodes || null;
    }
    return null;
  }

  public getCast(id: string, type: string): Cast[] | null {
    const key = this.getCacheKey(id, type);
    const data = this.cache.get(key);
     if (data) {
      // Check for expiration first
      if (Date.now() - data.timestamp > this.CACHE_TTL_MS) {
        this.cache.delete(key); // Remove expired item
        return null;
      }
      // Not expired, proceed with LRU update
      this.touch(key, data); // Mark as recently used on access
      return data.cast || null;
    }
    return null;
  }

  public getEpisodeStreams(id: string, type: string, episodeId: string): GroupedStreams | null {
    const key = this.getCacheKey(id, type);
    const data = this.cache.get(key);
     if (data) {
        // Check for expiration first
        if (Date.now() - data.timestamp > this.CACHE_TTL_MS) {
          this.cache.delete(key); // Remove expired item
          return null;
        }
        // Not expired, check if episode stream exists and proceed with LRU update
        if (data.episodeStreams?.[episodeId]) {
            this.touch(key, data); // Mark as recently used on access
            return data.episodeStreams[episodeId];
        }
    }
    return null;
  }

  // --- Cache utility methods ---

  public clearCache(): void {
    this.cache.clear();
  }

  // Checks existence without affecting LRU order
  public isCached(id: string, type: string): boolean {
    const key = this.getCacheKey(id, type);
    return this.cache.has(key);
  }

  // --- Metadata Screen Cache (Separate LRU logic) ---

  public cacheMetadataScreen(id: string, type: string, data: any) {
    if (!id || !type) return;

    const key = `${type}:${id}`;

    // If this item is already in cache, delete to re-insert at the end (most recent)
    if (this.metadataScreenCache.has(key)) {
      this.metadataScreenCache.delete(key);
    }
    // If we've reached the limit, remove the oldest item (first key)
    else if (this.metadataScreenCache.size >= this.MAX_METADATA_SCREENS) {
      const firstKey = this.metadataScreenCache.keys().next().value;
      if (firstKey) {
        this.metadataScreenCache.delete(firstKey);
      }
    }

    // Add the new/updated item (makes it the most recent)
    this.metadataScreenCache.set(key, data);
  }

  public getMetadataScreen(id: string, type: string) {
    const key = `${type}:${id}`;
    const data = this.metadataScreenCache.get(key);
    // If found, mark as recently used by re-inserting
    if (data) {
        this.metadataScreenCache.delete(key);
        this.metadataScreenCache.set(key, data);
    }
    return data;
  }

  public clearMetadataScreenCache() {
    this.metadataScreenCache.clear();
  }
}

export const cacheService = CacheService.getInstance(); 