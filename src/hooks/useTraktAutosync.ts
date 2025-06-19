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
  const lastSyncTime = useRef(0);
  const lastSyncProgress = useRef(0);
  const sessionKey = useRef<string | null>(null);
  const unmountCount = useRef(0);
  
  // Generate a unique session key for this content instance
  useEffect(() => {
    const contentKey = options.type === 'movie' 
      ? `movie:${options.imdbId}`
      : `episode:${options.imdbId}:${options.season}:${options.episode}`;
    sessionKey.current = `${contentKey}:${Date.now()}`;
    
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
    logger.log(`[TraktAutosync] handlePlaybackStart called: time=${currentTime}, duration=${duration}, authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}, alreadyStarted=${hasStartedWatching.current}, session=${sessionKey.current}`);
    
    if (!isAuthenticated || !autosyncSettings.enabled || hasStartedWatching.current) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackStart: authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}, alreadyStarted=${hasStartedWatching.current}`);
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
          options.episodeId
        );
        
        logger.log(`[TraktAutosync] Synced progress ${progressPercent.toFixed(1)}%: ${contentData.title}`);
      }
    } catch (error) {
      logger.error('[TraktAutosync] Error syncing progress:', error);
    }
  }, [isAuthenticated, autosyncSettings.enabled, autosyncSettings.syncFrequency, updateProgress, buildContentData, options]);

  // Handle playback end/pause
  const handlePlaybackEnd = useCallback(async (currentTime: number, duration: number, reason: 'ended' | 'unmount' = 'ended') => {
    logger.log(`[TraktAutosync] handlePlaybackEnd called: reason=${reason}, time=${currentTime}, duration=${duration}, authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}, started=${hasStartedWatching.current}, session=${sessionKey.current}, unmountCount=${unmountCount.current}`);
    
    if (!isAuthenticated || !autosyncSettings.enabled) {
      logger.log(`[TraktAutosync] Skipping handlePlaybackEnd: authenticated=${isAuthenticated}, enabled=${autosyncSettings.enabled}`);
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
      
      // If progress is 0 during unmount, use the last synced progress instead
      // This happens when video player state is reset before component unmount
      if (reason === 'unmount' && progressPercent < 1 && lastSyncProgress.current > 0) {
        progressPercent = lastSyncProgress.current;
        logger.log(`[TraktAutosync] Using last synced progress for unmount: ${progressPercent.toFixed(1)}%`);
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
      
      // Only stop if we have meaningful progress (>= 1%) or it's a natural video end
      // Skip unmount calls with very low progress unless video actually ended
      if (reason === 'unmount' && progressPercent < 1) {
        logger.log(`[TraktAutosync] Skipping unmount stop for ${options.title} - too early (${progressPercent.toFixed(1)}%)`);
        return;
      }
      
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
          options.episodeId
        );
      }
      
      // Reset state only for natural end or very high progress unmounts
      if (reason === 'ended' || progressPercent >= 80) {
        hasStartedWatching.current = false;
        lastSyncTime.current = 0;
        lastSyncProgress.current = 0;
        logger.log(`[TraktAutosync] Reset session state for ${reason} at ${progressPercent.toFixed(1)}%`);
      }
      
      logger.log(`[TraktAutosync] Ended watching: ${options.title} (${reason})`);
    } catch (error) {
      logger.error('[TraktAutosync] Error ending watch:', error);
    }
  }, [isAuthenticated, autosyncSettings.enabled, stopWatching, buildContentData, options]);

  // Reset state (useful when switching content)
  const resetState = useCallback(() => {
    hasStartedWatching.current = false;
    lastSyncTime.current = 0;
    lastSyncProgress.current = 0;
    unmountCount.current = 0;
    sessionKey.current = null;
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