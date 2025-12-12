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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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

  const [hasAddons, setHasAddons] = useState<boolean | null>(null);

  // Check for search-capable addons on focus
  useEffect(() => {
    const checkAddons = async () => {
      try {
        const addons = await catalogService.getAllAddons();
        // Check if any addon supports search (catalog resource with extra search or just any addon)
        // For now, simpler consistent check: just if any addon is installed
        setHasAddons(addons.length > 0);
      } catch (error) {
        setHasAddons(false);
      }
    };

    checkAddons();
    const unsubscribe = navigation.addListener('focus', checkAddons);
    return unsubscribe;
  }, [navigation]);

  // Create a stable debounced search function using useMemo
  const debouncedSearch = useMemo(() => {
    return debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        // Cancel any, in-flight live search
        liveSearchHandle.current?.cancel();
        liveSearchHandle.current = null;
        setResults({ byAddon: [], allResults: [] });
        setSearching(false);
        return;
      }

      // Block search if no addons
      if (hasAddons === false) {
        setSearching(false);
        return;
      }

      // Cancel prior live search
      liveSearchHandle.current?.cancel();
      setResults({ byAddon: [], allResults: [] });
      setSearching(true);

      logger.info('Starting live search for:', searchQuery);
      // Preload addon order to keep sections sorted by installation order
      try {
        const addons = await catalogService.getAllAddons();
        const rank: Record<string, number> = {};
        addons.forEach((a, idx) => { rank[a.id] = idx; });
        addonOrderRankRef.current = rank;
      } catch { }

      const handle = catalogService.startLiveSearch(searchQuery, async (section: AddonSearchResults) => {
        // Append/update this addon section immediately with minimal changes
        setResults(prev => {
          const rank = addonOrderRankRef.current;
          const getRank = (id: string) => rank[id] ?? Number.MAX_SAFE_INTEGER;

          const existingIndex = prev.byAddon.findIndex(s => s.addonId === section.addonId);

          if (existingIndex >= 0) {
            // Update existing section in-place (preserve order and other sections)
            const copy = prev.byAddon.slice();
            copy[existingIndex] = section;
            return { byAddon: copy, allResults: prev.allResults };
          }

          // Insert new section at correct position based on rank
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

        // Save to recents after first result batch
        try {
          await saveRecentSearch(searchQuery);
        } catch { }
      });
      liveSearchHandle.current = handle;
    }, 800);
  }, [hasAddons]); // Re-create if hasAddons changes

  useEffect(() => {
    // Skip initial mount to prevent unnecessary operations
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadRecentSearches();
      return;
    }

    if (query.trim() && query.trim().length >= 2) {
      // Don't set searching state if no addons, to avoid flicker
      if (hasAddons !== false) {
        setSearching(true);
        setSearched(true);
        setShowRecent(false);
      }
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
  }, [query, hasAddons]); // Added hasAddons dependency

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
      <Animated.View
        style={styles.recentSearchesContainer}
        entering={FadeIn.duration(300)}
      >
        <Text style={[styles.carouselTitle, { color: currentTheme.colors.white }]}>
          Recent Searches
        </Text>
        {recentSearches.map((search, index) => (
          <AnimatedTouchable
            key={index}
            style={styles.recentSearchItem}
            onPress={() => {
              setQuery(search);
              Keyboard.dismiss();
            }}
            entering={FadeIn.duration(300).delay(index * 50)}
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
          </AnimatedTouchable>
        ))}
      </Animated.View>
    );
  };

  const SearchResultItem = ({ item, index, navigation, setSelectedItem, setMenuVisible, currentTheme }: {
    item: StreamingContent;
    index: number;
    navigation: any;
    setSelectedItem: (item: StreamingContent) => void;
    setMenuVisible: (visible: boolean) => void;
    currentTheme: any;
  }) => {
    const [inLibrary, setInLibrary] = React.useState(!!item.inLibrary);
    const [watched, setWatched] = React.useState(false);
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
      <AnimatedTouchable
        style={styles.horizontalItem}
        onPress={() => {
          navigation.navigate('Metadata', { id: item.id, type: item.type });
        }}
        onLongPress={() => {
          setSelectedItem(item);
          setMenuVisible(true);
          // Do NOT toggle refreshFlag here
        }}
        delayLongPress={300}
        entering={FadeIn.duration(300).delay(index * 50)}
        activeOpacity={0.7}
      >
        <View style={[styles.horizontalItemPosterContainer, {
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
          {item.imdbRating && (
            <View style={styles.ratingContainer}>
              <MaterialIcons name="star" size={12} color="#FFC107" />
              <Text style={[styles.ratingText, { color: currentTheme.colors.white }]}>
                {item.imdbRating}
              </Text>
            </View>
          )}
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
      </AnimatedTouchable>
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
      <Animated.View entering={FadeIn.duration(300).delay(addonIndex * 50)}>
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
          <Animated.View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]} entering={FadeIn.duration(300)}>
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
          </Animated.View>
        )}

        {/* TV Shows */}
        {seriesResults.length > 0 && (
          <Animated.View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]} entering={FadeIn.duration(300)}>
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
          </Animated.View>
        )}

        {/* Other types */}
        {otherResults.length > 0 && (
          <Animated.View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]} entering={FadeIn.duration(300)}>
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
          </Animated.View>
        )}
      </Animated.View>
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
    <Animated.View
      style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}
      entering={Platform.OS === 'android' ? undefined : FadeIn.duration(350)}
      exiting={Platform.OS === 'android' ?
        FadeOut.duration(200).withInitialValues({ opacity: 1 }) :
        FadeOut.duration(250)
      }
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
        ) : hasAddons === false ? (
          <Animated.View
            style={styles.emptyContainer}
            entering={FadeIn.duration(300)}
          >
            <MaterialIcons
              name="extension-off"
              size={64}
              color={currentTheme.colors.lightGray}
            />
            <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>
              No Addons Installed
            </Text>
            <Text style={[styles.emptySubtext, { color: currentTheme.colors.lightGray, marginBottom: 24 }]}>
              Install addons to enable search functionality
            </Text>
          </Animated.View>
        ) : query.trim().length === 1 ? (
          <Animated.View
            style={styles.emptyContainer}
            entering={FadeIn.duration(300)}
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
          </Animated.View>
        ) : searched && !hasResultsToShow ? (
          <Animated.View
            style={styles.emptyContainer}
            entering={FadeIn.duration(300)}
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
          </Animated.View>
        ) : (
          <Animated.ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            entering={FadeIn.duration(300)}
            showsVerticalScrollIndicator={false}
          >
            {!query.trim() && renderRecentSearches()}
            {/* Render results grouped by addon using memoized component */}
            {results.byAddon.map((addonGroup, addonIndex) => (
              <AddonSection
                key={addonGroup.addonId}
                addonGroup={addonGroup}
                addonIndex={addonIndex}
              />
            ))}
          </Animated.ScrollView>
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
    </Animated.View>
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
    paddingHorizontal: isTablet ? 16 : 12,
    paddingRight: isTablet ? 12 : 8,
  },
  horizontalItem: {
    width: HORIZONTAL_ITEM_WIDTH,
    marginRight: isTablet ? 16 : 12,
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
});

export default SearchScreen;
