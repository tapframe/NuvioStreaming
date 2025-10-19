import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { DeviceEventEmitter } from 'react-native';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions, Platform, Text, Share } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { catalogService, StreamingContent } from '../../services/catalogService';
import { DropUpMenu } from './DropUpMenu';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageService } from '../../services/storageService';
import { TraktService } from '../../services/traktService';
import { useTraktContext } from '../../contexts/TraktContext';
import Animated, { FadeIn } from 'react-native-reanimated';

interface ContentItemProps {
  item: StreamingContent;
  onPress: (id: string, type: string) => void;
  shouldLoadImage?: boolean;
  deferMs?: number;
}

const { width } = Dimensions.get('window');

// Enhanced responsive breakpoints
const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  largeTablet: 1024,
  tv: 1440,
};

const getDeviceType = (screenWidth: number) => {
  if (screenWidth >= BREAKPOINTS.tv) return 'tv';
  if (screenWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
  if (screenWidth >= BREAKPOINTS.tablet) return 'tablet';
  return 'phone';
};

// Dynamic poster calculation based on screen width - show 1/4 of next poster
const calculatePosterLayout = (screenWidth: number) => {
  const deviceType = getDeviceType(screenWidth);
  
  // Responsive sizing based on device type
  const MIN_POSTER_WIDTH = deviceType === 'tv' ? 180 : deviceType === 'largeTablet' ? 160 : deviceType === 'tablet' ? 140 : 100;
  const MAX_POSTER_WIDTH = deviceType === 'tv' ? 220 : deviceType === 'largeTablet' ? 200 : deviceType === 'tablet' ? 180 : 130;
  const LEFT_PADDING = deviceType === 'tv' ? 32 : deviceType === 'largeTablet' ? 28 : deviceType === 'tablet' ? 24 : 16;
  const SPACING = deviceType === 'tv' ? 12 : deviceType === 'largeTablet' ? 10 : deviceType === 'tablet' ? 8 : 8;

  // Calculate available width for posters (reserve space for left padding)
  const availableWidth = screenWidth - LEFT_PADDING;

  // Try different numbers of full posters to find the best fit
  let bestLayout = { 
    numFullPosters: 3, 
    posterWidth: deviceType === 'tv' ? 200 : deviceType === 'largeTablet' ? 180 : deviceType === 'tablet' ? 160 : 120 
  };

  for (let n = 3; n <= 6; n++) {
    // Calculate poster width needed for N full posters + 0.25 partial poster
    // Formula: N * posterWidth + (N-1) * spacing + 0.25 * posterWidth = availableWidth - rightPadding
    // Simplified: posterWidth * (N + 0.25) + (N-1) * spacing = availableWidth - rightPadding
    // We'll use minimal right padding (8px) to maximize space
    const usableWidth = availableWidth - 8;
    const posterWidth = (usableWidth - (n - 1) * SPACING) / (n + 0.25);

    if (posterWidth >= MIN_POSTER_WIDTH && posterWidth <= MAX_POSTER_WIDTH) {
      bestLayout = { numFullPosters: n, posterWidth };
    }
  }

  return {
    numFullPosters: bestLayout.numFullPosters,
    posterWidth: bestLayout.posterWidth,
    spacing: SPACING,
    partialPosterWidth: bestLayout.posterWidth * 0.25 // 1/4 of next poster
  };
};

const posterLayout = calculatePosterLayout(width);
const POSTER_WIDTH = posterLayout.posterWidth;

const ContentItem = ({ item, onPress, shouldLoadImage: shouldLoadImageProp, deferMs = 0 }: ContentItemProps) => {
  // Track inLibrary status locally to force re-render
  const [inLibrary, setInLibrary] = useState(!!item.inLibrary);

  useEffect(() => {
    // Subscribe to library updates and update local state if this item's status changes
    const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
      const found = items.find((libItem) => libItem.id === item.id && libItem.type === item.type);
      setInLibrary(!!found);
    });
    return () => unsubscribe();
  }, [item.id, item.type]);

    // Load watched state from AsyncStorage when item changes
  useEffect(() => {
    const updateWatched = () => {
      AsyncStorage.getItem(`watched:${item.type}:${item.id}`).then(val => setIsWatched(val === 'true'));
    };
    updateWatched();
    const sub = DeviceEventEmitter.addListener('watchedStatusChanged', updateWatched);
    return () => sub.remove();
  }, [item.id, item.type]);

  const [menuVisible, setMenuVisible] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Trakt integration
  const { isAuthenticated, isInWatchlist, isInCollection, addToWatchlist, removeFromWatchlist, addToCollection, removeFromCollection } = useTraktContext();

  useEffect(() => {
    // Reset image error state when item changes, allowing for retry on re-render
    setImageError(false);
  }, [item.id, item.poster]);

  const { currentTheme } = useTheme();
  const { settings, isLoaded } = useSettings();
  const { showSuccess, showInfo } = useToast();
  const posterRadius = typeof settings.posterBorderRadius === 'number' ? settings.posterBorderRadius : 12;
  // Memoize poster width calculation to avoid recalculating on every render
  const posterWidth = React.useMemo(() => {
    const deviceType = getDeviceType(width);
    const sizeMultiplier = deviceType === 'tv' ? 1.2 : deviceType === 'largeTablet' ? 1.1 : deviceType === 'tablet' ? 1.0 : 0.9;
    
    switch (settings.posterSize) {
      case 'small':
        return Math.max(100, Math.min(POSTER_WIDTH - 10, POSTER_WIDTH)) * sizeMultiplier;
      case 'large':
        return Math.min(POSTER_WIDTH + 20, POSTER_WIDTH + 30) * sizeMultiplier;
      default:
        return POSTER_WIDTH * sizeMultiplier;
    }
  }, [settings.posterSize, width]);

  // Intersection observer simulation for lazy loading
  const itemRef = useRef<View>(null);

  const handleLongPress = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handlePress = useCallback(() => {
    onPress(item.id, item.type);
  }, [item.id, item.type, onPress]);

  const handleOptionSelect = useCallback(async (option: string) => {
    switch (option) {
      case 'library':
        if (inLibrary) {
          catalogService.removeFromLibrary(item.type, item.id);
          showInfo('Removed from Library', 'Removed from your local library');
        } else {
          catalogService.addToLibrary(item);
          showSuccess('Added to Library', 'Added to your local library');
        }
        break;
      case 'watched': {
        const targetWatched = !isWatched;
        setIsWatched(targetWatched);
        try {
          await AsyncStorage.setItem(`watched:${item.type}:${item.id}`, targetWatched ? 'true' : 'false');
        } catch {}
        showInfo(targetWatched ? 'Marked as Watched' : 'Marked as Unwatched', targetWatched ? 'Item marked as watched' : 'Item marked as unwatched');
        setTimeout(() => {
          DeviceEventEmitter.emit('watchedStatusChanged');
        }, 100);

        // Best-effort sync: record local progress and push to Trakt if available
        if (targetWatched) {
          try {
            await storageService.setWatchProgress(
              item.id,
              item.type,
              { currentTime: 1, duration: 1, lastUpdated: Date.now() },
              undefined,
              { forceNotify: true, forceWrite: true }
            );
          } catch {}

          if (item.type === 'movie') {
            try {
              const trakt = TraktService.getInstance();
              if (await trakt.isAuthenticated()) {
                await trakt.addToWatchedMovies(item.id);
                try {
                  await storageService.updateTraktSyncStatus(item.id, item.type, true, 100);
                } catch {}
              }
            } catch {}
          }
        }
        setMenuVisible(false);
        break;
      }
      case 'playlist':
        break;
      case 'share': {
        let url = '';
        if (item.id) {
          url = `https://www.imdb.com/title/${item.id}/`;
        }
        const message = `${item.name}\n${url}`;
        Share.share({ message, url, title: item.name });
        break;
      }
      case 'trakt-watchlist': {
        if (isInWatchlist(item.id, item.type as 'movie' | 'show')) {
          await removeFromWatchlist(item.id, item.type as 'movie' | 'show');
          showInfo('Removed from Watchlist', 'Removed from your Trakt watchlist');
        } else {
          await addToWatchlist(item.id, item.type as 'movie' | 'show');
          showSuccess('Added to Watchlist', 'Added to your Trakt watchlist');
        }
        setMenuVisible(false);
        break;
      }
      case 'trakt-collection': {
        if (isInCollection(item.id, item.type as 'movie' | 'show')) {
          await removeFromCollection(item.id, item.type as 'movie' | 'show');
          showInfo('Removed from Collection', 'Removed from your Trakt collection');
        } else {
          await addToCollection(item.id, item.type as 'movie' | 'show');
          showSuccess('Added to Collection', 'Added to your Trakt collection');
        }
        setMenuVisible(false);
        break;
      }
    }
  }, [item, inLibrary, isWatched, isInWatchlist, isInCollection, addToWatchlist, removeFromWatchlist, addToCollection, removeFromCollection, showSuccess, showInfo]);

  const handleMenuClose = useCallback(() => {
    setMenuVisible(false);
  }, []);


  // Memoize optimized poster URL to prevent recalculating
  const optimizedPosterUrl = React.useMemo(() => {
    if (!item.poster || item.poster.includes('placeholder')) {
      return 'https://via.placeholder.com/154x231/333/666?text=No+Image';
    }

    // For TMDB images, use smaller sizes
    if (item.poster.includes('image.tmdb.org')) {
      // Replace any size with w154 (fits 100-130px tiles perfectly)
      return item.poster.replace(/\/w\d+\//, '/w154/');
    }

    // For metahub images, use smaller sizes
    if (item.poster.includes('placeholder')) {
      return item.poster.replace('/medium/', '/small/');
    }

    // Return original URL for other sources to avoid breaking them
    return item.poster;
  }, [item.poster, item.id]);

  // While settings load, render a placeholder with reserved space (poster aspect + title)
  if (!isLoaded) {
    const placeholderRadius = 12;
    return (
      <View style={[styles.itemContainer, { width: posterWidth }]}>
        <View
          style={[
            styles.contentItem,
            {
              width: posterWidth,
              borderRadius: placeholderRadius,
              backgroundColor: currentTheme.colors.elevation1,
            },
          ]}
        />
        {/* Reserve space for title to keep section spacing stable */}
        <View style={{ height: 18, marginTop: 4 }} />
      </View>
    );
  }

  return (
    <>
      <Animated.View style={[styles.itemContainer, { width: posterWidth }]} entering={FadeIn.duration(300)}> 
        <TouchableOpacity
          style={[styles.contentItem, { width: posterWidth, borderRadius: posterRadius }]}
          activeOpacity={0.7}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={300}
        >
          <View ref={itemRef} style={[styles.contentItemContainer, { borderRadius: posterRadius }] }>
            {/* Image with FastImage for aggressive caching */}
            {item.poster ? (
              <FastImage
                source={{ 
                  uri: optimizedPosterUrl,
                  priority: FastImage.priority.normal,
                  cache: FastImage.cacheControl.immutable
                }}
                style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, borderRadius: posterRadius }]}
                resizeMode={FastImage.resizeMode.cover}
                onLoad={() => {
                  setImageError(false);
                }}
                onError={() => {
                  if (__DEV__) console.warn('Image load error for:', item.poster);
                  setImageError(true);
                }}
              />
            ) : (
              // Show placeholder for items without posters
              <View style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, justifyContent: 'center', alignItems: 'center', borderRadius: posterRadius }] }>
                <Text style={{ color: currentTheme.colors.textMuted, fontSize: 10, textAlign: 'center' }}>
                  {item.name.substring(0, 20)}...
                </Text>
              </View>
            )}
            {imageError && (
              <View style={[styles.loadingOverlay, { backgroundColor: currentTheme.colors.elevation1 }]}> 
                <MaterialIcons name="broken-image" size={24} color={currentTheme.colors.textMuted} />
              </View>
            )}
            {isWatched && (
              <View style={styles.watchedIndicator}>
                <MaterialIcons name="check-circle" size={22} color={currentTheme.colors.success} />
              </View>
            )}
            {inLibrary && (
              <View style={styles.libraryBadge}>
                <Feather name="bookmark" size={16} color={currentTheme.colors.white} />
              </View>
            )}
            {isAuthenticated && isInWatchlist(item.id, item.type as 'movie' | 'show') && (
              <View style={styles.traktWatchlistIcon}>
                <MaterialIcons name="playlist-add-check" size={16} color="#E74C3C" />
              </View>
            )}
            {isAuthenticated && isInCollection(item.id, item.type as 'movie' | 'show') && (
              <View style={styles.traktCollectionIcon}>
                <MaterialIcons name="video-library" size={16} color="#3498DB" />
              </View>
            )}
          </View>
        </TouchableOpacity>
        {settings.showPosterTitles && (
          <Text 
            style={[
              styles.title, 
              { 
                color: currentTheme.colors.text,
                fontSize: getDeviceType(width) === 'tv' ? 16 : getDeviceType(width) === 'largeTablet' ? 15 : getDeviceType(width) === 'tablet' ? 14 : 13
              }
            ]} 
            numberOfLines={2}
          >
            {item.name}
          </Text>
        )}
      </Animated.View>

      <DropUpMenu
        visible={menuVisible}
        onClose={handleMenuClose}
        item={item}
        onOptionSelect={handleOptionSelect}
        isSaved={inLibrary}
        isWatched={isWatched}
      />
    </>
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    width: POSTER_WIDTH,
  },
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2 / 3,
    margin: 0,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    elevation: Platform.OS === 'android' ? 1 : 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },
  contentItemContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 12,
    padding: 2,
  },
  libraryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 8,
    padding: 4,
  },
  traktWatchlistIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 2,
  },
  traktCollectionIcon: {
    position: 'absolute',
    top: 8,
    right: 32, // Positioned to the left of watchlist icon
    padding: 2,
  },
  title: {
    fontSize: 13, // Will be overridden responsively
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  }
});

export default React.memo(ContentItem, (prev, next) => {
  // Re-render when identity or poster changes. Caching is handled by FastImage.
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.poster !== next.item.poster) return false;
  return true;
});