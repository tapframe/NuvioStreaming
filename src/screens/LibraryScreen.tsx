import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  SafeAreaView,
  StatusBar,
  Animated as RNAnimated,
  ActivityIndicator,
  Platform,
  ScrollView,
  BackHandler,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
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
import { traktService, TraktService, TraktImages } from '../services/traktService';
import { TraktLoadingSpinner } from '../components/common/TraktLoadingSpinner';

// Define interfaces for proper typing
interface LibraryItem extends StreamingContent {
  progress?: number;
  lastWatched?: string;
  gradient: [string, string];
  imdbId?: string;
  traktId: number;
  images?: TraktImages;
}

interface TraktDisplayItem {
  id: string;
  name: string;
  type: 'movie' | 'series';
  poster: string;
  year?: number;
  lastWatched?: string;
  plays?: number;
  rating?: number;
  imdbId?: string;
  traktId: number;
  images?: TraktImages;
}

interface TraktFolder {
  id: string;
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  description: string;
  itemCount: number;
  gradient: [string, string];
}

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Compute responsive grid layout (more columns on tablets)
function getGridLayout(screenWidth: number): { numColumns: number; itemWidth: number } {
  const horizontalPadding = 24; // matches listContainer padding (approx)
  const gutter = 16; // space between items (via space-between + marginBottom)
  let numColumns = 2;
  if (screenWidth >= 1200) numColumns = 5;
  else if (screenWidth >= 1000) numColumns = 4;
  else if (screenWidth >= 700) numColumns = 3;
  else numColumns = 2;
  const available = screenWidth - horizontalPadding - (numColumns - 1) * gutter;
  const itemWidth = Math.floor(available / numColumns);
  return { numColumns, itemWidth };
}

