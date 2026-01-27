import axios from 'axios';
import { logger } from '../utils/logger';
import { tmdbService } from './tmdbService';
import { mmkvStorage } from './mmkvStorage';

/**
 * IntroDB API service for fetching TV show intro timestamps
 * API Documentation: https://api.introdb.app
 */

const INTRODB_API_URL = process.env.EXPO_PUBLIC_INTRODB_API_URL;
const THEINTRODB_API_URL = 'https://api.theintrodb.org/v1';
const ANISKIP_API_URL = 'https://api.aniskip.com/v2';
const KITSU_API_URL = 'https://kitsu.io/api/edge';
const ARM_IMDB_URL = 'https://arm.haglund.dev/api/v2/imdb';

export type SkipType = 'op' | 'ed' | 'recap' | 'intro' | 'outro' | 'mixed-op' | 'mixed-ed';

export interface SkipInterval {
    startTime: number;
    endTime: number;
    type: SkipType;
    provider: 'introdb' | 'aniskip' | 'theintrodb';
    skipId?: string;
}

export interface CreditsInfo {
    startTime: number | null;
    endTime: number | null;
    confidence: number;
}

export interface TheIntroDBTimestamp {
    start_ms: number | null;
    end_ms: number | null;
    confidence: number;
    submission_count: number;
}

