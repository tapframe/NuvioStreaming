import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
    SimklService,
    SimklContentData,
    SimklPlaybackData,
    SimklUserSettings,
    SimklStats
} from '../services/simklService';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';

const simklService = SimklService.getInstance();

export function useSimklIntegration() {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Basic lists
    const [continueWatching, setContinueWatching] = useState<SimklPlaybackData[]>([]);
    const [userSettings, setUserSettings] = useState<SimklUserSettings | null>(null);
    const [userStats, setUserStats] = useState<SimklStats | null>(null);

    // Check authentication status
    const checkAuthStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const authenticated = await simklService.isAuthenticated();
            setIsAuthenticated(authenticated);
        } catch (error) {
            logger.error('[useSimklIntegration] Error checking auth status:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Force refresh
    const refreshAuthStatus = useCallback(async () => {
        await checkAuthStatus();
    }, [checkAuthStatus]);

    // Load playback/continue watching
    const loadPlaybackStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const playback = await simklService.getPlaybackStatus();
            setContinueWatching(playback);
        } catch (error) {
            logger.error('[useSimklIntegration] Error loading playback status:', error);
        }
    }, [isAuthenticated]);

    // Load user settings and stats
    const loadUserProfile = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const settings = await simklService.getUserSettings();
            setUserSettings(settings);

            const stats = await simklService.getUserStats();
            setUserStats(stats);
        } catch (error) {
            logger.error('[useSimklIntegration] Error loading user profile:', error);
        }
    }, [isAuthenticated]);

    // Start watching (scrobble start)
    const startWatching = useCallback(async (content: SimklContentData, progress: number): Promise<boolean> => {
        if (!isAuthenticated) return false;
        try {
            const res = await simklService.scrobbleStart(content, progress);
            return !!res;
        } catch (error) {
            logger.error('[useSimklIntegration] Error starting watch:', error);
            return false;
        }
    }, [isAuthenticated]);

    // Update progress (scrobble pause)
    const updateProgress = useCallback(async (content: SimklContentData, progress: number): Promise<boolean> => {
        if (!isAuthenticated) return false;
        try {
            const res = await simklService.scrobblePause(content, progress);
            return !!res;
        } catch (error) {
            logger.error('[useSimklIntegration] Error updating progress:', error);
            return false;
        }
    }, [isAuthenticated]);

    // Stop watching (scrobble stop)
    const stopWatching = useCallback(async (content: SimklContentData, progress: number): Promise<boolean> => {
        if (!isAuthenticated) return false;
        try {
            const res = await simklService.scrobbleStop(content, progress);
            return !!res;
        } catch (error) {
            logger.error('[useSimklIntegration] Error stopping watch:', error);
            return false;
        }
    }, [isAuthenticated]);

    // Sync All Local Progress -> Simkl
    const syncAllProgress = useCallback(async (): Promise<boolean> => {
        if (!isAuthenticated) return false;

        try {
            const unsynced = await storageService.getUnsyncedProgress();
            // Filter for items that specifically need SIMKL sync (unsynced.filter(i => !i.progress.simklSynced...))
            // storageService.getUnsyncedProgress currently returns items that need Trakt OR Simkl sync.
            // We should check simklSynced specifically here.

            const itemsToSync = unsynced.filter(i => !i.progress.simklSynced || (i.progress.simklLastSynced && i.progress.lastUpdated > i.progress.simklLastSynced));

            if (itemsToSync.length === 0) return true;

            logger.log(`[useSimklIntegration] Found ${itemsToSync.length} items to sync to Simkl`);

            for (const item of itemsToSync) {
                try {
                    const season = item.episodeId ? parseInt(item.episodeId.split('S')[1]?.split('E')[0] || '0') : undefined;
                    const episode = item.episodeId ? parseInt(item.episodeId.split('E')[1] || '0') : undefined;

                    // Construct content data
                    const content: SimklContentData = {
                        type: item.type === 'series' ? 'episode' : 'movie',
                        title: 'Unknown', // Ideally storage has title, but it might not. Simkl needs IDs mainly.
                        ids: { imdb: item.id },
                        season,
                        episode
                    };

                    const progressPercent = (item.progress.currentTime / item.progress.duration) * 100;

                    // If completed (>=80% or 95% depending on logic, let's say 85% safe), add to history
                    // Simkl: Stop with >= 80% marks as watched.
                    // Or explicitly add to history.

                    let success = false;
                    if (progressPercent >= 85) {
                        // Add to history
                        if (content.type === 'movie') {
                            await simklService.addToHistory({ movies: [{ ids: { imdb: item.id } }] });
                        } else {
                            await simklService.addToHistory({ shows: [{ ids: { imdb: item.id }, seasons: [{ number: season, episodes: [{ number: episode }] }] }] });
                        }
                        success = true; // Assume success if no throw
                    } else {
                        // Pause (scrobble)
                        const res = await simklService.scrobblePause(content, progressPercent);
                        success = !!res;
                    }

                    if (success) {
                        await storageService.updateSimklSyncStatus(item.id, item.type, true, progressPercent, item.episodeId);
                    }
                } catch (e) {
                    logger.error(`[useSimklIntegration] Failed to sync item ${item.id}`, e);
                }
            }
            return true;
        } catch (e) {
            logger.error('[useSimklIntegration] Error syncing all progress', e);
            return false;
        }
    }, [isAuthenticated]);

    // Fetch Simkl -> Merge Local
    const fetchAndMergeSimklProgress = useCallback(async (): Promise<boolean> => {
        if (!isAuthenticated) return false;

        try {
            const playback = await simklService.getPlaybackStatus();
            logger.log(`[useSimklIntegration] fetched Simkl playback: ${playback.length}`);

            for (const item of playback) {
                let id: string | undefined;
                let type: string;
                let episodeId: string | undefined;

                if (item.movie) {
                    id = item.movie.ids.imdb;
                    type = 'movie';
                } else if (item.show && item.episode) {
                    id = item.show.ids.imdb;
                    type = 'series';
                    const epNum = (item.episode as any).episode ?? (item.episode as any).number;
                    episodeId = epNum !== undefined ? `${id}:${item.episode.season}:${epNum}` : undefined;
                }

                if (id) {
                    await storageService.mergeWithSimklProgress(
                        id,
                        type!,
                        item.progress,
                        item.paused_at,
                        episodeId
                    );

                    // Mark as synced locally so we don't push it back
                    await storageService.updateSimklSyncStatus(id, type!, true, item.progress, episodeId);
                }
            }
            return true;
        } catch (e) {
            logger.error('[useSimklIntegration] Error fetching/merging Simkl progress', e);
            return false;
        }
    }, [isAuthenticated]);

    // Effects
    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    useEffect(() => {
        if (isAuthenticated) {
            loadPlaybackStatus();
            fetchAndMergeSimklProgress();
            loadUserProfile();
        }
    }, [isAuthenticated, loadPlaybackStatus, fetchAndMergeSimklProgress, loadUserProfile]);

    // App state listener for sync
    useEffect(() => {
        if (!isAuthenticated) return;
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                fetchAndMergeSimklProgress();
            }
        });
        return () => sub.remove();
    }, [isAuthenticated, fetchAndMergeSimklProgress]);


    return {
        isAuthenticated,
        isLoading,
        checkAuthStatus,
        refreshAuthStatus,
        startWatching,
        updateProgress,
        stopWatching,
        syncAllProgress,
        fetchAndMergeSimklProgress,
        continueWatching,
        userSettings,
        userStats,
    };
}
