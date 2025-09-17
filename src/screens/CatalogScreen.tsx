import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Meta, stremioService } from '../services/stremioService';
import { useTheme } from '../contexts/ThemeContext';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { logger } from '../utils/logger';
import { useCustomCatalogNames } from '../hooks/useCustomCatalogNames';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { catalogService, DataSource, StreamingContent } from '../services/catalogService';
import { tmdbService } from '../services/tmdbService';

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

// Dynamic column calculation based on screen width
const calculateCatalogLayout = (screenWidth: number) => {
  const MIN_ITEM_WIDTH = 120;
  const MAX_ITEM_WIDTH = 180; // Increased for tablets
  const HORIZONTAL_PADDING = SPACING.lg * 2;
  const ITEM_SPACING = SPACING.sm;
  
  // Calculate how many columns can fit
  const availableWidth = screenWidth - HORIZONTAL_PADDING;
  const maxColumns = Math.floor(availableWidth / (MIN_ITEM_WIDTH + ITEM_SPACING));
  
  // More flexible column limits for different screen sizes
  let numColumns;
  if (screenWidth < 600) {
    // Phone: 2-3 columns
    numColumns = Math.min(Math.max(maxColumns, 2), 3);
  } else if (screenWidth < 900) {
    // Small tablet: 3-5 columns
    numColumns = Math.min(Math.max(maxColumns, 3), 5);
  } else if (screenWidth < 1200) {
    // Large tablet: 4-6 columns
    numColumns = Math.min(Math.max(maxColumns, 4), 6);
  } else {
    // Very large screens: 5-8 columns
    numColumns = Math.min(Math.max(maxColumns, 5), 8);
  }
  
  // Calculate actual item width with proper spacing
  const totalSpacing = ITEM_SPACING * (numColumns - 1);
  const itemWidth = (availableWidth - totalSpacing) / numColumns;
  
  // Ensure item width doesn't exceed maximum
  const finalItemWidth = Math.min(itemWidth, MAX_ITEM_WIDTH);
  
  return {
    numColumns,
    itemWidth: finalItemWidth
  };
};

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
    // Center header on very wide screens
    alignSelf: 'center',
    maxWidth: 1400,
    width: '100%',
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
    // Center title on very wide screens
    alignSelf: 'center',
    maxWidth: 1400,
    width: '100%',
  },
  list: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
    // Center content on very wide screens
    alignSelf: 'center',
    maxWidth: 1400, // Prevent content from being too wide on large screens
    width: '100%',
  },
  item: {
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
  // removed bottom text container; keep spacing via item margin only
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
    // Center content on very wide screens
    alignSelf: 'center',
    maxWidth: 600, // Narrower max width for centered content
    width: '100%',
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
  },
  badgeContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  }
});

