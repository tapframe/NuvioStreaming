import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  ViewStyle,
  TextStyle,
  ImageStyle,
  ActivityIndicator,
  Platform
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  withDelay,
  interpolate,
  Extrapolation
} from 'react-native-reanimated';
import Carousel, { ICarouselInstance, Pagination } from 'react-native-reanimated-carousel';
import { StreamingContent } from '../../services/catalogService';
import { SkeletonFeatured } from './SkeletonLoaders';
import { hasValidLogoFormat, isTmdbUrl } from '../../utils/logoUtils';
import { logger } from '../../utils/logger';
import { useTheme } from '../../contexts/ThemeContext';

interface FeaturedContentProps {
  featuredContent: StreamingContent[] | StreamingContent | null;
  isSaved: (item: StreamingContent) => Promise<boolean>;
  handleSaveToLibrary: (item: StreamingContent) => void;
  loading?: boolean;
  onRetry?: () => void;
}

// Cache to store preloaded images
const imageCache: Record<string, boolean> = {};

interface FeaturedContentItemProps {
  item: StreamingContent;
  isSaved: boolean;
  onSaveToLibrary: () => void;
  onPressInfo: () => void;
  onPressPlay: () => void;
}

// Individual item component for the carousel
const FeaturedContentItem = React.memo(({ item, isSaved, onSaveToLibrary, onPressInfo, onPressPlay }: FeaturedContentItemProps) => {
  const { currentTheme } = useTheme();
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const logoOpacity = useSharedValue(0);
  const bannerOpacity = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const prevContentIdRef = useRef<string | null>(null);
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Enhanced poster transition animations
  const posterScale = useSharedValue(1);
  const posterTranslateY = useSharedValue(0);
  const overlayOpacity = useSharedValue(0.15);

  // Animation values
  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
    transform: [
      { scale: posterScale.value },
      { translateY: posterTranslateY.value }
    ],
  }));

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  const contentOpacity = useSharedValue(1);
  const buttonsOpacity = useSharedValue(1);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // Preload the image
  const preloadImage = async (url: string): Promise<boolean> => {
    const t0 = nowMs();
    logger.debug('[FeaturedContentItem] preloadImage:start', { url });
    // Skip if already cached to prevent redundant prefetch
    if (imageCache[url]) return true;

    try {
      // Simplified validation to reduce CPU overhead
      if (!url || typeof url !== 'string') return false;

      // Add timeout guard to prevent hanging preloads
      const timeout = new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          clearTimeout(t as any);
          reject(new Error('preload-timeout'));
        }, 1500);
      });

      // FastImage.preload doesn't return a promise, so we just call it and use timeout
      FastImage.preload([{ uri: url }]);
      await timeout;
      imageCache[url] = true;
      logger.debug('[FeaturedContentItem] preloadImage:success', { url, duration: since(t0) });
      return true;
    } catch (error) {
      // Clear any partial cache entry on error
      delete imageCache[url];
      logger.warn('[FeaturedContentItem] preloadImage:error', { url, duration: since(t0), error: String(error) });
      return false;
    }
  };

  // Reset logo error state when content changes
  useEffect(() => {
    setLogoLoadError(false);
  }, [item?.id]);

  // Use logo from item data
  useEffect(() => {
    if (!item) {
      setLogoUrl(null);
      setLogoLoadError(false);
      return;
    }

    const logo = item.logo;
    logger.info('[FeaturedContentItem] using logo from data', {
      id: item.id,
      name: item.name,
      hasLogo: Boolean(logo),
      logo: logo,
      logoSource: logo ? (isTmdbUrl(logo) ? 'tmdb' : 'addon') : 'none',
      type: item.type
    });

    setLogoUrl(logo || null);
    setLogoLoadError(!logo);
    setLogoError(false);
  }, [item]);

  // Load poster and logo
  useEffect(() => {
    if (!item) return;

    const posterUrl = item.banner || item.poster;
    const contentId = item.id;
    const isContentChange = contentId !== prevContentIdRef.current;
    const t0 = nowMs();
    logger.info('[FeaturedContentItem] content:update', { id: contentId, isContentChange, posterUrlExists: Boolean(posterUrl) });

    // Enhanced content change detection and animations
    if (isContentChange) {
      // Animate out current content
      if (prevContentIdRef.current) {
        posterOpacity.value = withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.cubic)
        });
        posterScale.value = withTiming(0.95, {
          duration: 300,
          easing: Easing.out(Easing.cubic)
        });
        overlayOpacity.value = withTiming(0.6, {
          duration: 300,
          easing: Easing.out(Easing.cubic)
        });
        contentOpacity.value = withTiming(0.3, {
          duration: 200,
          easing: Easing.out(Easing.cubic)
        });
        buttonsOpacity.value = withTiming(0.3, {
          duration: 200,
          easing: Easing.out(Easing.cubic)
        });
      } else {
        // Initial load - start from 0 but don't animate if we're just mounting
        posterOpacity.value = 0;
        posterScale.value = 1.1;
        overlayOpacity.value = 0;
        contentOpacity.value = 0;
        buttonsOpacity.value = 0;
      }
      logoOpacity.value = 0;
    }

    prevContentIdRef.current = contentId;

    // Set poster URL for immediate display
    if (posterUrl && posterUrl !== bannerUrl) {
      setBannerUrl(posterUrl);
    }

    // Load images with enhanced animations
    const loadImages = async () => {
      // Small delay to allow fade out animation to complete
      await new Promise(resolve => setTimeout(resolve, isContentChange && prevContentIdRef.current ? 300 : 0));

      // Load poster with enhanced transition
      if (posterUrl) {
        const tPoster = nowMs();
        const posterSuccess = await preloadImage(posterUrl);
        if (posterSuccess) {
          // Animate in new poster with scale and fade
          posterScale.value = withTiming(1, {
            duration: 800,
            easing: Easing.out(Easing.cubic)
          });
          posterOpacity.value = withTiming(1, {
            duration: 700,
            easing: Easing.out(Easing.cubic)
          });
          overlayOpacity.value = withTiming(0.15, {
            duration: 600,
            easing: Easing.out(Easing.cubic)
          });
          logger.debug('[FeaturedContentItem] poster:ready', { id: contentId, duration: since(tPoster) });

          // Animate content back in with delay
          contentOpacity.value = withDelay(200, withTiming(1, {
            duration: 600,
            easing: Easing.out(Easing.cubic)
          }));
          buttonsOpacity.value = withDelay(400, withTiming(1, {
            duration: 500,
            easing: Easing.out(Easing.cubic)
          }));
        } else {
          // If preload fails, still show the image but without animation
          posterOpacity.value = 1;
          posterScale.value = 1;
          overlayOpacity.value = 0.15;
          contentOpacity.value = 1;
          buttonsOpacity.value = 1;
        }
      }

      // Load logo if available with enhanced timing
      if (logoUrl) {
        const tLogo = nowMs();
        const logoSuccess = await preloadImage(logoUrl);
        if (logoSuccess) {
          logger.debug('[FeaturedContentItem] logo:preload:success', { id: contentId, duration: since(tLogo) });
        } else {
          logger.debug('[FeaturedContentItem] logo:preload:failed', { id: contentId, duration: since(tLogo) });
        }

        // Always animate in the logo since we have the URL
        logoOpacity.value = withDelay(500, withTiming(1, {
          duration: 600,
          easing: Easing.out(Easing.cubic)
        }));
        logger.debug('[FeaturedContentItem] logo:animated', { id: contentId });
      }
      logger.info('[FeaturedContentItem] images:load:done', { id: contentId, total: since(t0) });
    };

    loadImages();
  }, [item?.id, logoUrl]);

  const onLogoLoadError = () => {
    setLogoLoaded(true);
    setLogoLoadError(true);
    logger.warn('[FeaturedContentItem] logo:onError', { id: item?.id, url: logoUrl });
  };

  const isTablet = width >= 768;

  if (isTablet) {
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={onPressInfo}
        style={styles.tabletContainer as ViewStyle}
      >
        <Animated.View style={[styles.tabletImageWrapper, posterAnimatedStyle]}>
          <ImageBackground
            source={{ uri: bannerUrl || item.poster }}
            style={styles.tabletImage as ViewStyle}
            resizeMode="cover"
          >
            <Animated.View style={[styles.contentOverlay, overlayAnimatedStyle]} />
            <LinearGradient
              colors={[
                'transparent',
                'transparent',
                'rgba(0,0,0,0.3)',
                'rgba(0,0,0,0.7)',
                'rgba(0,0,0,0.95)'
              ]}
              locations={[0, 0.3, 0.6, 0.8, 1]}
              style={styles.tabletImageGradient as ViewStyle}
            />
          </ImageBackground>
        </Animated.View>

        <Animated.View style={[styles.tabletOverlayContent as ViewStyle, contentAnimatedStyle]}>
          {logoUrl && !logoLoadError ? (
            <Animated.View style={logoAnimatedStyle}>
              <FastImage
                source={{
                  uri: logoUrl,
                  priority: FastImage.priority.high,
                  cache: FastImage.cacheControl.immutable
                }}
                style={styles.tabletLogo as any}
                resizeMode={FastImage.resizeMode.contain}
                onError={onLogoLoadError}
              />
            </Animated.View>
          ) : (
            <Text style={[styles.tabletTitle as TextStyle, { color: currentTheme.colors.white }]}>
              {item.name}
            </Text>
          )}

          <View style={styles.tabletGenreContainer as ViewStyle}>
            {item.genres?.slice(0, 4).map((genre, index, array) => (
              <React.Fragment key={index}>
                <Text style={[styles.tabletGenreText as TextStyle, { color: currentTheme.colors.white }]}>
                  {genre}
                </Text>
                {index < array.length - 1 && (
                  <Text style={[styles.tabletGenreDot as TextStyle, { color: currentTheme.colors.white }]}>•</Text>
                )}
              </React.Fragment>
            ))}
          </View>

          {item.description && (
            <Text style={[styles.tabletDescription as TextStyle, { color: currentTheme.colors.white }]} numberOfLines={3}>
              {item.description}
            </Text>
          )}

          <Animated.View style={[styles.tabletButtons as ViewStyle, buttonsAnimatedStyle]}>
            <TouchableOpacity
              style={[styles.tabletPlayButton as ViewStyle, { backgroundColor: currentTheme.colors.white }]}
              onPress={onPressPlay}
              activeOpacity={0.8}
            >
              <MaterialIcons name="play-arrow" size={28} color={currentTheme.colors.black} />
              <Text style={[styles.tabletPlayButtonText as TextStyle, { color: currentTheme.colors.black }]}>
                Play Now
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabletSecondaryButton as ViewStyle, { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={onSaveToLibrary}
              activeOpacity={0.7}
            >
              <MaterialIcons name={isSaved ? "bookmark" : "bookmark-outline"} size={20} color={currentTheme.colors.white} />
              <Text style={[styles.tabletSecondaryButtonText as TextStyle, { color: currentTheme.colors.white }]}>
                {isSaved ? "Saved" : "My List"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabletSecondaryButton as ViewStyle, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={onPressInfo}
              activeOpacity={0.7}
            >
              <MaterialIcons name="info-outline" size={20} color={currentTheme.colors.white} />
              <Text style={[styles.tabletSecondaryButtonText as TextStyle, { color: currentTheme.colors.white }]}>
                More Info
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    );
  } else {
    // Phone layout
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={onPressInfo}
        style={styles.featuredContainer as ViewStyle}
      >
        <Animated.View style={[styles.imageContainer, posterAnimatedStyle]}>
          <ImageBackground
            source={{ uri: bannerUrl || item.poster }}
            style={styles.featuredImage as ViewStyle}
            resizeMode="cover"
          >
            <Animated.View style={[styles.contentOverlay, overlayAnimatedStyle]} />
            <LinearGradient
              colors={[
                'rgba(0,0,0,0.1)',
                'rgba(0,0,0,0.2)',
                'rgba(0,0,0,0.4)',
                'rgba(0,0,0,0.8)',
                currentTheme.colors.darkBackground,
              ]}
              locations={[0, 0.2, 0.5, 0.8, 1]}
              style={styles.featuredGradient as ViewStyle}
            >
              <Animated.View
                style={[styles.featuredContentContainer as ViewStyle, contentAnimatedStyle]}
              >
                {logoUrl && !logoLoadError ? (
                  <Animated.View style={logoAnimatedStyle}>
                    <FastImage
                      source={{
                        uri: logoUrl,
                        priority: FastImage.priority.high,
                        cache: FastImage.cacheControl.immutable
                      }}
                      style={styles.featuredLogo as any}
                      resizeMode={FastImage.resizeMode.contain}
                      onError={onLogoLoadError}
                    />
                  </Animated.View>
                ) : (
                  <Text style={[styles.featuredTitleText as TextStyle, { color: currentTheme.colors.highEmphasis }]}>
                    {item.name}
                  </Text>
                )}
                <View style={styles.genreContainer as ViewStyle}>
                  {item.genres?.slice(0, 3).map((genre, index, array) => (
                    <React.Fragment key={index}>
                      <Text style={[styles.genreText as TextStyle, { color: currentTheme.colors.white }]}>
                        {genre}
                      </Text>
                      {index < array.length - 1 && (
                        <Text style={[styles.genreDot as TextStyle, { color: currentTheme.colors.white }]}>•</Text>
                      )}
                    </React.Fragment>
                  ))}
                </View>
              </Animated.View>

              <Animated.View style={[styles.featuredButtons as ViewStyle, buttonsAnimatedStyle]}>
                <TouchableOpacity
                  style={styles.myListButton as ViewStyle}
                  onPress={onSaveToLibrary}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name={isSaved ? "bookmark" : "bookmark-outline"} size={24} color={currentTheme.colors.white} />
                  <Text style={[styles.myListButtonText as TextStyle, { color: currentTheme.colors.white }]}>
                    {isSaved ? "Saved" : "Save"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.playButton as ViewStyle, { backgroundColor: currentTheme.colors.white }]}
                  onPress={onPressPlay}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="play-arrow" size={24} color={currentTheme.colors.black} />
                  <Text style={[styles.playButtonText as TextStyle, { color: currentTheme.colors.black }]}>
                    Play
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.infoButton as ViewStyle}
                  onPress={onPressInfo}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="info-outline" size={24} color={currentTheme.colors.white} />
                  <Text style={[styles.infoButtonText as TextStyle, { color: currentTheme.colors.white }]}>
                    Info
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </LinearGradient>
          </ImageBackground>
        </Animated.View>
      </TouchableOpacity>
    );
  }
});

