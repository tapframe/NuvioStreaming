import React, { useMemo, useState, useEffect, useCallback, memo, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ViewStyle, TextStyle, ImageStyle, ScrollView, StyleProp, Platform, Image } from 'react-native';
import Animated, { FadeIn, FadeOut, Easing, useSharedValue, withTiming, useAnimatedStyle, useAnimatedScrollHandler, useAnimatedReaction, runOnJS, SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import FastImage from '@d11/react-native-fast-image';

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
import { MaterialIcons } from '@expo/vector-icons';
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedLogoIds, setFailedLogoIds] = useState<Set<string>>(new Set());
  const scrollViewRef = useRef<any>(null);

  // Note: do not early-return before hooks. Loading UI is returned later.

  const hasData = data.length > 0;

  // Optimized: update background as soon as scroll starts, without waiting for momentum end
  const scrollX = useSharedValue(0);
  const interval = CARD_WIDTH + 16;
  
  // Comprehensive reset when component mounts/remounts to prevent glitching
  useEffect(() => {
    scrollX.value = 0;
    setActiveIndex(0);

    // Scroll to position 0 after a brief delay to ensure ScrollView is ready
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  // Reset scroll when data becomes available
  useEffect(() => {
    if (data.length > 0) {
      scrollX.value = 0;
      setActiveIndex(0);

      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
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

  // Derive the index reactively and only set state when it changes
  useAnimatedReaction(
    () => {
      const idx = Math.round(scrollX.value / interval);
      return idx;
    },
    (idx, prevIdx) => {
      if (idx == null || idx === prevIdx) return;
      // Clamp to bounds to avoid out-of-range access
      const clamped = Math.max(0, Math.min(idx, data.length - 1));
      runOnJS(setActiveIndex)(clamped);
    },
    [data.length]
  );

  const contentPadding = useMemo(() => ({ paddingHorizontal: (width - CARD_WIDTH) / 2 }), []);

  const handleNavigateToMetadata = useCallback((id: string, type: any) => {
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  const handleNavigateToStreams = useCallback((id: string, type: any) => {
    navigation.navigate('Streams', { id, type });
  }, [navigation]);

  // Container animation based on scroll - must be before early returns
  const containerAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const progress = Math.abs(translateX) / (data.length * (CARD_WIDTH + 16));
    
    // Very subtle scale animation for the entire container
    const scale = 1 - progress * 0.01;
    const clampedScale = Math.max(0.99, Math.min(1, scale));
    
    return {
      transform: [{ scale: clampedScale }],
    };
  });

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
    const animatedOpacity = useSharedValue(1);
    
    useEffect(() => {
      // Start with opacity 0 and animate to 1, but only if it's a new item
      animatedOpacity.value = 0;
      animatedOpacity.value = withTiming(1, { duration: 400 });
    }, [item.id]);

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: animatedOpacity.value,
    }));

    return (
      <View
        style={[
          styles.backgroundContainer,
          { top: -insets.top },
        ] as StyleProp<ViewStyle>}
        pointerEvents="none"
      >
        <Animated.View
          key={item.id}
          style={[animatedStyle, { flex: 1 }] as any}
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
        </Animated.View>
      </View>
    );
  });

  if (!hasData) return null;

  return (
    <Animated.View entering={FadeIn.duration(350).easing(Easing.out(Easing.cubic))}>
      <Animated.View style={[styles.container as ViewStyle, containerAnimatedStyle]}>
        {settings.enableHomeHeroBackground && data.length > 0 && (
          <View style={{ height: 0, width: 0, overflow: 'hidden' }}>
            {data[activeIndex + 1] && (
              <FastImage
                source={{ 
                  uri: data[activeIndex + 1].banner || data[activeIndex + 1].poster,
                  priority: FastImage.priority.low,
                  cache: FastImage.cacheControl.immutable
                }}
                style={{ width: 1, height: 1 }}
                resizeMode={FastImage.resizeMode.cover}
              />
            )}
            {activeIndex > 0 && data[activeIndex - 1] && (
              <FastImage
                source={{ 
                  uri: data[activeIndex - 1].banner || data[activeIndex - 1].poster,
                  priority: FastImage.priority.low,
                  cache: FastImage.cacheControl.immutable
                }}
                style={{ width: 1, height: 1 }}
                resizeMode={FastImage.resizeMode.cover}
              />
            )}
          </View>
        )}
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
          scrollEventThrottle={8}
          disableIntervalMomentum
          pagingEnabled={false}
          bounces={false}
          overScrollMode="never"
        >
          {data.map((item, index) => (
            <CarouselCard
              key={item.id}
              item={item}
              colors={currentTheme.colors}
              logoFailed={failedLogoIds.has(item.id)}
              onLogoError={() => setFailedLogoIds((prev) => new Set(prev).add(item.id))}
              onPressInfo={() => handleNavigateToMetadata(item.id, item.type)}
              onPressPlay={() => handleNavigateToStreams(item.id, item.type)}
              scrollX={scrollX}
              index={index}
            />
          ))}
        </Animated.ScrollView>
      </Animated.View>
    </Animated.View>
  );
};

