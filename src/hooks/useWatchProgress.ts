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
              const progressPercent = (progress.currentTime / progress.duration) * 100;
              
              // If current episode is finished (≥95%), try to find next unwatched episode
              if (progressPercent >= 95) {
                const currentEpNum = getEpisodeNumber(episodeId);
                if (currentEpNum && episodes.length > 0) {
                  // Find the next episode
                  const nextEpisode = episodes.find(ep => {
                    // First check in same season
                    if (ep.season_number === currentEpNum.season && ep.episode_number > currentEpNum.episode) {
                      const epId = ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`;
                      const epProgress = seriesProgresses.find(p => p.episodeId === epId);
                      if (!epProgress) return true;
                      const percent = (epProgress.progress.currentTime / epProgress.progress.duration) * 100;
                      return percent < 95;
                    }
                    // Then check next seasons
                    if (ep.season_number > currentEpNum.season) {
                      const epId = ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`;
                      const epProgress = seriesProgresses.find(p => p.episodeId === epId);
                      if (!epProgress) return true;
                      const percent = (epProgress.progress.currentTime / epProgress.progress.duration) * 100;
                      return percent < 95;
                    }
                    return false;
                  });

                  if (nextEpisode) {
                    const nextEpisodeId = nextEpisode.stremioId || 
                      `${id}:${nextEpisode.season_number}:${nextEpisode.episode_number}`;
                    const nextProgress = await storageService.getWatchProgress(id, type, nextEpisodeId);
                    if (nextProgress) {
                      setWatchProgress({ 
                        ...nextProgress, 
                        episodeId: nextEpisodeId,
                        traktSynced: nextProgress.traktSynced,
                        traktProgress: nextProgress.traktProgress
                      });
                    } else {
                      setWatchProgress({ 
                        currentTime: 0, 
                        duration: 0, 
                        lastUpdated: Date.now(), 
                        episodeId: nextEpisodeId,
                        traktSynced: false
                      });
                    }
                    return;
                  }
                }
                // If no next episode found or current episode is finished, show no progress
                setWatchProgress(null);
                return;
              }
              
              // If current episode is not finished, show its progress
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
            // Find the first unfinished episode
            const unfinishedEpisode = episodes.find(ep => {
              const epId = ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`;
              const progress = seriesProgresses.find(p => p.episodeId === epId);
              if (!progress) return true;
              const percent = (progress.progress.currentTime / progress.progress.duration) * 100;
              return percent < 95;
            });

            if (unfinishedEpisode) {
              const epId = unfinishedEpisode.stremioId || 
                `${id}:${unfinishedEpisode.season_number}:${unfinishedEpisode.episode_number}`;
              const progress = await storageService.getWatchProgress(id, type, epId);
              if (progress) {
                setWatchProgress({ 
                  ...progress, 
                  episodeId: epId,
                  traktSynced: progress.traktSynced,
                  traktProgress: progress.traktProgress
                });
              } else {
                setWatchProgress({ 
                  currentTime: 0, 
                  duration: 0, 
                  lastUpdated: Date.now(), 
                  episodeId: epId,
                  traktSynced: false
                });
              }
            } else {
              setWatchProgress(null);
            }
          }
        } else {
          // For movies
          const progress = await storageService.getWatchProgress(id, type, episodeId);
          if (progress && progress.currentTime > 0) {
            const progressPercent = (progress.currentTime / progress.duration) * 100;
            if (progressPercent >= 95) {
              setWatchProgress(null);
            } else {
              setWatchProgress({ 
                ...progress, 
                episodeId,
                traktSynced: progress.traktSynced,
                traktProgress: progress.traktProgress
              });
            }
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

    // Consider episode complete if progress is >= 95%
    const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
    if (progressPercent >= 95) {
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