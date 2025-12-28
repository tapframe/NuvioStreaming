import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { Share } from 'react-native';
import { mmkvStorage } from '../services/mmkvStorage';
import { useToast } from '../contexts/ToastContext';
import DropUpMenu from '../components/home/DropUpMenu';
import ScreenHeader from '../components/common/ScreenHeader';
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
import { MaterialIcons, Feather } from '@expo/vector-icons';
import FastImage, { resizeMode as FIResizeMode } from '../utils/FastImageCompat';
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
import { useSettings } from '../hooks/useSettings';
import { useScrollToTop } from '../contexts/ScrollToTopContext';

interface LibraryItem extends StreamingContent {
  progress?: number;
  lastWatched?: string;
  gradient: [string, string];
  imdbId?: string;
  traktId: number;
  images?: TraktImages;
  watched?: boolean;
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
  itemCount: number;
}

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

function getGridLayout(screenWidth: number): { numColumns: number; itemWidth: number } {
  const horizontalPadding = 16;
  const gutter = 12;
  let numColumns = 3;
  if (screenWidth >= 1200) numColumns = 5;
  else if (screenWidth >= 1000) numColumns = 4;
  else if (screenWidth >= 700) numColumns = 3;
  else numColumns = 3;
  const available = screenWidth - horizontalPadding - (numColumns - 1) * gutter;
  const itemWidth = Math.floor(available / numColumns);
  return { numColumns, itemWidth };
}

