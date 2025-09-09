import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';
import { imageCacheService } from './imageCacheService';

// Storage keys
export const TRAKT_ACCESS_TOKEN_KEY = 'trakt_access_token';
export const TRAKT_REFRESH_TOKEN_KEY = 'trakt_refresh_token';
export const TRAKT_TOKEN_EXPIRY_KEY = 'trakt_token_expiry';

// Trakt API configuration
const TRAKT_API_URL = 'https://api.trakt.tv';
const TRAKT_CLIENT_ID = 'd7271f7dd57d8aeff63e99408610091a6b1ceac3b3a541d1031a48f429b7942c';
const TRAKT_CLIENT_SECRET = '0abf42c39aaad72c74696fb5229b558a6ac4b747caf3d380d939e950e8a5449c';
const TRAKT_REDIRECT_URI = 'stremioexpo://auth/trakt'; // This should match your registered callback URL

// Types
export interface TraktUser {
  username: string;
  name?: string;
  private: boolean;
  vip: boolean;
  joined_at: string;
  avatar?: string;
}

export interface TraktWatchedItem {
  movie?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  show?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  plays: number;
  last_watched_at: string;
}

export interface TraktWatchlistItem {
  movie?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  show?: {
    title: string;
    year: number
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  listed_at: string;
}

export interface TraktCollectionItem {
  movie?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  show?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  collected_at: string;
}

export interface TraktRatingItem {
  movie?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  show?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  rating: number;
  rated_at: string;
}

export interface TraktImages {
  fanart?: string[];
  poster?: string[];
  logo?: string[];
  clearart?: string[];
  banner?: string[];
  thumb?: string[];
}

export interface TraktItemWithImages {
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    imdb: string;
    tmdb: number;
  };
  images?: TraktImages;
}

// New types for scrobbling
export interface TraktPlaybackItem {
  progress: number;
  paused_at: string;
  id: number;
  type: 'movie' | 'episode';
  movie?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
  episode?: {
    season: number;
    number: number;
    title: string;
    ids: {
      trakt: number;
      tvdb?: number;
      imdb?: string;
      tmdb?: number;
    };
    images?: TraktImages;
  };
  show?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      tvdb?: number;
      imdb: string;
      tmdb: number;
    };
    images?: TraktImages;
  };
}

export interface TraktScrobbleResponse {
  id: number;
  action: 'start' | 'pause' | 'scrobble' | 'conflict';
  progress: number;
  sharing?: {
    twitter?: boolean;
    mastodon?: boolean;
    tumblr?: boolean;
    facebook?: boolean;
  };
  movie?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      imdb: string;
      tmdb: number;
    };
  };
  episode?: {
    season: number;
    number: number;
    title: string;
    ids: {
      trakt: number;
      tvdb?: number;
      imdb?: string;
      tmdb?: number;
    };
  };
  show?: {
    title: string;
    year: number;
    ids: {
      trakt: number;
      slug: string;
      tvdb?: number;
      imdb: string;
      tmdb: number;
    };
  };
  // Additional field for 409 handling
  alreadyScrobbled?: boolean;
}

export interface TraktContentData {
  type: 'movie' | 'episode';
  imdbId: string;
  title: string;
  year: number;
  season?: number;
  episode?: number;
  showTitle?: string;
  showYear?: number;
  showImdbId?: string;
}

export class TraktService {
  private static instance: TraktService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  private isInitialized: boolean = false;
  
  // Rate limiting
  private lastApiCall: number = 0;
  private readonly MIN_API_INTERVAL = 3000; // Minimum 3 seconds between API calls (further reduce heating)
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;

  // Track items that have been successfully scrobbled to prevent duplicates
  private scrobbledItems: Set<string> = new Set();
  private readonly SCROBBLE_EXPIRY_MS = 46 * 60 * 1000; // 46 minutes (based on Trakt's expiry window)
  private scrobbledTimestamps: Map<string, number> = new Map();

  // Track currently watching sessions to avoid duplicate starts// Sync debouncing
  private currentlyWatching: Set<string> = new Set();
  private lastSyncTimes: Map<string, number> = new Map();
  private readonly SYNC_DEBOUNCE_MS = 20000; // 20 seconds to further reduce API calls
  
  // Debounce for stop calls
  private lastStopCalls: Map<string, number> = new Map();
  private readonly STOP_DEBOUNCE_MS = 3000; // 3 seconds to avoid duplicate stop calls
  
  // Default completion threshold (overridden by user settings)
  private readonly DEFAULT_COMPLETION_THRESHOLD = 80; // 80%

  private constructor() {
    // Increased cleanup interval from 5 minutes to 15 minutes to reduce heating
    setInterval(() => this.cleanupOldStopCalls(), 15 * 60 * 1000); // Clean up every 15 minutes
    
    // Add AppState cleanup to reduce memory pressure
    AppState.addEventListener('change', this.handleAppStateChange);
    
    // Load user settings
    this.loadCompletionThreshold();
  }

