import { stremioService, Meta, Manifest } from './stremioService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { TMDBService } from './tmdbService';

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
}

export interface CatalogContent {
  addon: string;
  type: string;
  id: string;
  name: string;
  genre?: string;
  items: StreamingContent[];
}

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
      console.error('Failed to load library:', error);
    }
  }

  private async saveLibrary(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.LIBRARY_KEY, JSON.stringify(this.library));
    } catch (error) {
      console.error('Failed to save library:', error);
    }
  }

  private async loadRecentContent(): Promise<void> {
    try {
      const storedRecentContent = await AsyncStorage.getItem(this.RECENT_CONTENT_KEY);
      if (storedRecentContent) {
        this.recentContent = JSON.parse(storedRecentContent);
      }
    } catch (error) {
      console.error('Failed to load recent content:', error);
    }
  }

  private async saveRecentContent(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.RECENT_CONTENT_KEY, JSON.stringify(this.recentContent));
    } catch (error) {
      console.error('Failed to save recent content:', error);
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

    // Get saved catalog settings
    const savedSettings = await AsyncStorage.getItem('catalog_settings');
    const catalogSettings: { [key: string]: boolean } = savedSettings ? JSON.parse(savedSettings) : {};

    // Get featured catalogs
    for (const addon of addons) {
      if (addon.catalogs && addon.catalogs.length > 0) {
        // For each catalog, check if it's enabled in settings
        for (const catalog of addon.catalogs) {
          const settingKey = `${addon.id}:${catalog.type}:${catalog.id}`;
          // If setting doesn't exist, default to true for backward compatibility
          const isEnabled = catalogSettings[settingKey] ?? true;

          if (isEnabled) {
            try {
              // Get the items for this catalog
              const addonManifest = await stremioService.getInstalledAddonsAsync();
              const manifest = addonManifest.find(a => a.id === addon.id);
              if (!manifest) continue;

              const metas = await stremioService.getCatalog(manifest, catalog.type, catalog.id, 1);
              if (metas && metas.length > 0) {
                // Convert Meta to StreamingContent
                const items = metas.map(meta => this.convertMetaToStreamingContent(meta));
                
                // Format the catalog name
                let displayName = catalog.name;
                
                // Remove duplicate words and clean up the name (case-insensitive)
                const words = displayName.split(' ');
                const uniqueWords = [];
                const seenWords = new Set();
                
                for (const word of words) {
                  const lowerWord = word.toLowerCase();
                  if (!seenWords.has(lowerWord)) {
                    uniqueWords.push(word); // Keep original case
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
              console.error(`Failed to get catalog ${catalog.id} for addon ${addon.id}:`, error);
            }
          }
        }
      }
    }

    return catalogs;
  }

  async getCatalogByType(type: string, genreFilter?: string): Promise<CatalogContent[]> {
    const addons = await this.getAllAddons();
    const catalogs: CatalogContent[] = [];

    // Filter addons with catalogs of the specified type
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

          // Apply genre filter if provided
          const filters = genreFilter ? [{ title: 'genre', value: genreFilter }] : [];
          const metas = await stremioService.getCatalog(manifest, type, catalog.id, 1, filters);
          
          if (metas && metas.length > 0) {
            const items = metas.map(meta => this.convertMetaToStreamingContent(meta));
            
            catalogs.push({
              addon: addon.id,
              type,
              id: catalog.id,
              name: catalog.name,
              genre: genreFilter,
              items
            });
          }
        } catch (error) {
          console.error(`Failed to get catalog ${catalog.id} for addon ${addon.id}:`, error);
        }
      }
    }

    return catalogs;
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
          console.error(`Attempt ${i + 1} failed to get content details for ${type}:${id}:`, error);
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
      console.error(`Failed to get content details for ${type}:${id}:`, error);
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
      inLibrary: this.library[`${meta.type}:${meta.id}`] !== undefined
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
              console.error(`Search failed for ${catalog.id} in addon ${addon.id}:`, error);
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
    if (!query || query.trim().length < 2) {
      return [];
    }

    const trimmedQuery = query.trim();
    console.log('Searching Cinemeta for:', trimmedQuery);

    const addons = await this.getAllAddons();
    const results: StreamingContent[] = [];

    // Find Cinemeta addon by its ID
    const cinemeta = addons.find(addon => addon.id === 'com.linvo.cinemeta');
    
    if (!cinemeta || !cinemeta.catalogs) {
      console.error('Cinemeta addon not found. Available addons:', addons.map(a => ({ id: a.id, url: a.transportUrl })));
      return [];
    }

    console.log('Found Cinemeta addon:', cinemeta.id);

    // Search in both movie and series catalogs simultaneously
    const searchPromises = ['movie', 'series'].map(async (type) => {
      try {
        console.log(`Searching ${type} catalog with query:`, trimmedQuery);
        
        // Direct API call to Cinemeta
        const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(trimmedQuery)}.json`;
        console.log('Request URL:', url);
        
        const response = await axios.get<{ metas: Meta[] }>(url);
        const metas = response.data.metas || [];
        
        console.log(`Found ${metas.length} results for ${type}`);
        
        if (metas && metas.length > 0) {
          const items = metas.map(meta => this.convertMetaToStreamingContent(meta));
          results.push(...items);
        }
      } catch (error) {
        console.error(`Cinemeta search failed for ${type}:`, error);
      }
    });

    await Promise.all(searchPromises);

    console.log('Total results found:', results.length);

    // Sort results by name and ensure uniqueness
    const uniqueResults = Array.from(
      new Map(results.map(item => [`${item.type}:${item.id}`, item])).values()
    );
    uniqueResults.sort((a, b) => a.name.localeCompare(b.name));

    return uniqueResults;
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
      console.error('Error getting Stremio ID:', error);
      return null;
    }
  }
}

export const catalogService = CatalogService.getInstance();
export default catalogService; 