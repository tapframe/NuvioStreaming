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
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Meta, stremioService } from '../services/stremioService';
import { useTheme } from '../contexts/ThemeContext';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { logger } from '../utils/logger';
import { useCustomCatalogNames } from '../hooks/useCustomCatalogNames';
import { catalogService, DataSource, StreamingContent } from '../services/catalogService';

type CatalogScreenProps = {
  route: RouteProp<RootStackParamList, 'Catalog'>;
  navigation: StackNavigationProp<RootStackParamList, 'Catalog'>;
};

// Constants for layout
const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Screen dimensions and grid layout
const { width } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_MARGIN = SPACING.sm;
const ITEM_WIDTH = (width - (SPACING.lg * 2) - (ITEM_MARGIN * 2 * NUM_COLUMNS)) / NUM_COLUMNS;

// Create a styles creator function that accepts the theme colors
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 8 : 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.primary,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.white,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  list: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  item: {
    width: ITEM_WIDTH,
    marginBottom: SPACING.lg,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.elevation2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  poster: {
    width: '100%',
    aspectRatio: 2/3,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: colors.elevation3,
  },
  itemContent: {
    padding: SPACING.sm,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    lineHeight: 18,
  },
  releaseInfo: {
    fontSize: 12,
    marginTop: SPACING.xs,
    color: colors.mediumGray,
  },
  footer: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  button: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: colors.primary,
    borderRadius: 8,
    elevation: 2,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    color: colors.white,
    fontSize: 16,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  errorText: {
    color: colors.white,
    fontSize: 16,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  loadingText: {
    color: colors.white,
    fontSize: 16,
    marginTop: SPACING.lg,
  }
});

