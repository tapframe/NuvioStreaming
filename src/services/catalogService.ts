import { stremioService, Meta, Manifest } from './stremioService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { TMDBService } from './tmdbService';
import { logger } from '../utils/logger';
import { getCatalogDisplayName } from '../utils/catalogNameUtils';

// Add a constant for storing the data source preference
const DATA_SOURCE_KEY = 'discover_data_source';

// Define data source types
export enum DataSource {
  STREMIO_ADDONS = 'stremio_addons',
  TMDB = 'tmdb',
}

export interface StreamingAddon {
  id: string;
  name: string;
  version: string;
  description: string;
  types: string[];
  catalogs: {
    type: string;
    id: string;
    name: string;
  }[];
  resources: {
    name: string;
    types: string[];
    idPrefixes?: string[];
  }[];
  transportUrl?: string;
  transportName?: string;
}

export interface StreamingContent {
  id: string;
  type: string;
  name: string;
  poster: string;
  posterShape?: string;
  banner?: string;
  logo?: string;
  imdbRating?: string;
  year?: number;
  genres?: string[];
  description?: string;
  runtime?: string;
  released?: string;
  trailerStreams?: any[];
  videos?: any[];
  inLibrary?: boolean;
  directors?: string[];
  creators?: string[];
  certification?: string;
}

export interface CatalogContent {
  addon: string;
  type: string;
  id: string;
  name: string;
  genre?: string;
  items: StreamingContent[];
}

const CATALOG_SETTINGS_KEY = 'catalog_settings';

class CatalogService {
  private static instance: CatalogService;
  private readonly LIBRARY_KEY = 'stremio-library';
  private readonly RECENT_CONTENT_KEY = 'stremio-recent-content';
  private library: Record<string, StreamingContent> = {};
  private recentContent: StreamingContent[] = [];
  private readonly MAX_RECENT_ITEMS = 20;
  private librarySubscribers: ((items: StreamingContent[]) => void)[] = [];

  private constructor() {
    this.loadLibrary();
    this.loadRecentContent();
  }

  static getInstance(): CatalogService {
    if (!CatalogService.instance) {
      CatalogService.instance = new CatalogService();
    }
    return CatalogService.instance;
  }

  private async loadLibrary(): Promise<void> {
    try {
      const storedLibrary = await AsyncStorage.getItem(this.LIBRARY_KEY);
      if (storedLibrary) {
        this.library = JSON.parse(storedLibrary);
      }
    } catch (error) {
      logger.error('Failed to load library:', error);
    }
  }

