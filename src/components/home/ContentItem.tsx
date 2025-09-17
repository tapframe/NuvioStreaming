import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions, Platform, Text, Animated } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { catalogService, StreamingContent } from '../../services/catalogService';
import { DropUpMenu } from './DropUpMenu';

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

const ContentItem = ({ item, onPress, shouldLoadImage: shouldLoadImageProp, deferMs = 0 }: ContentItemProps) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [shouldLoadImageState, setShouldLoadImageState] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { currentTheme } = useTheme();
  const { settings, isLoaded } = useSettings();
  const posterRadius = typeof settings.posterBorderRadius === 'number' ? settings.posterBorderRadius : 12;
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

  const handleOptionSelect = useCallback((option: string) => {
    switch (option) {
      case 'library':
        if (item.inLibrary) {
          catalogService.removeFromLibrary(item.type, item.id);
        } else {
          catalogService.addToLibrary(item);
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
  }, [item]);

  const handleMenuClose = useCallback(() => {
    setMenuVisible(false);
  }, []);

  // Lazy load images - only load when asked by parent (viewability) or after small defer
  useEffect(() => {
    if (shouldLoadImageProp !== undefined) {
      if (shouldLoadImageProp) {
        const t = setTimeout(() => setShouldLoadImageState(true), deferMs);
        return () => clearTimeout(t);
      } else {
        setShouldLoadImageState(false);
      }
      return;
    }
    const timer = setTimeout(() => {
      setShouldLoadImageState(true);
    }, 80);
    return () => clearTimeout(timer);
  }, [shouldLoadImageProp, deferMs]);

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

  // Smoothly fade in content when settings are ready
  useEffect(() => {
    if (isLoaded) {
      fadeInOpacity.setValue(0);
      Animated.timing(fadeInOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoaded, fadeInOpacity]);

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
      <Animated.View style={[styles.itemContainer, { width: posterWidth, opacity: fadeInOpacity }]}> 
        <TouchableOpacity
          style={[styles.contentItem, { width: posterWidth, borderRadius: posterRadius }]}
          activeOpacity={0.7}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={300}
        >
          <View ref={itemRef} style={[styles.contentItemContainer, { borderRadius: posterRadius }] }>
            {/* Only load image when shouldLoadImage is true (lazy loading) */}
            {(shouldLoadImageProp ?? shouldLoadImageState) && item.poster ? (
              <ExpoImage
                source={{ uri: optimizedPosterUrl }}
                style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, borderRadius: posterRadius }]}
                contentFit="cover"
                cachePolicy={Platform.OS === 'android' ? 'disk' : 'memory-disk'}
                transition={140}
                allowDownscaling
                priority="low" // Deprioritize decode for long lists
                onLoad={() => {
                  setImageLoaded(true);
                  setImageError(false);
                }}
                onError={(error) => {
                  if (__DEV__) console.warn('Image load error for:', item.poster, error);
                  // Try fallback URL on first error
                  if (retryCount === 0 && item.poster && !item.poster.includes('metahub.space')) {
                    setRetryCount(1);
                    // Don't set error state yet, let it try the fallback
                    return;
                  }
                  setImageError(true);
                  setImageLoaded(false);
                }}
                recyclingKey={item.id} // Add recycling key for better performance
              />
            ) : (
              // Show placeholder until lazy load triggers
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
            {item.inLibrary && (
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
  // Re-render when identity changes or when visibility-driven loading flips
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.poster !== next.item.poster) return false;
  if ((prev.shouldLoadImage ?? false) !== (next.shouldLoadImage ?? false)) return false;
  return true;
});