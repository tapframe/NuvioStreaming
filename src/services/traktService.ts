import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

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
  };
  plays: number;
  last_watched_at: string;
}

export class TraktService {
  private static instance: TraktService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  private isInitialized: boolean = false;

  private constructor() {
    // Initialization happens in initialize method
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
  public async exchangeCodeForToken(code: string): Promise<boolean> {
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
          grant_type: 'authorization_code'
        })
      });

      if (!response.ok) {
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
    body?: any
  ): Promise<T> {
    await this.ensureInitialized();

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

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return await response.json() as T;
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
}

// Export a singleton instance
export const traktService = TraktService.getInstance(); 