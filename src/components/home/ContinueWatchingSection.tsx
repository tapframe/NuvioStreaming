import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  AppState,
  AppStateStatus,
  Alert,
  ActivityIndicator
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent, catalogService } from '../../services/catalogService';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useTheme } from '../../contexts/ThemeContext';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';
import * as Haptics from 'expo-haptics';
import { TraktService } from '../../services/traktService';
import { stremioService } from '../../services/stremioService';

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

  // Use a state to track if a background refresh is in progress
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      const [metadata, basicContent] = await Promise.all([
        stremioService.getMetaDetails(type, id),
        catalogService.getBasicContentDetails(type, id)
      ]);
      
      if (basicContent) {
        const result = { metadata, basicContent, timestamp: now };
        metadataCache.current[cacheKey] = result;
        return result;
      }
      return null;
    } catch (error) {
      logger.error(`Failed to fetch metadata for ${type}:${id}:`, error);
      return null;
    }
  }, []);

  // Modified loadContinueWatching to be more efficient
  const loadContinueWatching = useCallback(async (isBackgroundRefresh = false) => {
    // Prevent multiple concurrent refreshes
    if (isRefreshing) return;

    if (!isBackgroundRefresh) {
      setLoading(true);
    }
    setIsRefreshing(true);

    try {
      const allProgress = await storageService.getAllWatchProgress();
      
      if (Object.keys(allProgress).length === 0) {
        setContinueWatchingItems([]);
        return;
      }

      const progressItems: ContinueWatchingItem[] = [];
      const latestEpisodes: Record<string, ContinueWatchingItem> = {};
      
      // Group progress items by content ID to batch API calls
      const contentGroups: Record<string, { type: string; id: string; episodes: Array<{ key: string; episodeId?: string; progress: any; progressPercent: number }> }> = {};
      
      // First pass: group by content ID
      for (const key in allProgress) {
        const keyParts = key.split(':');
        const [type, id, ...episodeIdParts] = keyParts;
        const episodeId = episodeIdParts.length > 0 ? episodeIdParts.join(':') : undefined;
        const progress = allProgress[key];
        const progressPercent = (progress.currentTime / progress.duration) * 100;
        
        // Skip fully watched movies
        if (type === 'movie' && progressPercent >= 85) {
          continue;
        }
        
        const contentKey = `${type}:${id}`;
        if (!contentGroups[contentKey]) {
          contentGroups[contentKey] = { type, id, episodes: [] };
        }
        
        contentGroups[contentKey].episodes.push({ key, episodeId, progress, progressPercent });
      }
      
      // Second pass: process each content group with batched API calls
      const contentPromises = Object.values(contentGroups).map(async (group) => {
        try {
          // Allow any ID; meta resolution will try Cinemeta first, then other addons
          if (!isSupportedId(group.id)) return;
          
          // Get metadata once per content
          const cachedData = await getCachedMetadata(group.type, group.id);
          if (!cachedData?.basicContent) {
            return;
          }
          
          const { metadata, basicContent } = cachedData;
          
          // Process all episodes for this content
          for (const episode of group.episodes) {
            const { key, episodeId, progress, progressPercent } = episode;
            
            if (group.type === 'series' && progressPercent >= 85) {
              // Handle next episode logic for completed episodes
              let nextSeason: number | undefined;
              let nextEpisode: number | undefined;

              if (episodeId) {
                // Pattern 1: s1e1
                const match = episodeId.match(/s(\d+)e(\d+)/i);
                if (match) {
                  const currentSeason = parseInt(match[1], 10);
                  const currentEpisode = parseInt(match[2], 10);
                  nextSeason = currentSeason;
                  nextEpisode = currentEpisode + 1;
                } else {
                  // Pattern 2: id:season:episode
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

              // Check if next episode exists and has been released using cached metadata
              if (nextSeason !== undefined && nextEpisode !== undefined && metadata?.videos && Array.isArray(metadata.videos)) {
                const nextEpisodeVideo = metadata.videos.find((video: any) => 
                  video.season === nextSeason && video.episode === nextEpisode
                );
                
                if (nextEpisodeVideo && isEpisodeReleased(nextEpisodeVideo)) {
                  const nextEpisodeItem = {
                    ...basicContent,
                    id: group.id,
                    type: group.type,
                    progress: 0,
                    lastUpdated: progress.lastUpdated,
                    season: nextSeason,
                    episode: nextEpisode,
                    episodeTitle: `Episode ${nextEpisode}`,
                  } as ContinueWatchingItem;

                  // Store in latestEpisodes to ensure single entry per show
                  const existingLatest = latestEpisodes[group.id];
                  if (!existingLatest || existingLatest.lastUpdated < nextEpisodeItem.lastUpdated) {
                    latestEpisodes[group.id] = nextEpisodeItem;
                  }
                }
              }
              continue;
            }
            
            // Handle in-progress episodes
            let season: number | undefined;
            let episodeNumber: number | undefined;
            let episodeTitle: string | undefined;
            
            if (episodeId && group.type === 'series') {
              // Try different episode ID formats
              let match = episodeId.match(/s(\d+)e(\d+)/i); // Format: s1e1
              if (match) {
                season = parseInt(match[1], 10);
                episodeNumber = parseInt(match[2], 10);
                episodeTitle = `Episode ${episodeNumber}`;
              } else {
                // Try format: seriesId:season:episode (e.g., tt0108778:4:6)
                const parts = episodeId.split(':');
                if (parts.length >= 3) {
                  const seasonPart = parts[parts.length - 2]; // Second to last part
                  const episodePart = parts[parts.length - 1]; // Last part
                  
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
            
            const continueWatchingItem: ContinueWatchingItem = {
              ...basicContent,
              progress: progressPercent,
              lastUpdated: progress.lastUpdated,
              season,
              episode: episodeNumber,
              episodeTitle
            };
            
            if (group.type === 'series') {
              // For series, keep only the latest watched episode for each show
              if (!latestEpisodes[group.id] || latestEpisodes[group.id].lastUpdated < progress.lastUpdated) {
                latestEpisodes[group.id] = continueWatchingItem;
              }
            } else {
              // For movies, add to the list directly
              progressItems.push(continueWatchingItem);
            }
          }
        } catch (error) {
          logger.error(`Failed to process content group ${group.type}:${group.id}:`, error);
        }
      });
      
      // Wait for all content to be processed
       await Promise.all(contentPromises);
      
      // -------------------- TRAKT HISTORY INTEGRATION --------------------
      try {
        const traktService = TraktService.getInstance();
        const isAuthed = await traktService.isAuthenticated();
        if (isAuthed) {
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

          // Process Trakt shows in batches using cached metadata
          const traktPromises = Object.entries(latestWatchedByShow).map(async ([showId, info]) => {
            try {
              const nextEpisode = info.episode + 1;
              
              // Use cached metadata to validate next episode exists
              const cachedData = await getCachedMetadata('series', showId);
              if (!cachedData?.basicContent) return;
              
              const { metadata, basicContent } = cachedData;
              let nextEpisodeVideo = null;
              
              if (metadata?.videos && Array.isArray(metadata.videos)) {
                nextEpisodeVideo = metadata.videos.find((video: any) => 
                  video.season === info.season && video.episode === nextEpisode
                );
              }
              
              if (nextEpisodeVideo && isEpisodeReleased(nextEpisodeVideo)) {
                const placeholder: ContinueWatchingItem = {
                  ...basicContent,
                  id: showId,
                  type: 'series',
                  progress: 0,
                  lastUpdated: info.watchedAt,
                  season: info.season,
                  episode: nextEpisode,
                  episodeTitle: `Episode ${nextEpisode}`,
                } as ContinueWatchingItem;

                const existing = latestEpisodes[showId];
                if (!existing || existing.lastUpdated < info.watchedAt) {
                  latestEpisodes[showId] = placeholder;
                }
              }

              // Persist "watched" progress for the episode that Trakt reported
              const watchedEpisodeId = `${showId}:${info.season}:${info.episode}`;
              const existingProgress = allProgress[`series:${showId}:${watchedEpisodeId}`];
              const existingPercent = existingProgress ? (existingProgress.currentTime / existingProgress.duration) * 100 : 0;

              if (!existingProgress || existingPercent < 85) {
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
            } catch (err) {
              logger.error('Failed to build placeholder from history:', err);
            }
          });
          
          await Promise.all(traktPromises);
        }
      } catch (err) {
        logger.error('Error merging Trakt history:', err);
      }
      
      // Add the latest episodes for each series to the items list
      progressItems.push(...Object.values(latestEpisodes));
      
      // Sort by last updated time (most recent first)
      progressItems.sort((a, b) => b.lastUpdated - a.lastUpdated);
      
      // Show all continue watching items (no limit)
      setContinueWatchingItems(progressItems);
    } catch (error) {
      logger.error('Failed to load continue watching items:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isRefreshing, getCachedMetadata]);

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
      // App has come to the foreground - trigger a background refresh
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
        // Trigger a background refresh
        loadContinueWatching(true);
      }, 500); // Increased debounce time slightly
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
      // Reduced polling frequency from 30s to 2 minutes to reduce heating
      const intervalId = setInterval(() => loadContinueWatching(true), 120000);
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

  // Expose the refresh function via the ref
  React.useImperativeHandle(ref, () => ({
    refresh: async () => {
      // Allow manual refresh to show loading indicator
      await loadContinueWatching(false);
      return true;
    }
  }));

  const handleContentPress = useCallback((id: string, type: string) => {
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  // Handle long press to delete
  const handleLongPress = useCallback((item: ContinueWatchingItem) => {
    try {
      // Trigger haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      // Ignore haptic errors
    }

    // Show confirmation alert
    Alert.alert(
      "Remove from Continue Watching",
      `Remove "${item.name}" from your continue watching list?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            setDeletingItemId(item.id);
            try {
              // Trigger haptic feedback for confirmation
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              
              // Remove the watch progress
              await storageService.removeWatchProgress(
                item.id, 
                item.type, 
                item.type === 'series' && item.season && item.episode 
                  ? `${item.season}:${item.episode}` 
                  : undefined
              );
              
              // Also remove from Trakt playback queue if authenticated
              const traktService = TraktService.getInstance();
              const isAuthed = await traktService.isAuthenticated();
              if (isAuthed) {
                await traktService.deletePlaybackForContent(
                  item.id,
                  item.type as 'movie' | 'series',
                  item.season,
                  item.episode
                );
              }
              
              // Update the list by filtering out the deleted item
              setContinueWatchingItems(prev => 
                prev.filter(i => i.id !== item.id || 
                  (i.type === 'series' && item.type === 'series' && 
                   (i.season !== item.season || i.episode !== item.episode))
                )
              );
            } catch (error) {
              logger.error('Failed to remove watch progress:', error);
            } finally {
              setDeletingItemId(null);
            }
          }
        }
      ]
    );
  }, []);

  // If no continue watching items, don't render anything
  if (continueWatchingItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: currentTheme.colors.text }]}>Continue Watching</Text>
          <View style={[styles.titleUnderline, { backgroundColor: currentTheme.colors.primary }]} />
        </View>
      </View>
      
      <FlashList
        data={continueWatchingItems}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.wideContentItem, {
              backgroundColor: currentTheme.colors.elevation1,
              borderColor: currentTheme.colors.border,
              shadowColor: currentTheme.colors.black
            }]}
            activeOpacity={0.8}
            onPress={() => handleContentPress(item.id, item.type)}
            onLongPress={() => handleLongPress(item)}
            delayLongPress={800}
          >
            {/* Poster Image */}
            <View style={styles.posterContainer}>
              <ExpoImage
                source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
                style={styles.continueWatchingPoster}
                contentFit="cover"
                cachePolicy="memory"
                transition={0}
                placeholder={{ uri: 'https://via.placeholder.com/300x450' }}
                placeholderContentFit="cover"
                recyclingKey={item.id}
              />
              
              {/* Delete Indicator Overlay */}
              {deletingItemId === item.id && (
                <View style={styles.deletingOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                </View>
              )}
            </View>

            {/* Content Details */}
            <View style={styles.contentDetails}>
              <View style={styles.titleRow}>
                {(() => {
                  const isUpNext = item.progress === 0;
                  return (
                    <View style={styles.titleRow}>
                      <Text 
                        style={[styles.contentTitle, { color: currentTheme.colors.highEmphasis }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {isUpNext && (
                      <View style={[styles.progressBadge, { backgroundColor: currentTheme.colors.primary }]}>
                          <Text style={styles.progressText}>Up Next</Text>
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
                      <Text style={[styles.episodeText, { color: currentTheme.colors.mediumEmphasis }]}>
                        Season {item.season}
                      </Text>
                      {item.episodeTitle && (
                        <Text 
                          style={[styles.episodeTitle, { color: currentTheme.colors.mediumEmphasis }]}
                          numberOfLines={1}
                        >
                          {item.episodeTitle}
                        </Text>
                      )}
                    </View>
                  );
                } else {
                  return (
                    <Text style={[styles.yearText, { color: currentTheme.colors.mediumEmphasis }]}>
                      {item.year} • {item.type === 'movie' ? 'Movie' : 'Series'}
                    </Text>
                  );
                }
              })()}

              {/* Progress Bar */}
              {item.progress > 0 && (
                <View style={styles.wideProgressContainer}>
                  <View style={styles.wideProgressTrack}>
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
                  <Text style={[styles.progressLabel, { color: currentTheme.colors.textMuted }]}>
                    {Math.round(item.progress)}% watched
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => `continue-${item.id}-${item.type}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.wideList}
        ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
        onEndReachedThreshold={0.7}
        onEndReached={() => {}}
      />
    </View>
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
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
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

export default React.memo(ContinueWatchingSection);