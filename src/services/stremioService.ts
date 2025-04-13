import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

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
  director?: string;
  writer?: string;
  certification?: string;
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
  private readonly STORAGE_KEY = 'stremio-addons';
  private readonly DEFAULT_ADDONS = [
    'https://v3-cinemeta.strem.io/manifest.json'
    
  ];
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
      const storedAddons = await AsyncStorage.getItem(this.STORAGE_KEY);
      
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
      
      // If no addons, install defaults
      if (this.installedAddons.size === 0) {
        await this.installDefaultAddons();
      }
      
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize addons:', error);
      // Install defaults as fallback
      await this.installDefaultAddons();
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
        logger.warn(`Request failed (attempt ${attempt + 1}/${retries + 1}):`, {
          message: error.message,
          code: error.code,
          isAxiosError: error.isAxiosError,
          status: error.response?.status,
        });
        
        if (attempt < retries) {
          const backoffDelay = delay * Math.pow(2, attempt);
          logger.log(`Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }
    throw lastError;
  }

  private async installDefaultAddons(): Promise<void> {
    try {
      for (const url of this.DEFAULT_ADDONS) {
        const manifest = await this.getManifest(url);
        if (manifest) {
          this.installedAddons.set(manifest.id, manifest);
        }
      }
      await this.saveInstalledAddons();
    } catch (error) {
      logger.error('Failed to install default addons:', error);
    }
  }

  private async saveInstalledAddons(): Promise<void> {
    try {
      const addonsArray = Array.from(this.installedAddons.values());
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(addonsArray));
    } catch (error) {
      logger.error('Failed to save addons:', error);
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
      await this.saveInstalledAddons();
    } else {
      throw new Error('Invalid addon manifest');
    }
  }

  removeAddon(id: string): void {
    if (this.installedAddons.has(id)) {
      this.installedAddons.delete(id);
      this.saveInstalledAddons();
    }
  }

  getInstalledAddons(): Manifest[] {
    return Array.from(this.installedAddons.values());
  }

  async getInstalledAddonsAsync(): Promise<Manifest[]> {
    await this.ensureInitialized();
    return this.getInstalledAddons();
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

  private getAddonBaseURL(url: string): string {
    // Remove trailing manifest.json if present
    let baseUrl = url.replace(/manifest\.json$/, '').replace(/\/$/, '');
    
    // Ensure URL has protocol
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    
    logger.log('Addon base URL:', baseUrl);
    return baseUrl;
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
      const baseUrl = this.getAddonBaseURL(manifest.url);
      
      // Build the catalog URL
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
    } catch (error) {
      logger.error(`Failed to fetch catalog from ${manifest.name}:`, error);
      throw error;
    }
  }

  async getMetaDetails(type: string, id: string): Promise<MetaDetails | null> {
    try {
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
        } catch (error) {
          logger.warn(`Failed to fetch meta from ${baseUrl}:`, error);
          continue; // Try next URL
        }
      }

      // If Cinemeta fails, try other addons
      const addons = this.getInstalledAddons();
      
      for (const addon of addons) {
        if (!addon.resources || addon.id === 'com.linvo.cinemeta') continue;
        
        const metaResource = addon.resources.find(
          resource => resource.name === 'meta' && resource.types.includes(type)
        );
        
        if (!metaResource) continue;
        
        try {
          const baseUrl = this.getAddonBaseURL(addon.url || '');
          const url = `${baseUrl}/meta/${type}/${id}.json`;
          
          const response = await this.retryRequest(async () => {
            return await axios.get(url, { timeout: 10000 });
          });
          
          if (response.data && response.data.meta) {
            return response.data.meta;
          }
        } catch (error) {
          logger.warn(`Failed to fetch meta from ${addon.name}:`, error);
          continue; // Try next addon
        }
      }
      
      logger.warn('No metadata found from any addon');
      return null;
    } catch (error) {
      logger.error('Error in getMetaDetails:', error);
      return null;
    }
  }

  async getStreams(type: string, id: string, callback?: (streams: Stream[] | null, addonName: string | null, error: Error | null) => void): Promise<StreamResponse[]> {
    await this.ensureInitialized();
    
    const addons = this.getInstalledAddons();
    logger.log('Installed addons:', addons.map(a => ({ id: a.id, url: a.url })));
    
    const streamResponses: StreamResponse[] = [];
    
    // Find addons that provide streams and sort them by installation order
    const streamAddons = addons
      .filter(addon => {
        if (!addon.resources) {
          logger.log(`Addon ${addon.id} has no resources`);
          return false;
        }
        
        const hasStreamResource = addon.resources.some(
          resource => resource.name === 'stream' && resource.types.includes(type)
        );
        
        if (!hasStreamResource) {
          logger.log(`Addon ${addon.id} does not support streaming ${type}`);
        }
        
        return hasStreamResource;
      });
    
    logger.log('Stream capable addons:', streamAddons.map(a => a.id));
    
    if (streamAddons.length === 0) {
      logger.warn('No addons found that can provide streams');
      return [];
    }

    // Create a map to store promises for each addon
    const addonPromises = new Map<string, Promise<void>>();
    
    // Process each addon
    for (const addon of streamAddons) {
      const promise = (async () => {
        try {
          if (!addon.url) {
            logger.warn(`Addon ${addon.id} has no URL`);
            return;
          }

          const baseUrl = this.getAddonBaseURL(addon.url);
          const url = `${baseUrl}/stream/${type}/${id}.json`;
          
          const response = await this.retryRequest(async () => {
            return await axios.get(url);
          });

          if (response.data && response.data.streams) {
            const processedStreams = this.processStreams(response.data.streams, addon);
            if (processedStreams.length > 0) {
              streamResponses.push({
                addon: addon.id,
                addonName: addon.name,
                streams: processedStreams
              });
            }
          }

          if (callback) {
            callback(response.data?.streams || null, addon.name, null);
          }
        } catch (error) {
          logger.error(`Failed to get streams from ${addon.name}:`, error);
          if (callback) {
            callback(null, addon.name, error as Error);
          }
        }
      })();

      addonPromises.set(addon.id, promise);
    }

    // Wait for all promises to complete
    await Promise.all(addonPromises.values());

    // Sort stream responses to maintain installed addon order
    streamResponses.sort((a, b) => {
      const indexA = streamAddons.findIndex(addon => addon.id === a.addon);
      const indexB = streamAddons.findIndex(addon => addon.id === b.addon);
      return indexA - indexB;
    });

    return streamResponses;
  }

  private async fetchStreamsFromAddon(addon: Manifest, type: string, id: string): Promise<StreamResponse | null> {
    if (!addon.url) {
      logger.warn(`Addon ${addon.id} has no URL defined`);
      return null;
    }
    
    const baseUrl = this.getAddonBaseURL(addon.url);
    const url = `${baseUrl}/stream/${type}/${id}.json`;
    
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
      logger.error('Failed to fetch streams from addon:', errorDetails);
      
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
        const isTorrentioStream = stream.infoHash && stream.fileIdx !== undefined;
        return stream && (stream.url || isTorrentioStream) && (stream.title || stream.name);
      })
      .map(stream => {
        const isDirectStreamingUrl = this.isDirectStreamingUrl(stream.url);
        const streamUrl = this.getStreamUrl(stream);
        const isMagnetStream = streamUrl?.startsWith('magnet:');

        // Keep original stream data exactly as provided by the addon
        return {
          ...stream,
          url: streamUrl,
          addonName: addon.name,
          addonId: addon.id,
          // Preserve original stream metadata
          name: stream.name,
          title: stream.title,
          behaviorHints: {
            ...stream.behaviorHints,
            notWebReady: !isDirectStreamingUrl,
            isMagnetStream,
            ...(isMagnetStream && {
              infoHash: stream.infoHash || streamUrl?.match(/btih:([a-zA-Z0-9]+)/)?.[1],
              fileIdx: stream.fileIdx,
              magnetUrl: streamUrl,
              type: 'torrent',
              sources: stream.sources || [],
              seeders: stream.seeders,
              size: stream.size,
              title: stream.title,
            })
          }
        };
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
}

export const stremioService = StremioService.getInstance();
export default stremioService;