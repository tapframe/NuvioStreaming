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
import { SvgUri } from 'react-native-svg';
import { MaterialIcons, Entypo } from '@expo/vector-icons';
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
import { useSettings } from '../../hooks/useSettings';
import { useTrailer } from '../../contexts/TrailerContext';
import TrailerService from '../../services/trailerService';
import TrailerPlayer from '../video/TrailerPlayer';

interface AppleTVHeroProps {
  featuredContent: StreamingContent | null;
  allFeaturedContent?: StreamingContent[];
  loading?: boolean;
  onRetry?: () => void;
}

const { width, height } = Dimensions.get('window');

// Get status bar height
const STATUS_BAR_HEIGHT = StatusBar.currentHeight || 0;

// Calculate hero height - 65% of screen height
const HERO_HEIGHT = height * 0.75;

// Animated Pagination Dot Component
const PaginationDot: React.FC<{ isActive: boolean; onPress: () => void }> = React.memo(
  ({ isActive, onPress }) => {
    const animatedStyle = useAnimatedStyle(() => {
      return {
        width: withTiming(isActive ? 32 : 8, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        }),
        opacity: withTiming(isActive ? 0.9 : 0.3, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        }),
      };
    });

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Animated.View style={[styles.paginationDot, animatedStyle]} />
      </TouchableOpacity>
    );
  }
);

