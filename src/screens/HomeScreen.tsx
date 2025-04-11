import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  useColorScheme,
  Dimensions,
  ImageBackground,
  ScrollView,
  Platform,
  Image,
  Modal,
  Pressable
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { StreamingContent, CatalogContent, catalogService } from '../services/catalogService';
import { Stream } from '../types/metadata';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { colors } from '../styles/colors';
import Animated, { 
  FadeIn, 
  FadeOut,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  interpolate,
  Extrapolate,
  runOnJS,
  useAnimatedGestureHandler,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useCatalogContext } from '../contexts/CatalogContext';
import { ThisWeekSection } from '../components/home/ThisWeekSection';
import * as Haptics from 'expo-haptics';

// Define interfaces for our data
interface Category {
  id: string;
  name: string;
}

interface ContentItemProps {
  item: StreamingContent;
  onPress: (id: string, type: string) => void;
}

interface DropUpMenuProps {
  visible: boolean;
  onClose: () => void;
  item: StreamingContent;
  onOptionSelect: (option: string) => void;
}

const DropUpMenu = ({ visible, onClose, item, onOptionSelect }: DropUpMenuProps) => {
  const translateY = useSharedValue(300);
  const opacity = useSharedValue(0);
  const isDarkMode = useColorScheme() === 'dark';
  const SNAP_THRESHOLD = 100;

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 300 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(300, { duration: 300 });
    }
  }, [visible]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      // Store initial position if needed
    })
    .onUpdate((event) => {
      if (event.translationY > 0) { // Only allow dragging downwards
        translateY.value = event.translationY;
        opacity.value = interpolate(
          event.translationY,
          [0, 300],
          [1, 0],
          Extrapolate.CLAMP
        );
      }
    })
    .onEnd((event) => {
      if (event.translationY > SNAP_THRESHOLD || event.velocityY > 500) {
        translateY.value = withTiming(300, { duration: 300 });
        opacity.value = withTiming(0, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 300 });
        opacity.value = withTiming(1, { duration: 200 });
      }
    });

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const menuOptions = [
    {
      icon: item.inLibrary ? 'bookmark' : 'bookmark-border',
      label: item.inLibrary ? 'Remove from Library' : 'Add to Library',
      action: 'library'
    },
    {
      icon: 'check-circle',
      label: 'Mark as Watched',
      action: 'watched'
    },
    {
      icon: 'playlist-add',
      label: 'Add to Playlist',
      action: 'playlist'
    },
    {
      icon: 'share',
      label: 'Share',
      action: 'share'
    }
  ];

  const backgroundColor = isDarkMode ? '#1A1A1A' : '#FFFFFF';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, overlayStyle]}>
          <Pressable style={styles.modalOverlayPressable} onPress={onClose} />
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.menuContainer, menuStyle, { backgroundColor }]}>
              <View style={styles.dragHandle} />
              <View style={styles.menuHeader}>
                <ExpoImage
                  source={{ uri: item.poster }}
                  style={styles.menuPoster}
                  contentFit="cover"
                />
                <View style={styles.menuTitleContainer}>
                  <Text style={[styles.menuTitle, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}>
                    {item.name}
                  </Text>
                  {item.year && (
                    <Text style={[styles.menuYear, { color: isDarkMode ? '#999999' : '#666666' }]}>
                      {item.year}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.menuOptions}>
                {menuOptions.map((option, index) => (
                  <TouchableOpacity
                    key={option.action}
                    style={[
                      styles.menuOption,
                      { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                      index === menuOptions.length - 1 && styles.lastMenuOption
                    ]}
                    onPress={() => {
                      onOptionSelect(option.action);
                      onClose();
                    }}
                  >
                    <MaterialIcons
                      name={option.icon as "bookmark" | "check-circle" | "playlist-add" | "share" | "bookmark-border"}
                      size={24}
                      color={isDarkMode ? '#FFFFFF' : '#000000'}
                    />
                    <Text style={[
                      styles.menuOptionText,
                      { color: isDarkMode ? '#FFFFFF' : '#000000' }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const ContentItem = ({ item: initialItem, onPress }: ContentItemProps) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [localItem, setLocalItem] = useState(initialItem);
  const [isWatched, setIsWatched] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleLongPress = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handlePress = useCallback(() => {
    onPress(localItem.id, localItem.type);
  }, [localItem.id, localItem.type, onPress]);

  const handleOptionSelect = useCallback((option: string) => {
    switch (option) {
      case 'library':
        if (localItem.inLibrary) {
          catalogService.removeFromLibrary(localItem.type, localItem.id);
        } else {
          catalogService.addToLibrary(localItem);
        }
        break;
      case 'watched':
        setIsWatched(prev => !prev);
        break;
      case 'playlist':
        break;
      case 'share':
        break;
    }
  }, [localItem]);

  const handleMenuClose = useCallback(() => {
    setMenuVisible(false);
  }, []);

  useEffect(() => {
    setLocalItem(initialItem);
  }, [initialItem]);

  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates((libraryItems) => {
      const isInLibrary = libraryItems.some(
        libraryItem => libraryItem.id === localItem.id && libraryItem.type === localItem.type
      );
      setLocalItem(prev => ({ ...prev, inLibrary: isInLibrary }));
    });

    return () => unsubscribe();
  }, [localItem.id, localItem.type]);

  return (
    <>
      <TouchableOpacity
        style={styles.contentItem}
        activeOpacity={0.7}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={300}
      >
        <View style={styles.contentItemContainer}>
          <ExpoImage
            source={{ uri: localItem.poster }}
            style={styles.poster}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            onLoadEnd={() => setImageLoaded(true)}
          />
          {!imageLoaded && (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.elevation2 }]}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          )}
          {isWatched && (
            <View style={styles.watchedIndicator}>
              <MaterialIcons name="check-circle" size={24} color="#00C853" />
            </View>
          )}
          {localItem.inLibrary && (
            <View style={styles.libraryBadge}>
              <MaterialIcons name="bookmark" size={16} color="#FFFFFF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
      
      <DropUpMenu
        visible={menuVisible}
        onClose={handleMenuClose}
        item={localItem}
        onOptionSelect={handleOptionSelect}
      />
    </>
  );
};

// Sample categories (real app would get these from API)
const SAMPLE_CATEGORIES: Category[] = [
  { id: 'movie', name: 'Movies' },
  { id: 'series', name: 'Series' },
  { id: 'channel', name: 'Channels' },
];

const SkeletonCatalog = () => (
  <View style={styles.catalogContainer}>
    <View style={styles.catalogHeader}>
      <View style={[styles.skeletonBox, { width: 150, height: 24 }]} />
      <View style={[styles.skeletonBox, { width: 80, height: 20 }]} />
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catalogList}>
      {[1, 2, 3, 4].map((_, index) => (
        <View key={index} style={[styles.contentItem, styles.skeletonPoster]} />
      ))}
    </ScrollView>
  </View>
);

const SkeletonFeatured = () => (
  <View style={styles.featuredContainer}>
    <View style={[styles.skeletonBox, styles.skeletonFeatured]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
        style={styles.featuredGradient}
      >
        <View style={styles.featuredContent}>
          <View style={[styles.skeletonBox, { width: width * 0.6, height: 60, marginBottom: 16 }]} />
          <View style={styles.genreContainer}>
            {[1, 2, 3].map((_, index) => (
              <View key={index} style={[styles.skeletonBox, { width: 80, height: 24, marginRight: 8 }]} />
            ))}
          </View>
          <View style={[styles.skeletonBox, { width: width * 0.8, height: 60, marginTop: 16 }]} />
          <View style={styles.featuredButtons}>
            <View style={[styles.skeletonBox, { flex: 1, height: 50, marginRight: 12, borderRadius: 25 }]} />
            <View style={[styles.skeletonBox, { flex: 1, height: 50, borderRadius: 25 }]} />
          </View>
        </View>
      </LinearGradient>
    </View>
  </View>
);

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isDarkMode = useColorScheme() === 'dark';
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('movie');
  const [featuredContent, setFeaturedContent] = useState<StreamingContent | null>(null);
  const [allFeaturedContent, setAllFeaturedContent] = useState<StreamingContent[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogContent[]>([]);
  const [imagesPreloaded, setImagesPreloaded] = useState(false);
  const [loadingImages, setLoadingImages] = useState(true);
  const maxRetries = 3;
  const { lastUpdate } = useCatalogContext();
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    StatusBar.setTranslucent(true);
    StatusBar.setBackgroundColor('transparent');
    return () => {
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor(colors.darkBackground);
    };
  }, []);

  // Pre-warm the metadata screen
  useEffect(() => {
    // Pre-warm the navigation
    navigation.addListener('beforeRemove', () => {});
    
    return () => {
      navigation.removeListener('beforeRemove', () => {});
    };
  }, [navigation]);

  // Function to rotate featured content
  const rotateFeaturedContent = useCallback(() => {
    if (allFeaturedContent.length > 0) {
      const currentIndex = allFeaturedContent.findIndex(item => item.id === featuredContent?.id);
      const nextIndex = (currentIndex + 1) % allFeaturedContent.length;
      setFeaturedContent(allFeaturedContent[nextIndex]);
    }
  }, [allFeaturedContent, featuredContent]);

  // Set up rotation interval
  useEffect(() => {
    const interval = setInterval(rotateFeaturedContent, 20000); // Rotate every 20 seconds
    return () => clearInterval(interval);
  }, [rotateFeaturedContent]);

  // Function to preload images
  const preloadImages = useCallback(async (content: StreamingContent[]) => {
    try {
      setLoadingImages(true);
      const imagePromises = content.map(item => {
        const imagesToLoad = [
          item.poster,
          item.banner,
          item.logo
        ].filter(Boolean) as string[];

        return Promise.all(
          imagesToLoad.map(imageUrl =>
            ExpoImage.prefetch(imageUrl)
          )
        );
      });

      await Promise.all(imagePromises);
      setImagesPreloaded(true);
    } catch (error) {
      console.error('Error preloading images:', error);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const loadContent = useCallback(async (forceRefresh = false) => {
    try {
      if (!forceRefresh && !loading && !refreshing) {
        setLoading(true);
      }
      
      // Helper function to delay execution
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Try loading content with retries
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          // Clear existing catalogs when forcing refresh
          if (forceRefresh) {
            setCatalogs([]);
            setAllFeaturedContent([]);
            setFeaturedContent(null);
          }

          // Load catalogs from service
          const homeCatalogs = await catalogService.getHomeCatalogs();
          
          // If no catalogs found, wait and retry
          if (homeCatalogs.length === 0) {
            attempt++;
            console.log(`No catalogs found, retrying... (attempt ${attempt})`);
            await delay(2000);
            continue;
          }

          // Create a map to store unique catalogs by their content
          const uniqueCatalogsMap = new Map();
          
          homeCatalogs.forEach(catalog => {
            const contentKey = catalog.items.map(item => item.id).sort().join(',');
            if (!uniqueCatalogsMap.has(contentKey)) {
              uniqueCatalogsMap.set(contentKey, catalog);
            }
          });

          const uniqueCatalogs = Array.from(uniqueCatalogsMap.values());
          const popularCatalog = uniqueCatalogs.find(catalog => 
            catalog.name.toLowerCase().includes('popular') || 
            catalog.name.toLowerCase().includes('top') ||
            catalog.id.toLowerCase().includes('top')
          );

          // Set catalogs showing all unique content
          setCatalogs(uniqueCatalogs);

          // Set featured content and preload images
          if (popularCatalog && popularCatalog.items.length > 0) {
            setAllFeaturedContent(popularCatalog.items);
            const randomIndex = Math.floor(Math.random() * popularCatalog.items.length);
            setFeaturedContent(popularCatalog.items[randomIndex]);
            
            // Preload images for featured content and first few items of each catalog
            const contentToPreload = [
              ...popularCatalog.items.slice(0, 5),
              ...uniqueCatalogs.flatMap(catalog => catalog.items.slice(0, 3))
            ];
            await preloadImages(contentToPreload);
          } else if (uniqueCatalogs.length > 0 && uniqueCatalogs[0].items.length > 0) {
            setAllFeaturedContent(uniqueCatalogs[0].items);
            setFeaturedContent(uniqueCatalogs[0].items[0]);
            
            // Preload images for first catalog
            await preloadImages(uniqueCatalogs[0].items.slice(0, 5));
          }

          return;
        } catch (error) {
          attempt++;
          console.error(`Failed to load content (attempt ${attempt}):`, error);
          if (attempt < maxRetries) {
            await delay(2000);
          }
        }
      }

      console.error('All attempts to load content failed');
      setCatalogs([]);
      setAllFeaturedContent([]);
      setFeaturedContent(null);

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [maxRetries, preloadImages, loading, refreshing]);

  // Reset retry count when refreshing manually
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadContent(true);
  }, [loadContent]);

  // Load content initially and when lastUpdate changes
  useEffect(() => {
    loadContent(true);
  }, [loadContent, lastUpdate]);

  // Check if content is in library
  useEffect(() => {
    if (featuredContent) {
      const checkLibrary = async () => {
        const items = await catalogService.getLibraryItems();
        setIsSaved(items.some(item => item.id === featuredContent.id));
      };
      checkLibrary();
    }
  }, [featuredContent]);

  // Subscribe to library updates
  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
      if (featuredContent) {
        setIsSaved(items.some(item => item.id === featuredContent.id));
      }
    });

    return () => unsubscribe();
  }, [featuredContent]);

  const handleSaveToLibrary = useCallback(async () => {
    if (!featuredContent) return;
    
    try {
      if (isSaved) {
        await catalogService.removeFromLibrary(featuredContent.type, featuredContent.id);
      } else {
        await catalogService.addToLibrary(featuredContent);
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error updating library:', error);
    }
  }, [featuredContent, isSaved]);

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  const handleContentPress = useCallback((id: string, type: string) => {
    // Immediate navigation without any delays
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  const handlePlayStream = useCallback((stream: Stream) => {
    if (!featuredContent) return;
    
    navigation.navigate('Player', {
      uri: stream.url,
      title: featuredContent.name,
      year: featuredContent.year,
      quality: stream.title?.match(/(\d+)p/)?.[1] || undefined,
      streamProvider: stream.name,
      id: featuredContent.id,
      type: featuredContent.type
    });
  }, [featuredContent, navigation]);

  const renderFeaturedContent = () => {
    if (!featuredContent) return null;

    return (
      <View style={styles.featuredContainer}>
        <ImageBackground
          source={{ uri: featuredContent.banner || featuredContent.poster }}
          style={styles.featuredBanner}
          resizeMode="cover"
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(0,0,0,0.2)',
              'rgba(0,0,0,0.6)',
              'rgba(0,0,0,0.8)',
              colors.darkBackground
            ]}
            locations={[0, 0.3, 0.6, 0.8, 1]}
            style={styles.featuredGradient}
          >
            <View style={{ flex: 1 }} />
            <View style={styles.featuredContent}>
              {featuredContent.logo ? (
                <ExpoImage
                  source={{ uri: featuredContent.logo }}
                  style={styles.featuredLogo}
                  contentFit="contain"
                  transition={200}
                />
              ) : (
                <Text style={styles.featuredTitle}>{featuredContent.name}</Text>
              )}

              <View style={styles.genreContainer}>
                {featuredContent.genres?.slice(0, 3).map((genre, index, array) => (
                  <React.Fragment key={index}>
                    <Text style={styles.genreText}>{genre}</Text>
                    {index < array.length - 1 && (
                      <Text style={styles.genreDot}>•</Text>
                    )}
                  </React.Fragment>
                ))}
              </View>

              <View style={styles.featuredButtons}>
                <TouchableOpacity 
                  style={styles.myListButton}
                  onPress={handleSaveToLibrary}
                >
                  <MaterialIcons 
                    name={isSaved ? "bookmark" : "bookmark-border"} 
                    size={24} 
                    color={colors.white} 
                  />
                  <Text style={styles.myListButtonText}>
                    {isSaved ? "Saved" : "Save"}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.playButton}
                  onPress={() => {
                    if (featuredContent) {
                      navigation.navigate('Streams', { 
                        id: featuredContent.id, 
                        type: featuredContent.type
                      });
                    }
                  }}
                >
                  <MaterialIcons name="play-arrow" size={24} color={colors.black} />
                  <Text style={styles.playButtonText}>Play</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.infoButton}
                  onPress={() => navigation.navigate('Metadata', {
                    id: featuredContent?.id, 
                    type: featuredContent?.type
                  })}
                >
                  <MaterialIcons name="info-outline" size={24} color={colors.white} />
                  <Text style={styles.infoButtonText}>Info</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>
      </View>
    );
  };

  const renderContentItem = useCallback(({ item }: { item: StreamingContent }) => {
    return (
      <ContentItem 
        item={item} 
        onPress={handleContentPress}
      />
    );
  }, [handleContentPress]);

  const renderCatalog = ({ item }: { item: CatalogContent }) => {
    return (
      <View style={styles.catalogContainer}>
        <View style={styles.catalogHeader}>
          <View style={styles.titleContainer}>
            <Text style={styles.catalogTitle}>{item.name}</Text>
            <View style={styles.titleUnderline} />
          </View>
          <TouchableOpacity
            onPress={() => 
              navigation.navigate('Catalog', {
                id: item.id,
                type: item.type,
                addonId: item.addon
              })
            }
            style={styles.seeAllButton}
          >
            <Text style={styles.seeAllText}>See More</Text>
            <MaterialIcons name="arrow-forward" color={colors.primary} size={16} />
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={item.items}
          renderItem={renderContentItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catalogList}
          snapToInterval={POSTER_WIDTH + 10}
          decelerationRate="fast"
          snapToAlignment="start"
          ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        />
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonFeatured />
          {[1, 2, 3].map((_, index) => (
            <SkeletonCatalog key={index} />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.text} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Featured Content */}
        {renderFeaturedContent()}

        {/* This Week Section */}
        <ThisWeekSection />

        {/* Catalogs */}
        {catalogs.length > 0 ? (
          <FlatList
            data={catalogs}
            renderItem={renderCatalog}
            keyExtractor={(item, index) => `${item.addon}-${item.id}-${index}`}
            scrollEnabled={false}
          />
        ) : (
          <View style={styles.emptyCatalog}>
            <Text style={{ color: colors.textDark }}>
              No content available. Pull down to refresh.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const { width, height } = Dimensions.get('window');
const POSTER_WIDTH = (width - 40) / 2.7;

const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredContainer: {
    width: '100%',
    height: height * 0.65,
    marginTop: 0,
    marginBottom: 0,
    position: 'relative',
  },
  featuredBanner: {
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  featuredContent: {
    padding: 24,
    paddingBottom: 16,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
  },
  featuredLogo: {
    width: width * 0.7,
    height: 100,
    marginBottom: 0,
    alignSelf: 'center',
  },
  featuredTitle: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 0,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  genreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    flexWrap: 'wrap',
    gap: 4,
  },
  genreText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
  },
  genreDot: {
    color: colors.white,
    fontSize: 13,
    marginHorizontal: 4,
    opacity: 0.6,
  },
  featuredButtons: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    width: '100%',
    flex: 1,
    maxHeight: 60,
    paddingTop: 12,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 100,
    backgroundColor: colors.white,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flex: 0,
    width: 150,
  },
  myListButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 6,
    width: 40,
    height: 41,
    flex: null,
  },
  infoButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 4,
    width: 40,
    height: 39,
    flex: null,
  },
  playButtonText: {
    color: colors.black,
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  myListButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  infoButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  catalogContainer: {
    marginBottom: 24,
    paddingTop: 0,
    marginTop: 12,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  titleContainer: {
    position: 'relative',
  },
  catalogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.highEmphasis,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    width: 40,
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 1.5,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevation1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  seeAllText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 4,
  },
  catalogList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    margin: 0,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imdbLogo: {
    width: 35,
    height: 17,
    marginRight: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ratingBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 3,
  },
  emptyCatalog: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: colors.elevation1,
    margin: 16,
    borderRadius: 16,
  },
  skeletonBox: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  skeletonFeatured: {
    width: '100%',
    height: height * 0.6,
    backgroundColor: colors.elevation2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  skeletonPoster: {
    backgroundColor: colors.elevation1,
    marginHorizontal: 4,
    borderRadius: 12,
  },
  contentItemContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  libraryIndicatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  libraryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.transparentDark,
  },
  modalOverlayPressable: {
    flex: 1,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.transparentLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  menuContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Platform.select({ ios: 40, android: 24 }),
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  menuHeader: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuPoster: {
    width: 60,
    height: 90,
    borderRadius: 8,
  },
  menuTitleContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuYear: {
    fontSize: 14,
  },
  menuOptions: {
    paddingTop: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastMenuOption: {
    borderBottomWidth: 0,
  },
  menuOptionText: {
    fontSize: 16,
    marginLeft: 16,
  },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.transparentDark,
    borderRadius: 12,
    padding: 2,
  },
  libraryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.transparentDark,
    borderRadius: 8,
    padding: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
});

export default HomeScreen; 