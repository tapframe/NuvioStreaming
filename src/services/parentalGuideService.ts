import axios from 'axios';
import { logger } from '../utils/logger';

// Base URL for the parental guide API - configurable via env
const API_BASE_URL = process.env.EXPO_PUBLIC_PARENTAL_GUIDE_API_URL || 'https://parental.nuvioapp.space';
const TIMEOUT_MS = 5000;

export interface ParentalGuide {
    nudity: 'None' | 'Mild' | 'Moderate' | 'Severe';
    violence: 'None' | 'Mild' | 'Moderate' | 'Severe';
    profanity: 'None' | 'Mild' | 'Moderate' | 'Severe';
    alcohol: 'None' | 'Mild' | 'Moderate' | 'Severe';
    frightening: 'None' | 'Mild' | 'Moderate' | 'Severe';
}

export interface ParentalGuideResponse {
    imdbId: string;
    parentalGuide: ParentalGuide;
    hasData: boolean;
    seriesId?: string;
    season?: number;
    episode?: number;
    cached?: boolean;
}

class ParentalGuideService {
    private static instance: ParentalGuideService;
    private cache: Map<string, ParentalGuideResponse> = new Map();

    private constructor() { }

    public static getInstance(): ParentalGuideService {
        if (!ParentalGuideService.instance) {
            ParentalGuideService.instance = new ParentalGuideService();
        }
        return ParentalGuideService.instance;
    }

    /**
     * Get parental guide for a movie
     */
    async getMovieGuide(imdbId: string): Promise<ParentalGuideResponse | null> {
        if (!imdbId || !imdbId.startsWith('tt')) {
            logger.log('[ParentalGuide] Invalid IMDb ID:', imdbId);
            return null;
        }

        const cacheKey = `movie:${imdbId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        try {
            const url = `${API_BASE_URL}/movie/${imdbId}`;
            logger.log('[ParentalGuide] Fetching movie guide:', url);

            const response = await axios.get<ParentalGuideResponse>(url, {
                timeout: TIMEOUT_MS,
            });

            if (response.data && response.data.hasData) {
                this.cache.set(cacheKey, response.data);
                return response.data;
            }

            return null;
        } catch (error: any) {
            logger.error('[ParentalGuide] Failed to fetch movie guide:', error?.message || error);
            return null;
        }
    }

    /**
     * Get parental guide for a TV episode
     */
    async getTVGuide(imdbId: string, season: number, episode: number): Promise<ParentalGuideResponse | null> {
        if (!imdbId || !imdbId.startsWith('tt')) {
            logger.log('[ParentalGuide] Invalid IMDb ID:', imdbId);
            return null;
        }

        if (!season || !episode || season < 0 || episode < 0) {
            logger.log('[ParentalGuide] Invalid season/episode:', { season, episode });
            return null;
        }

        const cacheKey = `tv:${imdbId}:${season}:${episode}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        try {
            const url = `${API_BASE_URL}/tv/${imdbId}/${season}/${episode}`;
            logger.log('[ParentalGuide] Fetching TV guide:', url);

            const response = await axios.get<ParentalGuideResponse>(url, {
                timeout: TIMEOUT_MS,
            });

            if (response.data && response.data.hasData) {
                this.cache.set(cacheKey, response.data);
                return response.data;
            }

            return null;
        } catch (error: any) {
            logger.error('[ParentalGuide] Failed to fetch TV guide:', error?.message || error);
            return null;
        }
    }

    /**
     * Clear the cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}

export const parentalGuideService = ParentalGuideService.getInstance();
