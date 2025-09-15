import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import EventEmitter from 'eventemitter3';
import { localScraperService } from './localScraperService';
import { DEFAULT_SETTINGS, AppSettings } from '../hooks/useSettings';
import { TMDBService } from './tmdbService';

// Create an event emitter for addon changes
export const addonEmitter = new EventEmitter();
export const ADDON_EVENTS = {
  ORDER_CHANGED: 'order_changed',
  ADDON_ADDED: 'addon_added',
  ADDON_REMOVED: 'addon_removed'
};

// Basic types for Stremio
export interface Meta {
  id: string;
  type: string;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  year?: number;
  genres?: string[];
  runtime?: string;
  cast?: string[];
  director?: string | string[];
  writer?: string | string[];
  certification?: string;
  // Extended fields available from some addons
  country?: string;
  imdb_id?: string;
  slug?: string;
  released?: string;
  trailerStreams?: Array<{
    title: string;
    ytId: string;
  }>;
  links?: Array<{
    name: string;
    category: string;
    url: string;
  }>;
  behaviorHints?: {
    defaultVideoId?: string;
    hasScheduledVideos?: boolean;
    [key: string]: any;
  };
  app_extras?: {
    cast?: Array<{
      name: string;
      character?: string;
      photo?: string;
    }>;
  };
}

export interface Subtitle {
  id: string;
  url: string;
  lang: string;
  fps?: number;
  addon?: string;
  addonName?: string;
}

export interface Stream {
  name?: string;
  title?: string;
  url: string;
  addon?: string;
  addonId?: string;
  addonName?: string;
  description?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    [key: string]: any;
  };
  size?: number;
  isFree?: boolean;
  isDebrid?: boolean;
}

export interface StreamResponse {
  streams: Stream[];
  addon: string;
  addonName: string;
}

export interface SubtitleResponse {
  subtitles: Subtitle[];
  addon: string;
  addonName: string;
}

// Modify the callback signature to include addon ID
interface StreamCallback {
  (streams: Stream[] | null, addonId: string | null, addonName: string | null, error: Error | null): void;
}

interface CatalogFilter {
  title: string;
  value: any;
}

interface Catalog {
  type: string;
  id: string;
  name: string;
  extraSupported?: string[];
  extraRequired?: string[];
  itemCount?: number;
}

interface ResourceObject {
  name: string;
  types: string[];
  idPrefixes?: string[];
  idPrefix?: string[];
}

export interface Manifest {
  id: string;
  name: string;
  version: string;
  description: string;
  url?: string;
  originalUrl?: string;
  catalogs?: Catalog[];
  resources?: ResourceObject[];
  types?: string[];
  idPrefixes?: string[];
  manifestVersion?: string;
  queryParams?: string;
  behaviorHints?: {
    configurable?: boolean;
  };
}

export interface MetaDetails extends Meta {
  videos?: {
    id: string;
    title: string;
    released: string;
    season?: number;
    episode?: number;
  }[];
}

export interface AddonCapabilities {
  name: string;
  id: string;
  version: string;
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
  types: string[];
}

