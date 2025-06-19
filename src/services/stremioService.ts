import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import EventEmitter from 'eventemitter3';

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
  director?: string;
  writer?: string;
  certification?: string;
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
  private readonly DEFAULT_ADDONS = [
    'https://v3-cinemeta.strem.io/manifest.json',
    'https://opensubtitles-v3.strem.io/manifest.json'
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
      
      // Load addon order if exists
      const storedOrder = await AsyncStorage.getItem(this.ADDON_ORDER_KEY);
      if (storedOrder) {
        this.addonOrder = JSON.parse(storedOrder);
        // Filter out any ids that aren't in installedAddons
        this.addonOrder = this.addonOrder.filter(id => this.installedAddons.has(id));
      }
      
      // Add any missing addons to the order
      const installedIds = Array.from(this.installedAddons.keys());
      const missingIds = installedIds.filter(id => !this.addonOrder.includes(id));
      this.addonOrder = [...this.addonOrder, ...missingIds];
      
      // If no addons, install defaults
      if (this.installedAddons.size === 0) {
        await this.installDefaultAddons();
      }
      
      // Ensure order is saved
      await this.saveAddonOrder();
      
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

  private async saveAddonOrder(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.ADDON_ORDER_KEY, JSON.stringify(this.addonOrder));
    } catch (error) {
      logger.error('Failed to save addon order:', error);
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
      // Emit an event that an addon was added
      addonEmitter.emit(ADDON_EVENTS.ADDON_ADDED, manifest.id);
    } else {
      throw new Error('Invalid addon manifest');
    }
  }

  removeAddon(id: string): void {
    if (this.installedAddons.has(id)) {
      this.installedAddons.delete(id);
      // Remove from order
      this.addonOrder = this.addonOrder.filter(addonId => addonId !== id);
      this.saveInstalledAddons();
      this.saveAddonOrder();
      // Emit an event that an addon was removed
      addonEmitter.emit(ADDON_EVENTS.ADDON_REMOVED, id);
    }
  }

  getInstalledAddons(): Manifest[] {
    // Return addons in the specified order
    return this.addonOrder
      .filter(id => this.installedAddons.has(id))
      .map(id => this.installedAddons.get(id)!);
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
        logger.log(`Adding ${filters.length} filters to Cinemeta request`);
        filters.forEach(filter => {
          if (filter.value) {
            logger.log(`Adding filter ${filter.title}=${filter.value}`);
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
          const { baseUrl, queryParams } = this.getAddonBaseURL(addon.url || '');
          const url = queryParams ? `${baseUrl}/meta/${type}/${id}.json?${queryParams}` : `${baseUrl}/meta/${type}/${id}.json`;
          
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

  // Modify getStreams to use this.getInstalledAddons() instead of getEnabledAddons
  async getStreams(type: string, id: string, callback?: StreamCallback): Promise<void> {
    await this.ensureInitialized();
    
    const addons = this.getInstalledAddons();
    logger.log('📌 [getStreams] Installed addons:', addons.map(a => ({ id: a.id, name: a.name, url: a.url })));
    
    // Check specifically for TMDB Embed addon
    const tmdbEmbed = addons.find(addon => addon.id === 'org.tmdbembedapi');
    if (tmdbEmbed) {
      logger.log('🔍 [getStreams] Found TMDB Embed Streams addon:', {
        id: tmdbEmbed.id,
        name: tmdbEmbed.name,
        url: tmdbEmbed.url,
        resources: tmdbEmbed.resources,
        types: tmdbEmbed.types
      });
    } else {
      logger.log('⚠️ [getStreams] TMDB Embed Streams addon not found among installed addons');
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
          logger.error(`❌ [getStreams] Failed to get streams from ${addon.name} (${addon.id}):`, error);
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
        // Basic filtering - ensure there's a way to play (URL or infoHash) and identify (title/name)
        const hasPlayableLink = !!(stream.url || stream.infoHash);
        const hasIdentifier = !!(stream.title || stream.name);
        return stream && hasPlayableLink && hasIdentifier;
      })
      .map(stream => {
        const streamUrl = this.getStreamUrl(stream);
        const isDirectStreamingUrl = this.isDirectStreamingUrl(streamUrl);
        const isMagnetStream = streamUrl?.startsWith('magnet:');

        // Determine the best title: Prioritize description if it seems detailed,
        // otherwise fall back to title or name.
        let displayTitle = stream.title || stream.name || 'Unnamed Stream';
        if (stream.description && stream.description.includes('\n') && stream.description.length > (stream.title?.length || 0)) {
          // If description exists, contains newlines (likely formatted metadata), 
          // and is longer than the title, prefer it.
          displayTitle = stream.description;
        }
        
        // Use the original name field for the primary identifier if available
        const name = stream.name || stream.title || 'Unnamed Stream';

        // Extract size: Prefer behaviorHints.videoSize, fallback to top-level size
        const sizeInBytes = stream.behaviorHints?.videoSize || stream.size || undefined;

        // Consolidate behavior hints, prioritizing specific data extraction
        let behaviorHints: Stream['behaviorHints'] = {
          ...(stream.behaviorHints || {}), // Start with existing hints
          notWebReady: !isDirectStreamingUrl,
          isMagnetStream,
          // Addon Info
          addonName: addon.name,
          addonId: addon.id,
          // Extracted data (provide defaults or undefined)
          cached: stream.behaviorHints?.cached || undefined, // For RD/AD detection
          filename: stream.behaviorHints?.filename || undefined, // Filename if available
          bingeGroup: stream.behaviorHints?.bingeGroup || undefined,
          // Add size here if extracted
          size: sizeInBytes, 
        };

        // Specific handling for magnet/torrent streams to extract more details
        if (isMagnetStream) {
          behaviorHints = {
            ...behaviorHints,
            infoHash: stream.infoHash || streamUrl?.match(/btih:([a-zA-Z0-9]+)/)?.[1],
            fileIdx: stream.fileIdx,
            magnetUrl: streamUrl,
            type: 'torrent',
            sources: stream.sources || [],
            seeders: stream.seeders, // Explicitly map seeders if present
            size: sizeInBytes || stream.seeders, // Use extracted size, fallback for torrents
            title: stream.title, // Torrent title might be different
          };
        }

        // Explicitly construct the final Stream object
        const processedStream: Stream = {
          url: streamUrl,
          name: name, // Use the original name/title for primary ID
          title: displayTitle, // Use the potentially more detailed title from description
          addonName: addon.name,
          addonId: addon.id,
          // Map other potential top-level fields if they exist
          description: stream.description || undefined, // Keep original description too
          infoHash: stream.infoHash || undefined,
          fileIdx: stream.fileIdx,
          size: sizeInBytes, // Assign the extracted size
          isFree: stream.isFree,
          isDebrid: !!(stream.behaviorHints?.cached), // Map debrid status more reliably
          // Assign the consolidated behaviorHints
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
    
    // Find the OpenSubtitles v3 addon
    const openSubtitlesAddon = this.getInstalledAddons().find(
      addon => addon.id === 'org.stremio.opensubtitlesv3'
    );
    
    if (!openSubtitlesAddon) {
      logger.warn('OpenSubtitles v3 addon not found');
      return [];
    }
    
    try {
      const baseUrl = this.getAddonBaseURL(openSubtitlesAddon.url || '').baseUrl;
      
      // Construct the query URL with the correct format
      // For series episodes, use the videoId directly which includes series ID + episode info
      let url = '';
      if (type === 'series' && videoId) {
        // For series, the format should be /subtitles/series/tt12345:1:2.json
        url = `${baseUrl}/subtitles/${type}/${videoId}.json`;
      } else {
        // For movies, the format is /subtitles/movie/tt12345.json
        url = `${baseUrl}/subtitles/${type}/${id}.json`;
      }
      
      logger.log(`Fetching subtitles from: ${url}`);
      
      const response = await this.retryRequest(async () => {
        return await axios.get(url, { timeout: 10000 });
      });
      
      if (response.data && response.data.subtitles) {
        // Process and return the subtitles
        return response.data.subtitles.map((sub: any) => ({
          ...sub,
          addon: openSubtitlesAddon.id,
          addonName: openSubtitlesAddon.name
        }));
      }
    } catch (error) {
      logger.error('Failed to fetch subtitles:', error);
    }
    
    return [];
  }

  // Add methods to move addons in the order
  moveAddonUp(id: string): boolean {
    const index = this.addonOrder.indexOf(id);
    if (index > 0) {
      // Swap with the previous item
      [this.addonOrder[index - 1], this.addonOrder[index]] = 
        [this.addonOrder[index], this.addonOrder[index - 1]];
      this.saveAddonOrder();
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
      // Emit an event that the order has changed
      addonEmitter.emit(ADDON_EVENTS.ORDER_CHANGED);
      return true;
    }
    return false;
  }
}

export const stremioService = StremioService.getInstance();
export default stremioService;