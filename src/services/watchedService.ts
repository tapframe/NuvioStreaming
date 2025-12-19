import { TraktService } from './traktService';
import { storageService } from './storageService';
import { mmkvStorage } from './mmkvStorage';
import { logger } from '../utils/logger';

/**
 * WatchedService - Manages "watched" status for movies, episodes, and seasons.
 * Handles both local storage and Trakt sync transparently.
 * 
 * When Trakt is authenticated, it syncs to Trakt.
 * When not authenticated, it stores locally.
 */
class WatchedService {
    private static instance: WatchedService;
    private traktService: TraktService;

    private constructor() {
        this.traktService = TraktService.getInstance();
    }

    public static getInstance(): WatchedService {
        if (!WatchedService.instance) {
            WatchedService.instance = new WatchedService();
        }
        return WatchedService.instance;
    }

    /**
     * Mark a movie as watched
     * @param imdbId - The IMDb ID of the movie
     * @param watchedAt - Optional date when watched
     */
    public async markMovieAsWatched(
        imdbId: string,
        watchedAt: Date = new Date()
    ): Promise<{ success: boolean; syncedToTrakt: boolean }> {
        try {
            logger.log(`[WatchedService] Marking movie as watched: ${imdbId}`);

            // Check if Trakt is authenticated
            const isTraktAuth = await this.traktService.isAuthenticated();
            let syncedToTrakt = false;

            if (isTraktAuth) {
                // Sync to Trakt
                syncedToTrakt = await this.traktService.addToWatchedMovies(imdbId, watchedAt);
                logger.log(`[WatchedService] Trakt sync result for movie: ${syncedToTrakt}`);
            }

            // Also store locally as "completed" (100% progress)
            await this.setLocalWatchedStatus(imdbId, 'movie', true, undefined, watchedAt);

            return { success: true, syncedToTrakt };
        } catch (error) {
            logger.error('[WatchedService] Failed to mark movie as watched:', error);
            return { success: false, syncedToTrakt: false };
        }
    }

    /**
     * Mark a single episode as watched
     * @param showImdbId - The IMDb ID of the show
     * @param showId - The Stremio ID of the show (for local storage)
     * @param season - Season number
     * @param episode - Episode number
     * @param watchedAt - Optional date when watched
     */
    public async markEpisodeAsWatched(
        showImdbId: string,
        showId: string,
        season: number,
        episode: number,
        watchedAt: Date = new Date()
    ): Promise<{ success: boolean; syncedToTrakt: boolean }> {
        try {
            logger.log(`[WatchedService] Marking episode as watched: ${showImdbId} S${season}E${episode}`);

            // Check if Trakt is authenticated
            const isTraktAuth = await this.traktService.isAuthenticated();
            let syncedToTrakt = false;

            if (isTraktAuth) {
                // Sync to Trakt
                syncedToTrakt = await this.traktService.addToWatchedEpisodes(
                    showImdbId,
                    season,
                    episode,
                    watchedAt
                );
                logger.log(`[WatchedService] Trakt sync result for episode: ${syncedToTrakt}`);
            }

            // Store locally as "completed"
            const episodeId = `${showId}:${season}:${episode}`;
            await this.setLocalWatchedStatus(showId, 'series', true, episodeId, watchedAt);

            return { success: true, syncedToTrakt };
        } catch (error) {
            logger.error('[WatchedService] Failed to mark episode as watched:', error);
            return { success: false, syncedToTrakt: false };
        }
    }

