import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  useColorScheme,
  Dimensions,
  ImageBackground,
  ScrollView,
  Platform,
  Image,
  Modal,
  Pressable,
  Alert
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { StreamingContent, CatalogContent, catalogService } from '../services/catalogService';
import { stremioService } from '../services/stremioService';
import { Stream } from '../types/metadata';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Animated, { 
  FadeIn, 
  FadeOut,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  interpolate,
  Extrapolate,
  runOnJS,
  useAnimatedGestureHandler,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useCatalogContext } from '../contexts/CatalogContext';
import { ThisWeekSection } from '../components/home/ThisWeekSection';
import ContinueWatchingSection from '../components/home/ContinueWatchingSection';
import * as Haptics from 'expo-haptics';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import { storageService } from '../services/storageService';
import { useHomeCatalogs } from '../hooks/useHomeCatalogs';
import { useFeaturedContent } from '../hooks/useFeaturedContent';
import { useSettings, settingsEmitter } from '../hooks/useSettings';
import FeaturedContent from '../components/home/FeaturedContent';
import CatalogSection from '../components/home/CatalogSection';
import { SkeletonFeatured } from '../components/home/SkeletonLoaders';
import homeStyles, { sharedStyles } from '../styles/homeStyles';
import { useTheme } from '../contexts/ThemeContext';
import type { Theme } from '../contexts/ThemeContext';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirstTimeWelcome from '../components/FirstTimeWelcome';

// Constants
const CATALOG_SETTINGS_KEY = 'catalog_settings';

// Define interfaces for our data
interface Category {
  id: string;
  name: string;
}

interface ContinueWatchingRef {
  refresh: () => Promise<boolean>;
}

type HomeScreenListItem =
  | { type: 'featured'; key: string }
  | { type: 'thisWeek'; key: string }
  | { type: 'continueWatching'; key: string }
  | { type: 'catalog'; catalog: CatalogContent; key: string }
  | { type: 'placeholder'; key: string }
  | { type: 'welcome'; key: string };

// Sample categories (real app would get these from API)
const SAMPLE_CATEGORIES: Category[] = [
  { id: 'movie', name: 'Movies' },
  { id: 'series', name: 'Series' },
  { id: 'channel', name: 'Channels' },
];

