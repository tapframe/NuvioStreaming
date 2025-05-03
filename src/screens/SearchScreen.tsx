import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles';
import { catalogService, StreamingContent } from '../services/catalogService';
import { Image } from 'expo-image';
import debounce from 'lodash/debounce';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeOut, SlideInRight } from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';

const { width } = Dimensions.get('window');
const HORIZONTAL_ITEM_WIDTH = width * 0.3;
const HORIZONTAL_POSTER_HEIGHT = HORIZONTAL_ITEM_WIDTH * 1.5;
const POSTER_WIDTH = 90;
const POSTER_HEIGHT = 135;
const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

const PLACEHOLDER_POSTER = 'https://placehold.co/300x450/222222/CCCCCC?text=No+Poster';

const SkeletonLoader = () => {
  const pulseAnim = React.useRef(new RNAnimated.Value(0)).current;

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
      <RNAnimated.View style={[styles.skeletonPoster, { opacity }]} />
      <View style={styles.skeletonItemDetails}>
        <RNAnimated.View style={[styles.skeletonTitle, { opacity }]} />
        <View style={styles.skeletonMetaRow}>
          <RNAnimated.View style={[styles.skeletonMeta, { opacity }]} />
          <RNAnimated.View style={[styles.skeletonMeta, { opacity }]} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.skeletonContainer}>
      {[...Array(5)].map((_, index) => (
        <View key={index}>
          {index === 0 && (
            <RNAnimated.View style={[styles.skeletonSectionHeader, { opacity }]} />
          )}
          {renderSkeletonItem()}
        </View>
      ))}
    </View>
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

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    loadRecentSearches();
  }, []);

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
        await saveRecentSearch(searchQuery);
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
  };

  const renderRecentSearches = () => {
    if (!showRecent || recentSearches.length === 0) return null;

    return (
      <View style={styles.recentSearchesContainer}>
        <Text style={[styles.carouselTitle, { color: isDarkMode ? colors.white : colors.black }]}>
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
              color={isDarkMode ? colors.lightGray : colors.mediumGray}
              style={styles.recentSearchIcon}
            />
            <Text style={[
              styles.recentSearchText,
              { color: isDarkMode ? colors.white : colors.black }
            ]}>
              {search}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderHorizontalItem = ({ item }: { item: StreamingContent }) => {
    return (
      <TouchableOpacity
        style={styles.horizontalItem}
        onPress={() => {
          navigation.navigate('Metadata', { id: item.id, type: item.type });
        }}
      >
        <View style={styles.horizontalItemPosterContainer}>
          <Image
            source={{ uri: item.poster || PLACEHOLDER_POSTER }}
            style={styles.horizontalItemPoster}
            contentFit="cover"
            transition={300}
          />
        </View>
        <Text 
          style={[styles.horizontalItemTitle, { color: isDarkMode ? colors.white : colors.black }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
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

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: colors.black }
    ]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.black}
      />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
        <View style={[
          styles.searchBar, 
          { 
            backgroundColor: colors.darkGray,
            borderColor: 'transparent',
          }
        ]}>
          <MaterialIcons 
            name="search" 
            size={24} 
            color={colors.lightGray}
            style={styles.searchIcon}
          />
          <TextInput
            style={[
              styles.searchInput,
              { color: colors.white }
            ]}
            placeholder="Search movies, shows..."
            placeholderTextColor={colors.lightGray}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            keyboardAppearance="dark"
            autoFocus
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
                color={colors.lightGray}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {searching ? (
        <SkeletonLoader />
      ) : searched && !hasResultsToShow ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons 
            name="search-off" 
            size={64} 
            color={isDarkMode ? colors.lightGray : colors.mediumGray}
          />
          <Text style={[
            styles.emptyText,
            { color: isDarkMode ? colors.white : colors.black }
          ]}>
            No results found
          </Text>
          <Text style={[
            styles.emptySubtext,
            { color: isDarkMode ? colors.lightGray : colors.mediumGray }
          ]}>
            Try different keywords or check your spelling
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollViewContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {!query.trim() && renderRecentSearches()}

          {movieResults.length > 0 && (
            <View style={styles.carouselContainer}>
              <Text style={styles.carouselTitle}>Movies ({movieResults.length})</Text>
              <FlatList
                data={movieResults}
                renderItem={renderHorizontalItem}
                keyExtractor={item => `movie-${item.id}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalListContent}
              />
            </View>
          )}

          {seriesResults.length > 0 && (
            <View style={styles.carouselContainer}>
              <Text style={styles.carouselTitle}>TV Shows ({seriesResults.length})</Text>
              <FlatList
                data={seriesResults}
                renderItem={renderHorizontalItem}
                keyExtractor={item => `series-${item.id}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalListContent}
              />
            </View>
          )}
          
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: colors.black,
    gap: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
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
  },
  carouselContainer: {
    marginBottom: 24,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  horizontalListContent: {
    paddingHorizontal: 16,
    paddingRight: 8,
  },
  horizontalItem: {
    width: HORIZONTAL_ITEM_WIDTH,
    marginRight: 12,
  },
  horizontalItemPosterContainer: {
    width: HORIZONTAL_ITEM_WIDTH,
    height: HORIZONTAL_POSTER_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.darkBackground,
    marginBottom: 8,
  },
  horizontalItemPoster: {
    width: '100%',
    height: '100%',
  },
  horizontalItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'left',
  },
  recentSearchesContainer: {
    paddingHorizontal: 0,
    paddingBottom: 16,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  recentSearchIcon: {
    marginRight: 12,
  },
  recentSearchText: {
    fontSize: 16,
    flex: 1,
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
    padding: 16,
  },
  skeletonVerticalItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  skeletonPoster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 8,
    backgroundColor: colors.darkBackground,
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
    backgroundColor: colors.darkBackground,
    borderRadius: 4,
  },
  skeletonMeta: {
    height: 14,
    width: '30%',
    backgroundColor: colors.darkBackground,
    borderRadius: 4,
  },
  skeletonSectionHeader: {
    height: 24,
    width: '40%',
    backgroundColor: colors.darkBackground,
    marginBottom: 16,
    borderRadius: 4,
  },
});

export default SearchScreen; 