  /**
   * Load user-configured completion threshold from AsyncStorage
   */
  private async loadCompletionThreshold(): Promise<void> {
    try {
      const thresholdStr = await AsyncStorage.getItem('@trakt_completion_threshold');
      if (thresholdStr) {
        const threshold = parseInt(thresholdStr, 10);
        if (!isNaN(threshold) && threshold >= 50 && threshold <= 100) {
          logger.log(`[TraktService] Loaded user completion threshold: ${threshold}%`);
          this.completionThreshold = threshold;
        }
      }
    } catch (error) {
      logger.error('[TraktService] Error loading completion threshold:', error);
    }
  }
  
  /**
   * Get the current completion threshold (user-configured or default)
   */
  private get completionThreshold(): number {
    return this._completionThreshold || this.DEFAULT_COMPLETION_THRESHOLD;
  }
  
  /**
   * Set the completion threshold
   */
  private set completionThreshold(value: number) {
    this._completionThreshold = value;
  }
  
  // Backing field for completion threshold
  private _completionThreshold: number | null = null;

  /**
   * Clean up old stop call records to prevent memory leaks
   */
  private cleanupOldStopCalls(): void {
    const now = Date.now();
    let cleanupCount = 0;
    
    // Remove stop calls older than the debounce window
    for (const [key, timestamp] of this.lastStopCalls.entries()) {
      if (now - timestamp > this.STOP_DEBOUNCE_MS) {
        this.lastStopCalls.delete(key);
        cleanupCount++;
      }
    }
    
    // Also clean up old scrobbled timestamps
    for (const [key, timestamp] of this.scrobbledTimestamps.entries()) {
      if (now - timestamp > this.SCROBBLE_EXPIRY_MS) {
        this.scrobbledTimestamps.delete(key);
        this.scrobbledItems.delete(key);
        cleanupCount++;
      }
    }
    
    // Clean up old sync times that haven't been updated in a while
    for (const [key, timestamp] of this.lastSyncTimes.entries()) {
      if (now - timestamp > 24 * 60 * 60 * 1000) { // 24 hours
        this.lastSyncTimes.delete(key);
        cleanupCount++;
      }
    }
    
    // Skip verbose cleanup logging to reduce CPU load
  }

  public static getInstance(): TraktService {
    if (!TraktService.instance) {
      TraktService.instance = new TraktService();
    }
    return TraktService.instance;
  }

  /**
   * Initialize the Trakt service by loading stored tokens
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const [accessToken, refreshToken, tokenExpiry] = await Promise.all([
        AsyncStorage.getItem(TRAKT_ACCESS_TOKEN_KEY),
        AsyncStorage.getItem(TRAKT_REFRESH_TOKEN_KEY),
        AsyncStorage.getItem(TRAKT_TOKEN_EXPIRY_KEY)
      ]);

      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.tokenExpiry = tokenExpiry ? parseInt(tokenExpiry, 10) : 0;
      this.isInitialized = true;

      logger.log('[TraktService] Initialized, authenticated:', !!this.accessToken);
    } catch (error) {
      logger.error('[TraktService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if the user is authenticated with Trakt
   */
  public async isAuthenticated(): Promise<boolean> {
    await this.ensureInitialized();
    
    if (!this.accessToken) {
      return false;
    }

    // Check if token is expired and needs refresh
    if (this.tokenExpiry && this.tokenExpiry < Date.now() && this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return !!this.accessToken;
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the authentication URL for Trakt OAuth
   */
  public getAuthUrl(): string {
    return `https://trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(TRAKT_REDIRECT_URI)}`;
  }

  /**
   * Exchange the authorization code for an access token
   */
  public async exchangeCodeForToken(code: string, codeVerifier: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const response = await fetch(`${TRAKT_API_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code,
          client_id: TRAKT_CLIENT_ID,
          client_secret: TRAKT_CLIENT_SECRET,
          redirect_uri: TRAKT_REDIRECT_URI,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('[TraktService] Token exchange error response:', errorBody);
        throw new Error(`Failed to exchange code: ${response.status}`);
      }

      const data = await response.json();
      await this.saveTokens(data.access_token, data.refresh_token, data.expires_in);
      return true;
    } catch (error) {
      logger.error('[TraktService] Failed to exchange code for token:', error);
      return false;
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${TRAKT_API_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: this.refreshToken,
          client_id: TRAKT_CLIENT_ID,
          client_secret: TRAKT_CLIENT_SECRET,
          redirect_uri: TRAKT_REDIRECT_URI,
          grant_type: 'refresh_token'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh token: ${response.status}`);
      }

      const data = await response.json();
      await this.saveTokens(data.access_token, data.refresh_token, data.expires_in);
    } catch (error) {
      logger.error('[TraktService] Failed to refresh token:', error);
      await this.logout(); // Clear tokens if refresh fails
      throw error;
    }
  }

  /**
   * Save authentication tokens to storage
   */
  private async saveTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = Date.now() + (expiresIn * 1000);

