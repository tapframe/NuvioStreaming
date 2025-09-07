import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Platform } from 'react-native';
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
  supportedPlatforms?: ('ios' | 'android')[]; // Platforms where this scraper is supported
  disabledPlatforms?: ('ios' | 'android')[]; // Platforms where this scraper is disabled
  // Optional list of supported output formats for this provider (e.g., ["mkv", "mp4"]).
  // We support both `formats` and `supportedFormats` keys for manifest flexibility.
  formats?: string[];
  supportedFormats?: string[];
  repositoryId?: string; // Which repository this scraper came from
}

export interface RepositoryInfo {
  id: string;
  name: string;
  url: string;
  description?: string;
  isDefault?: boolean;
  enabled: boolean;
  lastUpdated?: number;
  scraperCount?: number;
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
  private readonly REPOSITORIES_KEY = 'scraper-repositories';
  private readonly SCRAPER_SETTINGS_KEY = 'scraper-settings';
  private installedScrapers: Map<string, ScraperInfo> = new Map();
  private scraperCode: Map<string, string> = new Map();
  private repositories: Map<string, RepositoryInfo> = new Map();
  private currentRepositoryId: string = '';
  private repositoryUrl: string = '';
  private repositoryName: string = '';
  private initialized: boolean = false;
  private autoRefreshCompleted: boolean = false;
  private isRefreshing: boolean = false;
  private scraperSettingsCache: Record<string, any> | null = null;

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
      // Ensure tapframe repository is available
      await this.ensureTapframeRepository();
      // Load repositories
      const repositoriesData = await AsyncStorage.getItem(this.REPOSITORIES_KEY);
      if (repositoriesData) {
        const repos = JSON.parse(repositoriesData);
        this.repositories = new Map(Object.entries(repos));
      } else {
        // Migrate from old single repository format or create default tapframe repository
        const storedRepoUrl = await AsyncStorage.getItem(this.REPOSITORY_KEY);
        if (storedRepoUrl) {
          const defaultRepo: RepositoryInfo = {
            id: 'default',
            name: this.extractRepositoryName(storedRepoUrl),
            url: storedRepoUrl,
            description: 'Default repository',
            isDefault: true,
            enabled: true,
            lastUpdated: Date.now()
          };
          this.repositories.set('default', defaultRepo);
          this.currentRepositoryId = 'default';
          await this.saveRepositories();
        } else {
          // Create default tapframe repository for new users
          const tapframeRepo: RepositoryInfo = {
            id: 'tapframe-nuvio-providers',
            name: 'Tapframe\'s Repo',
            url: 'https://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main',
            description: 'Official Nuvio streaming plugins repository by Tapframe',
            isDefault: true,
            enabled: true,
            lastUpdated: Date.now()
          };
          this.repositories.set('tapframe-nuvio-providers', tapframeRepo);
          this.currentRepositoryId = 'tapframe-nuvio-providers';
          await this.saveRepositories();
        }
      }

      // Ensure tapframe repository is available for existing users too
      await this.ensureTapframeRepository();

      // Load current repository
      const currentRepoId = await AsyncStorage.getItem('current-repository-id');
      if (currentRepoId && this.repositories.has(currentRepoId)) {
        this.currentRepositoryId = currentRepoId;
        const currentRepo = this.repositories.get(currentRepoId)!;
        this.repositoryUrl = currentRepo.url;
        this.repositoryName = currentRepo.name;
      } else if (this.repositories.size > 0) {
        // Use first repository as default
        const firstRepo = Array.from(this.repositories.values())[0];
        this.currentRepositoryId = firstRepo.id;
        this.repositoryUrl = firstRepo.url;
        this.repositoryName = firstRepo.name;
      }

