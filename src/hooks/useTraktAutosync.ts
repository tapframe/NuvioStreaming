import { useCallback, useRef, useEffect } from 'react';
import { useTraktIntegration } from './useTraktIntegration';
import { useTraktAutosyncSettings } from './useTraktAutosyncSettings';
import { TraktContentData } from '../services/traktService';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';

interface TraktAutosyncOptions {
  id: string;
  type: 'movie' | 'series';
  title: string;
  year: number | string; // Allow both for compatibility
  imdbId: string;
  // For episodes
  season?: number;
  episode?: number;
  showTitle?: string;
  showYear?: number | string; // Allow both for compatibility
  showImdbId?: string;
  episodeId?: string;
}

export function useTraktAutosync(options: TraktAutosyncOptions) {
  const { 
    isAuthenticated, 
    startWatching, 
    updateProgress,
    stopWatching
  } = useTraktIntegration();
  
  const { settings: autosyncSettings } = useTraktAutosyncSettings();
  
  const hasStartedWatching = useRef(false);
  const hasStopped = useRef(false); // New: Track if we've already stopped for this session
  const isSessionComplete = useRef(false); // New: Track if session is completely finished (scrobbled)
  const lastSyncTime = useRef(0);
  const lastSyncProgress = useRef(0);
  const sessionKey = useRef<string | null>(null);
  const unmountCount = useRef(0);
  const lastStopCall = useRef(0); // New: Track last stop call timestamp
  
  // Generate a unique session key for this content instance
  useEffect(() => {
    const contentKey = options.type === 'movie' 
      ? `movie:${options.imdbId}`
      : `episode:${options.imdbId}:${options.season}:${options.episode}`;
    sessionKey.current = `${contentKey}:${Date.now()}`;
    
    // Reset all session state for new content
    hasStartedWatching.current = false;
    hasStopped.current = false;
    isSessionComplete.current = false;
    lastStopCall.current = 0;
    
    logger.log(`[TraktAutosync] Session started for: ${sessionKey.current}`);
    
    return () => {
      unmountCount.current++;
      logger.log(`[TraktAutosync] Component unmount #${unmountCount.current} for: ${sessionKey.current}`);
    };
  }, [options.imdbId, options.season, options.episode, options.type]);
  
  // Build Trakt content data from options
  const buildContentData = useCallback((): TraktContentData => {
    // Ensure year is a number and valid
    const parseYear = (year: number | string | undefined): number => {
      if (!year) return 0;
      if (typeof year === 'number') return year;
      const parsed = parseInt(year.toString(), 10);
      return isNaN(parsed) ? 0 : parsed;
    };
    
    const numericYear = parseYear(options.year);
    const numericShowYear = parseYear(options.showYear);
    
    // Validate required fields
    if (!options.title || !options.imdbId) {
      logger.warn('[TraktAutosync] Missing required fields:', { title: options.title, imdbId: options.imdbId });
    }
    
    if (options.type === 'movie') {
      return {
        type: 'movie',
        imdbId: options.imdbId,
        title: options.title,
        year: numericYear
      };
    } else {
      return {
        type: 'episode',
        imdbId: options.imdbId,
        title: options.title,
        year: numericYear,
        season: options.season,
        episode: options.episode,
        showTitle: options.showTitle || options.title,
        showYear: numericShowYear || numericYear,
        showImdbId: options.showImdbId || options.imdbId
      };
    }
  }, [options]);

  // Start watching (scrobble start)
  const handlePlaybackStart = useCallback(async (currentTime: number, duration: number) => {
    logger.log(`[TraktAutosync] handlePlaybackStart called: time=${currentTime}, duration=${duration}, authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}, alreadyStarted=${hasStartedWatching.current}, alreadyStopped=${hasStopped.current}, sessionComplete=${isSessionComplete.current}, session=${sessionKey.current}`);
    
    if (!isAuthenticated || !autosyncSettings.enabled) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackStart: authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}`);
      return;
    }

    // PREVENT SESSION RESTART: Don't start if session is complete (scrobbled)
    if (isSessionComplete.current) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackStart: session is complete, preventing any restart`);
      return;
    }

    // PREVENT SESSION RESTART: Don't start if we've already stopped this session
    if (hasStopped.current) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackStart: session already stopped, preventing restart`);
      return;
    }

    if (hasStartedWatching.current) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackStart: already started=${hasStartedWatching.current}`);
      return;
    }

    if (duration <= 0) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackStart: invalid duration (${duration})`);
      return;
    }

    try {
      const progressPercent = (currentTime / duration) * 100;
      const contentData = buildContentData();
      
      const success = await startWatching(contentData, progressPercent);
      if (success) {
        hasStartedWatching.current = true;
        hasStopped.current = false; // Reset stop flag when starting
        logger.log(`[TraktAutosync] Started watching: ${contentData.title} (session: ${sessionKey.current})`);
      }
    } catch (error) {
      logger.error('[TraktAutosync] Error starting watch:', error);
    }
  }, [isAuthenticated, autosyncSettings.enabled, startWatching, buildContentData]);

  // Sync progress during playback
  const handleProgressUpdate = useCallback(async (
    currentTime: number, 
    duration: number, 
    force: boolean = false
  ) => {
    if (!isAuthenticated || !autosyncSettings.enabled || duration <= 0) {
      return;
    }

    // Skip if session is already complete
    if (isSessionComplete.current) {
      return;
    }

    try {
      const progressPercent = (currentTime / duration) * 100;
      const now = Date.now();
      
      // Use the user's configured sync frequency
      const timeSinceLastSync = now - lastSyncTime.current;
      const progressDiff = Math.abs(progressPercent - lastSyncProgress.current);
      
      if (!force && timeSinceLastSync < autosyncSettings.syncFrequency && progressDiff < 5) {
        return;
      }

      const contentData = buildContentData();
      const success = await updateProgress(contentData, progressPercent, force);
      
      if (success) {
        lastSyncTime.current = now;
        lastSyncProgress.current = progressPercent;
        
        // Update local storage sync status
        await storageService.updateTraktSyncStatus(
          options.id,
          options.type,
          true,
          progressPercent,
          options.episodeId,
          currentTime
        );
        
        logger.log(`[TraktAutosync] Synced progress ${progressPercent.toFixed(1)}%: ${contentData.title}`);
      }
    } catch (error) {
      logger.error('[TraktAutosync] Error syncing progress:', error);
    }
  }, [isAuthenticated, autosyncSettings.enabled, autosyncSettings.syncFrequency, updateProgress, buildContentData, options]);

  // Handle playback end/pause
  const handlePlaybackEnd = useCallback(async (currentTime: number, duration: number, reason: 'ended' | 'unmount' = 'ended') => {
    const now = Date.now();
    
    logger.log(`[TraktAutosync] handlePlaybackEnd called: reason=${reason}, time=${currentTime}, duration=${duration}, authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}, started=${hasStartedWatching.current}, stopped=${hasStopped.current}, complete=${isSessionComplete.current}, session=${sessionKey.current}, unmountCount=${unmountCount.current}`);
    
    if (!isAuthenticated || !autosyncSettings.enabled) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackEnd: authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}`);
      return;
    }

    // ENHANCED DEDUPLICATION: Check if session is already complete
    if (isSessionComplete.current) {
      logger.log(`[TraktAutosync] Session already complete, skipping end call (reason: ${reason})`);
      return;
    }

    // ENHANCED DEDUPLICATION: Check if we've already stopped this session
    // However, allow updates if the new progress is significantly higher (>5% improvement)
    let isSignificantUpdate = false;
    if (hasStopped.current) {
      const currentProgressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
      const progressImprovement = currentProgressPercent - lastSyncProgress.current;
      
      if (progressImprovement > 5) {
        logger.log(`[TraktAutosync] Session already stopped, but progress improved significantly by ${progressImprovement.toFixed(1)}% (${lastSyncProgress.current.toFixed(1)}% → ${currentProgressPercent.toFixed(1)}%), allowing update`);
        // Reset stopped flag to allow this significant update
        hasStopped.current = false;
        isSignificantUpdate = true;
      } else {
        logger.log(`[TraktAutosync] Already stopped this session, skipping duplicate call (reason: ${reason})`);
        return;
      }
    }

    // ENHANCED DEDUPLICATION: Prevent rapid successive calls (within 5 seconds)
    // Bypass for significant updates
    if (!isSignificantUpdate && now - lastStopCall.current < 5000) {
      logger.log(`[TraktAutosync] Ignoring rapid successive stop call within 5 seconds (reason: ${reason})`);
      return;
    }

    // Skip rapid unmount calls (likely from React strict mode or component remounts)
    if (reason === 'unmount' && unmountCount.current > 1) {
      logger.log(`[TraktAutosync] Skipping duplicate unmount call #${unmountCount.current}`);
      return;
    }

    try {
      let progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
      logger.log(`[TraktAutosync] Initial progress calculation: ${progressPercent.toFixed(1)}%`);
      
      // For unmount calls, always use the highest available progress
      // Check current progress, last synced progress, and local storage progress
      if (reason === 'unmount') {
        let maxProgress = progressPercent;
        
        // Check last synced progress
        if (lastSyncProgress.current > maxProgress) {
          maxProgress = lastSyncProgress.current;
        }
        
        // Also check local storage for the highest recorded progress
        try {
          const savedProgress = await storageService.getWatchProgress(
            options.id, 
            options.type, 
            options.episodeId
          );
          
          if (savedProgress && savedProgress.duration > 0) {
            const savedProgressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
            if (savedProgressPercent > maxProgress) {
              maxProgress = savedProgressPercent;
            }
          }
        } catch (error) {
          logger.error('[TraktAutosync] Error checking saved progress:', error);
        }
        
        if (maxProgress !== progressPercent) {
          logger.log(`[TraktAutosync] Using highest available progress for unmount: ${maxProgress.toFixed(1)}% (current: ${progressPercent.toFixed(1)}%, last synced: ${lastSyncProgress.current.toFixed(1)}%)`);
          progressPercent = maxProgress;
        } else {
          logger.log(`[TraktAutosync] Current progress is already highest: ${progressPercent.toFixed(1)}%`);
        }
      }

      // If we have valid progress but no started session, force start one first
      if (!hasStartedWatching.current && progressPercent > 1) {
        logger.log(`[TraktAutosync] Force starting session for progress: ${progressPercent.toFixed(1)}%`);
        const contentData = buildContentData();
        const success = await startWatching(contentData, progressPercent);
        if (success) {
          hasStartedWatching.current = true;
          logger.log(`[TraktAutosync] Force started watching: ${contentData.title}`);
        }
      }
      
      // Only stop if we have meaningful progress (>= 0.5%) or it's a natural video end
      // Lower threshold for unmount calls to catch more edge cases
      if (reason === 'unmount' && progressPercent < 0.5) {
        logger.log(`[TraktAutosync] Skipping unmount stop for ${options.title} - too early (${progressPercent.toFixed(1)}%)`);
        return;
      }
      
      // For natural end events, always set progress to at least 90%
      if (reason === 'ended' && progressPercent < 90) {
        logger.log(`[TraktAutosync] Natural end detected but progress is low (${progressPercent.toFixed(1)}%), boosting to 90%`);
        progressPercent = 90;
      }
      
      // Mark stop attempt and update timestamp
      lastStopCall.current = now;
      hasStopped.current = true;
      
      const contentData = buildContentData();
      
      // Use stopWatching for proper scrobble stop
      const success = await stopWatching(contentData, progressPercent);
      
      if (success) {
        // Update local storage sync status
        await storageService.updateTraktSyncStatus(
          options.id,
          options.type,
          true,
          progressPercent,
          options.episodeId,
          currentTime
        );
        
        // Mark session as complete if high progress (scrobbled)
        if (progressPercent >= 80) {
          isSessionComplete.current = true;
          logger.log(`[TraktAutosync] Session marked as complete (scrobbled) at ${progressPercent.toFixed(1)}%`);
        }
        
        logger.log(`[TraktAutosync] Successfully stopped watching: ${contentData.title} (${progressPercent.toFixed(1)}% - ${reason})`);
      } else {
        // If stop failed, reset the stop flag so we can try again later
        hasStopped.current = false;
        logger.warn(`[TraktAutosync] Failed to stop watching, reset stop flag for retry`);
      }
      
      // Reset state only for natural end or very high progress unmounts
      if (reason === 'ended' || progressPercent >= 80) {
        hasStartedWatching.current = false;
        lastSyncTime.current = 0;
        lastSyncProgress.current = 0;
        logger.log(`[TraktAutosync] Reset session state for ${reason} at ${progressPercent.toFixed(1)}%`);
      }
      
    } catch (error) {
      logger.error('[TraktAutosync] Error ending watch:', error);
      // Reset stop flag on error so we can try again
      hasStopped.current = false;
    }
  }, [isAuthenticated, autosyncSettings.enabled, stopWatching, startWatching, buildContentData, options]);

  // Reset state (useful when switching content)
  const resetState = useCallback(() => {
    hasStartedWatching.current = false;
    hasStopped.current = false;
    isSessionComplete.current = false;
    lastSyncTime.current = 0;
    lastSyncProgress.current = 0;
    unmountCount.current = 0;
    sessionKey.current = null;
    lastStopCall.current = 0;
    logger.log(`[TraktAutosync] Manual state reset for: ${options.title}`);
  }, [options.title]);

  return {
    isAuthenticated,
    handlePlaybackStart,
    handleProgressUpdate,
    handlePlaybackEnd,
    resetState
  };
} 