const TraktItem = React.memo(({ item, width, navigation, currentTheme }: { item: TraktDisplayItem; width: number; navigation: any; currentTheme: any }) => {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPoster = async () => {
      if (item.images) {
        const url = await TraktService.getTraktPosterUrlCached(item.images);
        if (isMounted && url) {
          setPosterUrl(url);
        }
      }
    };
    fetchPoster();
    return () => { isMounted = false; };
  }, [item.images]);

  const handlePress = useCallback(() => {
    if (item.imdbId) {
      navigation.navigate('Metadata', { id: item.imdbId, type: item.type });
    }
  }, [navigation, item.imdbId, item.type]);
  
  return (
    <TouchableOpacity
      style={[styles.itemContainer, { width }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View>
        <View style={[styles.posterContainer, { shadowColor: currentTheme.colors.black }]}>
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
              contentFit="cover"
              cachePolicy="disk"
              transition={0}
              allowDownscaling
            />
          ) : (
            <View style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator color={currentTheme.colors.primary} />
            </View>
          )}

          <View style={[styles.badgeContainer, { backgroundColor: 'rgba(45,55,72,0.9)' }]}>
            <TraktIcon width={12} height={12} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeText, { color: currentTheme.colors.white }]}>
              {item.type === 'movie' ? 'Movie' : 'Series'}
            </Text>
          </View>
        </View>
        <Text style={[styles.cardTitle, { color: currentTheme.colors.white }]}>
          {item.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const SkeletonLoader = () => {
  const pulseAnim = React.useRef(new RNAnimated.Value(0)).current;
  const { width } = useWindowDimensions();
  const { numColumns, itemWidth } = getGridLayout(width);
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

  // Render enough skeletons for at least two rows
  const skeletonCount = numColumns * 2;
  return (
    <View style={styles.skeletonContainer}>
      {Array.from({ length: skeletonCount }).map((_, index) => (
        <View key={index} style={{ width: itemWidth, marginBottom: 16 }}>
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
  const { numColumns, itemWidth } = useMemo(() => getGridLayout(width), [width]);
  const [loading, setLoading] = useState(true);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'movies' | 'series'>('all');
  const [showTraktContent, setShowTraktContent] = useState(false);
  const [selectedTraktFolder, setSelectedTraktFolder] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const { currentTheme } = useTheme();
  
  // Trakt integration
  const {
    isAuthenticated: traktAuthenticated,
    isLoading: traktLoading,
    watchedMovies,
    watchedShows,
    watchlistMovies,
    watchlistShows,
    collectionMovies,
    collectionShows,
    continueWatching,
    ratedContent,
    loadWatchedItems,
    loadAllCollections
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

  // Handle hardware back button and gesture navigation
  useEffect(() => {
    const backAction = () => {
      if (showTraktContent) {
        if (selectedTraktFolder) {
          // If in a specific folder, go back to folder list
          setSelectedTraktFolder(null);
        } else {
          // If in Trakt collections view, go back to main library
          setShowTraktContent(false);
        }
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior (navigate back)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [showTraktContent, selectedTraktFolder]);

  useEffect(() => {
    const loadLibrary = async () => {
      setLoading(true);
      try {
        const items = await catalogService.getLibraryItems();
        setLibraryItems(items as LibraryItem[]);
      } catch (error) {
        logger.error('Failed to load library:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLibrary();

    // Subscribe to library updates
    const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
      setLibraryItems(items as LibraryItem[]);
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

  // Generate Trakt collection folders
  const traktFolders = useMemo((): TraktFolder[] => {
    if (!traktAuthenticated) return [];

    const folders: TraktFolder[] = [
      {
        id: 'watched',
        name: 'Watched',
        icon: 'visibility',
        description: 'Your watched content',
        itemCount: (watchedMovies?.length || 0) + (watchedShows?.length || 0),
        gradient: ['#2C3E50', '#34495E']
      },
      {
        id: 'continue-watching',
        name: 'Continue Watching',
        icon: 'play-circle-outline',
        description: 'Resume your progress',
        itemCount: continueWatching?.length || 0,
        gradient: ['#2980B9', '#3498DB']
      },
      {
        id: 'watchlist',
        name: 'Watchlist',
        icon: 'bookmark',
        description: 'Want to watch',
        itemCount: (watchlistMovies?.length || 0) + (watchlistShows?.length || 0),
        gradient: ['#6C3483', '#9B59B6']
      },
      {
        id: 'collection',
        name: 'Collection',
        icon: 'library-add',
        description: 'Your collection',
        itemCount: (collectionMovies?.length || 0) + (collectionShows?.length || 0),
        gradient: ['#1B2631', '#283747']
      },
      {
        id: 'ratings',
        name: 'Rated',
        icon: 'star',
        description: 'Your ratings',
        itemCount: ratedContent?.length || 0,
        gradient: ['#5D6D7E', '#85929E']
      }
    ];

    // Only return folders that have content
    return folders.filter(folder => folder.itemCount > 0);
  }, [traktAuthenticated, watchedMovies, watchedShows, watchlistMovies, watchlistShows, collectionMovies, collectionShows, continueWatching, ratedContent]);

  const renderItem = ({ item }: { item: LibraryItem }) => (
    <TouchableOpacity
      style={[styles.itemContainer, { width: itemWidth }]}
      onPress={() => navigation.navigate('Metadata', { id: item.id, type: item.type })}
      activeOpacity={0.7}
    >
      <View>
        <View style={[styles.posterContainer, { shadowColor: currentTheme.colors.black }]}>
          <Image
            source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
            style={styles.poster}
            contentFit="cover"
            transition={300}
          />

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
        <Text style={[styles.cardTitle, { color: currentTheme.colors.white }]}>
          {item.name}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Render individual Trakt collection folder
  const renderTraktCollectionFolder = ({ folder }: { folder: TraktFolder }) => (
    <TouchableOpacity
      style={[styles.itemContainer, { width: itemWidth }]}
      onPress={() => {
        setSelectedTraktFolder(folder.id);
        loadAllCollections(); // Load all collections when entering a specific folder
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.posterContainer, styles.folderContainer, { shadowColor: currentTheme.colors.black }]}>
        <LinearGradient
          colors={folder.gradient}
          style={styles.folderGradient}
        >
          <MaterialIcons 
            name={folder.icon} 
            size={60} 
            color={currentTheme.colors.white} 
            style={{ marginBottom: 12 }} 
          />
          <Text style={[styles.folderTitle, { color: currentTheme.colors.white }]}>
            {folder.name}
          </Text>
          <Text style={styles.folderCount}>
            {folder.itemCount} items
          </Text>
          <Text style={styles.folderSubtitle}>
            {folder.description}
          </Text>
        </LinearGradient>
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
          setSelectedTraktFolder(null); // Reset to folder view
          loadAllCollections(); // Load all collections when opening
        }
      }}
      activeOpacity={0.7}
    >
      <View>
        <View style={[styles.posterContainer, styles.folderContainer, { shadowColor: currentTheme.colors.black }]}>
          <LinearGradient
            colors={['#666666', '#444444']}
            style={styles.folderGradient}
          >
            <TraktIcon width={60} height={60} style={{ marginBottom: 12 }} />
            <Text style={[styles.folderTitle, { color: currentTheme.colors.white }]}>
              Trakt
            </Text>
            {traktAuthenticated && traktFolders.length > 0 && (
              <Text style={styles.folderCount}>
                {traktFolders.length} items
              </Text>
            )}
            {!traktAuthenticated && (
              <Text style={styles.folderSubtitle}>
                Tap to connect
              </Text>
            )}
          </LinearGradient>
        </View>
        <Text style={[styles.cardTitle, { color: currentTheme.colors.white }]}>
          Trakt collections
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderTraktItem = useCallback(({ item }: { item: TraktDisplayItem }) => {
    return <TraktItem item={item} width={itemWidth} navigation={navigation} currentTheme={currentTheme} />;
  }, [itemWidth, navigation, currentTheme]);

  // Get items for a specific Trakt folder
  const getTraktFolderItems = useCallback((folderId: string): TraktDisplayItem[] => {
    const items: TraktDisplayItem[] = [];

    switch (folderId) {
      case 'watched':
        // Add watched movies
        if (watchedMovies) {
          for (const watchedMovie of watchedMovies) {
            const movie = watchedMovie.movie;
            if (movie) {
              items.push({
                id: String(movie.ids.trakt),
                name: movie.title,
                type: 'movie',
                poster: 'placeholder',
                year: movie.year,
                lastWatched: new Date(watchedMovie.last_watched_at).toLocaleDateString(),
                plays: watchedMovie.plays,
                imdbId: movie.ids.imdb,
                traktId: movie.ids.trakt,
                images: movie.images,
              });
            }
          }
        }
        // Add watched shows
        if (watchedShows) {
          for (const watchedShow of watchedShows) {
            const show = watchedShow.show;
            if (show) {
              items.push({
                id: String(show.ids.trakt),
                name: show.title,
                type: 'series',
                poster: 'placeholder',
                year: show.year,
                lastWatched: new Date(watchedShow.last_watched_at).toLocaleDateString(),
                plays: watchedShow.plays,
                imdbId: show.ids.imdb,
                traktId: show.ids.trakt,
                images: show.images,
              });
            }
          }
        }
        break;

      case 'continue-watching':
        // Add continue watching items
        if (continueWatching) {
          for (const item of continueWatching) {
            if (item.type === 'movie' && item.movie) {
              items.push({
                id: String(item.movie.ids.trakt),
                name: item.movie.title,
                type: 'movie',
                poster: 'placeholder',
                year: item.movie.year,
                lastWatched: new Date(item.paused_at).toLocaleDateString(),
                imdbId: item.movie.ids.imdb,
                traktId: item.movie.ids.trakt,
                images: item.movie.images,
              });
            } else if (item.type === 'episode' && item.show && item.episode) {
              items.push({
                id: `${item.show.ids.trakt}:${item.episode.season}:${item.episode.number}`,
                name: `${item.show.title} S${item.episode.season}E${item.episode.number}`,
                type: 'series',
                poster: 'placeholder',
                year: item.show.year,
                lastWatched: new Date(item.paused_at).toLocaleDateString(),
                imdbId: item.show.ids.imdb,
                traktId: item.show.ids.trakt,
                images: item.show.images,
              });
            }
          }
        }
        break;

      case 'watchlist':
        // Add watchlist movies
        if (watchlistMovies) {
          for (const watchlistMovie of watchlistMovies) {
            const movie = watchlistMovie.movie;
            if (movie) {
              items.push({
                id: String(movie.ids.trakt),
                name: movie.title,
                type: 'movie',
                poster: 'placeholder',
                year: movie.year,
                lastWatched: new Date(watchlistMovie.listed_at).toLocaleDateString(),
                imdbId: movie.ids.imdb,
                traktId: movie.ids.trakt,
                images: movie.images,
              });
            }
          }
        }
        // Add watchlist shows
        if (watchlistShows) {
          for (const watchlistShow of watchlistShows) {
            const show = watchlistShow.show;
            if (show) {
              items.push({
                id: String(show.ids.trakt),
                name: show.title,
                type: 'series',
                poster: 'placeholder',
                year: show.year,
                lastWatched: new Date(watchlistShow.listed_at).toLocaleDateString(),
                imdbId: show.ids.imdb,
                traktId: show.ids.trakt,
                images: show.images,
              });
            }
          }
        }
        break;

      case 'collection':
        // Add collection movies
        if (collectionMovies) {
          for (const collectionMovie of collectionMovies) {
            const movie = collectionMovie.movie;
            if (movie) {
              items.push({
                id: String(movie.ids.trakt),
                name: movie.title,
                type: 'movie',
                poster: 'placeholder',
                year: movie.year,
                lastWatched: new Date(collectionMovie.collected_at).toLocaleDateString(),
                imdbId: movie.ids.imdb,
                traktId: movie.ids.trakt,
                images: movie.images,
              });
            }
          }
        }
        // Add collection shows
        if (collectionShows) {
          for (const collectionShow of collectionShows) {
            const show = collectionShow.show;
            if (show) {
              items.push({
                id: String(show.ids.trakt),
                name: show.title,
                type: 'series',
                poster: 'placeholder',
                year: show.year,
                lastWatched: new Date(collectionShow.collected_at).toLocaleDateString(),
                imdbId: show.ids.imdb,
                traktId: show.ids.trakt,
                images: show.images,
              });
            }
          }
        }
        break;

      case 'ratings':
        // Add rated content
        if (ratedContent) {
          for (const ratedItem of ratedContent) {
            if (ratedItem.movie) {
              const movie = ratedItem.movie;
              items.push({
                id: String(movie.ids.trakt),
                name: movie.title,
                type: 'movie',
                poster: 'placeholder',
                year: movie.year,
                lastWatched: new Date(ratedItem.rated_at).toLocaleDateString(),
                rating: ratedItem.rating,
                imdbId: movie.ids.imdb,
                traktId: movie.ids.trakt,
                images: movie.images,
              });
            } else if (ratedItem.show) {
              const show = ratedItem.show;
              items.push({
                id: String(show.ids.trakt),
                name: show.title,
                type: 'series',
                poster: 'placeholder',
                year: show.year,
                lastWatched: new Date(ratedItem.rated_at).toLocaleDateString(),
                rating: ratedItem.rating,
                imdbId: show.ids.imdb,
                traktId: show.ids.trakt,
                images: show.images,
              });
            }
          }
        }
        break;
    }

    // Sort by last watched/added date (most recent first)
    return items.sort((a, b) => {
      const dateA = a.lastWatched ? new Date(a.lastWatched).getTime() : 0;
      const dateB = b.lastWatched ? new Date(b.lastWatched).getTime() : 0;
      return dateB - dateA;
    });
  }, [watchedMovies, watchedShows, watchlistMovies, watchlistShows, collectionMovies, collectionShows, continueWatching, ratedContent]);

  const renderTraktContent = () => {
    if (traktLoading) {
      return <TraktLoadingSpinner />;
    }

    // If no specific folder is selected, show the folder structure
    if (!selectedTraktFolder) {
      if (traktFolders.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <TraktIcon width={80} height={80} style={{ opacity: 0.7, marginBottom: 16 }} />
            <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>No Trakt collections</Text>
            <Text style={[styles.emptySubtext, { color: currentTheme.colors.mediumGray }]}>
              Your Trakt collections will appear here once you start using Trakt
            </Text>
            <TouchableOpacity 
              style={[styles.exploreButton, { 
                backgroundColor: currentTheme.colors.primary,
                shadowColor: currentTheme.colors.black
              }]}
              onPress={() => {
                loadAllCollections();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.exploreButtonText, { color: currentTheme.colors.white }]}>Load Collections</Text>
            </TouchableOpacity>
          </View>
        );
      }

      // Show collection folders
      return (
         <FlashList
          data={traktFolders}
          renderItem={({ item }) => renderTraktCollectionFolder({ folder: item })}
          keyExtractor={item => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
           onEndReachedThreshold={0.7}
           onEndReached={() => {}}
        />
      );
    }

    // Show content for specific folder
    const folderItems = getTraktFolderItems(selectedTraktFolder);
    
    if (folderItems.length === 0) {
      const folderName = traktFolders.find(f => f.id === selectedTraktFolder)?.name || 'Collection';
      return (
        <View style={styles.emptyContainer}>
          <TraktIcon width={80} height={80} style={{ opacity: 0.7, marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>No content in {folderName}</Text>
          <Text style={[styles.emptySubtext, { color: currentTheme.colors.mediumGray }]}>
            This collection is empty
          </Text>
          <TouchableOpacity 
            style={[styles.exploreButton, { 
              backgroundColor: currentTheme.colors.primary,
              shadowColor: currentTheme.colors.black
            }]}
            onPress={() => {
              loadAllCollections();
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.exploreButtonText, { color: currentTheme.colors.white }]}>Refresh</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlashList
        data={folderItems}
        renderItem={({ item }) => renderTraktItem({ item })}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        numColumns={numColumns}
        style={styles.traktContainer}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.7}
        onEndReached={() => {}}
      />
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
                onPress={() => navigation.navigate('MainTabs')}
                activeOpacity={0.7}
              >
                <Text style={[styles.exploreButtonText, { color: currentTheme.colors.white }]}>Explore Content</Text>
              </TouchableOpacity>
            </View>
      );
    }

    return (
            <FlashList
        data={allItems}
        renderItem={({ item }) => {
          if (item.type === 'trakt-folder') {
            return renderTraktFolder();
          }
          return renderItem({ item: item as LibraryItem });
        }}
              keyExtractor={item => item.id}
              numColumns={numColumns}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.7}
              onEndReached={() => {}}
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
          <View style={[styles.headerContent, showTraktContent && { justifyContent: 'flex-start' }]}>
            {showTraktContent ? (
              <>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    if (selectedTraktFolder) {
                      setSelectedTraktFolder(null);
                    } else {
                      setShowTraktContent(false);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons 
                    name="arrow-back" 
                    size={28} 
                    color={currentTheme.colors.white} 
                  />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: currentTheme.colors.white, fontSize: 24, marginLeft: 16 }]}>
                    {selectedTraktFolder 
                      ? traktFolders.find(f => f.id === selectedTraktFolder)?.name || 'Collection'
                      : 'Trakt Collection'
                    }
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.headerTitle, { color: currentTheme.colors.white }]}>Library</Text>
                <TouchableOpacity
                  style={styles.calendarButton}
                  onPress={() => navigation.navigate('Calendar')}
                  activeOpacity={0.7}
                >
                  <MaterialIcons 
                    name="event" 
                    size={24} 
                    color={currentTheme.colors.white} 
                  />
                </TouchableOpacity>
              </>
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
    borderRadius: 12,
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
    borderRadius: 12,
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
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 4,
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
  traktContainer: {
    flex: 1,
  },
  emptyListText: {
    fontSize: 16,
    fontWeight: '500',
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  calendarButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LibraryScreen; 