      // Load installed scrapers
      const storedScrapers = await AsyncStorage.getItem(this.STORAGE_KEY);
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
          // Normalize formats fields (support both `formats` and `supportedFormats`)
          if (typeof (scraper as any).formats === 'string') {
            scraper.formats = [(scraper as any).formats as unknown as string];
          }
          if (typeof (scraper as any).supportedFormats === 'string') {
            scraper.supportedFormats = [(scraper as any).supportedFormats as unknown as string];
          }
          if (!scraper.supportedFormats && scraper.formats) {
            scraper.supportedFormats = scraper.formats;
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
      
      // Auto-refresh repository on app startup if URL is configured (only once)
      if (this.repositoryUrl && !this.autoRefreshCompleted) {
        try {
          logger.log('[LocalScraperService] Auto-refreshing repository on startup');
          await this.performRepositoryRefresh();
          this.autoRefreshCompleted = true;
        } catch (error) {
          logger.error('[LocalScraperService] Auto-refresh failed on startup:', error);
          // Don't fail initialization if auto-refresh fails
          this.autoRefreshCompleted = true; // Mark as completed even on error to prevent retries
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

  /**
   * Ensure the tapframe repository is available for all users
   */
  public async ensureTapframeRepository(): Promise<void> {
    const tapframeRepoId = 'tapframe-nuvio-providers';
    const tapframeRepoUrl = 'https://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main';

    // Check if tapframe repository already exists
    if (this.repositories.has(tapframeRepoId)) {
      const existingRepo = this.repositories.get(tapframeRepoId)!;
      // Update URL if it changed
      if (existingRepo.url !== tapframeRepoUrl) {
        existingRepo.url = tapframeRepoUrl;
        existingRepo.name = 'Tapframe\'s Repo';
        existingRepo.description = 'Official Nuvio streaming plugins repository by Tapframe';
        await this.saveRepositories();
      }
      return;
    }

    // Check if any repository with the same URL already exists
    for (const [id, repo] of this.repositories) {
      if (repo.url === tapframeRepoUrl) {
        // Update existing repository to use the tapframe ID and info
        repo.id = tapframeRepoId;
        repo.name = 'Tapframe\'s Repo';
        repo.description = 'Official Nuvio streaming plugins repository by Tapframe';
        repo.isDefault = true;
        this.repositories.delete(id);
        this.repositories.set(tapframeRepoId, repo);
        await this.saveRepositories();
        return;
      }
    }

    // Create new tapframe repository
    const tapframeRepo: RepositoryInfo = {
      id: tapframeRepoId,
      name: 'Tapframe\'s Repo',
      url: tapframeRepoUrl,
      description: 'Official Nuvio streaming plugins repository by Tapframe',
      isDefault: true,
      enabled: true,
      lastUpdated: Date.now()
    };

    this.repositories.set(tapframeRepoId, tapframeRepo);
    await this.saveRepositories();
  }

  /**
   * Get the official tapframe repository info
   */
  public getTapframeRepositoryInfo(): RepositoryInfo {
    return {
      id: 'tapframe-nuvio-providers',
      name: 'Tapframe\'s Repo',
      url: 'https://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main',
      description: 'Official Nuvio streaming plugins repository by Tapframe',
      isDefault: true,
      enabled: true,
      lastUpdated: Date.now()
    };
  }

  /**
   * Check if the tapframe repository is available
   */
  public hasTapframeRepository(): boolean {
    const tapframeRepoId = 'tapframe-nuvio-providers';
    const tapframeRepoUrl = 'https://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main';

    // Check if tapframe repository exists by ID
    if (this.repositories.has(tapframeRepoId)) {
      return true;
    }

    // Check if any repository has the tapframe URL
    for (const repo of this.repositories.values()) {
      if (repo.url === tapframeRepoUrl) {
        return true;
      }
    }

    return false;
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

  // Get repository name
  getRepositoryName(): string {
    return this.repositoryName || 'Plugins';
  }

  // Multiple repository management methods
  async getRepositories(): Promise<RepositoryInfo[]> {
    await this.ensureInitialized();
    return Array.from(this.repositories.values());
  }

  async addRepository(repo: Omit<RepositoryInfo, 'id' | 'lastUpdated' | 'scraperCount'>): Promise<string> {
    await this.ensureInitialized();
    const id = `repo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Try to fetch the repository name from manifest if not provided
    let repositoryName = repo.name;
    if (!repositoryName || repositoryName.trim() === '') {
      try {
        repositoryName = await this.fetchRepositoryNameFromManifest(repo.url);
      } catch (error) {
        logger.warn('[LocalScraperService] Failed to fetch repository name from manifest, using fallback:', error);
        repositoryName = this.extractRepositoryName(repo.url);
      }
    }
    
    const newRepo: RepositoryInfo = {
      ...repo,
      name: repositoryName,
      id,
      lastUpdated: Date.now(),
      scraperCount: 0
    };
    this.repositories.set(id, newRepo);
    await this.saveRepositories();
    logger.log('[LocalScraperService] Added repository:', newRepo.name);
    return id;
  }

  async updateRepository(id: string, updates: Partial<RepositoryInfo>): Promise<void> {
    await this.ensureInitialized();
    const repo = this.repositories.get(id);
    if (!repo) {
      throw new Error(`Repository with id ${id} not found`);
    }
    const updatedRepo = { ...repo, ...updates };
    this.repositories.set(id, updatedRepo);
    await this.saveRepositories();
    
    // If this is the current repository, update current values
    if (id === this.currentRepositoryId) {
      this.repositoryUrl = updatedRepo.url;
      this.repositoryName = updatedRepo.name;
    }
    logger.log('[LocalScraperService] Updated repository:', updatedRepo.name);
  }

  async removeRepository(id: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.repositories.has(id)) {
      throw new Error(`Repository with id ${id} not found`);
    }
    
    // Allow removing the last repository - users can add new ones
    // The app will work without repositories (no scrapers available)
    
    // If removing current repository, switch to another one or clear current
    if (id === this.currentRepositoryId) {
      const remainingRepos = Array.from(this.repositories.values()).filter(r => r.id !== id);
      if (remainingRepos.length > 0) {
        await this.setCurrentRepository(remainingRepos[0].id);
      } else {
        // No repositories left, clear current repository
        this.currentRepositoryId = '';
        await AsyncStorage.removeItem('current-repository-id');
      }
    }
    
    // Remove scrapers from this repository
    const scrapersToRemove = Array.from(this.installedScrapers.values())
      .filter(s => s.repositoryId === id)
      .map(s => s.id);
    
    for (const scraperId of scrapersToRemove) {
      this.installedScrapers.delete(scraperId);
      this.scraperCode.delete(scraperId);
      await AsyncStorage.removeItem(`scraper-code-${scraperId}`);
    }
    
    this.repositories.delete(id);
    await this.saveRepositories();
    await this.saveInstalledScrapers();
    logger.log('[LocalScraperService] Removed repository:', id);
  }

  async setCurrentRepository(id: string): Promise<void> {
    await this.ensureInitialized();
    const repo = this.repositories.get(id);
    if (!repo) {
      throw new Error(`Repository with id ${id} not found`);
    }
    
    this.currentRepositoryId = id;
    this.repositoryUrl = repo.url;
    this.repositoryName = repo.name;
    
    await AsyncStorage.setItem('current-repository-id', id);
    
    // Refresh the repository to get its scrapers
    try {
      logger.log('[LocalScraperService] Refreshing repository after switch:', repo.name);
      await this.performRepositoryRefresh();
    } catch (error) {
      logger.error('[LocalScraperService] Failed to refresh repository after switch:', error);
      // Don't throw error, just log it - the switch should still succeed
    }
    
    logger.log('[LocalScraperService] Switched to repository:', repo.name);
  }

  getCurrentRepositoryId(): string {
    return this.currentRepositoryId;
  }

  // Public method to extract repository name from URL
  extractRepositoryName(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      if (pathParts.length >= 2) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }
      return urlObj.hostname || 'Unknown Repository';
    } catch {
      return 'Unknown Repository';
    }
  }

  // Fetch repository name from manifest.json
  async fetchRepositoryNameFromManifest(repositoryUrl: string): Promise<string> {
    try {
      logger.log('[LocalScraperService] Fetching repository name from manifest:', repositoryUrl);
      
      // Construct manifest URL
      const baseManifestUrl = repositoryUrl.endsWith('/') 
        ? `${repositoryUrl}manifest.json`
        : `${repositoryUrl}/manifest.json`;
      const manifestUrl = `${baseManifestUrl}?t=${Date.now()}`;
      
      const response = await axios.get(manifestUrl, { 
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.data && response.data.name) {
        logger.log('[LocalScraperService] Found repository name in manifest:', response.data.name);
        return response.data.name;
      } else {
        logger.warn('[LocalScraperService] No name found in manifest, using fallback');
        return this.extractRepositoryName(repositoryUrl);
      }
    } catch (error) {
      logger.error('[LocalScraperService] Failed to fetch repository name from manifest:', error);
      throw error;
    }
  }

  // Update repository name from manifest for existing repositories
  async refreshRepositoryNamesFromManifests(): Promise<void> {
    await this.ensureInitialized();
    
    for (const [id, repo] of this.repositories) {
      try {
        const manifestName = await this.fetchRepositoryNameFromManifest(repo.url);
        if (manifestName !== repo.name) {
          logger.log('[LocalScraperService] Updating repository name:', repo.name, '->', manifestName);
          repo.name = manifestName;
          
          // If this is the current repository, update the current name
          if (id === this.currentRepositoryId) {
            this.repositoryName = manifestName;
          }
        }
      } catch (error) {
        logger.warn('[LocalScraperService] Failed to refresh name for repository:', repo.name, error);
      }
    }
    
    await this.saveRepositories();
  }

  private async saveRepositories(): Promise<void> {
    const reposObject = Object.fromEntries(this.repositories);
    await AsyncStorage.setItem(this.REPOSITORIES_KEY, JSON.stringify(reposObject));
  }


  // Check if a scraper is compatible with the current platform
  private isPlatformCompatible(scraper: ScraperInfo): boolean {
    const currentPlatform = Platform.OS as 'ios' | 'android';
    
    // If disabledPlatforms is specified and includes current platform, scraper is not compatible
    if (scraper.disabledPlatforms && scraper.disabledPlatforms.includes(currentPlatform)) {
      logger.log(`[LocalScraperService] Scraper ${scraper.name} is disabled on ${currentPlatform}`);
      return false;
    }
    
    // If supportedPlatforms is specified and doesn't include current platform, scraper is not compatible
    if (scraper.supportedPlatforms && !scraper.supportedPlatforms.includes(currentPlatform)) {
      logger.log(`[LocalScraperService] Scraper ${scraper.name} is not supported on ${currentPlatform}`);
      return false;
    }
    
    // If neither supportedPlatforms nor disabledPlatforms is specified, or current platform is supported
    return true;
  }

  // Fetch and install scrapers from repository
  async refreshRepository(): Promise<void> {
    await this.ensureInitialized();
    await this.performRepositoryRefresh();
    this.autoRefreshCompleted = true; // Mark as completed after manual refresh
  }

  // Internal method to refresh repository without initialization check
  private async performRepositoryRefresh(): Promise<void> {
    if (!this.repositoryUrl) {
      throw new Error('No repository URL configured');
    }

    // Prevent multiple simultaneous refreshes
    if (this.isRefreshing) {
      logger.log('[LocalScraperService] Repository refresh already in progress, skipping');
      return;
    }

    this.isRefreshing = true;

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
        const isPlatformCompatible = this.isPlatformCompatible(scraperInfo);
        
        if (isPlatformCompatible) {
          // Add repository ID to scraper info
          const scraperWithRepo = { ...scraperInfo, repositoryId: this.currentRepositoryId };
          // Download/update the scraper (downloadScraper handles force disabling based on manifest.enabled)
          await this.downloadScraper(scraperWithRepo);
        } else {
          logger.log('[LocalScraperService] Skipping platform-incompatible scraper:', scraperInfo.name);
          // Remove if it was previously installed but is now platform-incompatible
          if (this.installedScrapers.has(scraperInfo.id)) {
            logger.log('[LocalScraperService] Removing platform-incompatible scraper:', scraperInfo.name);
            this.installedScrapers.delete(scraperInfo.id);
            this.scraperCode.delete(scraperInfo.id);
            await AsyncStorage.removeItem(`scraper-code-${scraperInfo.id}`);
          }
        }
      }
      
      await this.saveInstalledScrapers();
      
      // Update repository info
      const currentRepo = this.repositories.get(this.currentRepositoryId);
      if (currentRepo) {
        const scraperCount = Array.from(this.installedScrapers.values())
          .filter(s => s.repositoryId === this.currentRepositoryId).length;
        await this.updateRepository(this.currentRepositoryId, {
          lastUpdated: Date.now(),
          scraperCount
        });
      }
      
      logger.log('[LocalScraperService] Repository refresh completed');
      
    } catch (error) {
      logger.error('[LocalScraperService] Failed to refresh repository:', error);
      throw error;
    } finally {
      this.isRefreshing = false;
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
      const existingScraper = this.installedScrapers.get(scraperInfo.id);
      const isPlatformCompatible = this.isPlatformCompatible(scraperInfo);
      
      const updatedScraperInfo = {
        ...scraperInfo,
        // Store the manifest's enabled state separately
        manifestEnabled: scraperInfo.enabled,
        // Force disable if:
        // 1. Manifest says enabled: false (globally disabled)
        // 2. Platform incompatible
        // Otherwise, preserve user's enabled state or default to false
        enabled: scraperInfo.enabled && isPlatformCompatible ? (existingScraper?.enabled ?? false) : false
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
      // Normalize formats fields (support both `formats` and `supportedFormats`)
      if (typeof (updatedScraperInfo as any).formats === 'string') {
        updatedScraperInfo.formats = [(updatedScraperInfo as any).formats as unknown as string];
      }
      if (typeof (updatedScraperInfo as any).supportedFormats === 'string') {
        updatedScraperInfo.supportedFormats = [(updatedScraperInfo as any).supportedFormats as unknown as string];
      }
      if (!updatedScraperInfo.supportedFormats && updatedScraperInfo.formats) {
        updatedScraperInfo.supportedFormats = updatedScraperInfo.formats;
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

  // Per-scraper settings storage
  async getScraperSettings(scraperId: string): Promise<Record<string, any>> {
    await this.ensureInitialized();
    try {
      if (!this.scraperSettingsCache) {
        const raw = await AsyncStorage.getItem(this.SCRAPER_SETTINGS_KEY);
        this.scraperSettingsCache = raw ? JSON.parse(raw) : {};
      }
      const cache = this.scraperSettingsCache || {};
      return cache[scraperId] || {};
    } catch (error) {
      logger.warn('[LocalScraperService] Failed to get scraper settings for', scraperId, error);
      return {};
    }
  }

  async setScraperSettings(scraperId: string, settings: Record<string, any>): Promise<void> {
    await this.ensureInitialized();
    try {
      if (!this.scraperSettingsCache) {
        const raw = await AsyncStorage.getItem(this.SCRAPER_SETTINGS_KEY);
        this.scraperSettingsCache = raw ? JSON.parse(raw) : {};
      }
      const cache = this.scraperSettingsCache || {};
      cache[scraperId] = settings || {};
      this.scraperSettingsCache = cache;
      await AsyncStorage.setItem(this.SCRAPER_SETTINGS_KEY, JSON.stringify(cache));
    } catch (error) {
      logger.error('[LocalScraperService] Failed to set scraper settings for', scraperId, error);
    }
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
      
      // Return scrapers from manifest, respecting manifest's enabled field and platform compatibility
      const availableScrapers = manifest.scrapers
        .filter(scraperInfo => this.isPlatformCompatible(scraperInfo))
        .map(scraperInfo => {
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

          // Normalize formats fields (support both `formats` and `supportedFormats`)
          const anyScraper: any = scraperWithManifestData as any;
          if (typeof anyScraper.formats === 'string') {
            anyScraper.formats = [anyScraper.formats];
          }
          if (typeof anyScraper.supportedFormats === 'string') {
            anyScraper.supportedFormats = [anyScraper.supportedFormats];
          }
          if (!anyScraper.supportedFormats && anyScraper.formats) {
            anyScraper.supportedFormats = anyScraper.formats;
          }
          
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

  // Check if a given scraper declares support for a specific format (e.g., 'mkv')
  async supportsFormat(scraperId: string, format: string): Promise<boolean> {
    await this.ensureInitialized();
    try {
      const available = await this.getAvailableScrapers();
      const info = available.find(s => s.id === scraperId);
      if (!info) return false;
      const formats = (info.supportedFormats || info.formats || [])
        .filter(Boolean)
        .map(f => (typeof f === 'string' ? f.toLowerCase() : String(f).toLowerCase()));
      const supported = formats.includes((format || '').toLowerCase());
      logger.log(`[LocalScraperService] supportsFormat('${scraperId}', '${format}') -> ${supported}. Formats: ${JSON.stringify(formats)}`);
      return supported;
    } catch (e) {
      logger.warn(`[LocalScraperService] supportsFormat('${scraperId}', '${format}') failed`, e);
      return false;
    }
  }

  // Enable/disable scraper
  async setScraperEnabled(scraperId: string, enabled: boolean): Promise<void> {
    await this.ensureInitialized();
    
    const scraper = this.installedScrapers.get(scraperId);
    if (scraper) {
      // Prevent enabling if manifest has disabled it or if platform-incompatible
      if (enabled && (scraper.manifestEnabled === false || !this.isPlatformCompatible(scraper))) {
        logger.log('[LocalScraperService] Cannot enable scraper', scraperId, '- disabled in manifest or platform-incompatible');
        return;
      }
      
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
      
      // Load per-scraper settings
      const scraperSettings = await this.getScraperSettings(scraper.id);
      
      // Create a sandboxed execution environment
      const results = await this.executeSandboxed(code, {
        tmdbId,
        mediaType: type,
        season,
        episode,
        scraperId: scraper.id,
        settings: scraperSettings
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
      
      // Load per-scraper settings for this run
      const allScraperSettingsRaw = await AsyncStorage.getItem(this.SCRAPER_SETTINGS_KEY);
      const allScraperSettings = allScraperSettingsRaw ? JSON.parse(allScraperSettingsRaw) : {};
      const perScraperSettings = (params && params.scraperId && allScraperSettings[params.scraperId]) ? allScraperSettings[params.scraperId] : (params?.settings || {});
      
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
        URL_VALIDATION_ENABLED: urlValidationEnabled,
        // Expose per-scraper settings to the plugin code
        SCRAPER_SETTINGS: perScraperSettings,
        SCRAPER_ID: params?.scraperId
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