const { width, height } = Dimensions.get('window');

// Utility to determine if device is tablet-sized
const isTablet = width >= 768;

// Simple perf timer helper
const nowMs = () => Date.now();
const since = (start: number) => `${(nowMs() - start).toFixed(0)}ms`;

const NoFeaturedContent = ({ onRetry }: { onRetry?: () => void }) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();

  const styles = StyleSheet.create({
    noContentContainer: {
      height: height * 0.55,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
      backgroundColor: currentTheme.colors.elevation1,
      borderRadius: 12,
      marginBottom: 12,
    },
    noContentTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: currentTheme.colors.highEmphasis,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
    },
    noContentText: {
      fontSize: 16,
      color: currentTheme.colors.mediumEmphasis,
      textAlign: 'center',
      marginBottom: 24,
    },
    noContentButtons: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
      width: '100%',
    },
    noContentButton: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 30,
      backgroundColor: currentTheme.colors.elevation3,
      alignItems: 'center',
      justifyContent: 'center'
    },
    noContentButtonText: {
      color: currentTheme.colors.highEmphasis,
      fontWeight: '600',
      fontSize: 14,
    }
  });

  return (
    <View style={styles.noContentContainer}>
      <MaterialIcons name="theaters" size={48} color={currentTheme.colors.mediumEmphasis} />
      <Text style={styles.noContentTitle}>{onRetry ? 'Couldn\'t load featured content' : 'No Featured Content'}</Text>
      <Text style={styles.noContentText}>
        {onRetry
          ? 'There was a problem fetching featured content. Please check your connection and try again.'
          : 'Install addons with catalogs or change the content source in your settings.'}
      </Text>
      <View style={styles.noContentButtons}>
        {onRetry ? (
          <TouchableOpacity
            style={[styles.noContentButton, { backgroundColor: currentTheme.colors.primary }]}
            onPress={onRetry}
          >
            <Text style={[styles.noContentButtonText, { color: currentTheme.colors.white }]}>Retry</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.noContentButton, { backgroundColor: currentTheme.colors.primary }]}
              onPress={() => navigation.navigate('Addons')}
            >
              <Text style={[styles.noContentButtonText, { color: currentTheme.colors.white }]}>Install Addons</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.noContentButton}
              onPress={() => navigation.navigate('HomeScreenSettings')}
            >
              <Text style={styles.noContentButtonText}>Settings</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const FeaturedContent = ({ featuredContent, isSaved, handleSaveToLibrary, loading, onRetry }: FeaturedContentProps) => {
  // Normalize data to always be an array
  const items = useMemo(() => {
    if (Array.isArray(featuredContent)) {
      return featuredContent;
    } else if (featuredContent) {
      return [featuredContent];
    }
    return [];
  }, [featuredContent]);

  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const scrollOffsetValue = useSharedValue<number>(0);
  const progress = useSharedValue<number>(0);
  const carouselRef = useRef<ICarouselInstance>(null);
  const firstRenderTsRef = useRef<number>(nowMs());

  // Initial diagnostics
  useEffect(() => {
    logger.info('[FeaturedContent] mounted', {
      isTablet,
      screen: { width, height },
    });
    return () => {
      logger.info('[FeaturedContent] unmounted');
    };
  }, []);

  // Stable hero height for tablets to prevent layout jumps
  const tabletHeroHeight = useMemo(() => {
    const aspectBased = width * 0.56; // ~16:9 visual
    const screenBased = height * 0.62;
    return Math.min(screenBased, aspectBased);
  }, [width, height]);

  // Wrapper component to handle async isSaved check
  const CarouselItemWrapper = React.memo(({ item }: { item: StreamingContent }) => {
    const [savedStatus, setSavedStatus] = useState(false);

    useEffect(() => {
      const checkSavedStatus = async () => {
        try {
          const status = await isSaved(item);
          setSavedStatus(status);
        } catch (error) {
          logger.error('Error checking saved status:', error);
          setSavedStatus(false);
        }
      };
      checkSavedStatus();
    }, [item.id]);

    return (
      <FeaturedContentItem
        item={item}
        isSaved={savedStatus}
        onSaveToLibrary={() => handleSaveToLibrary(item)}
        onPressInfo={() => {
          navigation.navigate('Metadata', {
            id: item.id,
            type: item.type
          });
        }}
        onPressPlay={() => {
          navigation.navigate('Streams', {
            id: item.id,
            type: item.type
          });
        }}
      />
    );
  });

  // Render item function for the carousel
  const renderItem = useCallback(({ item }: { item: StreamingContent }) => {
    return <CarouselItemWrapper item={item} />;
  }, [isSaved, handleSaveToLibrary, navigation]);

  // Pagination press handler
  const onPressPagination = useCallback((index: number) => {
    carouselRef.current?.scrollTo({
      // Scroll to nearest target
      count: index - progress.value,
      animated: true,
    });
  }, []);

  // Show skeleton only if we're loading AND no content is available yet
  if (loading && items.length === 0) {
    logger.debug('[FeaturedContent] render:loading', { sinceMount: since(firstRenderTsRef.current) });
    return <SkeletonFeatured />;
  }

  if (items.length === 0) {
    // Suppress empty state while loading to avoid flash on startup/hydration
    logger.debug('[FeaturedContent] render:no-featured-content', { sinceMount: since(firstRenderTsRef.current) });
    return <NoFeaturedContent onRetry={onRetry} />;
  }

  const containerStyle = isTablet
    ? [styles.tabletContainer as ViewStyle, { height: tabletHeroHeight }]
    : styles.featuredContainer as ViewStyle;

  return (
    <>
    <Animated.View
      entering={FadeIn.duration(400).easing(Easing.out(Easing.cubic))}
      style={containerStyle}
    >
      <Carousel
        ref={carouselRef}
        testID="featured-carousel"
        loop={items.length > 1}
        width={width}
        height={isTablet ? tabletHeroHeight : height * 0.55}
        snapEnabled={true}
        pagingEnabled={true}
        autoPlay={items.length > 1}
        autoPlayInterval={4000}
        data={items}
        defaultScrollOffsetValue={scrollOffsetValue}
        onProgressChange={progress}
        style={{ width: "100%" }}
        onScrollStart={() => {
          logger.debug("Carousel scroll start");
        }}
        onScrollEnd={() => {
          logger.debug("Carousel scroll end");
        }}
        onConfigurePanGesture={(g: { enabled: (arg0: boolean) => any }) => {
          "worklet";
          g.enabled(true);
        }}
        onSnapToItem={(index: number) => {
          logger.debug("Carousel current index:", index);
        }}
        renderItem={renderItem}
      />

      {/* Bottom fade to blend with background */}
      <LinearGradient
        colors={[
          'transparent',
          currentTheme.colors.darkBackground
        ]}
        locations={[0, 1]}
        style={isTablet ? styles.tabletBottomFade as ViewStyle : styles.phoneBottomFade as ViewStyle}
        pointerEvents="none"
      />

    </Animated.View>
    {/* Pagination strictly below the hero container (not clipped by overflow) */}
    {items.length > 1 && (
      <View
        style={{
          alignItems: 'center',
          paddingTop: isTablet ? 10 : 8,
          paddingBottom: isTablet ? 10 : 8,
        }}
        pointerEvents="auto"
      >
        <Pagination.Custom
          progress={progress}
          data={items}
          size={10}
          dotStyle={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: currentTheme.colors.elevation3,
            opacity: 0.9,
          }}
          activeDotStyle={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: currentTheme.colors.white,
          }}
          containerStyle={{ gap: 8 }}
          horizontal
          onPress={onPressPagination}
          customReanimatedStyle={(p: number, index: number, length: number) => {
            'worklet';
            // Smooth scale for the active dot
            let v = Math.abs(p - index);
            if (index === 0 && p > length - 1) {
              v = Math.abs(p - length);
            }
            const scale = interpolate(v, [0, 1], [1.2, 1], Extrapolation.CLAMP);
            return { transform: [{ scale }] };
          }}
        />
      </View>
    )}
    </>
  );
};

