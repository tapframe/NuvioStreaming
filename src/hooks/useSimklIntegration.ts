import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
    SimklService,
    SimklContentData,
    SimklPlaybackData,
    SimklUserSettings,
    SimklStats,
    SimklActivities,
    SimklWatchlistItem,
    SimklRatingItem,
    SimklStatus
} from '../services/simklService';
import { storageService } from '../services/storageService';
import { mmkvStorage } from '../services/mmkvStorage';
import { logger } from '../utils/logger';

const simklService = SimklService.getInstance();

// Cache keys
const SIMKL_ACTIVITIES_CACHE = '@simkl:activities';
const SIMKL_COLLECTIONS_CACHE = '@simkl:collections';
const SIMKL_CACHE_TIMESTAMP = '@simkl:cache_timestamp';

let hasLoadedProfileOnce = false;
let cachedUserSettings: SimklUserSettings | null = null;
let cachedUserStats: SimklStats | null = null;

interface CollectionsCache {
    timestamp: number;
    watchingShows: SimklWatchlistItem[];
    watchingMovies: SimklWatchlistItem[];
    watchingAnime: SimklWatchlistItem[];
    planToWatchShows: SimklWatchlistItem[];
    planToWatchMovies: SimklWatchlistItem[];
    planToWatchAnime: SimklWatchlistItem[];
    completedShows: SimklWatchlistItem[];
    completedMovies: SimklWatchlistItem[];
    completedAnime: SimklWatchlistItem[];
    onHoldShows: SimklWatchlistItem[];
    onHoldMovies: SimklWatchlistItem[];
    onHoldAnime: SimklWatchlistItem[];
    droppedShows: SimklWatchlistItem[];
    droppedMovies: SimklWatchlistItem[];
    droppedAnime: SimklWatchlistItem[];
    continueWatching: SimklPlaybackData[];
    ratedContent: SimklRatingItem[];
}

