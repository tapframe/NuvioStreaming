import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  Platform
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent, catalogService } from '../../services/catalogService';
import { LinearGradient } from 'expo-linear-gradient';
import FastImage from '@d11/react-native-fast-image';
import { useTheme } from '../../contexts/ThemeContext';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';
import * as Haptics from 'expo-haptics';
import { TraktService } from '../../services/traktService';
import { stremioService } from '../../services/stremioService';
import { streamCacheService } from '../../services/streamCacheService';
import CustomAlert from '../../components/CustomAlert';

// Define interface for continue watching items
interface ContinueWatchingItem extends StreamingContent {
  progress: number;
  lastUpdated: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

// Define the ref interface
interface ContinueWatchingRef {
  refresh: () => Promise<boolean>;
}

// Enhanced responsive breakpoints for Continue Watching section
const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  largeTablet: 1024,
  tv: 1440,
};

// Dynamic poster calculation based on screen width for Continue Watching section
const calculatePosterLayout = (screenWidth: number) => {
  const MIN_POSTER_WIDTH = 120; // Slightly larger for continue watching items
  const MAX_POSTER_WIDTH = 160; // Maximum poster width for this section
  const HORIZONTAL_PADDING = 40; // Total horizontal padding/margins
  
  // Calculate how many posters can fit (fewer items for continue watching)
  const availableWidth = screenWidth - HORIZONTAL_PADDING;
  const maxColumns = Math.floor(availableWidth / MIN_POSTER_WIDTH);
  
  // Limit to reasonable number of columns (2-5 for continue watching)
  const numColumns = Math.min(Math.max(maxColumns, 2), 5);
  
  // Calculate actual poster width
  const posterWidth = Math.min(availableWidth / numColumns, MAX_POSTER_WIDTH);
  
  return {
    numColumns,
    posterWidth,
    spacing: 12 // Space between posters
  };
};

const { width } = Dimensions.get('window');
const posterLayout = calculatePosterLayout(width);
const POSTER_WIDTH = posterLayout.posterWidth;

// Allow any known id formats (imdb 'tt...', kitsu 'kitsu:...', tmdb 'tmdb:...', or others)
const isSupportedId = (id: string): boolean => {
  return typeof id === 'string' && id.length > 0;
};

// Function to check if an episode has been released
const isEpisodeReleased = (video: any): boolean => {
  if (!video.released) return false;
  
  try {
    const releaseDate = new Date(video.released);
    const now = new Date();
    return releaseDate <= now;
  } catch (error) {
    // If we can't parse the date, assume it's not released
    return false;
  }
};

