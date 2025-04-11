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
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Meta, stremioService } from '../services/stremioService';
import { colors } from '../styles';
import { Image } from 'expo-image';

type CatalogScreenProps = {
  route: RouteProp<RootStackParamList, 'Catalog'>;
  navigation: StackNavigationProp<RootStackParamList, 'Catalog'>;
};

const { width } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_WIDTH = width / NUM_COLUMNS - 20;

const CatalogScreen: React.FC<CatalogScreenProps> = ({ route, navigation }) => {
  const { addonId, type, id, name, genreFilter } = route.params;
  const [items, setItems] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Force dark mode instead of using color scheme
  const isDarkMode = true;

  const loadItems = useCallback(async (pageNum: number, shouldRefresh: boolean = false) => {
    try {
      if (shouldRefresh) {
        setRefreshing(true);
      } else if (pageNum === 1) {
        setLoading(true);
      }

      setError(null);
      
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
        const filters = genreFilter ? [{ title: 'genre', value: genreFilter }] : [];
        
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
      } else if (genreFilter) {
        // Get all addons that have catalogs of the specified type
        const typeManifests = manifests.filter(manifest => 
          manifest.catalogs && manifest.catalogs.some(catalog => catalog.type === type)
        );
        
        // For each addon, try to get content with the genre filter
        for (const manifest of typeManifests) {
          try {
            // Find catalogs of this type
            const typeCatalogs = manifest.catalogs?.filter(catalog => catalog.type === type) || [];
            
            // For each catalog, try to get content
            for (const catalog of typeCatalogs) {
              try {
                const filters = [{ title: 'genre', value: genreFilter }];
                const catalogItems = await stremioService.getCatalog(manifest, type, catalog.id, pageNum, filters);
                
                if (catalogItems && catalogItems.length > 0) {
                  allItems = [...allItems, ...catalogItems];
                  foundItems = true;
                }
              } catch (error) {
                console.log(`Failed to load items from ${manifest.name} catalog ${catalog.id}:`, error);
                // Continue with other catalogs
              }
            }
          } catch (error) {
            console.log(`Failed to process addon ${manifest.name}:`, error);
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
      console.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addonId, type, id, genreFilter]);

  useEffect(() => {
    loadItems(1);
    // Set the header title
    navigation.setOptions({ title: name || `${type} catalog` });
  }, [loadItems, navigation, name, type]);

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
      >
        <Image
          source={{ uri: item.poster || 'https://via.placeholder.com/300x450/cccccc/666666?text=No+Image' }}
          style={styles.poster}
          contentFit="cover"
        />
        <Text
          style={styles.title}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {item.releaseInfo && (
          <Text
            style={styles.releaseInfo}
          >
            {item.releaseInfo}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [navigation]);

  if (loading && items.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={{ color: colors.white }}>
          {error}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => loadItems(1)}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: colors.darkBackground }
    ]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.darkBackground} />
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
        />
      ) : (
        <View style={styles.centered}>
          <Text style={{ color: colors.white, fontSize: 16, marginBottom: 10 }}>
            No content found for the selected genre
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRefresh}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  list: {
    padding: 10,
  },
  item: {
    width: ITEM_WIDTH,
    margin: 5,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: 4,
    backgroundColor: colors.transparentLight,
  },
  title: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  releaseInfo: {
    fontSize: 12,
    marginTop: 2,
    color: colors.lightGray,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  retryButton: {
    marginTop: 15,
    padding: 10,
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  retryText: {
    color: colors.white,
    fontWeight: '500',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.darkBackground,
  },
});

export default CatalogScreen; 