export function useSimklIntegration() {
    // Authentication state
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [userSettings, setUserSettings] = useState<SimklUserSettings | null>(() => cachedUserSettings);
    const [userStats, setUserStats] = useState<SimklStats | null>(() => cachedUserStats);

    // Collection state - Shows
    const [watchingShows, setWatchingShows] = useState<SimklWatchlistItem[]>([]);
    const [planToWatchShows, setPlanToWatchShows] = useState<SimklWatchlistItem[]>([]);
    const [completedShows, setCompletedShows] = useState<SimklWatchlistItem[]>([]);
    const [onHoldShows, setOnHoldShows] = useState<SimklWatchlistItem[]>([]);
    const [droppedShows, setDroppedShows] = useState<SimklWatchlistItem[]>([]);

    // Collection state - Movies
    const [watchingMovies, setWatchingMovies] = useState<SimklWatchlistItem[]>([]);
    const [planToWatchMovies, setPlanToWatchMovies] = useState<SimklWatchlistItem[]>([]);
    const [completedMovies, setCompletedMovies] = useState<SimklWatchlistItem[]>([]);
    const [onHoldMovies, setOnHoldMovies] = useState<SimklWatchlistItem[]>([]);
    const [droppedMovies, setDroppedMovies] = useState<SimklWatchlistItem[]>([]);

    // Collection state - Anime
    const [watchingAnime, setWatchingAnime] = useState<SimklWatchlistItem[]>([]);
    const [planToWatchAnime, setPlanToWatchAnime] = useState<SimklWatchlistItem[]>([]);
    const [completedAnime, setCompletedAnime] = useState<SimklWatchlistItem[]>([]);
    const [onHoldAnime, setOnHoldAnime] = useState<SimklWatchlistItem[]>([]);
    const [droppedAnime, setDroppedAnime] = useState<SimklWatchlistItem[]>([]);

    // Special collections
    const [continueWatching, setContinueWatching] = useState<SimklPlaybackData[]>([]);
    const [ratedContent, setRatedContent] = useState<SimklRatingItem[]>([]);

    // Lookup Sets for O(1) status checks (combined across types)
    const [watchingSet, setWatchingSet] = useState<Set<string>>(new Set());
    const [planToWatchSet, setPlanToWatchSet] = useState<Set<string>>(new Set());
    const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
    const [onHoldSet, setOnHoldSet] = useState<Set<string>>(new Set());
    const [droppedSet, setDroppedSet] = useState<Set<string>>(new Set());

    // Activity tracking for caching
    const [lastActivityCheck, setLastActivityCheck] = useState<SimklActivities | null>(null);

    const lastPlaybackFetchAt = useRef(0);
    const lastActivitiesCheckAt = useRef(0);
    const lastPlaybackActivityAt = useRef<number | null>(null);

    // Helper: Normalize IMDB ID
    const normalizeImdbId = (imdbId: string): string => {
        return imdbId.replace('tt', '');
    };

    // Helper: Parse activity date
    const parseActivityDate = (value?: string): number | null => {
        if (!value) return null;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    };

    // Helper: Get latest playback activity timestamp
    const getLatestPlaybackActivity = (activities: SimklActivities | null): number | null => {
        if (!activities) return null;

        const candidates: Array<number | null> = [
            parseActivityDate(activities.playback?.all),
            parseActivityDate(activities.playback?.movies),
            parseActivityDate(activities.playback?.episodes),
            parseActivityDate(activities.playback?.tv),
            parseActivityDate(activities.playback?.anime),
            parseActivityDate(activities.all),
            parseActivityDate((activities as any).last_update),
            parseActivityDate((activities as any).updated_at)
        ];

        const timestamps = candidates.filter((value): value is number => typeof value === 'number');
        if (timestamps.length === 0) return null;
        return Math.max(...timestamps);
    };

    // Helper: Build lookup Sets
    const buildLookupSets = useCallback((
        watchingItems: SimklWatchlistItem[],
        planItems: SimklWatchlistItem[],
        completedItems: SimklWatchlistItem[],
        holdItems: SimklWatchlistItem[],
        droppedItems: SimklWatchlistItem[]
    ) => {
        const buildSet = (items: SimklWatchlistItem[]): Set<string> => {
            const set = new Set<string>();
            items.forEach(item => {
                const content = item.show || item.movie || item.anime;
                if (content?.ids?.imdb) {
                    const type = item.show ? 'show' : item.movie ? 'movie' : 'anime';
                    const key = `${type}:${normalizeImdbId(content.ids.imdb)}`;
                    set.add(key);
                }
            });
            return set;
        };

        setWatchingSet(buildSet(watchingItems));
        setPlanToWatchSet(buildSet(planItems));
        setCompletedSet(buildSet(completedItems));
        setOnHoldSet(buildSet(holdItems));
        setDroppedSet(buildSet(droppedItems));
    }, []);

    // Load collections from cache
    const loadFromCache = useCallback(async (): Promise<boolean> => {
        try {
            const cachedData = await mmkvStorage.getItem(SIMKL_COLLECTIONS_CACHE);
            if (!cachedData) return false;

            const cache: CollectionsCache = JSON.parse(cachedData);

            // Check cache age (5 minutes)
            const age = Date.now() - cache.timestamp;
            if (age > 5 * 60 * 1000) {
                logger.log('[useSimklIntegration] Cache expired');
                return false;
            }

            // Debug: Log cache sample to check poster data
            if (cache.watchingShows && cache.watchingShows.length > 0) {
                logger.log('[useSimklIntegration] Cache sample - first watching show:', JSON.stringify(cache.watchingShows[0], null, 2));
            }
            if (cache.watchingMovies && cache.watchingMovies.length > 0) {
                logger.log('[useSimklIntegration] Cache sample - first watching movie:', JSON.stringify(cache.watchingMovies[0], null, 2));
            }

            // Load into state
            setWatchingShows(cache.watchingShows || []);
            setWatchingMovies(cache.watchingMovies || []);
            setWatchingAnime(cache.watchingAnime || []);
            setPlanToWatchShows(cache.planToWatchShows || []);
            setPlanToWatchMovies(cache.planToWatchMovies || []);
            setPlanToWatchAnime(cache.planToWatchAnime || []);
            setCompletedShows(cache.completedShows || []);
            setCompletedMovies(cache.completedMovies || []);
            setCompletedAnime(cache.completedAnime || []);
            setOnHoldShows(cache.onHoldShows || []);
            setOnHoldMovies(cache.onHoldMovies || []);
            setOnHoldAnime(cache.onHoldAnime || []);
            setDroppedShows(cache.droppedShows || []);
            setDroppedMovies(cache.droppedMovies || []);
            setDroppedAnime(cache.droppedAnime || []);
            setContinueWatching(cache.continueWatching || []);
            setRatedContent(cache.ratedContent || []);

            // Build lookup Sets
            buildLookupSets(
                [...cache.watchingShows, ...cache.watchingMovies, ...cache.watchingAnime],
                [...cache.planToWatchShows, ...cache.planToWatchMovies, ...cache.planToWatchAnime],
                [...cache.completedShows, ...cache.completedMovies, ...cache.completedAnime],
                [...cache.onHoldShows, ...cache.onHoldMovies, ...cache.onHoldAnime],
                [...cache.droppedShows, ...cache.droppedMovies, ...cache.droppedAnime]
            );

            logger.log('[useSimklIntegration] Loaded from cache');
            return true;
        } catch (error) {
            logger.error('[useSimklIntegration] Failed to load from cache:', error);
            return false;
        }
    }, [buildLookupSets]);

    // Save collections to cache
    const saveToCache = useCallback(async (collections: Omit<CollectionsCache, 'timestamp'>) => {
        try {
            const cache: CollectionsCache = {
                ...collections,
                timestamp: Date.now()
            };

            await mmkvStorage.setItem(SIMKL_COLLECTIONS_CACHE, JSON.stringify(cache));
            logger.log('[useSimklIntegration] Saved to cache');
        } catch (error) {
            logger.error('[useSimklIntegration] Failed to save to cache:', error);
        }
    }, []);

    // Compare activities to check if refresh needed
    const compareActivities = useCallback((
        newActivities: SimklActivities | null,
        cachedActivities: SimklActivities | null
    ): boolean => {
        if (!cachedActivities) return true;
        if (!newActivities) return false;

        // Compare timestamps
        const newAll = parseActivityDate(newActivities.all);
        const cachedAll = parseActivityDate(cachedActivities.all);

        if (newAll && cachedAll && newAll > cachedAll) {
            return true;
        }

        return false;
    }, []);

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

    // Load all collections (main data loading method)
    const loadAllCollections = useCallback(async () => {
        if (!isAuthenticated) {
            logger.log('[useSimklIntegration] Cannot load collections: not authenticated');
            return;
        }

        setIsLoading(true);

        try {
            // 1. Check activities first (efficient timestamp check)
            const activities = await simklService.getActivities();

            // 2. Try to load from cache if activities haven't changed
            const cachedActivitiesStr = await mmkvStorage.getItem(SIMKL_ACTIVITIES_CACHE);
            const cachedActivities: SimklActivities | null = cachedActivitiesStr ? JSON.parse(cachedActivitiesStr) : null;

            const needsRefresh = compareActivities(activities, cachedActivities);

            if (!needsRefresh && cachedActivities) {
                const cacheLoaded = await loadFromCache();
                if (cacheLoaded) {
                    setLastActivityCheck(activities);
                    logger.log('[useSimklIntegration] Using cached collections');
                    return;
                }
            }

            logger.log('[useSimklIntegration] Fetching fresh collections from API');

            // 3. Fetch all collections in parallel
            const [
                watchingShowsData,
                watchingMoviesData,
                watchingAnimeData,
                planToWatchShowsData,
                planToWatchMoviesData,
                planToWatchAnimeData,
                completedShowsData,
                completedMoviesData,
                completedAnimeData,
                onHoldShowsData,
                onHoldMoviesData,
                onHoldAnimeData,
                droppedShowsData,
                droppedMoviesData,
                droppedAnimeData,
                continueWatchingData,
                ratingsData
            ] = await Promise.all([
                simklService.getAllItems('shows', 'watching'),
                simklService.getAllItems('movies', 'watching'),
                simklService.getAllItems('anime', 'watching'),
                simklService.getAllItems('shows', 'plantowatch'),
                simklService.getAllItems('movies', 'plantowatch'),
                simklService.getAllItems('anime', 'plantowatch'),
                simklService.getAllItems('shows', 'completed'),
                simklService.getAllItems('movies', 'completed'),
                simklService.getAllItems('anime', 'completed'),
                simklService.getAllItems('shows', 'hold'),
                simklService.getAllItems('movies', 'hold'),
                simklService.getAllItems('anime', 'hold'),
                simklService.getAllItems('shows', 'dropped'),
                simklService.getAllItems('movies', 'dropped'),
                simklService.getAllItems('anime', 'dropped'),
                simklService.getPlaybackStatus(),
                simklService.getRatings()
            ]);

            // 4. Update state
            setWatchingShows(watchingShowsData);
            setWatchingMovies(watchingMoviesData);
            setWatchingAnime(watchingAnimeData);
            setPlanToWatchShows(planToWatchShowsData);
            setPlanToWatchMovies(planToWatchMoviesData);
            setPlanToWatchAnime(planToWatchAnimeData);
            setCompletedShows(completedShowsData);
            setCompletedMovies(completedMoviesData);
            setCompletedAnime(completedAnimeData);
            setOnHoldShows(onHoldShowsData);
            setOnHoldMovies(onHoldMoviesData);
            setOnHoldAnime(onHoldAnimeData);
            setDroppedShows(droppedShowsData);
            setDroppedMovies(droppedMoviesData);
            setDroppedAnime(droppedAnimeData);
            setContinueWatching(continueWatchingData);
            setRatedContent(ratingsData);

            // 5. Build lookup Sets
            buildLookupSets(
                [...watchingShowsData, ...watchingMoviesData, ...watchingAnimeData],
                [...planToWatchShowsData, ...planToWatchMoviesData, ...planToWatchAnimeData],
                [...completedShowsData, ...completedMoviesData, ...completedAnimeData],
                [...onHoldShowsData, ...onHoldMoviesData, ...onHoldAnimeData],
                [...droppedShowsData, ...droppedMoviesData, ...droppedAnimeData]
            );

            // 6. Cache everything
            await saveToCache({
                watchingShows: watchingShowsData,
                watchingMovies: watchingMoviesData,
                watchingAnime: watchingAnimeData,
                planToWatchShows: planToWatchShowsData,
                planToWatchMovies: planToWatchMoviesData,
                planToWatchAnime: planToWatchAnimeData,
                completedShows: completedShowsData,
                completedMovies: completedMoviesData,
                completedAnime: completedAnimeData,
                onHoldShows: onHoldShowsData,
                onHoldMovies: onHoldMoviesData,
                onHoldAnime: onHoldAnimeData,
                droppedShows: droppedShowsData,
                droppedMovies: droppedMoviesData,
                droppedAnime: droppedAnimeData,
                continueWatching: continueWatchingData,
                ratedContent: ratingsData
            });

            // Save activities
            if (activities) {
                await mmkvStorage.setItem(SIMKL_ACTIVITIES_CACHE, JSON.stringify(activities));
                setLastActivityCheck(activities);
            }

            logger.log('[useSimklIntegration] Collections loaded successfully');
        } catch (error) {
            logger.error('[useSimklIntegration] Error loading collections:', error);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, buildLookupSets, compareActivities, loadFromCache, saveToCache]);

    // Status management methods
    const addToStatus = useCallback(async (
        imdbId: string,
        type: 'movie' | 'show' | 'anime',
        status: SimklStatus
    ): Promise<boolean> => {
        if (!isAuthenticated) return false;

        try {
            const success = await simklService.addToList(imdbId, type, status);

            if (success) {
                // Optimistic Set update
                const normalizedId = normalizeImdbId(imdbId);
                const key = `${type}:${normalizedId}`;

                // Update appropriate Set
                switch (status) {
                    case 'watching':
                        setWatchingSet(prev => new Set(prev).add(key));
                        break;
                    case 'plantowatch':
                        setPlanToWatchSet(prev => new Set(prev).add(key));
                        break;
                    case 'completed':
                        setCompletedSet(prev => new Set(prev).add(key));
                        break;
                    case 'hold':
                        setOnHoldSet(prev => new Set(prev).add(key));
                        break;
                    case 'dropped':
                        setDroppedSet(prev => new Set(prev).add(key));
                        break;
                }

                // Reload collections to get fresh data
                setTimeout(() => loadAllCollections(), 1000);
            }

            return success;
        } catch (error) {
            logger.error('[useSimklIntegration] Error adding to status:', error);
            return false;
        }
    }, [isAuthenticated, loadAllCollections]);

    const removeFromStatus = useCallback(async (
        imdbId: string,
        type: 'movie' | 'show' | 'anime',
        status: SimklStatus
    ): Promise<boolean> => {
        if (!isAuthenticated) return false;

        try {
            const success = await simklService.removeFromList(imdbId, type);

            if (success) {
                // Optimistic Set update
                const normalizedId = normalizeImdbId(imdbId);
                const key = `${type}:${normalizedId}`;

                // Remove from all Sets
                setWatchingSet(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(key);
                    return newSet;
                });
                setPlanToWatchSet(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(key);
                    return newSet;
                });
                setCompletedSet(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(key);
                    return newSet;
                });
                setOnHoldSet(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(key);
                    return newSet;
                });
                setDroppedSet(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(key);
                    return newSet;
                });

                // Reload collections
                setTimeout(() => loadAllCollections(), 1000);
            }

            return success;
        } catch (error) {
            logger.error('[useSimklIntegration] Error removing from status:', error);
            return false;
        }
    }, [isAuthenticated, loadAllCollections]);

    const isInStatus = useCallback((
        imdbId: string,
        type: 'movie' | 'show' | 'anime',
        status: SimklStatus
    ): boolean => {
        const normalizedId = normalizeImdbId(imdbId);
        const key = `${type}:${normalizedId}`;

        switch (status) {
            case 'watching':
                return watchingSet.has(key);
            case 'plantowatch':
                return planToWatchSet.has(key);
            case 'completed':
                return completedSet.has(key);
            case 'hold':
                return onHoldSet.has(key);
            case 'dropped':
                return droppedSet.has(key);
            default:
                return false;
        }
    }, [watchingSet, planToWatchSet, completedSet, onHoldSet, droppedSet]);

    // Load playback/continue watching (kept from original)
    const loadPlaybackStatus = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const playback = await simklService.getPlaybackStatus();
            setContinueWatching(playback);
        } catch (error) {
            logger.error('[useSimklIntegration] Error loading playback status:', error);
        }
    }, [isAuthenticated]);

    // Load user settings and stats (kept from original)
    const loadUserProfile = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const settings = await simklService.getUserSettings();
            setUserSettings(settings);
            cachedUserSettings = settings;

            const accountId = settings?.account?.id;
            if (accountId) {
                const stats = await simklService.getUserStats(accountId);
                setUserStats(stats);
                cachedUserStats = stats;
            } else {
                setUserStats(null);
                cachedUserStats = null;
            }
        } catch (error) {
            logger.error('[useSimklIntegration] Error loading user profile:', error);
        }
    }, [isAuthenticated]);

    // Scrobbling methods (kept from original)
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

    // Sync methods (kept from original)
    const syncAllProgress = useCallback(async (): Promise<boolean> => {
        if (!isAuthenticated) return false;

        try {
            const unsynced = await storageService.getUnsyncedProgress();
            const itemsToSync = unsynced.filter(i => !i.progress.simklSynced || (i.progress.simklLastSynced && i.progress.lastUpdated > i.progress.simklLastSynced));

            if (itemsToSync.length === 0) return true;

            logger.log(`[useSimklIntegration] Found ${itemsToSync.length} items to sync to Simkl`);

            for (const item of itemsToSync) {
                try {
                    const season = item.episodeId ? parseInt(item.episodeId.split('S')[1]?.split('E')[0] || '0') : undefined;
                    const episode = item.episodeId ? parseInt(item.episodeId.split('E')[1] || '0') : undefined;

                    const content: SimklContentData = {
                        type: item.type === 'series' ? 'episode' : 'movie',
                        title: 'Unknown',
                        ids: { imdb: item.id },
                        season,
                        episode
                    };

                    const progressPercent = (item.progress.currentTime / item.progress.duration) * 100;

                    let success = false;
                    if (progressPercent >= 85) {
                        if (content.type === 'movie') {
                            await simklService.addToHistory({ movies: [{ ids: { imdb: item.id } }] });
                        } else {
                            await simklService.addToHistory({ shows: [{ ids: { imdb: item.id }, seasons: [{ number: season, episodes: [{ number: episode }] }] }] });
                        }
                        success = true;
                    } else {
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

    const fetchAndMergeSimklProgress = useCallback(async (): Promise<boolean> => {
        if (!isAuthenticated) return false;

        try {
            const now = Date.now();
            if (now - lastActivitiesCheckAt.current < 30000) {
                return true;
            }
            lastActivitiesCheckAt.current = now;

            const activities = await simklService.getActivities();
            const latestPlaybackActivity = getLatestPlaybackActivity(activities);

            if (latestPlaybackActivity && lastPlaybackActivityAt.current === latestPlaybackActivity) {
                return true;
            }

            if (latestPlaybackActivity) {
                lastPlaybackActivityAt.current = latestPlaybackActivity;
            }

            if (now - lastPlaybackFetchAt.current < 60000) {
                return true;
            }
            lastPlaybackFetchAt.current = now;

            const playback = await simklService.getPlaybackStatus();
            logger.log(`[useSimklIntegration] fetched Simkl playback: ${playback.length}`);

            setContinueWatching(playback);

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

                    await storageService.updateSimklSyncStatus(id, type!, true, item.progress, episodeId);
                }
            }
            return true;
        } catch (e) {
            logger.error('[useSimklIntegration] Error fetching/merging Simkl progress', e);
            return false;
        }
    }, [isAuthenticated, getLatestPlaybackActivity]);

    // Effects
    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchAndMergeSimklProgress();
            if (!hasLoadedProfileOnce) {
                hasLoadedProfileOnce = true;
                loadUserProfile();
            }
        }
    }, [isAuthenticated, fetchAndMergeSimklProgress, loadUserProfile]);

    // App state listener for sync
    useEffect(() => {
        if (!isAuthenticated) return;
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                fetchAndMergeSimklProgress();
                loadAllCollections();
            }
        });
        return () => sub.remove();
    }, [isAuthenticated, fetchAndMergeSimklProgress, loadAllCollections]);

    return {
        // Authentication
        isAuthenticated,
        isLoading,
        userSettings,
        userStats,
        checkAuthStatus,
        refreshAuthStatus,

        // Collections - Shows
        watchingShows,
        planToWatchShows,
        completedShows,
        onHoldShows,
        droppedShows,

        // Collections - Movies
        watchingMovies,
        planToWatchMovies,
        completedMovies,
        onHoldMovies,
        droppedMovies,

        // Collections - Anime
        watchingAnime,
        planToWatchAnime,
        completedAnime,
        onHoldAnime,
        droppedAnime,

        // Special collections
        continueWatching,
        ratedContent,

        // Lookup Sets
        watchingSet,
        planToWatchSet,
        completedSet,
        onHoldSet,
        droppedSet,

        // Methods
        loadAllCollections,
        addToStatus,
        removeFromStatus,
        isInStatus,

        // Scrobbling (kept from original)
        startWatching,
        updateProgress,
        stopWatching,
        syncAllProgress,
        fetchAndMergeSimklProgress,
    };
}
