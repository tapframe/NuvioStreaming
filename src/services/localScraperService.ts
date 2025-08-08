import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { logger } from '../utils/logger';
import { Stream } from '../types/streams';
import { cacheService } from './cacheService';

// Types for local scrapers
export interface ScraperManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  scrapers: ScraperInfo[];
}

export interface ScraperInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  filename: string;
  supportedTypes: ('movie' | 'tv')[];
  enabled: boolean;
  logo?: string;
  contentLanguage?: string[];
  manifestEnabled?: boolean; // Whether the scraper is enabled in the manifest
}

export interface LocalScraperResult {
  title: string;
  name?: string;
  url: string;
  quality?: string;
  size?: string;
  language?: string;
  provider?: string;
  type?: string;
  seeders?: number;
  peers?: number;
  infoHash?: string;
  [key: string]: any;
}

// Callback type for scraper results
type ScraperCallback = (streams: Stream[] | null, scraperId: string | null, scraperName: string | null, error: Error | null) => void;

class LocalScraperService {
  private static instance: LocalScraperService;
  private readonly STORAGE_KEY = 'local-scrapers';
  private readonly REPOSITORY_KEY = 'scraper-repository-url';
  private readonly SCRAPER_SETTINGS_KEY = 'scraper-settings';
  private installedScrapers: Map<string, ScraperInfo> = new Map();
  private scraperCode: Map<string, string> = new Map();
  private repositoryUrl: string = '';
  private repositoryName: string = '';
  private initialized: boolean = false;

  private constructor() {
    this.initialize();
  }

  static getInstance(): LocalScraperService {
    if (!LocalScraperService.instance) {
      LocalScraperService.instance = new LocalScraperService();
    }
    return LocalScraperService.instance;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Load repository URL
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const storedRepoUrl = await AsyncStorage.getItem(`@user:${scope}:${this.REPOSITORY_KEY}`);
      if (storedRepoUrl) {
        this.repositoryUrl = storedRepoUrl;
      }

      // Load installed scrapers
      const storedScrapers = await AsyncStorage.getItem(`@user:${scope}:${this.STORAGE_KEY}`);
      if (storedScrapers) {
        const scrapers: ScraperInfo[] = JSON.parse(storedScrapers);
        const validScrapers: ScraperInfo[] = [];
        
        scrapers.forEach(scraper => {
          // Skip scrapers with missing essential fields
          if (!scraper.id || !scraper.name || !scraper.version) {
            logger.warn('[LocalScraperService] Skipping invalid scraper with missing essential fields:', scraper);
            return;
          }
          
          // Ensure contentLanguage is an array (migration for older scrapers)
          if (!scraper.contentLanguage) {
            scraper.contentLanguage = ['en']; // Default to English
          } else if (typeof scraper.contentLanguage === 'string') {
            scraper.contentLanguage = [scraper.contentLanguage]; // Convert string to array
          }
          
          // Ensure supportedTypes is an array (migration for older scrapers)
          if (!scraper.supportedTypes || !Array.isArray(scraper.supportedTypes)) {
            scraper.supportedTypes = ['movie', 'tv']; // Default to both types
          }
          
          // Ensure other required fields have defaults
          if (!scraper.description) {
            scraper.description = 'No description available';
          }
          if (!scraper.filename) {
            scraper.filename = `${scraper.id}.js`;
          }
          if (scraper.enabled === undefined) {
            scraper.enabled = true;
          }
          
          this.installedScrapers.set(scraper.id, scraper);
          validScrapers.push(scraper);
        });
        
        // Save cleaned scrapers back to storage if any were filtered out
        if (validScrapers.length !== scrapers.length) {
          logger.log('[LocalScraperService] Cleaned up invalid scrapers, saving valid ones');
          await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(validScrapers));
          
          // Clean up cached code for removed scrapers
          const validScraperIds = new Set(validScrapers.map(s => s.id));
          const removedScrapers = scrapers.filter(s => s.id && !validScraperIds.has(s.id));
          for (const removedScraper of removedScrapers) {
            try {
              await AsyncStorage.removeItem(`scraper-code-${removedScraper.id}`);
              logger.log('[LocalScraperService] Removed cached code for invalid scraper:', removedScraper.id);
            } catch (error) {
              logger.error('[LocalScraperService] Failed to remove cached code for', removedScraper.id, ':', error);
            }
          }
        }
      }