const TraktItem = React.memo(({
  item,
  width,
  navigation,
  currentTheme,
  showTitles
}: {
  item: TraktDisplayItem;
  width: number;
  navigation: any;
  currentTheme: any;
  showTitles: boolean;
}) => {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPoster = async () => {
      if (item.images) {
        const url = TraktService.getTraktPosterUrl(item.images);
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
            <FastImage
              source={{ uri: posterUrl }}
              style={styles.poster}
              resizeMode={FIResizeMode.cover}
            />
          ) : (
            <View style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator color={currentTheme.colors.primary} />
            </View>
          )}
        </View>
        {showTitles && (
          <Text style={[styles.cardTitle, { color: currentTheme.colors.mediumEmphasis }]}>
            {item.name}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

const SkeletonLoader = () => {
  const pulseAnim = React.useRef(new RNAnimated.Value(0)).current;
  const { width, height } = useWindowDimensions();
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
  const { width, height } = useWindowDimensions();
  const { numColumns, itemWidth } = useMemo(() => getGridLayout(width), [width]);
  const [loading, setLoading] = useState(true);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<'trakt' | 'movies' | 'series'>('movies');
  const [showTraktContent, setShowTraktContent] = useState(false);
  const [selectedTraktFolder, setSelectedTraktFolder] = useState<string | null>(null);
  const { showInfo, showError } = useToast();
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const insets = useSafeAreaInsets();
  const { currentTheme } = useTheme();
  const { settings } = useSettings();
  const flashListRef = useRef<any>(null);

  // Scroll to top handler
  const scrollToTop = useCallback(() => {
    flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  useScrollToTop('Library', scrollToTop);

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

  useEffect(() => {
    const applyStatusBarConfig = () => {
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'android') {
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
      }
    };

    applyStatusBarConfig();
    const unsubscribe = navigation.addListener('focus', applyStatusBarConfig);
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const backAction = () => {
      if (showTraktContent) {
        if (selectedTraktFolder) {
          setSelectedTraktFolder(null);
        } else {
          setShowTraktContent(false);
        }
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showTraktContent, selectedTraktFolder]);

  useEffect(() => {
    const loadLibrary = async () => {
      setLoading(true);
      try {
        const items = await catalogService.getLibraryItems();

        const sortedItems = items.sort((a, b) => {
          const timeA = (a as any).addedToLibraryAt || 0;
          const timeB = (b as any).addedToLibraryAt || 0;
          return timeB - timeA;
        });

        const updatedItems = await Promise.all(sortedItems.map(async (item) => {
          const libraryItem: LibraryItem = {
            ...item,
            gradient: Array.isArray((item as any).gradient) ? (item as any).gradient : ['#222', '#444'],
            traktId: typeof (item as any).traktId === 'number' ? (item as any).traktId : 0,
          };
          const key = `watched:${item.type}:${item.id}`;
          const watched = await mmkvStorage.getItem(key);
          return {
            ...libraryItem,
            watched: watched === 'true'
          };
        }));
        setLibraryItems(updatedItems);
      } catch (error) {
        logger.error('Failed to load library:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLibrary();

    const unsubscribe = catalogService.subscribeToLibraryUpdates(async (items) => {
      const sortedItems = items.sort((a, b) => {
        const timeA = (a as any).addedToLibraryAt || 0;
        const timeB = (b as any).addedToLibraryAt || 0;
        return timeB - timeA;
      });

      const updatedItems = await Promise.all(sortedItems.map(async (item) => {
        const libraryItem: LibraryItem = {
          ...item,
          gradient: Array.isArray((item as any).gradient) ? (item as any).gradient : ['#222', '#444'],
          traktId: typeof (item as any).traktId === 'number' ? (item as any).traktId : 0,
        };
        const key = `watched:${item.type}:${item.id}`;
        const watched = await mmkvStorage.getItem(key);
        return {
          ...libraryItem,
          watched: watched === 'true'
        };
      }));
      setLibraryItems(updatedItems);
    });

    const watchedSub = DeviceEventEmitter.addListener('watchedStatusChanged', loadLibrary);
    const focusSub = navigation.addListener('focus', loadLibrary);

    return () => {
      unsubscribe();
      watchedSub.remove();
      focusSub();
    };
  }, [navigation]);

  const filteredItems = libraryItems.filter(item => {
    if (filter === 'movies') return item.type === 'movie';
    if (filter === 'series') return item.type === 'series';
    return true;
  });

  const traktFolders = useMemo((): TraktFolder[] => {
    if (!traktAuthenticated) return [];

    const folders: TraktFolder[] = [
      {
        id: 'watched',
        name: 'Watched',
        icon: 'visibility',
        itemCount: (watchedMovies?.length || 0) + (watchedShows?.length || 0),
      },
      {
        id: 'continue-watching',
        name: 'Continue',
        icon: 'play-circle-outline',
        itemCount: continueWatching?.length || 0,
      },
      {
        id: 'watchlist',
        name: 'Watchlist',
        icon: 'bookmark',
        itemCount: (watchlistMovies?.length || 0) + (watchlistShows?.length || 0),
      },
      {
        id: 'collection',
        name: 'Collection',
        icon: 'library-add',
        itemCount: (collectionMovies?.length || 0) + (collectionShows?.length || 0),
      },
      {
        id: 'ratings',
        name: 'Rated',
        icon: 'star',
        itemCount: ratedContent?.length || 0,
      }
    ];

    return folders.filter(folder => folder.itemCount > 0);
  }, [traktAuthenticated, watchedMovies, watchedShows, watchlistMovies, watchlistShows, collectionMovies, collectionShows, continueWatching, ratedContent]);

  const renderItem = ({ item }: { item: LibraryItem }) => (
    <TouchableOpacity
      style={[styles.itemContainer, { width: itemWidth }]}
      onPress={() => navigation.navigate('Metadata', { id: item.id, type: item.type })}
      onLongPress={() => {
        setSelectedItem(item);
        setMenuVisible(true);
      }}
      activeOpacity={0.7}
    >
      <View>
        <View style={[styles.posterContainer, { shadowColor: currentTheme.colors.black }]}>
          <FastImage
            source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
            style={styles.poster}
            resizeMode={FIResizeMode.cover}
          />
          {item.watched && (
            <View style={styles.watchedIndicator}>
              <MaterialIcons name="check-circle" size={22} color={currentTheme.colors.success || '#4CAF50'} />
            </View>
          )}
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
        </View>
        {settings.showPosterTitles && (
          <Text style={[styles.cardTitle, { color: currentTheme.colors.mediumEmphasis }]}>
            {item.name}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderTraktCollectionFolder = ({ folder }: { folder: TraktFolder }) => (
    <TouchableOpacity
      style={[styles.itemContainer, { width: itemWidth }]}
      onPress={() => {
        setSelectedTraktFolder(folder.id);
        loadAllCollections();
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.posterContainer, styles.folderContainer, { shadowColor: currentTheme.colors.black, backgroundColor: currentTheme.colors.elevation1 }]}>
        <View style={styles.folderGradient}>
          <MaterialIcons
            name={folder.icon}
            size={48}
            color={currentTheme.colors.white}
            style={{ marginBottom: 8 }}
          />
          <Text style={[styles.folderTitle, { color: currentTheme.colors.white }]}>
            {folder.name}
          </Text>
          <Text style={styles.folderCount}>
            {folder.itemCount} items
          </Text>
        </View>
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
          setSelectedTraktFolder(null);
          loadAllCollections();
        }
      }}
      activeOpacity={0.7}
    >
      <View>
        <View style={[styles.posterContainer, styles.folderContainer, { shadowColor: currentTheme.colors.black, backgroundColor: currentTheme.colors.elevation1 }]}>
          <View style={styles.folderGradient}>
            <TraktIcon width={48} height={48} style={{ marginBottom: 8 }} />
            <Text style={[styles.folderTitle, { color: currentTheme.colors.white }]}>
              Trakt
            </Text>
            {traktAuthenticated && traktFolders.length > 0 && (
              <Text style={styles.folderCount}>
                {traktFolders.length} items
              </Text>
            )}
          </View>
        </View>
        {settings.showPosterTitles && (
          <Text style={[styles.cardTitle, { color: currentTheme.colors.mediumEmphasis }]}>
            Trakt collections
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderTraktItem = useCallback(({ item }: { item: TraktDisplayItem }) => {
    return <TraktItem
      item={item}
      width={itemWidth}
      navigation={navigation}
      currentTheme={currentTheme}
      showTitles={settings.showPosterTitles}
    />;
  }, [itemWidth, navigation, currentTheme, settings.showPosterTitles]);

  const getTraktFolderItems = useCallback((folderId: string): TraktDisplayItem[] => {
    const items: TraktDisplayItem[] = [];

    switch (folderId) {
      case 'watched':
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
                lastWatched: watchedMovie.last_watched_at,
                plays: watchedMovie.plays,
                imdbId: movie.ids.imdb,
                traktId: movie.ids.trakt,
                images: movie.images,
              });
            }
          }
        }
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
                lastWatched: watchedShow.last_watched_at,
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
        if (continueWatching) {
          for (const item of continueWatching) {
            if (item.type === 'movie' && item.movie) {
              items.push({
                id: String(item.movie.ids.trakt),
                name: item.movie.title,
                type: 'movie',
                poster: 'placeholder',
                year: item.movie.year,
                lastWatched: item.paused_at,
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
                lastWatched: item.paused_at,
                imdbId: item.show.ids.imdb,
                traktId: item.show.ids.trakt,
                images: item.show.images,
              });
            }
          }
        }
        break;

      case 'watchlist':
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
                lastWatched: watchlistMovie.listed_at,
                imdbId: movie.ids.imdb,
                traktId: movie.ids.trakt,
                images: movie.images,
              });
            }
          }
        }
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
                lastWatched: watchlistShow.listed_at,
                imdbId: show.ids.imdb,
                traktId: show.ids.trakt,
                images: show.images,
              });
            }
          }
        }
        break;

      case 'collection':
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
                lastWatched: collectionMovie.collected_at,
                imdbId: movie.ids.imdb,
                traktId: movie.ids.trakt,
                images: movie.images,
              });
            }
          }
        }
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
                lastWatched: collectionShow.collected_at,
                imdbId: show.ids.imdb,
                traktId: show.ids.trakt,
                images: show.images,
              });
            }
          }
        }
        break;

      case 'ratings':
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
                lastWatched: ratedItem.rated_at,
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
                lastWatched: ratedItem.rated_at,
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

      return (
        <FlashList
          ref={flashListRef}
          data={traktFolders}
          renderItem={({ item }) => renderTraktCollectionFolder({ folder: item })}
          keyExtractor={item => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.7}
          onEndReached={() => { }}
        />
      );
    }

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
        ref={flashListRef}
        data={folderItems}
        renderItem={({ item }) => renderTraktItem({ item })}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        numColumns={numColumns}
        style={styles.traktContainer}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.7}
        onEndReached={() => { }}
      />
    );
  };

  const renderFilter = (filterType: 'trakt' | 'movies' | 'series', label: string, iconName: keyof typeof MaterialIcons.glyphMap) => {
    const isActive = filter === filterType;

    return (
      <TouchableOpacity
        style={[
          styles.filterButton,
          isActive && { backgroundColor: currentTheme.colors.primary },
          { shadowColor: currentTheme.colors.black }
        ]}
        onPress={() => {
          if (filterType === 'trakt') {
            if (!traktAuthenticated) {
              navigation.navigate('TraktSettings');
            } else {
              setShowTraktContent(true);
              setSelectedTraktFolder(null);
              loadAllCollections();
            }
            return;
          }
          setFilter(filterType);
        }}
        activeOpacity={0.7}
      >
        {filterType === 'trakt' ? (
          <View style={[styles.filterIcon, { justifyContent: 'center', alignItems: 'center' }]}>
            <TraktIcon width={18} height={18} style={{ opacity: isActive ? 1 : 0.6 }} />
          </View>
        ) : (
          <MaterialIcons
            name={iconName}
            size={22}
            color={isActive ? currentTheme.colors.white : currentTheme.colors.mediumGray}
            style={styles.filterIcon}
          />
        )}
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

    if (filteredItems.length === 0) {
      const emptyTitle = filter === 'movies' ? 'No movies yet' : filter === 'series' ? 'No TV shows yet' : 'No content yet';
      const emptySubtitle = 'Add some content to your library to see it here';
      return (
        <View style={styles.emptyContainer}>
          <MaterialIcons
            name="video-library"
            size={64}
            color={currentTheme.colors.lightGray}
          />
          <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>
            {emptyTitle}
          </Text>
          <Text style={[styles.emptySubtext, { color: currentTheme.colors.mediumGray }]}>
            {emptySubtitle}
          </Text>
          <TouchableOpacity
            style={[styles.exploreButton, {
              backgroundColor: currentTheme.colors.primary,
              shadowColor: currentTheme.colors.black
            }]}
            onPress={() => navigation.navigate('Search')}
            activeOpacity={0.7}
          >
            <Text style={[styles.exploreButtonText, { color: currentTheme.colors.white }]}>Find something to watch</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlashList
        ref={flashListRef}
        data={filteredItems}
        renderItem={({ item }) => renderItem({ item: item as LibraryItem })}
        keyExtractor={item => item.id}
        numColumns={numColumns}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.7}
        onEndReached={() => { }}
      />
    );
  };

  const isTablet = useMemo(() => {
    const smallestDimension = Math.min(width, height);
    return (Platform.OS === 'ios' ? (Platform as any).isPad === true : smallestDimension >= 768);
  }, [width, height]);

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <ScreenHeader
        title={showTraktContent
          ? (selectedTraktFolder
            ? traktFolders.find(f => f.id === selectedTraktFolder)?.name || 'Collection'
            : 'Trakt Collection')
          : 'Library'
        }
        showBackButton={showTraktContent}
        onBackPress={showTraktContent ? () => {
          if (selectedTraktFolder) {
            setSelectedTraktFolder(null);
          } else {
            setShowTraktContent(false);
          }
        } : undefined}
        useMaterialIcons={showTraktContent}
        rightActionIcon={!showTraktContent ? 'calendar' : undefined}
        onRightActionPress={!showTraktContent ? () => navigation.navigate('Calendar') : undefined}
        isTablet={isTablet}
      />

      <View style={[styles.contentContainer, { backgroundColor: currentTheme.colors.darkBackground }]}>
        {!showTraktContent && (
          <View style={styles.filtersContainer}>
            {renderFilter('trakt', 'Trakt', 'pan-tool')}
            {renderFilter('movies', 'Movies', 'movie')}
            {renderFilter('series', 'TV Shows', 'live-tv')}
          </View>
        )}

        {showTraktContent ? renderTraktContent() : renderContent()}
      </View>

      {selectedItem && (
        <DropUpMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          item={selectedItem}
          isWatched={!!selectedItem.watched}
          isSaved={true}
          onOptionSelect={async (option) => {
            if (!selectedItem) return;
            switch (option) {
              case 'library': {
                try {
                  await catalogService.removeFromLibrary(selectedItem.type, selectedItem.id);
                  showInfo('Removed from Library', 'Item removed from your library');
                  setLibraryItems(prev => prev.filter(item => !(item.id === selectedItem.id && item.type === selectedItem.type)));
                  setMenuVisible(false);
                } catch (error) {
                  showError('Failed to update Library', 'Unable to remove item from library');
                }
                break;
              }
              case 'watched': {
                try {
                  const key = `watched:${selectedItem.type}:${selectedItem.id}`;
                  const newWatched = !selectedItem.watched;
                  await mmkvStorage.setItem(key, newWatched ? 'true' : 'false');
                  showInfo(newWatched ? 'Marked as Watched' : 'Marked as Unwatched', newWatched ? 'Item marked as watched' : 'Item marked as unwatched');
                  setLibraryItems(prev => prev.map(item =>
                    item.id === selectedItem.id && item.type === selectedItem.type
                      ? { ...item, watched: newWatched }
                      : item
                  ));
                } catch (error) {
                  showError('Failed to update watched status', 'Unable to update watched status');
                }
                break;
              }
              case 'share': {
                let url = '';
                if (selectedItem.id) {
                  url = `https://www.imdb.com/title/${selectedItem.id}/`;
                }
                const message = `${selectedItem.name}\n${url}`;
                Share.share({ message, url, title: selectedItem.name });
                break;
              }
              default:
                break;
            }
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 12,
    padding: 2,
    zIndex: 2,
  },
  contentContainer: {
    flex: 1,
  },
  filtersContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    paddingHorizontal: 8,
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
    marginBottom: 20,
  },
  posterContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    aspectRatio: 2 / 3,
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
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
    aspectRatio: 2 / 3,
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.5,
  },
  folderCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 2,
  },
  folderSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginTop: 2,
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
    width: 44,
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
