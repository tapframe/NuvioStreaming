import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../contexts/ThemeContext';

const { height } = Dimensions.get('window');

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
  return (
    <View style={[styles.featuredLoadingContainer, { backgroundColor: currentTheme.colors.elevation1 }]}>
      <ActivityIndicator size="large" color={currentTheme.colors.primary} />
      <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>Loading featured content...</Text>
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
    height: height * 0.4,
    justifyContent: 'center',
    alignItems: 'center',
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