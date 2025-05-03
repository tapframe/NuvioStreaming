import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../styles/colors';

const { height } = Dimensions.get('window');

export const SkeletonCatalog = () => (
  <View style={styles.catalogContainer}>
    <View style={styles.loadingPlaceholder}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  </View>
);

export const SkeletonFeatured = () => (
  <View style={styles.featuredLoadingContainer}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={styles.loadingText}>Loading featured content...</Text>
  </View>
);

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
    backgroundColor: colors.elevation1,
    borderRadius: 12,
    marginHorizontal: 16,
  },
  featuredLoadingContainer: {
    height: height * 0.4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.elevation1,
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  skeletonBox: {
    backgroundColor: colors.elevation2,
    borderRadius: 16,
    overflow: 'hidden',
  },
  skeletonFeatured: {
    width: '100%',
    height: height * 0.6,
    backgroundColor: colors.elevation2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },
  skeletonPoster: {
    backgroundColor: colors.elevation1,
    marginHorizontal: 4,
    borderRadius: 16,
  },
});

export default {
  SkeletonCatalog,
  SkeletonFeatured
}; 