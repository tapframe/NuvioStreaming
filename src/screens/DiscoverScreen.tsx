import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles';
import { catalogService, StreamingContent } from '../services/catalogService';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Components
import CategorySelector from '../components/discover/CategorySelector';
import GenreSelector from '../components/discover/GenreSelector';
import CatalogsList from '../components/discover/CatalogsList';

// Constants and types
import { CATEGORIES, COMMON_GENRES, Category, GenreCatalog } from '../constants/discover';

// Styles
import useDiscoverStyles from '../styles/screens/discoverStyles';

const DiscoverScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [catalogs, setCatalogs] = useState<GenreCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const styles = useDiscoverStyles();
  const insets = useSafeAreaInsets();

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

  // Load content when category or genre changes
  useEffect(() => {
    loadContent(selectedCategory, selectedGenre);
  }, [selectedCategory, selectedGenre]);

  const loadContent = async (category: Category, genre: string) => {
    setLoading(true);
    try {
      // If genre is 'All', don't apply genre filter
      const genreFilter = genre === 'All' ? undefined : genre;
      const fetchedCatalogs = await catalogService.getCatalogByType(category.type, genreFilter);
      
      // Collect all content items
      const content: StreamingContent[] = [];
      fetchedCatalogs.forEach(catalog => {
        content.push(...catalog.items);
      });
      
      if (genre === 'All') {
        // Group by genres when "All" is selected
        const genreCatalogs: GenreCatalog[] = [];
        
        // Get all genres from content
        const genresSet = new Set<string>();
        content.forEach(item => {
          if (item.genres && item.genres.length > 0) {
            item.genres.forEach(g => genresSet.add(g));
          }
        });
        
        // Create catalogs for each genre
        genresSet.forEach(g => {
          const genreItems = content.filter(item => 
            item.genres && item.genres.includes(g)
          );
          
          if (genreItems.length > 0) {
            genreCatalogs.push({
              genre: g,
              items: genreItems
            });
          }
        });
        
        // Sort by number of items
        genreCatalogs.sort((a, b) => b.items.length - a.items.length);
        
        setCatalogs(genreCatalogs);
      } else {
        // When a specific genre is selected, show as a single catalog
        setCatalogs([{ genre, items: content }]);
      }
    } catch (error) {
      logger.error('Failed to load content:', error);
      setCatalogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryPress = useCallback((category: Category) => {
    if (category.id !== selectedCategory.id) {
      setSelectedCategory(category);
      setSelectedGenre('All'); // Reset to All when changing category
    }
  }, [selectedCategory]);

  const handleGenrePress = useCallback((genre: string) => {
    if (genre !== selectedGenre) {
      setSelectedGenre(genre);
    }
  }, [selectedGenre]);

  const handleSearchPress = useCallback(() => {
    navigation.navigate('Search');
  }, [navigation]);

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const headerHeight = headerBaseHeight + topSpacing;

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        No content found for {selectedGenre !== 'All' ? selectedGenre : 'these filters'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Fixed position header background */}
      <View style={[styles.headerBackground, { height: headerHeight }]} />
      
      <View style={{ flex: 1 }}>
        {/* Header Section */}
        <View style={[styles.header, { height: headerHeight, paddingTop: topSpacing }]}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Discover</Text>
            <TouchableOpacity 
              onPress={handleSearchPress} 
              style={styles.searchButton}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name="search" 
                size={24} 
                color={colors.white}
              />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Content Container */}
        <View style={styles.contentContainer}>
          {/* Categories Section */}
          <CategorySelector 
            categories={CATEGORIES}
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategoryPress}
          />
          
          {/* Genres Section */}
          <GenreSelector 
            genres={COMMON_GENRES}
            selectedGenre={selectedGenre}
            onSelectGenre={handleGenrePress}
          />
          
          {/* Content Section */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : catalogs.length > 0 ? (
            <CatalogsList 
              catalogs={catalogs}
              selectedCategory={selectedCategory}
            />
          ) : renderEmptyState()}
        </View>
      </View>
    </View>
  );
};

export default React.memo(DiscoverScreen); 