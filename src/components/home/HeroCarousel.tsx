import React, { useMemo, useState, useEffect, useCallback, memo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ViewStyle, TextStyle, ImageStyle, ScrollView, StyleProp, Platform, Image } from 'react-native';
import Animated, { FadeIn, FadeOut, Easing, useSharedValue, withTiming, useAnimatedStyle, useAnimatedScrollHandler, useAnimatedReaction, runOnJS, SharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import FastImage from '@d11/react-native-fast-image';
import { Pagination } from 'react-native-reanimated-carousel';

// Optional iOS Glass effect (expo-glass-effect) with safe fallback for HeroCarousel
let GlassViewComp: any = null;
let liquidGlassAvailable = false;
if (Platform.OS === 'ios') {
  try {
    // Dynamically require so app still runs if the package isn't installed yet
    const glass = require('expo-glass-effect');
    GlassViewComp = glass.GlassView;
    liquidGlassAvailable = typeof glass.isLiquidGlassAvailable === 'function' ? glass.isLiquidGlassAvailable() : false;
  } catch {
    GlassViewComp = null;
    liquidGlassAvailable = false;
  }
}
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent } from '../../services/catalogService';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../hooks/useSettings';

interface HeroCarouselProps {
  items: StreamingContent[];
  loading?: boolean;
}

const { width } = Dimensions.get('window');

const CARD_WIDTH = Math.min(width * 0.8, 480);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 9 / 16) + 310; // increased for more vertical space

