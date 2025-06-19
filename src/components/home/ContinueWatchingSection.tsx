import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Dimensions,
  AppState,
  AppStateStatus
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent, catalogService } from '../../services/catalogService';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useTheme } from '../../contexts/ThemeContext';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';

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

// Function to validate IMDB ID format
const isValidImdbId = (id: string): boolean => {
  // IMDB IDs should start with 'tt' followed by 7-10 digits
  const imdbPattern = /^tt\d{7,10}$/;
  return imdbPattern.test(id);
};

// Create a proper imperative handle with React.forwardRef and updated type
const ContinueWatchingSection = React.forwardRef<ContinueWatchingRef>((props, ref) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContinueWatchingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Modified loadContinueWatching to be more efficient
  const loadContinueWatching = useCallback(async () => {
    try {
      console.log('[ContinueWatching] Starting to load continue watching items...');
      setLoading(true);
      const allProgress = await storageService.getAllWatchProgress();
      console.log(`[ContinueWatching] Found ${Object.keys(allProgress).length} progress items in storage`);
      
      if (Object.keys(allProgress).length === 0) {
        console.log('[ContinueWatching] No progress items found, setting empty array');
        setContinueWatchingItems([]);
        return;
      }

      const progressItems: ContinueWatchingItem[] = [];
      const latestEpisodes: Record<string, ContinueWatchingItem> = {};
      const contentPromises: Promise<void>[] = [];
      
      // Process each saved progress
      for (const key in allProgress) {
        console.log(`[ContinueWatching] Raw key from storage: "${key}"`);
        
        // Parse the key to get type and id
        const keyParts = key.split(':');
        console.log(`[ContinueWatching] Key parts:`, keyParts);
        
        const [type, id, ...episodeIdParts] = keyParts;
        const episodeId = episodeIdParts.length > 0 ? episodeIdParts.join(':') : undefined;
        const progress = allProgress[key];
        
        console.log(`[ContinueWatching] Parsed - type: "${type}", id: "${id}", episodeId: "${episodeId}"`);
        
        // Skip items that are more than 95% complete (effectively finished)
        const progressPercent = (progress.currentTime / progress.duration) * 100;
        console.log(`[ContinueWatching] Progress for ${key}: ${progressPercent.toFixed(1)}%`);
        
        if (progressPercent >= 95) {
          console.log(`[ContinueWatching] Skipping ${key} - too high progress (${progressPercent.toFixed(1)}%)`);
          continue;
        }
        
        const contentPromise = (async () => {
          try {
            // Validate IMDB ID format before attempting to fetch
            if (!isValidImdbId(id)) {
              console.log(`[ContinueWatching] Skipping ${type}:${id} - invalid IMDB ID format`);
              return;
            }
            
            console.log(`[ContinueWatching] Fetching content details for ${type}:${id}`);
            let content: StreamingContent | null = null;
            
            // Get content details using catalogService
            content = await catalogService.getContentDetails(type, id);
            
            if (content) {
              console.log(`[ContinueWatching] Successfully fetched content: ${content.name}`);
              
              // Extract season and episode info from episodeId if available
              let season: number | undefined;
              let episode: number | undefined;
              let episodeTitle: string | undefined;
              
              if (episodeId && type === 'series') {
                console.log(`[ContinueWatching] Parsing episode ID: ${episodeId}`);
                
                // Try different episode ID formats
                let match = episodeId.match(/s(\d+)e(\d+)/i); // Format: s1e1
                if (match) {
                  season = parseInt(match[1], 10);
                  episode = parseInt(match[2], 10);
                  episodeTitle = `Episode ${episode}`;
                  console.log(`[ContinueWatching] Parsed s1e1 format: S${season}E${episode}`);
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
                      episode = episodeNum;
                      episodeTitle = `Episode ${episode}`;
                      console.log(`[ContinueWatching] Parsed colon format: S${season}E${episode}`);
                    }
                  }
                }
                
                if (!season || !episode) {
                  console.log(`[ContinueWatching] Failed to parse episode details from: ${episodeId}`);
                }
              }
              
              const continueWatchingItem: ContinueWatchingItem = {
                ...content,
                progress: progressPercent,
                lastUpdated: progress.lastUpdated,
                season,
                episode,
                episodeTitle
              };
              
              console.log(`[ContinueWatching] Created item for ${content.name}:`, {
                type,
                season,
                episode,
                episodeTitle,
                episodeId,
                originalKey: key
              });
              
              if (type === 'series') {
                // For series, keep only the latest watched episode for each show
                if (!latestEpisodes[id] || latestEpisodes[id].lastUpdated < progress.lastUpdated) {
                  latestEpisodes[id] = continueWatchingItem;
                  console.log(`[ContinueWatching] Updated latest episode for series ${id}`);
                }
              } else {
                // For movies, add to the list directly
                progressItems.push(continueWatchingItem);
                console.log(`[ContinueWatching] Added movie to progress items`);
              }
            } else {
              console.log(`[ContinueWatching] Failed to fetch content details for ${type}:${id}`);
            }
          } catch (error) {
            console.error(`[ContinueWatching] Failed to get content details for ${type}:${id}`, error);
          }
        })();
        
        contentPromises.push(contentPromise);
      }
      
      // Wait for all content to be processed
      console.log(`[ContinueWatching] Waiting for ${contentPromises.length} content promises...`);
      await Promise.all(contentPromises);
      
      // Add the latest episodes for each series to the items list
      progressItems.push(...Object.values(latestEpisodes));
      console.log(`[ContinueWatching] Total items after processing: ${progressItems.length}`);
      
      // Sort by last updated time (most recent first)
      progressItems.sort((a, b) => b.lastUpdated - a.lastUpdated);
      
      // Limit to 10 items
      const finalItems = progressItems.slice(0, 10);
      console.log(`[ContinueWatching] Final continue watching items: ${finalItems.length}`);
      
      // Debug: Log the final items with their episode details
      finalItems.forEach((item, index) => {
        console.log(`[ContinueWatching] Item ${index}:`, {
          name: item.name,
          type: item.type,
          season: item.season,
          episode: item.episode,
          episodeTitle: item.episodeTitle,
          progress: item.progress
        });
      });
      
      setContinueWatchingItems(finalItems);
    } catch (error) {
      console.error('[ContinueWatching] Failed to load continue watching items:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to handle app state changes
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // App has come to the foreground - refresh data
      loadContinueWatching();
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
        loadContinueWatching();
      }, 300);
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
      };
    } else {
      // Fallback: poll for updates every 30 seconds
      const intervalId = setInterval(loadContinueWatching, 30000);
      return () => {
        subscription.remove();
        clearInterval(intervalId);
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
      };
    }
  }, [loadContinueWatching, handleAppStateChange]);

  // Initial load
  useEffect(() => {
    loadContinueWatching();
  }, [loadContinueWatching]);

  // Properly expose the refresh method
  React.useImperativeHandle(ref, () => ({
    refresh: async () => {
      console.log('[ContinueWatching] Refresh method called');
      await loadContinueWatching();
      // Return whether there are items to help parent determine visibility
      const hasItems = continueWatchingItems.length > 0;
      console.log(`[ContinueWatching] Refresh returning hasItems: ${hasItems}, items count: ${continueWatchingItems.length}`);
      return hasItems;
    }
  }));

  const handleContentPress = useCallback((id: string, type: string) => {
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  // If no continue watching items, don't render anything
  if (continueWatchingItems.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn.duration(400).delay(250)} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: currentTheme.colors.highEmphasis }]}>Continue Watching</Text>
          <LinearGradient
            colors={[currentTheme.colors.primary, currentTheme.colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.titleUnderline}
          />
        </View>
      </View>
      
      <FlatList
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
          >
            {/* Poster Image */}
            <View style={styles.posterContainer}>
              <ExpoImage
                source={{ uri: item.poster }}
                style={styles.widePoster}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            </View>

            {/* Content Details */}
            <View style={styles.contentDetails}>
              <View style={styles.titleRow}>
                <Text 
                  style={[styles.contentTitle, { color: currentTheme.colors.highEmphasis }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <View style={[styles.progressBadge, { backgroundColor: currentTheme.colors.primary }]}>
                  <Text style={styles.progressText}>{Math.round(item.progress)}%</Text>
                </View>
              </View>

              {/* Episode Info or Year */}
              {(() => {
                console.log(`[ContinueWatching] Rendering item:`, {
                  name: item.name,
                  type: item.type,
                  season: item.season,
                  episode: item.episode,
                  episodeTitle: item.episodeTitle,
                  hasSeasonAndEpisode: !!(item.season && item.episode)
                });
                
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
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => `continue-${item.id}-${item.type}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.wideList}
        snapToInterval={280 + 16} // Card width + margin
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    paddingTop: 0,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  titleContainer: {
    position: 'relative',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    width: 60,
    height: 3,
    borderRadius: 1.5,
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
    borderRadius: 12,
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
  },
  widePoster: {
    width: '100%',
    height: '100%',
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