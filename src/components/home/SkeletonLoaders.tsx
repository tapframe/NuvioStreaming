import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../contexts/ThemeContext';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

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
  const shimmerValue = useSharedValue(0);
  
  useEffect(() => {
    shimmerValue.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, // Infinite repeat
      true // Reverse
    );
  }, []);
  
  const shimmerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shimmerValue.value * width * 1.5 - width }]
    };
  });

  return (
    <View style={[styles.featuredLoadingContainer, { backgroundColor: currentTheme.colors.elevation2 }]}>
      {/* Card skeleton with shimmer effect */}
      <View style={[styles.skeletonCard, { backgroundColor: currentTheme.colors.elevation3 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.0)',
              'rgba(255,255,255,0.1)',
              'rgba(255,255,255,0.2)',
              'rgba(255,255,255,0.1)',
              'rgba(255,255,255,0.0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        
        {/* Title placeholder */}
        <View style={[styles.skeletonTitle, { backgroundColor: currentTheme.colors.elevation1 }]} />
        
        {/* Genres placeholder */}
        <View style={styles.skeletonGenresContainer}>
          <View style={[styles.skeletonGenre, { backgroundColor: currentTheme.colors.elevation1 }]} />
          <View style={[styles.skeletonGenre, { backgroundColor: currentTheme.colors.elevation1, width: 60 }]} />
          <View style={[styles.skeletonGenre, { backgroundColor: currentTheme.colors.elevation1, width: 40 }]} />
        </View>
      </View>
      
      <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>
        Loading featured content...
      </Text>
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
  featuredLoadingContainer: {
    height: height * 0.6, // Match FeaturedContent height
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
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
  skeletonCard: {
    width: width * 0.7, // Match card width from FeaturedContent
    height: height * 0.45, // Slightly shorter than actual cards
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
  },
  skeletonTitle: {
    height: 28,
    borderRadius: 4,
    marginBottom: 16,
    width: '80%',
    alignSelf: 'center',
  },
  skeletonGenresContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  skeletonGenre: {
    height: 14,
    width: 50,
    borderRadius: 4,
  },
});

export default {
  SkeletonCatalog,
  SkeletonFeatured
}; 