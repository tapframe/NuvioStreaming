import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  SafeAreaView,
  StatusBar,
  Animated as RNAnimated,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { catalogService } from '../services/catalogService';
import type { StreamingContent } from '../services/catalogService';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useTraktContext } from '../contexts/TraktContext';
import TraktIcon from '../../assets/rating-icons/trakt.svg';
import { TMDBService } from '../services/tmdbService';

// Define interfaces for proper typing
interface LibraryItem extends StreamingContent {
  progress?: number;
  lastWatched?: string;
}

interface TraktDisplayItem {
  id: string;
  name: string;
  type: 'movie' | 'series';
  poster: string;
  year?: number;
  lastWatched: string;
  plays: number;
  imdbId?: string;
  traktId: number;
}

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

const SkeletonLoader = () => {
  const pulseAnim = React.useRef(new RNAnimated.Value(0)).current;
  const { width } = useWindowDimensions();
  const itemWidth = (width - 48) / 2;
  const { currentTheme } = useTheme();

  React.useEffect(() => {
    const pulse = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const renderSkeletonItem = () => (
    <View style={[styles.itemContainer, { width: itemWidth }]}>
      <RNAnimated.View 
        style={[
          styles.posterContainer,
          { opacity, backgroundColor: currentTheme.colors.darkBackground }
        ]} 
      />
      <RNAnimated.View 
        style={[
          styles.skeletonTitle,
          { opacity, backgroundColor: currentTheme.colors.darkBackground }
        ]} 
      />
    </View>
  );

  return (
    <View style={styles.skeletonContainer}>
      {[...Array(6)].map((_, index) => (
        <View key={index} style={{ width: itemWidth, margin: 8 }}>
          {renderSkeletonItem()}
        </View>
      ))}
    </View>
  );
};

const LibraryScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isDarkMode = useColorScheme() === 'dark';
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'movies' | 'series'>('all');
  const [showTraktContent, setShowTraktContent] = useState(false);
  const insets = useSafeAreaInsets();
  const { currentTheme } = useTheme();
  
  // Trakt integration
  const {
    isAuthenticated: traktAuthenticated,
    isLoading: traktLoading,
    watchedMovies,
    watchedShows,
    loadWatchedItems
  } = useTraktContext();

  // Force consistent status bar settings
  useEffect(() => {
    const applyStatusBarConfig = () => {
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'android') {
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
      }
    };
    
    applyStatusBarConfig();
    
    // Re-apply on focus
    const unsubscribe = navigation.addListener('focus', applyStatusBarConfig);
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const loadLibrary = async () => {
      setLoading(true);
      try {
        const items = await catalogService.getLibraryItems();
        setLibraryItems(items);
      } catch (error) {
        logger.error('Failed to load library:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLibrary();

    // Subscribe to library updates
    const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
      setLibraryItems(items);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const filteredItems = libraryItems.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'movies') return item.type === 'movie';
    if (filter === 'series') return item.type === 'series';
    return true;
  });

  // Prepare Trakt items with proper poster URLs
  const traktItems = useMemo(() => {
    if (!traktAuthenticated || (!watchedMovies?.length && !watchedShows?.length)) {
      return [];
    }

    const items: TraktDisplayItem[] = [];

    // Process watched movies
    if (watchedMovies) {
      for (const watchedMovie of watchedMovies) {
        const movie = watchedMovie.movie;
        if (movie) {
          items.push({
            id: String(movie.ids.trakt),
            name: movie.title,
            type: 'movie',
            poster: 'https://via.placeholder.com/300x450/cccccc/666666?text=Loading...',
            year: movie.year,
            lastWatched: new Date(watchedMovie.last_watched_at).toLocaleDateString(),
            plays: watchedMovie.plays,
            imdbId: movie.ids.imdb,
            traktId: movie.ids.trakt,
          });
        }
      }
    }

    // Process watched shows
    if (watchedShows) {
      for (const watchedShow of watchedShows) {
        const show = watchedShow.show;
        if (show) {
          items.push({
            id: String(show.ids.trakt),
            name: show.title,
            type: 'series',
            poster: 'https://via.placeholder.com/300x450/cccccc/666666?text=Loading...',
            year: show.year,
            lastWatched: new Date(watchedShow.last_watched_at).toLocaleDateString(),
            plays: watchedShow.plays,
            imdbId: show.ids.imdb,
            traktId: show.ids.trakt,
          });
        }
      }
    }

    // Sort by last watched date (most recent first)
    return items.sort((a, b) => new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime());
  }, [traktAuthenticated, watchedMovies, watchedShows]);

  // State for tracking poster URLs
  const [traktPostersMap, setTraktPostersMap] = useState<Map<string, string>>(new Map());

  // Effect to fetch poster URLs for Trakt items
  useEffect(() => {
    const fetchTraktPosters = async () => {
      if (!traktAuthenticated || traktItems.length === 0) return;

      const tmdbService = TMDBService.getInstance();

      // Process items individually and update state as each poster is fetched
      for (const item of traktItems) {
        try {
          // Get TMDB ID from the original Trakt data
          let tmdbId: number | null = null;
          
          if (item.type === 'movie' && watchedMovies) {
            const watchedMovie = watchedMovies.find(wm => wm.movie?.ids.trakt === item.traktId);
            tmdbId = watchedMovie?.movie?.ids.tmdb || null;
          } else if (item.type === 'series' && watchedShows) {
            const watchedShow = watchedShows.find(ws => ws.show?.ids.trakt === item.traktId);
            tmdbId = watchedShow?.show?.ids.tmdb || null;
          }

          if (tmdbId) {
            // Fetch details from TMDB to get poster path
            let posterPath: string | null = null;
            
            if (item.type === 'movie') {
              const movieDetails = await tmdbService.getMovieDetails(String(tmdbId));
              posterPath = movieDetails?.poster_path || null;
            } else {
              const showDetails = await tmdbService.getTVShowDetails(tmdbId);
              posterPath = showDetails?.poster_path || null;
            }

            if (posterPath) {
              const fullPosterUrl = tmdbService.getImageUrl(posterPath, 'w500');
              if (fullPosterUrl) {
                // Update state immediately for this item
                setTraktPostersMap(prevMap => {
                  const newMap = new Map(prevMap);
                  newMap.set(item.id, fullPosterUrl);
                  return newMap;
                });
              }
            }
          }
        } catch (error) {
          logger.error(`Failed to fetch poster for Trakt item ${item.id}:`, error);
        }
      }
    };

    fetchTraktPosters();
  }, [traktItems, traktAuthenticated, watchedMovies, watchedShows]);

  // Log when posters map updates
  useEffect(() => {
    // Removed debugging logs
  }, [traktPostersMap]);

  const itemWidth = (width - 48) / 2; // 2 items per row with padding

  const renderItem = ({ item }: { item: LibraryItem }) => (
    <TouchableOpacity
      style={[styles.itemContainer, { width: itemWidth }]}
      onPress={() => navigation.navigate('Metadata', { id: item.id, type: item.type })}
      activeOpacity={0.7}
    >
      <View style={[styles.posterContainer, { shadowColor: currentTheme.colors.black }]}>
        <Image
          source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
          style={styles.poster}
          contentFit="cover"
          transition={300}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.posterGradient}
        >
          <Text 
            style={[styles.itemTitle, { color: currentTheme.colors.white }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {item.lastWatched && (
            <Text style={styles.lastWatched}>
              {item.lastWatched}
            </Text>
          )}
        </LinearGradient>
        
        {item.progress !== undefined && item.progress < 1 && (
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar,
                { width: `${item.progress * 100}%`, backgroundColor: currentTheme.colors.primary }
              ]} 
            />
          </View>
        )}
        {item.type === 'series' && (
          <View style={styles.badgeContainer}>
            <MaterialIcons
              name="live-tv"
              size={14}
              color={currentTheme.colors.white}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.badgeText, { color: currentTheme.colors.white }]}>Series</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderTraktFolder = () => (
    <TouchableOpacity
      style={[styles.itemContainer, { width: itemWidth }]}
      onPress={() => {
        if (!traktAuthenticated) {
          navigation.navigate('TraktSettings');
        } else {
          setShowTraktContent(true);
        }
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.posterContainer, styles.folderContainer, { shadowColor: currentTheme.colors.black }]}>
        <LinearGradient
          colors={['#E8254B', '#C41E3A']}
          style={styles.folderGradient}
        >
          <TraktIcon width={60} height={60} style={{ marginBottom: 12 }} />
          <Text style={[styles.folderTitle, { color: currentTheme.colors.white }]}>
            Trakt Collection
          </Text>
          {traktAuthenticated && traktItems.length > 0 && (
            <Text style={styles.folderCount}>
              {traktItems.length} items
            </Text>
          )}
          {!traktAuthenticated && (
            <Text style={styles.folderSubtitle}>
              Tap to connect
            </Text>
          )}
        </LinearGradient>
        
        {/* Trakt badge */}
        <View style={[styles.badgeContainer, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <TraktIcon width={12} height={12} style={{ marginRight: 4 }} />
          <Text style={[styles.badgeText, { color: currentTheme.colors.white }]}>
            Trakt
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderTraktItem = ({ item, customWidth }: { item: TraktDisplayItem; customWidth?: number }) => {
    const posterUrl = traktPostersMap.get(item.id) || 'https://via.placeholder.com/300x450/ff0000/ffffff?text=No+Poster';
    const width = customWidth || itemWidth;
    
    return (
      <TouchableOpacity
        style={[styles.itemContainer, { width }]}
        onPress={() => {
          // Navigate using IMDB ID for Trakt items
          if (item.imdbId) {
            navigation.navigate('Metadata', { id: item.imdbId, type: item.type });
          }
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.posterContainer, { shadowColor: currentTheme.colors.black }]}>
          <Image
            source={{ uri: posterUrl }}
            style={styles.poster}
            contentFit="cover"
            transition={300}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.posterGradient}
          >
            <Text 
              style={[styles.itemTitle, { color: currentTheme.colors.white }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            <Text style={styles.lastWatched}>
              Last watched: {item.lastWatched}
            </Text>
            {item.plays > 1 && (
              <Text style={styles.playsCount}>
                {item.plays} plays
              </Text>
            )}
          </LinearGradient>
          
          {/* Trakt badge */}
          <View style={[styles.badgeContainer, { backgroundColor: 'rgba(232,37,75,0.9)' }]}>
            <TraktIcon width={12} height={12} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeText, { color: currentTheme.colors.white }]}>
              {item.type === 'movie' ? 'Movie' : 'Series'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTraktContent = () => {
    if (traktLoading) {
      return <SkeletonLoader />;
    }

    if (traktItems.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <TraktIcon width={80} height={80} style={{ opacity: 0.7, marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>No watched content</Text>
          <Text style={[styles.emptySubtext, { color: currentTheme.colors.mediumGray }]}>
            Your Trakt watched history will appear here
          </Text>
          <TouchableOpacity 
            style={[styles.exploreButton, { 
              backgroundColor: currentTheme.colors.primary,
              shadowColor: currentTheme.colors.black
            }]}
            onPress={() => {
              loadWatchedItems();
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.exploreButtonText, { color: currentTheme.colors.white }]}>Refresh</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Separate movies and shows
    const movies = traktItems.filter(item => item.type === 'movie');
    const shows = traktItems.filter(item => item.type === 'series');

    return (
      <ScrollView 
        style={styles.sectionsContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sectionsContent}
      >
        {movies.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons 
                name="movie" 
                size={24} 
                color={currentTheme.colors.white} 
                style={styles.sectionIcon}
              />
              <Text style={[styles.sectionTitle, { color: currentTheme.colors.white }]}>
                Movies ({movies.length})
              </Text>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollContent}
            >
              {movies.map((item) => (
                <View key={item.id} style={{ width: itemWidth * 0.8, marginRight: 12 }}>
                  {renderTraktItem({ item, customWidth: itemWidth * 0.8 })}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {shows.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons 
                name="live-tv" 
                size={24} 
                color={currentTheme.colors.white} 
                style={styles.sectionIcon}
              />
              <Text style={[styles.sectionTitle, { color: currentTheme.colors.white }]}>
                TV Shows ({shows.length})
              </Text>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollContent}
            >
              {shows.map((item) => (
                <View key={item.id} style={{ width: itemWidth * 0.8, marginRight: 12 }}>
                  {renderTraktItem({ item, customWidth: itemWidth * 0.8 })}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderFilter = (filterType: 'all' | 'movies' | 'series', label: string, iconName: keyof typeof MaterialIcons.glyphMap) => {
    const isActive = filter === filterType;
    
    return (
      <TouchableOpacity
        style={[
          styles.filterButton,
          isActive && { backgroundColor: currentTheme.colors.primary },
          { shadowColor: currentTheme.colors.black }
        ]}
        onPress={() => setFilter(filterType)}
        activeOpacity={0.7}
      >
        <MaterialIcons
          name={iconName}
          size={22}
          color={isActive ? currentTheme.colors.white : currentTheme.colors.mediumGray}
          style={styles.filterIcon}
        />
        <Text
          style={[
            styles.filterText,
            { color: currentTheme.colors.mediumGray },
            isActive && { color: currentTheme.colors.white, fontWeight: '600' }
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <SkeletonLoader />;
    }

    // Combine regular library items with Trakt folder
    const allItems = [];
    
    // Add Trakt folder if authenticated or as connection prompt
    if (traktAuthenticated || !traktAuthenticated) {
      allItems.push({ type: 'trakt-folder', id: 'trakt-folder' });
    }
    
    // Add filtered library items
    allItems.push(...filteredItems);

    if (allItems.length === 0) {
      return (
            <View style={styles.emptyContainer}>
              <MaterialIcons 
                name="video-library" 
                size={80} 
                color={currentTheme.colors.mediumGray}
                style={{ opacity: 0.7 }}
              />
              <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>Your library is empty</Text>
              <Text style={[styles.emptySubtext, { color: currentTheme.colors.mediumGray }]}>
                Add content to your library to keep track of what you're watching
              </Text>
              <TouchableOpacity 
                style={[styles.exploreButton, { 
                  backgroundColor: currentTheme.colors.primary,
                  shadowColor: currentTheme.colors.black
                }]}
                onPress={() => navigation.navigate('Discover')}
                activeOpacity={0.7}
              >
                <Text style={[styles.exploreButtonText, { color: currentTheme.colors.white }]}>Explore Content</Text>
              </TouchableOpacity>
            </View>
      );
    }

    return (
            <FlatList
        data={allItems}
        renderItem={({ item }) => {
          if (item.type === 'trakt-folder') {
            return renderTraktFolder();
          }
          return renderItem({ item: item as LibraryItem });
        }}
              keyExtractor={item => item.id}
              numColumns={2}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={styles.columnWrapper}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
            />
    );
  };

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const headerHeight = headerBaseHeight + topSpacing;

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      {/* Fixed position header background to prevent shifts */}
      <View style={[styles.headerBackground, { height: headerHeight, backgroundColor: currentTheme.colors.darkBackground }]} />
      
      <View style={{ flex: 1 }}>
        {/* Header Section with proper top spacing */}
        <View style={[styles.header, { height: headerHeight, paddingTop: topSpacing }]}>
          <View style={styles.headerContent}>
            {showTraktContent ? (
              <>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setShowTraktContent(false)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons 
                    name="arrow-back" 
                    size={28} 
                    color={currentTheme.colors.white} 
                  />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                  <Text style={[styles.headerTitle, { color: currentTheme.colors.white }]}>
                    Trakt Collection
                  </Text>
                </View>
                <View style={styles.headerSpacer} />
              </>
            ) : (
              <Text style={[styles.headerTitle, { color: currentTheme.colors.white }]}>Library</Text>
            )}
          </View>
        </View>

        {/* Content Container */}
        <View style={[styles.contentContainer, { backgroundColor: currentTheme.colors.darkBackground }]}>
          {!showTraktContent && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersContainer}
              style={styles.filtersScrollView}
            >
              {renderFilter('all', 'All', 'apps')}
              {renderFilter('movies', 'Movies', 'movie')}
              {renderFilter('series', 'TV Shows', 'live-tv')}
            </ScrollView>
          )}

          {showTraktContent ? renderTraktContent() : renderContent()}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    justifyContent: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    zIndex: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterIcon: {
    marginRight: 8,
  },
  filterText: {
    fontSize: 15,
    fontWeight: '500',
  },
  listContainer: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    paddingBottom: 90,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  skeletonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 16,
    justifyContent: 'space-between',
  },
  itemContainer: {
    marginBottom: 16,
  },
  posterContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    aspectRatio: 2/3,
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    justifyContent: 'flex-end',
    height: '45%',
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  progressBar: {
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.3,
  },
  lastWatched: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  skeletonTitle: {
    height: 14,
    marginTop: 8,
    borderRadius: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 90,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  exploreButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  exploreButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  playsCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginTop: 2,
  },
  filtersScrollView: {
    flexGrow: 0,
  },
  folderContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    aspectRatio: 2/3,
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  folderGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  folderTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.3,
  },
  folderCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  folderSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  backButton: {
    padding: 8,
  },
  sectionsContainer: {
    flex: 1,
  },
  sectionsContent: {
    paddingBottom: 90,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  horizontalScrollContent: {
    paddingLeft: 16,
    paddingRight: 4,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44, // Match the back button width
  },
});

export default LibraryScreen; 