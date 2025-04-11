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

  public setMetadata(id: string, type: string, metadata: StreamingContent): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    this.cache.set(key, {
      ...(existing || {}),
      metadata,
      timestamp: Date.now()
    } as CachedContent);
  }

  public setStreams(id: string, type: string, streams: GroupedStreams): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    if (!existing?.metadata) return;
    
    this.cache.set(key, {
      ...existing,
      streams,
      timestamp: Date.now()
    });
  }

  public setEpisodes(id: string, type: string, episodes: TMDBEpisode[]): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    if (!existing?.metadata) return;
    
    this.cache.set(key, {
      ...existing,
      episodes,
      timestamp: Date.now()
    });
  }

  public setCast(id: string, type: string, cast: Cast[]): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    if (!existing?.metadata) return;
    
    this.cache.set(key, {
      ...existing,
      cast,
      timestamp: Date.now()
    });
  }

  public setEpisodeStreams(id: string, type: string, episodeId: string, streams: GroupedStreams): void {
    const key = this.getCacheKey(id, type);
    const existing = this.cache.get(key);
    if (!existing?.metadata) return;
    
    this.cache.set(key, {
      ...existing,
      episodeStreams: {
        ...(existing.episodeStreams || {}),
        [episodeId]: streams
      },
      timestamp: Date.now()
    });
  }

  public getMetadata(id: string, type: string): StreamingContent | null {
    const key = this.getCacheKey(id, type);
    return this.cache.get(key)?.metadata || null;
  }

  public getStreams(id: string, type: string): GroupedStreams | null {
    const key = this.getCacheKey(id, type);
    return this.cache.get(key)?.streams || null;
  }

  public getEpisodes(id: string, type: string): TMDBEpisode[] | null {
    const key = this.getCacheKey(id, type);
    return this.cache.get(key)?.episodes || null;
  }

  public getCast(id: string, type: string): Cast[] | null {
    const key = this.getCacheKey(id, type);
    return this.cache.get(key)?.cast || null;
  }

  public getEpisodeStreams(id: string, type: string, episodeId: string): GroupedStreams | null {
    const key = this.getCacheKey(id, type);
    return this.cache.get(key)?.episodeStreams?.[episodeId] || null;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public isCached(id: string, type: string): boolean {
    const key = this.getCacheKey(id, type);
    return this.cache.has(key);
  }

  public cacheMetadataScreen(id: string, type: string, data: any) {
    const key = `${type}:${id}`;
    
    // If this item is already in cache, just update it
    if (this.metadataScreenCache.has(key)) {
      this.metadataScreenCache.delete(key);
      this.metadataScreenCache.set(key, data);
      return;
    }

    // If we've reached the limit, remove the oldest item
    if (this.metadataScreenCache.size >= this.MAX_METADATA_SCREENS) {
      const firstKey = this.metadataScreenCache.keys().next().value;
      this.metadataScreenCache.delete(firstKey);
    }

    // Add the new item
    this.metadataScreenCache.set(key, data);
  }

  public getMetadataScreen(id: string, type: string) {
    const key = `${type}:${id}`;
    return this.metadataScreenCache.get(key);
  }

  public clearMetadataScreenCache() {
    this.metadataScreenCache.clear();
  }
}

export const cacheService = CacheService.getInstance(); 