import { useState, useEffect, useCallback } from 'react';
import { traktService, TraktUser, TraktWatchedItem } from '../services/traktService';
import { logger } from '../utils/logger';

export function useTraktIntegration() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<TraktUser | null>(null);
  const [watchedMovies, setWatchedMovies] = useState<TraktWatchedItem[]>([]);
  const [watchedShows, setWatchedShows] = useState<TraktWatchedItem[]>([]);

  // Check authentication status
  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const authenticated = await traktService.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        const profile = await traktService.getUserProfile();
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
    } catch (error) {
      logger.error('[useTraktIntegration] Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    markEpisodeAsWatched
  };
} 