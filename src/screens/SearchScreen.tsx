import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Keyboard,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import debounce from 'lodash/debounce';
import { colors } from '../styles';
import { catalogService, StreamingContent } from '../services/catalogService';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import {
  SearchBar,
  SkeletonLoader,
  RecentSearches,
  ResultsCarousel,
  EmptyResults
} from '../components/search';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

const SearchScreen: React.FC = () => {
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

  const handleRecentSearchSelect = (search: string) => {
    setQuery(search);
    Keyboard.dismiss();
  };

  const handleItemPress = (item: StreamingContent) => {
    navigation.navigate('Metadata', { id: item.id, type: item.type });
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
        <SearchBar
          query={query}
          onChangeQuery={setQuery}
          onClear={handleClearSearch}
        />
      </View>

      {searching ? (
        <SkeletonLoader />
      ) : searched && !hasResultsToShow ? (
        <EmptyResults isDarkMode={isDarkMode} />
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollViewContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {showRecent && (
            <RecentSearches
              searches={recentSearches}
              onSearchSelect={handleRecentSearchSelect}
              isDarkMode={isDarkMode}
            />
          )}

          {movieResults.length > 0 && (
            <ResultsCarousel
              title="Movies"
              items={movieResults}
              onItemPress={handleItemPress}
              isDarkMode={isDarkMode}
            />
          )}

          {seriesResults.length > 0 && (
            <ResultsCarousel
              title="TV Shows"
              items={seriesResults}
              onItemPress={handleItemPress}
              isDarkMode={isDarkMode}
            />
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
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
});

export default SearchScreen; 