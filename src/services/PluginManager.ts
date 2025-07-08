import { logger } from '../utils/logger';
import * as cheerio from 'cheerio';
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – no types for Babel standalone
const Babel = require('@babel/standalone');

const PLUGIN_URLS_STORAGE_KEY = '@plugin_urls';

// --- Type Definitions ---

interface Plugin {
  name: string;
  version: string;
  author: string;
  description: string;
  type: 'scraper' | 'other';
  getStreams: (options: GetStreamsOptions) => Promise<Stream[]>;
  sourceUrl?: string; // To track the origin of the plugin
}

interface Stream {
  name: string;
  title: string;
  url: string;
  quality: string;
}

interface GetStreamsOptions {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  seasonNum?: number;
  episodeNum?: number;
  tmdbApiKey: string;
  // Optional metadata to avoid extra API calls
  title?: string;
  year?: string | number;
  // Injected properties
  logger: typeof logger;
  cache: Cache;
  fetch: typeof fetch;
  fetchWithCookies: (url: string, options?: RequestInit) => Promise<Response>;
  setCookie: (key: string, value: string) => void;
  parseHTML: (html: string) => cheerio.CheerioAPI;
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
  FormData: typeof FormData;
}

interface Cache {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: any, ttlInSeconds: number) => Promise<void>;
}

// --- Simple In-Memory Cache with TTL ---

const cacheStore = new Map<string, { value: any; expiry: number }>();
const simpleCache: Cache = {
  async get<T>(key: string): Promise<T | null> {
    const item = cacheStore.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      cacheStore.delete(key);
      return null;
    }
    return item.value as T;
  },
  async set(key: string, value: any, ttlInSeconds: number): Promise<void> {
    const expiry = Date.now() + ttlInSeconds * 1000;
    cacheStore.set(key, { value, expiry });
  },
};

// --- Cookie-enabled Fetch ---

class CookieJar {
    private cookies: Map<string, string> = new Map();

    set(setCookieHeader: string | undefined) {
        if (!setCookieHeader) return;
        // Simple parsing, doesn't handle all attributes like Path, Expires, etc.
        setCookieHeader.split(';').forEach(cookiePart => {
            const [key, ...valueParts] = cookiePart.split('=');
            if (key && valueParts.length > 0) {
                this.cookies.set(key.trim(), valueParts.join('=').trim());
            }
        });
    }
    
    // Add a method to set a cookie directly by key/value
    setCookie(key: string, value: string) {
        if (key && value) {
            this.cookies.set(key.trim(), value);
        }
    }

    get(): string {
        // Return all cookies as a single string
        return Array.from(this.cookies.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
    }
}


// --- Plugin Manager ---

class PluginManager {
  private plugins: Plugin[] = [];
  private static instance: PluginManager;

  private constructor() {
    this.loadBuiltInPlugins();
    this.loadPersistedPlugins().catch(err => {
        logger.error('[PluginManager] Error during async initialization', err);
    });
  }

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  private async loadPersistedPlugins() {
    try {
        const storedUrlsJson = await AsyncStorage.getItem(PLUGIN_URLS_STORAGE_KEY);
        if (storedUrlsJson) {
            const urls = JSON.parse(storedUrlsJson);
            if (Array.isArray(urls)) {
                logger.log('[PluginManager] Loading persisted plugins...', urls);
                for (const url of urls) {
                    await this.loadPluginFromUrl(url, false);
                }
            }
        }
    } catch (error) {
        logger.error('[PluginManager] Failed to load persisted plugins:', error);
    }
  }

  private async persistPluginUrl(url: string) {
    try {
        const storedUrlsJson = await AsyncStorage.getItem(PLUGIN_URLS_STORAGE_KEY);
        let urls: string[] = [];
        if (storedUrlsJson) {
            urls = JSON.parse(storedUrlsJson);
        }
        if (!urls.includes(url)) {
            urls.push(url);
            await AsyncStorage.setItem(PLUGIN_URLS_STORAGE_KEY, JSON.stringify(urls));
            logger.log(`[PluginManager] Persisted plugin URL: ${url}`);
        }
    } catch (error) {
        logger.error('[PluginManager] Failed to persist plugin URL:', error);
    }
  }

  private async removePersistedPluginUrl(url: string) {
      try {
          const storedUrlsJson = await AsyncStorage.getItem(PLUGIN_URLS_STORAGE_KEY);
          if (storedUrlsJson) {
              let urls: string[] = JSON.parse(storedUrlsJson);
              const index = urls.indexOf(url);
              if (index > -1) {
                  urls.splice(index, 1);
                  await AsyncStorage.setItem(PLUGIN_URLS_STORAGE_KEY, JSON.stringify(urls));
                  logger.log(`[PluginManager] Removed persisted plugin URL: ${url}`);
              }
          }
      } catch (error) {
          logger.error('[PluginManager] Failed to remove persisted plugin URL:', error);
      }
  }

