import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { traktService, TraktUser, TraktWatchedItem, TraktContentData, TraktPlaybackItem } from '../services/traktService';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';

export function useTraktIntegration() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<TraktUser | null>(null);
  const [watchedMovies, setWatchedMovies] = useState<TraktWatchedItem[]>([]);
  const [watchedShows, setWatchedShows] = useState<TraktWatchedItem[]>([]);
  const [lastAuthCheck, setLastAuthCheck] = useState<number>(Date.now());

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
      
      // Update the last auth check timestamp to trigger dependent components to update
      setLastAuthCheck(Date.now());
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
        traktService.getWatchedMovies(),
        traktService.getWatchedShows()
      ]);
      setWatchedMovies(movies);
      setWatchedShows(shows);
    } catch (error) {
      logger.error('[useTraktIntegration] Error loading watched items:', error);
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
    logger.log(`[useTraktIntegration] getTraktPlaybackProgress called - isAuthenticated: ${isAuthenticated}, type: ${type || 'all'}`);
    
    if (!isAuthenticated) {
      logger.log('[useTraktIntegration] getTraktPlaybackProgress: Not authenticated');
      return [];
    }
    
    try {
      logger.log('[useTraktIntegration] Calling traktService.getPlaybackProgress...');
      const result = await traktService.getPlaybackProgress(type);
      logger.log(`[useTraktIntegration] traktService.getPlaybackProgress returned ${result.length} items`);
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
            // Build content data from stored progress
            const contentData: TraktContentData = {
              type: item.type as 'movie' | 'episode',
              imdbId: item.id,
              title: 'Unknown', // We don't store title in progress, this would need metadata lookup
              year: 0,
              season: item.episodeId ? parseInt(item.episodeId.split('S')[1]?.split('E')[0] || '0') : undefined,
              episode: item.episodeId ? parseInt(item.episodeId.split('E')[1] || '0') : undefined
            };
            
            const progressPercent = (item.progress.currentTime / item.progress.duration) * 100;
            
            const success = await traktService.syncProgressToTrakt(contentData, progressPercent, true);
            if (success) {
              await storageService.updateTraktSyncStatus(item.id, item.type, true, progressPercent, item.episodeId);
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
    logger.log(`[useTraktIntegration] fetchAndMergeTraktProgress called - isAuthenticated: ${isAuthenticated}`);
    
    if (!isAuthenticated) {
      logger.log('[useTraktIntegration] Not authenticated, skipping Trakt progress fetch');
      return false;
    }
    
    try {
      // Fetch both playback progress and recently watched movies
      logger.log('[useTraktIntegration] Fetching Trakt playback progress and watched movies...');
      const [traktProgress, watchedMovies] = await Promise.all([
        getTraktPlaybackProgress(),
        traktService.getWatchedMovies()
      ]);
      
      logger.log(`[useTraktIntegration] Retrieved ${traktProgress.length} Trakt progress items, ${watchedMovies.length} watched movies`);
      
      // Process playback progress (in-progress items)
      for (const item of traktProgress) {
        try {
          let id: string;
          let type: string;
          let episodeId: string | undefined;
          
          if (item.type === 'movie' && item.movie) {
            id = item.movie.ids.imdb;
            type = 'movie';
            logger.log(`[useTraktIntegration] Processing Trakt movie progress: ${item.movie.title} (${id}) - ${item.progress}%`);
          } else if (item.type === 'episode' && item.show && item.episode) {
            id = item.show.ids.imdb;
            type = 'series';
            episodeId = `${id}:${item.episode.season}:${item.episode.number}`;
            logger.log(`[useTraktIntegration] Processing Trakt episode progress: ${item.show.title} S${item.episode.season}E${item.episode.number} (${id}) - ${item.progress}%`);
          } else {
            logger.warn(`[useTraktIntegration] Skipping invalid Trakt progress item:`, item);
            continue;
          }
          
          logger.log(`[useTraktIntegration] Merging progress for ${type} ${id}: ${item.progress}% from ${item.paused_at}`);
          await storageService.mergeWithTraktProgress(
            id,
            type,
            item.progress,
            item.paused_at,
            episodeId
          );
        } catch (error) {
          logger.error('[useTraktIntegration] Error merging individual Trakt progress:', error);
        }
      }
      
      // Process watched movies (100% completed)
      for (const movie of watchedMovies) {
        try {
          if (movie.movie?.ids?.imdb) {
            const id = movie.movie.ids.imdb;
            const watchedAt = movie.last_watched_at;
            logger.log(`[useTraktIntegration] Processing watched movie: ${movie.movie.title} (${id}) - 100% watched on ${watchedAt}`);
            
            await storageService.mergeWithTraktProgress(
              id,
              'movie',
              100, // 100% progress for watched items
              watchedAt
            );
          }
        } catch (error) {
          logger.error('[useTraktIntegration] Error merging watched movie:', error);
        }
      }
      
      logger.log(`[useTraktIntegration] Successfully merged ${traktProgress.length} progress items + ${watchedMovies.length} watched movies`);
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
      logger.log('[useTraktIntegration] User authenticated, fetching Trakt progress to replace local data');
      fetchAndMergeTraktProgress().then((success) => {
        if (success) {
          logger.log('[useTraktIntegration] Trakt progress merged successfully - local data replaced with Trakt data');
        } else {
          logger.warn('[useTraktIntegration] Failed to merge Trakt progress');
        }
        // Small delay to ensure storage subscribers are notified
        setTimeout(() => {
          logger.log('[useTraktIntegration] Trakt progress merge completed, UI should refresh');
        }, 100);
      });
    }
  }, [isAuthenticated, fetchAndMergeTraktProgress]);

  // App focus sync - sync when app comes back into focus (much smarter than periodic)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        logger.log('[useTraktIntegration] App became active, syncing Trakt data');
        fetchAndMergeTraktProgress().then((success) => {
          if (success) {
            logger.log('[useTraktIntegration] App focus sync completed successfully');
          }
        }).catch(error => {
          logger.error('[useTraktIntegration] App focus sync failed:', error);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, [isAuthenticated, fetchAndMergeTraktProgress]);

  // Trigger sync when auth status is manually refreshed (for login scenarios)
  useEffect(() => {
    if (isAuthenticated) {
      logger.log('[useTraktIntegration] Auth status refresh detected, triggering Trakt progress merge');
      fetchAndMergeTraktProgress().then((success) => {
        if (success) {
          logger.log('[useTraktIntegration] Trakt progress merged after manual auth refresh');
        }
      });
    }
  }, [lastAuthCheck, isAuthenticated, fetchAndMergeTraktProgress]);

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
    checkAuthStatus,
    loadWatchedItems,
    isMovieWatched,
    isEpisodeWatched,
    markMovieAsWatched,
    markEpisodeAsWatched,
    refreshAuthStatus,
    startWatching,
    updateProgress,
    stopWatching,
    syncProgress, // legacy
    getTraktPlaybackProgress,
    syncAllProgress,
    fetchAndMergeTraktProgress,
    forceSyncTraktProgress // For manual testing
  };
} 