export interface TheIntroDBResponse {
    tmdb_id: number;
    type: 'movie' | 'tv';
    intro?: TheIntroDBTimestamp;
    recap?: TheIntroDBTimestamp;
    credits?: TheIntroDBTimestamp;
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

async function getMalIdFromArm(imdbId: string): Promise<string | null> {
    try {
        const response = await axios.get(ARM_IMDB_URL, {
            params: {
                id: imdbId,
                include: 'myanimelist'
            }
        });
        
        // ARM returns an array of matches (e.g. for different seasons)
        // We typically take the first one or try to match logic if possible
        if (Array.isArray(response.data) && response.data.length > 0) {
            const result = response.data[0];
            if (result && result.myanimelist) {
                logger.log(`[IntroService] Found MAL ID via ARM: ${result.myanimelist}`);
                return result.myanimelist.toString();
            }
        }
    } catch (error) {
        // Silent fail as this is just one of the resolution methods
        // logger.warn('[IntroService] Failed to fetch MAL ID from ARM', error);
    }
    return null;
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

async function getMalIdFromImdb(imdbId: string): Promise<string | null> {
    try {
        // 1. Try direct Kitsu mapping (IMDb -> Kitsu)
        const kitsuDirectResponse = await axios.get(`${KITSU_API_URL}/mappings`, {
            params: {
                'filter[external_site]': 'imdb',
                'filter[external_id]': imdbId,
                'include': 'item'
            }
        });

        if (kitsuDirectResponse.data?.data?.length > 0) {
            const kitsuId = kitsuDirectResponse.data.data[0].relationships?.item?.data?.id;
            if (kitsuId) {
                return await getMalIdFromKitsu(kitsuId);
            }
        }

        // 2. Try TMDB -> TVDB -> Kitsu path (Robust for Cinemeta users)
        const tmdbId = await tmdbService.findTMDBIdByIMDB(imdbId);
        
        if (tmdbId) {
            const extIds = await tmdbService.getShowExternalIds(tmdbId);
            const tvdbId = extIds?.tvdb_id;
            
            if (tvdbId) {
                // Search Kitsu for TVDB mapping
                const kitsuTvdbResponse = await axios.get(`${KITSU_API_URL}/mappings`, {
                    params: {
                        'filter[external_site]': 'thetvdb/series',
                        'filter[external_id]': tvdbId.toString(),
                        'include': 'item'
                    }
                });

                if (kitsuTvdbResponse.data?.data?.length > 0) {
                    const kitsuId = kitsuTvdbResponse.data.data[0].relationships?.item?.data?.id;
                    if (kitsuId) {
                        logger.log(`[IntroService] Resolved Kitsu ID ${kitsuId} from TVDB ID ${tvdbId} (via IMDb ${imdbId})`);
                        return await getMalIdFromKitsu(kitsuId);
                    }
                }
            }
        }
    } catch (error) {
        // Silent fail - it might just not be an anime or API limit reached
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

async function fetchFromTheIntroDb(
    tmdbId: number,
    type: 'movie' | 'tv',
    season?: number,
    episode?: number
): Promise<{ intervals: SkipInterval[], credits: CreditsInfo | null }> {
    try {
        const params: any = { tmdb_id: tmdbId };
        if (type === 'tv' && season !== undefined && episode !== undefined) {
            params.season = season;
            params.episode = episode;
        }

        const response = await axios.get<TheIntroDBResponse>(`${THEINTRODB_API_URL}/media`, {
            params,
            timeout: 5000,
        });

        const intervals: SkipInterval[] = [];
        let credits: CreditsInfo | null = null;

        // Add intro skip interval if available
        if (response.data.intro && response.data.intro.end_ms !== null) {
            intervals.push({
                startTime: response.data.intro.start_ms !== null ? response.data.intro.start_ms / 1000 : 0,
                endTime: response.data.intro.end_ms / 1000,
                type: 'intro',
                provider: 'theintrodb'
            });
        }

        // Add recap skip interval if available
        if (response.data.recap && response.data.recap.start_ms !== null && response.data.recap.end_ms !== null) {
            intervals.push({
                startTime: response.data.recap.start_ms / 1000,
                endTime: response.data.recap.end_ms / 1000,
                type: 'recap',
                provider: 'theintrodb'
            });
        }

        // Store credits info for next episode button timing
        if (response.data.credits && response.data.credits.start_ms !== null) {
            credits = {
                startTime: response.data.credits.start_ms / 1000,
                endTime: response.data.credits.end_ms !== null ? response.data.credits.end_ms / 1000 : null,
                confidence: response.data.credits.confidence
            };
        }

        if (intervals.length > 0 || credits) {
            logger.log(`[IntroService] TheIntroDB found data for TMDB ${tmdbId}:`, {
                intervals: intervals.length,
                hasCredits: !!credits
            });
        }

        return { intervals, credits };
    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            logger.log(`[IntroService] No TheIntroDB data for TMDB ${tmdbId}`);
            return { intervals: [], credits: null };
        }

        logger.error('[IntroService] Error fetching from TheIntroDB:', error?.message || error);
        return { intervals: [], credits: null };
    }
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
    kitsuId?: string,
    tmdbId?: number,
    type?: 'movie' | 'tv'
): Promise<{ intervals: SkipInterval[], credits: CreditsInfo | null }> {
    // Get user preference for intro source
    const introDbSource = mmkvStorage.getString('introDbSource') || 'theintrodb';

    if (introDbSource === 'theintrodb') {
        // User prefers TheIntroDB (new API)
        // 1. Try TheIntroDB (Primary) - Supports both movies and TV shows
        if (tmdbId && type) {
            const theIntroDbResult = await fetchFromTheIntroDb(tmdbId, type, season, episode);
            if (theIntroDbResult.intervals.length > 0 || theIntroDbResult.credits) {
                return theIntroDbResult;
            }
        }

        // 2. Try old IntroDB (Fallback for TV Shows)
        if (imdbId) {
            const introDbIntervals = await fetchFromIntroDb(imdbId, season, episode);
            if (introDbIntervals.length > 0) {
                return { intervals: introDbIntervals, credits: null };
            }
        }
    } else {
        // User prefers IntroDB (legacy)
        // 1. Try old IntroDB first
        if (imdbId) {
            const introDbIntervals = await fetchFromIntroDb(imdbId, season, episode);
            if (introDbIntervals.length > 0) {
                return { intervals: introDbIntervals, credits: null };
            }
        }

        // 2. Try TheIntroDB as fallback
        if (tmdbId && type) {
            const theIntroDbResult = await fetchFromTheIntroDb(tmdbId, type, season, episode);
            if (theIntroDbResult.intervals.length > 0 || theIntroDbResult.credits) {
                return theIntroDbResult;
            }
        }
    }

    // 3. Try AniSkip (Anime) if we have MAL ID or Kitsu ID
    let finalMalId = malId;

    // If we have Kitsu ID but no MAL ID, try to resolve it
    if (!finalMalId && kitsuId) {
        logger.log(`[IntroService] Resolving MAL ID from Kitsu ID: ${kitsuId}`);
        finalMalId = await getMalIdFromKitsu(kitsuId) || undefined;
    }

    // If we still don't have MAL ID but have IMDb ID (e.g. Cinemeta), try to resolve it
    if (!finalMalId && imdbId) {
        // Priority 1: ARM API (Fastest)
        logger.log(`[IntroService] Attempting to resolve MAL ID via ARM for: ${imdbId}`);
        finalMalId = await getMalIdFromArm(imdbId) || undefined;

        // Priority 2: Kitsu/TMDB Chain (Fallback)
        if (!finalMalId) {
            logger.log(`[IntroService] ARM failed, falling back to Kitsu/TMDB chain for: ${imdbId}`);
            finalMalId = await getMalIdFromImdb(imdbId) || undefined;
        }
    }

    if (finalMalId) {
        logger.log(`[IntroService] Fetching AniSkip for MAL ID: ${finalMalId} Ep: ${episode}`);
        const aniSkipIntervals = await fetchFromAniSkip(finalMalId, episode);
        if (aniSkipIntervals.length > 0) {
            logger.log(`[IntroService] Found ${aniSkipIntervals.length} skip intervals from AniSkip`);
            return { intervals: aniSkipIntervals, credits: null };
        }
    }

    return { intervals: [], credits: null };
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
