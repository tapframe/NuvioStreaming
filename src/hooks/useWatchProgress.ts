import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTraktContext } from '../contexts/TraktContext';
import { logger } from '../utils/logger';
import { storageService } from '../services/storageService';

interface WatchProgressData {
  currentTime: number;
  duration: number;
  lastUpdated: number;
  episodeId?: string;
  traktSynced?: boolean;
  traktProgress?: number;
}

export const useWatchProgress = (
  id: string, 
  type: 'movie' | 'series', 
  episodeId?: string,
  episodes: any[] = []
) => {
  const [watchProgress, setWatchProgress] = useState<WatchProgressData | null>(null);
  const { isAuthenticated: isTraktAuthenticated } = useTraktContext();
  
  // Function to get episode details from episodeId
  const getEpisodeDetails = useCallback((episodeId: string): { seasonNumber: string; episodeNumber: string; episodeName: string } | null => {
    // Try to parse from format "seriesId:season:episode"
    const parts = episodeId.split(':');
    if (parts.length === 3) {
      const [, seasonNum, episodeNum] = parts;
      // Find episode in our local episodes array
      const episode = episodes.find(
        ep => ep.season_number === parseInt(seasonNum) && 
              ep.episode_number === parseInt(episodeNum)
      );
      
      if (episode) {
        return {
          seasonNumber: seasonNum,
          episodeNumber: episodeNum,
          episodeName: episode.name
        };
      }
    }

    // If not found by season/episode, try stremioId
    const episodeByStremioId = episodes.find(ep => ep.stremioId === episodeId);
    if (episodeByStremioId) {
      return {
        seasonNumber: episodeByStremioId.season_number.toString(),
        episodeNumber: episodeByStremioId.episode_number.toString(),
        episodeName: episodeByStremioId.name
      };
    }

    return null;
  }, [episodes]);
  
  // Enhanced load watch progress with Trakt integration
  const loadWatchProgress = useCallback(async () => {
    try {
      if (id && type) {
        if (type === 'series') {
          const allProgress = await storageService.getAllWatchProgress();
          
          // Function to get episode number from episodeId
          const getEpisodeNumber = (epId: string) => {
            const parts = epId.split(':');
            if (parts.length === 3) {
              return {
                season: parseInt(parts[1]),
                episode: parseInt(parts[2])
              };
            }
            return null;
          };

          // Get all episodes for this series with progress
          const seriesProgresses = Object.entries(allProgress)
            .filter(([key]) => key.includes(`${type}:${id}:`))
            .map(([key, value]) => ({
              episodeId: key.split(`${type}:${id}:`)[1],
              progress: value
            }))
            .filter(({ episodeId, progress }) => {
              const progressPercent = (progress.currentTime / progress.duration) * 100;
              return progressPercent > 0;
            });

          // If we have a specific episodeId in route params
          if (episodeId) {
            const progress = await storageService.getWatchProgress(id, type, episodeId);
            if (progress) {
              // Always show the current episode progress when viewing it specifically
              // This allows HeroSection to properly display watched state
              setWatchProgress({ 
                ...progress, 
                episodeId,
                traktSynced: progress.traktSynced,
                traktProgress: progress.traktProgress
              });
            } else {
              setWatchProgress(null);
            }
          } else {
            // FIXED: Find the most recently watched episode instead of first unfinished
            // Sort by lastUpdated timestamp (most recent first)
            const sortedProgresses = seriesProgresses.sort((a, b) => 
              b.progress.lastUpdated - a.progress.lastUpdated
            );
            
            if (sortedProgresses.length > 0) {
              // Use the most recently watched episode
              const mostRecentProgress = sortedProgresses[0];
              const progress = mostRecentProgress.progress;
              
              logger.log(`[useWatchProgress] Using most recent progress for ${mostRecentProgress.episodeId}, updated at ${new Date(progress.lastUpdated).toLocaleString()}`);
              
              setWatchProgress({
                ...progress,
                episodeId: mostRecentProgress.episodeId,
                traktSynced: progress.traktSynced,
                traktProgress: progress.traktProgress
              });
            } else {
              // No watched episodes found
              setWatchProgress(null);
            }
          }
        } else {
          // For movies
          const progress = await storageService.getWatchProgress(id, type, episodeId);
          if (progress && progress.currentTime > 0) {
            // Always show progress data, even if watched (≥95%)
            // The HeroSection will handle the "watched" state display
            setWatchProgress({ 
              ...progress, 
              episodeId,
              traktSynced: progress.traktSynced,
              traktProgress: progress.traktProgress
            });
          } else {
            setWatchProgress(null);
          }
        }
      }
    } catch (error) {
      logger.error('[useWatchProgress] Error loading watch progress:', error);
      setWatchProgress(null);
    }
  }, [id, type, episodeId, episodes]);

  // Enhanced function to get play button text with Trakt awareness
  const getPlayButtonText = useCallback(() => {
    if (!watchProgress || watchProgress.currentTime <= 0) {
      return 'Play';
    }

    // Consider episode complete if progress is >= 85%
    const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
    if (progressPercent >= 85) {
      return 'Play';
    }

    // If we have Trakt data and it differs significantly from local, show "Resume" 
    // but the UI will show the discrepancy
    return 'Resume';
  }, [watchProgress]);

  // Subscribe to storage changes for real-time updates
  useEffect(() => {
    const unsubscribe = storageService.subscribeToWatchProgressUpdates(() => {
      logger.log('[useWatchProgress] Storage updated, reloading progress');
      loadWatchProgress();
    });
    
    return unsubscribe;
  }, [loadWatchProgress]);

  // Initial load
  useEffect(() => {
    loadWatchProgress();
  }, [loadWatchProgress]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadWatchProgress();
    }, [loadWatchProgress])
  );

  // Re-load when Trakt authentication status changes
  useEffect(() => {
    if (isTraktAuthenticated !== undefined) {
      // Small delay to ensure Trakt context is fully initialized
      setTimeout(() => {
        loadWatchProgress();
      }, 100);
    }
  }, [isTraktAuthenticated, loadWatchProgress]);

  return {
    watchProgress,
    getEpisodeDetails,
    getPlayButtonText,
    loadWatchProgress
  };
}; 