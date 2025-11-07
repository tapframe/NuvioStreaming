import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ViewStyle,
  TextStyle,
  StatusBar,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  withDelay,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StreamingContent } from '../../services/catalogService';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AppleTVHeroProps {
  featuredContent: StreamingContent | null;
  allFeaturedContent?: StreamingContent[];
  isSaved: boolean;
  handleSaveToLibrary: () => void;
  loading?: boolean;
  onRetry?: () => void;
}

const { width, height } = Dimensions.get('window');

// Get status bar height
const STATUS_BAR_HEIGHT = StatusBar.currentHeight || 0;

// Calculate hero height - 65% of screen height
const HERO_HEIGHT = height * 0.75;

const AppleTVHero: React.FC<AppleTVHeroProps> = ({
  featuredContent,
  allFeaturedContent,
  isSaved,
  handleSaveToLibrary,
  loading,
  onRetry,
}) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  // Determine items to display
  const items = useMemo(() => {
    if (allFeaturedContent && allFeaturedContent.length > 0) {
      return allFeaturedContent.slice(0, 8); // Limit to 8 items for performance
    }
    return featuredContent ? [featuredContent] : [];
  }, [allFeaturedContent, featuredContent]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [bannerLoaded, setBannerLoaded] = useState<Record<number, boolean>>({});
  const [logoLoaded, setLogoLoaded] = useState<Record<number, boolean>>({});
  const [logoError, setLogoError] = useState<Record<number, boolean>>({});
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());

  const currentItem = items[currentIndex] || null;

  // Animation values
  const dragProgress = useSharedValue(0);
  const logoOpacity = useSharedValue(1);
  const [nextIndex, setNextIndex] = useState(currentIndex);

  // Reset loaded states when items change
  useEffect(() => {
    setBannerLoaded({});
    setLogoLoaded({});
    setLogoError({});
  }, [items.length]);

  // Auto-advance timer
  const startAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
    }

    if (items.length <= 1) return;

    autoPlayTimerRef.current = setTimeout(() => {
      const timeSinceInteraction = Date.now() - lastInteractionRef.current;
      // Only auto-advance if user hasn't interacted recently (5 seconds)
      if (timeSinceInteraction >= 5000) {
        setCurrentIndex((prev) => (prev + 1) % items.length);
      } else {
        // Retry after remaining time
        startAutoPlay();
      }
    }, 5000); // Auto-advance every 5 seconds
  }, [items.length]);

  useEffect(() => {
    startAutoPlay();
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [startAutoPlay, currentIndex]);

  // Reset drag progress and animate logo when index changes
  useEffect(() => {
    dragProgress.value = 0;
    setNextIndex(currentIndex);
    
    // Fade out and fade in logo/title
    logoOpacity.value = 0;
    logoOpacity.value = withDelay(
      200,
      withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [currentIndex]);

  // Callback for updating interaction time
  const updateInteractionTime = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  // Callback for navigating to previous item
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  // Callback for navigating to next item
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  // Callback for setting next preview index
  const setPreviewIndex = useCallback((index: number) => {
    setNextIndex(index);
  }, []);

  // Swipe gesture handler with live preview
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          // Determine which direction and set preview
          runOnJS(updateInteractionTime)();
        })
        .onUpdate((event) => {
          const translationX = event.translationX;
          const progress = Math.abs(translationX) / width;
          
          // Update drag progress (0 to 1)
          dragProgress.value = Math.min(progress, 1);

          // Determine preview index based on direction
          if (translationX > 0) {
            // Swiping right - show previous
            const prevIdx = (currentIndex - 1 + items.length) % items.length;
            runOnJS(setPreviewIndex)(prevIdx);
          } else if (translationX < 0) {
            // Swiping left - show next
            const nextIdx = (currentIndex + 1) % items.length;
            runOnJS(setPreviewIndex)(nextIdx);
          }
        })
        .onEnd((event) => {
          const velocity = event.velocityX;
          const translationX = event.translationX;
          const swipeThreshold = width * 0.25;

          if (Math.abs(translationX) > swipeThreshold || Math.abs(velocity) > 800) {
            // Complete the swipe
            if (translationX > 0) {
              runOnJS(goToPrevious)();
            } else {
              runOnJS(goToNext)();
            }
          } else {
            // Cancel the swipe - animate back
            dragProgress.value = withTiming(0, {
              duration: 300,
              easing: Easing.out(Easing.cubic),
            });
          }
        }),
    [goToPrevious, goToNext, updateInteractionTime, setPreviewIndex, currentIndex, items.length]
  );

  // Animated styles for current and next images
  const currentImageStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        dragProgress.value,
        [0, 1],
        [1, 0],
        Extrapolate.CLAMP
      ),
    };
  });

  const nextImageStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        dragProgress.value,
        [0, 1],
        [0, 1],
        Extrapolate.CLAMP
      ),
    };
  });

  // Animated style for logo/title only - fades during drag
  const logoAnimatedStyle = useAnimatedStyle(() => {
    const dragFade = interpolate(
      dragProgress.value,
      [0, 0.3],
      [1, 0],
      Extrapolate.CLAMP
    );
    
    return {
      opacity: dragFade * logoOpacity.value,
    };
  });

  const handleDotPress = useCallback((index: number) => {
    lastInteractionRef.current = Date.now();
    setCurrentIndex(index);
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { height: HERO_HEIGHT }]}>
        <View style={styles.skeletonContainer}>
          <LinearGradient
            colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      </View>
    );
  }

  if (!currentItem || items.length === 0) {
    return (
      <View style={[styles.container, { height: HERO_HEIGHT }]}>
        <View style={styles.noContentContainer}>
          <MaterialIcons name="theaters" size={48} color="rgba(255,255,255,0.5)" />
          <Text style={styles.noContentText}>No featured content available</Text>
          {onRetry && (
            <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const bannerUrl = currentItem.banner || currentItem.poster;
  const nextItem = items[nextIndex];
  const nextBannerUrl = nextItem ? (nextItem.banner || nextItem.poster) : bannerUrl;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[styles.container, { height: HERO_HEIGHT, marginTop: -insets.top }]}
      >
        {/* Background Images with Crossfade */}
        <View style={styles.backgroundContainer}>
          {/* Current Image */}
          <Animated.View style={[StyleSheet.absoluteFillObject, currentImageStyle]}>
            <FastImage
              source={{
                uri: bannerUrl,
                priority: FastImage.priority.high,
                cache: FastImage.cacheControl.immutable,
              }}
              style={styles.backgroundImage}
              resizeMode={FastImage.resizeMode.cover}
              onLoad={() => setBannerLoaded((prev) => ({ ...prev, [currentIndex]: true }))}
            />
          </Animated.View>

          {/* Next/Preview Image */}
          {nextIndex !== currentIndex && (
            <Animated.View style={[StyleSheet.absoluteFillObject, nextImageStyle]}>
              <FastImage
                source={{
                  uri: nextBannerUrl,
                  priority: FastImage.priority.high,
                  cache: FastImage.cacheControl.immutable,
                }}
                style={styles.backgroundImage}
                resizeMode={FastImage.resizeMode.cover}
                onLoad={() => setBannerLoaded((prev) => ({ ...prev, [nextIndex]: true }))}
              />
            </Animated.View>
          )}

          {/* Gradient Overlay - darker at bottom for text readability */}
          <LinearGradient
            colors={[
              'transparent',
              'rgba(0,0,0,0.2)',
              'rgba(0,0,0,0.5)',
              'rgba(0,0,0,0.8)',
              'rgba(0,0,0,0.95)',
            ]}
            locations={[0, 0.3, 0.6, 0.85, 1]}
            style={styles.gradientOverlay}
          />
        </View>

        {/* Content Overlay */}
        <View style={[styles.contentContainer, { paddingBottom: 40 + insets.bottom }]}>
          {/* Logo or Title with Fade Animation */}
          <Animated.View
            key={`logo-${currentIndex}`}
            style={logoAnimatedStyle}
          >
            {currentItem.logo && !logoError[currentIndex] ? (
              <View style={styles.logoContainer}>
                <FastImage
                  source={{
                    uri: currentItem.logo,
                    priority: FastImage.priority.high,
                    cache: FastImage.cacheControl.immutable,
                  }}
                  style={styles.logo}
                  resizeMode={FastImage.resizeMode.contain}
                  onLoad={() => setLogoLoaded((prev) => ({ ...prev, [currentIndex]: true }))}
                  onError={() => {
                    setLogoError((prev) => ({ ...prev, [currentIndex]: true }));
                    logger.warn('[AppleTVHero] Logo load failed:', currentItem.logo);
                  }}
                />
              </View>
            ) : (
              <View style={styles.titleContainer}>
                <Text style={styles.title} numberOfLines={2}>
                  {currentItem.name}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Metadata Badge - Always Visible */}
          <View style={styles.metadataContainer}>
            <View style={styles.metadataBadge}>
              <MaterialIcons name="tv" size={16} color="#fff" />
              <Text style={styles.metadataText}>
                {currentItem.type === 'series' ? 'TV Show' : 'Movie'}
              </Text>
              {currentItem.genres && currentItem.genres.length > 0 && (
                <>
                  <Text style={styles.metadataDot}>•</Text>
                  <Text style={styles.metadataText}>{currentItem.genres[0]}</Text>
                </>
              )}
              {currentItem.certification && (
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>{currentItem.certification}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Action Buttons - Always Visible */}
          <View style={styles.buttonsContainer}>
            {/* Play Button */}
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => {
                navigation.navigate('Streams', {
                  id: currentItem.id,
                  type: currentItem.type,
                });
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="play-arrow" size={28} color="#000" />
              <Text style={styles.playButtonText}>Play</Text>
            </TouchableOpacity>

            {/* Add to List Button */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSaveToLibrary}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={isSaved ? 'check' : 'add'}
                size={24}
                color="#fff"
              />
            </TouchableOpacity>
          </View>

          {/* Pagination Dots */}
          {items.length > 1 && (
            <View style={styles.paginationContainer}>
              {items.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleDotPress(index)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Animated.View
                    style={[
                      styles.paginationDot,
                      index === currentIndex && styles.paginationDotActive,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Bottom blend to home screen background */}
        <LinearGradient
          colors={['transparent', currentTheme.colors.darkBackground]}
          locations={[0, 1]}
          style={styles.bottomBlend}
          pointerEvents="none"
        />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    marginBottom: 0, // Remove margin to go full height
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    // paddingBottom will be set dynamically with insets
  },
  logoContainer: {
    width: width * 0.6,
    height: 120,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  titleContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  metadataContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metadataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  metadataText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  metadataDot: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  ratingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    gap: 8,
    minWidth: 140,
  },
  playButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  paginationDotActive: {
    width: 32,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  bottomBlend: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    pointerEvents: 'none',
  },
  // Loading & Empty States
  skeletonContainer: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  noContentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  noContentText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default React.memo(AppleTVHero);