  public async loadPluginFromUrl(url: string, persist = true): Promise<boolean> {
    logger.log(`[PluginManager] Attempting to load plugin from URL: ${url}`);

    if (this.plugins.some(p => p.sourceUrl === url)) {
        logger.log(`[PluginManager] Plugin from URL ${url} is already loaded.`);
        return true;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch plugin from URL: ${response.statusText}`);
      }
      const pluginCode = await response.text();
      const newPlugin = this.runPlugin(pluginCode, url);

      if (newPlugin) {
        if (persist) {
            await this.persistPluginUrl(url);
        }
      return true;
      }
      
      logger.error(`[PluginManager] Plugin from ${url} executed but failed to register.`);
      return false;

    } catch (error) {
      logger.error(`[PluginManager] Failed to load plugin from URL ${url}:`, error);
      if (persist === false) {
        logger.log(`[PluginManager] Removing failed persisted plugin URL: ${url}`);
        await this.removePersistedPluginUrl(url);
      }
      return false;
    }
  }

  private async loadBuiltInPlugins() {
    try {
      // Provide registerPlugin globally for built-in modules
      (global as any).registerPlugin = (plugin: Plugin) => {
        if (plugin && typeof plugin.getStreams === 'function') {
          this.plugins.push(plugin);
          logger.log(`[PluginManager] Successfully registered plugin: ${plugin.name} v${plugin.version}`);
        } else {
          logger.error('[PluginManager] An invalid plugin was passed to registerPlugin.');
        }
      };

      // Require and execute the built-in MoviesMod plugin module (IIFE)
      require('./plugins/moviesmod.plugin.js');

      delete (global as any).registerPlugin;
    } catch (error) {
      logger.error('[PluginManager] Failed to load built-in MoviesMod plugin:', error);
    }
  }

  public removePlugin(sourceUrl: string) {
    const pluginIndex = this.plugins.findIndex(p => p.sourceUrl === sourceUrl);
    if (pluginIndex > -1) {
        const plugin = this.plugins[pluginIndex];
        this.plugins.splice(pluginIndex, 1);
        logger.log(`[PluginManager] Removed plugin: ${plugin.name}`);
        if (plugin.sourceUrl) {
            this.removePersistedPluginUrl(plugin.sourceUrl).catch(err => {
                logger.error(`[PluginManager] Failed to remove persisted URL: ${plugin.sourceUrl}`, err);
            });
        }
    }
  }

  private runPlugin(pluginCode: string, sourceUrl?: string): Plugin | null {
    let registeredPlugin: Plugin | null = null;
    const pluginsBefore = this.plugins.length;

    // Attempt to strip the JSDoc-style header comment which may cause parsing issues in some JS engines.
    const strippedCode = pluginCode.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');
    logger.log('[PluginManager] Executing plugin code...');

    try {
      // Temporarily expose registerPlugin on the global object for the sandboxed code to use.
      // This is simpler and more reliable than using `with` or the Function constructor's scope.
      (global as any).registerPlugin = (plugin: Plugin) => {
        if (plugin && typeof plugin.getStreams === 'function') {
          if (sourceUrl) plugin.sourceUrl = sourceUrl;
          this.plugins.push(plugin);
          registeredPlugin = plugin;
          logger.log(`[PluginManager] Successfully registered plugin: ${plugin.name} v${plugin.version}`);
        } else {
          logger.error('[PluginManager] An invalid plugin was passed to registerPlugin.');
        }
      };

      // The plugin IIFE will execute immediately.
      // Using eval is a trade-off for simplicity and to avoid potential Function constructor issues.
      // The code is user-provided, so this is a calculated risk.

      // Transpile the code first to support modern JS features like async/await in the runtime.
      const transformedCode = (Babel as any).transform(strippedCode, {
        presets: ['env'],
        sourceType: 'script',
      }).code;

      eval(transformedCode);

      if (this.plugins.length === pluginsBefore) {
        logger.warn('[PluginManager] Plugin code executed, but no plugin was registered.');
      }
    } catch (error) {
      logger.error('[PluginManager] Error executing plugin code:', error);
    } finally {
      // Clean up the global scope to prevent pollution
      delete (global as any).registerPlugin;
    }
    return registeredPlugin;
  }

  public getScraperPlugins(): Plugin[] {
    return this.plugins.filter(p => p.type === 'scraper');
  }

  public async getAllStreams(options: Omit<GetStreamsOptions, 'logger' | 'cache' | 'fetch' | 'fetchWithCookies' | 'setCookie' | 'parseHTML' | 'URL' | 'URLSearchParams' | 'FormData'>): Promise<Stream[]> {
    const scrapers = this.getScraperPlugins();
    if (scrapers.length === 0) {
      logger.log('[PluginManager] No scraper plugins loaded.');
      return [];
    }

    const allStreams: Stream[] = [];

    const cookieJar = new CookieJar();
    const fetchWithCookies = async (url: string, opts: RequestInit = {}): Promise<Response> => {
        const domain = new URL(url).hostname;
        opts.headers = { ...opts.headers, 'Cookie': cookieJar.get() };
        
        const response = await fetch(url, opts);
        
        const setCookieHeader = response.headers.get('Set-Cookie');
        if (setCookieHeader) {
            cookieJar.set(setCookieHeader);
        }
        
        return response;
    };


    const streamPromises = scrapers.map(scraper => {
      const injectedOptions: GetStreamsOptions = {
        ...options,
        logger: logger,
        cache: simpleCache,
        fetch: fetch,
        fetchWithCookies: fetchWithCookies,
        // Expose a function to set a cookie in the jar
        setCookie: (key: string, value: string) => {
            cookieJar.setCookie(key, value);
        },
        parseHTML: cheerio.load,
        URL: URL,
        URLSearchParams: URLSearchParams,
        FormData: FormData,
      };
      
      return scraper.getStreams(injectedOptions)
        .catch(error => {
          logger.error(`[PluginManager] Scraper '${scraper.name}' failed:`, error);
          return []; // Return empty array on failure
        });
    });

    const results = await Promise.all(streamPromises);
    results.forEach(streams => allStreams.push(...streams));

    logger.log(`[PluginManager] Found a total of ${allStreams.length} streams from ${scrapers.length} scrapers.`);
    return allStreams;
  }
}

export const pluginManager = PluginManager.getInstance(); 