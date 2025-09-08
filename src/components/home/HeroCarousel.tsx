import React, { useMemo, useState, useEffect, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ViewStyle, TextStyle, ImageStyle, FlatList, StyleProp, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut, Easing, useSharedValue, withTiming, useAnimatedStyle, useAnimatedScrollHandler, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
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

  // Note: do not early-return before hooks. Loading UI is returned later.

  const hasData = data.length > 0;

  // Optimized: update background as soon as scroll starts, without waiting for momentum end
  const scrollX = useSharedValue(0);
  const interval = CARD_WIDTH + 16;
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
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

  const keyExtractor = useCallback((item: StreamingContent) => item.id, []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => {
      const length = CARD_WIDTH + 16;
      const offset = length * index;
      return { length, offset, index };
    },
    []
  );

  const handleNavigateToMetadata = useCallback((id: string, type: any) => {
    navigation.navigate('Metadata', { id, type });
  }, [navigation]);

  const handleNavigateToStreams = useCallback((id: string, type: any) => {
    navigation.navigate('Streams', { id, type });
  }, [navigation]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingVertical: 12 }] as StyleProp<ViewStyle>}>
        <View style={{ height: CARD_HEIGHT }}>
          <FlatList
            data={[1, 2, 3] as any}
            keyExtractor={(i) => String(i)}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 16}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: (width - CARD_WIDTH) / 2 }}
            renderItem={() => (
              <View style={{ width: CARD_WIDTH + 16 }}>
                <View style={[styles.card, { backgroundColor: currentTheme.colors.elevation1 }] as StyleProp<ViewStyle>}>
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
            )}
          />
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
      // Start with opacity 0 and animate to 1
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
          <ExpoImage
            source={{ uri: item.banner || item.poster }}
            style={styles.backgroundImage as ImageStyle}
            contentFit="cover"
            blurRadius={Platform.OS === 'android' ? 8 : 12}
            cachePolicy="memory-disk"
            transition={0}
            priority="low"
          />
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
      <View style={styles.container as ViewStyle}>
        {settings.enableHomeHeroBackground && data.length > 0 && (
          <View style={{ height: 0, width: 0, overflow: 'hidden' }}>
            {data[activeIndex + 1] && (
              <ExpoImage
                source={{ uri: data[activeIndex + 1].banner || data[activeIndex + 1].poster }}
                style={{ width: 1, height: 1 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
            )}
            {activeIndex > 0 && data[activeIndex - 1] && (
              <ExpoImage
                source={{ uri: data[activeIndex - 1].banner || data[activeIndex - 1].poster }}
                style={{ width: 1, height: 1 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
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
        <Animated.FlatList
          data={data}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={contentPadding}
          onScroll={scrollHandler}
          scrollEventThrottle={32}
          disableIntervalMomentum
          initialNumToRender={2}
          windowSize={3}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          getItemLayout={getItemLayout}
          renderItem={({ item }) => (
            <View style={{ width: CARD_WIDTH + 16 }}>
              <CarouselCard
                item={item}
                colors={currentTheme.colors}
                logoFailed={failedLogoIds.has(item.id)}
                onLogoError={() => setFailedLogoIds((prev) => new Set(prev).add(item.id))}
                onPressInfo={() => handleNavigateToMetadata(item.id, item.type)}
                onPressPlay={() => handleNavigateToStreams(item.id, item.type)}
              />
            </View>
          )}
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
  onPressPlay: () => void;
  onPressInfo: () => void;
}

const CarouselCard: React.FC<CarouselCardProps> = memo(({ item, colors, logoFailed, onLogoError, onPressPlay, onPressInfo }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPressInfo}
    >
      <View style={[styles.card, { backgroundColor: colors.elevation1 }] as StyleProp<ViewStyle>}>
        <View style={styles.bannerContainer as ViewStyle}>
          <ExpoImage
            source={{ uri: item.banner || item.poster }}
            style={styles.banner as ImageStyle}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.6)"]}
            locations={[0.4, 0.7, 1]}
            style={styles.bannerGradient as ViewStyle}
          />
        </View>
        <View style={styles.info as ViewStyle}>
          {item.logo && !logoFailed ? (
            <ExpoImage
              source={{ uri: item.logo }}
              style={styles.logo as ImageStyle}
              contentFit="contain"
              transition={0}
              cachePolicy="memory-disk"
              onError={onLogoError}
            />
          ) : (
            <Text style={[styles.title as TextStyle, { color: colors.highEmphasis, textAlign: 'center' }]} numberOfLines={1}>
              {item.name}
            </Text>
          )}
          {item.genres && (
            <Text style={[styles.genres as TextStyle, { color: colors.mediumEmphasis, textAlign: 'center' }]} numberOfLines={1}>
              {item.genres.slice(0, 3).join(' • ')}
            </Text>
          )}
          <View style={styles.actions as ViewStyle}>
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
          </View>
        </View>
      </View>
    </TouchableOpacity>
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
});

export default React.memo(HeroCarousel);


