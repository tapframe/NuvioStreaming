import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  SafeAreaView,
  StatusBar,
  Keyboard,
  Dimensions,
  ScrollView,
  Animated as RNAnimated,
  Pressable,
  Platform,
  Easing,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { catalogService, StreamingContent, GroupedSearchResults, AddonSearchResults } from '../services/catalogService';
import FastImage from '@d11/react-native-fast-image';
import debounce from 'lodash/debounce';
import { DropUpMenu } from '../components/home/DropUpMenu';
import { DeviceEventEmitter, Share } from 'react-native';
import { mmkvStorage } from '../services/mmkvStorage';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ScreenHeader from '../components/common/ScreenHeader';
import { useScrollToTop } from '../contexts/ScrollToTopContext';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useSettings } from '../hooks/useSettings';

// Catalog info type for discover
interface DiscoverCatalog {
  addonId: string;
  addonName: string;
  catalogId: string;
  catalogName: string;
  type: string;
  genres: string[];
}

const { width, height } = Dimensions.get('window');

// Enhanced responsive breakpoints
const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  largeTablet: 1024,
  tv: 1440,
};

const getDeviceType = (deviceWidth: number) => {
  if (deviceWidth >= BREAKPOINTS.tv) return 'tv';
  if (deviceWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
  if (deviceWidth >= BREAKPOINTS.tablet) return 'tablet';
  return 'phone';
};

const deviceType = getDeviceType(width);
const isTablet = deviceType === 'tablet';
const isLargeTablet = deviceType === 'largeTablet';
const isTV = deviceType === 'tv';
const TAB_BAR_HEIGHT = 85;

// Responsive poster sizes
const HORIZONTAL_ITEM_WIDTH = isTV ? width * 0.14 : isLargeTablet ? width * 0.16 : isTablet ? width * 0.18 : width * 0.3;
const HORIZONTAL_POSTER_HEIGHT = HORIZONTAL_ITEM_WIDTH * 1.5;
const POSTER_WIDTH = isTV ? 90 : isLargeTablet ? 80 : isTablet ? 70 : 90;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;
const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

const PLACEHOLDER_POSTER = 'https://placehold.co/300x450/222222/CCCCCC?text=No+Poster';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const SkeletonLoader = () => {
  const pulseAnim = React.useRef(new RNAnimated.Value(0)).current;
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
    <View style={styles.skeletonVerticalItem}>
      <RNAnimated.View style={[
        styles.skeletonPoster,
        { opacity, backgroundColor: currentTheme.colors.darkBackground }
      ]} />
      <View style={styles.skeletonItemDetails}>
        <RNAnimated.View style={[
          styles.skeletonTitle,
          { opacity, backgroundColor: currentTheme.colors.darkBackground }
        ]} />
        <View style={styles.skeletonMetaRow}>
          <RNAnimated.View style={[
            styles.skeletonMeta,
            { opacity, backgroundColor: currentTheme.colors.darkBackground }
          ]} />
          <RNAnimated.View style={[
            styles.skeletonMeta,
            { opacity, backgroundColor: currentTheme.colors.darkBackground }
          ]} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.skeletonContainer}>
      {[...Array(5)].map((_, index) => (
        <View key={index}>
          {index === 0 && (
            <RNAnimated.View style={[
              styles.skeletonSectionHeader,
              { opacity, backgroundColor: currentTheme.colors.darkBackground }
            ]} />
          )}
          {renderSkeletonItem()}
        </View>
      ))}
    </View>
  );
};

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Create a simple, elegant animation component
const SimpleSearchAnimation = () => {
  // Simple animation values that work reliably
  const spinAnim = React.useRef(new RNAnimated.Value(0)).current;
  const fadeAnim = React.useRef(new RNAnimated.Value(0)).current;
  const { currentTheme } = useTheme();

  React.useEffect(() => {
    // Rotation animation
    const spin = RNAnimated.loop(
      RNAnimated.timing(spinAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Fade animation
    const fade = RNAnimated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    });

    // Start animations
    spin.start();
    fade.start();

    // Clean up
    return () => {
      spin.stop();
    };
  }, [spinAnim, fadeAnim]);

  // Simple rotation interpolation
  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <RNAnimated.View
      style={[
        styles.simpleAnimationContainer,
        { opacity: fadeAnim }
      ]}
    >
      <View style={styles.simpleAnimationContent}>
        <RNAnimated.View style={[
          styles.spinnerContainer,
          { transform: [{ rotate: spin }], backgroundColor: currentTheme.colors.primary }
        ]}>
          <MaterialIcons
            name="search"
            size={32}
            color={currentTheme.colors.white}
          />
        </RNAnimated.View>
        <Text style={[styles.simpleAnimationText, { color: currentTheme.colors.white }]}>Searching</Text>
      </View>
    </RNAnimated.View>
  );
};