interface CarouselCardProps {
  item: StreamingContent;
  colors: any;
  logoFailed: boolean;
  onLogoError: () => void;
  onPressPlay: () => void;
  onPressInfo: () => void;
  scrollX: SharedValue<number>;
  index: number;
}

const CarouselCard: React.FC<CarouselCardProps> = memo(({ item, colors, logoFailed, onLogoError, onPressPlay, onPressInfo, scrollX, index }) => {
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

  const genresAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * (CARD_WIDTH + 16);
    const distance = Math.abs(translateX - cardOffset);
    const maxDistance = (CARD_WIDTH + 16) * 0.5; // Smaller threshold for smoother transition
    
    // Hide genres when scrolling (not centered)
    const progress = Math.min(distance / maxDistance, 1);
    const opacity = 1 - progress; // Linear fade out
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    
    return {
      opacity: clampedOpacity,
    };
  });

  const actionsAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * (CARD_WIDTH + 16);
    const distance = Math.abs(translateX - cardOffset);
    const maxDistance = (CARD_WIDTH + 16) * 0.5; // Smaller threshold for smoother transition
    
    // Hide actions when scrolling (not centered)
    const progress = Math.min(distance / maxDistance, 1);
    const opacity = 1 - progress; // Linear fade out
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    
    return {
      opacity: clampedOpacity,
    };
  });
  
  // Scroll-based animations
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * (CARD_WIDTH + 16);
    const distance = Math.abs(translateX - cardOffset);
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
  
  const bannerParallaxStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * (CARD_WIDTH + 16);
    const distance = translateX - cardOffset;
    
    // Reduced parallax effect to prevent displacement
    const parallaxOffset = distance * 0.05;
    
    return {
      transform: [{ translateX: parallaxOffset }],
    };
  });
  
  const infoParallaxStyle = useAnimatedStyle(() => {
    const translateX = scrollX.value;
    const cardOffset = index * (CARD_WIDTH + 16);
    const distance = Math.abs(translateX - cardOffset);
    const maxDistance = CARD_WIDTH + 16;
    
    // Hide info section when scrolling (not centered)
    const progress = distance / maxDistance;
    const opacity = 1 - progress * 2; // Fade out faster when scrolling
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    
    // Minimal parallax for info section to prevent displacement
    const parallaxOffset = -(translateX - cardOffset) * 0.02;
    
    return {
      transform: [{ translateY: parallaxOffset }],
      opacity: clampedOpacity,
    };
  });
  
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
    <Animated.View
      style={{ width: CARD_WIDTH + 16 }}
      entering={FadeIn.duration(400).delay(index * 100).easing(Easing.out(Easing.cubic))}
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
            <Animated.View style={[bannerAnimatedStyle, bannerParallaxStyle, { flex: 1 }]}>
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
                style={[styles.genres as TextStyle, { color: colors.mediumEmphasis, textAlign: 'center' }, genresAnimatedStyle]}
                numberOfLines={1}
              >
                {item.genres.slice(0, 3).join(' • ')}
              </Animated.Text>
            </Animated.View>
          </View>
        )}
        {/* Static action buttons positioned absolutely over the card */}
        <View style={styles.actionsOverlay as ViewStyle} pointerEvents="box-none">
          <Animated.View entering={FadeIn.duration(500).delay(200)}>
            <Animated.View style={[styles.actions as ViewStyle, actionsAnimatedStyle]}>
            <TouchableOpacity
              style={[styles.playButton as ViewStyle, { backgroundColor: colors.white }]}
              onPress={onPressPlay}
              activeOpacity={0.85}
            >
              <MaterialIcons name="play-arrow" size={22} color={colors.black} />
              <Text style={[styles.playText as TextStyle, { color: colors.black }]}>Play</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton as ViewStyle, { borderColor: 'rgba(255,255,255,0.25)' }]}
              onPress={onPressInfo}
              activeOpacity={0.8}
            >
              <MaterialIcons name="info-outline" size={18} color={colors.white} />
              <Text style={[styles.secondaryText as TextStyle, { color: colors.white }]}>Info</Text>
            </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
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
    </Animated.View>
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
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  playText: {
    fontWeight: '700',
    marginLeft: 6,
    fontSize: 14,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
  },
  secondaryText: {
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 14,
  },
  logoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 80, // Position above genres and actions
  },
  titleOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 90, // Position above genres and actions
  },
  genresOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 65, // Position above actions
  },
  actionsOverlay: {
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