const SkeletonCatalog = React.memo(() => {
  const { currentTheme } = useTheme();
  return (
    <View style={styles.catalogContainer}>
      <View style={styles.loadingPlaceholder}>
        <ActivityIndicator size="small" color={currentTheme.colors.primary} />
      </View>
    </View>
  );
});

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isDarkMode = useColorScheme() === 'dark';
  const { currentTheme } = useTheme();
  const continueWatchingRef = useRef<ContinueWatchingRef>(null);
  const { settings } = useSettings();
  const { lastUpdate } = useCatalogContext(); // Add catalog context to listen for addon changes
  const [showHeroSection, setShowHeroSection] = useState(settings.showHeroSection);
  const [featuredContentSource, setFeaturedContentSource] = useState(settings.featuredContentSource);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasContinueWatching, setHasContinueWatching] = useState(false);

  const [catalogs, setCatalogs] = useState<(CatalogContent | null)[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [loadedCatalogCount, setLoadedCatalogCount] = useState(0);
  const [hasAddons, setHasAddons] = useState<boolean | null>(null);
  const totalCatalogsRef = useRef(0);
  
  const { 
    featuredContent, 
    loading: featuredLoading, 
    isSaved, 
    handleSaveToLibrary, 
    refreshFeatured 
  } = useFeaturedContent();

    // Progressive catalog loading function
  const loadCatalogsProgressively = useCallback(async () => {
    setCatalogsLoading(true);
    setCatalogs([]);
    setLoadedCatalogCount(0);
    
    try {
      const addons = await catalogService.getAllAddons();
      
      // Set hasAddons state based on whether we have any addons
      setHasAddons(addons.length > 0);
      
      // Load catalog settings to check which catalogs are enabled
      const catalogSettingsJson = await AsyncStorage.getItem(CATALOG_SETTINGS_KEY);
      const catalogSettings = catalogSettingsJson ? JSON.parse(catalogSettingsJson) : {};
      
      // Hoist addon manifest loading out of the loop
      const addonManifests = await stremioService.getInstalledAddonsAsync();
      
      // Create placeholder array with proper order and track indices
      const catalogPlaceholders: (CatalogContent | null)[] = [];
      const catalogPromises: Promise<void>[] = [];
      let catalogIndex = 0;
      
      for (const addon of addons) {
        if (addon.catalogs) {
          for (const catalog of addon.catalogs) {
            // Check if this catalog is enabled (default to true if no setting exists)
            const settingKey = `${addon.id}:${catalog.type}:${catalog.id}`;
            const isEnabled = catalogSettings[settingKey] ?? true;
            
            // Only load enabled catalogs
            if (isEnabled) {
              const currentIndex = catalogIndex;
              catalogPlaceholders.push(null); // Reserve position
              
              const catalogPromise = (async () => {
                try {
                  const manifest = addonManifests.find((a: any) => a.id === addon.id);
                  if (!manifest) return;

                  const metas = await stremioService.getCatalog(manifest, catalog.type, catalog.id, 1);
                  if (metas && metas.length > 0) {
                    const items = metas.map((meta: any) => ({
                      id: meta.id,
                      type: meta.type,
                      name: meta.name,
                      poster: meta.poster,
                      posterShape: meta.posterShape,
                      banner: meta.background,
                      logo: meta.logo,
                      imdbRating: meta.imdbRating,
                      year: meta.year,
                      genres: meta.genres,
                      description: meta.description,
                      runtime: meta.runtime,
                      released: meta.released,
                      trailerStreams: meta.trailerStreams,
                      videos: meta.videos,
                      directors: meta.director,
                      creators: meta.creator,
                      certification: meta.certification
                    }));
                    
                    let displayName = catalog.name;
                    const contentType = catalog.type === 'movie' ? 'Movies' : 'TV Shows';
                    if (!displayName.toLowerCase().includes(contentType.toLowerCase())) {
                      displayName = `${displayName} ${contentType}`;
                    }
                    
                    const catalogContent = {
                      addon: addon.id,
                      type: catalog.type,
                      id: catalog.id,
                      name: displayName,
                      items
                    };
                    
                    // Update the catalog at its specific position
                    setCatalogs(prevCatalogs => {
                      const newCatalogs = [...prevCatalogs];
                      newCatalogs[currentIndex] = catalogContent;
                      return newCatalogs;
                    });
                  }
                } catch (error) {
                  console.error(`[HomeScreen] Failed to load ${catalog.name} from ${addon.name}:`, error);
                } finally {
                  setLoadedCatalogCount(prev => prev + 1);
                }
              })();
              
              catalogPromises.push(catalogPromise);
              catalogIndex++;
            }
          }
        }
      }
      
      totalCatalogsRef.current = catalogIndex;
      
      // Initialize catalogs array with proper length
      setCatalogs(new Array(catalogIndex).fill(null));
      
      // Start all catalog loading promises but don't wait for them
      // They will update the state progressively as they complete
      await Promise.allSettled(catalogPromises);
      
      // Only set catalogsLoading to false after all promises have settled
      setCatalogsLoading(false);
    } catch (error) {
      console.error('[HomeScreen] Error in progressive catalog loading:', error);
      setCatalogsLoading(false);
    }
  }, []);

  // Only count feature section as loading if it's enabled in settings
  // For catalogs, we show them progressively, so loading should be false as soon as we have any content
  const isLoading = useMemo(() => 
    (showHeroSection ? featuredLoading : false) || (catalogsLoading && loadedCatalogCount === 0),
    [showHeroSection, featuredLoading, catalogsLoading, loadedCatalogCount]
  );

  // React to settings changes
  useEffect(() => {
    setShowHeroSection(settings.showHeroSection);
    setFeaturedContentSource(settings.featuredContentSource);
  }, [settings]);

  // Load catalogs progressively on mount and when settings change
  useEffect(() => {
    loadCatalogsProgressively();
  }, [loadCatalogsProgressively]);

  // Listen for catalog changes (addon additions/removals) and reload catalogs
  useEffect(() => {
    loadCatalogsProgressively();
  }, [lastUpdate, loadCatalogsProgressively]);

  // Create a refresh function for catalogs
  const refreshCatalogs = useCallback(() => {
    return loadCatalogsProgressively();
  }, [loadCatalogsProgressively]);

  // Subscribe directly to settings emitter for immediate updates
  useEffect(() => {
    const handleSettingsChange = () => {
      setShowHeroSection(settings.showHeroSection);
      setFeaturedContentSource(settings.featuredContentSource);
    };
    
    // Subscribe to settings changes
    const unsubscribe = settingsEmitter.addListener(handleSettingsChange);
    
    return unsubscribe;
  }, [settings]);

  useFocusEffect(
    useCallback(() => {
      const statusBarConfig = () => {
        // Ensure status bar is fully transparent and doesn't take up space
        StatusBar.setBarStyle("light-content");
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
        
        // For iOS specifically
        if (Platform.OS === 'ios') {
          StatusBar.setHidden(false);
        }
      };
      
      statusBarConfig();
      
      return () => {
        // Keep translucent when unfocusing to prevent layout shifts
      };
    }, [])
  );

  useEffect(() => {
    // Only run cleanup when component unmounts completely
    return () => {
      if (Platform.OS === 'android') {
        StatusBar.setTranslucent(false);
        StatusBar.setBackgroundColor(currentTheme.colors.darkBackground);
      }
      
      // Clean up any lingering timeouts
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [currentTheme.colors.darkBackground]);

  // Preload images function - memoized to avoid recreating on every render
  const preloadImages = useCallback(async (content: StreamingContent[]) => {
    if (!content.length) return;
    
    try {
      // Limit concurrent prefetching to prevent memory pressure
      const MAX_CONCURRENT_PREFETCH = 5;
      const BATCH_SIZE = 3;
      
      const allImages = content.slice(0, 10) // Limit total images to prefetch
        .map(item => [item.poster, item.banner, item.logo])
        .flat()
        .filter(Boolean) as string[];

      // Process in small batches to prevent memory pressure
      for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
        const batch = allImages.slice(i, i + BATCH_SIZE);
        
        try {
          await Promise.all(
            batch.map(async (imageUrl) => {
              try {
                await ExpoImage.prefetch(imageUrl);
                // Small delay between prefetches to reduce memory pressure
                await new Promise(resolve => setTimeout(resolve, 10));
              } catch (error) {
                // Silently handle individual prefetch errors
              }
            })
          );
          
          // Delay between batches to allow GC
          if (i + BATCH_SIZE < allImages.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error) {
          // Continue with next batch if current batch fails
        }
      }
    } catch (error) {
      // Silently handle preload errors
    }
  }, []);

  const handleContentPress = useCallback((id: string, type: string) => {
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  const handlePlayStream = useCallback(async (stream: Stream) => {
    if (!featuredContent) return;
    
    try {
      // Clear image cache to reduce memory pressure before orientation change
      if (typeof (global as any)?.ExpoImage?.clearMemoryCache === 'function') {
        try {
          (global as any).ExpoImage.clearMemoryCache();
        } catch (e) {
          // Ignore cache clear errors
        }
      }
      
      // Lock orientation to landscape before navigation to prevent glitches
      try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      
        // Longer delay to ensure orientation is fully set before navigation
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (orientationError) {
        // If orientation lock fails, continue anyway but log it
        logger.warn('[HomeScreen] Orientation lock failed:', orientationError);
        // Still add a small delay
      await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      navigation.navigate('Player', {
        uri: stream.url,
        title: featuredContent.name,
        year: featuredContent.year,
        quality: stream.title?.match(/(\d+)p/)?.[1] || undefined,
        streamProvider: stream.name,
        id: featuredContent.id,
        type: featuredContent.type
      });
    } catch (error) {
      logger.error('[HomeScreen] Error in handlePlayStream:', error);
      
      // Fallback: navigate anyway
      navigation.navigate('Player', {
        uri: stream.url,
        title: featuredContent.name,
        year: featuredContent.year,
        quality: stream.title?.match(/(\d+)p/)?.[1] || undefined,
        streamProvider: stream.name,
        id: featuredContent.id,
        type: featuredContent.type
      });
    }
  }, [featuredContent, navigation]);

  const refreshContinueWatching = useCallback(async () => {
    if (continueWatchingRef.current) {
      try {
      const hasContent = await continueWatchingRef.current.refresh();
      setHasContinueWatching(hasContent);
        
      } catch (error) {
        console.error('[HomeScreen] Error refreshing continue watching:', error);
        setHasContinueWatching(false);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Only refresh continue watching section on focus
      refreshContinueWatching();
      // Don't reload catalogs unless they haven't been loaded yet
      // Catalogs will be refreshed through context updates when addons change
      if (catalogs.length === 0 && !catalogsLoading) {
        loadCatalogsProgressively();
      }
    });

    return unsubscribe;
  }, [navigation, refreshContinueWatching, loadCatalogsProgressively, catalogs.length, catalogsLoading]);

  // Memoize the loading screen to prevent unnecessary re-renders
  const renderLoadingScreen = useMemo(() => {
    if (isLoading) {
      return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
          <StatusBar
            barStyle="light-content"
            backgroundColor="transparent"
            translucent
          />
          <View style={styles.loadingMainContainer}>
            <ActivityIndicator size="large" color={currentTheme.colors.primary} />
            <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>Loading your content...</Text>
          </View>
        </View>
      );
    }
    return null;
  }, [isLoading, currentTheme.colors]);

  const listData: HomeScreenListItem[] = useMemo(() => {
    const data: HomeScreenListItem[] = [];

    // If no addons are installed, just show the welcome component
    if (hasAddons === false) {
      data.push({ type: 'welcome', key: 'welcome' });
      return data;
    }

    // Normal flow when addons are present
    if (showHeroSection) {
      data.push({ type: 'featured', key: 'featured' });
    }

    data.push({ type: 'thisWeek', key: 'thisWeek' });
    data.push({ type: 'continueWatching', key: 'continueWatching' });

    catalogs.forEach((catalog, index) => {
      if (catalog) {
        data.push({ type: 'catalog', catalog, key: `${catalog.addon}-${catalog.id}-${index}` });
      } else {
        // Add a key for placeholders
        data.push({ type: 'placeholder', key: `placeholder-${index}` });
      }
    });

    return data;
  }, [hasAddons, showHeroSection, catalogs]);

  const renderListItem = useCallback(({ item }: { item: HomeScreenListItem }) => {
    switch (item.type) {
      case 'featured':
        return (
          <FeaturedContent
            key={`featured-${showHeroSection}-${featuredContentSource}`}
            featuredContent={featuredContent}
            isSaved={isSaved}
            handleSaveToLibrary={handleSaveToLibrary}
          />
        );
      case 'thisWeek':
        return <Animated.View entering={FadeIn.duration(300).delay(100)}><ThisWeekSection /></Animated.View>;
      case 'continueWatching':
        return <ContinueWatchingSection ref={continueWatchingRef} />;
      case 'catalog':
        return (
          <Animated.View entering={FadeIn.duration(300)}>
            <CatalogSection catalog={item.catalog} />
          </Animated.View>
        );
      case 'placeholder':
        return (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={styles.catalogPlaceholder}>
              <View style={styles.placeholderHeader}>
                <View style={[styles.placeholderTitle, { backgroundColor: currentTheme.colors.elevation1 }]} />
                <ActivityIndicator size="small" color={currentTheme.colors.primary} />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.placeholderPosters}>
                {[...Array(5)].map((_, posterIndex) => (
                  <View
                    key={posterIndex}
                    style={[styles.placeholderPoster, { backgroundColor: currentTheme.colors.elevation1 }]}
                  />
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        );
      case 'welcome':
        return <FirstTimeWelcome />;
      default:
        return null;
    }
  }, [
    showHeroSection,
    featuredContentSource,
    featuredContent,
    isSaved,
    handleSaveToLibrary,
    currentTheme.colors
  ]);

  const ListFooterComponent = useMemo(() => (
    <>
      {catalogsLoading && loadedCatalogCount > 0 && loadedCatalogCount < totalCatalogsRef.current && (
        <View style={styles.loadingMoreCatalogs}>
          <ActivityIndicator size="small" color={currentTheme.colors.primary} />
          <Text style={[styles.loadingMoreText, { color: currentTheme.colors.textMuted }]}>
            Loading catalogs... ({loadedCatalogCount}/{totalCatalogsRef.current})
          </Text>
        </View>
      )}
      {!catalogsLoading && catalogs.filter(c => c).length === 0 && (
        <View style={[styles.emptyCatalog, { backgroundColor: currentTheme.colors.elevation1 }]}>
          <MaterialIcons name="movie-filter" size={40} color={currentTheme.colors.textDark} />
          <Text style={{ color: currentTheme.colors.textDark, marginTop: 8, fontSize: 16, textAlign: 'center' }}>
            No content available
          </Text>
          <TouchableOpacity
            style={[styles.addCatalogButton, { backgroundColor: currentTheme.colors.primary }]}
            onPress={() => navigation.navigate('Settings')}
          >
            <MaterialIcons name="add-circle" size={20} color={currentTheme.colors.white} />
            <Text style={[styles.addCatalogButtonText, { color: currentTheme.colors.white }]}>Add Catalogs</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  ), [catalogsLoading, catalogs, loadedCatalogCount, totalCatalogsRef.current, navigation, currentTheme.colors]);

  // Memoize the main content section
  const renderMainContent = useMemo(() => {
    if (isLoading) return null;
    
    return (
      <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <FlatList
          data={listData}
          renderItem={renderListItem}
          keyExtractor={item => item.key}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Platform.OS === 'ios' ? 100 : 90 }
          ]}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={ListFooterComponent}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReachedThreshold={0.5}
          updateCellsBatchingPeriod={50}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10
          }}
          getItemLayout={(data, index) => ({
            length: index === 0 ? 400 : 280, // Approximate heights for different item types
            offset: index === 0 ? 0 : 400 + (index - 1) * 280,
            index,
          })}
        />
      </View>
    );
  }, [
    isLoading,
    currentTheme.colors,
    listData,
    renderListItem,
    ListFooterComponent
  ]);

  return isLoading ? renderLoadingScreen : renderMainContent;
};

const { width, height } = Dimensions.get('window');

// Dynamic poster calculation based on screen width - show 1/4 of next poster
const calculatePosterLayout = (screenWidth: number) => {
  const MIN_POSTER_WIDTH = 100; // Reduced minimum for more posters
  const MAX_POSTER_WIDTH = 130; // Reduced maximum for more posters
  const LEFT_PADDING = 16; // Left padding
  const SPACING = 8; // Space between posters
  
  // Calculate available width for posters (reserve space for left padding)
  const availableWidth = screenWidth - LEFT_PADDING;
  
  // Try different numbers of full posters to find the best fit
  let bestLayout = { numFullPosters: 3, posterWidth: 120 };
  
  for (let n = 3; n <= 6; n++) {
    // Calculate poster width needed for N full posters + 0.25 partial poster
    // Formula: N * posterWidth + (N-1) * spacing + 0.25 * posterWidth = availableWidth - rightPadding
    // Simplified: posterWidth * (N + 0.25) + (N-1) * spacing = availableWidth - rightPadding
    // We'll use minimal right padding (8px) to maximize space
    const usableWidth = availableWidth - 8;
    const posterWidth = (usableWidth - (n - 1) * SPACING) / (n + 0.25);
    
    if (posterWidth >= MIN_POSTER_WIDTH && posterWidth <= MAX_POSTER_WIDTH) {
      bestLayout = { numFullPosters: n, posterWidth };
    }
  }
  
  return {
    numFullPosters: bestLayout.numFullPosters,
    posterWidth: bestLayout.posterWidth,
    spacing: SPACING,
    partialPosterWidth: bestLayout.posterWidth * 0.25 // 1/4 of next poster
  };
};

const posterLayout = calculatePosterLayout(width);
const POSTER_WIDTH = posterLayout.posterWidth;

const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 90,
  },
  loadingMainContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 90,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  loadingMoreCatalogs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
  },
  loadingMoreText: {
    marginLeft: 12,
    fontSize: 14,
  },
  catalogPlaceholder: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  placeholderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderTitle: {
    width: 150,
    height: 20,
    borderRadius: 4,
  },
  placeholderPosters: {
    flexDirection: 'row',
    paddingVertical: 8,
    gap: 8,
  },
  placeholderPoster: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    borderRadius: 4,
    marginRight: 2,
  },
  emptyCatalog: {
    padding: 32,
    alignItems: 'center',
    margin: 16,
    borderRadius: 16,
  },
  addCatalogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    marginTop: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  addCatalogButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredContainer: {
    width: '100%',
    height: height * 0.6,
    marginTop: Platform.OS === 'ios' ? 0 : 0,
    marginBottom: 8,
    position: 'relative',
  },
  featuredBanner: {
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  featuredContent: {
    padding: 24,
    paddingBottom: 16,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 12,
  },
  featuredLogo: {
    width: width * 0.7,
    height: 100,
    marginBottom: 0,
    alignSelf: 'center',
  },
  featuredTitle: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 0,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  genreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 4,
  },
  genreText: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.9,
  },
  genreDot: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 4,
  },
  featuredButtons: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    width: '100%',
    flex: 1,
    maxHeight: 65,
    paddingTop: 16,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flex: 0,
    width: 150,
  },
  myListButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 6,
    width: 44,
    height: 44,
    flex: null,
  },
  infoButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 4,
    width: 44,
    height: 44,
    flex: null,
  },
  playButtonText: {
    color: '#000000',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  myListButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  infoButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  catalogContainer: {
    marginBottom: 24,
    paddingTop: 0,
    marginTop: 16,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  titleContainer: {
    position: 'relative',
  },
  catalogTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    width: 35,
    height: 2,
    borderRadius: 1,
    opacity: 0.8,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
    marginRight: 4,
  },
  catalogList: {
    paddingLeft: 16,
    paddingRight: 16 - posterLayout.partialPosterWidth,
    paddingBottom: 12,
    paddingTop: 6,
  },
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    margin: 0,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  imdbLogo: {
    width: 35,
    height: 17,
    marginRight: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ratingBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 3,
  },
  skeletonBox: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  skeletonFeatured: {
    width: '100%',
    height: height * 0.6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  skeletonPoster: {
    marginHorizontal: 4,
    borderRadius: 16,
  },
  contentItemContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  libraryIndicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  libraryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlayPressable: {
    flex: 1,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  menuContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.select({ ios: 40, android: 24 }),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  menuHeader: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuPoster: {
    width: 60,
    height: 90,
    borderRadius: 12,
  },
  menuTitleContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuYear: {
    fontSize: 14,
  },
  menuOptions: {
    paddingTop: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastMenuOption: {
    borderBottomWidth: 0,
  },
  menuOptionText: {
    fontSize: 16,
    marginLeft: 16,
  },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 2,
  },
  libraryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredContentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  featuredTitleText: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  loadingPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 16,
  },
  featuredLoadingContainer: {
    height: height * 0.4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default React.memo(HomeScreen); 