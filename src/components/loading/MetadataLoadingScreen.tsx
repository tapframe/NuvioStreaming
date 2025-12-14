import React, { useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

// Responsive breakpoints
const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  largeTablet: 1024,
  tv: 1440,
};

interface MetadataLoadingScreenProps {
  type?: 'movie' | 'series';
  onExitComplete?: () => void;
}

export interface MetadataLoadingScreenRef {
  exit: () => void;
}

// Animated shimmer skeleton component
const ShimmerSkeleton = ({
  width: elementWidth,
  height: elementHeight,
  borderRadius = 8,
  marginBottom = 8,
  style = {},
  delay = 0,
  shimmerProgress,
  baseColor,
  highlightColor,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  marginBottom?: number;
  style?: any;
  delay?: number;
  shimmerProgress: Animated.SharedValue<number>;
  baseColor: string;
  highlightColor: string;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      shimmerProgress.value,
      [0, 1],
      [-width, width]
    );
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View style={[
      {
        width: elementWidth,
        height: elementHeight,
        borderRadius,
        marginBottom,
        backgroundColor: baseColor,
        overflow: 'hidden',
      },
      style
    ]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          animatedStyle,
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            highlightColor,
            highlightColor,
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { width: width * 2 }]}
        />
      </Animated.View>
    </View>
  );
};

