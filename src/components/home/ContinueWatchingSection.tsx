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

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 40) / 2.7;

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
      setLoading(true);
      const allProgress = await storageService.getAllWatchProgress();
      if (Object.keys(allProgress).length === 0) {
        setContinueWatchingItems([]);
        return;
      }

      const progressItems: ContinueWatchingItem[] = [];
      const latestEpisodes: Record<string, ContinueWatchingItem> = {};
      const contentPromises: Promise<void>[] = [];
      
      // Process each saved progress
      for (const key in allProgress) {
        // Parse the key to get type and id
        const [type, id, episodeId] = key.split(':');
        const progress = allProgress[key];
        
        // Skip items that are more than 95% complete (effectively finished)
        const progressPercent = (progress.currentTime / progress.duration) * 100;
        if (progressPercent >= 95) continue;
        
        const contentPromise = (async () => {
          try {
            let content: StreamingContent | null = null;
            
            // Get content details using catalogService
            content = await catalogService.getContentDetails(type, id);
            
            if (content) {
              // Extract season and episode info from episodeId if available
              let season: number | undefined;
              let episode: number | undefined;
              let episodeTitle: string | undefined;
              
              if (episodeId && type === 'series') {
                const match = episodeId.match(/s(\d+)e(\d+)/i);
                if (match) {
                  season = parseInt(match[1], 10);
                  episode = parseInt(match[2], 10);
                  episodeTitle = `Episode ${episode}`;
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
              
              if (type === 'series') {
                // For series, keep only the latest watched episode for each show
                if (!latestEpisodes[id] || latestEpisodes[id].lastUpdated < progress.lastUpdated) {
                  latestEpisodes[id] = continueWatchingItem;
                }
              } else {
                // For movies, add to the list directly
                progressItems.push(continueWatchingItem);
              }
            }
          } catch (error) {
            logger.error(`Failed to get content details for ${type}:${id}`, error);
          }
        })();
        
        contentPromises.push(contentPromise);
      }
      
      // Wait for all content to be processed
      await Promise.all(contentPromises);
      
      // Add the latest episodes for each series to the items list
      progressItems.push(...Object.values(latestEpisodes));
      
      // Sort by last updated time (most recent first)
      progressItems.sort((a, b) => b.lastUpdated - a.lastUpdated);
      
      // Limit to 10 items
      setContinueWatchingItems(progressItems.slice(0, 10));
    } catch (error) {
      logger.error('Failed to load continue watching items:', error);
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
      await loadContinueWatching();
      // Return whether there are items to help parent determine visibility
      return continueWatchingItems.length > 0;
    }
  }));

  const handleContentPress = useCallback((id: string, type: string) => {
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  // If no continue watching items, don't render anything
  if (continueWatchingItems.length === 0 && !loading) {
    return null;
  }

  return (
    <View style={styles.container}>
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
            style={[styles.contentItem, {
              borderColor: currentTheme.colors.border,
              shadowColor: currentTheme.colors.black
            }]}
            activeOpacity={0.7}
            onPress={() => handleContentPress(item.id, item.type)}
          >
            <View style={styles.contentItemContainer}>
              <ExpoImage
                source={{ uri: item.poster }}
                style={styles.poster}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
              {item.type === 'series' && item.season && item.episode && (
                <View style={[styles.episodeInfoContainer, { backgroundColor: 'rgba(0, 0, 0, 0.7)' }]}>
                  <Text style={[styles.episodeInfo, { color: currentTheme.colors.white }]}>
                    S{item.season.toString().padStart(2, '0')}E{item.episode.toString().padStart(2, '0')}
                  </Text>
                  {item.episodeTitle && (
                    <Text style={[styles.episodeTitle, { color: currentTheme.colors.white, opacity: 0.9 }]} numberOfLines={1}>
                      {item.episodeTitle}
                    </Text>
                  )}
                </View>
              )}
              {/* Progress bar indicator */}
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBar, 
                    { width: `${item.progress}%`, backgroundColor: currentTheme.colors.primary }
                  ]} 
                />
              </View>
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => `continue-${item.id}-${item.type}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={POSTER_WIDTH + 10}
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
      />
    </View>
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
    marginBottom: 8,
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    margin: 0,
    borderRadius: 12,
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
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
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
  episodeTitle: {
    fontSize: 10,
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