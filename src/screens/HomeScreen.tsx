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

// Constants
const CATALOG_SETTINGS_KEY = 'catalog_settings';

// Define interfaces for our data
interface Category {
  id: string;
  name: string;
}

interface ContentItemProps {
  item: StreamingContent;
  onPress: (id: string, type: string) => void;
}

interface DropUpMenuProps {
  visible: boolean;
  onClose: () => void;
  item: StreamingContent;
  onOptionSelect: (option: string) => void;
}

interface ContinueWatchingRef {
  refresh: () => Promise<boolean>;
}

const DropUpMenu = React.memo(({ visible, onClose, item, onOptionSelect }: DropUpMenuProps) => {
  const translateY = useSharedValue(300);
  const opacity = useSharedValue(0);
  const isDarkMode = useColorScheme() === 'dark';
  const { currentTheme } = useTheme();
  const SNAP_THRESHOLD = 100;

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 300 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(300, { duration: 300 });
    }
    
    // Cleanup animations when component unmounts
    return () => {
      opacity.value = 0;
      translateY.value = 300;
    };
  }, [visible]);

  const gesture = useMemo(() => Gesture.Pan()
    .onStart(() => {
      // Store initial position if needed
    })
    .onUpdate((event) => {
      if (event.translationY > 0) { // Only allow dragging downwards
        translateY.value = event.translationY;
        opacity.value = interpolate(
          event.translationY,
          [0, 300],
          [1, 0],
          Extrapolate.CLAMP
        );
      }
    })
    .onEnd((event) => {
      if (event.translationY > SNAP_THRESHOLD || event.velocityY > 500) {
        translateY.value = withTiming(300, { duration: 300 });
        opacity.value = withTiming(0, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 300 });
        opacity.value = withTiming(1, { duration: 200 });
      }
    }), [onClose]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: currentTheme.colors.transparentDark,
  }));

  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: isDarkMode ? currentTheme.colors.elevation2 : currentTheme.colors.white,
  }));

  const menuOptions = useMemo(() => [
    {
      icon: item.inLibrary ? 'bookmark' : 'bookmark-border',
      label: item.inLibrary ? 'Remove from Library' : 'Add to Library',
      action: 'library'
    },
    {
      icon: 'check-circle',
      label: 'Mark as Watched',
      action: 'watched'
    },
    {
      icon: 'playlist-add',
      label: 'Add to Playlist',
      action: 'playlist'
    },
    {
      icon: 'share',
      label: 'Share',
      action: 'share'
    }
  ], [item.inLibrary]);

  const handleOptionSelect = useCallback((action: string) => {
    onOptionSelect(action);
    onClose();
  }, [onOptionSelect, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, overlayStyle]}>
          <Pressable style={styles.modalOverlayPressable} onPress={onClose} />
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.menuContainer, menuStyle]}>
              <View style={[styles.dragHandle, { backgroundColor: currentTheme.colors.transparentLight }]} />
              <View style={[styles.menuHeader, { borderBottomColor: currentTheme.colors.border }]}>
                <ExpoImage
                  source={{ uri: item.poster }}
                  style={styles.menuPoster}
                  contentFit="cover"
                />
                <View style={styles.menuTitleContainer}>
                  <Text style={[styles.menuTitle, { color: isDarkMode ? currentTheme.colors.white : currentTheme.colors.black }]}>
                    {item.name}
                  </Text>
                  {item.year && (
                    <Text style={[styles.menuYear, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
                      {item.year}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.menuOptions}>
                {menuOptions.map((option, index) => (
                  <TouchableOpacity
                    key={option.action}
                    style={[
                      styles.menuOption,
                      { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                      index === menuOptions.length - 1 && styles.lastMenuOption
                    ]}
                    onPress={() => handleOptionSelect(option.action)}
                  >
                    <MaterialIcons
                      name={option.icon as "bookmark" | "check-circle" | "playlist-add" | "share" | "bookmark-border"}
                      size={24}
                      color={currentTheme.colors.primary}
                    />
                    <Text style={[
                      styles.menuOptionText,
                      { color: isDarkMode ? currentTheme.colors.white : currentTheme.colors.black }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const ContentItem = React.memo(({ item: initialItem, onPress }: ContentItemProps) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [localItem, setLocalItem] = useState(initialItem);
  const [isWatched, setIsWatched] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { currentTheme } = useTheme();

  const handleLongPress = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handlePress = useCallback(() => {
    onPress(localItem.id, localItem.type);
  }, [localItem.id, localItem.type, onPress]);

  const handleOptionSelect = useCallback((option: string) => {
    switch (option) {
      case 'library':
        if (localItem.inLibrary) {
          catalogService.removeFromLibrary(localItem.type, localItem.id);
        } else {
          catalogService.addToLibrary(localItem);
        }
        break;
      case 'watched':
        setIsWatched(prev => !prev);
        break;
      case 'playlist':
      case 'share':
        // These options don't have implementations yet
        break;
    }
  }, [localItem]);

  const handleMenuClose = useCallback(() => {
    setMenuVisible(false);
  }, []);

  // Only update localItem when initialItem changes
  useEffect(() => {
    setLocalItem(initialItem);
  }, [initialItem]);

  // Subscribe to library updates
  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates((libraryItems) => {
      const isInLibrary = libraryItems.some(
        libraryItem => libraryItem.id === localItem.id && libraryItem.type === localItem.type
      );
      if (isInLibrary !== localItem.inLibrary) {
        setLocalItem(prev => ({ ...prev, inLibrary: isInLibrary }));
      }
    });

    return () => unsubscribe();
  }, [localItem.id, localItem.type]);

  return (
    <>
      <TouchableOpacity
        style={styles.contentItem}
        activeOpacity={0.7}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={300}
      >
        <View style={styles.contentItemContainer}>
          <ExpoImage
            source={{ uri: localItem.poster }}
            style={styles.poster}
            contentFit="cover"
            transition={300}
            cachePolicy="memory-disk"
            recyclingKey={`poster-${localItem.id}`}
            onLoadStart={() => {
              setImageLoaded(false);
              setImageError(false);
            }}
            onLoadEnd={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
          {(!imageLoaded || imageError) && (
            <View style={[styles.loadingOverlay, { backgroundColor: currentTheme.colors.elevation2 }]}>
              {!imageError ? (
                <ActivityIndicator color={currentTheme.colors.primary} size="small" />
              ) : (
                <MaterialIcons name="broken-image" size={24} color={currentTheme.colors.lightGray} />
              )}
            </View>
          )}
          {isWatched && (
            <View style={styles.watchedIndicator}>
              <MaterialIcons name="check-circle" size={22} color={currentTheme.colors.success} />
            </View>
          )}
          {localItem.inLibrary && (
            <View style={styles.libraryBadge}>
              <MaterialIcons name="bookmark" size={16} color={currentTheme.colors.white} />
            </View>
          )}
        </View>
      </TouchableOpacity>
      
      {menuVisible && (
        <DropUpMenu
          visible={menuVisible}
          onClose={handleMenuClose}
          item={localItem}
          onOptionSelect={handleOptionSelect}
        />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.inLibrary === nextProps.item.inLibrary &&
    prevProps.onPress === nextProps.onPress
  );
});

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

  const [catalogs, setCatalogs] = useState<CatalogContent[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [loadedCatalogCount, setLoadedCatalogCount] = useState(0);
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
      
      // Load catalog settings to check which catalogs are enabled
      const catalogSettingsJson = await AsyncStorage.getItem(CATALOG_SETTINGS_KEY);
      const catalogSettings = catalogSettingsJson ? JSON.parse(catalogSettingsJson) : {};
      
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
                  const addonManifest = await stremioService.getInstalledAddonsAsync();
                  const manifest = addonManifest.find((a: any) => a.id === addon.id);
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
                    
                    console.log(`[HomeScreen] Loaded catalog: ${displayName} at position ${currentIndex} (${items.length} items)`);
                    
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
      console.log(`[HomeScreen] Starting to load ${catalogIndex} enabled catalogs progressively...`);
      
      // Initialize catalogs array with proper length
      setCatalogs(new Array(catalogIndex).fill(null));
      
      // Start all catalog loading promises but don't wait for them
      // They will update the state progressively as they complete
      Promise.allSettled(catalogPromises).then(() => {
      console.log('[HomeScreen] All catalogs processed');
      
        // Final cleanup: Filter out null values to get only successfully loaded catalogs
      setCatalogs(prevCatalogs => prevCatalogs.filter(catalog => catalog !== null));
      });
      
    } catch (error) {
      console.error('[HomeScreen] Error in progressive catalog loading:', error);
    } finally {
      setCatalogsLoading(false);
    }
  }, []);

  // Only count feature section as loading if it's enabled in settings
  // For catalogs, we show them progressively, so only show loading if no catalogs are loaded yet
  const isLoading = useMemo(() => 
    (showHeroSection ? featuredLoading : false) || (catalogsLoading && catalogs.length === 0),
    [showHeroSection, featuredLoading, catalogsLoading, catalogs.length]
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
      const imagePromises = content.map(item => {
        const imagesToLoad = [
          item.poster,
          item.banner,
          item.logo
        ].filter(Boolean) as string[];

        return Promise.all(
          imagesToLoad.map(imageUrl =>
            ExpoImage.prefetch(imageUrl)
          )
        );
      });

      await Promise.all(imagePromises);
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
      // Lock orientation to landscape before navigation to prevent glitches
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      
      // Small delay to ensure orientation is set before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
    console.log('[HomeScreen] Refreshing continue watching...');
    if (continueWatchingRef.current) {
      try {
      const hasContent = await continueWatchingRef.current.refresh();
        console.log(`[HomeScreen] Continue watching has content: ${hasContent}`);
      setHasContinueWatching(hasContent);
        
        // Debug: Let's check what's in storage
        const allProgress = await storageService.getAllWatchProgress();
        console.log('[HomeScreen] All watch progress in storage:', Object.keys(allProgress).length, 'items');
        console.log('[HomeScreen] Watch progress items:', allProgress);
        
        // Check if any items are being filtered out due to >85% progress
        let filteredCount = 0;
        for (const [key, progress] of Object.entries(allProgress)) {
          const progressPercent = (progress.currentTime / progress.duration) * 100;
          if (progressPercent >= 85) {
            filteredCount++;
            console.log(`[HomeScreen] Filtered out ${key}: ${progressPercent.toFixed(1)}% complete`);
          } else {
            console.log(`[HomeScreen] Valid progress ${key}: ${progressPercent.toFixed(1)}% complete`);
          }
        }
        console.log(`[HomeScreen] Filtered out ${filteredCount} completed items`);
        
      } catch (error) {
        console.error('[HomeScreen] Error refreshing continue watching:', error);
        setHasContinueWatching(false);
      }
    } else {
      console.log('[HomeScreen] Continue watching ref is null');
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
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Platform.OS === 'ios' ? 100 : 90 }
          ]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
        >
          {showHeroSection && (
            <FeaturedContent 
              key={`featured-${showHeroSection}-${featuredContentSource}`}
              featuredContent={featuredContent}
              isSaved={isSaved}
              handleSaveToLibrary={handleSaveToLibrary}
            />
          )}

          <Animated.View entering={FadeIn.duration(400).delay(150)}>
            <ThisWeekSection />
          </Animated.View>

            <ContinueWatchingSection ref={continueWatchingRef} />

          {/* Show catalogs as they load */}
          {catalogs.map((catalog, index) => {
            if (!catalog) {
              // Show placeholder for loading catalog
              return (
                <View key={`placeholder-${index}`} style={styles.catalogPlaceholder}>
                  <View style={styles.placeholderHeader}>
                    <View style={[styles.placeholderTitle, { backgroundColor: currentTheme.colors.elevation1 }]} />
                    <ActivityIndicator size="small" color={currentTheme.colors.primary} />
                  </View>
                  <View style={styles.placeholderPosters}>
                    {[...Array(4)].map((_, posterIndex) => (
                      <View 
                        key={posterIndex} 
                        style={[styles.placeholderPoster, { backgroundColor: currentTheme.colors.elevation1 }]} 
                      />
                    ))}
                  </View>
                </View>
              );
            }
            
            return (
              <Animated.View 
                key={`${catalog.addon}-${catalog.id}-${index}`}
                entering={FadeIn.duration(300)}
              >
                <CatalogSection catalog={catalog} />
              </Animated.View>
            );
          })}

          {/* Show loading indicator for remaining catalogs */}
          {catalogsLoading && catalogs.length < totalCatalogsRef.current && (
            <View style={styles.loadingMoreCatalogs}>
              <ActivityIndicator size="small" color={currentTheme.colors.primary} />
              <Text style={[styles.loadingMoreText, { color: currentTheme.colors.textMuted }]}>
                Loading more content... ({loadedCatalogCount}/{totalCatalogsRef.current})
              </Text>
            </View>
          )}

          {/* Show empty state only if all catalogs are loaded and none are available */}
          {!catalogsLoading && catalogs.length === 0 && (
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
        </ScrollView>
      </View>
    );
  }, [
    isLoading, 
    currentTheme.colors, 
    showHeroSection, 
    featuredContent, 
    isSaved, 
    handleSaveToLibrary, 
    hasContinueWatching, 
    catalogs, 
    catalogsLoading, 
    navigation,
    featuredContentSource
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
    
    console.log(`[HomeScreen] Testing ${n} posters: width=${posterWidth.toFixed(1)}px, screen=${screenWidth}px`);
    
    if (posterWidth >= MIN_POSTER_WIDTH && posterWidth <= MAX_POSTER_WIDTH) {
      bestLayout = { numFullPosters: n, posterWidth };
      console.log(`[HomeScreen] Selected layout: ${n} full posters at ${posterWidth.toFixed(1)}px each`);
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
    gap: 8,
  },
  placeholderPoster: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    borderRadius: 4,
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