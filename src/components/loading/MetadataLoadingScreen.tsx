import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

interface MetadataLoadingScreenProps {
  type?: 'movie' | 'series';
}

export const MetadataLoadingScreen: React.FC<MetadataLoadingScreenProps> = ({ 
  type = 'movie' 
}) => {
  const { currentTheme } = useTheme();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start entrance animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Continuous pulse animation for skeleton elements
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );

    // Shimmer effect for skeleton elements
    const shimmerAnimation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );

    pulseAnimation.start();
    shimmerAnimation.start();

    return () => {
      pulseAnimation.stop();
      shimmerAnimation.stop();
    };
  }, []);

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  const SkeletonElement = ({ 
    width: elementWidth, 
    height: elementHeight, 
    borderRadius = 8,
    marginBottom = 8,
    style = {},
  }: {
    width: number | string;
    height: number;
    borderRadius?: number;
    marginBottom?: number;
    style?: any;
  }) => (
    <View style={[
      {
        width: elementWidth,
        height: elementHeight,
        borderRadius,
        marginBottom,
        backgroundColor: currentTheme.colors.card,
        overflow: 'hidden',
      },
      style
    ]}>
      <Animated.View style={[
        StyleSheet.absoluteFill,
        {
          opacity: pulseAnim,
          backgroundColor: currentTheme.colors.primary + '20',
        }
      ]} />
      <Animated.View style={[
        StyleSheet.absoluteFill,
        {
          transform: [{ translateX: shimmerTranslateX }],
        }
      ]}>
        <LinearGradient
          colors={[
            'transparent',
            currentTheme.colors.white + '20',
            'transparent'
          ]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </Animated.View>
    </View>
  );

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
      
      <Animated.View style={[
        styles.content,
        { opacity: fadeAnim }
      ]}>
        {/* Hero Skeleton */}
        <View style={styles.heroSection}>
          <SkeletonElement 
            width="100%" 
            height={height * 0.6} 
            borderRadius={0}
            marginBottom={0}
          />
          
          {/* Overlay content on hero */}
          <View style={styles.heroOverlay}>
            <LinearGradient
              colors={[
                'transparent',
                'rgba(0,0,0,0.4)',
                'rgba(0,0,0,0.8)',
                currentTheme.colors.darkBackground,
              ]}
              style={StyleSheet.absoluteFill}
            />

            {/* Bottom hero content skeleton */}
            <View style={styles.heroBottomContent}>
              <SkeletonElement width="60%" height={32} borderRadius={16} />
              <SkeletonElement width="40%" height={20} borderRadius={10} />
              <View style={styles.genresRow}>
                <SkeletonElement width={80} height={24} borderRadius={12} marginBottom={0} style={{ marginRight: 8 }} />
                <SkeletonElement width={90} height={24} borderRadius={12} marginBottom={0} style={{ marginRight: 8 }} />
                <SkeletonElement width={70} height={24} borderRadius={12} marginBottom={0} />
              </View>
              <View style={styles.buttonsRow}>
                <SkeletonElement width={120} height={44} borderRadius={22} marginBottom={0} style={{ marginRight: 12 }} />
                <SkeletonElement width={100} height={44} borderRadius={22} marginBottom={0} />
              </View>
            </View>
          </View>
        </View>

        {/* Content Section Skeletons */}
        <View style={styles.contentSection}>
          {/* Synopsis skeleton */}
          <View style={styles.synopsisSection}>
            <SkeletonElement width="30%" height={24} borderRadius={12} />
            <SkeletonElement width="100%" height={16} borderRadius={8} />
            <SkeletonElement width="95%" height={16} borderRadius={8} />
            <SkeletonElement width="80%" height={16} borderRadius={8} />
          </View>

          {/* Cast section skeleton */}
          <View style={styles.castSection}>
            <SkeletonElement width="20%" height={24} borderRadius={12} />
            <View style={styles.castRow}>
              {[1, 2, 3, 4].map((item) => (
                <View key={item} style={styles.castItem}>
                  <SkeletonElement width={80} height={80} borderRadius={40} marginBottom={8} />
                  <SkeletonElement width={60} height={12} borderRadius={6} marginBottom={4} />
                  <SkeletonElement width={70} height={10} borderRadius={5} marginBottom={0} />
                </View>
              ))}
            </View>
          </View>

          {/* Episodes/Details skeleton based on type */}
          {type === 'series' ? (
            <View style={styles.episodesSection}>
              <SkeletonElement width="25%" height={24} borderRadius={12} />
              <SkeletonElement width={150} height={36} borderRadius={18} />
              {[1, 2, 3].map((item) => (
                <View key={item} style={styles.episodeItem}>
                  <SkeletonElement width={120} height={68} borderRadius={8} marginBottom={0} style={{ marginRight: 12 }} />
                  <View style={styles.episodeInfo}>
                    <SkeletonElement width="80%" height={16} borderRadius={8} />
                    <SkeletonElement width="60%" height={14} borderRadius={7} />
                    <SkeletonElement width="90%" height={12} borderRadius={6} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.detailsSection}>
              <SkeletonElement width="25%" height={24} borderRadius={12} />
              <View style={styles.detailsGrid}>
                <SkeletonElement width="48%" height={60} borderRadius={8} />
                <SkeletonElement width="48%" height={60} borderRadius={8} />
              </View>
            </View>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  heroSection: {
    height: height * 0.6,
    position: 'relative',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  heroBottomContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  genresRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  buttonsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  contentSection: {
    padding: 20,
  },
  synopsisSection: {
    marginBottom: 32,
  },
  castSection: {
    marginBottom: 32,
  },
  castRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  castItem: {
    alignItems: 'center',
    marginRight: 16,
  },
  episodesSection: {
    marginBottom: 32,
  },
  episodeItem: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'center',
  },
  episodeInfo: {
    flex: 1,
  },
  detailsSection: {
    marginBottom: 32,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
});

export default MetadataLoadingScreen; 