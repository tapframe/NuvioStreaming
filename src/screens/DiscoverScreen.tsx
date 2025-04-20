import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles';
import { catalogService, StreamingContent, CatalogContent } from '../services/catalogService';
import { Image } from 'expo-image';
import { FadeIn, FadeOut, SlideInRight, Layout } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import { BlurView } from 'expo-blur';

interface Category {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'channel' | 'tv';
  icon: keyof typeof MaterialIcons.glyphMap;
}

interface GenreCatalog {
  genre: string;
  items: StreamingContent[];
}

const CATEGORIES: Category[] = [
  { id: 'movie', name: 'Movies', type: 'movie', icon: 'local-movies' },
  { id: 'series', name: 'TV Shows', type: 'series', icon: 'live-tv' }
];

// Common genres for movies and TV shows
const COMMON_GENRES = [
  'All',
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western'
];

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Memoized child components
const CategoryButton = React.memo(({ 
  category, 
  isSelected, 
  onPress 
}: { 
  category: Category; 
  isSelected: boolean; 
  onPress: () => void;
}) => {
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[
        styles.categoryButton,
        isSelected && styles.selectedCategoryButton
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialIcons 
        name={category.icon} 
        size={24} 
        color={isSelected ? colors.white : colors.mediumGray} 
      />
      <Text
        style={[
          styles.categoryText,
          isSelected && styles.selectedCategoryText
        ]}
      >
        {category.name}
      </Text>
    </TouchableOpacity>
  );
});

const GenreButton = React.memo(({ 
  genre, 
  isSelected, 
  onPress 
}: { 
  genre: string; 
  isSelected: boolean; 
  onPress: () => void;
}) => {
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={[
        styles.genreButton,
        isSelected && styles.selectedGenreButton
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.genreText,
          isSelected && styles.selectedGenreText
        ]}
      >
        {genre}
      </Text>
    </TouchableOpacity>
  );
});

const ContentItem = React.memo(({ 
  item, 
  onPress 
}: { 
  item: StreamingContent; 
  onPress: () => void;
}) => {
  const styles = useStyles();
  const { width } = Dimensions.get('window');
  const itemWidth = (width - 48) / 2.2; // 2 items per row with spacing
  
  return (
    <TouchableOpacity
      style={[styles.contentItem, { width: itemWidth }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.posterContainer}>
        <Image
          source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
          style={styles.poster}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={300}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.posterGradient}
        >
          <Text style={styles.contentTitle} numberOfLines={2}>
            {item.name}
          </Text>
          {item.year && (
            <Text style={styles.contentYear}>{item.year}</Text>
          )}
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
});

const CatalogSection = React.memo(({ 
  catalog, 
  selectedCategory,
  navigation 
}: { 
  catalog: GenreCatalog; 
  selectedCategory: Category;
  navigation: NavigationProp<RootStackParamList>;
}) => {
  const styles = useStyles();
  const { width } = Dimensions.get('window');
  const itemWidth = (width - 48) / 2.2; // 2 items per row with spacing
  
  const displayItems = useMemo(() => 
    catalog.items.slice(0, 3), 
    [catalog.items]
  );
  
  const handleContentPress = useCallback((item: StreamingContent) => {
    navigation.navigate('Metadata', { id: item.id, type: item.type });
  }, [navigation]);
  
  const renderItem = useCallback(({ item }: { item: StreamingContent }) => (
    <ContentItem 
      item={item} 
      onPress={() => handleContentPress(item)} 
    />
  ), [handleContentPress]);
  
  const handleSeeMorePress = useCallback(() => {
    // Get addon/catalog info from the first item (assuming homogeneity)
    const firstItem = catalog.items[0];
    if (!firstItem) return; // Should not happen if section exists

    // We need addonId and catalogId. These aren't directly on StreamingContent.
    // We might need to fetch this or adjust the GenreCatalog structure.
    // FOR NOW: Assuming CatalogScreen can handle potentially missing addonId/catalogId
    // OR: We could pass the *genre* as the name and let CatalogScreen figure it out?
    // Let's pass the necessary info if available, assuming StreamingContent might have it
    // (Requires checking StreamingContent interface or how it's populated)

    // --- TEMPORARY/PLACEHOLDER --- 
    // Ideally, GenreCatalog should contain addonId/catalogId for the group.
    // If not, CatalogScreen needs modification or we fetch IDs here.
    // Let's stick to passing genre and type for now, CatalogScreen logic might suffice?
    navigation.navigate('Catalog', {
      // We don't have a single catalog ID or Addon ID for a genre section.
      // Pass the genre as the 'id' and 'name' for CatalogScreen to potentially filter.
      // This might require CatalogScreen to be adapted to handle genre-based views.
      addonId: 'genre-based', // Placeholder or identifier
      id: catalog.genre, 
      type: selectedCategory.type,
      name: `${catalog.genre} ${selectedCategory.name}`, // Pass constructed name for now
      genreFilter: catalog.genre // Keep the genre filter
    });
    // --- END TEMPORARY --- 

  }, [navigation, selectedCategory, catalog.genre, catalog.items]);
  
  const keyExtractor = useCallback((item: StreamingContent) => item.id, []);
  const ItemSeparator = useCallback(() => <View style={{ width: 16 }} />, []);
  
  return (
    <View style={styles.catalogContainer}>
      <View style={styles.catalogHeader}>
        <View style={styles.catalogTitleContainer}>
          <Text style={styles.catalogTitle}>{catalog.genre}</Text>
          <View style={styles.catalogTitleBar} />
        </View>
        <TouchableOpacity
          onPress={handleSeeMorePress}
          style={styles.seeAllButton}
          activeOpacity={0.6}
        >
          <Text style={styles.seeAllText}>See All</Text>
          <MaterialIcons name="arrow-forward-ios" color={colors.primary} size={14} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={displayItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        snapToInterval={itemWidth + 16}
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={ItemSeparator}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
});

// Extract styles into a hook for better performance with dimensions
const useStyles = () => {
  const { width } = Dimensions.get('window');
  
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.darkBackground,
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 16 : 16,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.white,
      letterSpacing: 0.3,
    },
    searchButton: {
      padding: 10,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    categoryContainer: {
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    categoriesContent: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 20,
      gap: 16,
    },
    categoryButton: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.05)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      maxWidth: 160,
      justifyContent: 'center',
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    selectedCategoryButton: {
      backgroundColor: colors.primary,
    },
    categoryText: {
      color: colors.mediumGray,
      fontWeight: '600',
      fontSize: 16,
    },
    selectedCategoryText: {
      color: colors.white,
      fontWeight: '700',
    },
    genreContainer: {
      paddingTop: 20,
      paddingBottom: 12,
      zIndex: 10,
    },
    genresScrollView: {
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    genreButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      marginRight: 12,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.05)',
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
      overflow: 'hidden',
    },
    selectedGenreButton: {
      backgroundColor: colors.primary,
    },
    genreText: {
      color: colors.mediumGray,
      fontWeight: '500',
      fontSize: 14,
    },
    selectedGenreText: {
      color: colors.white,
      fontWeight: '600',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    catalogsContainer: {
      paddingVertical: 8,
    },
    catalogContainer: {
      marginBottom: 32,
    },
    catalogHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    catalogTitleContainer: {
      flexDirection: 'column',
    },
    catalogTitleBar: {
      width: 32,
      height: 3,
      backgroundColor: colors.primary,
      marginTop: 6,
      borderRadius: 2,
    },
    catalogTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.white,
    },
    seeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    seeAllText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 14,
    },
    contentItem: {
      marginHorizontal: 0,
    },
    posterContainer: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.03)',
      elevation: 5,
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    poster: {
      aspectRatio: 2/3,
      width: '100%',
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
    contentTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
      marginBottom: 4,
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
      letterSpacing: 0.3,
    },
    contentYear: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.7)',
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyText: {
      color: colors.mediumGray,
      fontSize: 16,
      textAlign: 'center',
      paddingHorizontal: 32,
    },
  });
};

const DiscoverScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [catalogs, setCatalogs] = useState<GenreCatalog[]>([]);
  const [allContent, setAllContent] = useState<StreamingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const styles = useStyles();

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
      
      setAllContent(content);
      
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
      setAllContent([]);
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

  // Memoize rendering functions
  const renderCatalogItem = useCallback(({ item }: { item: GenreCatalog }) => (
    <CatalogSection 
      catalog={item} 
      selectedCategory={selectedCategory}
      navigation={navigation}
    />
  ), [selectedCategory, navigation]);

  // Memoize list key extractor
  const catalogKeyExtractor = useCallback((item: GenreCatalog) => item.genre, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      
      <View style={{ flex: 1 }}>
        {/* Header Section */}
        <View style={styles.header}>
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
        
        {/* Categories Section */}
        <View style={styles.categoryContainer}>
          <View style={styles.categoriesContent}>
            {CATEGORIES.map((category) => (
              <CategoryButton
                key={category.id}
                category={category}
                isSelected={selectedCategory.id === category.id}
                onPress={() => handleCategoryPress(category)}
              />
            ))}
          </View>
        </View>
        
        {/* Genres Section */}
        <View style={styles.genreContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genresScrollView}
            decelerationRate="fast"
            snapToInterval={10}
          >
            {COMMON_GENRES.map(genre => (
              <GenreButton
                key={genre}
                genre={genre}
                isSelected={selectedGenre === genre}
                onPress={() => handleGenrePress(genre)}
              />
            ))}
          </ScrollView>
        </View>
        
        {/* Content Section */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : catalogs.length > 0 ? (
          <FlatList
            data={catalogs}
            renderItem={renderCatalogItem}
            keyExtractor={catalogKeyExtractor}
            contentContainerStyle={styles.catalogsContainer}
            showsVerticalScrollIndicator={false}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
            removeClippedSubviews={Platform.OS === 'android'}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No content found for {selectedGenre !== 'All' ? selectedGenre : 'these filters'}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

export default React.memo(DiscoverScreen); 