export const MetadataLoadingScreen = forwardRef<MetadataLoadingScreenRef, MetadataLoadingScreenProps>(({
  type = 'movie',
  onExitComplete
}, ref) => {
  const { currentTheme } = useTheme();

  // Responsive sizing
  const deviceWidth = Dimensions.get('window').width;
  const deviceType = useMemo(() => {
    if (deviceWidth >= BREAKPOINTS.tv) return 'tv';
    if (deviceWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
    if (deviceWidth >= BREAKPOINTS.tablet) return 'tablet';
    return 'phone';
  }, [deviceWidth]);

  const isTV = deviceType === 'tv';
  const isLargeTablet = deviceType === 'largeTablet';
  const isTablet = deviceType === 'tablet';

  const horizontalPadding = isTV ? 48 : isLargeTablet ? 32 : isTablet ? 24 : 16;


  // Shimmer animation
  const shimmerProgress = useSharedValue(0);

  // Staggered fade-in for sections
  const heroOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const castOpacity = useSharedValue(0);

  // Exit animation value
  const exitProgress = useSharedValue(0);

  // Colors for skeleton
  const baseColor = currentTheme.colors.elevation1 || 'rgba(255,255,255,0.08)';
  const highlightColor = 'rgba(255,255,255,0.12)';

  // Exit animation function
  const exit = () => {
    exitProgress.value = withTiming(1, {
      duration: 200,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1.0),
    }, (finished) => {
      'worklet';
      if (finished && onExitComplete) {
        runOnJS(onExitComplete)();
      }
    });
  };

  // Expose exit method through ref
  useImperativeHandle(ref, () => ({
    exit,
  }));

  useEffect(() => {
    // Start shimmer animation
    shimmerProgress.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0)
      }),
      -1, // infinite
      false
    );

    // Staggered entrance animations
    heroOpacity.value = withTiming(1, { duration: 300 });
    contentOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    castOpacity.value = withDelay(200, withTiming(1, { duration: 300 }));

    return () => {
      cancelAnimation(shimmerProgress);
      cancelAnimation(heroOpacity);
      cancelAnimation(contentOpacity);
      cancelAnimation(castOpacity);
    };
  }, []);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(exitProgress.value, [0, 1], [1, 0]),
    transform: [
      { scale: interpolate(exitProgress.value, [0, 1], [1, 0.98]) },
    ],
  }));

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [
      { translateY: interpolate(contentOpacity.value, [0, 1], [10, 0]) },
    ],
  }));

  const castStyle = useAnimatedStyle(() => ({
    opacity: castOpacity.value,
    transform: [
      { translateY: interpolate(castOpacity.value, [0, 1], [10, 0]) },
    ],
  }));

  return (
    <SafeAreaView
      style={[styles.container, {
        backgroundColor: currentTheme.colors.darkBackground,
      }]}
      edges={['bottom']}
    >
      <StatusBar
        translucent={true}
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <Animated.View style={[styles.content, containerStyle]}>
        {/* Hero Section Skeleton */}
        <Animated.View style={[styles.heroSection, { height: height * 0.65 }, heroStyle]}>
          <ShimmerSkeleton
            width="100%"
            height={height * 0.65}
            borderRadius={0}
            marginBottom={0}
            shimmerProgress={shimmerProgress}
            baseColor={baseColor}
            highlightColor={highlightColor}
          />

          {/* Back Button Skeleton */}
          <View style={{
            position: 'absolute',
            top: Platform.OS === 'android' ? 40 : 50,
            left: isTablet ? 32 : 16,
            zIndex: 10
          }}>
            <ShimmerSkeleton
              width={40}
              height={40}
              borderRadius={20}
              marginBottom={0}
              shimmerProgress={shimmerProgress}
              baseColor={baseColor}
              highlightColor={highlightColor}
            />
          </View>

          {/* Gradient overlay */}
          <View style={styles.heroOverlay}>
            <LinearGradient
              colors={[
                'transparent',
                'rgba(0,0,0,0.05)',
                'rgba(0,0,0,0.15)',
                'rgba(0,0,0,0.35)',
                'rgba(0,0,0,0.65)',
                currentTheme.colors.darkBackground,
              ]}
              locations={[0, 0.3, 0.55, 0.75, 0.9, 1]}
              style={StyleSheet.absoluteFill}
            />

            {/* Hero bottom content - Matches HeroSection.tsx structure */}
            <View style={[styles.heroBottomContent, { paddingHorizontal: horizontalPadding }]}>
              {/* Logo placeholder - Centered and larger */}
              <View style={{ alignItems: 'center', width: '100%', marginBottom: 16 }}>
                <ShimmerSkeleton
                  width={isTV ? 400 : isLargeTablet ? 300 : width * 0.65}
                  height={isTV ? 120 : isLargeTablet ? 100 : 90}
                  borderRadius={12}
                  marginBottom={0}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
              </View>

              {/* Watch Progress Placeholder - Centered Glass Bar */}
              <View style={{ alignItems: 'center', width: '100%', marginBottom: 16 }}>
                <ShimmerSkeleton
                  width="75%"
                  height={45} // Matches glass background height + padding
                  borderRadius={12}
                  marginBottom={0}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                  style={{ opacity: 0.5 }} // Slight transparency for glass effect
                />
              </View>

              {/* Genre Info Row - Centered */}
              <View style={[styles.metaRow, { justifyContent: 'center', marginBottom: 20 }]}>
                <ShimmerSkeleton
                  width={isTV ? 60 : 50}
                  height={12}
                  borderRadius={6}
                  marginBottom={0}
                  style={{ marginRight: 8 }}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginRight: 8 }} />
                <ShimmerSkeleton
                  width={isTV ? 80 : 70}
                  height={12}
                  borderRadius={6}
                  marginBottom={0}
                  style={{ marginRight: 8 }}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginRight: 8 }} />
                <ShimmerSkeleton
                  width={isTV ? 50 : 40}
                  height={12}
                  borderRadius={6}
                  marginBottom={0}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
              </View>

              {/* Action buttons row - Play, Save, Collection, Rates */}
              <View style={[styles.buttonsRow, { justifyContent: 'center', gap: 6 }]}>
                {/* Play Button */}
                <ShimmerSkeleton
                  width={isTV ? 180 : isLargeTablet ? 160 : isTablet ? 150 : (width - 32 - 100 - 24) / 2} // Calc based on screen width
                  height={isTV ? 52 : isLargeTablet ? 48 : 46}
                  borderRadius={isTV ? 26 : 23}
                  marginBottom={0}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />

                {/* Save Button */}
                <ShimmerSkeleton
                  width={isTV ? 180 : isLargeTablet ? 160 : isTablet ? 150 : (width - 32 - 100 - 24) / 2}
                  height={isTV ? 52 : isLargeTablet ? 48 : 46}
                  borderRadius={isTV ? 26 : 23}
                  marginBottom={0}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />

                {/* Collection Icon */}
                <ShimmerSkeleton
                  width={isTV ? 52 : isLargeTablet ? 48 : 46}
                  height={isTV ? 52 : isLargeTablet ? 48 : 46}
                  borderRadius={isTV ? 26 : 23}
                  marginBottom={0}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />

                {/* Ratings Icon (if series) - Always show for skeleton consistency */}
                <ShimmerSkeleton
                  width={isTV ? 52 : isLargeTablet ? 48 : 46}
                  height={isTV ? 52 : isLargeTablet ? 48 : 46}
                  borderRadius={isTV ? 26 : 23}
                  marginBottom={0}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Content Section */}
        <Animated.View style={[styles.contentSection, { paddingHorizontal: horizontalPadding }, contentStyle]}>
          {/* Description skeleton */}
          <View style={styles.descriptionSection}>
            <ShimmerSkeleton
              width="100%"
              height={isTV ? 18 : 15}
              borderRadius={4}
              marginBottom={10}
              shimmerProgress={shimmerProgress}
              baseColor={baseColor}
              highlightColor={highlightColor}
            />
            <ShimmerSkeleton
              width="95%"
              height={isTV ? 18 : 15}
              borderRadius={4}
              marginBottom={10}
              shimmerProgress={shimmerProgress}
              baseColor={baseColor}
              highlightColor={highlightColor}
            />
            <ShimmerSkeleton
              width="75%"
              height={isTV ? 18 : 15}
              borderRadius={4}
              marginBottom={0}
              shimmerProgress={shimmerProgress}
              baseColor={baseColor}
              highlightColor={highlightColor}
            />
          </View>
        </Animated.View>

        {/* Cast Section */}
        <Animated.View style={[styles.castSection, { paddingHorizontal: horizontalPadding }, castStyle]}>
          <ShimmerSkeleton
            width={isTV ? 80 : 60}
            height={isTV ? 24 : 20}
            borderRadius={4}
            marginBottom={16}
            shimmerProgress={shimmerProgress}
            baseColor={baseColor}
            highlightColor={highlightColor}
          />
          <View style={styles.castRow}>
            {[1, 2, 3, 4, 5].map((item) => (
              <View key={item} style={styles.castItem}>
                <ShimmerSkeleton
                  width={isTV ? 100 : isLargeTablet ? 90 : isTablet ? 85 : 80}
                  height={isTV ? 100 : isLargeTablet ? 90 : isTablet ? 85 : 80}
                  borderRadius={isTV ? 50 : isLargeTablet ? 45 : isTablet ? 42 : 40}
                  marginBottom={8}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
                <ShimmerSkeleton
                  width={isTV ? 70 : 60}
                  height={isTV ? 14 : 12}
                  borderRadius={4}
                  marginBottom={4}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Episodes/Recommendations Section */}
        {type === 'series' ? (
          <Animated.View style={[styles.episodesSection, { paddingHorizontal: horizontalPadding }, castStyle]}>
            <ShimmerSkeleton
              width={isTV ? 120 : 100}
              height={isTV ? 24 : 20}
              borderRadius={4}
              marginBottom={16}
              shimmerProgress={shimmerProgress}
              baseColor={baseColor}
              highlightColor={highlightColor}
            />
            {/* Season selector */}
            <ShimmerSkeleton
              width={isTV ? 180 : 140}
              height={isTV ? 40 : 36}
              borderRadius={20}
              marginBottom={20}
              shimmerProgress={shimmerProgress}
              baseColor={baseColor}
              highlightColor={highlightColor}
            />
            {/* Episode cards */}
            <View style={styles.episodeList}>
              {[1, 2, 3].map((item) => (
                <View key={item} style={styles.episodeCard}>
                  <ShimmerSkeleton
                    width={isTV ? 200 : isLargeTablet ? 180 : isTablet ? 160 : 140}
                    height={isTV ? 112 : isLargeTablet ? 100 : isTablet ? 90 : 80}
                    borderRadius={8}
                    marginBottom={0}
                    shimmerProgress={shimmerProgress}
                    baseColor={baseColor}
                    highlightColor={highlightColor}
                  />
                  <View style={styles.episodeInfo}>
                    <ShimmerSkeleton
                      width="80%"
                      height={isTV ? 16 : 14}
                      borderRadius={4}
                      marginBottom={6}
                      shimmerProgress={shimmerProgress}
                      baseColor={baseColor}
                      highlightColor={highlightColor}
                    />
                    <ShimmerSkeleton
                      width="60%"
                      height={isTV ? 14 : 12}
                      borderRadius={4}
                      marginBottom={0}
                      shimmerProgress={shimmerProgress}
                      baseColor={baseColor}
                      highlightColor={highlightColor}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.recommendationsSection, { paddingHorizontal: horizontalPadding }, castStyle]}>
            <ShimmerSkeleton
              width={isTV ? 140 : 110}
              height={isTV ? 24 : 20}
              borderRadius={4}
              marginBottom={16}
              shimmerProgress={shimmerProgress}
              baseColor={baseColor}
              highlightColor={highlightColor}
            />
            <View style={styles.posterRow}>
              {[1, 2, 3, 4].map((item) => (
                <ShimmerSkeleton
                  key={item}
                  width={isTV ? 140 : isLargeTablet ? 120 : isTablet ? 110 : 100}
                  height={isTV ? 210 : isLargeTablet ? 180 : isTablet ? 165 : 150}
                  borderRadius={8}
                  marginBottom={0}
                  style={{ marginRight: 12 }}
                  shimmerProgress={shimmerProgress}
                  baseColor={baseColor}
                  highlightColor={highlightColor}
                />
              ))}
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  heroSection: {
    position: 'relative',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  heroBottomContent: {
    paddingBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contentSection: {
    paddingTop: 16,
  },
  descriptionSection: {
    marginBottom: 24,
  },
  castSection: {
    marginBottom: 24,
  },
  castRow: {
    flexDirection: 'row',
  },
  castItem: {
    alignItems: 'center',
    marginRight: 16,
  },
  episodesSection: {
    marginBottom: 24,
  },
  episodeList: {
    gap: 16,
  },
  episodeCard: {
    flexDirection: 'row',
    gap: 12,
  },
  episodeInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  recommendationsSection: {
    marginBottom: 24,
  },
  posterRow: {
    flexDirection: 'row',
  },
});

export default MetadataLoadingScreen; 