const SearchScreen = () => {
  const { settings } = useSettings();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isDarkMode = true;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedSearchResults>({ byAddon: [], allResults: [] });
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(true);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { currentTheme } = useTheme();
  // Live search handle
  const liveSearchHandle = useRef<{ cancel: () => void; done: Promise<void> } | null>(null);
  // Addon installation order map for stable section ordering
  const addonOrderRankRef = useRef<Record<string, number>>({});
  // Track if this is the initial mount to prevent unnecessary operations
  const isInitialMount = useRef(true);
  // Track mount status for async operations
  const isMounted = useRef(true);
  const scrollViewRef = useRef<ScrollView>(null);

  // Discover section state
  const [discoverCatalogs, setDiscoverCatalogs] = useState<DiscoverCatalog[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<DiscoverCatalog | null>(null);
  const [selectedDiscoverType, setSelectedDiscoverType] = useState<'movie' | 'series'>('movie');
  const [selectedDiscoverGenre, setSelectedDiscoverGenre] = useState<string | null>(null);
  // Discover pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [discoverResults, setDiscoverResults] = useState<StreamingContent[]>([]);

  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverInitialized, setDiscoverInitialized] = useState(false);

  // Bottom sheet refs and state
  const typeSheetRef = useRef<BottomSheetModal>(null);
  const catalogSheetRef = useRef<BottomSheetModal>(null);
  const genreSheetRef = useRef<BottomSheetModal>(null);
  const typeSnapPoints = useMemo(() => ['25%'], []);
  const catalogSnapPoints = useMemo(() => ['50%'], []);
  const genreSnapPoints = useMemo(() => ['50%'], []);

  // Scroll to top handler
  const scrollToTop = useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  useScrollToTop('Search', scrollToTop);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Load discover catalogs on mount
  useEffect(() => {
    const loadDiscoverCatalogs = async () => {
      try {
        const filters = await catalogService.getDiscoverFilters();
        if (isMounted.current) {
          // Flatten catalogs from all types into a single array
          const allCatalogs: DiscoverCatalog[] = [];
          for (const [type, catalogs] of Object.entries(filters.catalogsByType)) {
            // Only include movie and series types
            if (type === 'movie' || type === 'series') {
              for (const catalog of catalogs) {
                allCatalogs.push({
                  ...catalog,
                  type,
                });
              }
            }
          }
          setDiscoverCatalogs(allCatalogs);
          // Auto-select first catalog if available
          if (allCatalogs.length > 0) {
            setSelectedCatalog(allCatalogs[0]);
          }
          setDiscoverInitialized(true);
        }
      } catch (error) {
        logger.error('Failed to load discover catalogs:', error);
        if (isMounted.current) {
          setDiscoverInitialized(true);
        }
      }
    };
    loadDiscoverCatalogs();
  }, []);

  // Fetch discover content when catalog or genre changes
  useEffect(() => {
    if (!discoverInitialized || !selectedCatalog || query.trim().length > 0) return;

    const fetchDiscoverContent = async () => {
      if (!isMounted.current) return;
      setDiscoverLoading(true);
      setPage(1); // Reset page on new filter
      setHasMore(true);
      try {
        const results = await catalogService.discoverContentFromCatalog(
          selectedCatalog.addonId,
          selectedCatalog.catalogId,
          selectedCatalog.type,
          selectedDiscoverGenre || undefined,
          1 // page 1
        );
        if (isMounted.current) {
          setDiscoverResults(results);
          setHasMore(results.length > 0);
        }
      } catch (error) {
        logger.error('Failed to fetch discover content:', error);
        if (isMounted.current) {
          setDiscoverResults([]);
        }
      } finally {
        if (isMounted.current) {
          setDiscoverLoading(false);
        }
      }
    };

    fetchDiscoverContent();
  }, [discoverInitialized, selectedCatalog, selectedDiscoverGenre, query]);

  // Load more content for pagination
  const loadMoreDiscoverContent = async () => {
    if (!hasMore || loadingMore || discoverLoading || !selectedCatalog) return;

    setLoadingMore(true);
    const nextPage = page + 1;

    try {
      const moreResults = await catalogService.discoverContentFromCatalog(
        selectedCatalog.addonId,
        selectedCatalog.catalogId,
        selectedCatalog.type,
        selectedDiscoverGenre || undefined,
        nextPage
      );

      if (isMounted.current) {
        if (moreResults.length > 0) {
          setDiscoverResults(prev => [...prev, ...moreResults]);
          setPage(nextPage);
        } else {
          setHasMore(false);
        }
      }
    } catch (error) {
      logger.error('Failed to load more discover content:', error);
    } finally {
      if (isMounted.current) {
        setLoadingMore(false);
      }
    }
  };

  // DropUpMenu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StreamingContent | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [refreshFlag, setRefreshFlag] = React.useState(false);

  // Update isSaved and isWatched when selectedItem changes
  useEffect(() => {
    if (!selectedItem) return;
    (async () => {
      // Check if item is in library
      const items = await catalogService.getLibraryItems();
      const found = items.find((libItem: any) => libItem.id === selectedItem.id && libItem.type === selectedItem.type);
      setIsSaved(!!found);
      // Check watched status
      const val = await mmkvStorage.getItem(`watched:${selectedItem.type}:${selectedItem.id}`);
      setIsWatched(val === 'true');
    })();
  }, [selectedItem]);
  // Animation values
  const searchBarWidth = useSharedValue(width - 32);
  const searchBarOpacity = useSharedValue(1);
  const backButtonOpacity = useSharedValue(0);

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

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    loadRecentSearches();

    // Cleanup function to cancel pending searches on unmount
    return () => {
      debouncedSearch.cancel();
    };
  }, []);

  const animatedSearchBarStyle = useAnimatedStyle(() => {
    return {
      width: searchBarWidth.value,
      opacity: searchBarOpacity.value,
    };
  });

  const animatedBackButtonStyle = useAnimatedStyle(() => {
    return {
      opacity: backButtonOpacity.value,
      transform: [
        {
          translateX: interpolate(
            backButtonOpacity.value,
            [0, 1],
            [-20, 0]
          )
        }
      ]
    };
  });

  const handleSearchFocus = () => {
    // Animate search bar when focused
    searchBarWidth.value = withTiming(width - 80);
    backButtonOpacity.value = withTiming(1);
  };

  const handleSearchBlur = () => {
    if (!query) {
      // Only animate back if query is empty
      searchBarWidth.value = withTiming(width - 32);
      backButtonOpacity.value = withTiming(0);
    }
  };

  const handleBackPress = () => {
    Keyboard.dismiss();
    if (query) {
      setQuery('');
      setResults({ byAddon: [], allResults: [] });
      setSearched(false);
      setShowRecent(true);
      loadRecentSearches();
    } else {
      // Add a small delay to allow keyboard to dismiss smoothly before navigation
      if (Platform.OS === 'android') {
        setTimeout(() => {
          navigation.goBack();
        }, 100);
      } else {
        navigation.goBack();
      }
    }
  };

  const loadRecentSearches = async () => {
    try {
      const savedSearches = await mmkvStorage.getItem(RECENT_SEARCHES_KEY);
      if (savedSearches) {
        setRecentSearches(JSON.parse(savedSearches));
      }
    } catch (error) {
      logger.error('Failed to load recent searches:', error);
    }
  };

  const saveRecentSearch = async (searchQuery: string) => {
    try {
      setRecentSearches(prevSearches => {
        const newRecentSearches = [
          searchQuery,
          ...prevSearches.filter(s => s !== searchQuery)
        ].slice(0, MAX_RECENT_SEARCHES);

        // Save to AsyncStorage
        mmkvStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecentSearches));

        return newRecentSearches;
      });
    } catch (error) {
      logger.error('Failed to save recent search:', error);
    }
  };

  // Create a stable debounced search function using useMemo
  const debouncedSearch = useMemo(() => {
    return debounce(async (searchQuery: string) => {
      // Cancel any in-flight live search
      liveSearchHandle.current?.cancel();
      liveSearchHandle.current = null;
      performLiveSearch(searchQuery);
    }, 800);
  }, []); // Empty dependency array - create once and never recreate

  // Track focus state to strictly prevent updates when blurred (fixes Telemetry crash)
  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      return () => {
        isMounted.current = false;
        // Cancel any active searches immediately on blur
        if (liveSearchHandle.current) {
          liveSearchHandle.current.cancel();
          liveSearchHandle.current = null;
        }
        debouncedSearch.cancel();
      };
    }, [debouncedSearch])
  );

  // Live search implementation
  const performLiveSearch = async (searchQuery: string) => {
    // strict guard: don't search if unmounted or blurred
    if (!isMounted.current) return;

    if (!searchQuery || searchQuery.trim().length === 0) {
      setResults({ byAddon: [], allResults: [] });
      setSearching(false);
      return;
    }

    setSearching(true);
    setResults({ byAddon: [], allResults: [] });
    // Reset order rank for new search
    addonOrderRankRef.current = {};

    try {
      if (liveSearchHandle.current) {
        liveSearchHandle.current.cancel();
      }

      // Pre-fetch addon list to establish a stable order rank
      const addons = await catalogService.getAllAddons();
      // ... (rank logic) ...
      const rank: Record<string, number> = {};
      let rankCounter = 0;

      // Cinemeta first
      rank['com.linvo.cinemeta'] = rankCounter++;

      // Then others
      addons.forEach(addon => {
        if (addon.id !== 'com.linvo.cinemeta') {
          rank[addon.id] = rankCounter++;
        }
      });
      addonOrderRankRef.current = rank;

      const handle = catalogService.startLiveSearch(searchQuery, async (section: AddonSearchResults) => {
        // Prevent updates if component is unmounted or blurred
        if (!isMounted.current) return;

        // Append/update this addon section...
        setResults(prev => {
          // ... (existing update logic) ...
          if (!isMounted.current) return prev; // Extra guard inside setter

          const getRank = (id: string) => addonOrderRankRef.current[id] ?? Number.MAX_SAFE_INTEGER;
          // ... (same logic as before) ...
          const existingIndex = prev.byAddon.findIndex(s => s.addonId === section.addonId);

          if (existingIndex >= 0) {
            const copy = prev.byAddon.slice();
            copy[existingIndex] = section;
            return { byAddon: copy, allResults: prev.allResults };
          }

          // Insert new section
          const insertRank = getRank(section.addonId);
          let insertAt = prev.byAddon.length;
          for (let i = 0; i < prev.byAddon.length; i++) {
            if (getRank(prev.byAddon[i].addonId) > insertRank) {
              insertAt = i;
              break;
            }
          }

          const nextByAddon = [
            ...prev.byAddon.slice(0, insertAt),
            section,
            ...prev.byAddon.slice(insertAt)
          ];

          // Hide loading overlay once first section arrives
          if (prev.byAddon.length === 0) {
            setSearching(false);
          }

          return { byAddon: nextByAddon, allResults: prev.allResults };
        });

        try {
          await saveRecentSearch(searchQuery);
        } catch { }
      });

      liveSearchHandle.current = handle;
      await handle.done;

      if (isMounted.current) {
        setSearching(false);
      }
    } catch (error) {
      if (isMounted.current) {
        console.error('Live search error:', error);
        setSearching(false);
      }
    }
  };
  useEffect(() => {
    // Skip initial mount to prevent unnecessary operations
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadRecentSearches();
      return;
    }

    if (query.trim() && query.trim().length >= 2) {
      setSearching(true);
      setSearched(true);
      setShowRecent(false);
      debouncedSearch(query);
    } else if (query.trim().length < 2 && query.trim().length > 0) {
      // Show that we're waiting for more characters
      setSearching(false);
      setSearched(false);
      setShowRecent(false);
      setResults({ byAddon: [], allResults: [] });
    } else {
      // Cancel any pending search when query is cleared
      debouncedSearch.cancel();
      liveSearchHandle.current?.cancel();
      liveSearchHandle.current = null;
      setResults({ byAddon: [], allResults: [] });
      setSearched(false);
      setSearching(false);
      setShowRecent(true);
      loadRecentSearches();
    }

    // Cleanup function to cancel pending searches
    return () => {
      debouncedSearch.cancel();
    };
  }, [query]); // Removed debouncedSearch since it's now stable with useMemo

  const handleClearSearch = () => {
    setQuery('');
    liveSearchHandle.current?.cancel();
    liveSearchHandle.current = null;
    setResults({ byAddon: [], allResults: [] });
    setSearched(false);
    setShowRecent(true);
    loadRecentSearches();
    inputRef.current?.focus();
  };

  const renderRecentSearches = () => {
    if (!showRecent || recentSearches.length === 0) return null;

    return (
      <View
        style={styles.recentSearchesContainer}
      >
        <Text style={[styles.carouselTitle, { color: currentTheme.colors.white }]}>
          Recent Searches
        </Text>
        {recentSearches.map((search, index) => (
          <TouchableOpacity
            key={index}
            style={styles.recentSearchItem}
            onPress={() => {
              setQuery(search);
              Keyboard.dismiss();
            }}
          >
            <MaterialIcons
              name="history"
              size={20}
              color={currentTheme.colors.lightGray}
              style={styles.recentSearchIcon}
            />
            <Text style={[styles.recentSearchText, { color: currentTheme.colors.white }]}>
              {search}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const newRecentSearches = [...recentSearches];
                newRecentSearches.splice(index, 1);
                setRecentSearches(newRecentSearches);
                mmkvStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecentSearches));
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.recentSearchDeleteButton}
            >
              <MaterialIcons name="close" size={16} color={currentTheme.colors.lightGray} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Get available genres for the selected catalog
  const availableGenres = useMemo(() => {
    if (!selectedCatalog) return [];
    return selectedCatalog.genres;
  }, [selectedCatalog]);

  // Get catalogs filtered by selected type
  const filteredCatalogs = useMemo(() => {
    return discoverCatalogs.filter(catalog => catalog.type === selectedDiscoverType);
  }, [discoverCatalogs, selectedDiscoverType]);

  // Handle type selection
  const handleTypeSelect = (type: 'movie' | 'series') => {
    setSelectedDiscoverType(type);

    // Auto-select first catalog for the new type
    const catalogsForType = discoverCatalogs.filter(c => c.type === type);
    if (catalogsForType.length > 0) {
      const firstCatalog = catalogsForType[0];
      setSelectedCatalog(firstCatalog);

      // Auto-select first genre if available
      if (firstCatalog.genres.length > 0) {
        setSelectedDiscoverGenre(firstCatalog.genres[0]);
      } else {
        setSelectedDiscoverGenre(null);
      }
    } else {
      setSelectedCatalog(null);
      setSelectedDiscoverGenre(null);
    }

    typeSheetRef.current?.dismiss();
  };

  // Handle catalog selection
  const handleCatalogSelect = (catalog: DiscoverCatalog) => {
    setSelectedCatalog(catalog);
    setSelectedDiscoverGenre(null); // Reset genre when catalog changes
    catalogSheetRef.current?.dismiss();
  };

  // Handle genre selection
  const handleGenreSelect = (genre: string | null) => {
    setSelectedDiscoverGenre(genre);
    genreSheetRef.current?.dismiss();
  };

  // Render backdrop for bottom sheets
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Render discover section with catalog and genre selector chips
  const renderDiscoverSection = () => {
    if (query.trim().length > 0) return null;

    return (
      <View style={styles.discoverContainer}>
        {/* Section Header */}
        <View style={styles.discoverHeader}>
          <Text style={[styles.discoverTitle, { color: currentTheme.colors.white }]}>
            Discover
          </Text>
        </View>

        {/* Filter Chips Row */}
        {/* Filter Chips Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.discoverChipsScroll}
          contentContainerStyle={styles.discoverChipsContent}
        >
          {/* Type Selector Chip (Movie/TV Show) */}
          <TouchableOpacity
            style={[styles.discoverSelectorChip, { backgroundColor: currentTheme.colors.elevation2 }]}
            onPress={() => typeSheetRef.current?.present()}
          >
            <Text style={[styles.discoverSelectorText, { color: currentTheme.colors.white }]} numberOfLines={1}>
              {selectedDiscoverType === 'movie' ? 'Movies' : 'TV Shows'}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={currentTheme.colors.lightGray} />
          </TouchableOpacity>

          {/* Catalog Selector Chip */}
          <TouchableOpacity
            style={[styles.discoverSelectorChip, { backgroundColor: currentTheme.colors.elevation2 }]}
            onPress={() => catalogSheetRef.current?.present()}
          >
            <Text style={[styles.discoverSelectorText, { color: currentTheme.colors.white }]} numberOfLines={1}>
              {selectedCatalog ? selectedCatalog.catalogName : 'Select Catalog'}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={currentTheme.colors.lightGray} />
          </TouchableOpacity>

          {/* Genre Selector Chip - only show if catalog has genres */}
          {availableGenres.length > 0 && (
            <TouchableOpacity
              style={[styles.discoverSelectorChip, { backgroundColor: currentTheme.colors.elevation2 }]}
              onPress={() => genreSheetRef.current?.present()}
            >
              <Text style={[styles.discoverSelectorText, { color: currentTheme.colors.white }]} numberOfLines={1}>
                {selectedDiscoverGenre || 'All Genres'}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={currentTheme.colors.lightGray} />
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Selected filters summary */}
        {selectedCatalog && (
          <View style={styles.discoverFilterSummary}>
            <Text style={[styles.discoverFilterSummaryText, { color: currentTheme.colors.lightGray }]}>
              {selectedCatalog.addonName} • {selectedCatalog.type === 'movie' ? 'Movies' : 'TV Shows'}
              {selectedDiscoverGenre ? ` • ${selectedDiscoverGenre}` : ''}
            </Text>
          </View>
        )}

        {/* Discover Results */}
        {discoverLoading ? (
          <View style={styles.discoverLoadingContainer}>
            <ActivityIndicator size="large" color={currentTheme.colors.primary} />
            <Text style={[styles.discoverLoadingText, { color: currentTheme.colors.lightGray }]}>
              Discovering content...
            </Text>
          </View>
        ) : discoverResults.length > 0 ? (
          <View style={styles.discoverGrid}>
            {discoverResults.map((item, index) => (
              <SearchResultItem
                key={`discover-${item.id}-${index}`}
                item={item}
                index={index}
                navigation={navigation}
                setSelectedItem={setSelectedItem}
                setMenuVisible={setMenuVisible}
                currentTheme={currentTheme}
                isGrid={true}
              />
            ))}
            {loadingMore && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={currentTheme.colors.primary} />
              </View>
            )}
          </View>
        ) : discoverInitialized && !discoverLoading && selectedCatalog ? (
          <View style={styles.discoverEmptyContainer}>
            <MaterialIcons name="movie-filter" size={48} color={currentTheme.colors.lightGray} />
            <Text style={[styles.discoverEmptyText, { color: currentTheme.colors.lightGray }]}>
              No content found
            </Text>
            <Text style={[styles.discoverEmptySubtext, { color: currentTheme.colors.mediumGray }]}>
              Try a different genre or catalog
            </Text>
          </View>
        ) : !selectedCatalog && discoverInitialized ? (
          <View style={styles.discoverEmptyContainer}>
            <MaterialIcons name="touch-app" size={48} color={currentTheme.colors.lightGray} />
            <Text style={[styles.discoverEmptyText, { color: currentTheme.colors.lightGray }]}>
              Select a catalog to discover
            </Text>
            <Text style={[styles.discoverEmptySubtext, { color: currentTheme.colors.mediumGray }]}>
              Tap the catalog chip above to get started
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const SearchResultItem = ({ item, index, navigation, setSelectedItem, setMenuVisible, currentTheme, isGrid = false }: {
    item: StreamingContent;
    index: number;
    navigation: any;
    setSelectedItem: (item: StreamingContent) => void;
    setMenuVisible: (visible: boolean) => void;
    currentTheme: any;
    isGrid?: boolean;
  }) => {
    const [inLibrary, setInLibrary] = React.useState(!!item.inLibrary);
    const [watched, setWatched] = React.useState(false);

    // Calculate dimensions based on poster shape
    const { itemWidth, aspectRatio } = useMemo(() => {
      const shape = item.posterShape || 'poster';
      const baseHeight = HORIZONTAL_POSTER_HEIGHT;

      let w = HORIZONTAL_ITEM_WIDTH;
      let r = 2 / 3;

      if (isGrid) {
        // Grid Calculation: (Window Width - Padding) / Columns
        // Padding: 16 (left) + 16 (right) = 32
        // Gap: 12 (between items) * (columns - 1)
        const columns = isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 3;
        const totalPadding = 32;
        const totalGap = 12 * (columns - 1);
        const availableWidth = width - totalPadding - totalGap;
        w = availableWidth / columns;
      } else {
        if (shape === 'landscape') {
          r = 16 / 9;
          w = baseHeight * r;
        } else if (shape === 'square') {
          r = 1;
          w = baseHeight;
        }
      }
      return { itemWidth: w, aspectRatio: r };
    }, [item.posterShape, isGrid]);

    React.useEffect(() => {
      const updateWatched = () => {
        mmkvStorage.getItem(`watched:${item.type}:${item.id}`).then(val => setWatched(val === 'true'));
      };
      updateWatched();
      const sub = DeviceEventEmitter.addListener('watchedStatusChanged', updateWatched);
      return () => sub.remove();
    }, [item.id, item.type]);
    React.useEffect(() => {
      const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
        const found = items.find((libItem) => libItem.id === item.id && libItem.type === item.type);
        setInLibrary(!!found);
      });
      return () => unsubscribe();
    }, [item.id, item.type]);

    return (
      <TouchableOpacity
        style={[
          styles.horizontalItem,
          { width: itemWidth },
          isGrid && styles.discoverGridItem
        ]}
        onPress={() => {
          navigation.navigate('Metadata', { id: item.id, type: item.type });
        }}
        onLongPress={() => {
          setSelectedItem(item);
          setMenuVisible(true);
          // Do NOT toggle refreshFlag here
        }}
        delayLongPress={300}
        activeOpacity={0.7}
      >
        <View style={[styles.horizontalItemPosterContainer, {
          width: itemWidth,
          height: undefined, // Let aspect ratio control height or keep fixed height with width? 
          // Actually, since we derived width from fixed height, we can keep height fixed or use aspect.
          // Using aspect ratio is safer if baseHeight changes.
          aspectRatio: aspectRatio,
          backgroundColor: currentTheme.colors.darkBackground,
          borderColor: 'rgba(255,255,255,0.05)'
        }]}>
          <FastImage
            source={{ uri: item.poster || PLACEHOLDER_POSTER }}
            style={styles.horizontalItemPoster}
            resizeMode={FastImage.resizeMode.cover}
          />
          {/* Bookmark and watched icons top right, bookmark to the left of watched */}
          {inLibrary && (
            <View style={[styles.libraryBadge, { position: 'absolute', top: 8, right: 36, backgroundColor: 'transparent', zIndex: 2 }]}>
              <Feather name="bookmark" size={16} color={currentTheme.colors.white} />
            </View>
          )}
          {watched && (
            <View style={[styles.watchedIndicator, { position: 'absolute', top: 8, right: 8, backgroundColor: 'transparent', zIndex: 2 }]}>
              <MaterialIcons name="check-circle" size={20} color={currentTheme.colors.success || '#4CAF50'} />
            </View>
          )}
          {/* Rating removed per user request */}
        </View>
        <Text
          style={[
            styles.horizontalItemTitle,
            {
              color: currentTheme.colors.white,
              fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 14,
              lineHeight: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 18,
            }
          ]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {item.year && (
          <Text style={[styles.yearText, { color: currentTheme.colors.mediumGray, fontSize: isTV ? 12 : isLargeTablet ? 11 : isTablet ? 10 : 12 }]}>
            {item.year}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const hasResultsToShow = useMemo(() => {
    return results.byAddon.length > 0;
  }, [results]);

  // Memoized addon section to prevent re-rendering unchanged sections
  const AddonSection = React.memo(({
    addonGroup,
    addonIndex
  }: {
    addonGroup: AddonSearchResults;
    addonIndex: number;
  }) => {
    const movieResults = useMemo(() =>
      addonGroup.results.filter(item => item.type === 'movie'),
      [addonGroup.results]
    );
    const seriesResults = useMemo(() =>
      addonGroup.results.filter(item => item.type === 'series'),
      [addonGroup.results]
    );
    const otherResults = useMemo(() =>
      addonGroup.results.filter(item => item.type !== 'movie' && item.type !== 'series'),
      [addonGroup.results]
    );

    return (
      <View>
        {/* Addon Header */}
        <View style={styles.addonHeaderContainer}>
          <Text style={[styles.addonHeaderText, { color: currentTheme.colors.white }]}>
            {addonGroup.addonName}
          </Text>
          <View style={[styles.addonHeaderBadge, { backgroundColor: currentTheme.colors.elevation2 }]}>
            <Text style={[styles.addonHeaderBadgeText, { color: currentTheme.colors.lightGray }]}>
              {addonGroup.results.length}
            </Text>
          </View>
        </View>

        {/* Movies */}
        {movieResults.length > 0 && (
          <View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]}>
            <Text style={[
              styles.carouselSubtitle,
              {
                color: currentTheme.colors.lightGray,
                fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14,
                marginBottom: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 8,
                paddingHorizontal: isTV ? 24 : isLargeTablet ? 20 : isTablet ? 16 : 16
              }
            ]}>
              Movies ({movieResults.length})
            </Text>
            <FlatList
              data={movieResults}
              renderItem={({ item, index }) => (
                <SearchResultItem
                  item={item}
                  index={index}
                  navigation={navigation}
                  setSelectedItem={setSelectedItem}
                  setMenuVisible={setMenuVisible}
                  currentTheme={currentTheme}
                />
              )}
              keyExtractor={item => `${addonGroup.addonId}-movie-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalListContent}
            />
          </View>
        )}

        {/* TV Shows */}
        {seriesResults.length > 0 && (
          <View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]}>
            <Text style={[
              styles.carouselSubtitle,
              {
                color: currentTheme.colors.lightGray,
                fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14,
                marginBottom: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 8,
                paddingHorizontal: isTV ? 24 : isLargeTablet ? 20 : isTablet ? 16 : 16
              }
            ]}>
              TV Shows ({seriesResults.length})
            </Text>
            <FlatList
              data={seriesResults}
              renderItem={({ item, index }) => (
                <SearchResultItem
                  item={item}
                  index={index}
                  navigation={navigation}
                  setSelectedItem={setSelectedItem}
                  setMenuVisible={setMenuVisible}
                  currentTheme={currentTheme}
                />
              )}
              keyExtractor={item => `${addonGroup.addonId}-series-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalListContent}
            />
          </View>
        )}

        {/* Other types */}
        {otherResults.length > 0 && (
          <View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]}>
            <Text style={[
              styles.carouselSubtitle,
              {
                color: currentTheme.colors.lightGray,
                fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14,
                marginBottom: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 8,
                paddingHorizontal: isTV ? 24 : isLargeTablet ? 20 : isTablet ? 16 : 16
              }
            ]}>
              {otherResults[0].type.charAt(0).toUpperCase() + otherResults[0].type.slice(1)} ({otherResults.length})
            </Text>
            <FlatList
              data={otherResults}
              renderItem={({ item, index }) => (
                <SearchResultItem
                  item={item}
                  index={index}
                  navigation={navigation}
                  setSelectedItem={setSelectedItem}
                  setMenuVisible={setMenuVisible}
                  currentTheme={currentTheme}
                />
              )}
              keyExtractor={item => `${addonGroup.addonId}-${item.type}-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalListContent}
            />
          </View>
        )}
      </View>
    );
  }, (prev, next) => {
    // Only re-render if this section's reference changed
    return prev.addonGroup === next.addonGroup && prev.addonIndex === next.addonIndex;
  });

  // Set up listeners for watched status and library updates
  // These will trigger re-renders in individual SearchResultItem components
  useEffect(() => {
    const watchedSub = DeviceEventEmitter.addListener('watchedStatusChanged', () => {
      // Individual items will handle their own watched status updates
      // No need to force a full re-render of all results
    });
    const librarySub = catalogService.subscribeToLibraryUpdates(() => {
      // Individual items will handle their own library status updates
      // No need to force a full re-render of all results
    });

    return () => {
      watchedSub.remove();
      librarySub();
    };
  }, []);

  return (
    <View
      style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* ScreenHeader Component */}
      <ScreenHeader
        title="Search"
        isTablet={isTV || isLargeTablet || isTablet}
      >
        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <View style={[
            styles.searchBarWrapper,
            { width: '100%' }
          ]}>
            <View style={[
              styles.searchBar,
              {
                backgroundColor: currentTheme.colors.elevation2,
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
              }
            ]}>
              <MaterialIcons
                name="search"
                size={24}
                color={currentTheme.colors.lightGray}
                style={styles.searchIcon}
              />
              <TextInput
                style={[
                  styles.searchInput,
                  { color: currentTheme.colors.white }
                ]}
                placeholder="Search movies, shows..."
                placeholderTextColor={currentTheme.colors.lightGray}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                keyboardAppearance="dark"
                ref={inputRef}
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={handleClearSearch}
                  style={styles.clearButton}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <MaterialIcons
                    name="close"
                    size={20}
                    color={currentTheme.colors.lightGray}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </ScreenHeader>

      {/* Content Container */}
      <View style={[styles.contentContainer, { backgroundColor: currentTheme.colors.darkBackground }]}>
        {searching ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <LoadingSpinner
              size="large"
              offsetY={-60}
            />
          </View>
        ) : query.trim().length === 1 ? (
          <View
            style={styles.emptyContainer}
          >
            <MaterialIcons
              name="search"
              size={64}
              color={currentTheme.colors.lightGray}
            />
            <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>
              Keep typing...
            </Text>
            <Text style={[styles.emptySubtext, { color: currentTheme.colors.lightGray }]}>
              Type at least 2 characters to search
            </Text>
          </View>
        ) : searched && !hasResultsToShow ? (
          <View
            style={styles.emptyContainer}
          >
            <MaterialIcons
              name="search-off"
              size={64}
              color={currentTheme.colors.lightGray}
            />
            <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>
              No results found
            </Text>
            <Text style={[styles.emptySubtext, { color: currentTheme.colors.lightGray }]}>
              Try different keywords or check your spelling
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              // Only paginate if query is empty (Discover mode)
              if (query.trim().length > 0 || !settings.showDiscover) return;

              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 500;

              if (isCloseToBottom) {
                loadMoreDiscoverContent();
              }
            }}
          >
            {!query.trim() && renderRecentSearches()}
            {!query.trim() && settings.showDiscover && renderDiscoverSection()}

            {/* Render results grouped by addon using memoized component */}
            {results.byAddon.map((addonGroup, addonIndex) => (
              <AddonSection
                key={addonGroup.addonId}
                addonGroup={addonGroup}
                addonIndex={addonIndex}
              />
            ))}
          </ScrollView>
        )}
      </View>
      {/* DropUpMenu integration for search results */}
      {selectedItem && (
        <DropUpMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          item={selectedItem}
          isSaved={isSaved}
          isWatched={isWatched}
          onOptionSelect={async (option: string) => {
            if (!selectedItem) return;
            switch (option) {
              case 'share': {
                let url = '';
                if (selectedItem.id) {
                  url = `https://www.imdb.com/title/${selectedItem.id}/`;
                }
                const message = `${selectedItem.name}\n${url}`;
                Share.share({ message, url, title: selectedItem.name });
                break;
              }
              case 'library': {
                if (isSaved) {
                  await catalogService.removeFromLibrary(selectedItem.type, selectedItem.id);
                  setIsSaved(false);
                } else {
                  await catalogService.addToLibrary(selectedItem);
                  setIsSaved(true);
                }
                break;
              }
              case 'watched': {
                const key = `watched:${selectedItem.type}:${selectedItem.id}`;
                const newWatched = !isWatched;
                await mmkvStorage.setItem(key, newWatched ? 'true' : 'false');
                setIsWatched(newWatched);
                break;
              }
              default:
                break;
            }
          }}
        />
      )}

      {/* Catalog Selection Bottom Sheet */}
      <BottomSheetModal
        ref={catalogSheetRef}
        index={0}
        snapPoints={catalogSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={true}
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: currentTheme.colors.darkGray || '#0A0C0C',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
        handleIndicatorStyle={{
          backgroundColor: currentTheme.colors.mediumGray,
        }}
      >
        <View style={[styles.bottomSheetHeader, { backgroundColor: currentTheme.colors.darkGray || '#0A0C0C' }]}>
          <Text style={[styles.bottomSheetTitle, { color: currentTheme.colors.white }]}>
            Select Catalog
          </Text>
          <TouchableOpacity onPress={() => catalogSheetRef.current?.dismiss()}>
            <MaterialIcons name="close" size={24} color={currentTheme.colors.lightGray} />
          </TouchableOpacity>
        </View>
        <BottomSheetScrollView
          style={{ backgroundColor: currentTheme.colors.darkGray || '#0A0C0C' }}
          contentContainerStyle={styles.bottomSheetContent}
        >
          {filteredCatalogs.map((catalog, index) => (
            <TouchableOpacity
              key={`${catalog.addonId}-${catalog.catalogId}-${index}`}
              style={[
                styles.bottomSheetItem,
                selectedCatalog?.catalogId === catalog.catalogId &&
                selectedCatalog?.addonId === catalog.addonId &&
                styles.bottomSheetItemSelected
              ]}
              onPress={() => handleCatalogSelect(catalog)}
            >
              <View style={styles.bottomSheetItemContent}>
                <Text style={[styles.bottomSheetItemTitle, { color: currentTheme.colors.white }]}>
                  {catalog.catalogName}
                </Text>
                <Text style={[styles.bottomSheetItemSubtitle, { color: currentTheme.colors.lightGray }]}>
                  {catalog.addonName} • {catalog.type === 'movie' ? 'Movies' : 'TV Shows'}
                  {catalog.genres.length > 0 ? ` • ${catalog.genres.length} genres` : ''}
                </Text>
              </View>
              {selectedCatalog?.catalogId === catalog.catalogId &&
                selectedCatalog?.addonId === catalog.addonId && (
                  <MaterialIcons name="check" size={24} color={currentTheme.colors.primary} />
                )}
            </TouchableOpacity>
          ))}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Genre Selection Bottom Sheet */}
      <BottomSheetModal
        ref={genreSheetRef}
        index={0}
        snapPoints={genreSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={true}
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: currentTheme.colors.darkGray || '#0A0C0C',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
        handleIndicatorStyle={{
          backgroundColor: currentTheme.colors.mediumGray,
        }}
      >
        <View style={[styles.bottomSheetHeader, { backgroundColor: currentTheme.colors.darkGray || '#0A0C0C' }]}>
          <Text style={[styles.bottomSheetTitle, { color: currentTheme.colors.white }]}>
            Select Genre
          </Text>
          <TouchableOpacity onPress={() => genreSheetRef.current?.dismiss()}>
            <MaterialIcons name="close" size={24} color={currentTheme.colors.lightGray} />
          </TouchableOpacity>
        </View>
        <BottomSheetScrollView
          style={{ backgroundColor: currentTheme.colors.darkGray || '#0A0C0C' }}
          contentContainerStyle={styles.bottomSheetContent}
        >
          {/* All Genres option */}
          <TouchableOpacity
            style={[
              styles.bottomSheetItem,
              !selectedDiscoverGenre && styles.bottomSheetItemSelected
            ]}
            onPress={() => handleGenreSelect(null)}
          >
            <View style={styles.bottomSheetItemContent}>
              <Text style={[styles.bottomSheetItemTitle, { color: currentTheme.colors.white }]}>
                All Genres
              </Text>
              <Text style={[styles.bottomSheetItemSubtitle, { color: currentTheme.colors.lightGray }]}>
                Show all content
              </Text>
            </View>
            {!selectedDiscoverGenre && (
              <MaterialIcons name="check" size={24} color={currentTheme.colors.primary} />
            )}
          </TouchableOpacity>

          {/* Genre options */}
          {availableGenres.map((genre, index) => (
            <TouchableOpacity
              key={`${genre}-${index}`}
              style={[
                styles.bottomSheetItem,
                selectedDiscoverGenre === genre && styles.bottomSheetItemSelected
              ]}
              onPress={() => handleGenreSelect(genre)}
            >
              <View style={styles.bottomSheetItemContent}>
                <Text style={[styles.bottomSheetItemTitle, { color: currentTheme.colors.white }]}>
                  {genre}
                </Text>
              </View>
              {selectedDiscoverGenre === genre && (
                <MaterialIcons name="check" size={24} color={currentTheme.colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Type Selection Bottom Sheet */}
      <BottomSheetModal
        ref={typeSheetRef}
        index={0}
        snapPoints={typeSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={true}
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: currentTheme.colors.darkGray || '#0A0C0C',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
        handleIndicatorStyle={{
          backgroundColor: currentTheme.colors.mediumGray,
        }}
      >
        <View style={[styles.bottomSheetHeader, { backgroundColor: currentTheme.colors.darkGray || '#0A0C0C' }]}>
          <Text style={[styles.bottomSheetTitle, { color: currentTheme.colors.white }]}>
            Select Type
          </Text>
          <TouchableOpacity onPress={() => typeSheetRef.current?.dismiss()}>
            <MaterialIcons name="close" size={24} color={currentTheme.colors.lightGray} />
          </TouchableOpacity>
        </View>
        <BottomSheetScrollView
          style={{ backgroundColor: currentTheme.colors.darkGray || '#0A0C0C' }}
          contentContainerStyle={styles.bottomSheetContent}
        >
          {/* Movies option */}
          <TouchableOpacity
            style={[
              styles.bottomSheetItem,
              selectedDiscoverType === 'movie' && styles.bottomSheetItemSelected
            ]}
            onPress={() => handleTypeSelect('movie')}
          >
            <View style={styles.bottomSheetItemContent}>
              <Text style={[styles.bottomSheetItemTitle, { color: currentTheme.colors.white }]}>
                Movies
              </Text>
              <Text style={[styles.bottomSheetItemSubtitle, { color: currentTheme.colors.lightGray }]}>
                Browse movie catalogs
              </Text>
            </View>
            {selectedDiscoverType === 'movie' && (
              <MaterialIcons name="check" size={24} color={currentTheme.colors.primary} />
            )}
          </TouchableOpacity>

          {/* TV Shows option */}
          <TouchableOpacity
            style={[
              styles.bottomSheetItem,
              selectedDiscoverType === 'series' && styles.bottomSheetItemSelected
            ]}
            onPress={() => handleTypeSelect('series')}
          >
            <View style={styles.bottomSheetItemContent}>
              <Text style={[styles.bottomSheetItemTitle, { color: currentTheme.colors.white }]}>
                TV Shows
              </Text>
              <Text style={[styles.bottomSheetItemSubtitle, { color: currentTheme.colors.lightGray }]}>
                Browse TV series catalogs
              </Text>
            </View>
            {selectedDiscoverType === 'series' && (
              <MaterialIcons name="check" size={24} color={currentTheme.colors.primary} />
            )}
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 0,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    height: 48,
  },
  searchBarWrapper: {
    flex: 1,
    height: 48,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: '100%',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  clearButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: isTablet ? 120 : 100, // Extra padding for tablet bottom nav
    paddingHorizontal: 0,
  },
  carouselContainer: {
    marginBottom: isTablet ? 32 : 24,
  },
  carouselTitle: {
    fontSize: isTablet ? 20 : 18,
    fontWeight: '700',
    marginBottom: isTablet ? 16 : 12,
    paddingHorizontal: 16,
  },
  carouselSubtitle: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '600',
    marginBottom: isTablet ? 12 : 8,
    paddingHorizontal: 16,
  },
  addonHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: isTablet ? 16 : 12,
    marginTop: isTablet ? 24 : 16,
    marginBottom: isTablet ? 8 : 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  addonHeaderIcon: {
    // removed icon
  },
  addonHeaderText: {
    fontSize: isTablet ? 18 : 16,
    fontWeight: '700',
    flex: 1,
  },
  addonHeaderBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  addonHeaderBadgeText: {
    fontSize: isTablet ? 12 : 11,
    fontWeight: '600',
  },
  horizontalListContent: {
    paddingHorizontal: 16,
  },
  horizontalItem: {
    width: HORIZONTAL_ITEM_WIDTH,
    marginRight: 16,
  },
  horizontalItemPosterContainer: {
    width: HORIZONTAL_ITEM_WIDTH,
    height: HORIZONTAL_POSTER_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
  },
  horizontalItemPoster: {
    width: '100%',
    height: '100%',
  },
  horizontalItemTitle: {
    fontSize: isTablet ? 12 : 14,
    fontWeight: '600',
    lineHeight: isTablet ? 16 : 18,
    textAlign: 'left',
  },
  yearText: {
    fontSize: isTablet ? 10 : 12,
    marginTop: 2,
  },
  recentSearchesContainer: {
    paddingHorizontal: 16,
    paddingBottom: isTablet ? 24 : 16,
    paddingTop: isTablet ? 12 : 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: isTablet ? 16 : 8,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isTablet ? 12 : 10,
    paddingHorizontal: 16,
    marginVertical: 1,
  },
  recentSearchIcon: {
    marginRight: 12,
  },
  recentSearchText: {
    fontSize: 16,
    flex: 1,
  },
  recentSearchDeleteButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: isTablet ? 64 : 32,
    paddingBottom: isTablet ? 120 : 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  skeletonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 16,
    justifyContent: 'space-between',
  },
  skeletonVerticalItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  skeletonPoster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 12,
  },
  skeletonItemDetails: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  skeletonMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  skeletonTitle: {
    height: 20,
    width: '80%',
    marginBottom: 8,
    borderRadius: 4,
  },
  skeletonMeta: {
    height: 14,
    width: '30%',
    borderRadius: 4,
  },
  skeletonSectionHeader: {
    height: 24,
    width: '40%',
    marginBottom: 16,
    borderRadius: 4,
  },
  ratingContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ratingText: {
    fontSize: isTablet ? 9 : 10,
    fontWeight: '700',
    marginLeft: 2,
  },
  simpleAnimationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  simpleAnimationContent: {
    alignItems: 'center',
  },
  spinnerContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  simpleAnimationText: {
    fontSize: 16,
    fontWeight: '600',
  },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 12,
    padding: 2,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  libraryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 8,
    padding: 4,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  // Discover section styles
  discoverContainer: {
    paddingTop: isTablet ? 16 : 12,
    paddingBottom: isTablet ? 24 : 16,
  },
  discoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: isTablet ? 16 : 12,
    gap: 8,
  },
  discoverTitle: {
    fontSize: isTablet ? 22 : 20,
    fontWeight: '700',
  },
  discoverTypeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: isTablet ? 16 : 12,
    gap: 12,
  },
  discoverTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  discoverTypeText: {
    fontSize: isTablet ? 15 : 14,
    fontWeight: '600',
  },
  discoverGenreScroll: {
    marginBottom: isTablet ? 20 : 16,
  },
  discoverGenreContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  discoverGenreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
  },
  discoverGenreChipActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  discoverGenreText: {
    fontSize: isTablet ? 14 : 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  discoverGenreTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  discoverLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  discoverLoadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  discoverAddonSection: {
    marginBottom: isTablet ? 28 : 20,
  },
  discoverAddonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: isTablet ? 12 : 8,
  },
  discoverAddonName: {
    fontSize: isTablet ? 16 : 15,
    fontWeight: '600',
    flex: 1,
  },
  discoverAddonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  discoverAddonBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  discoverEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  discoverEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  discoverEmptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  discoverGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12, // vertical and horizontal gap
  },
  discoverGridItem: {
    marginRight: 0, // Override horizontalItem margin
    marginBottom: 0, // Gap handles this now
  },
  loadingMoreContainer: {
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // New chip-based discover styles
  discoverChipsScroll: {
    marginBottom: isTablet ? 12 : 10,
    flexGrow: 0,
  },
  discoverChipsContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  discoverSelectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  discoverSelectorText: {
    fontSize: isTablet ? 14 : 13,
    fontWeight: '600',
  },
  discoverFilterSummary: {
    paddingHorizontal: 16,
    marginBottom: isTablet ? 16 : 12,
  },
  discoverFilterSummaryText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Bottom sheet styles
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  bottomSheetContent: {
    paddingHorizontal: 12,
    paddingBottom: 40,
  },
  bottomSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 2,
  },
  bottomSheetItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bottomSheetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bottomSheetItemContent: {
    flex: 1,
  },
  bottomSheetItemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSheetItemSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
});

export default SearchScreen;
