import React, { useMemo, useState, useEffect, useCallback, memo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle, ImageStyle, ScrollView, StyleProp, Platform, Image, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, Easing, useSharedValue, withTiming, useAnimatedStyle, useAnimatedScrollHandler, useAnimatedReaction, runOnJS, SharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import FastImage, { priority as FIPriority, cacheControl as FICacheControl, resizeMode as FIResizeMode, preload as FIPreload } from '../../utils/FastImageCompat';
import { Pagination } from 'react-native-reanimated-carousel';
import { Ionicons } from '@expo/vector-icons';

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

// Offset to keep cards below a top tab navigator
const TOP_TABS_OFFSET = Platform.OS === 'ios' ? 44 : 48;

const HeroCarousel: React.FC<HeroCarouselProps> = ({ items, loading = false }) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Responsive sizing computed per-render so rotation updates layout
  const isTablet = useMemo(
    () => Math.min(windowWidth, windowHeight) >= 600 || (Platform.OS === 'ios' && (Platform as any).isPad),
    [windowWidth, windowHeight]
  );

  // Keep height based on baseline phone width; widen only on tablets
  const baseCardWidthForHeight = useMemo(
    () => Math.min(windowWidth * 0.8, 480),
    [windowWidth]
  );

  const cardWidth = useMemo(
    () => (isTablet ? Math.max(560, windowWidth - 2 * Math.round(0.1 * windowWidth)) : Math.min(windowWidth * 0.8, 480)),
    [isTablet, windowWidth]
  );

  const cardHeight = useMemo(
    () => Math.round(baseCardWidthForHeight * 9 / 16) + 310,
    [baseCardWidthForHeight]
  );

  const interval = useMemo(() => cardWidth + 16, [cardWidth]);

  // Reduce top padding on phones while keeping tablets unchanged
  const effectiveTopOffset = useMemo(() => (isTablet ? TOP_TABS_OFFSET : 8), [isTablet]);

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
  const [isScrollReady, setIsScrollReady] = useState(false);
  const [flippedMap, setFlippedMap] = useState<Record<string, boolean>>({});
  const toggleFlipById = useCallback((id: string) => {
    setFlippedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Note: do not early-return before hooks. Loading UI is returned later.

  const hasData = data.length > 0;

  // Optimized: update background as soon as scroll starts, without waiting for momentum end
  const scrollX = useSharedValue(0);
  const paginationProgress = useSharedValue(0);

  // Parallel image prefetch: start fetching banners and logos as soon as data arrives
  const itemsToPreload = useMemo(() => data.slice(0, 3), [data]);
  useEffect(() => {
    if (!itemsToPreload.length) return;
    try {
      const sources = itemsToPreload.flatMap((it) => {
        const result: { uri: string; priority?: any }[] = [];
        const bannerOrPoster = it.banner || it.poster;
        if (bannerOrPoster) {
          result.push({ uri: bannerOrPoster, priority: FIPriority.low });
        }
        if (it.logo) {
          result.push({ uri: it.logo, priority: FIPriority.normal });
        }
        return result;
      });
      // de-duplicate by uri
      const uniqueSources = Array.from(new Map(sources.map((s) => [s.uri, s])).values());
      if (uniqueSources.length) {
        FIPreload(uniqueSources);
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
    setIsScrollReady(false);

    // Scroll to position and mark ready after layout
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: loopingEnabled ? interval : 0, y: 0, animated: false });
      setIsScrollReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Reset scroll when data becomes available
  useEffect(() => {
    if (data.length > 0) {
      scrollX.value = loopingEnabled ? interval : 0;
      setActiveIndex(0);
      setIsScrollReady(false);

      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: loopingEnabled ? interval : 0, y: 0, animated: false });
        setIsScrollReady(true);
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [data.length]);

  // Re-center on rotation using current interval and activeIndex
  useEffect(() => {
    if (!hasData) return;
    const timer = setTimeout(() => {
      scrollToLogicalIndex(activeIndex, false);
    }, 50);
    return () => clearTimeout(timer);
  }, [windowWidth, windowHeight, interval, loopingEnabled]);

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
    [interval, loopingEnabled]
  );

  // JS helper to jump without flicker when hitting clones
  const scrollToLogicalIndex = useCallback((logicalIndex: number, animated = true) => {
    const target = loopingEnabled ? (logicalIndex + 1) * interval : logicalIndex * interval;
    scrollViewRef.current?.scrollTo({ x: target, y: 0, animated });
  }, [interval, loopingEnabled]);

  const contentPadding = useMemo(() => ({ paddingHorizontal: (windowWidth - cardWidth) / 2 }), [windowWidth, cardWidth]);

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
      <View style={[styles.container, { paddingTop: 12 + effectiveTopOffset }] as StyleProp<ViewStyle>}>
        <View style={{ height: cardHeight }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: (windowWidth - cardWidth) / 2 }}
          >
            {[1, 2, 3].map((_, index) => (
              <View key={index} style={{ width: cardWidth + 16 }}>
                <View style={[
                  styles.card,
                  {
                    backgroundColor: currentTheme.colors.elevation1,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                    width: cardWidth,
                    height: cardHeight,
                  }
                ] as StyleProp<ViewStyle>}>
                  <View style={styles.skeletonBannerFull as ViewStyle} />
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
                  priority: FIPriority.low,
                  cache: FICacheControl.immutable
                }}
                style={styles.backgroundImage as any}
                resizeMode={FIResizeMode.cover}
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
    <View>
      <Animated.View style={[styles.container as ViewStyle, { paddingTop: 12 + effectiveTopOffset }]}>
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
          snapToInterval={interval}
          decelerationRate="fast"
          contentContainerStyle={contentPadding}
          onScroll={scrollHandler}
          scrollEventThrottle={32}
          disableIntervalMomentum
          pagingEnabled={false}
          bounces={false}
          overScrollMode="never"
          style={{ opacity: isScrollReady ? 1 : 0 }}
          contentOffset={{ x: loopingEnabled ? interval : 0, y: 0 }}
          onMomentumScrollEnd={(e) => {
            if (!loopingEnabled) return;
            // Determine current page index in cloned space
            const x = e?.nativeEvent?.contentOffset?.x ?? 0;
            const page = Math.round(x / interval);
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
            /* TEST 5: ORIGINAL CARD WITHOUT LINEAR GRADIENT */
            <CarouselCard
              key={`${item.id}-${index}-${loopingEnabled ? 'loop' : 'base'}`}
              item={item}
              colors={currentTheme.colors}
              logoFailed={failedLogoIds.has(item.id)}
              onLogoError={() => setFailedLogoIds((prev) => new Set(prev).add(item.id))}
              onPressInfo={() => handleNavigateToMetadata(item.id, item.type)}
              scrollX={scrollX}
              index={index}
              flipped={!!flippedMap[item.id]}
              onToggleFlip={() => toggleFlipById(item.id)}
              interval={interval}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              isTablet={isTablet}
            />
          ))}
        </Animated.ScrollView>
      </Animated.View>
      {/* Pagination below the card row (library-based, worklet-driven) */}
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 6, position: 'relative', zIndex: 1 }} pointerEvents="auto">
        <Pagination.Basic
          progress={paginationProgress}
          data={data}
          size={10}
          dotStyle={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: currentTheme.colors.elevation3,
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
        />
      </View>
    </View>
  );
};