const CatalogScreen: React.FC<CatalogScreenProps> = ({ route, navigation }) => {
  const { addonId, type, id, name: originalName, genreFilter } = route.params;
  const [items, setItems] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>(DataSource.STREMIO_ADDONS);
  const [actualCatalogName, setActualCatalogName] = useState<string | null>(null);
  const [screenData, setScreenData] = useState(() => {
    const { width } = Dimensions.get('window');
    return {
      width,
      ...calculateCatalogLayout(width)
    };
  });
  const [mobileColumnsPref, setMobileColumnsPref] = useState<'auto' | 2 | 3>('auto');
  const [nowPlayingMovies, setNowPlayingMovies] = useState<Set<string>>(new Set());
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const styles = createStyles(colors);
  const isDarkMode = true;

  // Load mobile columns preference (phones only)
  useEffect(() => {
    (async () => {
      try {
        const pref = await AsyncStorage.getItem('catalog_mobile_columns');
        if (pref === '2') setMobileColumnsPref(2);
        else if (pref === '3') setMobileColumnsPref(3);
        else setMobileColumnsPref('auto');
      } catch {}
    })();
  }, []);

  // Handle screen dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const base = calculateCatalogLayout(window.width);
      setScreenData(prev => ({
        width: window.width,
        ...base
      }));
    });

    return () => subscription?.remove();
  }, []);

  const { getCustomName, isLoadingCustomNames } = useCustomCatalogNames();
  
  // Create display name with proper type suffix
  const createDisplayName = (catalogName: string) => {
    if (!catalogName) return '';
    
    // Check if the name already includes content type indicators
    const lowerName = catalogName.toLowerCase();
    const contentType = type === 'movie' ? 'Movies' : type === 'series' ? 'TV Shows' : `${type.charAt(0).toUpperCase() + type.slice(1)}s`;
    
    // If the name already contains type information, return as is
    if (lowerName.includes('movie') || lowerName.includes('tv') || lowerName.includes('show') || lowerName.includes('series')) {
      return catalogName;
    }
    
    // Otherwise append the content type
    return `${catalogName} ${contentType}`;
  };
  
  // Use actual catalog name if available, otherwise fallback to custom name or original name
  const displayName = actualCatalogName 
    ? getCustomName(addonId || '', type || '', id || '', createDisplayName(actualCatalogName))
    : getCustomName(addonId || '', type || '', id || '', originalName ? createDisplayName(originalName) : '') || 
      (genreFilter ? `${genreFilter} ${type === 'movie' ? 'Movies' : 'TV Shows'}` : 
       `${type.charAt(0).toUpperCase() + type.slice(1)}s`);

  // Add effect to get the actual catalog name from addon manifest
  useEffect(() => {
    const getActualCatalogName = async () => {
      if (addonId && type && id) {
        try {
          const manifests = await stremioService.getInstalledAddonsAsync();
          const addon = manifests.find(a => a.id === addonId);
          
          if (addon && addon.catalogs) {
            const catalog = addon.catalogs.find(c => c.type === type && c.id === id);
            if (catalog && catalog.name) {
              setActualCatalogName(catalog.name);
            }
          }
        } catch (error) {
          logger.error('Failed to get actual catalog name:', error);
        }
      }
    };
    
    getActualCatalogName();
  }, [addonId, type, id]);

  // Add effect to get data source preference when component mounts
  useEffect(() => {
    const getDataSourcePreference = async () => {
      const preference = await catalogService.getDataSourcePreference();
      setDataSource(preference);
    };

    getDataSourcePreference();
  }, []);

  // Load now playing movies for theater chip (only for movie catalogs)
  useEffect(() => {
    const loadNowPlayingMovies = async () => {
      if (type === 'movie') {
        try {
          // Get first page of now playing movies (typically shows most recent/current)
          const nowPlaying = await tmdbService.getNowPlaying(1, 'US');
          const movieIds = new Set(nowPlaying.map(movie =>
            movie.external_ids?.imdb_id || movie.id.toString()
          ).filter(Boolean));
          setNowPlayingMovies(movieIds);
        } catch (error) {
          logger.error('Failed to load now playing movies:', error);
          // Set empty set on error to avoid repeated attempts
          setNowPlayingMovies(new Set());
        }
      }
    };

    loadNowPlayingMovies();
  }, [type]);

  const loadItems = useCallback(async (shouldRefresh: boolean = false) => {
    try {
      if (shouldRefresh) {
        setRefreshing(true);
      } else {
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
        const catalogItems = await stremioService.getCatalog(addon, type, id, 1, filters);

        if (catalogItems.length > 0) {
          foundItems = true;
          setItems(catalogItems);
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
                
                const catalogItems = await stremioService.getCatalog(manifest, type, catalog.id, 1, filters);
                
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

        if (uniqueItems.length > 0) {
          foundItems = true;
          setItems(uniqueItems);
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
    loadItems(true);
  }, [loadItems]);

  const handleRefresh = useCallback(() => {
    setItems([]); // Clear items on refresh
    loadItems(true);
  }, [loadItems]);


  const effectiveNumColumns = React.useMemo(() => {
    const isPhone = screenData.width < 600; // basic breakpoint; tablets generally above this
    if (!isPhone || mobileColumnsPref === 'auto') return screenData.numColumns;
    // clamp to 2 or 3 on phones
    return mobileColumnsPref === 2 ? 2 : 3;
  }, [screenData.width, screenData.numColumns, mobileColumnsPref]);

  const effectiveItemWidth = React.useMemo(() => {
    if (effectiveNumColumns === screenData.numColumns) return screenData.itemWidth;
    // recompute width for custom columns on mobile to maintain spacing roughly similar
    const HORIZONTAL_PADDING = 16 * 2; // SPACING.lg * 2
    const ITEM_SPACING = 8; // SPACING.sm
    const availableWidth = screenData.width - HORIZONTAL_PADDING;
    const totalSpacing = ITEM_SPACING * (effectiveNumColumns - 1);
    return (availableWidth - totalSpacing) / effectiveNumColumns;
  }, [effectiveNumColumns, screenData.width, screenData.itemWidth]);

  const renderItem = useCallback(({ item, index }: { item: Meta; index: number }) => {
    // Calculate if this is the last item in a row
    const isLastInRow = (index + 1) % effectiveNumColumns === 0;
    // For proper spacing
    const rightMargin = isLastInRow ? 0 : SPACING.sm;
    
    return (
      <TouchableOpacity
        style={[
          styles.item,
          { 
            marginRight: rightMargin,
            width: effectiveItemWidth
          }
        ]}
        onPress={() => navigation.navigate('Metadata', { id: item.id, type: item.type, addonId })}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item.poster || 'https://via.placeholder.com/300x450/333333/666666?text=No+Image' }}
          style={styles.poster}
          contentFit="cover"
          cachePolicy="disk"
          transition={0}
          allowDownscaling
        />

        {type === 'movie' && nowPlayingMovies.has(item.id) && (
          <View style={styles.badgeContainer}>
            <MaterialIcons
              name="theaters"
              size={12}
              color={colors.white}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.badgeText}>In Theaters</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [navigation, styles, effectiveNumColumns, effectiveItemWidth, type, nowPlayingMovies]);

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
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.id}-${item.type}`}
          numColumns={effectiveNumColumns}
          key={effectiveNumColumns}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={effectiveItemWidth * 1.5 + SPACING.lg}
        />
      ) : renderEmptyState()}
    </SafeAreaView>
  );
};

export default CatalogScreen;