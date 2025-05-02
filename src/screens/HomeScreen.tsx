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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
import ContinueWatchingSection from '../components/home/ContinueWatchingSection';
import * as Haptics from 'expo-haptics';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import { storageService } from '../services/storageService';
import { useHomeCatalogs } from '../hooks/useHomeCatalogs';
import { useFeaturedContent } from '../hooks/useFeaturedContent';
import { useSettings, settingsEmitter } from '../hooks/useSettings';

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

interface ContinueWatchingRef {
  refresh: () => Promise<boolean>;
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
                      color={colors.primary}
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
  const [imageError, setImageError] = useState(false);

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
            transition={300}
            cachePolicy="memory-disk"
            recyclingKey={`poster-${localItem.id}`}
            onLoadStart={() => {
              setImageLoaded(false);
              setImageError(false);
            }}
            onLoadEnd={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
          {(!imageLoaded || imageError) && (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.elevation2 }]}>
              {!imageError ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <MaterialIcons name="broken-image" size={24} color={colors.lightGray} />
              )}
            </View>
          )}
          {isWatched && (
            <View style={styles.watchedIndicator}>
              <MaterialIcons name="check-circle" size={22} color={colors.success} />
            </View>
          )}
          {localItem.inLibrary && (
            <View style={styles.libraryBadge}>
              <MaterialIcons name="bookmark" size={16} color={colors.white} />
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
    <View style={styles.loadingPlaceholder}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  </View>
);

const SkeletonFeatured = () => (
  <View style={styles.featuredLoadingContainer}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={styles.loadingText}>Loading featured content...</Text>
  </View>
);

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isDarkMode = useColorScheme() === 'dark';
  const continueWatchingRef = useRef<ContinueWatchingRef>(null);
  const { settings } = useSettings();
  const [showHeroSection, setShowHeroSection] = useState(settings.showHeroSection);
  const [featuredContentSource, setFeaturedContentSource] = useState(settings.featuredContentSource);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasContinueWatching, setHasContinueWatching] = useState(false);

  const { 
    catalogs, 
    loading: catalogsLoading, 
    refreshing: catalogsRefreshing, 
    refreshCatalogs 
  } = useHomeCatalogs();
  
  const { 
    featuredContent, 
    loading: featuredLoading, 
    isSaved, 
    handleSaveToLibrary, 
    refreshFeatured 
  } = useFeaturedContent();

  // Only count feature section as loading if it's enabled in settings
  const isLoading = (showHeroSection ? featuredLoading : false) || catalogsLoading;
  const isRefreshing = catalogsRefreshing;

  // React to settings changes
  useEffect(() => {
    setShowHeroSection(settings.showHeroSection);
    setFeaturedContentSource(settings.featuredContentSource);
  }, [settings]);

  // If featured content source changes, refresh featured content with debouncing
  useEffect(() => {
    if (showHeroSection) {
      // Clear any existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Set a new timeout to debounce the refresh
      refreshTimeoutRef.current = setTimeout(() => {
        refreshFeatured();
        refreshTimeoutRef.current = null;
      }, 300);
    }
    
    // Cleanup the timeout on unmount
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [featuredContentSource, showHeroSection, refreshFeatured]);

  useFocusEffect(
    useCallback(() => {
      const statusBarConfig = () => {
        StatusBar.setBarStyle("light-content");
    StatusBar.setTranslucent(true);
    StatusBar.setBackgroundColor('transparent');
      };
      
      statusBarConfig();
      
      return () => {
        // Don't change StatusBar settings when unfocusing to prevent layout shifts
        // Only set these when component unmounts completely
      };
    }, [])
  );

  useEffect(() => {
    // Only run cleanup when component unmounts completely, not on unfocus
    return () => {
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor(colors.darkBackground);
    };
  }, []);

  useEffect(() => {
    navigation.addListener('beforeRemove', () => {});
    return () => {
      navigation.removeListener('beforeRemove', () => {});
    };
  }, [navigation]);

  const preloadImages = useCallback(async (content: StreamingContent[]) => {
    if (!content.length) return;
    
    try {
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
    } catch (error) {
      console.error('Error preloading images:', error);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      const refreshTasks = [
        refreshCatalogs(),
        continueWatchingRef.current?.refresh(),
      ];
      
      // Only refresh featured content if hero section is enabled
      if (showHeroSection) {
        refreshTasks.push(refreshFeatured());
      }
      
      await Promise.all(refreshTasks);
    } catch (error) {
      logger.error('Error during refresh:', error);
    }
  }, [refreshFeatured, refreshCatalogs, showHeroSection]);

  const handleContentPress = useCallback((id: string, type: string) => {
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

  const refreshContinueWatching = useCallback(async () => {
    if (continueWatchingRef.current) {
      const hasContent = await continueWatchingRef.current.refresh();
      setHasContinueWatching(hasContent);
    }
  }, []);

  useEffect(() => {
    const handlePlaybackComplete = () => {
      refreshContinueWatching();
    };

    const unsubscribe = navigation.addListener('focus', () => {
      refreshContinueWatching();
    });

    return () => {
      unsubscribe();
    };
  }, [navigation, refreshContinueWatching]);

  const renderFeaturedContent = () => {
    if (!featuredContent) {
      return <SkeletonFeatured />;
    }

    return (
      <TouchableOpacity 
        activeOpacity={0.9} 
        onPress={() => {
          if (featuredContent) {
            navigation.navigate('Metadata', {
              id: featuredContent.id,
              type: featuredContent.type
            });
          }
        }}
        style={styles.featuredContainer}
      >
        <ImageBackground
          source={{ uri: featuredContent.banner || featuredContent.poster }}
          style={styles.featuredImage}
          resizeMode="cover"
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(0,0,0,0.1)',
              'rgba(0,0,0,0.7)',
              colors.darkBackground,
            ]}
            locations={[0, 0.3, 0.7, 1]}
            style={styles.featuredGradient}
          >
            <Animated.View style={styles.featuredContentContainer} entering={FadeIn.duration(600)}>
              {featuredContent.logo ? (
                <ExpoImage 
                  source={{ uri: featuredContent.logo }} 
                  style={styles.featuredLogo}
                  contentFit="contain"
                />
              ) : (
                <Text style={styles.featuredTitleText}>{featuredContent.name}</Text>
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
                  onPress={async () => {
                    if (featuredContent) {
                      navigation.navigate('Metadata', {
                        id: featuredContent.id,
                        type: featuredContent.type
                      });
                    }
                  }}
                >
                  <MaterialIcons name="info-outline" size={24} color={colors.white} />
                  <Text style={styles.infoButtonText}>Info</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </LinearGradient>
        </ImageBackground>
      </TouchableOpacity>
    );
  };

  const renderContentItem = useCallback(({ item, index }: { item: StreamingContent, index: number }) => {
    return (
      <Animated.View
        entering={FadeIn.duration(300).delay(100 + (index * 40))}
      >
        <ContentItem 
          item={item} 
          onPress={handleContentPress}
        />
      </Animated.View>
    );
  }, [handleContentPress]);

  const renderCatalog = ({ item }: { item: CatalogContent }) => {
    return (
      <Animated.View 
        style={styles.catalogContainer}
        entering={FadeIn.duration(400).delay(50)}
      >
        <View style={styles.catalogHeader}>
          <View style={styles.titleContainer}>
            <Text style={styles.catalogTitle}>{item.name}</Text>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.titleUnderline}
            />
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
          renderItem={({ item, index }) => renderContentItem({ item, index })}
          keyExtractor={(item) => `${item.id}-${item.type}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catalogList}
          snapToInterval={POSTER_WIDTH + 12}
          decelerationRate="fast"
          snapToAlignment="start"
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          getItemLayout={(data, index) => ({
            length: POSTER_WIDTH + 12,
            offset: (POSTER_WIDTH + 12) * index,
            index,
          })}
        />
      </Animated.View>
    );
  };

  if (isLoading && !isRefreshing) {
    return (
      <View style={[styles.container]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <View style={styles.loadingMainContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your content...</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <ScrollView
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={handleRefresh} 
            tintColor={colors.primary} 
            colors={[colors.primary, colors.secondary]}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Platform.OS === 'ios' ? 0 : 0 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {showHeroSection && renderFeaturedContent()}

        <Animated.View entering={FadeIn.duration(400).delay(150)}>
          <ThisWeekSection />
        </Animated.View>

        {hasContinueWatching && (
        <Animated.View entering={FadeIn.duration(400).delay(250)}>
          <ContinueWatchingSection ref={continueWatchingRef} />
        </Animated.View>
        )}

        {catalogs.length > 0 ? (
          catalogs.map((catalog, index) => (
            <View key={`${catalog.addon}-${catalog.id}-${index}`}>
              {renderCatalog({ item: catalog })}
            </View>
          ))
        ) : (
          !catalogsLoading && (
            <View style={styles.emptyCatalog}>
              <MaterialIcons name="movie-filter" size={40} color={colors.textDark} />
              <Text style={{ color: colors.textDark, marginTop: 8, fontSize: 16, textAlign: 'center' }}>
                No content available
              </Text>
              <TouchableOpacity
                style={styles.addCatalogButton}
                onPress={() => navigation.navigate('Settings')}
              >
                <MaterialIcons name="add-circle" size={20} color={colors.white} />
                <Text style={styles.addCatalogButtonText}>Add Catalogs</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const { width, height } = Dimensions.get('window');
const POSTER_WIDTH = (width - 50) / 3;

const styles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredContainer: {
    width: '100%',
    height: height * 0.6,
    marginTop: Platform.OS === 'ios' ? 0 : 0,
    marginBottom: 8,
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
    gap: 12,
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
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 4,
  },
  genreText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.9,
  },
  genreDot: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 4,
  },
  featuredButtons: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    width: '100%',
    flex: 1,
    maxHeight: 65,
    paddingTop: 16,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
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
    width: 44,
    height: 44,
    flex: null,
  },
  infoButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 4,
    width: 44,
    height: 44,
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
    marginTop: 16,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
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
    width: 60,
    height: 3,
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
    paddingBottom: 12,
    paddingTop: 6,
  },
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    margin: 0,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
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
    borderRadius: 16,
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
    borderRadius: 16,
  },
  contentItemContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
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
    marginBottom: 10,
  },
  menuContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
    borderRadius: 12,
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
    borderRadius: 16,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredContentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  featuredTitleText: {
    color: colors.highEmphasis,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  addCatalogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    marginTop: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  addCatalogButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingMainContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  loadingPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.elevation1,
    borderRadius: 12,
    marginHorizontal: 16,
  },
  featuredLoadingContainer: {
    height: height * 0.4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.elevation1,
  },
});

export default HomeScreen; 