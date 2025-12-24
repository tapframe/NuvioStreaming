import { mmkvStorage } from './mmkvStorage';
import { logger } from '../utils/logger';

// Storage keys
export const MAL_ACCESS_TOKEN_KEY = 'mal_access_token';
export const MAL_REFRESH_TOKEN_KEY = 'mal_refresh_token';
export const MAL_TOKEN_EXPIRY_KEY = 'mal_token_expiry';

// MAL API configuration
const MAL_API_BASE_URL = 'https://api.myanimelist.net/v2';
const MAL_OAUTH_URL = 'https://myanimelist.net/v1/oauth2';
const MAL_CLIENT_ID = process.env.EXPO_PUBLIC_MAL_CLIENT_ID as string;
const MAL_REDIRECT_URI = process.env.EXPO_PUBLIC_MAL_REDIRECT_URI || 'nuvio://auth/mal';

if (!MAL_CLIENT_ID) {
  logger.warn('Missing EXPO_PUBLIC_MAL_CLIENT_ID environment variable. MAL integration will not work.');
}

// Types
export interface MalUser {
  id: number;
  name: string;
  picture?: string;
  joined_at: string;
  location?: string;
  anime_statistics?: any;
}

export interface MalAnimeNode {
  id: number;
  title: string;
  main_picture?: {
    medium: string;
    large?: string;
  };
  alternative_titles?: {
    synonyms?: string[];
    en?: string;
    ja?: string;
  };
  start_date?: string;
  end_date?: string;
  synopsis?: string;
  mean?: number;
  rank?: number;
  popularity?: number;
  num_list_users?: number;
  num_scoring_users?: number;
  nsfw?: string;
  created_at?: string;
  updated_at?: string;
  media_type?: string;
  status?: string;
  genres?: { id: number; name: string }[];
  my_list_status?: MalListStatus;
  num_episodes?: number;
  start_season?: {
    year: number;
    season: string;
  };
  broadcast?: {
    day_of_the_week: string;
    start_time?: string;
  };
  source?: string;
  average_episode_duration?: number;
  rating?: string;
  studios?: { id: number; name: string }[];
}

export interface MalListStatus {
  status: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';
  score: number;
  num_episodes_watched: number;
  is_rewatching: boolean;
  updated_at: string;
  start_date?: string;
  finish_date?: string;
}

export interface MalAnimeListResponse {
  data: {
    node: MalAnimeNode;
    list_status: MalListStatus;
  }[];
  paging: {
    next?: string;
    previous?: string;
  };
}

export interface MalSearchResult {
  data: {
    node: MalAnimeNode;
  }[];
  paging: {
    next?: string;
  };
}