const styles = StyleSheet.create({
  featuredContainer: {
    width: '100%',
    height: height * 0.55,
    marginTop: 0,
    marginBottom: 12,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.05 }], // Subtle zoom for depth
  },
  backgroundFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  featuredGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    paddingTop: 20,
  },
  featuredContentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 40,
  },
  featuredLogo: {
    width: width * 0.8,
    height: 120,
    marginBottom: 0,
    alignSelf: 'center',
    minWidth: 250,
    minHeight: 80,
  },
  featuredTitleText: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  genreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  genreText: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.9,
  },
  genreDot: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 4,
  },
  featuredButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    minHeight: 70,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flex: 0,
    width: 140,
  },
  myListButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 6,
    width: 44,
    height: 44,
    flex: undefined,
  },
  infoButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 4,
    width: 44,
    height: 44,
    flex: undefined,
  },
  playButtonText: {
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  myListButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  infoButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Tablet-specific styles
  tabletContainer: {
    width: '100%',
    height: height * 0.7,
    position: 'relative',
    marginTop: 0,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tabletFullContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  tabletImageWrapper: {
    width: '100%',
    height: '100%',
  },
  tabletImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.02 }],
  },
  tabletImageGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabletOverlayContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 40,
    paddingBottom: 50,
    alignItems: 'center',
    zIndex: 10,
  },
  tabletBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 11,
    pointerEvents: 'none',
  },
  phoneBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    zIndex: 11,
    pointerEvents: 'none',
  },
  tabletLogo: {
    width: width * 0.32,
    height: 120,
    marginBottom: 16,
    alignSelf: 'center',
    minWidth: 200,
    minHeight: 80,
  },
  tabletTitle: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    lineHeight: 42,
  },
  tabletGenreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabletGenreText: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.9,
    marginRight: 8,
  },
  tabletGenreDot: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.6,
    marginRight: 8,
  },
  tabletDescription: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.85,
    marginBottom: 28,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    maxWidth: '70%',
    textAlign: 'center',
  },
  tabletButtons: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    minWidth: 160,
  },
  tabletPlayButtonText: {
    fontWeight: '700',
    marginLeft: 12,
    fontSize: 18,
  },
  tabletSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    gap: 6,
    minWidth: 120,
  },
  tabletSecondaryButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  contentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: 1,
    pointerEvents: 'none',
  },
});

export default React.memo(FeaturedContent);