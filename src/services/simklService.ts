import { mmkvStorage } from './mmkvStorage';
import { AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';
import Constants from 'expo-constants';

// Storage keys
export const SIMKL_ACCESS_TOKEN_KEY = 'simkl_access_token';

// Simkl API configuration
const SIMKL_API_URL = 'https://api.simkl.com';
const SIMKL_CLIENT_ID = process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID as string;
const SIMKL_CLIENT_SECRET = process.env.EXPO_PUBLIC_SIMKL_CLIENT_SECRET as string;
const SIMKL_REDIRECT_URI = process.env.EXPO_PUBLIC_SIMKL_REDIRECT_URI || 'nuvio://auth/simkl';

if (!SIMKL_CLIENT_ID || !SIMKL_CLIENT_SECRET) {
    logger.warn('[SimklService] Missing Simkl env vars. Simkl integration will be disabled.');
}

// Types
export interface SimklUser {
    user: {
        name: string;
        joined_at: string;
        avatar: string;
    }
}

export interface SimklIds {
    simkl?: number;
    slug?: string;
    imdb?: string;
    tmdb?: number;
    mal?: string;
    tvdb?: string;
    anidb?: string;
}

export interface SimklContentData {
    type: 'movie' | 'episode' | 'anime';
    title: string;
    year?: number;
    ids: SimklIds;
    // For episodes
    season?: number;
    episode?: number;
    showTitle?: string;
    // For anime
    animeType?: string;
}

export interface SimklScrobbleResponse {
    id: number;
    action: 'start' | 'pause' | 'scrobble';
    progress: number;
    movie?: any;
    show?: any;
    episode?: any;
    anime?: any;
}

export interface SimklPlaybackData {
    id: number;
    progress: number;
    paused_at: string;
    type: 'movie' | 'episode';
    movie?: {
        title: string;
        year: number;
        ids: SimklIds;
    };
    show?: {
        title: string;
        year: number;
        ids: SimklIds;
    };
    episode?: {
        season: number;
        // Simkl docs show `episode` in playback responses, but some APIs return `number`
        episode?: number;
        number?: number;
        title: string;
        tvdb_season?: number;
        tvdb_number?: number;
    };
}

export interface SimklUserSettings {
    user: {
        name: string;
        joined_at: string;
        gender?: string;
        avatar: string;
        bio?: string;
        loc?: string;
        age?: string;
    };
    account: {
        id: number;
        timezone?: string;
        type?: string;
    };
    connections?: Record<string, boolean>;
}

export interface SimklStats {
    total_mins: number;
    movies?: {
        total_mins: number;
        completed?: { count: number };
    };
    tv?: {
        total_mins: number;
        watching?: { count: number };
        completed?: { count: number };
    };
    anime?: {
        total_mins: number;
        watching?: { count: number };
        completed?: { count: number };
    };
}

export interface SimklActivities {
    all?: string;
    playback?: {
        all?: string;
        movies?: string;
        episodes?: string;
        tv?: string;
        anime?: string;
        [key: string]: string | undefined;
    };
    [key: string]: any;
}

export class SimklService {
    private static instance: SimklService;
    private accessToken: string | null = null;
    private isInitialized: boolean = false;

    // Rate limiting & Debouncing
    private lastApiCall: number = 0;
    private readonly MIN_API_INTERVAL = 500;
    private requestQueue: Array<() => Promise<any>> = [];
    private isProcessingQueue: boolean = false;

    // Track scrobbled items to prevent duplicates/spam
    private lastSyncTimes: Map<string, number> = new Map();
    private readonly SYNC_DEBOUNCE_MS = 15000; // 15 seconds

    // Default completion threshold (can't be configured on Simkl side essentially, but we use it for logic)
    private readonly COMPLETION_THRESHOLD = 80;

    private constructor() {
        // Determine cleanup logic if needed
        AppState.addEventListener('change', this.handleAppStateChange);
    }

    public static getInstance(): SimklService {
        if (!SimklService.instance) {
            SimklService.instance = new SimklService();
        }
        return SimklService.instance;
    }

    private handleAppStateChange = (nextAppState: AppStateStatus) => {
        // Potential cleanup or flush queue logic here
    };

    /**
     * Initialize the Simkl service by loading stored token
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            const accessToken = await mmkvStorage.getItem(SIMKL_ACCESS_TOKEN_KEY);
            this.accessToken = accessToken;
            this.isInitialized = true;
            logger.log('[SimklService] Initialized, authenticated:', !!this.accessToken);
        } catch (error) {
            logger.error('[SimklService] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Check if the user is authenticated
     */
    public async isAuthenticated(): Promise<boolean> {
        await this.ensureInitialized();
        return !!this.accessToken;
    }

    /**
     * Get auth URL for OAuth
     */
    public getAuthUrl(): string {
        return `https://simkl.com/oauth/authorize?response_type=code&client_id=${SIMKL_CLIENT_ID}&redirect_uri=${encodeURIComponent(SIMKL_REDIRECT_URI)}`;
    }

    /**
     * Exchange code for access token
     * Simkl tokens do not expire
     */
    public async exchangeCodeForToken(code: string): Promise<boolean> {
        await this.ensureInitialized();

        try {
            const response = await fetch(`${SIMKL_API_URL}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code,
                    client_id: SIMKL_CLIENT_ID,
                    client_secret: SIMKL_CLIENT_SECRET,
                    redirect_uri: SIMKL_REDIRECT_URI,
                    grant_type: 'authorization_code'
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                logger.error('[SimklService] Token exchange error:', errorBody);
                return false;
            }

            const data = await response.json();
            if (data.access_token) {
                await this.saveToken(data.access_token);
                return true;
            }
            return false;
        } catch (error) {
            logger.error('[SimklService] Failed to exchange code:', error);
            return false;
        }
    }

    private async saveToken(accessToken: string): Promise<void> {
        this.accessToken = accessToken;
        try {
            await mmkvStorage.setItem(SIMKL_ACCESS_TOKEN_KEY, accessToken);
            logger.log('[SimklService] Token saved successfully');
        } catch (error) {
            logger.error('[SimklService] Failed to save token:', error);
            throw error;
        }
    }

    public async logout(): Promise<void> {
        await this.ensureInitialized();
        this.accessToken = null;
        await mmkvStorage.removeItem(SIMKL_ACCESS_TOKEN_KEY);
        logger.log('[SimklService] Logged out');
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    /**
     * Base API Request handler
     */
    private async apiRequest<T>(
        endpoint: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
        body?: any
    ): Promise<T | null> {
        await this.ensureInitialized();

        // Rate limiting
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;
        if (timeSinceLastCall < this.MIN_API_INTERVAL) {
            await new Promise(resolve => setTimeout(resolve, this.MIN_API_INTERVAL - timeSinceLastCall));
        }
        this.lastApiCall = Date.now();

        if (!this.accessToken) {
            logger.warn('[SimklService] Cannot make request: Not authenticated');
            return null;
        }

        const appVersion = Constants.expoConfig?.version || (Constants as any).manifest?.version || 'unknown';
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`,
            'simkl-api-key': SIMKL_CLIENT_ID,
            'User-Agent': `Nuvio/${appVersion}`
        };

        const options: RequestInit = {
            method,
            headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        if (endpoint.includes('scrobble')) {
            logger.log(`[SimklService] Requesting: ${method} ${endpoint}`, body);
        }

        try {
            const response = await fetch(`${SIMKL_API_URL}${endpoint}`, options);

            if (response.status === 409) {
                // Conflict means already watched/scrobbled within last hour, which is strictly a success for our purposes
                logger.log(`[SimklService] 409 Conflict (Already watched/active) for ${endpoint}`);
                // We can return a mock success or null depending on what caller expects.
                // For scrobble actions (which usually return an ID or object), we might return null or handle it.
                // Simkl returns body with "watched_at" etc.
                return null;
            }

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`[SimklService] API Error ${response.status} for ${endpoint}:`, errorText);
                return null; // Return null on error
            }

            // Handle 204 No Content
            if (response.status === 204) {
                return {} as T;
            }

            return await response.json();
        } catch (error) {
            logger.error(`[SimklService] Network request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    /**
     * Build payload for Scrobbling
     */
    private buildScrobblePayload(content: SimklContentData, progress: number): any {
        // Simkl uses flexible progress but let's standardize
        const cleanProgress = Math.max(0, Math.min(100, progress));

        const payload: any = {
            progress: cleanProgress
        };

        // IDs object setup (remove undefined/nulls)
        const ids: any = {};
        if (content.ids.imdb) ids.imdb = content.ids.imdb;
        if (content.ids.tmdb) ids.tmdb = content.ids.tmdb;
        if (content.ids.simkl) ids.simkl = content.ids.simkl;
        if (content.ids.mal) ids.mal = content.ids.mal; // for anime

        // Construct object based on type
        if (content.type === 'movie') {
            payload.movie = {
                title: content.title,
                year: content.year,
                ids: ids
            };
        } else if (content.type === 'episode') {
            payload.show = {
                title: content.showTitle || content.title,
                year: content.year,
                ids: {
                    // If we have show IMDB/TMDB use those, otherwise fallback (might be same if passed in ids)
                    // Ideally caller passes show-specific IDs in ids, but often we just have ids for the general item
                    imdb: content.ids.imdb,
                    tmdb: content.ids.tmdb,
                    simkl: content.ids.simkl
                }
            };
            payload.episode = {
                season: content.season,
                number: content.episode
            };
        } else if (content.type === 'anime') {
            payload.anime = {
                title: content.title,
                ids: ids
            };
            // Anime also needs episode info if it's an episode
            if (content.episode) {
                payload.episode = {
                    season: content.season || 1,
                    number: content.episode
                };
            }
        }

        return payload;
    }

    /**
     * SCROBBLE: START
     */
    public async scrobbleStart(content: SimklContentData, progress: number): Promise<SimklScrobbleResponse | null> {
        try {
            const payload = this.buildScrobblePayload(content, progress);
            logger.log('[SimklService] scrobbleStart payload:', JSON.stringify(payload));
            const response = await this.apiRequest<SimklScrobbleResponse>('/scrobble/start', 'POST', payload);
            logger.log('[SimklService] scrobbleStart response:', JSON.stringify(response));
            return response;
        } catch (e) {
            logger.error('[SimklService] Scrobble Start failed', e);
            return null;
        }
    }

    /**
     * SCROBBLE: PAUSE
     */
    public async scrobblePause(content: SimklContentData, progress: number): Promise<SimklScrobbleResponse | null> {
        try {
            // Debounce check
            const key = this.getContentKey(content);
            const now = Date.now();
            const lastSync = this.lastSyncTimes.get(key) || 0;

            if (now - lastSync < this.SYNC_DEBOUNCE_MS) {
                return null; // Skip if too soon
            }
            this.lastSyncTimes.set(key, now);

            this.lastSyncTimes.set(key, now);

            const payload = this.buildScrobblePayload(content, progress);
            logger.log('[SimklService] scrobblePause payload:', JSON.stringify(payload));
            const response = await this.apiRequest<SimklScrobbleResponse>('/scrobble/pause', 'POST', payload);
            logger.log('[SimklService] scrobblePause response:', JSON.stringify(response));
            return response;
        } catch (e) {
            logger.error('[SimklService] Scrobble Pause failed', e);
            return null;
        }
    }

    /**
     * SCROBBLE: STOP
     */
    public async scrobbleStop(content: SimklContentData, progress: number): Promise<SimklScrobbleResponse | null> {
        try {
            const payload = this.buildScrobblePayload(content, progress);
            logger.log('[SimklService] scrobbleStop payload:', JSON.stringify(payload));
            // Simkl automatically marks as watched if progress >= 80% (or server logic)
            // We just hit /scrobble/stop
            const response = await this.apiRequest<SimklScrobbleResponse>('/scrobble/stop', 'POST', payload);
            logger.log('[SimklService] scrobbleStop response:', JSON.stringify(response));

            // If response is null (often 409 Conflict) OR we failed, but progress is high,
            // we should force "mark as watched" via history sync to be safe.
            // 409 means "Action already active" or "Checkin active", often if 'pause' was just called.
            // If the user finished (progress >= 80), we MUST ensure it's marked watched.
            if (!response && progress >= this.COMPLETION_THRESHOLD) {
                logger.log(`[SimklService] scrobbleStop failed/conflict at ${progress}%. Falling back to /sync/history to ensure watched status.`);

                try {
                    const historyPayload: any = {};

                    if (content.type === 'movie') {
                        historyPayload.movies = [{
                            ids: content.ids
                        }];
                    } else if (content.type === 'episode') {
                        historyPayload.shows = [{
                            ids: content.ids,
                            seasons: [{
                                number: content.season,
                                episodes: [{ number: content.episode }]
                            }]
                        }];
                    } else if (content.type === 'anime') {
                        // Anime structure similar to shows usually, or 'anime' key?
                        // Simkl API often uses 'shows' for anime too if listed as show, or 'anime' key.
                        // Safest is to try 'shows' if we have standard IDs, or 'anime' if specifically anime.
                        // Let's use 'anime' key if type is anime, assuming similar structure.
                        historyPayload.anime = [{
                            ids: content.ids,
                            episodes: [{
                                season: content.season || 1,
                                number: content.episode
                            }]
                        }];
                    }

                    if (Object.keys(historyPayload).length > 0) {
                        const historyResponse = await this.addToHistory(historyPayload);
                        logger.log('[SimklService] Fallback history sync response:', JSON.stringify(historyResponse));
                        if (historyResponse) {
                            // Construct a fake scrobble response to satisfy caller
                            return {
                                id: 0,
                                action: 'scrobble',
                                progress: progress,
                                ...payload
                            } as SimklScrobbleResponse;
                        }
                    }
                } catch (err) {
                    logger.error('[SimklService] Fallback history sync failed:', err);
                }
            }

            return response;
        } catch (e) {
            logger.error('[SimklService] Scrobble Stop failed', e);
            return null;
        }
    }

    private getContentKey(content: SimklContentData): string {
        return `${content.type}:${content.ids.imdb || content.ids.tmdb || content.title}:${content.season}:${content.episode}`;
    }

    /**
     * SYNC: Get Playback Sessions (Continue Watching)
     */
    /**
   * SYNC: Add items to History (Global "Mark as Watched")
   */
    public async addToHistory(items: { movies?: any[], shows?: any[], episodes?: any[] }): Promise<any> {
        return await this.apiRequest('/sync/history', 'POST', items);
    }

    /**
     * SYNC: Remove items from History
     */
    public async removeFromHistory(items: { movies?: any[], shows?: any[], episodes?: any[] }): Promise<any> {
        return await this.apiRequest('/sync/history/remove', 'POST', items);
    }

    public async getPlaybackStatus(): Promise<SimklPlaybackData[]> {
        const playback = await this.apiRequest<SimklPlaybackData[]>('/sync/playback');
        const items = Array.isArray(playback) ? playback : [];
        const sorted = items
            .filter(Boolean)
            .sort((a, b) => new Date(b.paused_at).getTime() - new Date(a.paused_at).getTime());

        logger.log(`[SimklService] getPlaybackStatus: ${sorted.length} items`);
        return sorted;
    }

    /**
     * SYNC: Get account activity timestamps
     */
    public async getActivities(): Promise<SimklActivities | null> {
        try {
            const response = await this.apiRequest<SimklActivities>('/sync/activities');
            return response || null;
        } catch (error) {
            logger.error('[SimklService] Failed to get activities:', error);
            return null;
        }
    }

    /**
     * SYNC: Get Full Watch History (summary)
     * Optimization: Check /sync/activities first in real usage.
     * For now, we implement simple fetch.
     */
    public async getAllItems(dateFrom?: string): Promise<any> {
        let url = '/sync/all-items/';
        if (dateFrom) {
            url += `?date_from=${dateFrom}`;
        }
        return await this.apiRequest(url);
    }

    /**
     * Get user settings/profile
     */
    public async getUserSettings(): Promise<SimklUserSettings | null> {
        try {
            const response = await this.apiRequest<SimklUserSettings>('/users/settings', 'POST');
            logger.log('[SimklService] getUserSettings:', JSON.stringify(response));
            return response;
        } catch (error) {
            logger.error('[SimklService] Failed to get user settings:', error);
            return null;
        }
    }

    /**
     * Get user stats
     */
    public async getUserStats(accountId?: number): Promise<SimklStats | null> {
        try {
            if (!await this.isAuthenticated()) {
                return null;
            }

            const resolvedAccountId = accountId ?? (await this.getUserSettings())?.account?.id;
            if (!resolvedAccountId) {
                logger.warn('[SimklService] Cannot get user stats: no account ID');
                return null;
            }

            const response = await this.apiRequest<SimklStats>(`/users/${resolvedAccountId}/stats`, 'POST');
            logger.log('[SimklService] getUserStats:', JSON.stringify(response));
            return response;
        } catch (error) {
            logger.error('[SimklService] Failed to get user stats:', error);
            return null;
        }
    }}