    /**
     * Mark multiple episodes as watched (batch operation)
     * @param showImdbId - The IMDb ID of the show
     * @param showId - The Stremio ID of the show (for local storage)
     * @param episodes - Array of { season, episode } objects
     * @param watchedAt - Optional date when watched
     */
    public async markEpisodesAsWatched(
        showImdbId: string,
        showId: string,
        episodes: Array<{ season: number; episode: number }>,
        watchedAt: Date = new Date()
    ): Promise<{ success: boolean; syncedToTrakt: boolean; count: number }> {
        try {
            if (episodes.length === 0) {
                return { success: true, syncedToTrakt: false, count: 0 };
            }

            logger.log(`[WatchedService] Marking ${episodes.length} episodes as watched for ${showImdbId}`);

            // Check if Trakt is authenticated
            const isTraktAuth = await this.traktService.isAuthenticated();
            let syncedToTrakt = false;

            if (isTraktAuth) {
                // Sync to Trakt (batch operation)
                syncedToTrakt = await this.traktService.markEpisodesAsWatched(
                    showImdbId,
                    episodes,
                    watchedAt
                );
                logger.log(`[WatchedService] Trakt batch sync result: ${syncedToTrakt}`);
            }

            // Store locally as "completed" for each episode
            for (const ep of episodes) {
                const episodeId = `${showId}:${ep.season}:${ep.episode}`;
                await this.setLocalWatchedStatus(showId, 'series', true, episodeId, watchedAt);
            }

            return { success: true, syncedToTrakt, count: episodes.length };
        } catch (error) {
            logger.error('[WatchedService] Failed to mark episodes as watched:', error);
            return { success: false, syncedToTrakt: false, count: 0 };
        }
    }

    /**
     * Mark an entire season as watched
     * @param showImdbId - The IMDb ID of the show
     * @param showId - The Stremio ID of the show (for local storage)
     * @param season - Season number
     * @param episodeNumbers - Array of episode numbers in the season
     * @param watchedAt - Optional date when watched
     */
    public async markSeasonAsWatched(
        showImdbId: string,
        showId: string,
        season: number,
        episodeNumbers: number[],
        watchedAt: Date = new Date()
    ): Promise<{ success: boolean; syncedToTrakt: boolean; count: number }> {
        try {
            logger.log(`[WatchedService] Marking season ${season} as watched for ${showImdbId}`);

            // Check if Trakt is authenticated
            const isTraktAuth = await this.traktService.isAuthenticated();
            let syncedToTrakt = false;

            if (isTraktAuth) {
                // Sync entire season to Trakt
                syncedToTrakt = await this.traktService.markSeasonAsWatched(
                    showImdbId,
                    season,
                    watchedAt
                );
                logger.log(`[WatchedService] Trakt season sync result: ${syncedToTrakt}`);
            }

            // Store locally as "completed" for each episode in the season
            for (const epNum of episodeNumbers) {
                const episodeId = `${showId}:${season}:${epNum}`;
                await this.setLocalWatchedStatus(showId, 'series', true, episodeId, watchedAt);
            }

            return { success: true, syncedToTrakt, count: episodeNumbers.length };
        } catch (error) {
            logger.error('[WatchedService] Failed to mark season as watched:', error);
            return { success: false, syncedToTrakt: false, count: 0 };
        }
    }

    /**
     * Unmark a movie as watched (remove from history)
     */
    public async unmarkMovieAsWatched(
        imdbId: string
    ): Promise<{ success: boolean; syncedToTrakt: boolean }> {
        try {
            logger.log(`[WatchedService] Unmarking movie as watched: ${imdbId}`);

            const isTraktAuth = await this.traktService.isAuthenticated();
            let syncedToTrakt = false;

            if (isTraktAuth) {
                syncedToTrakt = await this.traktService.removeMovieFromHistory(imdbId);
                logger.log(`[WatchedService] Trakt remove result for movie: ${syncedToTrakt}`);
            }

            // Remove local progress
            await storageService.removeWatchProgress(imdbId, 'movie');
            await mmkvStorage.removeItem(`watched:movie:${imdbId}`);

            return { success: true, syncedToTrakt };
        } catch (error) {
            logger.error('[WatchedService] Failed to unmark movie as watched:', error);
            return { success: false, syncedToTrakt: false };
        }
    }

    /**
     * Unmark an episode as watched (remove from history)
     */
    public async unmarkEpisodeAsWatched(
        showImdbId: string,
        showId: string,
        season: number,
        episode: number
    ): Promise<{ success: boolean; syncedToTrakt: boolean }> {
        try {
            logger.log(`[WatchedService] Unmarking episode as watched: ${showImdbId} S${season}E${episode}`);

            const isTraktAuth = await this.traktService.isAuthenticated();
            let syncedToTrakt = false;

            if (isTraktAuth) {
                syncedToTrakt = await this.traktService.removeEpisodeFromHistory(
                    showImdbId,
                    season,
                    episode
                );
                logger.log(`[WatchedService] Trakt remove result for episode: ${syncedToTrakt}`);
            }

            // Remove local progress
            const episodeId = `${showId}:${season}:${episode}`;
            await storageService.removeWatchProgress(showId, 'series', episodeId);

            return { success: true, syncedToTrakt };
        } catch (error) {
            logger.error('[WatchedService] Failed to unmark episode as watched:', error);
            return { success: false, syncedToTrakt: false };
        }
    }