const HeroCarousel: React.FC<HeroCarouselProps> = ({ items, loading = false }) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();

  const data = useMemo(() => (items && items.length ? items.slice(0, 10) : []), [items]);
  const loopingEnabled = data.length > 1;
  // Duplicate head/tail for seamless looping
  const loopData = useMemo(() => {
    if (!loopingEnabled) return data;
    const head = data[0];
    const tail = data[data.length - 1];
    return [tail, ...data, head];
  }, [data, loopingEnabled]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedLogoIds, setFailedLogoIds] = useState<Set<string>>(new Set());
  const scrollViewRef = useRef<any>(null);

  // Note: do not early-return before hooks. Loading UI is returned later.

  const hasData = data.length > 0;

  // Optimized: update background as soon as scroll starts, without waiting for momentum end
  const scrollX = useSharedValue(0);
  const interval = CARD_WIDTH + 16;
  const paginationProgress = useSharedValue(0);
  
  // Parallel image prefetch: start fetching banners and logos as soon as data arrives
  const itemsToPreload = useMemo(() => data.slice(0, 12), [data]);
  useEffect(() => {
    if (!itemsToPreload.length) return;
    try {
      const sources = itemsToPreload.flatMap((it) => {
        const result: { uri: string; priority?: any }[] = [];
        const bannerOrPoster = it.banner || it.poster;
        if (bannerOrPoster) {
          result.push({ uri: bannerOrPoster, priority: (FastImage as any).priority?.low });
        }
        if (it.logo) {
          result.push({ uri: it.logo, priority: (FastImage as any).priority?.normal });
        }
        return result;
      });
      // de-duplicate by uri
      const uniqueSources = Array.from(new Map(sources.map((s) => [s.uri, s])).values());
      if (uniqueSources.length && (FastImage as any).preload) {
        (FastImage as any).preload(uniqueSources);
      }
    } catch {
      // no-op: prefetch is best-effort
    }
  }, [itemsToPreload]);
  
  // Comprehensive reset when component mounts/remounts to prevent glitching
  useEffect(() => {
    // Start at the first real item for looping
    scrollX.value = loopingEnabled ? interval : 0;
    setActiveIndex(0);

    // Scroll to position 0 after a brief delay to ensure ScrollView is ready
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: loopingEnabled ? interval : 0, y: 0, animated: false });
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  // Reset scroll when data becomes available
  useEffect(() => {
    if (data.length > 0) {
      scrollX.value = loopingEnabled ? interval : 0;
      setActiveIndex(0);

      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: loopingEnabled ? interval : 0, y: 0, animated: false });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [data.length]);
  
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onBeginDrag: () => {
      // Smooth scroll start - could add haptic feedback here
    },
    onEndDrag: () => {
      // Smooth scroll end
    },
    onMomentumBegin: () => {
      // Momentum scroll start
    },
    onMomentumEnd: () => {
      // Momentum scroll end
    },
  });

  // Debounced activeIndex update to reduce JS bridge crossings
  const lastIndexUpdateRef = useRef(0);
  useAnimatedReaction(
    () => {
      // Convert scroll position to logical data index (exclude duplicated items)
      let idx = Math.round(scrollX.value / interval);
      if (loopingEnabled) {
        idx -= 1; // account for leading duplicate
      }
      if (idx < 0) idx = data.length - 1;
      if (idx > data.length - 1) idx = 0;
      return idx;
    },
    (idx, prevIdx) => {
      if (idx == null || idx === prevIdx) return;
      
      // Debounce updates to reduce JS bridge crossings
      const now = Date.now();
      if (now - lastIndexUpdateRef.current < 100) return; // 100ms debounce
      lastIndexUpdateRef.current = now;
      
      // Clamp to bounds to avoid out-of-range access
      const clamped = Math.max(0, Math.min(idx, data.length - 1));
      runOnJS(setActiveIndex)(clamped);
    },
    [data.length]
  );

  // Keep pagination progress in sync with scrollX so we can animate dots like FeaturedContent
  useAnimatedReaction(
    () => scrollX.value / interval,
    (val) => {
      // Align pagination progress with logical index space
      paginationProgress.value = loopingEnabled ? val - 1 : val;
    },
    []
  );

  // JS helper to jump without flicker when hitting clones
  const scrollToLogicalIndex = useCallback((logicalIndex: number, animated = true) => {
    const target = loopingEnabled ? (logicalIndex + 1) * interval : logicalIndex * interval;
    scrollViewRef.current?.scrollTo({ x: target, y: 0, animated });
  }, [interval, loopingEnabled]);

  const contentPadding = useMemo(() => ({ paddingHorizontal: (width - CARD_WIDTH) / 2 }), []);

  const handleNavigateToMetadata = useCallback((id: string, type: any) => {
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  // Container animation based on scroll - must be before early returns
  // TEMPORARILY DISABLED FOR PERFORMANCE TESTING
  // const containerAnimatedStyle = useAnimatedStyle(() => {
  //   const translateX = scrollX.value;
  //   const progress = Math.abs(translateX) / (data.length * (CARD_WIDTH + 16));
  //   
  //   // Very subtle scale animation for the entire container
  //   const scale = 1 - progress * 0.01;
  //   const clampedScale = Math.max(0.99, Math.min(1, scale));
  //   
  //   return {
  //     transform: [{ scale: clampedScale }],
  //   };
  // });

  if (loading) {
    return (
      <View style={[styles.container, { paddingVertical: 12 }] as StyleProp<ViewStyle>}>
        <View style={{ height: CARD_HEIGHT }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: (width - CARD_WIDTH) / 2 }}
          >
            {[1, 2, 3].map((_, index) => (
              <View key={index} style={{ width: CARD_WIDTH + 16 }}>
                <View style={[
                  styles.card,
                  {
                    backgroundColor: currentTheme.colors.elevation1,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                  }
                ] as StyleProp<ViewStyle>}>
                  <View style={styles.bannerContainer as ViewStyle}>
                    <View style={styles.skeletonBannerFull as ViewStyle} />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.25)"]}
                      locations={[0.6, 1]}
                      style={styles.bannerOverlay as ViewStyle}
                    />
                  </View>
                  <View style={styles.info as ViewStyle}>
                    <View style={[styles.skeletonLine, { width: '62%' }] as StyleProp<ViewStyle>} />
                    <View style={[styles.skeletonLine, { width: '44%', marginTop: 6 }] as StyleProp<ViewStyle>} />
                    <View style={styles.skeletonActions as ViewStyle}>
                      <View style={[styles.skeletonPill, { width: 96 }] as StyleProp<ViewStyle>} />
                      <View style={[styles.skeletonPill, { width: 80 }] as StyleProp<ViewStyle>} />
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Memoized background component with improved timing
  const BackgroundImage = React.memo(({ 
    item, 
    insets
  }: { 
    item: StreamingContent; 
    insets: any;
  }) => {
    return (
      <View
        style={[
          styles.backgroundContainer,
          { top: -insets.top },
        ] as StyleProp<ViewStyle>}
        pointerEvents="none"
      >
        <View
          key={item.id}
          style={{ flex: 1 } as any}
        >
          {Platform.OS === 'android' ? (
            <Image
              source={{ uri: item.banner || item.poster }}
              style={styles.backgroundImage as any}
              resizeMode="cover"
              blurRadius={20}
            />
          ) : (
            <>
              <FastImage
                source={{ 
                  uri: item.banner || item.poster,
                  priority: FastImage.priority.low,
                  cache: FastImage.cacheControl.immutable
                }}
                style={styles.backgroundImage as any}
                resizeMode={FastImage.resizeMode.cover}
              />
              {Platform.OS === 'ios' && GlassViewComp && liquidGlassAvailable ? (
                <GlassViewComp
                  style={styles.backgroundImage as any}
                  glassEffectStyle="regular"
                />
              ) : (
                <BlurView
                  style={styles.backgroundImage as any}
                  intensity={30}
                  tint="dark"
                />
              )}
            </>
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.75)"]}
            locations={[0.4, 1]}
            style={styles.backgroundOverlay as ViewStyle}
          />
        </View>
      </View>
    );
  });

  if (!hasData) return null;

  return (
    <Animated.View entering={FadeIn.duration(150).easing(Easing.out(Easing.cubic))}>
      <Animated.View style={[styles.container as ViewStyle]}>
        {/* Removed preload images for performance - let FastImage cache handle it naturally */}
          {settings.enableHomeHeroBackground && data[activeIndex] && (
            <BackgroundImage
              item={data[activeIndex]}
              insets={insets}
            />
          )}
        {/* Bottom blend to HomeScreen background (not the card) */}
        {settings.enableHomeHeroBackground && (
          <LinearGradient
            colors={["transparent", currentTheme.colors.darkBackground]}
            locations={[0, 1]}
            style={styles.bottomBlend as ViewStyle}
            pointerEvents="none"
          />
        )}
        <Animated.ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={contentPadding}
          onScroll={scrollHandler}
          scrollEventThrottle={32}
          disableIntervalMomentum
          pagingEnabled={false}
          bounces={false}
          overScrollMode="never"
          onMomentumScrollEnd={() => {
            if (!loopingEnabled) return;
            // Determine current page index in cloned space
            const page = Math.round(scrollX.value / interval);
            // If at leading clone (0), jump to last real item
            if (page === 0) {
              scrollToLogicalIndex(data.length - 1, false);
            }
            // If at trailing clone (last), jump to first real item
            const lastPage = loopData.length - 1;
            if (page === lastPage) {
              scrollToLogicalIndex(0, false);
            }
          }}
        >
          {(loopingEnabled ? loopData : data).map((item, index) => (
            <CarouselCard
              key={item.id}
              item={item}
              colors={currentTheme.colors}
              logoFailed={failedLogoIds.has(item.id)}
              onLogoError={() => setFailedLogoIds((prev) => new Set(prev).add(item.id))}
              onPressInfo={() => handleNavigateToMetadata(item.id, item.type)}
              scrollX={scrollX}
              index={index}
            />
          ))}
        </Animated.ScrollView>
      </Animated.View>
      {/* Pagination below the card row (animated like FeaturedContent) */}
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 6, position: 'relative', zIndex: 1 }} pointerEvents="auto">
        <Pagination.Custom
          progress={paginationProgress}
          data={data}
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
          onPress={(index: number) => {
            scrollToLogicalIndex(index, true);
          }}
          customReanimatedStyle={(p: number, index: number, length: number) => {
            'worklet';
            let v = Math.abs(p - index);
            if (index === 0 && p > length - 1) {
              v = Math.abs(p - length);
            }
            const scale = interpolate(v, [0, 1], [1.2, 1], Extrapolation.CLAMP);
            return { transform: [{ scale }] };
          }}
        />
      </View>
    </Animated.View>
  );
};

interface CarouselCardProps {
  item: StreamingContent;
  colors: any;
  logoFailed: boolean;
  onLogoError: () => void;
  onPressInfo: () => void;
  scrollX: SharedValue<number>;
  index: number;
}

const CarouselCard: React.FC<CarouselCardProps> = memo(({ item, colors, logoFailed, onLogoError, onPressInfo, scrollX, index }) => {
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  
  const bannerOpacity = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const genresOpacity = useSharedValue(0);
  const actionsOpacity = useSharedValue(0);
  
  // Reset animations when component mounts/remounts to prevent glitching
  useEffect(() => {
    bannerOpacity.value = 0;
    logoOpacity.value = 0;
    genresOpacity.value = 0;
    actionsOpacity.value = 0;
    // Force re-render states to ensure clean state
    setBannerLoaded(false);
    setLogoLoaded(false);
  }, [item.id]);
  
  const inputRange = [
    (index - 1) * (CARD_WIDTH + 16),
    index * (CARD_WIDTH + 16),
    (index + 1) * (CARD_WIDTH + 16),
  ];
  
  const bannerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bannerOpacity.value,
  }));
  
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  // ULTRA-OPTIMIZED: Only animate the center card and ±1 neighbors
  // Use a simple distance-based approach instead of reading scrollX.value during render
  const shouldAnimate = useMemo(() => {
    // For now, animate all cards but with early exit in worklets
    // This avoids reading scrollX.value during render
    return true;
  }, [index]);

  // Combined animation for genres and actions (same calculation)
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * (CARD_WIDTH + 16);
    const distance = Math.abs(translateX - cardOffset);
    
    // AGGRESSIVE early exit for cards far from center
    if (distance > (CARD_WIDTH + 16) * 1.2) {
      return { opacity: 0 };
    }
    
    const maxDistance = (CARD_WIDTH + 16) * 0.5;
    const progress = Math.min(distance / maxDistance, 1);
    const opacity = 1 - progress;
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    
    return {
      opacity: clampedOpacity,
    };
  });
  
  // ULTRA-OPTIMIZED: Only animate center card and ±1 neighbors
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * (CARD_WIDTH + 16);
    const distance = Math.abs(translateX - cardOffset);
    
    // AGGRESSIVE early exit for cards far from center
    if (distance > (CARD_WIDTH + 16) * 1.5) {
      return { 
        transform: [{ scale: 0.9 }], 
        opacity: 0.7 
      };
    }
    
    const maxDistance = CARD_WIDTH + 16;
    
    // Scale animation based on distance from center
    const scale = 1 - (distance / maxDistance) * 0.1;
    const clampedScale = Math.max(0.9, Math.min(1, scale));
    
    // Opacity animation for cards that are far from center
    const opacity = 1 - (distance / maxDistance) * 0.3;
    const clampedOpacity = Math.max(0.7, Math.min(1, opacity));
    
    return {
      transform: [{ scale: clampedScale }],
      opacity: clampedOpacity,
    };
  });
  
  // TEMPORARILY DISABLED FOR PERFORMANCE TESTING
  // const bannerParallaxStyle = useAnimatedStyle(() => {
  //   const translateX = scrollX.value;
  //   const cardOffset = index * (CARD_WIDTH + 16);
  //   const distance = translateX - cardOffset;
  //   
  //   // Reduced parallax effect to prevent displacement
  //   const parallaxOffset = distance * 0.05;
  //   
  //   return {
  //     transform: [{ translateX: parallaxOffset }],
  //   };
  // });
  
  // TEMPORARILY DISABLED FOR PERFORMANCE TESTING
  // const infoParallaxStyle = useAnimatedStyle(() => {
  //   const translateX = scrollX.value;
  //   const cardOffset = index * (CARD_WIDTH + 16);
  //   const distance = Math.abs(translateX - cardOffset);
  //   const maxDistance = CARD_WIDTH + 16;
  //   
  //   // Hide info section when scrolling (not centered)
  //   const progress = distance / maxDistance;
  //   const opacity = 1 - progress * 2; // Fade out faster when scrolling
  //   const clampedOpacity = Math.max(0, Math.min(1, opacity));
  //   
  //   // Minimal parallax for info section to prevent displacement
  //   const parallaxOffset = -(translateX - cardOffset) * 0.02;
  //   
  //   return {
  //     transform: [{ translateY: parallaxOffset }],
  //     opacity: clampedOpacity,
  //   };
  // });
  
  useEffect(() => {
    if (bannerLoaded) {
      bannerOpacity.value = withTiming(1, { 
        duration: 250, 
        easing: Easing.out(Easing.ease) 
      });
    }
  }, [bannerLoaded]);
  
  useEffect(() => {
    if (logoLoaded) {
      logoOpacity.value = withTiming(1, { 
        duration: 300, 
        easing: Easing.out(Easing.ease) 
      });
    }
  }, [logoLoaded]);

  return (
    <View
      style={{ width: CARD_WIDTH + 16 }}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPressInfo}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      >
        <Animated.View style={[
          styles.card,
          cardAnimatedStyle,
          {
            backgroundColor: colors.elevation1,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
          }
        ] as StyleProp<ViewStyle>}>
          <View style={styles.bannerContainer as ViewStyle}>
            {!bannerLoaded && (
              <View style={styles.skeletonBannerFull as ViewStyle} />
            )}
            <Animated.View style={[bannerAnimatedStyle, { flex: 1 }]}>
              <FastImage
                source={{
                  uri: item.banner || item.poster,
                  priority: FastImage.priority.normal,
                  cache: FastImage.cacheControl.immutable
                }}
                style={styles.banner as any}
                resizeMode={FastImage.resizeMode.cover}
                onLoad={() => setBannerLoaded(true)}
              />
            </Animated.View>
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.6)"]}
              locations={[0.4, 0.7, 1]}
              style={styles.bannerGradient as ViewStyle}
            />
          </View>
        </Animated.View>
        {/* Static genres positioned absolutely over the card */}
        {item.genres && (
          <View style={styles.genresOverlay as ViewStyle} pointerEvents="none">
            <Animated.View entering={FadeIn.duration(400).delay(100)}>
              <Animated.Text
                style={[styles.genres as TextStyle, { color: colors.mediumEmphasis, textAlign: 'center' }, overlayAnimatedStyle]}
                numberOfLines={1}
              >
                {item.genres.slice(0, 3).join(' • ')}
              </Animated.Text>
            </Animated.View>
          </View>
        )}
        {/* Static logo positioned absolutely over the card */}
        {item.logo && !logoFailed && (
          <View style={styles.logoOverlay as ViewStyle} pointerEvents="none">
            <Animated.View style={logoAnimatedStyle}>
              <FastImage
                source={{
                  uri: item.logo,
                  priority: FastImage.priority.high,
                  cache: FastImage.cacheControl.immutable
                }}
                style={styles.logo as any}
                resizeMode={FastImage.resizeMode.contain}
                onLoad={() => setLogoLoaded(true)}
                onError={onLogoError}
              />
            </Animated.View>
          </View>
        )}
        {/* Static title when no logo */}
        {!item.logo || logoFailed ? (
          <View style={styles.titleOverlay as ViewStyle} pointerEvents="none">
            <Animated.View entering={FadeIn.duration(300)}>
              <Text style={[styles.title as TextStyle, { color: colors.highEmphasis, textAlign: 'center' }]} numberOfLines={1}>
                {item.name}
              </Text>
            </Animated.View>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  backgroundContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  backgroundImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  backgroundOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  bottomBlend: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
  },
  skeletonBannerFull: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  bannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  skeletonInfo: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  skeletonActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  skeletonPill: {
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  bannerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  banner: {
    width: '100%',
    height: '100%',
  },
  bannerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  genres: {
    marginTop: 2,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    justifyContent: 'center',
  },
  logo: {
    width: Math.round(CARD_WIDTH * 0.72),
    height: 64,
    marginBottom: 6,
  },
  logoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40, // Position above genres
  },
  titleOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 50, // Position above genres
  },
  genresOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12, // Position at bottom
  },
});

export default React.memo(HeroCarousel);


