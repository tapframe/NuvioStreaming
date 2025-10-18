import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Toast } from 'toastify-react-native';
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
import Animated, { FadeIn } from 'react-native-reanimated';

interface ContentItemProps {
  item: StreamingContent;
  onPress: (id: string, type: string) => void;
  shouldLoadImage?: boolean;
  deferMs?: number;
}

const { width } = Dimensions.get('window');

// Dynamic poster calculation based on screen width - show 1/4 of next poster
const calculatePosterLayout = (screenWidth: number) => {
  // Detect if device is a tablet (width >= 768px is common tablet breakpoint)
  const isTablet = screenWidth >= 768;

  const MIN_POSTER_WIDTH = isTablet ? 140 : 100; // Bigger minimum for tablets
  const MAX_POSTER_WIDTH = isTablet ? 180 : 130; // Bigger maximum for tablets
  const LEFT_PADDING = 16; // Left padding
  const SPACING = 8; // Space between posters

  // Calculate available width for posters (reserve space for left padding)
  const availableWidth = screenWidth - LEFT_PADDING;

  // Try different numbers of full posters to find the best fit
  let bestLayout = { numFullPosters: 3, posterWidth: isTablet ? 160 : 120 };

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

  useEffect(() => {
    // Reset image error state when item changes, allowing for retry on re-render
    setImageError(false);
  }, [item.id, item.poster]);

  const { currentTheme } = useTheme();
  const { settings, isLoaded } = useSettings();
  const posterRadius = typeof settings.posterBorderRadius === 'number' ? settings.posterBorderRadius : 12;
  // Memoize poster width calculation to avoid recalculating on every render
  const posterWidth = React.useMemo(() => {
    switch (settings.posterSize) {
      case 'small':
        return Math.max(100, Math.min(POSTER_WIDTH - 10, POSTER_WIDTH));
      case 'large':
        return Math.min(POSTER_WIDTH + 20, POSTER_WIDTH + 30);
      default:
        return POSTER_WIDTH;
    }
  }, [settings.posterSize]);

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
          Toast.info('Removed from Library');
        } else {
          catalogService.addToLibrary(item);
          Toast.success('Added to Library');
        }
        break;
      case 'watched': {
        const targetWatched = !isWatched;
        setIsWatched(targetWatched);
        try {
          await AsyncStorage.setItem(`watched:${item.type}:${item.id}`, targetWatched ? 'true' : 'false');
        } catch {}
        Toast.info(targetWatched ? 'Marked as Watched' : 'Marked as Unwatched');
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
    }
  }, [item, inLibrary, isWatched]);

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
          </View>
        </TouchableOpacity>
        {settings.showPosterTitles && (
          <Text style={[styles.title, { color: currentTheme.colors.text }]} numberOfLines={2}>
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
  title: {
    fontSize: 13,
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