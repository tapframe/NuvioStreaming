import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

export const SkeletonCatalog = () => {
  const { currentTheme } = useTheme();
  return (
    <View style={styles.catalogContainer}>
      <View style={[styles.loadingPlaceholder, { backgroundColor: currentTheme.colors.elevation1 }]}>
        <ActivityIndicator size="small" color={currentTheme.colors.primary} />
      </View>
    </View>
  );
};

export const SkeletonFeatured = () => {
  const { currentTheme } = useTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <View style={[styles.featuredSkeletonContainer, { backgroundColor: currentTheme.colors.elevation1 }]}>
      {/* Shimmer overlay */}
      <Animated.View style={[styles.shimmerOverlay, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0.08)',
            'rgba(255,255,255,0)'
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Bottom gradient to mimic hero */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.10)',
          'rgba(0,0,0,0.20)',
          'rgba(0,0,0,0.40)',
          'rgba(0,0,0,0.80)',
          currentTheme.colors.darkBackground,
        ]}
        locations={[0, 0.2, 0.5, 0.8, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Placeholder content near bottom like hero */}
      <View style={styles.featuredSkeletonContent}>
        {/* Logo/title bar */}
        <View style={[styles.logoBar, { backgroundColor: currentTheme.colors.elevation2 }]} />

        {/* Genre dots */}
        <View style={styles.genreRow}>
          <View style={[styles.genreDot, { backgroundColor: currentTheme.colors.elevation2 }]} />
          <View style={[styles.genreDot, { backgroundColor: currentTheme.colors.elevation2 }]} />
          <View style={[styles.genreDot, { backgroundColor: currentTheme.colors.elevation2 }]} />
        </View>

        {/* Buttons row */}
        <View style={styles.buttonsRow}>
          <View style={[styles.circleBtn, { backgroundColor: currentTheme.colors.elevation2 }]} />
          <View style={[styles.primaryBtn, { backgroundColor: currentTheme.colors.white }]} />
          <View style={[styles.circleBtn, { backgroundColor: currentTheme.colors.elevation2 }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  catalogContainer: {
    marginBottom: 24,
    paddingTop: 0,
    marginTop: 16,
  },
  loadingPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 16,
  },
  featuredSkeletonContainer: {
    width: '100%',
    height: isTablet ? height * 0.7 : height * 0.55,
    marginTop: 0,
    marginBottom: 12,
    position: 'relative',
    borderRadius: isTablet ? 16 : 12,
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  featuredSkeletonContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: isTablet ? 40 : 20,
    paddingBottom: isTablet ? 50 : 16,
    alignItems: 'center',
  },
  logoBar: {
    width: isTablet ? width * 0.32 : width * 0.8,
    height: isTablet ? 28 : 22,
    borderRadius: 6,
    marginBottom: isTablet ? 20 : 12,
  },
  genreRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: isTablet ? 28 : 12,
  },
  genreDot: {
    width: 50,
    height: 12,
    borderRadius: 6,
    opacity: 0.8,
  },
  buttonsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    minHeight: isTablet ? 70 : 60,
    paddingTop: 8,
    paddingBottom: 8,
  },
  circleBtn: {
    width: isTablet ? 48 : 44,
    height: isTablet ? 48 : 44,
    borderRadius: 100,
    opacity: 0.9,
  },
  primaryBtn: {
    width: isTablet ? 180 : 140,
    height: isTablet ? 48 : 44,
    borderRadius: 30,
    opacity: 0.95,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  skeletonBox: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  skeletonFeatured: {
    width: '100%',
    height: height * 0.6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  skeletonPoster: {
    marginHorizontal: 4,
    borderRadius: 16,
  },
});

export default {
  SkeletonCatalog,
  SkeletonFeatured
}; 