// Create a proper imperative handle with React.forwardRef and updated type
const ContinueWatchingSection = React.forwardRef<ContinueWatchingRef>((props, ref) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContinueWatchingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Enhanced responsive sizing for tablets and TV screens
  const deviceWidth = Dimensions.get('window').width;
  const deviceHeight = Dimensions.get('window').height;
  
  // Determine device type based on width
  const getDeviceType = useCallback(() => {
    if (deviceWidth >= BREAKPOINTS.tv) return 'tv';
    if (deviceWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
    if (deviceWidth >= BREAKPOINTS.tablet) return 'tablet';
    return 'phone';
  }, [deviceWidth]);
  
  const deviceType = getDeviceType();
  const isTablet = deviceType === 'tablet';
  const isLargeTablet = deviceType === 'largeTablet';
  const isTV = deviceType === 'tv';
  const isLargeScreen = isTablet || isLargeTablet || isTV;
  
  // Enhanced responsive sizing for continue watching items
  const computedItemWidth = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 400; // Larger items for TV
      case 'largeTablet':
        return 350; // Medium-large items for large tablets
      case 'tablet':
        return 320; // Medium items for tablets
      default:
        return 280; // Original phone size
    }
  }, [deviceType]);
  
  const computedItemHeight = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 160; // Taller items for TV
      case 'largeTablet':
        return 140; // Medium-tall items for large tablets
      case 'tablet':
        return 130; // Medium items for tablets
      default:
        return 120; // Original phone height
    }
  }, [deviceType]);
  
  // Enhanced spacing and padding
  const horizontalPadding = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 32;
      case 'largeTablet':
        return 28;
      case 'tablet':
        return 24;
      default:
        return 16; // phone
    }
  }, [deviceType]);
  
  const itemSpacing = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 20;
      case 'largeTablet':
        return 18;
      case 'tablet':
        return 16;
      default:
        return 16; // phone
    }
  }, [deviceType]);

  // Alert state for CustomAlert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertActions, setAlertActions] = useState<any[]>([]);

  // Use a ref to track if a background refresh is in progress to avoid state updates
  const isRefreshingRef = useRef(false);
  
  // Track recently removed items to prevent immediate re-addition
  const recentlyRemovedRef = useRef<Set<string>>(new Set());
  const REMOVAL_IGNORE_DURATION = 10000; // 10 seconds
  
  // Track last Trakt sync to prevent excessive API calls
  const lastTraktSyncRef = useRef<number>(0);
  const TRAKT_SYNC_COOLDOWN = 5 * 60 * 1000; // 5 minutes between Trakt syncs

  // Cache for metadata to avoid redundant API calls
  const metadataCache = useRef<Record<string, { metadata: any; basicContent: StreamingContent | null; timestamp: number }>>({});
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Helper function to get cached or fetch metadata
  const getCachedMetadata = useCallback(async (type: string, id: string) => {
    const cacheKey = `${type}:${id}`;
    const cached = metadataCache.current[cacheKey];
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached;
    }
    
    try {
      const shouldFetchMeta = await stremioService.isValidContentId(type, id);
      const [metadata, basicContent] = await Promise.all([
        shouldFetchMeta ? stremioService.getMetaDetails(type, id) : Promise.resolve(null),
        catalogService.getBasicContentDetails(type, id)
      ]);
      
      if (basicContent) {
        const result = { metadata, basicContent, timestamp: now };
        metadataCache.current[cacheKey] = result;
        return result;
      }
      return null;
    } catch (error: any) {
      // Skip logging 404 errors to reduce noise
      return null;
    }
  }, []);

  // Modified loadContinueWatching to render incrementally
  const loadContinueWatching = useCallback(async (isBackgroundRefresh = false) => {
    if (isRefreshingRef.current) {
      return;
    }

    if (!isBackgroundRefresh) {
      setLoading(true);
    }
    isRefreshingRef.current = true;

    // Helper to merge a batch of items into state (dedupe by type:id, keep newest)
    const mergeBatchIntoState = async (batch: ContinueWatchingItem[]) => {
      if (!batch || batch.length === 0) return;

      setContinueWatchingItems((prev) => {
        const map = new Map<string, ContinueWatchingItem>();
        for (const it of prev) {
          map.set(`${it.type}:${it.id}`, it);
        }

        const merged = Array.from(map.values());
        merged.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));

        return merged;
      });

      // Process batch items asynchronously to check removal status
      for (const it of batch) {
        const key = `${it.type}:${it.id}`;

        // Skip recently removed items to prevent immediate re-addition
        if (recentlyRemovedRef.current.has(key)) {
          continue;
        }

        // Skip items that have been persistently marked as removed
        const isRemoved = await storageService.isContinueWatchingRemoved(it.id, it.type);
        if (isRemoved) {
          continue;
        }

        // Add the item to state
        setContinueWatchingItems((prev) => {
          const map = new Map<string, ContinueWatchingItem>();
          for (const existing of prev) {
            map.set(`${existing.type}:${existing.id}`, existing);
          }

          const existing = map.get(key);
          if (!existing || (it.lastUpdated ?? 0) > (existing.lastUpdated ?? 0)) {
            map.set(key, it);
            const merged = Array.from(map.values());
            merged.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0));
            return merged;
          }

          return prev;
        });
      }
    };

    try {
      const allProgress = await storageService.getAllWatchProgress();
      if (Object.keys(allProgress).length === 0) {
        setContinueWatchingItems([]);
        return;
      }

      // Group progress items by content ID
      const contentGroups: Record<string, { type: string; id: string; episodes: Array<{ key: string; episodeId?: string; progress: any; progressPercent: number }> }> = {};
      for (const key in allProgress) {
        const keyParts = key.split(':');
        const [type, id, ...episodeIdParts] = keyParts;
        const episodeId = episodeIdParts.length > 0 ? episodeIdParts.join(':') : undefined;
        const progress = allProgress[key];
        const progressPercent = (progress.currentTime / progress.duration) * 100;
        // Skip fully watched movies
        if (type === 'movie' && progressPercent >= 85) continue;
        // Skip movies with no actual progress (ensure > 0%)
        if (type === 'movie' && (!isFinite(progressPercent) || progressPercent <= 0)) continue;
        const contentKey = `${type}:${id}`;
        if (!contentGroups[contentKey]) contentGroups[contentKey] = { type, id, episodes: [] };
        contentGroups[contentKey].episodes.push({ key, episodeId, progress, progressPercent });
      }

      // Fetch Trakt watched movies once and reuse
      const traktMoviesSetPromise = (async () => {
        try {
          const traktService = TraktService.getInstance();
          const isAuthed = await traktService.isAuthenticated();
          if (!isAuthed) return new Set<string>();
          if (typeof (traktService as any).getWatchedMovies === 'function') {
            const watched = await (traktService as any).getWatchedMovies();
            if (Array.isArray(watched)) {
              const ids = watched
                .map((w: any) => w?.movie?.ids?.imdb)
                .filter(Boolean)
                .map((imdb: string) => (imdb.startsWith('tt') ? imdb : `tt${imdb}`));
              return new Set<string>(ids);
            }
          }
          return new Set<string>();
        } catch {
          return new Set<string>();
        }
      })();

      // Process each content group concurrently, merging results as they arrive
      const groupPromises = Object.values(contentGroups).map(async (group) => {
        try {
          if (!isSupportedId(group.id)) return;
          // Skip movies that are already watched on Trakt
          if (group.type === 'movie') {
            const watchedSet = await traktMoviesSetPromise;
            if (watchedSet.has(group.id)) {
              // Optional: sync local store to watched to prevent reappearance
              try {
                await storageService.setWatchProgress(group.id, 'movie', {
                  currentTime: 1,
                  duration: 1,
                  lastUpdated: Date.now(),
                  traktSynced: true,
                  traktProgress: 100,
                } as any);
              } catch (_e) {}
              return;
            }
          }
          const cachedData = await getCachedMetadata(group.type, group.id);
          if (!cachedData?.basicContent) return;
          const { metadata, basicContent } = cachedData;

          const batch: ContinueWatchingItem[] = [];
          for (const episode of group.episodes) {
            const { episodeId, progress, progressPercent } = episode;

            if (group.type === 'series' && progressPercent >= 85) {
              let nextSeason: number | undefined;
              let nextEpisode: number | undefined;
              if (episodeId) {
                const match = episodeId.match(/s(\d+)e(\d+)/i);
                if (match) {
                  const currentSeason = parseInt(match[1], 10);
                  const currentEpisode = parseInt(match[2], 10);
                  nextSeason = currentSeason;
                  nextEpisode = currentEpisode + 1;
                } else {
                  const parts = episodeId.split(':');
                  if (parts.length >= 2) {
                    const seasonNum = parseInt(parts[parts.length - 2], 10);
                    const episodeNum = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(seasonNum) && !isNaN(episodeNum)) {
                      nextSeason = seasonNum;
                      nextEpisode = episodeNum + 1;
                    }
                  }
                }
              }
              if (nextSeason !== undefined && nextEpisode !== undefined && metadata?.videos && Array.isArray(metadata.videos)) {
                const nextEpisodeVideo = metadata.videos.find((video: any) =>
                  video.season === nextSeason && video.episode === nextEpisode
                );
                if (nextEpisodeVideo && isEpisodeReleased(nextEpisodeVideo)) {
                  batch.push({
                    ...basicContent,
                    id: group.id,
                    type: group.type,
                    progress: 0,
                    lastUpdated: progress.lastUpdated,
                    season: nextSeason,
                    episode: nextEpisode,
                    episodeTitle: `Episode ${nextEpisode}`,
                  } as ContinueWatchingItem);
                }
              }
              continue;
            }

            let season: number | undefined;
            let episodeNumber: number | undefined;
            let episodeTitle: string | undefined;
            if (episodeId && group.type === 'series') {
              let match = episodeId.match(/s(\d+)e(\d+)/i);
              if (match) {
                season = parseInt(match[1], 10);
                episodeNumber = parseInt(match[2], 10);
                episodeTitle = `Episode ${episodeNumber}`;
              } else {
                const parts = episodeId.split(':');
                if (parts.length >= 3) {
                  const seasonPart = parts[parts.length - 2];
                  const episodePart = parts[parts.length - 1];
                  const seasonNum = parseInt(seasonPart, 10);
                  const episodeNum = parseInt(episodePart, 10);
                  if (!isNaN(seasonNum) && !isNaN(episodeNum)) {
                    season = seasonNum;
                    episodeNumber = episodeNum;
                    episodeTitle = `Episode ${episodeNumber}`;
                  }
                }
              }
            }

            batch.push({
              ...basicContent,
              progress: progressPercent,
              lastUpdated: progress.lastUpdated,
              season,
              episode: episodeNumber,
              episodeTitle,
            } as ContinueWatchingItem);
          }

          if (batch.length > 0) await mergeBatchIntoState(batch);
        } catch (error) {
          // Continue processing other groups even if one fails
        }
      });

      // TRÅKT: fetch history and merge incrementally as well
      const traktMergePromise = (async () => {
        try {
          const traktService = TraktService.getInstance();
          const isAuthed = await traktService.isAuthenticated();
          if (!isAuthed) return;
          
          // Check Trakt sync cooldown to prevent excessive API calls
          const now = Date.now();
          if (now - lastTraktSyncRef.current < TRAKT_SYNC_COOLDOWN) {
            logger.log(`[TraktSync] Skipping Trakt sync - cooldown active (${Math.round((TRAKT_SYNC_COOLDOWN - (now - lastTraktSyncRef.current)) / 1000)}s remaining)`);
            return;
          }
          
          lastTraktSyncRef.current = now;
          const historyItems = await traktService.getWatchedEpisodesHistory(1, 200);
          const latestWatchedByShow: Record<string, { season: number; episode: number; watchedAt: number }> = {};
          for (const item of historyItems) {
            if (item.type !== 'episode') continue;
            const showImdb = item.show?.ids?.imdb ? `tt${item.show.ids.imdb.replace(/^tt/, '')}` : null;
            if (!showImdb) continue;
            const season = item.episode?.season;
            const epNum = item.episode?.number;
            if (season === undefined || epNum === undefined) continue;
            const watchedAt = new Date(item.watched_at).getTime();
            const existing = latestWatchedByShow[showImdb];
            if (!existing || existing.watchedAt < watchedAt) {
              latestWatchedByShow[showImdb] = { season, episode: epNum, watchedAt };
            }
          }

          // Collect all valid Trakt items first, then merge as a batch
          const traktBatch: ContinueWatchingItem[] = [];

          for (const [showId, info] of Object.entries(latestWatchedByShow)) {
            try {
              // Check if this show was recently removed by the user
              const showKey = `series:${showId}`;
              if (recentlyRemovedRef.current.has(showKey)) {
                logger.log(`🚫 [TraktSync] Skipping recently removed show: ${showKey}`);
                continue;
              }

              const nextEpisode = info.episode + 1;
              const cachedData = await getCachedMetadata('series', showId);
              if (!cachedData?.basicContent) continue;
              const { metadata, basicContent } = cachedData;
              let nextEpisodeVideo = null;
              if (metadata?.videos && Array.isArray(metadata.videos)) {
                nextEpisodeVideo = metadata.videos.find((video: any) =>
                  video.season === info.season && video.episode === nextEpisode
                );
              }
              if (nextEpisodeVideo && isEpisodeReleased(nextEpisodeVideo)) {
                logger.log(`➕ [TraktSync] Adding next episode for ${showId}: S${info.season}E${nextEpisode}`);
                traktBatch.push({
                  ...basicContent,
                  id: showId,
                  type: 'series',
                  progress: 0,
                  lastUpdated: info.watchedAt,
                  season: info.season,
                  episode: nextEpisode,
                  episodeTitle: `Episode ${nextEpisode}`,
                } as ContinueWatchingItem);
              }

              // Persist "watched" progress for the episode that Trakt reported (only if not recently removed)
              if (!recentlyRemovedRef.current.has(showKey)) {
                const watchedEpisodeId = `${showId}:${info.season}:${info.episode}`;
                const existingProgress = allProgress[`series:${showId}:${watchedEpisodeId}`];
                const existingPercent = existingProgress ? (existingProgress.currentTime / existingProgress.duration) * 100 : 0;
                if (!existingProgress || existingPercent < 85) {
                  logger.log(`💾 [TraktSync] Adding local progress for ${showId}: S${info.season}E${info.episode}`);
                  await storageService.setWatchProgress(
                    showId,
                    'series',
                    {
                      currentTime: 1,
                      duration: 1,
                      lastUpdated: info.watchedAt,
                      traktSynced: true,
                      traktProgress: 100,
                    } as any,
                    `${info.season}:${info.episode}`
                  );
                }
              } else {
                logger.log(`🚫 [TraktSync] Skipping local progress for recently removed show: ${showKey}`);
              }
            } catch (err) {
              // Continue with other shows even if one fails
            }
          }

          // Merge all Trakt items as a single batch to ensure proper sorting
          if (traktBatch.length > 0) {
            await mergeBatchIntoState(traktBatch);
          }
        } catch (err) {
          // Continue even if Trakt history merge fails
        }
      })();

      // Wait for all groups and trakt merge to settle, then finalize loading state
      await Promise.allSettled([...groupPromises, traktMergePromise]);
    } catch (error) {
      // Continue even if loading fails
    } finally {
      setLoading(false);
      isRefreshingRef.current = false;
    }
  }, [getCachedMetadata]);

  // Clear cache when component unmounts or when needed
  useEffect(() => {
    return () => {
      metadataCache.current = {};
    };
  }, []);

  // Function to handle app state changes
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // App has come to the foreground - force Trakt sync by resetting cooldown
      lastTraktSyncRef.current = 0; // Reset cooldown to allow immediate Trakt sync
      loadContinueWatching(true);
    }
    appState.current = nextAppState;
  }, [loadContinueWatching]);

  // Set up storage event listener and app state listener
  useEffect(() => {
    // Add app state change listener
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Add custom event listener for watch progress updates
    const watchProgressUpdateHandler = () => {
      // Debounce updates to avoid too frequent refreshes
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        // Only trigger background refresh for local progress updates, not Trakt sync
        // This prevents the feedback loop where Trakt sync triggers more progress updates
        loadContinueWatching(true);
      }, 2000); // Increased debounce to reduce frequency
    };

    // Try to set up a custom event listener or use a timer as fallback
    if (storageService.subscribeToWatchProgressUpdates) {
      const unsubscribe = storageService.subscribeToWatchProgressUpdates(watchProgressUpdateHandler);
      return () => {
        subscription.remove();
        unsubscribe();
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
        }
      };
    } else {
      // Reduced polling frequency from 30s to 5 minutes to reduce heating and battery drain
      const intervalId = setInterval(() => loadContinueWatching(true), 300000);
      return () => {
        subscription.remove();
        clearInterval(intervalId);
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
        }
      };
    }
  }, [loadContinueWatching, handleAppStateChange]);

  // Initial load
  useEffect(() => {
    loadContinueWatching();
  }, [loadContinueWatching]);

  // Refresh on screen focus (lightweight, no polling)
  useFocusEffect(
    useCallback(() => {
      loadContinueWatching(true);
      return () => {};
    }, [loadContinueWatching])
  );

  // Expose the refresh function via the ref
  React.useImperativeHandle(ref, () => ({
    refresh: async () => {
      // Manual refresh bypasses Trakt cooldown to get fresh data
      lastTraktSyncRef.current = 0; // Reset cooldown for manual refresh
      await loadContinueWatching(false);
      return true;
    }
  }));

  const handleContentPress = useCallback(async (item: ContinueWatchingItem) => {
    try {
      logger.log(`🎬 [ContinueWatching] User clicked on: ${item.name} (${item.type}:${item.id})`);
      
      // Check if we have a cached stream for this content
      const episodeId = item.type === 'series' && item.season && item.episode 
        ? `${item.id}:${item.season}:${item.episode}` 
        : undefined;
      
      logger.log(`🔍 [ContinueWatching] Looking for cached stream with episodeId: ${episodeId || 'none'}`);
      
      const cachedStream = await streamCacheService.getCachedStream(item.id, item.type, episodeId);
      
      if (cachedStream) {
        // We have a valid cached stream, navigate directly to player
        logger.log(`🚀 [ContinueWatching] Using cached stream for ${item.name}`);
        
        // Determine the player route based on platform
        const playerRoute = Platform.OS === 'ios' ? 'PlayerIOS' : 'PlayerAndroid';
        
        // Navigate directly to player with cached stream data
        navigation.navigate(playerRoute as any, {
          uri: cachedStream.stream.url,
          title: cachedStream.metadata?.name || item.name,
          episodeTitle: cachedStream.episodeTitle || (item.type === 'series' ? `Episode ${item.episode}` : undefined),
          season: cachedStream.season || item.season,
          episode: cachedStream.episode || item.episode,
          quality: (cachedStream.stream.title?.match(/(\d+)p/) || [])[1] || undefined,
          year: cachedStream.metadata?.year || item.year,
          streamProvider: cachedStream.stream.addonId || cachedStream.stream.addonName || cachedStream.stream.name,
          streamName: cachedStream.stream.name || cachedStream.stream.title || 'Unnamed Stream',
          headers: cachedStream.stream.headers || undefined,
          forceVlc: false,
          id: item.id,
          type: item.type,
          episodeId: episodeId,
          imdbId: cachedStream.metadata?.imdbId || item.imdb_id,
          backdrop: cachedStream.metadata?.backdrop || item.banner,
          videoType: undefined, // Let player auto-detect
        } as any);
        
        return;
      }
      
      // No cached stream or cache failed, navigate to StreamsScreen
      logger.log(`📺 [ContinueWatching] No cached stream, navigating to StreamsScreen for ${item.name}`);
      
      if (item.type === 'series' && item.season && item.episode) {
        // For series, navigate to the specific episode
        navigation.navigate('Streams', { 
          id: item.id, 
          type: item.type, 
          episodeId: episodeId 
        });
      } else {
        // For movies or series without specific episode, navigate to main content
        navigation.navigate('Streams', { 
          id: item.id, 
          type: item.type 
        });
      }
    } catch (error) {
      logger.warn('[ContinueWatching] Error handling content press:', error);
      // Fallback to StreamsScreen on any error
      if (item.type === 'series' && item.season && item.episode) {
        const episodeId = `${item.id}:${item.season}:${item.episode}`;
        navigation.navigate('Streams', { 
          id: item.id, 
          type: item.type, 
          episodeId: episodeId 
        });
      } else {
        navigation.navigate('Streams', { 
          id: item.id, 
          type: item.type 
        });
      }
    }
  }, [navigation]);

  // Handle long press to delete (moved before renderContinueWatchingItem)
  const handleLongPress = useCallback((item: ContinueWatchingItem) => {
    try {
      // Trigger haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      // Ignore haptic errors
    }

    setAlertTitle('Remove from Continue Watching');
    setAlertMessage(`Remove "${item.name}" from your continue watching list?`);
    setAlertActions([
      {
        label: 'Cancel',
        style: { color: '#888' },
        onPress: () => {},
      },
      {
        label: 'Remove',
        style: { color: currentTheme.colors.error },
        onPress: async () => {
          setDeletingItemId(item.id);
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await storageService.removeAllWatchProgressForContent(item.id, item.type, { addBaseTombstone: true });
            const traktService = TraktService.getInstance();
            const isAuthed = await traktService.isAuthenticated();
            if (isAuthed) {
              let traktResult = false;
              if (item.type === 'movie') {
                traktResult = await traktService.removeMovieFromHistory(item.id);
              } else if (item.type === 'series' && item.season !== undefined && item.episode !== undefined) {
                traktResult = await traktService.removeEpisodeFromHistory(item.id, item.season, item.episode);
              } else {
                traktResult = await traktService.removeShowFromHistory(item.id);
              }
            }
            const itemKey = `${item.type}:${item.id}`;
            recentlyRemovedRef.current.add(itemKey);
            await storageService.addContinueWatchingRemoved(item.id, item.type);
            setTimeout(() => {
              recentlyRemovedRef.current.delete(itemKey);
            }, REMOVAL_IGNORE_DURATION);
            setContinueWatchingItems(prev => prev.filter(i => i.id !== item.id));
          } catch (error) {
            // Continue even if removal fails
          } finally {
            setDeletingItemId(null);
          }
        },
      },
    ]);
    setAlertVisible(true);
  }, [currentTheme.colors.error]);

  // Memoized render function for continue watching items
  const renderContinueWatchingItem = useCallback(({ item }: { item: ContinueWatchingItem }) => (
    <TouchableOpacity
      style={[
        styles.wideContentItem, 
        {
          backgroundColor: currentTheme.colors.elevation1,
          borderColor: currentTheme.colors.border,
          shadowColor: currentTheme.colors.black,
          width: computedItemWidth,
          height: computedItemHeight
        }
      ]}
      activeOpacity={0.8}
      onPress={() => handleContentPress(item)}
      onLongPress={() => handleLongPress(item)}
      delayLongPress={800}
    >
      {/* Poster Image */}
      <View style={[
        styles.posterContainer,
        {
          width: isTV ? 100 : isLargeTablet ? 90 : isTablet ? 85 : 80
        }
      ]}>
        <FastImage
          source={{ 
            uri: item.poster || 'https://via.placeholder.com/300x450',
            priority: FastImage.priority.high,
            cache: FastImage.cacheControl.immutable
          }}
          style={styles.continueWatchingPoster}
          resizeMode={FastImage.resizeMode.cover}
        />
        
        {/* Delete Indicator Overlay */}
        {deletingItemId === item.id && (
          <View style={styles.deletingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}
      </View>

      {/* Content Details */}
      <View style={[
        styles.contentDetails,
        {
          padding: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12
        }
      ]}>
        <View style={styles.titleRow}>
          {(() => {
            const isUpNext = item.type === 'series' && item.progress === 0;
            return (
              <View style={styles.titleRow}>
                <Text 
                  style={[
                    styles.contentTitle, 
                    { 
                      color: currentTheme.colors.highEmphasis,
                      fontSize: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 17 : 16
                    }
                  ]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {isUpNext && (
                <View style={[
                  styles.progressBadge, 
                  { 
                    backgroundColor: currentTheme.colors.primary,
                    paddingHorizontal: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8,
                    paddingVertical: isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 3
                  }
                ]}>
                    <Text style={[
                      styles.progressText,
                      { fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 12 }
                    ]}>Up Next</Text>
                </View>
                )}
              </View>
            );
          })()}
        </View>

        {/* Episode Info or Year */}
        {(() => {
          if (item.type === 'series' && item.season && item.episode) {
            return (
              <View style={styles.episodeRow}>
                <Text style={[
                  styles.episodeText, 
                  { 
                    color: currentTheme.colors.mediumEmphasis,
                    fontSize: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 13
                  }
                ]}>
                  Season {item.season}
                </Text>
                {item.episodeTitle && (
                  <Text 
                    style={[
                      styles.episodeTitle, 
                      { 
                        color: currentTheme.colors.mediumEmphasis,
                        fontSize: isTV ? 15 : isLargeTablet ? 14 : isTablet ? 13 : 12
                      }
                    ]}
                    numberOfLines={1}
                  >
                    {item.episodeTitle}
                  </Text>
                )}
              </View>
            );
          } else {
            return (
              <Text style={[
                styles.yearText, 
                { 
                  color: currentTheme.colors.mediumEmphasis,
                  fontSize: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 13
                }
              ]}>
                {item.year} • {item.type === 'movie' ? 'Movie' : 'Series'}
              </Text>
            );
          }
        })()}

        {/* Progress Bar */}
        {item.progress > 0 && (
          <View style={styles.wideProgressContainer}>
            <View style={[
              styles.wideProgressTrack,
              {
                height: isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 4
              }
            ]}>
              <View 
                style={[
                  styles.wideProgressBar, 
                  { 
                    width: `${item.progress}%`, 
                    backgroundColor: currentTheme.colors.primary 
                  }
                ]} 
              />
            </View>
            <Text style={[
              styles.progressLabel, 
              { 
                color: currentTheme.colors.textMuted,
                fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 11
              }
            ]}>
              {Math.round(item.progress)}% watched
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  ), [currentTheme.colors, handleContentPress, handleLongPress, deletingItemId, computedItemWidth, computedItemHeight, isTV, isLargeTablet, isTablet]);

  // Memoized key extractor
  const keyExtractor = useCallback((item: ContinueWatchingItem) => `continue-${item.id}-${item.type}`, []);

  // Memoized item separator
  const ItemSeparator = useCallback(() => <View style={{ width: itemSpacing }} />, [itemSpacing]);

  // If no continue watching items, don't render anything
  if (continueWatchingItems.length === 0) {
    return null;
  }

  return (
    <Animated.View
      style={styles.container}
      entering={FadeIn.duration(350)}
    >
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.titleContainer}>
          <Text style={[
            styles.title, 
            { 
              color: currentTheme.colors.text,
              fontSize: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 26 : 24
            }
          ]}>Continue Watching</Text>
          <View style={[
            styles.titleUnderline, 
            { 
              backgroundColor: currentTheme.colors.primary,
              width: isTV ? 50 : isLargeTablet ? 45 : isTablet ? 40 : 40,
              height: isTV ? 4 : isLargeTablet ? 3.5 : isTablet ? 3 : 3
            }
          ]} />
        </View>
      </View>
      
      <FlashList
        data={continueWatchingItems}
        renderItem={renderContinueWatchingItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.wideList,
          { 
            paddingLeft: horizontalPadding, 
            paddingRight: horizontalPadding 
          }
        ]}
        ItemSeparatorComponent={ItemSeparator}
        onEndReachedThreshold={0.7}
        onEndReached={() => {}}
        removeClippedSubviews={true}
      />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        actions={alertActions}
        onClose={() => setAlertVisible(false)}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
    paddingTop: 0,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleContainer: {
    position: 'relative',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    width: 40,
    height: 3,
    borderRadius: 2,
    opacity: 0.8,
  },
  wideList: {
    paddingBottom: 8,
    paddingTop: 4,
  },
  wideContentItem: {
    width: 280,
    height: 120,
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    borderWidth: 1,
  },
  posterContainer: {
    width: 80,
    height: '100%',
    position: 'relative',
  },
  continueWatchingPoster: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  deletingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  contentDetails: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  contentTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  progressBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 44,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  episodeRow: {
    marginBottom: 8,
  },
  episodeText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  episodeTitle: {
    fontSize: 12,
  },
  yearText: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  wideProgressContainer: {
    marginTop: 'auto',
  },
  wideProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 4,
  },
  wideProgressBar: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Keep old styles for backward compatibility
  list: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    margin: 0,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1,
  },
  contentItemContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  episodeInfoContainer: {
    position: 'absolute',
    bottom: 3,
    left: 0,
    right: 0,
    padding: 4,
    paddingHorizontal: 8,
  },
  episodeInfo: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  progressBar: {
    height: '100%',
  },
});

export default React.memo(ContinueWatchingSection, (prevProps, nextProps) => {
  // This component has no props that would cause re-renders
  return true;
});