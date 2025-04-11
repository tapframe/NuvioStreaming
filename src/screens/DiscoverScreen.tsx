import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles';
import { catalogService, StreamingContent, CatalogContent } from '../services/catalogService';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut, SlideInRight, Layout } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/AppNavigator';

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

const DiscoverScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [catalogs, setCatalogs] = useState<GenreCatalog[]>([]);
  const [allContent, setAllContent] = useState<StreamingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const { width } = Dimensions.get('window');
  const itemWidth = (width - 60) / 4; // 4 items per row with spacing

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.darkBackground,
    },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)',
      backgroundColor: colors.darkBackground,
    },
    headerContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.white,
    },
    searchButton: {
      padding: 8,
    },
    searchIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.transparentLight,
    },
    categoryContainer: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    categoriesContent: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 12,
      gap: 12,
    },
    categoryButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginHorizontal: 4,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.lightGray,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    categoryIcon: {
      marginRight: 4,
    },
    categoryText: {
      color: colors.mediumGray,
      fontWeight: '500',
      fontSize: 15,
    },
    genreContainer: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    genresScrollView: {
      paddingHorizontal: 16,
    },
    genreButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.lightGray,
      backgroundColor: 'transparent',
    },
    genreText: {
      color: colors.mediumGray,
      fontWeight: '500',
      fontSize: 14,
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
      marginBottom: 24,
    },
    catalogHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    titleContainer: {
      flexDirection: 'column',
    },
    catalogTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.white,
      marginBottom: 2,
    },
    titleUnderline: {
      height: 2,
      width: 40,
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    seeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    seeAllText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 14,
    },
    contentItem: {
      width: itemWidth,
      marginHorizontal: 5,
    },
    posterContainer: {
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: colors.transparentLight,
      elevation: 4,
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
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
      padding: 8,
      justifyContent: 'flex-end',
    },
    contentTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.white,
      marginBottom: 2,
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    contentYear: {
      fontSize: 10,
      color: colors.mediumGray,
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 100,
    },
    emptyText: {
      color: colors.mediumGray,
      fontSize: 16,
      fontWeight: '500',
    },
  });

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
      console.error('Failed to load content:', error);
      setCatalogs([]);
      setAllContent([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryPress = (category: Category) => {
    if (category.id !== selectedCategory.id) {
      setSelectedCategory(category);
      setSelectedGenre('All'); // Reset to All when changing category
    }
  };

  const handleGenrePress = (genre: string) => {
    if (genre !== selectedGenre) {
      setSelectedGenre(genre);
    }
  };

  const handleSearchPress = () => {
    // @ts-ignore - We'll fix navigation types later
    navigation.navigate('Search');
  };

  const renderCategory = ({ item }: { item: Category }) => {
    const isSelected = selectedCategory.id === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.categoryButton,
          isSelected && { 
            backgroundColor: colors.primary,
            borderColor: colors.primary,
            transform: [{ scale: 1.05 }],
          }
        ]}
        onPress={() => handleCategoryPress(item)}
      >
        <MaterialIcons 
          name={item.icon} 
          size={24} 
          color={isSelected ? colors.white : colors.mediumGray} 
          style={styles.categoryIcon}
        />
        <Text
          style={[
            styles.categoryText,
            isSelected && { color: colors.white, fontWeight: '600' }
          ]}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderGenre = useCallback((genre: string) => {
    const isSelected = selectedGenre === genre;
    return (
      <TouchableOpacity
        key={genre}
        style={[
          styles.genreButton,
          isSelected && { 
            backgroundColor: colors.primary,
            borderColor: colors.primary 
          }
        ]}
        onPress={() => handleGenrePress(genre)}
      >
        <Text
          style={[
            styles.genreText,
            isSelected && { color: colors.white, fontWeight: '600' }
          ]}
        >
          {genre}
        </Text>
      </TouchableOpacity>
    );
  }, [selectedGenre]);

  const renderContentItem = useCallback(({ item }: { item: StreamingContent }) => {
    return (
      <TouchableOpacity
        style={styles.contentItem}
        onPress={() => {
          navigation.navigate('Metadata', { id: item.id, type: item.type });
        }}
      >
        <View style={styles.posterContainer}>
          <Image
            source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
            style={styles.poster}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
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
  }, [navigation]);

  const renderCatalog = useCallback(({ item }: { item: GenreCatalog }) => {
    // Only display the first 4 items in the row
    const displayItems = item.items.slice(0, 4);
    
    return (
      <View style={styles.catalogContainer}>
        <View style={styles.catalogHeader}>
          <View style={styles.titleContainer}>
            <Text style={styles.catalogTitle}>{item.genre}</Text>
            <View style={styles.titleUnderline} />
          </View>
          <TouchableOpacity
            onPress={() => {
              // Navigate to catalog view with genre filter
              navigation.navigate('Catalog', {
                id: 'discover',
                type: selectedCategory.type,
                name: `${item.genre} ${selectedCategory.name}`,
                genreFilter: item.genre
              });
            }}
            style={styles.seeAllButton}
          >
            <Text style={styles.seeAllText}>See More</Text>
            <MaterialIcons name="arrow-forward" color={colors.primary} size={16} />
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={displayItems}
          renderItem={renderContentItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 11 }}
          snapToInterval={itemWidth + 10}
          decelerationRate="fast"
          snapToAlignment="start"
          ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        />
      </View>
    );
  }, [navigation, selectedCategory]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.darkBackground}
        translucent
      />
      
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>
              Discover
            </Text>
            <TouchableOpacity 
              onPress={handleSearchPress} 
              style={styles.searchButton}
            >
              <View style={styles.searchIconContainer}>
                <MaterialIcons 
                  name="search" 
                  size={24} 
                  color={colors.white}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.categoryContainer}>
          <View style={styles.categoriesContent}>
            {CATEGORIES.map((category) => (
              <View key={category.id}>
                {renderCategory({ item: category })}
              </View>
            ))}
          </View>
        </View>
        
        <View style={styles.genreContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genresScrollView}
          >
            {COMMON_GENRES.map(genre => renderGenre(genre))}
          </ScrollView>
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : catalogs.length > 0 ? (
          <FlatList
            data={catalogs}
            renderItem={renderCatalog}
            keyExtractor={(item) => item.genre}
            contentContainerStyle={styles.catalogsContainer}
            showsVerticalScrollIndicator={false}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
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

export default DiscoverScreen; 