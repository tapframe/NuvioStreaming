import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  traktService,
  TraktUser,
  TraktWatchedItem,
  TraktWatchlistItem,
  TraktCollectionItem,
  TraktRatingItem,
  TraktContentData,
  TraktPlaybackItem
} from '../services/traktService';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';

export function useTraktIntegration() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<TraktUser | null>(null);
  const [watchedMovies, setWatchedMovies] = useState<TraktWatchedItem[]>([]);
  const [watchedShows, setWatchedShows] = useState<TraktWatchedItem[]>([]);
  const [watchlistMovies, setWatchlistMovies] = useState<TraktWatchlistItem[]>([]);
  const [watchlistShows, setWatchlistShows] = useState<TraktWatchlistItem[]>([]);
  const [collectionMovies, setCollectionMovies] = useState<TraktCollectionItem[]>([]);
  const [collectionShows, setCollectionShows] = useState<TraktCollectionItem[]>([]);
  const [continueWatching, setContinueWatching] = useState<TraktPlaybackItem[]>([]);
  const [ratedContent, setRatedContent] = useState<TraktRatingItem[]>([]);

  // State for real-time status tracking
  const [watchlistItems, setWatchlistItems] = useState<Set<string>>(new Set());
  const [collectionItems, setCollectionItems] = useState<Set<string>>(new Set());

  // Check authentication status
  const checkAuthStatus = useCallback(async () => {
    logger.log('[useTraktIntegration] checkAuthStatus called');
    setIsLoading(true);
    try {
      const authenticated = await traktService.isAuthenticated();
      logger.log(`[useTraktIntegration] Authentication check result: ${authenticated}`);
      setIsAuthenticated(authenticated);

      if (authenticated) {
        logger.log('[useTraktIntegration] User is authenticated, fetching profile...');
        const profile = await traktService.getUserProfile();
        logger.log(`[useTraktIntegration] User profile: ${profile.username}`);
        setUserProfile(profile);
      } else {
        logger.log('[useTraktIntegration] User is not authenticated');
        setUserProfile(null);
      }


    } catch (error) {
      logger.error('[useTraktIntegration] Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Function to force refresh the auth status
  const refreshAuthStatus = useCallback(async () => {
    logger.log('[useTraktIntegration] Refreshing auth status');
    await checkAuthStatus();
  }, [checkAuthStatus]);

  // Load watched items
  const loadWatchedItems = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const [movies, shows] = await Promise.all([
        traktService.getWatchedMoviesWithImages(),
        traktService.getWatchedShowsWithImages()
      ]);
      setWatchedMovies(movies);
      setWatchedShows(shows);
    } catch (error) {
      logger.error('[useTraktIntegration] Error loading watched items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Load all collections (watchlist, collection, continue watching, ratings)
  const loadAllCollections = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const [
        watchlistMovies,
        watchlistShows,
        collectionMovies,
        collectionShows,
        continueWatching,
        ratings
      ] = await Promise.all([
        traktService.getWatchlistMoviesWithImages(),
        traktService.getWatchlistShowsWithImages(),
        traktService.getCollectionMoviesWithImages(),
        traktService.getCollectionShowsWithImages(),
        traktService.getPlaybackProgressWithImages(),
        traktService.getRatingsWithImages()
      ]);

      setWatchlistMovies(watchlistMovies);
      setWatchlistShows(watchlistShows);
      setCollectionMovies(collectionMovies);
      setCollectionShows(collectionShows);
      setContinueWatching(continueWatching);
      setRatedContent(ratings);

      // Populate watchlist and collection sets for quick lookups
      const newWatchlistItems = new Set<string>();
      const newCollectionItems = new Set<string>();

      // Add movies to sets
      watchlistMovies.forEach(item => {
        if (item.movie?.ids?.imdb) {
          newWatchlistItems.add(`movie:${item.movie.ids.imdb}`);
        }
      });

      collectionMovies.forEach(item => {
        if (item.movie?.ids?.imdb) {
          newCollectionItems.add(`movie:${item.movie.ids.imdb}`);
        }
      });

      // Add shows to sets
      watchlistShows.forEach(item => {
        if (item.show?.ids?.imdb) {
          newWatchlistItems.add(`show:${item.show.ids.imdb}`);
        }
      });

      collectionShows.forEach(item => {
        if (item.show?.ids?.imdb) {
          newCollectionItems.add(`show:${item.show.ids.imdb}`);
        }
      });

      setWatchlistItems(newWatchlistItems);
      setCollectionItems(newCollectionItems);
    } catch (error) {
      logger.error('[useTraktIntegration] Error loading all collections:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Check if a movie is watched
  const isMovieWatched = useCallback(async (imdbId: string): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.isMovieWatched(imdbId);
    } catch (error) {
      logger.error('[useTraktIntegration] Error checking if movie is watched:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Check if an episode is watched
  const isEpisodeWatched = useCallback(async (
    imdbId: string,
    season: number,
    episode: number
  ): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.isEpisodeWatched(imdbId, season, episode);
    } catch (error) {
      logger.error('[useTraktIntegration] Error checking if episode is watched:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Mark a movie as watched
  const markMovieAsWatched = useCallback(async (
    imdbId: string,
    watchedAt: Date = new Date()
  ): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const result = await traktService.addToWatchedMovies(imdbId, watchedAt);
      if (result) {
        // Refresh watched movies list
        await loadWatchedItems();
      }
      return result;
    } catch (error) {
      logger.error('[useTraktIntegration] Error marking movie as watched:', error);
      return false;
    }
  }, [isAuthenticated, loadWatchedItems]);

  // Add content to Trakt watchlist
  const addToWatchlist = useCallback(async (imdbId: string, type: 'movie' | 'show'): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const success = await traktService.addToWatchlist(imdbId, type);
      if (success) {
        // Ensure consistent IMDb ID format (with 'tt' prefix)
        const normalizedImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
        setWatchlistItems(prev => new Set(prev).add(`${type}:${normalizedImdbId}`));
        // Don't refresh immediately - let the local state handle the UI update
        // The data will be refreshed on next app focus or manual refresh
      }
      return success;
    } catch (error) {
      logger.error('[useTraktIntegration] Error adding to watchlist:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Remove content from Trakt watchlist
  const removeFromWatchlist = useCallback(async (imdbId: string, type: 'movie' | 'show'): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const success = await traktService.removeFromWatchlist(imdbId, type);
      if (success) {
        // Ensure consistent IMDb ID format (with 'tt' prefix)
        const normalizedImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
        setWatchlistItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(`${type}:${normalizedImdbId}`);
          return newSet;
        });
        // Don't refresh immediately - let the local state handle the UI update
      }
      return success;
    } catch (error) {
      logger.error('[useTraktIntegration] Error removing from watchlist:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Add content to Trakt collection
  const addToCollection = useCallback(async (imdbId: string, type: 'movie' | 'show'): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const success = await traktService.addToCollection(imdbId, type);
      if (success) {
        // Ensure consistent IMDb ID format (with 'tt' prefix)
        const normalizedImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
        setCollectionItems(prev => new Set(prev).add(`${type}:${normalizedImdbId}`));
        // Don't refresh immediately - let the local state handle the UI update
      }
      return success;
    } catch (error) {
      logger.error('[useTraktIntegration] Error adding to collection:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Remove content from Trakt collection
  const removeFromCollection = useCallback(async (imdbId: string, type: 'movie' | 'show'): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const success = await traktService.removeFromCollection(imdbId, type);
      if (success) {
        // Ensure consistent IMDb ID format (with 'tt' prefix)
        const normalizedImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
        setCollectionItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(`${type}:${normalizedImdbId}`);
          return newSet;
        });
        // Don't refresh immediately - let the local state handle the UI update
      }
      return success;
    } catch (error) {
      logger.error('[useTraktIntegration] Error removing from collection:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Check if content is in Trakt watchlist
  const isInWatchlist = useCallback((imdbId: string, type: 'movie' | 'show'): boolean => {
    // Ensure consistent IMDb ID format (with 'tt' prefix)
    const normalizedImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
    return watchlistItems.has(`${type}:${normalizedImdbId}`);
  }, [watchlistItems]);

  // Check if content is in Trakt collection
  const isInCollection = useCallback((imdbId: string, type: 'movie' | 'show'): boolean => {
    // Ensure consistent IMDb ID format (with 'tt' prefix)
    const normalizedImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
    return collectionItems.has(`${type}:${normalizedImdbId}`);
  }, [collectionItems]);

  // Mark an episode as watched
  const markEpisodeAsWatched = useCallback(async (
    imdbId: string,
    season: number,
    episode: number,
    watchedAt: Date = new Date()
  ): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const result = await traktService.addToWatchedEpisodes(imdbId, season, episode, watchedAt);
      if (result) {
        // Refresh watched shows list
        await loadWatchedItems();
      }
      return result;
    } catch (error) {
      logger.error('[useTraktIntegration] Error marking episode as watched:', error);
      return false;
    }
  }, [isAuthenticated, loadWatchedItems]);

  // Start watching content (scrobble start)
  const startWatching = useCallback(async (contentData: TraktContentData, progress: number): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.scrobbleStart(contentData, progress);
    } catch (error) {
      logger.error('[useTraktIntegration] Error starting watch:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Update progress while watching (scrobble pause)
  const updateProgress = useCallback(async (
    contentData: TraktContentData,
    progress: number,
    force: boolean = false
  ): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.scrobblePause(contentData, progress, force);
    } catch (error) {
      logger.error('[useTraktIntegration] Error updating progress:', error);
      return false;
    }
  }, [isAuthenticated]);

  // IMMEDIATE SCROBBLE METHODS - Bypass queue for instant user feedback

  // Immediate update progress while watching (scrobble pause)
  const updateProgressImmediate = useCallback(async (
    contentData: TraktContentData,
    progress: number
  ): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.scrobblePauseImmediate(contentData, progress);
    } catch (error) {
      logger.error('[useTraktIntegration] Error updating progress immediately:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Stop watching content (scrobble stop)
  const stopWatching = useCallback(async (contentData: TraktContentData, progress: number): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.scrobbleStop(contentData, progress);
    } catch (error) {
      logger.error('[useTraktIntegration] Error stopping watch:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Immediate stop watching content (scrobble stop)
  const stopWatchingImmediate = useCallback(async (contentData: TraktContentData, progress: number): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.scrobbleStopImmediate(contentData, progress);
    } catch (error) {
      logger.error('[useTraktIntegration] Error stopping watch immediately:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Sync progress to Trakt (legacy method)
  const syncProgress = useCallback(async (
    contentData: TraktContentData,
    progress: number,
    force: boolean = false
  ): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      return await traktService.syncProgressToTrakt(contentData, progress, force);
    } catch (error) {
      logger.error('[useTraktIntegration] Error syncing progress:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Get playback progress from Trakt
  const getTraktPlaybackProgress = useCallback(async (type?: 'movies' | 'shows'): Promise<TraktPlaybackItem[]> => {
    // getTraktPlaybackProgress call logging removed

    if (!isAuthenticated) {
      logger.log('[useTraktIntegration] getTraktPlaybackProgress: Not authenticated');
      return [];
    }

    try {
      // traktService.getPlaybackProgress call logging removed
      const result = await traktService.getPlaybackProgress(type);
      // Playback progress logging removed
      return result;
    } catch (error) {
      logger.error('[useTraktIntegration] Error getting playback progress:', error);
      return [];
    }
  }, [isAuthenticated]);

  // Sync all local progress to Trakt
  const syncAllProgress = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const unsyncedProgress = await storageService.getUnsyncedProgress();
      logger.log(`[useTraktIntegration] Found ${unsyncedProgress.length} unsynced progress entries`);

      let syncedCount = 0;
      const batchSize = 5; // Process in smaller batches
      const delayBetweenBatches = 2000; // 2 seconds between batches

      // Process items in batches to avoid overwhelming the API
      for (let i = 0; i < unsyncedProgress.length; i += batchSize) {
        const batch = unsyncedProgress.slice(i, i + batchSize);

        // Process batch items with individual error handling
        const batchPromises = batch.map(async (item) => {
          try {
            const season = item.episodeId ? parseInt(item.episodeId.split('S')[1]?.split('E')[0] || '0') : undefined;
            const episode = item.episodeId ? parseInt(item.episodeId.split('E')[1] || '0') : undefined;

            // Build content data from stored progress
            const contentData: TraktContentData = {
              type: item.type as 'movie' | 'episode',
              imdbId: item.id,
              title: 'Unknown', // We don't store title in progress, this would need metadata lookup
              year: 0,
              season: season,
              episode: episode
            };

            const progressPercent = (item.progress.currentTime / item.progress.duration) * 100;
            const isCompleted = progressPercent >= traktService.completionThreshold;

            let success = false;

            if (isCompleted) {
              // Item is completed - add to history with original watched date
              const watchedAt = new Date(item.progress.lastUpdated);
              logger.log(`[useTraktIntegration] Syncing completed item to history with date ${watchedAt.toISOString()}: ${item.type}:${item.id}`);

              if (item.type === 'movie') {
                success = await traktService.addToWatchedMovies(item.id, watchedAt);
              } else if (item.type === 'series' || item.type === 'episode') { // Handle both type strings for safety
                if (season !== undefined && episode !== undefined) {
                  success = await traktService.addToWatchedEpisodes(item.id, season, episode, watchedAt);
                }
              }
            } else {
              // Item is in progress - sync as paused (scrobble)
              success = await traktService.syncProgressToTrakt(contentData, progressPercent, true);
            }

            if (success) {
              await storageService.updateTraktSyncStatus(
                item.id,
                item.type,
                true,
                isCompleted ? 100 : progressPercent,
                item.episodeId
              );
              return true;
            }
            return false;
          } catch (error) {
            logger.error('[useTraktIntegration] Error syncing individual progress:', error);
            return false;
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        syncedCount += batchResults.filter(result => result).length;

        // Delay between batches to avoid rate limiting
        if (i + batchSize < unsyncedProgress.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      logger.log(`[useTraktIntegration] Synced ${syncedCount}/${unsyncedProgress.length} progress entries`);
      return syncedCount > 0;
    } catch (error) {
      logger.error('[useTraktIntegration] Error syncing all progress:', error);
      return false;
    }
  }, [isAuthenticated]);

  // Fetch and merge Trakt progress with local progress
  const fetchAndMergeTraktProgress = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) {
      return false;
    }

    try {
      // Fetch both playback progress and recently watched movies
      const [traktProgress, watchedMovies, watchedShows] = await Promise.all([
        getTraktPlaybackProgress(),
        traktService.getWatchedMovies(),
        traktService.getWatchedShows()
      ]);

      // Progress retrieval logging removed

      // Batch process all updates to reduce storage notifications
      const updatePromises: Promise<void>[] = [];

      // Process playback progress (in-progress items)
      for (const item of traktProgress) {
        try {
          let id: string;
          let type: string;
          let episodeId: string | undefined;

          if (item.type === 'movie' && item.movie) {
            id = item.movie.ids.imdb;
            type = 'movie';
          } else if (item.type === 'episode' && item.show && item.episode) {
            id = item.show.ids.imdb;
            type = 'series';
            episodeId = `${id}:${item.episode.season}:${item.episode.number}`;
          } else {
            continue;
          }

          // Try to calculate exact time if we have stored duration
          const exactTime = await (async () => {
            const storedDuration = await storageService.getContentDuration(id, type, episodeId);
            if (storedDuration && storedDuration > 0) {
              return (item.progress / 100) * storedDuration;
            }
            return undefined;
          })();

          updatePromises.push(
            storageService.mergeWithTraktProgress(
              id,
              type,
              item.progress,
              item.paused_at,
              episodeId,
              exactTime
            )
          );
        } catch (error) {
          logger.error('[useTraktIntegration] Error preparing Trakt progress update:', error);
        }
      }

      // Process watched movies (100% completed)
      for (const movie of watchedMovies) {
        try {
          if (movie.movie?.ids?.imdb) {
            const id = movie.movie.ids.imdb;
            const watchedAt = movie.last_watched_at;

            updatePromises.push(
              storageService.mergeWithTraktProgress(
                id,
                'movie',
                100, // 100% progress for watched items
                watchedAt
              )
            );
          }
        } catch (error) {
          logger.error('[useTraktIntegration] Error preparing watched movie update:', error);
        }
      }
      for (const show of watchedShows) {
        try {
          if (show.show?.ids?.imdb && show.seasons) {
            const showImdbId = show.show.ids.imdb;

            for (const season of show.seasons) {
              for (const episode of season.episodes) {
                const episodeId = `${showImdbId}:${season.number}:${episode.number}`;
                updatePromises.push(
                  storageService.mergeWithTraktProgress(
                    showImdbId,
                    'series',
                    100,
                    episode.last_watched_at,
                    episodeId
                  )
                );
              }
            }
          }
        } catch (error) {
          logger.error('[useTraktIntegration] Error preparing watched show update:', error);
        }
      }
      // Execute all updates in parallel
      await Promise.all(updatePromises);

      // Trakt merge logging removed
      return true;
    } catch (error) {
      logger.error('[useTraktIntegration] Error fetching and merging Trakt progress:', error);
      return false;
    }
  }, [isAuthenticated, getTraktPlaybackProgress]);

  // Initialize and check auth status
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Load watched items when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadWatchedItems();
    }
  }, [isAuthenticated, loadWatchedItems]);

  // Auto-sync when authenticated changes OR when auth status is refreshed
  useEffect(() => {
    if (isAuthenticated) {
      // Fetch Trakt progress and merge with local
      fetchAndMergeTraktProgress().then((success) => {
        // Trakt progress merge success logging removed
      });
    }
  }, [isAuthenticated, fetchAndMergeTraktProgress]);

  // App focus sync - sync when app comes back into focus (much smarter than periodic)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchAndMergeTraktProgress().catch(error => {
          logger.error('[useTraktIntegration] App focus sync failed:', error);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [isAuthenticated, fetchAndMergeTraktProgress]);

  // Note: Auth check sync removed - fetchAndMergeTraktProgress is already called
  // by the isAuthenticated useEffect (lines 595-602) and app focus sync (lines 605-621)
  // Having another useEffect on lastAuthCheck caused infinite update depth errors

  // Manual force sync function for testing/troubleshooting
  const forceSyncTraktProgress = useCallback(async (): Promise<boolean> => {
    logger.log('[useTraktIntegration] Manual force sync triggered');
    if (!isAuthenticated) {
      logger.log('[useTraktIntegration] Cannot force sync - not authenticated');
      return false;
    }
    return await fetchAndMergeTraktProgress();
  }, [isAuthenticated, fetchAndMergeTraktProgress]);

  return {
    isAuthenticated,
    isLoading,
    userProfile,
    watchedMovies,
    watchedShows,
    watchlistMovies,
    watchlistShows,
    collectionMovies,
    collectionShows,
    continueWatching,
    ratedContent,
    checkAuthStatus,
    loadWatchedItems,
    loadAllCollections,
    isMovieWatched,
    isEpisodeWatched,
    markMovieAsWatched,
    markEpisodeAsWatched,
    refreshAuthStatus,
    startWatching,
    updateProgress,
    updateProgressImmediate,
    stopWatching,
    stopWatchingImmediate,
    syncProgress, // legacy
    getTraktPlaybackProgress,
    syncAllProgress,
    fetchAndMergeTraktProgress,
    forceSyncTraktProgress, // For manual testing
    // Trakt content management
    addToWatchlist,
    removeFromWatchlist,
    addToCollection,
    removeFromCollection,
    isInWatchlist,
    isInCollection
  };
}