const CatalogScreen: React.FC<CatalogScreenProps> = ({ route, navigation }) => {
  const { addonId, type, id, name: originalName, genreFilter } = route.params;
  const [items, setItems] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>(DataSource.STREMIO_ADDONS);
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const styles = createStyles(colors);
  const isDarkMode = true;

  const { getCustomName, isLoadingCustomNames } = useCustomCatalogNames();
  const displayName = getCustomName(addonId || '', type || '', id || '', originalName || '');

  // Add effect to get data source preference when component mounts
  useEffect(() => {
    const getDataSourcePreference = async () => {
      const preference = await catalogService.getDataSourcePreference();
      setDataSource(preference);
    };
    
    getDataSourcePreference();
  }, []);

  const loadItems = useCallback(async (pageNum: number, shouldRefresh: boolean = false) => {
    try {
      if (shouldRefresh) {
        setRefreshing(true);
      } else if (pageNum === 1) {
        setLoading(true);
      }

      setError(null);
      
      // Process the genre filter - ignore "All" and clean up the value
      let effectiveGenreFilter = genreFilter;
      if (effectiveGenreFilter === 'All') {
        effectiveGenreFilter = undefined;
        logger.log('Genre "All" detected, removing genre filter');
      } else if (effectiveGenreFilter) {
        // Clean up the genre filter
        effectiveGenreFilter = effectiveGenreFilter.trim();
        logger.log(`Using cleaned genre filter: "${effectiveGenreFilter}"`);
      }
      
      // Check if using TMDB as data source and not requesting a specific addon
      if (dataSource === DataSource.TMDB && !addonId) {
        logger.log('Using TMDB data source for CatalogScreen');
        try {
          const catalogs = await catalogService.getCatalogByType(type, effectiveGenreFilter);
          if (catalogs && catalogs.length > 0) {
            // Flatten all items from all catalogs
            const allItems: StreamingContent[] = [];
            catalogs.forEach(catalog => {
              allItems.push(...catalog.items);
            });
            
            // Convert StreamingContent to Meta format
            const metaItems: Meta[] = allItems.map(item => ({
              id: item.id,
              type: item.type,
              name: item.name,
              poster: item.poster,
              background: item.banner,
              logo: item.logo,
              description: item.description,
              releaseInfo: item.year?.toString() || '',
              imdbRating: item.imdbRating,
              year: item.year,
              genres: item.genres || [],
              runtime: item.runtime,
              certification: item.certification,
            }));
            
            // Remove duplicates
            const uniqueItems = metaItems.filter((item, index, self) =>
              index === self.findIndex((t) => t.id === item.id)
            );
            
            setItems(uniqueItems);
            setHasMore(false); // TMDB already returns a full set
            setLoading(false);
            setRefreshing(false);
            return;
          } else {
            setError("No content found for the selected filters");
            setItems([]);
            setLoading(false);
            setRefreshing(false);
            return;
          }
        } catch (error) {
          logger.error('Failed to get TMDB catalog:', error);
          setError('Failed to load content from TMDB');
          setItems([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }
      
      // Use this flag to track if we found and processed any items
      let foundItems = false;
      let allItems: Meta[] = [];
      
      // Get all installed addon manifests directly
      const manifests = await stremioService.getInstalledAddonsAsync();
      
      if (addonId) {
        // If addon ID is provided, find the specific addon
        const addon = manifests.find(a => a.id === addonId);
        
        if (!addon) {
          throw new Error(`Addon ${addonId} not found`);
        }
        
        // Create filters array for genre filtering if provided
        const filters = effectiveGenreFilter ? [{ title: 'genre', value: effectiveGenreFilter }] : [];
        
        // Load items from the catalog
        const newItems = await stremioService.getCatalog(addon, type, id, pageNum, filters);
        
        if (newItems.length === 0) {
          setHasMore(false);
        } else {
          foundItems = true;
        }
        
        if (shouldRefresh || pageNum === 1) {
          setItems(newItems);
        } else {
          setItems(prev => [...prev, ...newItems]);
        }
      } else if (effectiveGenreFilter) {
        // Get all addons that have catalogs of the specified type
        const typeManifests = manifests.filter(manifest => 
          manifest.catalogs && manifest.catalogs.some(catalog => catalog.type === type)
        );
        
        // Add debug logging for genre filter
        logger.log(`Using genre filter: "${effectiveGenreFilter}" for type: ${type}`);
        
        // For each addon, try to get content with the genre filter
        for (const manifest of typeManifests) {
          try {
            // Find catalogs of this type
            const typeCatalogs = manifest.catalogs?.filter(catalog => catalog.type === type) || [];
            
            // For each catalog, try to get content
            for (const catalog of typeCatalogs) {
              try {
                const filters = [{ title: 'genre', value: effectiveGenreFilter }];
                
                // Debug logging for each catalog request
                logger.log(`Requesting from ${manifest.name}, catalog ${catalog.id} with genre "${effectiveGenreFilter}"`);
                
                const catalogItems = await stremioService.getCatalog(manifest, type, catalog.id, pageNum, filters);
                
                if (catalogItems && catalogItems.length > 0) {
                  // Log first few items' genres to debug
                  const sampleItems = catalogItems.slice(0, 3);
                  sampleItems.forEach(item => {
                    logger.log(`Item "${item.name}" has genres: ${JSON.stringify(item.genres)}`);
                  });
                  
                  // Filter items client-side to ensure they contain the requested genre
                  // Some addons might not properly filter by genre on the server
                  let filteredItems = catalogItems;
                  if (effectiveGenreFilter) {
                    const normalizedGenreFilter = effectiveGenreFilter.toLowerCase().trim();
                    
                    filteredItems = catalogItems.filter(item => {
                      // Skip items without genres
                      if (!item.genres || !Array.isArray(item.genres)) {
                        return false;
                      }
                      
                      // Check for genre match (exact or substring)
                      return item.genres.some(genre => {
                        const normalizedGenre = genre.toLowerCase().trim();
                        return normalizedGenre === normalizedGenreFilter || 
                               normalizedGenre.includes(normalizedGenreFilter) ||
                               normalizedGenreFilter.includes(normalizedGenre);
                      });
                    });
                    
                    logger.log(`Filtered ${catalogItems.length} items to ${filteredItems.length} matching genre "${effectiveGenreFilter}"`);
                  }
                  
                  allItems = [...allItems, ...filteredItems];
                  foundItems = filteredItems.length > 0;
                }
              } catch (error) {
                logger.log(`Failed to load items from ${manifest.name} catalog ${catalog.id}:`, error);
                // Continue with other catalogs
              }
            }
          } catch (error) {
            logger.log(`Failed to process addon ${manifest.name}:`, error);
            // Continue with other addons
          }
        }
        
        // Remove duplicates by ID
        const uniqueItems = allItems.filter((item, index, self) =>
          index === self.findIndex((t) => t.id === item.id)
        );
        
        if (uniqueItems.length === 0) {
          setHasMore(false);
        }
        
        if (shouldRefresh || pageNum === 1) {
          setItems(uniqueItems);
        } else {
          // Add new items while avoiding duplicates
          setItems(prev => {
            const prevIds = new Set(prev.map(item => item.id));
            const newItems = uniqueItems.filter(item => !prevIds.has(item.id));
            return [...prev, ...newItems];
          });
        }
      }
      
      if (!foundItems) {
        setError("No content found for the selected filters");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog items');
      logger.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addonId, type, id, genreFilter, dataSource]);

  useEffect(() => {
    loadItems(1);
  }, [loadItems]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    loadItems(1, true);
  }, [loadItems]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadItems(nextPage);
    }
  }, [loading, hasMore, page, loadItems]);

  const renderItem = useCallback(({ item }: { item: Meta }) => {
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => navigation.navigate('Metadata', { id: item.id, type: item.type })}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item.poster || 'https://via.placeholder.com/300x450/333333/666666?text=No+Image' }}
          style={styles.poster}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.itemContent}>
          <Text
            style={styles.title}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {item.releaseInfo && (
            <Text style={styles.releaseInfo}>
              {item.releaseInfo}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [navigation, styles]);

  const renderEmptyState = () => (
    <View style={styles.centered}>
      <MaterialIcons name="search-off" size={56} color={colors.mediumGray} />
      <Text style={styles.emptyText}>
        No content found
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleRefresh}
      >
        <Text style={styles.buttonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.centered}>
      <MaterialIcons name="error-outline" size={56} color={colors.mediumGray} />
      <Text style={styles.errorText}>
        {error}
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => loadItems(1)}
      >
        <Text style={styles.buttonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLoadingState = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>Loading content...</Text>
    </View>
  );

  const isScreenLoading = loading || isLoadingCustomNames;

  if (isScreenLoading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="chevron-left" size={28} color={colors.white} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{displayName || originalName || `${type.charAt(0).toUpperCase() + type.slice(1)}s`}</Text>
        {renderLoadingState()}
      </SafeAreaView>
    );
  }

  if (error && items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="chevron-left" size={28} color={colors.white} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>{displayName || `${type.charAt(0).toUpperCase() + type.slice(1)}s`}</Text>
        {renderErrorState()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="chevron-left" size={28} color={colors.white} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.headerTitle}>{displayName || `${type.charAt(0).toUpperCase() + type.slice(1)}s`}</Text>
      
      {items.length > 0 ? (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.id}-${item.type}`}
          numColumns={NUM_COLUMNS}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading && items.length > 0 ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />
      ) : renderEmptyState()}
    </SafeAreaView>
  );
};

export default CatalogScreen; 