class StremioService {
  private static instance: StremioService;
  private installedAddons: Map<string, Manifest> = new Map();
  private addonOrder: string[] = [];
  private readonly STORAGE_KEY = 'stremio-addons';
  private readonly ADDON_ORDER_KEY = 'stremio-addon-order';
  private readonly MAX_CONCURRENT_REQUESTS = 3;
  private readonly DEFAULT_PAGE_SIZE = 50;
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    // Start initialization but don't wait for it
    this.initializationPromise = this.initialize();
  }

  static getInstance(): StremioService {
    if (!StremioService.instance) {
      StremioService.instance = new StremioService();
    }
    return StremioService.instance;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      // Prefer scoped storage, but fall back to legacy keys to preserve older installs
      let storedAddons = await AsyncStorage.getItem(`@user:${scope}:${this.STORAGE_KEY}`);
      if (!storedAddons) storedAddons = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!storedAddons) storedAddons = await AsyncStorage.getItem(`@user:local:${this.STORAGE_KEY}`);
      
      if (storedAddons) {
        const parsed = JSON.parse(storedAddons);
        
        // Convert to Map
        this.installedAddons = new Map();
        for (const addon of parsed) {
          if (addon && addon.id) {
            this.installedAddons.set(addon.id, addon);
          }
        }
      }
      
      // Ensure Cinemeta is always installed as a pre-installed addon
      const cinemetaId = 'com.linvo.cinemeta';
      if (!this.installedAddons.has(cinemetaId)) {
        try {
          const cinemetaManifest = await this.getManifest('https://v3-cinemeta.strem.io/manifest.json');
          this.installedAddons.set(cinemetaId, cinemetaManifest);
        } catch (error) {
          // Fallback to minimal manifest if fetch fails
          const fallbackManifest: Manifest = {
            id: cinemetaId,
            name: 'Cinemeta',
            version: '3.0.13',
            description: 'Provides metadata for movies and series from TheTVDB, TheMovieDB, etc.',
            url: 'https://v3-cinemeta.strem.io',
            originalUrl: 'https://v3-cinemeta.strem.io/manifest.json',
            types: ['movie', 'series'],
            catalogs: [
              {
                type: 'movie',
                id: 'top',
                name: 'Popular',
                extraSupported: ['search', 'genre', 'skip']
              },
              {
                type: 'series',
                id: 'top',
                name: 'Popular',
                extraSupported: ['search', 'genre', 'skip']
              }
            ],
            resources: [
              {
                name: 'catalog',
                types: ['movie', 'series'],
                idPrefixes: ['tt']
              },
              {
                name: 'meta',
                types: ['movie', 'series'],
                idPrefixes: ['tt']
              }
            ],
            behaviorHints: {
              configurable: false
            }
          };
          this.installedAddons.set(cinemetaId, fallbackManifest);
        }
      }

      // Ensure OpenSubtitles v3 is always installed as a pre-installed addon
      const opensubsId = 'org.stremio.opensubtitlesv3';
      if (!this.installedAddons.has(opensubsId)) {
        try {
          const opensubsManifest = await this.getManifest('https://opensubtitles-v3.strem.io/manifest.json');
          this.installedAddons.set(opensubsId, opensubsManifest);
        } catch (error) {
          const fallbackManifest: Manifest = {
            id: opensubsId,
            name: 'OpenSubtitles v3',
            version: '1.0.0',
            description: 'OpenSubtitles v3 Addon for Stremio',
            url: 'https://opensubtitles-v3.strem.io',
            originalUrl: 'https://opensubtitles-v3.strem.io/manifest.json',
            types: ['movie', 'series'],
            catalogs: [],
            resources: [
              {
                name: 'subtitles',
                types: ['movie', 'series'],
                idPrefixes: ['tt']
              }
            ],
            behaviorHints: {
              configurable: false
            }
          };
          this.installedAddons.set(opensubsId, fallbackManifest);
        }
      }
      
      // Load addon order if exists (scoped first, then legacy, then @user:local for migration safety)
      let storedOrder = await AsyncStorage.getItem(`@user:${scope}:${this.ADDON_ORDER_KEY}`);
      if (!storedOrder) storedOrder = await AsyncStorage.getItem(this.ADDON_ORDER_KEY);
      if (!storedOrder) storedOrder = await AsyncStorage.getItem(`@user:local:${this.ADDON_ORDER_KEY}`);
      if (storedOrder) {
        this.addonOrder = JSON.parse(storedOrder);
        // Filter out any ids that aren't in installedAddons
        this.addonOrder = this.addonOrder.filter(id => this.installedAddons.has(id));
      }
      
      // Ensure required pre-installed addons are present without forcing their position
      if (!this.addonOrder.includes(cinemetaId) && this.installedAddons.has(cinemetaId)) {
        this.addonOrder.push(cinemetaId);
      }
      if (!this.addonOrder.includes(opensubsId) && this.installedAddons.has(opensubsId)) {
        this.addonOrder.push(opensubsId);
      }
      
      // Add any missing addons to the order
      const installedIds = Array.from(this.installedAddons.keys());
      const missingIds = installedIds.filter(id => !this.addonOrder.includes(id));
      this.addonOrder = [...this.addonOrder, ...missingIds];
      
      // Ensure order and addons are saved
      await this.saveAddonOrder();
      await this.saveInstalledAddons();
      
      this.initialized = true;
    } catch (error) {
      // Initialize with empty state on error
      this.installedAddons = new Map();
      this.addonOrder = [];
      this.initialized = true;
    }
  }

  // Ensure service is initialized before any operation
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  private async retryRequest<T>(request: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < retries + 1; attempt++) {
      try {
        return await request();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on 404 errors (content not found) - these are expected for some content
        if (error.response?.status === 404) {
          throw error;
        }
        
        // Only log warnings for non-404 errors to reduce noise
        if (error.response?.status !== 404) {
          logger.warn(`Request failed (attempt ${attempt + 1}/${retries + 1}):`, {
            message: error.message,
            code: error.code,
            isAxiosError: error.isAxiosError,
            status: error.response?.status,
          });
        }
        
        if (attempt < retries) {
          const backoffDelay = delay * Math.pow(2, attempt);
          logger.log(`Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }
    throw lastError;
  }

  private async saveInstalledAddons(): Promise<void> {
    try {
      const addonsArray = Array.from(this.installedAddons.values());
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      // Write to both scoped and legacy keys for compatibility
      await Promise.all([
        AsyncStorage.setItem(`@user:${scope}:${this.STORAGE_KEY}`, JSON.stringify(addonsArray)),
        AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(addonsArray)),
      ]);
    } catch (error) {
      // Continue even if save fails
    }
  }

  private async saveAddonOrder(): Promise<void> {
    try {
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      // Write to both scoped and legacy keys for compatibility
      await Promise.all([
        AsyncStorage.setItem(`@user:${scope}:${this.ADDON_ORDER_KEY}`, JSON.stringify(this.addonOrder)),
        AsyncStorage.setItem(this.ADDON_ORDER_KEY, JSON.stringify(this.addonOrder)),
      ]);
    } catch (error) {
      // Continue even if save fails
    }
  }

  async getManifest(url: string): Promise<Manifest> {
    try {
      // Clean up URL - ensure it ends with manifest.json
      const manifestUrl = url.endsWith('manifest.json') 
        ? url 
        : `${url.replace(/\/$/, '')}/manifest.json`;
      
      const response = await this.retryRequest(async () => {
        return await axios.get(manifestUrl);
      });
      
      const manifest = response.data;
      
      // Add some extra fields for internal use
      manifest.originalUrl = url;
      manifest.url = url.replace(/manifest\.json$/, '');
      
      // Ensure ID exists
      if (!manifest.id) {
        manifest.id = this.formatId(url);
      }
      
      return manifest;
    } catch (error) {
      logger.error(`Failed to fetch manifest from ${url}:`, error);
      throw new Error(`Failed to fetch addon manifest from ${url}`);
    }
  }

  async installAddon(url: string): Promise<void> {
    const manifest = await this.getManifest(url);
    if (manifest && manifest.id) {
      this.installedAddons.set(manifest.id, manifest);
      
      // Add to order if not already present (new addons go to the end)
      if (!this.addonOrder.includes(manifest.id)) {
        this.addonOrder.push(manifest.id);
      }
      
      await this.saveInstalledAddons();
      await this.saveAddonOrder();
      try { (require('./SyncService').syncService as any).pushAddons?.(); } catch {}
      // Emit an event that an addon was added
      addonEmitter.emit(ADDON_EVENTS.ADDON_ADDED, manifest.id);
    } else {
      throw new Error('Invalid addon manifest');
    }
  }

  removeAddon(id: string): void {
    // Prevent removal of Cinemeta as it's a pre-installed addon
    if (id === 'com.linvo.cinemeta') {
      return;
    }
    
    if (this.installedAddons.has(id)) {
      this.installedAddons.delete(id);
      // Remove from order
      this.addonOrder = this.addonOrder.filter(addonId => addonId !== id);
      this.saveInstalledAddons();
      this.saveAddonOrder();
      try { (require('./SyncService').syncService as any).pushAddons?.(); } catch {}
      // Emit an event that an addon was removed
      addonEmitter.emit(ADDON_EVENTS.ADDON_REMOVED, id);
    }
  }

  getInstalledAddons(): Manifest[] {
    // Return addons in the specified order
    const result = this.addonOrder
      .filter(id => this.installedAddons.has(id))
      .map(id => this.installedAddons.get(id)!);
    // Ensure pre-installed presence
    const cinId = 'com.linvo.cinemeta';
    const osId = 'org.stremio.opensubtitlesv3';
    if (!result.find(a => a.id === cinId) && this.installedAddons.has(cinId)) {
      result.unshift(this.installedAddons.get(cinId)!);
    }
    if (!result.find(a => a.id === osId) && this.installedAddons.has(osId)) {
      // Put OpenSubtitles right after Cinemeta if possible, else at start
      const cinIdx = result.findIndex(a => a.id === cinId);
      const osManifest = this.installedAddons.get(osId)!;
      if (cinIdx >= 0) {
        result.splice(cinIdx + 1, 0, osManifest);
      } else {
        result.unshift(osManifest);
      }
    }
    return result;
  }

  async getInstalledAddonsAsync(): Promise<Manifest[]> {
    await this.ensureInitialized();
    return this.getInstalledAddons();
  }

  // Check if an addon is pre-installed and cannot be removed
  isPreInstalledAddon(id: string): boolean {
    return id === 'com.linvo.cinemeta';
  }

  private formatId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  async getAllCatalogs(): Promise<{ [addonId: string]: Meta[] }> {
    const result: { [addonId: string]: Meta[] } = {};
    const addons = this.getInstalledAddons();
    
    const promises = addons.map(async (addon) => {
      if (!addon.catalogs || addon.catalogs.length === 0) return;
      
      const catalog = addon.catalogs[0]; // Just take the first catalog for now
      
      try {
        const items = await this.getCatalog(addon, catalog.type, catalog.id);
        if (items.length > 0) {
          result[addon.id] = items;
        }
      } catch (error) {
        logger.error(`Failed to fetch catalog from ${addon.name}:`, error);
      }
    });
    
    await Promise.all(promises);
    return result;
  }

  private getAddonBaseURL(url: string): { baseUrl: string; queryParams?: string } {
    // Extract query parameters if they exist
    const [baseUrl, queryString] = url.split('?');
    
    // Remove trailing manifest.json and slashes
    let cleanBaseUrl = baseUrl.replace(/manifest\.json$/, '').replace(/\/$/, '');
    
    // Ensure URL has protocol
    if (!cleanBaseUrl.startsWith('http')) {
      cleanBaseUrl = `https://${cleanBaseUrl}`;
    }
    
    logger.log('Addon base URL:', cleanBaseUrl, queryString ? `with query: ${queryString}` : '');
    return { baseUrl: cleanBaseUrl, queryParams: queryString };
  }

  async getCatalog(manifest: Manifest, type: string, id: string, page = 1, filters: CatalogFilter[] = []): Promise<Meta[]> {
    // Special handling for Cinemeta
    if (manifest.id === 'com.linvo.cinemeta') {
      const baseUrl = 'https://v3-cinemeta.strem.io';
      let url = `${baseUrl}/catalog/${type}/${id}.json`;
      
      // Add paging
      url += `?skip=${(page - 1) * this.DEFAULT_PAGE_SIZE}`;
      
      // Add filters
      if (filters.length > 0) {
        filters.forEach(filter => {
          if (filter.value) {
            url += `&${encodeURIComponent(filter.title)}=${encodeURIComponent(filter.value)}`;
          }
        });
      }
      
      const response = await this.retryRequest(async () => {
        return await axios.get(url);
      });
      
      if (response.data && response.data.metas && Array.isArray(response.data.metas)) {
        return response.data.metas;
      }
      return [];
    }
    
    // For other addons
    if (!manifest.url) {
      throw new Error('Addon URL is missing');
    }
    
    try {
      const { baseUrl, queryParams } = this.getAddonBaseURL(manifest.url);
      
      // Build the catalog URL
      let url = `${baseUrl}/catalog/${type}/${id}.json`;
      
      // Add paging
      url += `?skip=${(page - 1) * this.DEFAULT_PAGE_SIZE}`;
      
      // Add filters
      if (filters.length > 0) {
        logger.log(`Adding ${filters.length} filters to ${manifest.name} request`);
        filters.forEach(filter => {
          if (filter.value) {
            logger.log(`Adding filter ${filter.title}=${filter.value}`);
            url += `&${encodeURIComponent(filter.title)}=${encodeURIComponent(filter.value)}`;
          }
        });
      }
      
      logger.log(`🔗 [${manifest.name}] Requesting catalog: ${url}`);
      
      const response = await this.retryRequest(async () => {
        return await axios.get(url);
      });
      
      if (response.data && response.data.metas && Array.isArray(response.data.metas)) {
        return response.data.metas;
      }
      return [];
    } catch (error) {
      logger.error(`Failed to fetch catalog from ${manifest.name}:`, error);
      throw error;
    }
  }

  async getMetaDetails(type: string, id: string, preferredAddonId?: string): Promise<MetaDetails | null> {
    try {
      const addons = this.getInstalledAddons();
      
      // If a preferred addon is specified, try it first
      if (preferredAddonId) {
        const preferredAddon = addons.find(addon => addon.id === preferredAddonId);

        if (preferredAddon && preferredAddon.resources) {
          // Build URL for metadata request
          const { baseUrl, queryParams } = this.getAddonBaseURL(preferredAddon.url || '');
          const url = queryParams ? `${baseUrl}/meta/${type}/${id}.json?${queryParams}` : `${baseUrl}/meta/${type}/${id}.json`;

          // Check if addon supports meta resource for this type
          let hasMetaSupport = false;
          
          for (const resource of preferredAddon.resources) {
            // Check if the current element is a ResourceObject
            if (typeof resource === 'object' && resource !== null && 'name' in resource) {
              const typedResource = resource as ResourceObject;
              if (typedResource.name === 'meta' && 
                  Array.isArray(typedResource.types) && 
                  typedResource.types.includes(type)) {
                hasMetaSupport = true;
                break;
              }
            } 
            // Check if the element is the simple string "meta" AND the addon has a top-level types array
            else if (typeof resource === 'string' && resource === 'meta' && preferredAddon.types) {
              if (Array.isArray(preferredAddon.types) && preferredAddon.types.includes(type)) {
                hasMetaSupport = true;
                break;
              }
            }
          }
          
          logger.log(`🔍 Meta support check: ${hasMetaSupport} (addon types: ${JSON.stringify(preferredAddon.types)})`);
          
                    if (hasMetaSupport) {
            try {
             
              const response = await this.retryRequest(async () => {
                return await axios.get(url, { timeout: 10000 });
              });
              
              if (response.data && response.data.meta) {
                return response.data.meta;
              }
            } catch (error) {
              // Continue trying other addons
            }
          }
        }
      }
      
      // Try Cinemeta with different base URLs
      const cinemetaUrls = [
        'https://v3-cinemeta.strem.io',
        'http://v3-cinemeta.strem.io'
      ];

      for (const baseUrl of cinemetaUrls) {
        try {
          const url = `${baseUrl}/meta/${type}/${id}.json`;

          const response = await this.retryRequest(async () => {
            return await axios.get(url, { timeout: 10000 });
          });
          
          if (response.data && response.data.meta) {
            return response.data.meta;
          }
        } catch (error: any) {
          continue; // Try next URL
        }
      }

      // If Cinemeta fails, try other addons (excluding the preferred one already tried)
      
      for (const addon of addons) {
        if (!addon.resources || addon.id === 'com.linvo.cinemeta' || addon.id === preferredAddonId) continue;
        
        // Check if addon supports meta resource for this type (handles both string and object formats)
        let hasMetaSupport = false;
        
        for (const resource of addon.resources) {
          // Check if the current element is a ResourceObject
          if (typeof resource === 'object' && resource !== null && 'name' in resource) {
            const typedResource = resource as ResourceObject;
            if (typedResource.name === 'meta' && 
                Array.isArray(typedResource.types) && 
                typedResource.types.includes(type)) {
              hasMetaSupport = true;
              break;
            }
          } 
          // Check if the element is the simple string "meta" AND the addon has a top-level types array
          else if (typeof resource === 'string' && resource === 'meta' && addon.types) {
            if (Array.isArray(addon.types) && addon.types.includes(type)) {
              hasMetaSupport = true;
              break;
            }
          }
        }
        
        if (!hasMetaSupport) continue;
        
        try {
          const { baseUrl, queryParams } = this.getAddonBaseURL(addon.url || '');
          const url = queryParams ? `${baseUrl}/meta/${type}/${id}.json?${queryParams}` : `${baseUrl}/meta/${type}/${id}.json`;
          
          logger.log(`🔗 [${addon.name}] Requesting metadata: ${url}`);
          const response = await this.retryRequest(async () => {
            return await axios.get(url, { timeout: 10000 });
          });
          
          if (response.data && response.data.meta) {
            return response.data.meta;
          }
        } catch (error) {
          logger.warn(`❌ Failed to fetch meta from ${addon.name} (${addon.id}):`, error);
          continue; // Try next addon
        }
      }
      
      // Only log this warning in debug mode to reduce noise
      if (__DEV__) {
        logger.warn('No metadata found from any addon');
      }
      return null;
    } catch (error) {
      logger.error('Error in getMetaDetails:', error);
      return null;
    }
  }

  /**
   * Memory-efficient method to fetch only upcoming episodes within a specific date range
   * This prevents over-fetching all episode data and reduces memory consumption
   */
  async getUpcomingEpisodes(
    type: string, 
    id: string, 
    options: {
      daysBack?: number;
      daysAhead?: number;
      maxEpisodes?: number;
      preferredAddonId?: string;
    } = {}
  ): Promise<{ seriesName: string; poster: string; episodes: any[] } | null> {
    const { daysBack = 14, daysAhead = 28, maxEpisodes = 50, preferredAddonId } = options;
    
    try {
      // Get metadata first (this is lightweight compared to episodes)
      const metadata = await this.getMetaDetails(type, id, preferredAddonId);
      if (!metadata) {
        return null;
      }

      // If no videos array exists, return basic info
      if (!metadata.videos || metadata.videos.length === 0) {
        return {
          seriesName: metadata.name,
          poster: metadata.poster || '',
          episodes: []
        };
      }

      const now = new Date();
      const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
      const endDate = new Date(now.getTime() + (daysAhead * 24 * 60 * 60 * 1000));

      // Filter episodes to only include those within our date range
      // This is done immediately after fetching to reduce memory footprint
      const filteredEpisodes = metadata.videos
        .filter(video => {
          if (!video.released) return false;
          const releaseDate = new Date(video.released);
          return releaseDate >= startDate && releaseDate <= endDate;
        })
        .sort((a, b) => new Date(a.released).getTime() - new Date(b.released).getTime())
        .slice(0, maxEpisodes); // Limit number of episodes to prevent memory overflow

      return {
        seriesName: metadata.name,
        poster: metadata.poster || '',
        episodes: filteredEpisodes
      };
    } catch (error) {
      logger.error(`[StremioService] Error fetching upcoming episodes for ${id}:`, error);
      return null;
    }
  }

  // Modify getStreams to use this.getInstalledAddons() instead of getEnabledAddons
  async getStreams(type: string, id: string, callback?: StreamCallback): Promise<void> {
    await this.ensureInitialized();
    
    const addons = this.getInstalledAddons();
    logger.log('📌 [getStreams] Installed addons:', addons.map(a => ({ id: a.id, name: a.name, url: a.url })));
    
    // Check if local scrapers are enabled and execute them first
    try {
      // Load settings from AsyncStorage directly (scoped with fallback)
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const settingsJson = (await AsyncStorage.getItem(`@user:${scope}:app_settings`))
        || (await AsyncStorage.getItem('app_settings'));
      const rawSettings = settingsJson ? JSON.parse(settingsJson) : {};
      const settings: AppSettings = { ...DEFAULT_SETTINGS, ...rawSettings };
      
      if (settings.enableLocalScrapers) {
        const hasScrapers = await localScraperService.hasScrapers();
        if (hasScrapers) {
          logger.log('🔧 [getStreams] Executing local scrapers for', type, id);
          
          // Map Stremio types to local scraper types
          const scraperType = type === 'series' ? 'tv' : type;
          
          // Parse the Stremio ID to extract IMDb ID and season/episode info
          let tmdbId: string | null = null;
          let season: number | undefined = undefined;
          let episode: number | undefined = undefined;
          
          try {
            const idParts = id.split(':');
            let baseImdbId: string;
            
            // Handle different episode ID formats
            if (idParts[0] === 'series') {
              // Format: series:imdbId:season:episode
              baseImdbId = idParts[1];
              if (scraperType === 'tv' && idParts.length >= 4) {
                season = parseInt(idParts[2], 10);
                episode = parseInt(idParts[3], 10);
              }
            } else if (idParts[0].startsWith('tt')) {
              // Format: imdbId:season:episode (direct IMDb ID)
              baseImdbId = idParts[0];
              if (scraperType === 'tv' && idParts.length >= 3) {
                season = parseInt(idParts[1], 10);
                episode = parseInt(idParts[2], 10);
              }
            } else {
              // Fallback: assume first part is the ID
              baseImdbId = idParts[0];
              if (scraperType === 'tv' && idParts.length >= 3) {
                season = parseInt(idParts[1], 10);
                episode = parseInt(idParts[2], 10);
              }
            }
            
            // Convert IMDb ID to TMDB ID using TMDBService
             const tmdbService = TMDBService.getInstance();
            const tmdbIdNumber = await tmdbService.findTMDBIdByIMDB(baseImdbId);
            
            if (tmdbIdNumber) {
              tmdbId = tmdbIdNumber.toString();
            } else {
              return; // Skip local scrapers if we can't convert the ID
            }
          } catch (error) {
            return; // Skip local scrapers if ID parsing fails
          }
          
          // Execute local scrapers asynchronously with TMDB ID
          localScraperService.getStreams(scraperType, tmdbId, season, episode, (streams, scraperId, scraperName, error) => {
            if (error) {
              if (callback) {
                callback(null, scraperId, scraperName, error);
              }
            } else if (streams && streams.length > 0) {
              if (callback) {
                callback(streams, scraperId, scraperName, null);
              }
            }
          });
        }
      }
    } catch (error) {
      // Continue even if local scrapers fail
    }
    
    // Check specifically for TMDB Embed addon
    const tmdbEmbed = addons.find(addon => addon.id === 'org.tmdbembedapi');
    if (!tmdbEmbed) {
      // TMDB Embed addon not found
    }
    
    // Find addons that provide streams and sort them by installation order
    const streamAddons = addons
      .filter(addon => {
        if (!addon.resources || !Array.isArray(addon.resources)) {
          logger.log(`⚠️ [getStreams] Addon ${addon.id} has no valid resources array`);
          return false;
        }
        
        // Log the detailed resources structure for debugging
        logger.log(`📋 [getStreams] Checking addon ${addon.id} resources:`, JSON.stringify(addon.resources));
        
        let hasStreamResource = false;
        
        // Iterate through the resources array, checking each element
        for (const resource of addon.resources) {
          // Check if the current element is a ResourceObject
          if (typeof resource === 'object' && resource !== null && 'name' in resource) {
            const typedResource = resource as ResourceObject;
            if (typedResource.name === 'stream' && 
                Array.isArray(typedResource.types) && 
                typedResource.types.includes(type)) {
              hasStreamResource = true;
              break; // Found the stream resource object, no need to check further
            }
          } 
          // Check if the element is the simple string "stream" AND the addon has a top-level types array
          else if (typeof resource === 'string' && resource === 'stream' && addon.types) {
            if (Array.isArray(addon.types) && addon.types.includes(type)) {
              hasStreamResource = true;
              break; // Found the simple stream resource string and type support
            }
          }
        }
        
        if (!hasStreamResource) {
          logger.log(`❌ [getStreams] Addon ${addon.id} does not support streaming ${type}`);
        } else {
          logger.log(`✅ [getStreams] Addon ${addon.id} supports streaming ${type}`);
        }
        
        return hasStreamResource;
      });
    
    logger.log('📊 [getStreams] Stream capable addons:', streamAddons.map(a => a.id));
    
    if (streamAddons.length === 0) {
      logger.warn('⚠️ [getStreams] No addons found that can provide streams');
      // Optionally call callback with an empty result or specific status?
      // For now, just return if no addons.
      return;
    }

    // Process each addon and call the callback individually
    streamAddons.forEach(addon => {
       // Use an IIFE to create scope for async operation inside forEach
      (async () => {
        try {
          if (!addon.url) {
            logger.warn(`⚠️ [getStreams] Addon ${addon.id} has no URL`);
            if (callback) callback(null, addon.id, addon.name, new Error('Addon has no URL'));
            return;
          }

          const { baseUrl, queryParams } = this.getAddonBaseURL(addon.url);
          const url = queryParams ? `${baseUrl}/stream/${type}/${id}.json?${queryParams}` : `${baseUrl}/stream/${type}/${id}.json`;
          
          logger.log(`🔗 [getStreams] Requesting streams from ${addon.name} (${addon.id}): ${url}`);
          
          const response = await this.retryRequest(async () => {
            return await axios.get(url);
          });

          let processedStreams: Stream[] = [];
          if (response.data && response.data.streams) {
            logger.log(`✅ [getStreams] Got ${response.data.streams.length} streams from ${addon.name} (${addon.id})`);
            processedStreams = this.processStreams(response.data.streams, addon);
            logger.log(`✅ [getStreams] Processed ${processedStreams.length} valid streams from ${addon.name} (${addon.id})`);
          } else {
             logger.log(`⚠️ [getStreams] No streams found in response from ${addon.name} (${addon.id})`);
          }

          if (callback) {
            // Call callback with processed streams (can be empty array)
            callback(processedStreams, addon.id, addon.name, null);
          }
        } catch (error) {
          if (callback) {
            // Call callback with error
            callback(null, addon.id, addon.name, error as Error);
          }
        }
      })(); // Immediately invoke the async function
    });

    // No longer waiting here, callbacks handle results asynchronously
    // Removed: await Promise.all(addonPromises.values());
    // No longer returning aggregated results
    // Removed: return streamResponses; 
  }

  private async fetchStreamsFromAddon(addon: Manifest, type: string, id: string): Promise<StreamResponse | null> {
    if (!addon.url) {
      logger.warn(`Addon ${addon.id} has no URL defined`);
      return null;
    }
    
    const { baseUrl, queryParams } = this.getAddonBaseURL(addon.url);
    const streamPath = `/stream/${type}/${id}.json`;
    const url = queryParams ? `${baseUrl}${streamPath}?${queryParams}` : `${baseUrl}${streamPath}`;
    
    logger.log(`Fetching streams from URL: ${url}`);
    
    try {
      // Increase timeout for debrid services
      const timeout = addon.id.toLowerCase().includes('torrentio') ? 30000 : 10000;
      
      const response = await this.retryRequest(async () => {
        logger.log(`Making request to ${url} with timeout ${timeout}ms`);
        return await axios.get(url, { 
          timeout,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36'
          }
        });
      }, 5); // Increase retries for stream fetching
      
      if (response.data && response.data.streams && Array.isArray(response.data.streams)) {
        const streams = this.processStreams(response.data.streams, addon);
        logger.log(`Successfully processed ${streams.length} streams from ${addon.id}`);
        
        return {
          streams,
          addon: addon.id,
          addonName: addon.name
        };
      } else {
        logger.warn(`Invalid response format from ${addon.id}:`, response.data);
      }
    } catch (error: any) {
      const errorDetails = {
        addonId: addon.id,
        addonName: addon.name,
        url,
        message: error.message,
        code: error.code,
        isAxiosError: error.isAxiosError,
        status: error.response?.status,
        responseData: error.response?.data
      };
      // Re-throw the error with more context
      throw new Error(`Failed to fetch streams from ${addon.name}: ${error.message}`);
    }
    
    return null;
  }

  private isDirectStreamingUrl(url?: string): boolean {
    return Boolean(
      url && (
        url.startsWith('http') || 
        url.startsWith('https')
      )
    );
  }

  private getStreamUrl(stream: any): string {
    if (stream.url) return stream.url;
    
    if (stream.infoHash) {
      const trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://9.rarbg.com:2810/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://open.stealth.si:80/announce',
        'udp://tracker.leechers-paradise.org:6969/announce',
        'udp://tracker.coppersurfer.tk:6969/announce',
        'udp://tracker.internetwarriors.net:1337/announce'
      ];
      const trackersString = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
      const encodedTitle = encodeURIComponent(stream.title || stream.name || 'Unknown');
      return `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodedTitle}${trackersString}`;
    }

    return '';
  }

  private processStreams(streams: any[], addon: Manifest): Stream[] {
    return streams
      .filter(stream => {
        // Basic filtering - ensure there's a way to play (URL or infoHash) and identify (title/name)
        const hasPlayableLink = !!(stream.url || stream.infoHash);
        const hasIdentifier = !!(stream.title || stream.name);
        return stream && hasPlayableLink && hasIdentifier;
      })
      .map(stream => {
        const streamUrl = this.getStreamUrl(stream);
        const isDirectStreamingUrl = this.isDirectStreamingUrl(streamUrl);
        const isMagnetStream = streamUrl?.startsWith('magnet:');

        // Memory optimization: Limit title length to prevent memory bloat
        let displayTitle = stream.title || stream.name || 'Unnamed Stream';
        if (stream.description && stream.description.includes('\n') && stream.description.length > (stream.title?.length || 0)) {
          // If description exists, contains newlines (likely formatted metadata), 
          // and is longer than the title, prefer it but truncate if too long
          displayTitle = stream.description.length > 150 
            ? stream.description.substring(0, 150) + '...' 
            : stream.description;
        }
        
        // Truncate display title if still too long
        if (displayTitle.length > 100) {
          displayTitle = displayTitle.substring(0, 100) + '...';
        }
        
        // Use the original name field for the primary identifier if available
        let name = stream.name || stream.title || 'Unnamed Stream';
        if (name.length > 80) {
          name = name.substring(0, 80) + '...';
        }

        // Extract size: Prefer behaviorHints.videoSize, fallback to top-level size
        const sizeInBytes = stream.behaviorHints?.videoSize || stream.size || undefined;

        // Memory optimization: Minimize behaviorHints to essential data only
        const behaviorHints: Stream['behaviorHints'] = {
          notWebReady: !isDirectStreamingUrl,
          cached: stream.behaviorHints?.cached || undefined,
          bingeGroup: stream.behaviorHints?.bingeGroup || undefined,
          // Only include essential torrent data for magnet streams
          ...(isMagnetStream ? {
            infoHash: stream.infoHash || streamUrl?.match(/btih:([a-zA-Z0-9]+)/)?.[1],
            fileIdx: stream.fileIdx,
            type: 'torrent',
          } : {}),
        };

        // Explicitly construct the final Stream object with minimal data
        const processedStream: Stream = {
          url: streamUrl,
          name: name,
          title: displayTitle,
          addonName: addon.name,
          addonId: addon.id,
          // Memory optimization: Only include essential fields
          description: stream.description && stream.description.length <= 100 
            ? stream.description 
            : undefined, // Skip long descriptions
          infoHash: stream.infoHash || undefined,
          fileIdx: stream.fileIdx,
          size: sizeInBytes,
          isFree: stream.isFree,
          isDebrid: !!(stream.behaviorHints?.cached),
          behaviorHints: behaviorHints,
        };

        return processedStream;
      });
  }

  getAddonCapabilities(): AddonCapabilities[] {
    return this.getInstalledAddons().map(addon => {
      return {
        name: addon.name,
        id: addon.id,
        version: addon.version,
        catalogs: addon.catalogs || [],
        resources: addon.resources || [],
        types: addon.types || [],
      };
    });
  }

  async getCatalogPreview(addonId: string, type: string, id: string, limit: number = 5): Promise<{
    addon: string;
    type: string;
    id: string;
    items: Meta[];
  }> {
    const addon = this.getInstalledAddons().find(a => a.id === addonId);
    
    if (!addon) {
      throw new Error(`Addon ${addonId} not found`);
    }
    
    const items = await this.getCatalog(addon, type, id);
    return {
      addon: addonId,
      type,
      id,
      items: items.slice(0, limit)
    };
  }

  async getSubtitles(type: string, id: string, videoId?: string): Promise<Subtitle[]> {
    await this.ensureInitialized();
    // Collect from all installed addons that expose a subtitles resource
    const addons = this.getInstalledAddons();
    const subtitleAddons = addons.filter(addon => {
      if (!addon.resources) return false;
      return addon.resources.some((resource: any) => {
        if (typeof resource === 'string') return resource === 'subtitles';
        return resource && resource.name === 'subtitles';
      });
    });

    if (subtitleAddons.length === 0) {
      logger.warn('No subtitle-capable addons installed');
      return [];
    }

    const requests = subtitleAddons.map(async (addon) => {
      if (!addon.url) return [] as Subtitle[];
      try {
        const { baseUrl } = this.getAddonBaseURL(addon.url || '');
        let url = '';
        if (type === 'series' && videoId) {
          const episodeInfo = videoId.replace('series:', '');
          url = `${baseUrl}/subtitles/series/${episodeInfo}.json`;
        } else {
          url = `${baseUrl}/subtitles/${type}/${id}.json`;
        }
        logger.log(`Fetching subtitles from ${addon.name}: ${url}`);
        const response = await this.retryRequest(async () => axios.get(url, { timeout: 10000 }));
        if (response.data && Array.isArray(response.data.subtitles)) {
          return response.data.subtitles.map((sub: any) => ({
            ...sub,
            addon: addon.id,
            addonName: addon.name,
          })) as Subtitle[];
        }
      } catch (error) {
        logger.error(`Failed to fetch subtitles from ${addon.name}:`, error);
      }
      return [] as Subtitle[];
    });

    const all = await Promise.all(requests);
    // Flatten and de-duplicate by URL
    const merged = ([] as Subtitle[]).concat(...all);
    const seen = new Set<string>();
    const deduped = merged.filter(s => {
      const key = s.url;
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped;
  }

  // Add methods to move addons in the order
  moveAddonUp(id: string): boolean {
    const index = this.addonOrder.indexOf(id);
    if (index > 0) {
      // Swap with the previous item
      [this.addonOrder[index - 1], this.addonOrder[index]] = 
        [this.addonOrder[index], this.addonOrder[index - 1]];
      this.saveAddonOrder();
      // Immediately push to server to avoid resets on restart
      try { (require('./SyncService').syncService as any).pushAddons?.(); } catch {}
      // Emit an event that the order has changed
      addonEmitter.emit(ADDON_EVENTS.ORDER_CHANGED);
      return true;
    }
    return false;
  }

  moveAddonDown(id: string): boolean {
    const index = this.addonOrder.indexOf(id);
    if (index >= 0 && index < this.addonOrder.length - 1) {
      // Swap with the next item
      [this.addonOrder[index], this.addonOrder[index + 1]] = 
        [this.addonOrder[index + 1], this.addonOrder[index]];
      this.saveAddonOrder();
      // Immediately push to server to avoid resets on restart
      try { (require('./SyncService').syncService as any).pushAddons?.(); } catch {}
      // Emit an event that the order has changed
      addonEmitter.emit(ADDON_EVENTS.ORDER_CHANGED);
      return true;
    }
    return false;
  }

  // Check if any installed addons can provide streams
  async hasStreamProviders(): Promise<boolean> {
    await this.ensureInitialized();
    const addons = Array.from(this.installedAddons.values());

    for (const addon of addons) {
      if (addon.resources && Array.isArray(addon.resources)) {
        // Check for 'stream' resource in the modern format
        const hasStreamResource = addon.resources.some(resource => 
          typeof resource === 'string' 
            ? resource === 'stream' 
            : resource.name === 'stream'
        );

        if (hasStreamResource) {
          return true;
        }
      }
    }

    return false;
  }
}

export const stremioService = StremioService.getInstance();
export default stremioService;