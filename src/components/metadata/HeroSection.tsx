import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, { 
  useAnimatedStyle, 
  interpolate,
  Extrapolate
} from 'react-native-reanimated';
import { colors } from '../../styles/colors';

interface HeroSectionProps {
  banner?: string;
  poster?: string;
  heroHeight: Animated.SharedValue<number>;
  heroScale: Animated.SharedValue<number>;
  heroOpacity: Animated.SharedValue<number>;
  dampedScrollY: Animated.SharedValue<number>;
  children: React.ReactNode;
}

const HeroSection = React.memo(({ 
  banner, 
  poster,
  heroHeight, 
  heroScale, 
  heroOpacity,
  dampedScrollY,
  children 
}: HeroSectionProps) => {
  // Hero container animated style
  const heroAnimatedStyle = useAnimatedStyle(() => ({
    width: '100%',
    height: heroHeight.value,
    backgroundColor: colors.black,
    transform: [{ scale: heroScale.value }],
    opacity: heroOpacity.value,
  }));

  // Parallax effect for the background image
  const parallaxImageStyle = useAnimatedStyle(() => {
    return {
      width: '100%',
      height: '120%', // Increase height for more movement range
      top: '-10%', // Start image slightly higher to allow more upward movement
      transform: [
        { 
          translateY: interpolate(
            dampedScrollY.value,
            [0, 100, 300],
            [20, -20, -60],  // Start with a lower position, then move up
            Extrapolate.CLAMP
          )
        },
        { 
          scale: interpolate(
            dampedScrollY.value,
            [0, 150, 300],
            [1.1, 1.02, 0.95],  // More dramatic scale changes
            Extrapolate.CLAMP
          )
        }
      ],
    };
  });

  const imageSource = banner || poster || '';

  return (
    <Animated.View style={heroAnimatedStyle}>
      <View style={styles.heroSection}>
        {/* Use Animated.Image for parallax effect */}
        <Animated.Image 
          source={{ uri: imageSource }}
          style={[styles.absoluteFill, parallaxImageStyle]}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            `${colors.darkBackground}00`,
            `${colors.darkBackground}20`,
            `${colors.darkBackground}50`,
            `${colors.darkBackground}C0`,
            `${colors.darkBackground}F8`,
            colors.darkBackground
          ]}
          locations={[0, 0.4, 0.65, 0.8, 0.9, 1]}
          style={styles.heroGradient}
        >
          <View style={styles.heroContent}>
            {children}
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  heroSection: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.black,
    overflow: 'hidden',
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  heroContent: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
});

export default HeroSection; 