// MINIMAL ANIMATED CARD FOR PERFORMANCE TESTING
interface AnimatedCardWrapperProps {
  item: StreamingContent;
  index: number;
  scrollX: SharedValue<number>;
  interval: number;
  cardWidth: number;
  cardHeight: number;
  colors: any;
  isTablet: boolean;
}

const AnimatedCardWrapper: React.FC<AnimatedCardWrapperProps> = memo(({
  item, index, scrollX, interval, cardWidth, cardHeight, colors, isTablet
}) => {
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * interval;
    const distance = Math.abs(translateX - cardOffset);

    if (distance > interval * 1.5) {
      return {
        transform: [{ scale: isTablet ? 0.95 : 0.9 }],
        opacity: isTablet ? 0.85 : 0.7
      };
    }

    const maxDistance = interval;
    const scale = 1 - (distance / maxDistance) * 0.1;
    const clampedScale = Math.max(isTablet ? 0.95 : 0.9, Math.min(1, scale));
    const opacity = 1 - (distance / maxDistance) * 0.3;
    const clampedOpacity = Math.max(isTablet ? 0.85 : 0.7, Math.min(1, opacity));

    return {
      transform: [{ scale: clampedScale }],
      opacity: clampedOpacity,
    };
  });

  const logoOpacity = useSharedValue(0);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const isFlipped = useSharedValue(0);

  useEffect(() => {
    if (logoLoaded) {
      logoOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
    }
  }, [logoLoaded]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  // TEST 4: FLIP STYLES
  const frontFlipStyle = useAnimatedStyle(() => {
    const rotate = interpolate(isFlipped.value, [0, 1], [0, 180]);
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotate}deg` },
      ],
    } as any;
  });

  const backFlipStyle = useAnimatedStyle(() => {
    const rotate = interpolate(isFlipped.value, [0, 1], [-180, 0]);
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotate}deg` },
      ],
    } as any;
  });

  // TEST 4: OVERLAY ANIMATED STYLE (genres opacity on scroll)
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * interval;
    const distance = Math.abs(translateX - cardOffset);

    if (distance > interval * 1.2) {
      return { opacity: 0 };
    }

    const maxDistance = interval * 0.5;
    const progress = Math.min(distance / maxDistance, 1);
    const opacity = 1 - progress;
    const clampedOpacity = Math.max(0, Math.min(1, opacity));

    return {
      opacity: clampedOpacity,
    };
  });

  return (
    <View style={{ width: cardWidth + 16 }}>
      <Animated.View style={[
        {
          width: cardWidth,
          height: cardHeight,
          backgroundColor: colors.elevation1,
          borderRadius: 16,
          overflow: 'hidden',
        },
        cardAnimatedStyle
      ]}>
        <FastImage
          source={{
            uri: item.banner || item.poster,
            priority: FIPriority.normal,
            cache: FICacheControl.immutable
          }}
          style={{ width: '100%', height: '100%', position: 'absolute' }}
          resizeMode={FIResizeMode.cover}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.6)"]}
          locations={[0.4, 0.7, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        {item.logo && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center' }}>
            <Animated.View style={logoAnimatedStyle}>
              <FastImage
                source={{
                  uri: item.logo,
                  priority: FIPriority.high,
                  cache: FICacheControl.immutable
                }}
                style={{ width: Math.round(cardWidth * 0.72), height: 64 }}
                resizeMode={FIResizeMode.contain}
                onLoad={() => setLogoLoaded(true)}
              />
            </Animated.View>
          </View>
        )}
        {/* TEST 4: GENRES with overlayAnimatedStyle */}
        {item.genres && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' }}>
            <Animated.Text
              style={[{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center' }, overlayAnimatedStyle]}
              numberOfLines={1}
            >
              {item.genres.slice(0, 3).join(' • ')}
            </Animated.Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
});

interface CarouselCardProps {
  item: StreamingContent;
  colors: any;
  logoFailed: boolean;
  onLogoError: () => void;
  onPressInfo: () => void;
  scrollX: SharedValue<number>;
  index: number;
  flipped: boolean;
  onToggleFlip: () => void;
  interval: number;
  cardWidth: number;
  cardHeight: number;
  isTablet: boolean;
}

const CarouselCard: React.FC<CarouselCardProps> = memo(({ item, colors, logoFailed, onLogoError, onPressInfo, scrollX, index, flipped, onToggleFlip, interval, cardWidth, cardHeight, isTablet }) => {
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const bannerOpacity = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const genresOpacity = useSharedValue(0);
  const actionsOpacity = useSharedValue(0);
  const isFlipped = useSharedValue(flipped ? 1 : 0);

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
    (index - 1) * interval,
    index * interval,
    (index + 1) * interval,
  ];

  const bannerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bannerOpacity.value,
  }));

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  // Flip styles
  const frontFlipStyle = useAnimatedStyle(() => {
    const rotate = interpolate(isFlipped.value, [0, 1], [0, 180]);
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotate}deg` },
      ],
    } as any;
  });

  const backFlipStyle = useAnimatedStyle(() => {
    const rotate = interpolate(isFlipped.value, [0, 1], [-180, 0]);
    return {
      transform: [
        { perspective: 1000 },
        { rotateY: `${rotate}deg` },
      ],
    } as any;
  });

  // Sync animation with prop changes
  useEffect(() => {
    isFlipped.value = withTiming(flipped ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [flipped]);

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
    const cardOffset = index * interval;
    const distance = Math.abs(translateX - cardOffset);

    // AGGRESSIVE early exit for cards far from center
    if (distance > interval * 1.2) {
      return { opacity: 0 };
    }

    const maxDistance = interval * 0.5;
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
    const cardOffset = index * interval;
    const distance = Math.abs(translateX - cardOffset);

    // AGGRESSIVE early exit for cards far from center
    if (distance > interval * 1.5) {
      return {
        transform: [{ scale: isTablet ? 0.95 : 0.9 }],
        opacity: isTablet ? 0.85 : 0.7
      };
    }

    const maxDistance = interval;

    // Scale animation based on distance from center
    const scale = 1 - (distance / maxDistance) * 0.1;
    const clampedScale = Math.max(isTablet ? 0.95 : 0.9, Math.min(1, scale));

    // Opacity animation for cards that are far from center
    const opacity = 1 - (distance / maxDistance) * 0.3;
    const clampedOpacity = Math.max(isTablet ? 0.85 : 0.7, Math.min(1, opacity));

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
    <View style={{ width: cardWidth + 16 }}>
      <View style={{ width: cardWidth, height: cardHeight }}>
        <Animated.View style={[
          styles.card,
          cardAnimatedStyle,
          {
            backgroundColor: colors.elevation1,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
            width: cardWidth,
            height: cardHeight,
          }
        ] as StyleProp<ViewStyle>}>
          {isTablet ? (
            <>
              <View style={styles.bannerContainer as ViewStyle}>
                {!bannerLoaded && (
                  <View style={styles.skeletonBannerFull as ViewStyle} />
                )}
                <Animated.View style={[bannerAnimatedStyle, { flex: 1 }]}>
                  <FastImage
                    source={{
                      uri: item.banner || item.poster,
                      priority: FIPriority.normal,
                      cache: FICacheControl.immutable
                    }}
                    style={styles.banner as any}
                    resizeMode={FIResizeMode.cover}
                    onLoad={() => setBannerLoaded(true)}
                  />
                </Animated.View>
                {/* Overlay removed for performance - readability via text shadows */}
              </View>
              <View style={styles.backContent as ViewStyle}>
                {item.logo && !logoFailed ? (
                  <FastImage
                    source={{ uri: item.logo, priority: FIPriority.normal, cache: FICacheControl.immutable }}
                    style={[styles.logo as any, { width: Math.round(cardWidth * 0.72) }]}
                    resizeMode={FIResizeMode.contain}
                  />
                ) : (
                  <Text style={[styles.backTitle as TextStyle, { color: colors.highEmphasis }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                )}
                {item.year && (
                  <View style={styles.infoRow as ViewStyle}>
                    <View style={styles.infoItem as ViewStyle}>
                      <Ionicons name="calendar-outline" size={14} color={colors.mediumEmphasis} />
                      <Text style={[styles.infoText as TextStyle, { color: colors.mediumEmphasis }]}>{item.year}</Text>
                    </View>
                  </View>
                )}
                <ScrollView style={{ maxHeight: 120, width: Math.round(cardWidth * 0.85), alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
                  <Text style={[
                    styles.backDescription as TextStyle,
                    {
                      color: colors.highEmphasis,
                      textAlign: 'center',
                      textShadowColor: 'rgba(0,0,0,0.6)',
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 2,
                    }
                  ]}>
                    {item.description || 'No description available'}
                  </Text>
                </ScrollView>
              </View>
              <TouchableOpacity activeOpacity={0.9} onPress={onPressInfo} style={StyleSheet.absoluteFillObject as any} />
            </>
          ) : (
            <>
              {/* FRONT FACE */}
              <Animated.View style={[styles.flipFace as any, styles.frontFace as any, frontFlipStyle]} pointerEvents={flipped ? 'none' : 'auto'}>
                <TouchableOpacity activeOpacity={0.9} onPress={onPressInfo} style={StyleSheet.absoluteFillObject as any}>
                  <View style={styles.bannerContainer as ViewStyle}>
                    {!bannerLoaded && (
                      <View style={styles.skeletonBannerFull as ViewStyle} />
                    )}
                    <Animated.View style={[bannerAnimatedStyle, { flex: 1 }]}>
                      <FastImage
                        source={{
                          uri: item.banner || item.poster,
                          priority: FIPriority.normal,
                          cache: FICacheControl.immutable
                        }}
                        style={styles.banner as any}
                        resizeMode={FIResizeMode.cover}
                        onLoad={() => setBannerLoaded(true)}
                      />
                    </Animated.View>
                    {/* Overlay removed for performance - readability via text shadows */}
                  </View>
                  {item.logo && !logoFailed ? (
                    <View style={styles.logoOverlay as ViewStyle} pointerEvents="none">
                      <Animated.View style={logoAnimatedStyle}>
                        <FastImage
                          source={{
                            uri: item.logo,
                            priority: FIPriority.high,
                            cache: FICacheControl.immutable
                          }}
                          style={[styles.logo as any, { width: Math.round(cardWidth * 0.72) }]}
                          resizeMode={FIResizeMode.contain}
                          onLoad={() => setLogoLoaded(true)}
                          onError={onLogoError}
                        />
                      </Animated.View>
                    </View>
                  ) : (
                    <View style={styles.titleOverlay as ViewStyle} pointerEvents="none">
                      <View>
                        <Text style={[styles.title as TextStyle, { color: colors.highEmphasis, textAlign: 'center' }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </View>
                    </View>
                  )}
                  {item.genres && (
                    <View style={styles.genresOverlay as ViewStyle} pointerEvents="none">
                      <View>
                        <Animated.Text
                          style={[styles.genres as TextStyle, { color: colors.mediumEmphasis, textAlign: 'center' }, overlayAnimatedStyle]}
                          numberOfLines={1}
                        >
                          {item.genres.slice(0, 3).join(' • ')}
                        </Animated.Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* BACK FACE */}
              <Animated.View style={[styles.flipFace as any, styles.backFace as any, backFlipStyle]} pointerEvents={flipped ? 'auto' : 'none'}>
                <View style={styles.bannerContainer as ViewStyle}>
                  <FastImage
                    source={{ uri: item.banner || item.poster, priority: FIPriority.low, cache: FICacheControl.immutable }}
                    style={styles.banner as any}
                    resizeMode={FIResizeMode.cover}
                  />
                  {/* Overlay removed for performance - readability via text shadows */}
                </View>
                <View style={styles.backContent as ViewStyle}>
                  {item.logo && !logoFailed ? (
                    <FastImage
                      source={{ uri: item.logo, priority: FIPriority.normal, cache: FICacheControl.immutable }}
                      style={[styles.logo as any, { width: Math.round(cardWidth * 0.72) }]}
                      resizeMode={FIResizeMode.contain}
                    />
                  ) : (
                    <Text style={[styles.backTitle as TextStyle, { color: colors.highEmphasis }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  )}
                  {item.year && (
                    <View style={styles.infoRow as ViewStyle}>
                      <View style={styles.infoItem as ViewStyle}>
                        <Ionicons name="calendar-outline" size={14} color={colors.mediumEmphasis} />
                        <Text style={[styles.infoText as TextStyle, { color: colors.mediumEmphasis }]}>{item.year}</Text>
                      </View>
                    </View>
                  )}
                  <ScrollView style={{ maxHeight: 120 }} showsVerticalScrollIndicator={false}>
                    <Text style={[
                      styles.backDescription as TextStyle,
                      {
                        color: colors.highEmphasis,
                        textShadowColor: 'rgba(0,0,0,0.6)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }
                    ]}>
                      {item.description || 'No description available'}
                    </Text>
                  </ScrollView>
                </View>
              </Animated.View>

              {/* FLIP BUTTON */}
              <View style={styles.flipButtonContainer as ViewStyle} pointerEvents="box-none">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onToggleFlip}
                  style={styles.flipButton as ViewStyle}
                >
                  <Ionicons name={flipped ? 'close' : 'information-outline'} size={18} color={colors.white} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      </View>
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
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  flipFace: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
  },
  frontFace: {
    // front specific adjustments if needed
  },
  backFace: {
    // back specific adjustments if needed
    backfaceVisibility: 'hidden',
  },
  skeletonCard: {
    width: '100%',
    height: '100%',
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
  flipButtonContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
  },
  flipButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)'
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
    width: 200,
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
  backContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  backTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  backDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 6,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
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


