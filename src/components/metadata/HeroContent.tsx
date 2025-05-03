import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { colors } from '../../styles/colors';
import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

interface HeroContentProps {
  logo?: string;
  title: string;
  logoAnimatedStyle: any;
  genresAnimatedStyle: any;
  genres: React.ReactNode;
  children: React.ReactNode;
}

const HeroContent = React.memo(({ 
  logo, 
  title,
  logoAnimatedStyle,
  genresAnimatedStyle,
  genres,
  children 
}: HeroContentProps) => {
  return (
    <>
      {/* Title/Logo */}
      <View style={styles.logoContainer}>
        <Animated.View style={[styles.titleLogoContainer, logoAnimatedStyle]}>
          {logo ? (
            <Image
              source={{ uri: logo }}
              style={styles.titleLogo}
              contentFit="contain"
              transition={300}
            />
          ) : (
            <Text style={styles.heroTitle}>{title}</Text>
          )}
        </Animated.View>
      </View>

      {/* First child is typically the WatchProgress component */}
      {children}

      {/* Genre Tags */}
      <Animated.View style={genresAnimatedStyle}>
        <View style={styles.genreContainer}>
          {genres}
        </View>
      </Animated.View>
    </>
  );
});

const styles = StyleSheet.create({
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  titleLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  titleLogo: {
    width: width * 0.8,
    height: 100,
    marginBottom: 0,
    alignSelf: 'center',
  },
  heroTitle: {
    color: colors.highEmphasis,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    gap: 4,
  }
});

export default HeroContent; 