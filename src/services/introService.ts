import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * IntroDB API service for fetching TV show intro timestamps
 * API Documentation: https://api.introdb.app
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_INTRODB_API_URL || 'https://api.introdb.app';

export interface IntroTimestamps {
    imdb_id: string;
    season: number;
    episode: number;
    start_sec: number;
    end_sec: number;
    start_ms: number;
    end_ms: number;
    confidence: number;
}

/**
 * Fetches intro timestamps for a TV show episode
 * @param imdbId - IMDB ID of the show (e.g., tt0903747 for Breaking Bad)
 * @param season - Season number (1-indexed)
 * @param episode - Episode number (1-indexed)
 * @returns Intro timestamps or null if not found
 */
export async function getIntroTimestamps(
    imdbId: string,
    season: number,
    episode: number
): Promise<IntroTimestamps | null> {
    try {
        const response = await axios.get<IntroTimestamps>(`${API_BASE_URL}/intro`, {
            params: {
                imdb_id: imdbId,
                season,
                episode,
            },
            timeout: 5000,
        });

        logger.log(`[IntroService] Found intro for ${imdbId} S${season}E${episode}:`, {
            start: response.data.start_sec,
            end: response.data.end_sec,
            confidence: response.data.confidence,
        });

        return response.data;
    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            // No intro data available for this episode - this is expected
            logger.log(`[IntroService] No intro data for ${imdbId} S${season}E${episode}`);
            return null;
        }

        logger.error('[IntroService] Error fetching intro timestamps:', error?.message || error);
        return null;
    }
}

export const introService = {
    getIntroTimestamps,
};

export default introService;