    try {
      await AsyncStorage.multiSet([
        [TRAKT_ACCESS_TOKEN_KEY, accessToken],
        [TRAKT_REFRESH_TOKEN_KEY, refreshToken],
        [TRAKT_TOKEN_EXPIRY_KEY, this.tokenExpiry.toString()]
      ]);
      logger.log('[TraktService] Tokens saved successfully');
    } catch (error) {
      logger.error('[TraktService] Failed to save tokens:', error);
      throw error;
    }
  }

  /**
   * Log out the user by clearing all tokens
   */
  public async logout(): Promise<void> {
    await this.ensureInitialized();

    try {
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiry = 0;

      await AsyncStorage.multiRemove([
        TRAKT_ACCESS_TOKEN_KEY,
        TRAKT_REFRESH_TOKEN_KEY,
        TRAKT_TOKEN_EXPIRY_KEY
      ]);
      logger.log('[TraktService] Logged out successfully');
    } catch (error) {
      logger.error('[TraktService] Failed to logout:', error);
      throw error;
    }
  }

  /**
   * Ensure the service is initialized before performing operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Make an authenticated API request to Trakt
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    retryCount: number = 0
  ): Promise<T> {
    await this.ensureInitialized();

    // Rate limiting: ensure minimum interval between API calls
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.MIN_API_INTERVAL) {
      const delay = this.MIN_API_INTERVAL - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    this.lastApiCall = Date.now();

    // Ensure we have a valid token
    if (this.tokenExpiry && this.tokenExpiry < Date.now() && this.refreshToken) {
      await this.refreshAccessToken();
    }

    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID,
      'Authorization': `Bearer ${this.accessToken}`
    };

    const options: RequestInit = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${TRAKT_API_URL}${endpoint}`, options);

    // Debug logging removed to reduce terminal noise

    // Handle rate limiting with exponential backoff
    if (response.status === 429) {
      const maxRetries = 3;
      if (retryCount < maxRetries) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
        
        logger.log(`[TraktService] Rate limited (429), retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.apiRequest<T>(endpoint, method, body, retryCount + 1);
      } else {
        logger.error(`[TraktService] Rate limited (429), max retries exceeded for ${endpoint}`);
        throw new Error(`API request failed: 429 (Rate Limited)`);
      }
    }

    // Handle 409 conflicts gracefully (already watched/scrobbled)
    if (response.status === 409) {
      const errorText = await response.text();
      logger.log(`[TraktService] Content already scrobbled (409) for ${endpoint}:`, errorText);
      
      // Parse the error response to get expiry info
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.watched_at && errorData.expires_at) {
          logger.log(`[TraktService] Item was already watched at ${errorData.watched_at}, expires at ${errorData.expires_at}`);
          
          // If this is a scrobble endpoint, mark the item as already scrobbled
          if (endpoint.includes('/scrobble/') && body) {
            const contentKey = this.getContentKeyFromPayload(body);
            if (contentKey) {
              this.scrobbledItems.add(contentKey);
              this.scrobbledTimestamps.set(contentKey, Date.now());
              logger.log(`[TraktService] Marked content as already scrobbled: ${contentKey}`);
            }
          }
          
          // Return a success-like response for 409 conflicts
          // This prevents the error from bubbling up and causing retry loops
          return {
            id: 0,
            action: endpoint.includes('/stop') ? 'scrobble' : 'start',
            progress: body?.progress || 0,
            alreadyScrobbled: true
          } as any;
        }
      } catch (parseError) {
        logger.warn(`[TraktService] Could not parse 409 error response: ${parseError}`);
      }
      
      // Return a graceful response even if we can't parse the error
      return {
        id: 0,
        action: 'conflict',
        progress: 0,
        alreadyScrobbled: true
      } as any;
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[TraktService] API Error ${response.status} for ${endpoint}:`, errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    // Handle "No Content" responses (204/205) which have no JSON body
    if (response.status === 204 || response.status === 205) {
      // Return null casted to expected type to satisfy caller's generic
      return null as unknown as T;
    }

    // Some endpoints (e.g., DELETE) may also return empty body with 200. Attempt safe parse.
    let responseData: T;
    try {
      responseData = await response.json() as T;
    } catch (parseError) {
      // If body is empty, return null instead of throwing
      logger.warn(`[TraktService] Empty JSON body for ${endpoint}, returning null`);
      return null as unknown as T;
    }

    // Debug log successful scrobble responses
    if (endpoint.includes('/scrobble/')) {
      // API success logging removed
    }
    
    return responseData;
  }

  /**
   * Helper method to extract content key from scrobble payload for deduplication
   */
  private getContentKeyFromPayload(payload: any): string | null {
    try {
      if (payload.movie && payload.movie.ids && payload.movie.ids.imdb) {
        return `movie:${payload.movie.ids.imdb}`;
      } else if (payload.episode && payload.show && payload.show.ids && payload.show.ids.imdb) {
        return `episode:${payload.show.ids.imdb}:${payload.episode.season}:${payload.episode.number}`;
      }
    } catch (error) {
      logger.warn('[TraktService] Could not extract content key from payload:', error);
    }
    return null;
  }

  /**
   * Check if content was recently scrobbled to prevent duplicates
   */
  private isRecentlyScrobbled(contentData: TraktContentData): boolean {
    const contentKey = this.getWatchingKey(contentData);
    
    // Clean up expired entries
    const now = Date.now();
    for (const [key, timestamp] of this.scrobbledTimestamps.entries()) {
      if (now - timestamp > this.SCROBBLE_EXPIRY_MS) {
        this.scrobbledItems.delete(key);
        this.scrobbledTimestamps.delete(key);
      }
    }
    
    return this.scrobbledItems.has(contentKey);
  }

  /**
   * Get the user's profile information
   */
  public async getUserProfile(): Promise<TraktUser> {
    return this.apiRequest<TraktUser>('/users/me?extended=full');
  }

  /**
   * Get the user's watched movies
   */
  public async getWatchedMovies(): Promise<TraktWatchedItem[]> {
    return this.apiRequest<TraktWatchedItem[]>('/sync/watched/movies');
  }

  /**
   * Get the user's watched shows
   */
  public async getWatchedShows(): Promise<TraktWatchedItem[]> {
    return this.apiRequest<TraktWatchedItem[]>('/sync/watched/shows');
  }

  /**
   * Get the user's watchlist movies
   */
  public async getWatchlistMovies(): Promise<TraktWatchlistItem[]> {
    return this.apiRequest<TraktWatchlistItem[]>('/sync/watchlist/movies');
  }

  /**
   * Get the user's watchlist shows
   */
  public async getWatchlistShows(): Promise<TraktWatchlistItem[]> {
    return this.apiRequest<TraktWatchlistItem[]>('/sync/watchlist/shows');
  }

  /**
   * Get the user's collection movies
   */
  public async getCollectionMovies(): Promise<TraktCollectionItem[]> {
    return this.apiRequest<TraktCollectionItem[]>('/sync/collection/movies');
  }

  /**
   * Get the user's collection shows
   */
  public async getCollectionShows(): Promise<TraktCollectionItem[]> {
    return this.apiRequest<TraktCollectionItem[]>('/sync/collection/shows');
  }

  /**
   * Get the user's ratings
   */
  public async getRatings(type?: 'movies' | 'shows'): Promise<TraktRatingItem[]> {
    const endpoint = type ? `/sync/ratings/${type}` : '/sync/ratings';
    return this.apiRequest<TraktRatingItem[]>(endpoint);
  }

  /**
   * Get the user's watched movies with images
   */
  public async getWatchedMoviesWithImages(): Promise<TraktWatchedItem[]> {
    return this.apiRequest<TraktWatchedItem[]>('/sync/watched/movies?extended=images');
  }

  /**
   * Get the user's watched shows with images
   */
  public async getWatchedShowsWithImages(): Promise<TraktWatchedItem[]> {
    return this.apiRequest<TraktWatchedItem[]>('/sync/watched/shows?extended=images');
  }

  /**
   * Get the user's watchlist movies with images
   */
  public async getWatchlistMoviesWithImages(): Promise<TraktWatchlistItem[]> {
    return this.apiRequest<TraktWatchlistItem[]>('/sync/watchlist/movies?extended=images');
  }

  /**
   * Get the user's watchlist shows with images
   */
  public async getWatchlistShowsWithImages(): Promise<TraktWatchlistItem[]> {
    return this.apiRequest<TraktWatchlistItem[]>('/sync/watchlist/shows?extended=images');
  }

  /**
   * Get the user's collection movies with images
   */
  public async getCollectionMoviesWithImages(): Promise<TraktCollectionItem[]> {
    return this.apiRequest<TraktCollectionItem[]>('/sync/collection/movies?extended=images');
  }

  /**
   * Get the user's collection shows with images
   */
  public async getCollectionShowsWithImages(): Promise<TraktCollectionItem[]> {
    return this.apiRequest<TraktCollectionItem[]>('/sync/collection/shows?extended=images');
  }

  /**
   * Get the user's ratings with images
   */
  public async getRatingsWithImages(type?: 'movies' | 'shows'): Promise<TraktRatingItem[]> {
    const endpoint = type ? `/sync/ratings/${type}?extended=images` : '/sync/ratings?extended=images';
    return this.apiRequest<TraktRatingItem[]>(endpoint);
  }

  /**
   * Get playback progress with images
   */
  public async getPlaybackProgressWithImages(type?: 'movies' | 'shows'): Promise<TraktPlaybackItem[]> {
    try {
      const endpoint = type ? `/sync/playback/${type}?extended=images` : '/sync/playback?extended=images';
      return this.apiRequest<TraktPlaybackItem[]>(endpoint);
    } catch (error) {
      logger.error('[TraktService] Failed to get playback progress with images:', error);
      return [];
    }
  }

  /**
   * Extract poster URL from Trakt images with basic caching
   */
  public static getTraktPosterUrl(images?: TraktImages): string | null {
    if (!images || !images.poster || images.poster.length === 0) {
      return null;
    }
    
    // Get the first poster and add https prefix
    const posterPath = images.poster[0];
    const fullUrl = posterPath.startsWith('http') ? posterPath : `https://${posterPath}`;
    
    // Try to use cached version synchronously (basic cache check)
    const isCached = imageCacheService.isCached(fullUrl);
    if (isCached) {
      logger.log(`[TraktService] 🎯 Using cached poster: ${fullUrl.substring(0, 60)}...`);
    } else {
      logger.log(`[TraktService] 📥 New poster URL: ${fullUrl.substring(0, 60)}...`);
      // Queue for async caching
      imageCacheService.getCachedImageUrl(fullUrl).catch(error => {
        logger.error('[TraktService] Background caching failed:', error);
      });
    }
    
    return fullUrl;
  }
  
  /**
   * Extract poster URL from Trakt images with async caching
   */
  public static async getTraktPosterUrlCached(images?: TraktImages): Promise<string | null> {
    const url = this.getTraktPosterUrl(images);
    if (!url) return null;
    
    try {
      return await imageCacheService.getCachedImageUrl(url);
    } catch (error) {
      logger.error('[TraktService] Failed to cache image:', error);
      return url;
    }
  }

  /**
   * Extract fanart URL from Trakt images
   */
  public static getTraktFanartUrl(images?: TraktImages): string | null {
    if (!images || !images.fanart || images.fanart.length === 0) {
      return null;
    }
    
    // Get the first fanart and add https prefix
    const fanartPath = images.fanart[0];
    return fanartPath.startsWith('http') ? fanartPath : `https://${fanartPath}`;
  }

  /**
   * Get trakt id from IMDb id
   */
  public async getTraktIdFromImdbId(imdbId: string, type: 'movies' | 'shows'): Promise<number | null> {
    try {
      const response = await fetch(`${TRAKT_API_URL}/search/${type}?id_type=imdb&id=${imdbId}`, {
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': TRAKT_CLIENT_ID
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get Trakt ID: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.length > 0) {
        return data[0][type.slice(0, -1)].ids.trakt;
      }
      return null;
    } catch (error) {
      logger.error('[TraktService] Failed to get Trakt ID from IMDb ID:', error);
      return null;
    }
  }

  /**
   * Add a movie to user's watched history
   */
  public async addToWatchedMovies(imdbId: string, watchedAt: Date = new Date()): Promise<boolean> {
    try {
      const traktId = await this.getTraktIdFromImdbId(imdbId, 'movies');
      if (!traktId) {
        return false;
      }

      await this.apiRequest('/sync/history', 'POST', {
        movies: [
          {
            ids: {
              trakt: traktId
            },
            watched_at: watchedAt.toISOString()
          }
        ]
      });
      return true;
    } catch (error) {
      logger.error('[TraktService] Failed to mark movie as watched:', error);
      return false;
    }
  }

  /**
   * Add a show episode to user's watched history
   */
  public async addToWatchedEpisodes(
    imdbId: string, 
    season: number, 
    episode: number, 
    watchedAt: Date = new Date()
  ): Promise<boolean> {
    try {
      const traktId = await this.getTraktIdFromImdbId(imdbId, 'shows');
      if (!traktId) {
        return false;
      }

      await this.apiRequest('/sync/history', 'POST', {
        episodes: [
          {
            ids: {
              trakt: traktId
            },
            seasons: [
              {
                number: season,
                episodes: [
                  {
                    number: episode,
                    watched_at: watchedAt.toISOString()
                  }
                ]
              }
            ]
          }
        ]
      });
      return true;
    } catch (error) {
      logger.error('[TraktService] Failed to mark episode as watched:', error);
      return false;
    }
  }

  /**
   * Check if a movie is in user's watched history
   */
  public async isMovieWatched(imdbId: string): Promise<boolean> {
    try {
      if (!this.accessToken) {
        return false;
      }

      const traktId = await this.getTraktIdFromImdbId(imdbId, 'movies');
      if (!traktId) {
        return false;
      }

      const response = await this.apiRequest<any[]>(`/sync/history/movies/${traktId}`);
      return response.length > 0;
    } catch (error) {
      logger.error('[TraktService] Failed to check if movie is watched:', error);
      return false;
    }
  }

  /**
   * Check if a show episode is in user's watched history
   */
  public async isEpisodeWatched(
    imdbId: string, 
    season: number, 
    episode: number
  ): Promise<boolean> {
    try {
      if (!this.accessToken) {
        return false;
      }

      const traktId = await this.getTraktIdFromImdbId(imdbId, 'shows');
      if (!traktId) {
        return false;
      }

      const response = await this.apiRequest<any[]>(
        `/sync/history/episodes/${traktId}?season=${season}&episode=${episode}`
      );
      return response.length > 0;
    } catch (error) {
      logger.error('[TraktService] Failed to check if episode is watched:', error);
      return false;
    }
  }

  /**
   * Get current playback progress from Trakt
   */
  public async getPlaybackProgress(type?: 'movies' | 'shows'): Promise<TraktPlaybackItem[]> {
    try {
      const endpoint = type ? `/sync/playback/${type}` : '/sync/playback';
      return this.apiRequest<TraktPlaybackItem[]>(endpoint);
    } catch (error) {
      logger.error('[TraktService] Failed to get playback progress:', error);
      return [];
    }
  }

  /**
   * Start watching content (scrobble start)
   */
  public async startWatching(contentData: TraktContentData, progress: number): Promise<TraktScrobbleResponse | null> {
    try {
      const payload = await this.buildScrobblePayload(contentData, progress);
      if (!payload) {
        return null;
      }

      return this.apiRequest<TraktScrobbleResponse>('/scrobble/start', 'POST', payload);
    } catch (error) {
      logger.error('[TraktService] Failed to start watching:', error);
      return null;
    }
  }

  /**
   * Pause watching content (scrobble pause)
   */
  public async pauseWatching(contentData: TraktContentData, progress: number): Promise<TraktScrobbleResponse | null> {
    try {
      const payload = await this.buildScrobblePayload(contentData, progress);
      if (!payload) {
        return null;
      }

      return this.apiRequest<TraktScrobbleResponse>('/scrobble/pause', 'POST', payload);
    } catch (error) {
      logger.error('[TraktService] Failed to pause watching:', error);
      return null;
    }
  }

  /**
   * Stop watching content (scrobble stop) - handles completion logic
   */
  public async stopWatching(contentData: TraktContentData, progress: number): Promise<TraktScrobbleResponse | null> {
    try {
      const payload = await this.buildScrobblePayload(contentData, progress);
      if (!payload) {
        return null;
      }

      return this.apiRequest<TraktScrobbleResponse>('/scrobble/stop', 'POST', payload);
    } catch (error) {
      logger.error('[TraktService] Failed to stop watching:', error);
      return null;
    }
  }

  /**
   * Update watching progress or mark as complete (legacy method)
   * @deprecated Use specific methods: startWatching, pauseWatching, stopWatching
   */
  public async updateProgress(contentData: TraktContentData, progress: number): Promise<TraktScrobbleResponse | null> {
    // For backwards compatibility, use stop for now
    return this.stopWatching(contentData, progress);
  }

  /**
   * Build scrobble payload for API requests
   */
  private async buildScrobblePayload(contentData: TraktContentData, progress: number): Promise<any | null> {
    try {
      if (contentData.type === 'movie') {
        // Clean IMDB ID - some APIs want it without 'tt' prefix
        const cleanImdbId = contentData.imdbId.startsWith('tt') 
          ? contentData.imdbId.substring(2) 
          : contentData.imdbId;
        
        const payload = {
          movie: {
            title: contentData.title,
            year: contentData.year,
            ids: {
              imdb: cleanImdbId
            }
          },
          progress: Math.round(progress * 100) / 100 // Round to 2 decimal places
        };
        
        // Movie payload logging removed
        return payload;
      } else if (contentData.type === 'episode') {
        if (!contentData.season || !contentData.episode || !contentData.showTitle || !contentData.showYear) {
          logger.error('[TraktService] Missing episode data for scrobbling');
          return null;
        }

        const payload: any = {
          show: {
            title: contentData.showTitle,
            year: contentData.showYear,
            ids: {}
          },
          episode: {
            season: contentData.season,
            number: contentData.episode
          },
          progress: Math.round(progress * 100) / 100
        };

        // Add show IMDB ID if available
        if (contentData.showImdbId) {
          const cleanShowImdbId = contentData.showImdbId.startsWith('tt') 
            ? contentData.showImdbId.substring(2) 
            : contentData.showImdbId;
          payload.show.ids.imdb = cleanShowImdbId;
        }

        // Add episode IMDB ID if available (for specific episode IDs)
        if (contentData.imdbId && contentData.imdbId !== contentData.showImdbId) {
          const cleanEpisodeImdbId = contentData.imdbId.startsWith('tt') 
            ? contentData.imdbId.substring(2) 
            : contentData.imdbId;
          
          if (!payload.episode.ids) {
            payload.episode.ids = {};
          }
          
          payload.episode.ids.imdb = cleanEpisodeImdbId;
        }

        // Episode payload logging removed
        return payload;
      }

      return null;
    } catch (error) {
      logger.error('[TraktService] Failed to build scrobble payload:', error);
      return null;
    }
  }

  /**
   * Process the request queue with proper rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          logger.error('[TraktService] Queue request failed:', error);
        }
        
        // Wait minimum interval before next request
        if (this.requestQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.MIN_API_INTERVAL));
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Add request to queue for rate-limited processing
   */
  private queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Generate a unique key for content being watched
   */
  private getWatchingKey(contentData: TraktContentData): string {
    if (contentData.type === 'movie') {
      return `movie:${contentData.imdbId}`;
    } else {
      return `episode:${contentData.showImdbId || contentData.imdbId}:S${contentData.season}E${contentData.episode}`;
    }
  }

  /**
   * Start watching content (use when playback begins)
   */
  public async scrobbleStart(contentData: TraktContentData, progress: number): Promise<boolean> {
    try {
      if (!await this.isAuthenticated()) {
        return false;
      }

      const watchingKey = this.getWatchingKey(contentData);

      // Check if this content was recently scrobbled (to prevent duplicates from component remounts)
      if (this.isRecentlyScrobbled(contentData)) {
        logger.log(`[TraktService] Content was recently scrobbled, skipping start: ${contentData.title}`);
        return true;
      }

      // ENHANCED PROTECTION: Check if we recently stopped this content with high progress
      // This prevents restarting sessions for content that was just completed
      const lastStopTime = this.lastStopCalls.get(watchingKey);
      if (lastStopTime && (Date.now() - lastStopTime) < 30000) { // 30 seconds
        logger.log(`[TraktService] Recently stopped this content (${((Date.now() - lastStopTime) / 1000).toFixed(1)}s ago), preventing restart: ${contentData.title}`);
        return true;
      }

      // Debug log removed to reduce terminal noise
      
      // Only start if not already watching this content
      if (this.currentlyWatching.has(watchingKey)) {
        logger.log(`[TraktService] Already watching this content, skipping start: ${contentData.title}`);
        return true; // Already started
      }

      const result = await this.queueRequest(async () => {
        return await this.startWatching(contentData, progress);
      });

      if (result) {
        this.currentlyWatching.add(watchingKey);
        logger.log(`[TraktService] Started watching ${contentData.type}: ${contentData.title}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[TraktService] Failed to start scrobbling:', error);
      return false;
    }
  }

  /**
   * Update progress while watching (use for periodic progress updates)
   */
  public async scrobblePause(contentData: TraktContentData, progress: number, force: boolean = false): Promise<boolean> {
    try {
      if (!await this.isAuthenticated()) {
        return false;
      }

      const now = Date.now();
      
      const watchingKey = this.getWatchingKey(contentData);
      const lastSync = this.lastSyncTimes.get(watchingKey) || 0;
      
      // IMMEDIATE SYNC: Remove debouncing for instant sync, only prevent truly rapid calls (< 500ms)
      if (!force && (now - lastSync) < 500) {
        return true; // Skip this sync, but return success
      }

      this.lastSyncTimes.set(watchingKey, now);

      const result = await this.queueRequest(async () => {
        return await this.pauseWatching(contentData, progress);
      });

      if (result) {
        logger.log(`[TraktService] Updated progress ${progress.toFixed(1)}% for ${contentData.type}: ${contentData.title}`);
        return true;
      }

      return false;
    } catch (error) {
      // Handle rate limiting errors more gracefully
      if (error instanceof Error && error.message.includes('429')) {
        logger.warn('[TraktService] Rate limited, will retry later');
        return true; // Return success to avoid error spam
      }
      
      logger.error('[TraktService] Failed to update progress:', error);
      return false;
    }
  }

  /**
   * Stop watching content (use when playback ends or stops)
   */
  public async scrobbleStop(contentData: TraktContentData, progress: number): Promise<boolean> {
    try {
      if (!await this.isAuthenticated()) {
        return false;
      }

      const watchingKey = this.getWatchingKey(contentData);
      const now = Date.now();
      
      // IMMEDIATE SYNC: Reduce debouncing for instant sync, only prevent truly duplicate calls (< 1 second)
      const lastStopTime = this.lastStopCalls.get(watchingKey);
      if (lastStopTime && (now - lastStopTime) < 1000) {
        logger.log(`[TraktService] Ignoring duplicate stop call for ${contentData.title} (last stop ${((now - lastStopTime) / 1000).toFixed(1)}s ago)`);
        return true; // Return success to avoid error handling
      }

      // Record this stop attempt
      this.lastStopCalls.set(watchingKey, now);

      const result = await this.queueRequest(async () => {
        return await this.stopWatching(contentData, progress);
      });

      if (result) {
        this.currentlyWatching.delete(watchingKey);
        
        // Mark as scrobbled if >= 80% to prevent future duplicates and restarts
        if (progress >= this.completionThreshold) {
          this.scrobbledItems.add(watchingKey);
          this.scrobbledTimestamps.set(watchingKey, Date.now());
          logger.log(`[TraktService] Marked as scrobbled to prevent restarts: ${watchingKey}`);
        }
        
        // The stop endpoint automatically handles the 80%+ completion logic
        // and will mark as scrobbled if >= 80%, or pause if < 80%
        const action = progress >= this.completionThreshold ? 'scrobbled' : 'paused';
        logger.log(`[TraktService] Stopped watching ${contentData.type}: ${contentData.title} (${progress.toFixed(1)}% - ${action})`);
        
        return true;
      } else {
        // If failed, remove from lastStopCalls so we can try again
        this.lastStopCalls.delete(watchingKey);
      }

      return false;
    } catch (error) {
      // Handle rate limiting errors more gracefully
      if (error instanceof Error && error.message.includes('429')) {
        logger.warn('[TraktService] Rate limited, will retry later');
        return true;
      }
      
      logger.error('[TraktService] Failed to stop scrobbling:', error);
      return false;
    }
  }

  /**
   * Legacy sync method - now delegates to proper scrobble methods
   * @deprecated Use scrobbleStart, scrobblePause, scrobbleStop instead
   */
  public async syncProgressToTrakt(
    contentData: TraktContentData, 
    progress: number, 
    force: boolean = false
  ): Promise<boolean> {
    // For backward compatibility, treat as a pause update
    return this.scrobblePause(contentData, progress, force);
  }

  /**
   * Debug method to test Trakt API connection and scrobble functionality
   */
  public async debugTraktConnection(): Promise<any> {
    try {
      logger.log('[TraktService] Testing Trakt API connection...');
      
      // Test basic API access
      const userResponse = await this.apiRequest('/users/me', 'GET');
      logger.log('[TraktService] User info:', userResponse);
      
      // Test a minimal scrobble start to verify API works
      const testPayload = {
        movie: {
          title: "Test Movie",
          year: 2023,
          ids: {
            imdb: "1234567"  // Fake IMDB ID for testing
          }
        },
        progress: 1.0
      };
      
      logger.log('[TraktService] Testing scrobble/start endpoint with test payload...');
      const scrobbleResponse = await this.apiRequest('/scrobble/start', 'POST', testPayload);
      logger.log('[TraktService] Scrobble test response:', scrobbleResponse);
      
      return { 
        authenticated: true,
        user: userResponse, 
        scrobbleTest: scrobbleResponse 
      };
    } catch (error) {
      logger.error('[TraktService] Debug connection failed:', error);
      return { 
        authenticated: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Debug method to check current playback progress on Trakt
   */
  public async debugPlaybackProgress(): Promise<void> {
    try {
      if (!await this.isAuthenticated()) {
        // Debug logging removed
        return;
      }

      const progress = await this.getPlaybackProgress();
      // Progress logging removed
      
      progress.forEach((item, index) => {
        if (item.type === 'movie' && item.movie) {
          // Movie progress logging removed
        } else if (item.type === 'episode' && item.episode && item.show) {
          // Episode progress logging removed
        }
      });
      
      if (progress.length === 0) {
        // No progress logging removed
      }
    } catch (error) {
      logger.error('[TraktService] DEBUG: Error fetching playback progress:', error);
    }
  }
  /**
   * Debug image cache status
   */
  public static debugImageCache(): void {
    try {
      logger.log('[TraktService] === IMAGE CACHE DEBUG ===');
      imageCacheService.logCacheStatus();
    } catch (error) {
      logger.error('[TraktService] Debug image cache failed:', error);
    }
  }

  /**
   * Delete a playback progress entry on Trakt by its playback `id`.
   * Returns true if the request succeeded (204).
   */
  public async deletePlaybackItem(playbackId: number): Promise<boolean> {
    try {
      if (!this.accessToken) return false;
      await this.apiRequest<null>(`/sync/playback/${playbackId}`, 'DELETE');
      return true; // trakt returns 204 no-content on success
    } catch (error) {
      logger.error('[TraktService] Failed to delete playback item:', error);
      return false;
    }
  }

  /**
   * Convenience helper: find a playback entry matching imdb id (and optional season/episode) and delete it.
   */
  public async deletePlaybackForContent(imdbId: string, type: 'movie' | 'series', season?: number, episode?: number): Promise<boolean> {
    try {
      if (!this.accessToken) return false;
      const progressItems = await this.getPlaybackProgress();
      const target = progressItems.find(item => {
        if (type === 'movie' && item.type === 'movie' && item.movie?.ids.imdb === imdbId) {
          return true;
        }
        if (type === 'series' && item.type === 'episode' && item.show?.ids.imdb === imdbId) {
          if (season !== undefined && episode !== undefined) {
            return item.episode?.season === season && item.episode?.number === episode;
          }
          return true; // match any episode of the show if specific not provided
        }
        return false;
      });
      if (target) {
        return await this.deletePlaybackItem(target.id);
      }
      return false;
    } catch (error) {
      logger.error('[TraktService] Error deleting playback for content:', error);
      return false;
    }
  }

  public async getWatchedEpisodesHistory(page: number = 1, limit: number = 100): Promise<any[]> {
    await this.ensureInitialized();

    const cacheKey = `history_episodes_${page}_${limit}`;
    const lastSync = this.lastSyncTimes.get(cacheKey) || 0;
    const now = Date.now();
    if (now - lastSync < this.SYNC_DEBOUNCE_MS) {
      // Return cached result if we fetched recently
      return (this as any)[cacheKey] || [];
    }

    const endpoint = `/sync/history/episodes?page=${page}&limit=${limit}`;
    try {
      const data = await this.apiRequest<any[]>(endpoint, 'GET');
      (this as any)[cacheKey] = data;
      this.lastSyncTimes.set(cacheKey, now);
      return data;
    } catch (error) {
      logger.error('[TraktService] Failed to fetch watched episodes history:', error);
      return [];
    }
  }

  /**
   * Handle app state changes to reduce memory pressure
   */
  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState !== 'active') {
      // Clear tracking maps to reduce memory pressure when app goes to background
      this.scrobbledItems.clear();
      this.scrobbledTimestamps.clear();
      this.currentlyWatching.clear();
      this.lastSyncTimes.clear();
      this.lastStopCalls.clear();
      
      // Clear request queue to prevent background processing
      this.requestQueue = [];
      this.isProcessingQueue = false;
    }
  };
}

// Export a singleton instance
export const traktService = TraktService.getInstance();