const AppleTVHero: React.FC<AppleTVHeroProps> = ({
  featuredContent,
  allFeaturedContent,
  loading,
  onRetry,
}) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, updateSetting } = useSettings();
  const { isTrailerPlaying: globalTrailerPlaying, setTrailerPlaying } = useTrailer();
  
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

  // Trailer state
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState(false);
  const [trailerReady, setTrailerReady] = useState(false);
  const [trailerPreloaded, setTrailerPreloaded] = useState(false);
  const trailerVideoRef = useRef<any>(null);
  
  // Use ref to avoid re-fetching trailer when trailerMuted changes
  const showTrailersEnabled = useRef(settings?.showTrailers ?? false);
  
  // Update ref when showTrailers setting changes
  useEffect(() => {
    showTrailersEnabled.current = settings?.showTrailers ?? false;
  }, [settings?.showTrailers]);

  const currentItem = items[currentIndex] || null;

  // Animation values
  const dragProgress = useSharedValue(0);
  const logoOpacity = useSharedValue(1);
  const [nextIndex, setNextIndex] = useState(currentIndex);
  const thumbnailOpacity = useSharedValue(1);
  const trailerOpacity = useSharedValue(0);
  const trailerMuted = settings?.trailerMuted ?? true;

  // Animated style for trailer container - 60% height with zoom
  const trailerContainerStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: HERO_HEIGHT * 0.9, // 90% of hero height
      overflow: 'hidden',
      opacity: trailerOpacity.value,
    };
  });

  // Animated style for trailer video - zoomed in 5%
  const trailerVideoStyle = useAnimatedStyle(() => {
    return {
      width: '100%',
      height: '100%',
      transform: [{ scale: 1.05 }], // 5% zoom
    };
  });

  // Reset loaded states when items change
  useEffect(() => {
    setBannerLoaded({});
    setLogoLoaded({});
    setLogoError({});
  }, [items.length]);

  // Fetch trailer URL when current item changes
  useEffect(() => {
    let alive = true;

    const fetchTrailer = async () => {
      if (!currentItem || !showTrailersEnabled.current) {
        setTrailerUrl(null);
        return;
      }

      // Reset trailer state when item changes
      setTrailerLoading(true);
      setTrailerError(false);
      setTrailerReady(false);
      setTrailerPreloaded(false);
      setTrailerPlaying(false);
      
      // Fade out any existing trailer
      trailerOpacity.value = withTiming(0, { duration: 300 });
      thumbnailOpacity.value = withTiming(1, { duration: 300 });

      try {
        // Extract year from metadata
        const year = currentItem.releaseInfo 
          ? parseInt(currentItem.releaseInfo.split('-')[0], 10) 
          : new Date().getFullYear();

        // Extract TMDB ID if available
        const tmdbId = currentItem.id?.startsWith('tmdb:') 
          ? currentItem.id.replace('tmdb:', '') 
          : undefined;

        const contentType = currentItem.type === 'series' ? 'tv' : 'movie';

        logger.info('[AppleTVHero] Fetching trailer for:', currentItem.name, year, tmdbId);

        const url = await TrailerService.getTrailerUrl(
          currentItem.name, 
          year, 
          tmdbId, 
          contentType
        );

        if (!alive) return;

        if (url) {
          const bestUrl = TrailerService.getBestFormatUrl(url);
          setTrailerUrl(bestUrl);
          logger.info('[AppleTVHero] Trailer URL loaded:', bestUrl);
        } else {
          logger.info('[AppleTVHero] No trailer found for:', currentItem.name);
          setTrailerUrl(null);
        }
      } catch (error) {
        if (!alive) return;
        logger.error('[AppleTVHero] Error fetching trailer:', error);
        setTrailerError(true);
        setTrailerUrl(null);
      } finally {
        if (alive) {
          setTrailerLoading(false);
        }
      }
    };

    fetchTrailer();

    return () => {
      alive = false;
    };
  }, [currentItem, currentIndex]); // Removed settings?.showTrailers from dependencies

  // Handle trailer preloaded
  const handleTrailerPreloaded = useCallback(() => {
    setTrailerPreloaded(true);
    logger.info('[AppleTVHero] Trailer preloaded successfully');
  }, []);

  // Handle trailer ready to play
  const handleTrailerReady = useCallback(() => {
    setTrailerReady(true);
    
    // Smooth crossfade: thumbnail out, trailer in
    thumbnailOpacity.value = withTiming(0, { duration: 800 });
    trailerOpacity.value = withTiming(1, { duration: 800 });
    
    logger.info('[AppleTVHero] Trailer ready - starting playback');
    
    // Auto-start trailer
    setTrailerPlaying(true);
  }, [thumbnailOpacity, trailerOpacity, setTrailerPlaying]);

  // Handle trailer error
  const handleTrailerError = useCallback(() => {
    setTrailerError(true);
    setTrailerReady(false);
    setTrailerPlaying(false);
    
    // Fade back to thumbnail
    trailerOpacity.value = withTiming(0, { duration: 300 });
    thumbnailOpacity.value = withTiming(1, { duration: 300 });
    
    logger.error('[AppleTVHero] Trailer playback error');
  }, [trailerOpacity, thumbnailOpacity, setTrailerPlaying]);

  // Handle trailer end
  const handleTrailerEnd = useCallback(() => {
    logger.info('[AppleTVHero] Trailer ended');
    setTrailerPlaying(false);
    
    // Reset trailer state
    setTrailerReady(false);
    setTrailerPreloaded(false);
    
    // Smooth fade back to thumbnail
    trailerOpacity.value = withTiming(0, { duration: 500 });
    thumbnailOpacity.value = withTiming(1, { duration: 500 });
  }, [trailerOpacity, thumbnailOpacity, setTrailerPlaying]);

  // Handle fullscreen toggle
  const handleFullscreenToggle = useCallback(async () => {
    try {
      logger.info('[AppleTVHero] Fullscreen button pressed');
      if (trailerVideoRef.current) {
        await trailerVideoRef.current.presentFullscreenPlayer();
      }
    } catch (error) {
      logger.error('[AppleTVHero] Error toggling fullscreen:', error);
    }
  }, []);

  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    logger.info('[AppleTVHero] Mute toggle pressed, current:', trailerMuted);
    updateSetting('trailerMuted', !trailerMuted);
  }, [trailerMuted, updateSetting]);

  // Auto-advance timer - PAUSE when trailer is playing
  const startAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
    }

    if (items.length <= 1) return;

    // Don't auto-advance if trailer is playing
    if (globalTrailerPlaying && trailerReady) {
      logger.info('[AppleTVHero] Auto-rotation paused - trailer is playing');
      return;
    }

    autoPlayTimerRef.current = setTimeout(() => {
      const timeSinceInteraction = Date.now() - lastInteractionRef.current;
      // Only auto-advance if user hasn't interacted recently (5 seconds) and no trailer playing
      if (timeSinceInteraction >= 5000 && (!globalTrailerPlaying || !trailerReady)) {
        setCurrentIndex((prev) => (prev + 1) % items.length);
      } else {
        // Retry after remaining time
        startAutoPlay();
      }
    }, 25000); // Auto-advance every 25 seconds
  }, [items.length, globalTrailerPlaying, trailerReady]);

  useEffect(() => {
    startAutoPlay();
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [startAutoPlay, currentIndex, globalTrailerPlaying, trailerReady]);

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

  // Swipe gesture handler with live preview - only horizontal
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10]) // Only activate on horizontal movement
        .failOffsetY([-10, 10]) // Fail if vertical movement is detected
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
      <View style={[styles.container, { height: HERO_HEIGHT, marginTop: -insets.top }]}>
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
      <View style={[styles.container, { height: HERO_HEIGHT, marginTop: -insets.top }]}>
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
          {/* Current Image - Thumbnail with fade */}
          <Animated.View style={[StyleSheet.absoluteFillObject, currentImageStyle, {
            opacity: thumbnailOpacity
          }]}>
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

          {/* Hidden preload trailer player */}
          {settings?.showTrailers && trailerUrl && !trailerLoading && !trailerError && !trailerPreloaded && (
            <View style={[StyleSheet.absoluteFillObject, { opacity: 0, pointerEvents: 'none' }]}>
              <TrailerPlayer
                key={`preload-${trailerUrl}`}
                trailerUrl={trailerUrl}
                autoPlay={false}
                muted={true}
                style={StyleSheet.absoluteFillObject}
                hideLoadingSpinner={true}
                onLoad={handleTrailerPreloaded}
                onError={handleTrailerError}
              />
            </View>
          )}

          {/* Visible trailer player - 60% height with 5% zoom and smooth fade */}
          {settings?.showTrailers && trailerUrl && !trailerLoading && !trailerError && trailerPreloaded && (
            <Animated.View style={trailerContainerStyle}>
              <Animated.View style={trailerVideoStyle}>
                <TrailerPlayer
                  key={`visible-${trailerUrl}`}
                  ref={trailerVideoRef}
                  trailerUrl={trailerUrl}
                  autoPlay={globalTrailerPlaying}
                  muted={trailerMuted}
                  style={StyleSheet.absoluteFillObject}
                  hideLoadingSpinner={true}
                  hideControls={true}
                  onFullscreenToggle={handleFullscreenToggle}
                  onLoad={handleTrailerReady}
                  onError={handleTrailerError}
                  onEnd={handleTrailerEnd}
                  onPlaybackStatusUpdate={(status) => {
                    if (status.isLoaded && !trailerReady) {
                      handleTrailerReady();
                    }
                  }}
                />
              </Animated.View>
              {/* Gradient blend at bottom of trailer */}
              <LinearGradient
                colors={['transparent', currentTheme.colors.darkBackground]}
                locations={[0, 1]}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 60,
                }}
                pointerEvents="none"
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

        {/* Trailer control buttons (unmute and fullscreen) */}
        {settings?.showTrailers && trailerReady && trailerUrl && (
          <Animated.View style={{
            position: 'absolute',
            top: Platform.OS === 'android' ? 60 : 70,
            right: 24,
            zIndex: 1000,
            opacity: trailerOpacity,
            flexDirection: 'row',
            gap: 8,
          }}>
            {/* Fullscreen button */}
            <TouchableOpacity
              onPress={(e) => {
                e?.stopPropagation();
                handleFullscreenToggle();
              }}
              activeOpacity={0.7}
              onPressIn={(e) => e?.stopPropagation()}
              onPressOut={(e) => e?.stopPropagation()}
              style={{
                padding: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderRadius: 20,
              }}
            >
              <MaterialIcons
                name="fullscreen"
                size={24}
                color="white"
              />
            </TouchableOpacity>

            {/* Unmute button */}
            <TouchableOpacity
              onPress={(e) => {
                e?.stopPropagation();
                handleMuteToggle();
              }}
              activeOpacity={0.7}
              onPressIn={(e) => e?.stopPropagation()}
              onPressOut={(e) => e?.stopPropagation()}
              style={{
                padding: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderRadius: 20,
              }}
            >
              <Entypo
                name={trailerMuted ? 'sound-mute' : 'sound'}
                size={24}
                color="white"
              />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Content Overlay */}
        <View style={[styles.contentContainer, { paddingBottom: 0 + insets.bottom }]}>
          {/* Logo or Title with Fade Animation */}
          <Animated.View
            key={`logo-${currentIndex}`}
            style={logoAnimatedStyle}
          >
            {currentItem.logo && !logoError[currentIndex] ? (
              <View style={styles.logoContainer}>
                {currentItem.logo.toLowerCase().endsWith('.svg') ? (
                  <SvgUri
                    uri={currentItem.logo}
                    width="100%"
                    height="100%"
                    onLoad={() => setLogoLoaded((prev) => ({ ...prev, [currentIndex]: true }))}
                    onError={() => {
                      setLogoError((prev) => ({ ...prev, [currentIndex]: true }));
                      logger.warn('[AppleTVHero] SVG Logo load failed:', currentItem.logo);
                    }}
                  />
                ) : (
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
                )}
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
            {/* Info Button */}
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => {
                navigation.navigate('Metadata', {
                  id: currentItem.id,
                  type: currentItem.type,
                });
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="info-outline" size={28} color="#000" />
              <Text style={styles.playButtonText}>Info</Text>
            </TouchableOpacity>
          </View>

          {/* Pagination Dots */}
          {items.length > 1 && (
            <View style={styles.paginationContainer}>
              {items.map((_, index) => (
                <PaginationDot
                  key={index}
                  isActive={index === currentIndex}
                  onPress={() => handleDotPress(index)}
                />
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
    overflow: 'hidden', // Ensure trailer stays within bounds
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
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
    zIndex: 10,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 20, // Above background and trailer
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
    marginBottom: 20,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
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
    marginTop: 12,
  },
  paginationDot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  bottomBlend: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
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
