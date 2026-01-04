import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * IntroDB API service for fetching TV show intro timestamps
 * API Documentation: https://api.introdb.app
 */

const INTRODB_API_URL = process.env.EXPO_PUBLIC_INTRODB_API_URL;
const ANISKIP_API_URL = 'https://api.aniskip.com/v2';
const KITSU_API_URL = 'https://kitsu.io/api/edge';

export type SkipType = 'op' | 'ed' | 'recap' | 'intro' | 'outro' | 'mixed-op' | 'mixed-ed';

export interface SkipInterval {
    startTime: number;
    endTime: number;
    type: SkipType;
    provider: 'introdb' | 'aniskip';
    skipId?: string;
}

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

async function getMalIdFromKitsu(kitsuId: string): Promise<string | null> {
    try {
        const response = await axios.get(`${KITSU_API_URL}/anime/${kitsuId}/mappings`);
        const data = response.data;
        if (data && data.data) {
            const malMapping = data.data.find((m: any) => m.attributes.externalSite === 'myanimelist/anime');
            if (malMapping) {
                return malMapping.attributes.externalId;
            }
        }
    } catch (error) {
        logger.warn('[IntroService] Failed to fetch MAL ID from Kitsu:', error);
    }
    return null;
}

async function fetchFromAniSkip(malId: string, episode: number): Promise<SkipInterval[]> {
    try {
        // Fetch OP, ED, and Recap
        // AniSkip expects repeated 'types' parameters without brackets: ?types=op&types=ed...
        // episodeLength=0 is required for validation
        const types = ['op', 'ed', 'recap', 'mixed-op', 'mixed-ed'];
        const queryParams = types.map(t => `types=${t}`).join('&');
        const url = `${ANISKIP_API_URL}/skip-times/${malId}/${episode}?${queryParams}&episodeLength=0`;
        
        const response = await axios.get(url);
        
        if (response.data.found && response.data.results) {
            return response.data.results.map((res: any) => ({
                startTime: res.interval.startTime,
                endTime: res.interval.endTime,
                type: res.skipType, 
                provider: 'aniskip',
                skipId: res.skipId
            }));
        }
    } catch (error) {
         if (axios.isAxiosError(error) && error.response?.status !== 404) {
             logger.error('[IntroService] Error fetching AniSkip:', error);
         }
    }
    return [];
}

async function fetchFromIntroDb(imdbId: string, season: number, episode: number): Promise<SkipInterval[]> {
    try {
        const response = await axios.get<IntroTimestamps>(`${INTRODB_API_URL}/intro`, {
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

        return [{
            startTime: response.data.start_sec,
            endTime: response.data.end_sec,
            type: 'intro',
            provider: 'introdb'
        }];
    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            // No intro data available for this episode - this is expected
            logger.log(`[IntroService] No intro data for ${imdbId} S${season}E${episode}`);
            return [];
        }

        logger.error('[IntroService] Error fetching intro timestamps:', error?.message || error);
        return [];
    }
}

/**
 * Fetches skip intervals (intro, outro, recap) from available providers
 */
export async function getSkipTimes(
    imdbId: string | undefined,
    season: number,
    episode: number,
    malId?: string,
    kitsuId?: string
): Promise<SkipInterval[]> {
    // 1. Try AniSkip (Anime) if we have MAL ID or Kitsu ID
    let finalMalId = malId;
    
    // If we have Kitsu ID but no MAL ID, try to resolve it
    if (!finalMalId && kitsuId) {
        logger.log(`[IntroService] Resolving MAL ID from Kitsu ID: ${kitsuId}`);
        finalMalId = await getMalIdFromKitsu(kitsuId) || undefined;
    }

    if (finalMalId) {
        logger.log(`[IntroService] Fetching AniSkip for MAL ID: ${finalMalId} Ep: ${episode}`);
        const aniSkipIntervals = await fetchFromAniSkip(finalMalId, episode);
        if (aniSkipIntervals.length > 0) {
            logger.log(`[IntroService] Found ${aniSkipIntervals.length} skip intervals from AniSkip`);
            return aniSkipIntervals;
        }
    }

    // 2. Try IntroDB (TV Shows) as fallback or for non-anime
    if (imdbId) {
        const introDbIntervals = await fetchFromIntroDb(imdbId, season, episode);
        if (introDbIntervals.length > 0) {
            return introDbIntervals;
        }
    }

    return [];
}

/**
 * Legacy function for backward compatibility
 * Fetches intro timestamps for a TV show episode
 */
export async function getIntroTimestamps(
    imdbId: string,
    season: number,
    episode: number
): Promise<IntroTimestamps | null> {
    const intervals = await fetchFromIntroDb(imdbId, season, episode);
    if (intervals.length > 0) {
        return {
            imdb_id: imdbId,
            season,
            episode,
            start_sec: intervals[0].startTime,
            end_sec: intervals[0].endTime,
            start_ms: intervals[0].startTime * 1000,
            end_ms: intervals[0].endTime * 1000,
            confidence: 1.0
        };
    }
    return null;
}

export const introService = {
    getIntroTimestamps,
    getSkipTimes
};

export default introService;
