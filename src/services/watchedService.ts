import { TraktService } from './traktService';
import { storageService } from './storageService';
import { mmkvStorage } from './mmkvStorage';
import { logger } from '../utils/logger';
import { MalSync } from './mal/MalSync';
import { MalAuthService } from './mal/MalAuth';
import { mappingService } from './MappingService';

/**
 * WatchedService - Manages "watched" status for movies, episodes, and seasons.
 * Handles both local storage and Trakt/MAL sync transparently.
 */
class WatchedService {
    private static instance: WatchedService;
    private traktService: TraktService;

    private constructor() {
        this.traktService = TraktService.getInstance();
        // Initialize mapping service
        mappingService.init().catch(err => logger.error('[WatchedService] MappingService init failed:', err));
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

            // Sync to Trakt
            if (isTraktAuth) {
                syncedToTrakt = await this.traktService.addToWatchedMovies(imdbId, watchedAt);
                logger.log(`[WatchedService] Trakt sync result for movie: ${syncedToTrakt}`);
            }

            // Sync to MAL
            const isMalAuth = await MalAuthService.isAuthenticated();
            if (isMalAuth) {
                MalSync.scrobbleEpisode(
                    'Movie', 
                    1, 
                    1, 
                    'movie', 
                    undefined, 
                    imdbId
                ).catch(err => logger.error('[WatchedService] MAL movie sync failed:', err));
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

            // Sync to Trakt
            if (isTraktAuth) {
                syncedToTrakt = await this.traktService.addToWatchedEpisodes(
                    showImdbId,
                    season,
                    episode,
                    watchedAt
                );
                logger.log(`[WatchedService] Trakt sync result for episode: ${syncedToTrakt}`);
            }

            // Sync to MAL
            const isMalAuth = await MalAuthService.isAuthenticated();
            if (isMalAuth && showImdbId) {
                // We need the title for scrobbleEpisode (as fallback), 
                // but getMalId will now prioritize the IMDb mapping.
                // We'll use a placeholder title or try to find it if possible.
                MalSync.scrobbleEpisode(
                    'Anime', // Title fallback
                    episode,
                    0, // Total episodes (MalSync will fetch)
                    'series',
                    season,
                    showImdbId
                ).catch(err => logger.error('[WatchedService] MAL sync failed:', err));
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
        const isAuthed = await this.traktService.isAuthenticated();

        if (isAuthed) {
          const traktWatched =
            await this.traktService.isMovieWatchedAccurate(imdbId);
          if (traktWatched) return true;
        }

        const local = await mmkvStorage.getItem(`watched:movie:${imdbId}`);
        return local === 'true';
      } catch {
        return false;
      }
    }
    

    /**
     * Check if an episode is marked as watched (locally)
     */
    public async isEpisodeWatched(
      showId: string,
      season: number,
      episode: number
    ): Promise<boolean> {
      try {
        const isAuthed = await this.traktService.isAuthenticated();

        if (isAuthed) {
          const traktWatched =
            await this.traktService.isEpisodeWatchedAccurate(
              showId,
              season,
              episode
            );
          if (traktWatched) return true;
        }

        const episodeId = `${showId}:${season}:${episode}`;
        const progress = await storageService.getWatchProgress(
          showId,
          'series',
          episodeId
        );

        if (!progress) return false;

        const pct = (progress.currentTime / progress.duration) * 100;
        return pct >= 99;
      } catch {
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