export class MalService {
  private static instance: MalService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): MalService {
    if (!MalService.instance) {
      MalService.instance = new MalService();
    }
    return MalService.instance;
  }

  /**
   * Initialize the MAL service by loading stored tokens
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const [accessToken, refreshToken, tokenExpiry] = await Promise.all([
        mmkvStorage.getItem(MAL_ACCESS_TOKEN_KEY),
        mmkvStorage.getItem(MAL_REFRESH_TOKEN_KEY),
        mmkvStorage.getItem(MAL_TOKEN_EXPIRY_KEY)
      ]);

      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.tokenExpiry = tokenExpiry ? parseInt(tokenExpiry, 10) : 0;
      this.isInitialized = true;

      logger.log('[MalService] Initialized, authenticated:', !!this.accessToken);
    } catch (error) {
      logger.error('[MalService] Initialization failed:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Check if the user is authenticated with MAL
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
   * Exchange the authorization code for an access token
   */
  public async exchangeCodeForToken(code: string, codeVerifier: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const params = new URLSearchParams();
      params.append('client_id', MAL_CLIENT_ID);
      params.append('code', code);
      params.append('code_verifier', codeVerifier);
      params.append('grant_type', 'authorization_code');
      // MAL redirect URI must strictly match
      params.append('redirect_uri', MAL_REDIRECT_URI); 

      const response = await fetch(`${MAL_OAUTH_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('[MalService] Token exchange error response:', errorBody);
        throw new Error(`Failed to exchange code: ${response.status}`);
      }

      const data = await response.json();
      // MAL tokens last 31 days (approx), expires_in is in seconds
      await this.saveTokens(data.access_token, data.refresh_token, data.expires_in);
      return true;
    } catch (error) {
      logger.error('[MalService] Failed to exchange code for token:', error);
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
      const params = new URLSearchParams();
      params.append('client_id', MAL_CLIENT_ID);
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', this.refreshToken);

      const response = await fetch(`${MAL_OAUTH_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh token: ${response.status}`);
      }

      const data = await response.json();
      await this.saveTokens(data.access_token, data.refresh_token, data.expires_in);
    } catch (error) {
      logger.error('[MalService] Failed to refresh token:', error);
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
      await mmkvStorage.multiSet([
        [MAL_ACCESS_TOKEN_KEY, accessToken],
        [MAL_REFRESH_TOKEN_KEY, refreshToken],
        [MAL_TOKEN_EXPIRY_KEY, this.tokenExpiry.toString()]
      ]);
      logger.log('[MalService] Tokens saved successfully');
    } catch (error) {
      logger.error('[MalService] Failed to save tokens:', error);
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

      await mmkvStorage.multiRemove([
        MAL_ACCESS_TOKEN_KEY,
        MAL_REFRESH_TOKEN_KEY,
        MAL_TOKEN_EXPIRY_KEY
      ]);
      logger.log('[MalService] Logged out successfully');
    } catch (error) {
      logger.error('[MalService] Failed to logout:', error);
      throw error;
    }
  }

  /**
   * Make an authenticated API request to MAL
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
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
      'Content-Type': 'application/x-www-form-urlencoded', // MAL often uses form-urlencoded for writes
      'Authorization': `Bearer ${this.accessToken}`
    };

    const options: RequestInit = {
      method,
      headers
    };

    if (body) {
      if (method === 'GET') {
          // If body is passed for GET, standard practice is to query params, but MAL endpoint usually just takes query in url string passed in endpoint
      } else {
          // MAL API often expects form data for updates, not JSON.
          // But v2 API docs say some endpoints take body.
          // Usually application/x-www-form-urlencoded is safest for MAL v2 updates.
          const params = new URLSearchParams();
          for (const key in body) {
              if (body[key] !== undefined && body[key] !== null) {
                  params.append(key, String(body[key]));
              }
          }
          options.body = params.toString();
      }
    }

    const response = await fetch(`${MAL_API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[MalService] API Error ${response.status} for ${endpoint}:`, errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as unknown as T;
    }

    return await response.json() as T;
  }

  /**
   * Get the user's profile information
   */
  public async getUserProfile(): Promise<MalUser> {
    return this.apiRequest<MalUser>('/users/@me?fields=anime_statistics');
  }

  /**
   * Search for anime
   */
  public async searchAnime(query: string, limit: number = 5): Promise<MalSearchResult> {
    const encodedQuery = encodeURIComponent(query);
    return this.apiRequest<MalSearchResult>(`/anime?q=${encodedQuery}&limit=${limit}`);
  }

  /**
   * Get user's anime list
   */
  public async getAnimeList(status?: string, limit: number = 100, offset: number = 0): Promise<MalAnimeListResponse> {
    let url = `/users/@me/animelist?fields=list_status,num_episodes,start_season,media_type&limit=${limit}&offset=${offset}`;
    if (status) {
      url += `&status=${status}`;
    }
    return this.apiRequest<MalAnimeListResponse>(url);
  }

  /**
   * Update anime status (add to list, update score, episodes watched, etc.)
   */
  public async updateAnimeStatus(
    animeId: number, 
    status?: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch',
    num_watched_episodes?: number,
    score?: number
  ): Promise<MalListStatus> {
    const body: any = {};
    if (status) body.status = status;
    if (num_watched_episodes !== undefined) body.num_watched_episodes = num_watched_episodes;
    if (score !== undefined) body.score = score;

    return this.apiRequest<MalListStatus>(`/anime/${animeId}/my_list_status`, 'PUT', body);
  }

  /**
   * Delete anime from list
   */
  public async deleteAnimeFromList(animeId: number): Promise<void> {
    return this.apiRequest<void>(`/anime/${animeId}/my_list_status`, 'DELETE');
  }
}

export const malService = MalService.getInstance();
