import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Toast } from 'toastify-react-native';
import { DeviceEventEmitter } from 'react-native';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions, Platform, Text, Animated, Share } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import tmdbService from '../../services/tmdbService';
import { catalogService, StreamingContent } from '../../services/catalogService';
import { DropUpMenu } from './DropUpMenu';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storageService } from '../../services/storageService';
import { TraktService } from '../../services/traktService';

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

const PLACEHOLDER_BLURHASH = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';

// Simple in-memory cache for TMDB backdrops to avoid repeated fetches while scrolling
const backdropCache: { [key: string]: string } = {};

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
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { currentTheme } = useTheme();
  const { settings, isLoaded } = useSettings();
  const posterRadius = typeof settings.posterBorderRadius === 'number' ? settings.posterBorderRadius : 12;
  const [tmdbBackdrop, setTmdbBackdrop] = useState<string | null>(null);
  const fadeInOpacity = React.useRef(new Animated.Value(0)).current;
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

    // If we've had an error, try metahub fallback
    if (retryCount > 0 && !item.poster.includes('metahub.space')) {
      return `https://images.metahub.space/poster/small/${item.id}/img`;
    }

    // For TMDB images, use smaller sizes
    if (item.poster.includes('image.tmdb.org')) {
      // Replace any size with w154 (fits 100-130px tiles perfectly)
      return item.poster.replace(/\/w\d+\//, '/w154/');
    }

    // For metahub images, use smaller sizes
    if (item.poster.includes('images.metahub.space')) {
      return item.poster.replace('/medium/', '/small/');
    }

    // Return original URL for other sources to avoid breaking them
    return item.poster;
  }, [item.poster, retryCount, item.id]);

  // Optional: fetch TMDB backdrop for catalogs when enabled
  useEffect(() => {
    let cancelled = false;
    const shouldUseBackdrop = settings.useTmdbBackdropsForCatalogs;
    const cacheKey = `${item.type}:${item.id}`;
    if (!shouldUseBackdrop || !item?.id) {
      setTmdbBackdrop(null);
      return;
    }
    if (backdropCache[cacheKey]) {
      setTmdbBackdrop(backdropCache[cacheKey]);
      return;
    }
    (async () => {
      try {
        // item.id is typically IMDb id (tt...)
        let tmdbId: number | null = null;
        if (item.id.startsWith('tt')) {
          tmdbId = await tmdbService.findTMDBIdByIMDB(item.id);
        } else if (item.id.startsWith('tmdb:')) {
          const parts = item.id.split(':');
          tmdbId = parts[1] ? parseInt(parts[1], 10) : null;
        }
        if (!tmdbId) return;
        const lang = (settings.tmdbLanguagePreference || 'en');
        const url = item.type === 'movie'
          ? await tmdbService.getMovieBackdrop(String(tmdbId), lang)
          : await tmdbService.getTvBackdrop(tmdbId, lang);
        if (!cancelled && url) {
          backdropCache[cacheKey] = url;
          setTmdbBackdrop(url);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [item.id, item.type, settings.useTmdbBackdropsForCatalogs, settings.tmdbLanguagePreference]);

  // Avoid strong fade animations that can appear as flicker on mount/scroll
  useEffect(() => {
    if (isLoaded) {
      fadeInOpacity.setValue(1);
    }
  }, [isLoaded, fadeInOpacity]);

  const isPlaceholder = !isLoaded;

  // Choose image and aspect ratio based on setting/backdrop availability
  const isLandscapePreferred = settings.useTmdbBackdropsForCatalogs;
  const useBackdrop = isLandscapePreferred && !!tmdbBackdrop;
  const tileAspectRatio = isLandscapePreferred ? 16 / 9 : 2 / 3;
  const tileWidth = React.useMemo(() => {
    if (!isLandscapePreferred) return posterWidth;
    // Make landscape tiles significantly larger for better presence
    const enlarged = posterWidth * 1.8;
    return Math.min(enlarged, posterWidth + 120);
  }, [isLandscapePreferred, posterWidth]);
  const displayImageUrl = isLandscapePreferred ? (tmdbBackdrop || null) : optimizedPosterUrl;

  // Reset load flags whenever the display URL changes to avoid showing stale bitmaps
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [displayImageUrl]);

  return (
    <>
      <Animated.View style={[styles.itemContainer, { width: tileWidth, opacity: fadeInOpacity }]}> 
        <TouchableOpacity
          style={[styles.contentItem, { width: tileWidth, borderRadius: posterRadius, aspectRatio: tileAspectRatio }]}
          activeOpacity={0.7}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={300}
        >
          <View ref={itemRef} style={[styles.contentItemContainer, { borderRadius: posterRadius }] }>
            {/* Image with lightweight placeholder to reduce flicker */}
            {displayImageUrl && !isPlaceholder ? (
              <>
                {!imageLoaded && (
                  <View style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, borderRadius: posterRadius }]} />
                )}
                <ExpoImage
                  source={{ uri: displayImageUrl }}
                  key={displayImageUrl}
                  style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, borderRadius: posterRadius, opacity: imageLoaded ? 1 : 0 }]}
                  contentFit="cover"
                  cachePolicy={Platform.OS === 'android' ? 'disk' : 'memory-disk'}
                  transition={0}
                  allowDownscaling
                  priority={useBackdrop ? 'high' : 'normal'}
                  recyclingKey={`${item.id}-${item.type}`}
                  onLoadStart={() => {
                    setImageLoaded(false);
                    setImageError(false);
                  }}
                  onLoad={() => {
                    setImageLoaded(true);
                    setImageError(false);
                  }}
                  onError={(error) => {
                    if (__DEV__) console.warn('Image load error for:', item.poster, error);
                    // Try fallback URL on first error
                    if (retryCount === 0 && item.poster && !item.poster.includes('metahub.space')) {
                      setRetryCount(1);
                      return;
                    }
                    setImageError(true);
                    setImageLoaded(false);
                  }}
                  placeholder={PLACEHOLDER_BLURHASH}
                />
              </>
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
                <MaterialIcons name="bookmark" size={16} color={currentTheme.colors.white} />
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
  // Re-render when identity changes or poster changes
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.poster !== next.item.poster) return false;
  return true;
});