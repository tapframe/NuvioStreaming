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
import { MaterialIcons } from '@expo/vector-icons';
import { catalogService, StreamingContent } from '../services/catalogService';
import { Image } from 'expo-image';
import debounce from 'lodash/debounce';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { 
  FadeIn, 
  FadeOut, 
  SlideInRight, 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  interpolate,
  withSpring,
  withDelay,
  ZoomIn
} from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');
const HORIZONTAL_ITEM_WIDTH = width * 0.3;
const HORIZONTAL_POSTER_HEIGHT = HORIZONTAL_ITEM_WIDTH * 1.5;
const POSTER_WIDTH = 90;
const POSTER_HEIGHT = 135;
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
  const [results, setResults] = useState<StreamingContent[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(true);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { currentTheme } = useTheme();
  
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
      setResults([]);
      setSearched(false);
      setShowRecent(true);
      loadRecentSearches();
    } else {
      navigation.goBack();
    }
  };

  const loadRecentSearches = async () => {
    try {
      const savedSearches = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (savedSearches) {
        setRecentSearches(JSON.parse(savedSearches));
      }
    } catch (error) {
      logger.error('Failed to load recent searches:', error);
    }
  };

  const saveRecentSearch = async (searchQuery: string) => {
    try {
      const newRecentSearches = [
        searchQuery,
        ...recentSearches.filter(s => s !== searchQuery)
      ].slice(0, MAX_RECENT_SEARCHES);
      
      setRecentSearches(newRecentSearches);
      await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecentSearches));
    } catch (error) {
      logger.error('Failed to save recent search:', error);
    }
  };

  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setSearching(false);
        return;
      }

      try {
        const searchResults = await catalogService.searchContentCinemeta(searchQuery);
        setResults(searchResults);
        if (searchResults.length > 0) {
          await saveRecentSearch(searchQuery);
        }
      } catch (error) {
        logger.error('Search failed:', error);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200),
    [recentSearches]
  );

  useEffect(() => {
    if (query.trim()) {
      setSearching(true);
      setSearched(true);
      setShowRecent(false);
      debouncedSearch(query);
    } else {
      setResults([]);
      setSearched(false);
      setShowRecent(true);
      loadRecentSearches();
    }
  }, [query]);

  const handleClearSearch = () => {
    setQuery('');
    setResults([]);
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
                AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecentSearches));
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

  const renderHorizontalItem = ({ item, index }: { item: StreamingContent, index: number }) => {
    return (
      <AnimatedTouchable
        style={styles.horizontalItem}
        onPress={() => {
          navigation.navigate('Metadata', { id: item.id, type: item.type });
        }}
        entering={FadeIn.duration(500).delay(index * 100)}
        activeOpacity={0.7}
      >
        <View style={[styles.horizontalItemPosterContainer, { 
          backgroundColor: currentTheme.colors.darkBackground,
          borderColor: 'rgba(255,255,255,0.05)'
        }]}>
          <Image
            source={{ uri: item.poster || PLACEHOLDER_POSTER }}
            style={styles.horizontalItemPoster}
            contentFit="cover"
            transition={300}
          />
          <View style={styles.itemTypeContainer}>
            <Text style={[styles.itemTypeText, { color: currentTheme.colors.white }]}>
              {item.type === 'movie' ? 'MOVIE' : 'SERIES'}
            </Text>
          </View>
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
          style={[styles.horizontalItemTitle, { color: currentTheme.colors.white }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {item.year && (
          <Text style={[styles.yearText, { color: currentTheme.colors.mediumGray }]}>
            {item.year}
          </Text>
        )}
      </AnimatedTouchable>
    );
  };
  
  const movieResults = useMemo(() => {
    return results.filter(item => item.type === 'movie');
  }, [results]);

  const seriesResults = useMemo(() => {
    return results.filter(item => item.type === 'series');
  }, [results]);

  const hasResultsToShow = useMemo(() => {
     return movieResults.length > 0 || seriesResults.length > 0;
  }, [movieResults, seriesResults]);

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const headerHeight = headerBaseHeight + topSpacing + 60;

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      
      {/* Fixed position header background to prevent shifts */}
      <View style={[styles.headerBackground, { 
        height: headerHeight,
        backgroundColor: currentTheme.colors.darkBackground 
      }]} />
      
      <View style={{ flex: 1 }}>
        {/* Header Section with proper top spacing */}
        <View style={[styles.header, { height: headerHeight, paddingTop: topSpacing }]}>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.white }]}>Search</Text>
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
                  autoFocus
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
        </View>

        {/* Content Container */}
        <View style={[styles.contentContainer, { backgroundColor: currentTheme.colors.darkBackground }]}>
          {searching ? (
            <SimpleSearchAnimation />
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

              {movieResults.length > 0 && (
                <Animated.View 
                  style={styles.carouselContainer}
                  entering={FadeIn.duration(300)}
                >
                  <Text style={[styles.carouselTitle, { color: currentTheme.colors.white }]}>
                    Movies ({movieResults.length})
                  </Text>
                  <FlatList
                    data={movieResults}
                    renderItem={renderHorizontalItem}
                    keyExtractor={item => `movie-${item.id}`}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalListContent}
                  />
                </Animated.View>
              )}

              {seriesResults.length > 0 && (
                <Animated.View 
                  style={styles.carouselContainer}
                  entering={FadeIn.duration(300).delay(100)}
                >
                  <Text style={[styles.carouselTitle, { color: currentTheme.colors.white }]}>
                    TV Shows ({seriesResults.length})
                  </Text>
                  <FlatList
                    data={seriesResults}
                    renderItem={renderHorizontalItem}
                    keyExtractor={item => `series-${item.id}`}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalListContent}
                  />
                </Animated.View>
              )}
              
            </Animated.ScrollView>
          )}
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
    paddingTop: 0,
  },
  header: {
    paddingHorizontal: 20,
    justifyContent: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 12,
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
    paddingBottom: 20,
    paddingHorizontal: 0,
  },
  carouselContainer: {
    marginBottom: 24,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  horizontalListContent: {
    paddingHorizontal: 12,
    paddingRight: 8,
  },
  horizontalItem: {
    width: HORIZONTAL_ITEM_WIDTH,
    marginRight: 12,
  },
  horizontalItemPosterContainer: {
    width: HORIZONTAL_ITEM_WIDTH,
    height: HORIZONTAL_POSTER_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
  },
  horizontalItemPoster: {
    width: '100%',
    height: '100%',
  },
  horizontalItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'left',
  },
  yearText: {
    fontSize: 12,
    marginTop: 2,
  },
  recentSearchesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
    borderRadius: 8,
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
  itemTypeContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemTypeText: {
    fontSize: 8,
    fontWeight: '700',
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
    fontSize: 10,
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
});

export default SearchScreen; 