    /**
     * Unmark an entire season as watched (remove from history)
     * @param showImdbId - The IMDb ID of the show
     * @param showId - The Stremio ID of the show (for local storage)
     * @param season - Season number
     * @param episodeNumbers - Array of episode numbers in the season
     */
    public async unmarkSeasonAsWatched(
        showImdbId: string,
        showId: string,
        season: number,
        episodeNumbers: number[]
    ): Promise<{ success: boolean; syncedToTrakt: boolean; count: number }> {
        try {
            logger.log(`[WatchedService] Unmarking season ${season} as watched for ${showImdbId}`);

            const isTraktAuth = await this.traktService.isAuthenticated();
            let syncedToTrakt = false;

            if (isTraktAuth) {
                // Remove entire season from Trakt
                syncedToTrakt = await this.traktService.removeSeasonFromHistory(
                    showImdbId,
                    season
                );
                logger.log(`[WatchedService] Trakt season removal result: ${syncedToTrakt}`);
            }

            // Remove local progress for each episode in the season
            for (const epNum of episodeNumbers) {
                const episodeId = `${showId}:${season}:${epNum}`;
                await storageService.removeWatchProgress(showId, 'series', episodeId);
            }

            return { success: true, syncedToTrakt, count: episodeNumbers.length };
        } catch (error) {
            logger.error('[WatchedService] Failed to unmark season as watched:', error);
            return { success: false, syncedToTrakt: false, count: 0 };
        }
    }

    /**
     * Check if a movie is marked as watched (locally)
     */
    public async isMovieWatched(imdbId: string): Promise<boolean> {
        try {
            // First check local watched flag
            const localWatched = await mmkvStorage.getItem(`watched:movie:${imdbId}`);
            if (localWatched === 'true') {
                return true;
            }

            // Check local progress
            const progress = await storageService.getWatchProgress(imdbId, 'movie');
            if (progress) {
                const progressPercent = (progress.currentTime / progress.duration) * 100;
                if (progressPercent >= 85) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            logger.error('[WatchedService] Error checking movie watched status:', error);
            return false;
        }
    }

    /**
     * Check if an episode is marked as watched (locally)
     */
    public async isEpisodeWatched(showId: string, season: number, episode: number): Promise<boolean> {
        try {
            const episodeId = `${showId}:${season}:${episode}`;

            // Check local progress
            const progress = await storageService.getWatchProgress(showId, 'series', episodeId);
            if (progress) {
                const progressPercent = (progress.currentTime / progress.duration) * 100;
                if (progressPercent >= 85) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            logger.error('[WatchedService] Error checking episode watched status:', error);
            return false;
        }
    }

    /**
     * Set local watched status by creating a "completed" progress entry
     */
    private async setLocalWatchedStatus(
        id: string,
        type: 'movie' | 'series',
        watched: boolean,
        episodeId?: string,
        watchedAt: Date = new Date()
    ): Promise<void> {
        try {
            if (watched) {
                // Create a "completed" progress entry (100% watched)
                const progress = {
                    currentTime: 1, // Minimal values to indicate completion
                    duration: 1,
                    lastUpdated: watchedAt.getTime(),
                    traktSynced: false, // Will be set to true if Trakt sync succeeded
                    traktProgress: 100,
                };
                await storageService.setWatchProgress(id, type, progress, episodeId, {
                    forceWrite: true,
                    forceNotify: true
                });

                // Also set the legacy watched flag for movies
                if (type === 'movie') {
                    await mmkvStorage.setItem(`watched:${type}:${id}`, 'true');
                }
            } else {
                // Remove progress
                await storageService.removeWatchProgress(id, type, episodeId);
                if (type === 'movie') {
                    await mmkvStorage.removeItem(`watched:${type}:${id}`);
                }
            }
        } catch (error) {
            logger.error('[WatchedService] Error setting local watched status:', error);
        }
    }
}

export const watchedService = WatchedService.getInstance();