      // Load scraper code from cache
      await this.loadScraperCode();
      
      // Auto-refresh repository on app startup if URL is configured
      if (this.repositoryUrl) {
        try {
          logger.log('[LocalScraperService] Auto-refreshing repository on startup');
          await this.performRepositoryRefresh();
        } catch (error) {
          logger.error('[LocalScraperService] Auto-refresh failed on startup:', error);
          // Don't fail initialization if auto-refresh fails
        }
      }
      
      this.initialized = true;
      logger.log('[LocalScraperService] Initialized with', this.installedScrapers.size, 'scrapers');
    } catch (error) {
      logger.error('[LocalScraperService] Failed to initialize:', error);
      this.initialized = true; // Set to true to prevent infinite retry
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Set repository URL
  async setRepositoryUrl(url: string): Promise<void> {
    this.repositoryUrl = url;
    const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
    await AsyncStorage.setItem(`@user:${scope}:${this.REPOSITORY_KEY}`, url);
    logger.log('[LocalScraperService] Repository URL set to:', url);
  }

  // Get repository URL
  async getRepositoryUrl(): Promise<string> {
    await this.ensureInitialized();
    return this.repositoryUrl;
  }

  // Get repository name
  getRepositoryName(): string {
    return this.repositoryName || 'Plugins';
  }

  // Fetch and install scrapers from repository
  async refreshRepository(): Promise<void> {
    await this.ensureInitialized();
    await this.performRepositoryRefresh();
  }

  // Internal method to refresh repository without initialization check
  private async performRepositoryRefresh(): Promise<void> {
    if (!this.repositoryUrl) {
      throw new Error('No repository URL configured');
    }

    try {
      logger.log('[LocalScraperService] Fetching repository manifest from:', this.repositoryUrl);
      
      // Fetch manifest with cache busting
      const baseManifestUrl = this.repositoryUrl.endsWith('/') 
        ? `${this.repositoryUrl}manifest.json`
        : `${this.repositoryUrl}/manifest.json`;
      const manifestUrl = `${baseManifestUrl}?t=${Date.now()}`;
      
      const response = await axios.get(manifestUrl, { 
         timeout: 10000,
         headers: {
           'Cache-Control': 'no-cache',
           'Pragma': 'no-cache',
           'Expires': '0'
         }
       });
       const manifest: ScraperManifest = response.data;
       
       // Store repository name from manifest
       if (manifest.name) {
         this.repositoryName = manifest.name;
       }
       
       logger.log('[LocalScraperService] getAvailableScrapers - Raw manifest data:', JSON.stringify(manifest, null, 2));
       logger.log('[LocalScraperService] getAvailableScrapers - Manifest scrapers count:', manifest.scrapers?.length || 0);
       
       // Log each scraper's enabled status from manifest
       manifest.scrapers?.forEach(scraper => {
         logger.log(`[LocalScraperService] getAvailableScrapers - Scraper ${scraper.name}: enabled=${scraper.enabled}`);
       });
      
      logger.log('[LocalScraperService] Found', manifest.scrapers.length, 'scrapers in repository');
      
      // Get current manifest scraper IDs
      const manifestScraperIds = new Set(manifest.scrapers.map(s => s.id));
      
      // Remove scrapers that are no longer in the manifest
      const currentScraperIds = Array.from(this.installedScrapers.keys());
      for (const scraperId of currentScraperIds) {
        if (!manifestScraperIds.has(scraperId)) {
          logger.log('[LocalScraperService] Removing scraper no longer in manifest:', this.installedScrapers.get(scraperId)?.name || scraperId);
          this.installedScrapers.delete(scraperId);
          this.scraperCode.delete(scraperId);
          // Remove from AsyncStorage cache
          await AsyncStorage.removeItem(`scraper-code-${scraperId}`);
        }
      }
      
      // Download and install each scraper from manifest
      for (const scraperInfo of manifest.scrapers) {
        await this.downloadScraper(scraperInfo);
      }
      
      await this.saveInstalledScrapers();
      logger.log('[LocalScraperService] Repository refresh completed');
      
    } catch (error) {
      logger.error('[LocalScraperService] Failed to refresh repository:', error);
      throw error;
    }
  }

  // Download individual scraper
  private async downloadScraper(scraperInfo: ScraperInfo): Promise<void> {
    try {
      const scraperUrl = this.repositoryUrl.endsWith('/') 
        ? `${this.repositoryUrl}${scraperInfo.filename}`
        : `${this.repositoryUrl}/${scraperInfo.filename}`;
      
      logger.log('[LocalScraperService] Downloading scraper:', scraperInfo.name);
      
      const response = await axios.get(scraperUrl, { timeout: 15000 });
      const scraperCode = response.data;
      
      // Store scraper info and code
      const updatedScraperInfo = {
        ...scraperInfo,
        enabled: this.installedScrapers.get(scraperInfo.id)?.enabled ?? true // Preserve enabled state
      };
      
      // Ensure contentLanguage is an array (migration for older scrapers)
      if (!updatedScraperInfo.contentLanguage) {
        updatedScraperInfo.contentLanguage = ['en']; // Default to English
      } else if (typeof updatedScraperInfo.contentLanguage === 'string') {
        updatedScraperInfo.contentLanguage = [updatedScraperInfo.contentLanguage]; // Convert string to array
      }
      
      // Ensure supportedTypes is an array (migration for older scrapers)
      if (!updatedScraperInfo.supportedTypes || !Array.isArray(updatedScraperInfo.supportedTypes)) {
        updatedScraperInfo.supportedTypes = ['movie', 'tv']; // Default to both types
      }
      
      this.installedScrapers.set(scraperInfo.id, updatedScraperInfo);
      
      this.scraperCode.set(scraperInfo.id, scraperCode);
      
      // Cache the scraper code
      await this.cacheScraperCode(scraperInfo.id, scraperCode);
      
      logger.log('[LocalScraperService] Successfully downloaded:', scraperInfo.name);
      
    } catch (error) {
      logger.error('[LocalScraperService] Failed to download scraper', scraperInfo.name, ':', error);
    }
  }

  // Cache scraper code locally
  private async cacheScraperCode(scraperId: string, code: string): Promise<void> {
    try {
      await AsyncStorage.setItem(`scraper-code-${scraperId}`, code);
    } catch (error) {
      logger.error('[LocalScraperService] Failed to cache scraper code:', error);
    }
  }

  // Load scraper code from cache
  private async loadScraperCode(): Promise<void> {
    for (const [scraperId] of this.installedScrapers) {
      try {
        const cachedCode = await AsyncStorage.getItem(`scraper-code-${scraperId}`);
        if (cachedCode) {
          this.scraperCode.set(scraperId, cachedCode);
        }
      } catch (error) {
        logger.error('[LocalScraperService] Failed to load cached code for', scraperId, ':', error);
      }
    }
  }

  // Save installed scrapers to storage
  private async saveInstalledScrapers(): Promise<void> {
    try {
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const scrapers = Array.from(this.installedScrapers.values());
      await AsyncStorage.setItem(`@user:${scope}:${this.STORAGE_KEY}`, JSON.stringify(scrapers));
    } catch (error) {
      logger.error('[LocalScraperService] Failed to save scrapers:', error);
    }
  }

  // Get installed scrapers
  async getInstalledScrapers(): Promise<ScraperInfo[]> {
    await this.ensureInitialized();
    return Array.from(this.installedScrapers.values());
  }

  // Get available scrapers from manifest.json (for display in settings)
  async getAvailableScrapers(): Promise<ScraperInfo[]> {
    if (!this.repositoryUrl) {
      logger.log('[LocalScraperService] No repository URL configured, returning installed scrapers');
      return this.getInstalledScrapers();
    }

    try {
      logger.log('[LocalScraperService] Fetching available scrapers from manifest');
      
      // Fetch manifest with cache busting
      const baseManifestUrl = this.repositoryUrl.endsWith('/') 
        ? `${this.repositoryUrl}manifest.json`
        : `${this.repositoryUrl}/manifest.json`;
      const manifestUrl = `${baseManifestUrl}?t=${Date.now()}`;
      
      const response = await axios.get(manifestUrl, { 
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      const manifest: ScraperManifest = response.data;
      
      // Store repository name from manifest
      if (manifest.name) {
        this.repositoryName = manifest.name;
      }
      
      // Return scrapers from manifest, respecting manifest's enabled field
      const availableScrapers = manifest.scrapers.map(scraperInfo => {
        const installedScraper = this.installedScrapers.get(scraperInfo.id);
        
        // Create a copy with manifest data
        const scraperWithManifestData = {
          ...scraperInfo,
          // Store the manifest's enabled state separately
          manifestEnabled: scraperInfo.enabled,
          // If manifest says enabled: false, scraper cannot be enabled
          // If manifest says enabled: true, use installed state or default to false
          enabled: scraperInfo.enabled ? (installedScraper?.enabled ?? false) : false
        };
        
        return scraperWithManifestData;
      });
      
      logger.log('[LocalScraperService] Found', availableScrapers.length, 'available scrapers in repository');
       
       // Log final scraper states being returned to UI
       availableScrapers.forEach(scraper => {
         logger.log(`[LocalScraperService] Final scraper ${scraper.name}: manifestEnabled=${scraper.manifestEnabled}, enabled=${scraper.enabled}`);
       });
       
       return availableScrapers;
      
    } catch (error) {
      logger.error('[LocalScraperService] Failed to fetch available scrapers from manifest:', error);
      // Fallback to installed scrapers if manifest fetch fails
      return this.getInstalledScrapers();
    }
  }

  // Enable/disable scraper
  async setScraperEnabled(scraperId: string, enabled: boolean): Promise<void> {
    await this.ensureInitialized();
    
    const scraper = this.installedScrapers.get(scraperId);
    if (scraper) {
      scraper.enabled = enabled;
      this.installedScrapers.set(scraperId, scraper);
      await this.saveInstalledScrapers();
      logger.log('[LocalScraperService] Scraper', scraperId, enabled ? 'enabled' : 'disabled');
    }
  }

  // Execute scrapers for streams
  async getStreams(type: string, tmdbId: string, season?: number, episode?: number, callback?: ScraperCallback): Promise<void> {
    await this.ensureInitialized();
    
    // Get available scrapers from manifest (respects manifestEnabled)
    const availableScrapers = await this.getAvailableScrapers();
    const enabledScrapers = availableScrapers
      .filter(scraper => 
        scraper.enabled && 
        scraper.manifestEnabled !== false && 
        scraper.supportedTypes.includes(type as 'movie' | 'tv')
      );
    
    if (enabledScrapers.length === 0) {
      logger.log('[LocalScraperService] No enabled scrapers found for type:', type);
      return;
    }
    
    logger.log('[LocalScraperService] Executing', enabledScrapers.length, 'scrapers for', type, tmdbId);
    
    // Execute each scraper
    for (const scraper of enabledScrapers) {
      this.executeScraper(scraper, type, tmdbId, season, episode, callback);
    }
  }

  // Execute individual scraper
  private async executeScraper(
    scraper: ScraperInfo, 
    type: string, 
    tmdbId: string, 
    season?: number, 
    episode?: number, 
    callback?: ScraperCallback
  ): Promise<void> {
    try {
      const code = this.scraperCode.get(scraper.id);
      if (!code) {
        throw new Error(`No code found for scraper ${scraper.id}`);
      }
      
      logger.log('[LocalScraperService] Executing scraper:', scraper.name);
      
      // Create a sandboxed execution environment
      const results = await this.executeSandboxed(code, {
        tmdbId,
        mediaType: type,
        season,
        episode
      });
      
      // Convert results to Nuvio Stream format
      const streams = this.convertToStreams(results, scraper);
      
      if (callback) {
        callback(streams, scraper.id, scraper.name, null);
      }
      
      logger.log('[LocalScraperService] Scraper', scraper.name, 'returned', streams.length, 'streams');
      
    } catch (error) {
      logger.error('[LocalScraperService] Scraper', scraper.name, 'failed:', error);
      if (callback) {
        callback(null, scraper.id, scraper.name, error as Error);
      }
    }
  }

  // Execute scraper code in sandboxed environment
  private async executeSandboxed(code: string, params: any): Promise<LocalScraperResult[]> {
    // This is a simplified sandbox - in production, you'd want more security
    try {
      // Get URL validation setting from AsyncStorage
      const settingsData = await AsyncStorage.getItem('app_settings');
      const settings = settingsData ? JSON.parse(settingsData) : {};
      const urlValidationEnabled = settings.enableScraperUrlValidation ?? true;
      
      // Create a limited global context
      const moduleExports = {};
      const moduleObj = { exports: moduleExports };
      
      // Try to load cheerio-without-node-native
      let cheerio = null;
      try {
        cheerio = require('cheerio-without-node-native');
      } catch (error) {
        try {
          cheerio = require('react-native-cheerio');
        } catch (error2) {
          // Cheerio not available, scrapers will fall back to regex
        }
      }
      
      const sandbox = {
        console: {
          log: (...args: any[]) => logger.log('[Scraper]', ...args),
          error: (...args: any[]) => logger.error('[Scraper]', ...args),
          warn: (...args: any[]) => logger.warn('[Scraper]', ...args)
        },
        setTimeout,
        clearTimeout,
        Promise,
        JSON,
        Date,
        Math,
        parseInt,
        parseFloat,
        encodeURIComponent,
        decodeURIComponent,
        // Add require function for specific modules
        require: (moduleName: string) => {
          switch (moduleName) {
            case 'cheerio-without-node-native':
              if (cheerio) return cheerio;
              throw new Error('cheerio-without-node-native not available');
            case 'react-native-cheerio':
              if (cheerio) return cheerio;
              throw new Error('react-native-cheerio not available');
            default:
              throw new Error(`Module '${moduleName}' is not available in sandbox`);
          }
        },
        // Add fetch for HTTP requests (using axios as polyfill)
        fetch: async (url: string, options: any = {}) => {
          const axiosConfig = {
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            data: options.body,
            timeout: 30000
          };
          
          try {
            const response = await axios(axiosConfig);
            return {
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              json: async () => response.data,
              text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
            };
          } catch (error: any) {
            throw new Error(`Fetch failed: ${error.message}`);
          }
        },
        // Add axios for HTTP requests
        axios: axios.create({
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        }),
        // Node.js compatibility
        module: moduleObj,
        exports: moduleExports,
        global: {}, // Empty global object
        // URL validation setting
        URL_VALIDATION_ENABLED: urlValidationEnabled
      };
      
      // Execute the scraper code without timeout
      const executionPromise = new Promise<LocalScraperResult[]>((resolve, reject) => {
        try {
          // Create function from code
          const func = new Function('sandbox', 'params', `
            const { console, setTimeout, clearTimeout, Promise, JSON, Date, Math, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, require, axios, fetch, module, exports, global, URL_VALIDATION_ENABLED } = sandbox;
            ${code}
            
            // Call the main function (assuming it's exported)
            if (typeof getStreams === 'function') {
              return getStreams(params.tmdbId, params.mediaType, params.season, params.episode);
            } else if (typeof module !== 'undefined' && module.exports && typeof module.exports.getStreams === 'function') {
              return module.exports.getStreams(params.tmdbId, params.mediaType, params.season, params.episode);
            } else if (typeof global !== 'undefined' && global.getStreams && typeof global.getStreams === 'function') {
              return global.getStreams(params.tmdbId, params.mediaType, params.season, params.episode);
            } else {
              throw new Error('No getStreams function found in scraper');
            }
          `);
          
          const result = func(sandbox, params);
          
          // Handle both sync and async results
          if (result && typeof result.then === 'function') {
            result.then(resolve).catch(reject);
          } else {
            resolve(result || []);
          }
        } catch (error) {
          reject(error);
        }
      });
      
      return await executionPromise;
      
    } catch (error) {
      logger.error('[LocalScraperService] Sandbox execution failed:', error);
      throw error;
    }
  }

  // Convert scraper results to Nuvio Stream format
  private convertToStreams(results: LocalScraperResult[], scraper: ScraperInfo): Stream[] {
    if (!Array.isArray(results)) {
      logger.warn('[LocalScraperService] Scraper returned non-array result');
      return [];
    }
    
    return results.map((result, index) => {
      // Build title with quality information for UI compatibility
      let title = result.title || result.name || `${scraper.name} Stream ${index + 1}`;
      
      // Add quality to title if available and not already present
      if (result.quality && !title.includes(result.quality)) {
        title = `${title} ${result.quality}`;
      }
      
      // Build name with quality information
      let streamName = result.name || `${scraper.name}`;
      if (result.quality && !streamName.includes(result.quality)) {
        streamName = `${streamName} - ${result.quality}`;
      }
      
      const stream: Stream = {
        // Include quality in name field for proper display
        name: streamName,
        title: title,
        url: result.url,
        addon: scraper.id,
        addonId: scraper.id,
        addonName: scraper.name,
        description: result.size ? `${result.size}` : undefined,
        size: result.size ? this.parseSize(result.size) : undefined,
        behaviorHints: {
          bingeGroup: `local-scraper-${scraper.id}`
        }
      };
      
      // Add additional properties if available
      if (result.infoHash) {
        stream.infoHash = result.infoHash;
      }
      
      // Preserve any additional fields from the scraper result
      if (result.quality && !stream.quality) {
        stream.quality = result.quality;
      }
      
      // Pass headers from scraper result if available
      if (result.headers) {
        stream.headers = result.headers;
      }
      
      return stream;
    }).filter(stream => stream.url); // Filter out streams without URLs
  }

  // Parse size string to bytes
  private parseSize(sizeStr: string): number {
    if (!sizeStr) return 0;
    
    const match = sizeStr.match(/([0-9.]+)\s*(GB|MB|KB|TB)/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'TB': return value * 1024 * 1024 * 1024 * 1024;
      case 'GB': return value * 1024 * 1024 * 1024;
      case 'MB': return value * 1024 * 1024;
      case 'KB': return value * 1024;
      default: return value;
    }
  }

  // Remove all scrapers
  async clearScrapers(): Promise<void> {
    this.installedScrapers.clear();
    this.scraperCode.clear();
    
    // Clear from storage
    const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
    await AsyncStorage.removeItem(`@user:${scope}:${this.STORAGE_KEY}`);
    
    // Clear cached code
    const keys = await AsyncStorage.getAllKeys();
    const scraperCodeKeys = keys.filter(key => key.startsWith('scraper-code-'));
    await AsyncStorage.multiRemove(scraperCodeKeys);
    
    logger.log('[LocalScraperService] All scrapers cleared');
  }

  // Check if local scrapers are available
  async hasScrapers(): Promise<boolean> {
    await this.ensureInitialized();
    return Array.from(this.installedScrapers.values()).some(scraper => scraper.enabled);
  }
}

export const localScraperService = LocalScraperService.getInstance();
export default localScraperService;