  private async saveLibrary(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.LIBRARY_KEY, JSON.stringify(this.library));
    } catch (error) {
      logger.error('Failed to save library:', error);
    }
  }

  private async loadRecentContent(): Promise<void> {
    try {
      const storedRecentContent = await AsyncStorage.getItem(this.RECENT_CONTENT_KEY);
      if (storedRecentContent) {
        this.recentContent = JSON.parse(storedRecentContent);
      }
    } catch (error) {
      logger.error('Failed to load recent content:', error);
    }
  }

  private async saveRecentContent(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.RECENT_CONTENT_KEY, JSON.stringify(this.recentContent));
    } catch (error) {
      logger.error('Failed to save recent content:', error);
    }
  }

  async getAllAddons(): Promise<StreamingAddon[]> {
    const addons = await stremioService.getInstalledAddonsAsync();
    return addons.map(addon => this.convertManifestToStreamingAddon(addon));
  }

  private convertManifestToStreamingAddon(manifest: Manifest): StreamingAddon {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      types: manifest.types || [],
      catalogs: manifest.catalogs || [],
      resources: manifest.resources || [],
      transportUrl: manifest.url,
      transportName: manifest.name
    };
  }

  async getHomeCatalogs(): Promise<CatalogContent[]> {
    const addons = await this.getAllAddons();
    const catalogs: CatalogContent[] = [];

    // Load enabled/disabled settings
    const catalogSettingsJson = await AsyncStorage.getItem(CATALOG_SETTINGS_KEY);
    const catalogSettings = catalogSettingsJson ? JSON.parse(catalogSettingsJson) : {};

    for (const addon of addons) {
      if (addon.catalogs) {
        for (const catalog of addon.catalogs) {
          const settingKey = `${addon.id}:${catalog.type}:${catalog.id}`;
          const isEnabled = catalogSettings[settingKey] ?? true;

          if (isEnabled) {
            try {
              const addonManifest = await stremioService.getInstalledAddonsAsync();
              const manifest = addonManifest.find(a => a.id === addon.id);
              if (!manifest) continue;

              const metas = await stremioService.getCatalog(manifest, catalog.type, catalog.id, 1);
              if (metas && metas.length > 0) {
                const items = metas.map(meta => this.convertMetaToStreamingContent(meta));
                
                // Get potentially custom display name
                let displayName = await getCatalogDisplayName(addon.id, catalog.type, catalog.id, catalog.name);
                
                // Remove duplicate words and clean up the name (case-insensitive)
                const words = displayName.split(' ');
                const uniqueWords = [];
                const seenWords = new Set();
                for (const word of words) {
                  const lowerWord = word.toLowerCase();
                  if (!seenWords.has(lowerWord)) {
                    uniqueWords.push(word); 
                    seenWords.add(lowerWord);
                  }
                }
                displayName = uniqueWords.join(' ');
                
                // Add content type if not present
                const contentType = catalog.type === 'movie' ? 'Movies' : 'TV Shows';
                if (!displayName.toLowerCase().includes(contentType.toLowerCase())) {
                  displayName = `${displayName} ${contentType}`;
                }
                
                catalogs.push({
                  addon: addon.id,
                  type: catalog.type,
                  id: catalog.id,
                  name: displayName,
                  items
                });
              }
            } catch (error) {
              logger.error(`Failed to get catalog ${catalog.id} for addon ${addon.id}:`, error);
            }
          }
        }
      }
    }

    return catalogs;
  }

  async getCatalogByType(type: string, genreFilter?: string): Promise<CatalogContent[]> {
    // Get the data source preference (default to Stremio addons)
    const dataSourcePreference = await this.getDataSourcePreference();
    
    // If TMDB is selected as the data source, use TMDB API
    if (dataSourcePreference === DataSource.TMDB) {
      return this.getCatalogByTypeFromTMDB(type, genreFilter);
    }
    
    // Otherwise use the original Stremio addons method
    const addons = await this.getAllAddons();
    const catalogs: CatalogContent[] = [];

    const typeAddons = addons.filter(addon => 
      addon.catalogs && addon.catalogs.some(catalog => catalog.type === type)
    );

    for (const addon of typeAddons) {
      const typeCatalogs = addon.catalogs.filter(catalog => catalog.type === type);

      for (const catalog of typeCatalogs) {
        try {
          const addonManifest = await stremioService.getInstalledAddonsAsync();
          const manifest = addonManifest.find(a => a.id === addon.id);
          if (!manifest) continue;

          const filters = genreFilter ? [{ title: 'genre', value: genreFilter }] : [];
          const metas = await stremioService.getCatalog(manifest, type, catalog.id, 1, filters);
          
          if (metas && metas.length > 0) {
            const items = metas.map(meta => this.convertMetaToStreamingContent(meta));
            
            // Get potentially custom display name
            const displayName = await getCatalogDisplayName(addon.id, catalog.type, catalog.id, catalog.name);
            
            catalogs.push({
              addon: addon.id,
              type,
              id: catalog.id,
              name: displayName,
              genre: genreFilter,
              items
            });
          }
        } catch (error) {
          logger.error(`Failed to get catalog ${catalog.id} for addon ${addon.id}:`, error);
        }
      }
    }

    return catalogs;
  }

  /**
   * Get catalog content from TMDB by type and genre
   */
  private async getCatalogByTypeFromTMDB(type: string, genreFilter?: string): Promise<CatalogContent[]> {
    const tmdbService = TMDBService.getInstance();
    const catalogs: CatalogContent[] = [];
    
    try {
      // Map Stremio content type to TMDB content type
      const tmdbType = type === 'movie' ? 'movie' : 'tv';
      
      // If no genre filter or All is selected, get multiple catalogs
      if (!genreFilter || genreFilter === 'All') {
        // Get trending
        const trendingItems = await tmdbService.getTrending(tmdbType, 'week');
        const trendingItemsPromises = trendingItems.map(item => this.convertTMDBToStreamingContent(item, tmdbType));
        const trendingStreamingItems = await Promise.all(trendingItemsPromises);
        
        catalogs.push({
          addon: 'tmdb',
          type,
          id: 'trending',
          name: `Trending ${type === 'movie' ? 'Movies' : 'TV Shows'}`,
          items: trendingStreamingItems
        });
        
        // Get popular
        const popularItems = await tmdbService.getPopular(tmdbType, 1);
        const popularItemsPromises = popularItems.map(item => this.convertTMDBToStreamingContent(item, tmdbType));
        const popularStreamingItems = await Promise.all(popularItemsPromises);
        
        catalogs.push({
          addon: 'tmdb',
          type,
          id: 'popular',
          name: `Popular ${type === 'movie' ? 'Movies' : 'TV Shows'}`,
          items: popularStreamingItems
        });
        
        // Get upcoming/on air
        const upcomingItems = await tmdbService.getUpcoming(tmdbType, 1);
        const upcomingItemsPromises = upcomingItems.map(item => this.convertTMDBToStreamingContent(item, tmdbType));
        const upcomingStreamingItems = await Promise.all(upcomingItemsPromises);
        
        catalogs.push({
          addon: 'tmdb',
          type,
          id: 'upcoming',
          name: type === 'movie' ? 'Upcoming Movies' : 'On Air TV Shows',
          items: upcomingStreamingItems
        });
      } else {
        // Get content by genre
        const genreItems = await tmdbService.discoverByGenre(tmdbType, genreFilter);
        const streamingItemsPromises = genreItems.map(item => this.convertTMDBToStreamingContent(item, tmdbType));
        const streamingItems = await Promise.all(streamingItemsPromises);
        
        catalogs.push({
          addon: 'tmdb',
          type,
          id: 'discover',
          name: `${genreFilter} ${type === 'movie' ? 'Movies' : 'TV Shows'}`,
          genre: genreFilter,
          items: streamingItems
        });
      }
    } catch (error) {
      logger.error(`Failed to get catalog from TMDB for type ${type}, genre ${genreFilter}:`, error);
    }
    
    return catalogs;
  }

  /**
   * Convert TMDB trending/discover result to StreamingContent format
   */
  private async convertTMDBToStreamingContent(item: any, type: 'movie' | 'tv'): Promise<StreamingContent> {
    const id = item.external_ids?.imdb_id || `tmdb:${item.id}`;
    const name = type === 'movie' ? item.title : item.name;
    const posterPath = item.poster_path;
    
    // Get genres from genre_ids
    let genres: string[] = [];
    if (item.genre_ids && item.genre_ids.length > 0) {
      try {
        const tmdbService = TMDBService.getInstance();
        const genreLists = type === 'movie' 
          ? await tmdbService.getMovieGenres() 
          : await tmdbService.getTvGenres();
        
        const genreIds: number[] = item.genre_ids;
        genres = genreIds
          .map(genreId => {
            const genre = genreLists.find(g => g.id === genreId);
            return genre ? genre.name : null;
          })
          .filter(Boolean) as string[];
      } catch (error) {
        logger.error('Failed to get genres for TMDB content:', error);
      }
    }
    
    return {
      id,
      type: type === 'movie' ? 'movie' : 'series',
      name: name || 'Unknown',
      poster: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : 'https://via.placeholder.com/300x450/cccccc/666666?text=No+Image',
      posterShape: 'poster',
      banner: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined,
      year: type === 'movie' 
        ? (item.release_date ? new Date(item.release_date).getFullYear() : undefined)
        : (item.first_air_date ? new Date(item.first_air_date).getFullYear() : undefined),
      description: item.overview,
      genres,
      inLibrary: this.library[`${type === 'movie' ? 'movie' : 'series'}:${id}`] !== undefined,
    };
  }

  /**
   * Get the current data source preference
   */
  async getDataSourcePreference(): Promise<DataSource> {
    try {
      const dataSource = await AsyncStorage.getItem(DATA_SOURCE_KEY);
      return dataSource as DataSource || DataSource.STREMIO_ADDONS;
    } catch (error) {
      logger.error('Failed to get data source preference:', error);
      return DataSource.STREMIO_ADDONS;
    }
  }

  /**
   * Set the data source preference
   */
  async setDataSourcePreference(dataSource: DataSource): Promise<void> {
    try {
      await AsyncStorage.setItem(DATA_SOURCE_KEY, dataSource);
    } catch (error) {
      logger.error('Failed to set data source preference:', error);
    }
  }

  async getContentDetails(type: string, id: string): Promise<StreamingContent | null> {
    try {
      // Try up to 3 times with increasing delays
      let meta = null;
      let lastError = null;
      
      for (let i = 0; i < 3; i++) {
        try {
          meta = await stremioService.getMetaDetails(type, id);
          if (meta) break;
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        } catch (error) {
          lastError = error;
          logger.error(`Attempt ${i + 1} failed to get content details for ${type}:${id}:`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
      }

      if (meta) {
        // Add to recent content
        const content = this.convertMetaToStreamingContent(meta);
        this.addToRecentContent(content);
        
        // Check if it's in the library
        content.inLibrary = this.library[`${type}:${id}`] !== undefined;
        
        return content;
      }

      if (lastError) {
        throw lastError;
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get content details for ${type}:${id}:`, error);
      return null;
    }
  }

  private convertMetaToStreamingContent(meta: Meta): StreamingContent {
    return {
      id: meta.id,
      type: meta.type,
      name: meta.name,
      poster: meta.poster || 'https://via.placeholder.com/300x450/cccccc/666666?text=No+Image',
      posterShape: 'poster',
      banner: meta.background,
      logo: `https://images.metahub.space/logo/medium/${meta.id}/img`,
      imdbRating: meta.imdbRating,
      year: meta.year,
      genres: meta.genres,
      description: meta.description,
      runtime: meta.runtime,
      inLibrary: this.library[`${meta.type}:${meta.id}`] !== undefined,
      certification: meta.certification
    };
  }

  private notifyLibrarySubscribers(): void {
    const items = Object.values(this.library);
    this.librarySubscribers.forEach(callback => callback(items));
  }

  public getLibraryItems(): StreamingContent[] {
    return Object.values(this.library);
  }

  public subscribeToLibraryUpdates(callback: (items: StreamingContent[]) => void): () => void {
    this.librarySubscribers.push(callback);
    // Initial callback with current items
    callback(this.getLibraryItems());
    
    // Return unsubscribe function
    return () => {
      const index = this.librarySubscribers.indexOf(callback);
      if (index > -1) {
        this.librarySubscribers.splice(index, 1);
      }
    };
  }

  public addToLibrary(content: StreamingContent): void {
    const key = `${content.type}:${content.id}`;
    this.library[key] = content;
    this.saveLibrary();
    this.notifyLibrarySubscribers();
  }

  public removeFromLibrary(type: string, id: string): void {
    const key = `${type}:${id}`;
    delete this.library[key];
    this.saveLibrary();
    this.notifyLibrarySubscribers();
  }

  private addToRecentContent(content: StreamingContent): void {
    // Remove if it already exists to prevent duplicates
    this.recentContent = this.recentContent.filter(item => 
      !(item.id === content.id && item.type === content.type)
    );
    
    // Add to the beginning of the array
    this.recentContent.unshift(content);
    
    // Trim the array if it exceeds the maximum
    if (this.recentContent.length > this.MAX_RECENT_ITEMS) {
      this.recentContent = this.recentContent.slice(0, this.MAX_RECENT_ITEMS);
    }
    
    this.saveRecentContent();
  }

  getRecentContent(): StreamingContent[] {
    return this.recentContent;
  }

  async searchContent(query: string): Promise<StreamingContent[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const addons = await this.getAllAddons();
    const results: StreamingContent[] = [];
    const searchPromises: Promise<void>[] = [];

    for (const addon of addons) {
      if (addon.catalogs && addon.catalogs.length > 0) {
        for (const catalog of addon.catalogs) {
          const addonManifest = await stremioService.getInstalledAddonsAsync();
          const manifest = addonManifest.find(a => a.id === addon.id);
          if (!manifest) continue;

          const searchPromise = (async () => {
            try {
              const filters = [{ title: 'search', value: query }];
              const metas = await stremioService.getCatalog(manifest, catalog.type, catalog.id, 1, filters);
              
              if (metas && metas.length > 0) {
                const items = metas.map(meta => this.convertMetaToStreamingContent(meta));
                results.push(...items);
              }
            } catch (error) {
              logger.error(`Search failed for ${catalog.id} in addon ${addon.id}:`, error);
            }
          })();
          
          searchPromises.push(searchPromise);
        }
      }
    }

    await Promise.all(searchPromises);

    // Remove duplicates based on id and type
    const uniqueResults = Array.from(
      new Map(results.map(item => [`${item.type}:${item.id}`, item])).values()
    );

    return uniqueResults;
  }

  async searchContentCinemeta(query: string): Promise<StreamingContent[]> {
    if (!query) {
      return [];
    }

    const trimmedQuery = query.trim().toLowerCase();
    logger.log('Searching Cinemeta for:', trimmedQuery);

    const addons = await this.getAllAddons();
    const results: StreamingContent[] = [];

    // Find Cinemeta addon by its ID
    const cinemeta = addons.find(addon => addon.id === 'com.linvo.cinemeta');
    
    if (!cinemeta || !cinemeta.catalogs) {
      logger.error('Cinemeta addon not found');
      return [];
    }

    // Search in both movie and series catalogs simultaneously
    const searchPromises = ['movie', 'series'].map(async (type) => {
      try {
        // Direct API call to Cinemeta
        const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(trimmedQuery)}.json`;
        logger.log('Request URL:', url);
        
        const response = await axios.get<{ metas: any[] }>(url);
        const metas = response.data.metas || [];
        
        if (metas && metas.length > 0) {
          const items = metas.map(meta => this.convertMetaToStreamingContent(meta));
          results.push(...items);
        }
      } catch (error) {
        logger.error(`Cinemeta search failed for ${type}:`, error);
      }
    });

    await Promise.all(searchPromises);

    // Remove duplicates while preserving order
    const seen = new Set();
    return results.filter(item => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async getStremioId(type: string, tmdbId: string): Promise<string | null> {
    try {
      // For movies, use the tt prefix with IMDb ID
      if (type === 'movie') {
        const tmdbService = TMDBService.getInstance();
        const movieDetails = await tmdbService.getMovieDetails(tmdbId);
        if (movieDetails?.imdb_id) {
          return movieDetails.imdb_id;
        }
      }
      // For TV shows, use the kitsu prefix
      else if (type === 'series') {
        return `kitsu:${tmdbId}`;
      }
      return null;
    } catch (error) {
      logger.error('Error getting Stremio ID:', error);
      return null;
    }
  }
}

export const catalogService = CatalogService.getInstance();
export default catalogService; 