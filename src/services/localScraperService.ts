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
      const storedRepoUrl = await AsyncStorage.getItem(this.REPOSITORY_KEY);
      if (storedRepoUrl) {
        this.repositoryUrl = storedRepoUrl;
      }

      // Load installed scrapers
      const storedScrapers = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (storedScrapers) {
        const scrapers: ScraperInfo[] = JSON.parse(storedScrapers);
        scrapers.forEach(scraper => {
          this.installedScrapers.set(scraper.id, scraper);
        });
      }

      // Load scraper code from cache
      await this.loadScraperCode();
      
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
    await AsyncStorage.setItem(this.REPOSITORY_KEY, url);
    logger.log('[LocalScraperService] Repository URL set to:', url);
  }

  // Get repository URL
  async getRepositoryUrl(): Promise<string> {
    await this.ensureInitialized();
    return this.repositoryUrl;
  }

  // Fetch and install scrapers from repository
  async refreshRepository(): Promise<void> {
    await this.ensureInitialized();
    
    if (!this.repositoryUrl) {
      throw new Error('No repository URL configured');
    }

    try {
      logger.log('[LocalScraperService] Fetching repository manifest from:', this.repositoryUrl);
      
      // Fetch manifest
      const manifestUrl = this.repositoryUrl.endsWith('/') 
        ? `${this.repositoryUrl}manifest.json`
        : `${this.repositoryUrl}/manifest.json`;
      
      const response = await axios.get(manifestUrl, { timeout: 10000 });
      const manifest: ScraperManifest = response.data;
      
      logger.log('[LocalScraperService] Found', manifest.scrapers.length, 'scrapers in repository');
      
      // Download and install each scraper
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
      this.installedScrapers.set(scraperInfo.id, {
        ...scraperInfo,
        enabled: this.installedScrapers.get(scraperInfo.id)?.enabled ?? true // Preserve enabled state
      });
      
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
      const scrapers = Array.from(this.installedScrapers.values());
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(scrapers));
    } catch (error) {
      logger.error('[LocalScraperService] Failed to save scrapers:', error);
    }
  }

  // Get installed scrapers
  async getInstalledScrapers(): Promise<ScraperInfo[]> {
    await this.ensureInitialized();
    return Array.from(this.installedScrapers.values());
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
    
    const enabledScrapers = Array.from(this.installedScrapers.values())
      .filter(scraper => scraper.enabled && scraper.supportedTypes.includes(type as 'movie' | 'tv'));
    
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
        global: {} // Empty global object
      };
      
      // Execute the scraper code with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Scraper execution timeout')), 60000); // 60 second timeout
      });
      
      const executionPromise = new Promise<LocalScraperResult[]>((resolve, reject) => {
        try {
          // Create function from code
          const func = new Function('sandbox', 'params', `
            const { console, setTimeout, clearTimeout, Promise, JSON, Date, Math, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, require, axios, fetch, module, exports, global } = sandbox;
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
      
      return await Promise.race([executionPromise, timeoutPromise]) as LocalScraperResult[];
      
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
      const stream: Stream = {
        // Preserve scraper's name and title if provided, otherwise use fallbacks
        name: result.name || result.title || `${scraper.name} Stream ${index + 1}`,
        title: result.title || result.name || `${scraper.name} Stream ${index + 1}`,
        url: result.url,
        addon: scraper.id,
        addonId: scraper.id,
        addonName: scraper.name,
        description: result.quality ? `${result.quality}${result.size ? ` • ${result.size}` : ''}` : undefined,
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
    await AsyncStorage.removeItem(this.STORAGE_KEY);
    
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