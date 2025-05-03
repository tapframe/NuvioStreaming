import React from 'react';
import { StyleSheet, Text, View, ImageBackground, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { colors } from '../../styles/colors';

const { width } = Dimensions.get('window');

interface MovieHeroProps {
  metadata: {
    name: string;
    logo?: string;
    banner?: string;
    poster?: string;
  } | null;
  animatedStyle: any;
}

const MovieHero = ({ metadata, animatedStyle }: MovieHeroProps) => {
  if (!metadata) return null;

  return (
    <Animated.View style={[styles.movieTitleContainer, animatedStyle]}>
      <ImageBackground
        source={{ uri: metadata.banner || metadata.poster }}
        style={styles.movieTitleBackground}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.4)',
            'rgba(0,0,0,0.6)',
            'rgba(0,0,0,0.8)',
            colors.darkBackground
          ]}
          locations={[0, 0.3, 0.7, 1]}
          style={styles.movieTitleGradient}
        >
          <View style={styles.movieTitleContent}>
            {metadata.logo ? (
              <Image
                source={{ uri: metadata.logo }}
                style={styles.movieLogo}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.movieTitle} numberOfLines={2}>
                {metadata.name}
              </Text>
            )}
          </View>
        </LinearGradient>
      </ImageBackground>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  movieTitleContainer: {
    width: '100%',
    height: 180,
    backgroundColor: colors.black,
    pointerEvents: 'box-none',
  },
  movieTitleBackground: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.black,
  },
  movieTitleGradient: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  movieTitleContent: {
    width: '100%',
    alignItems: 'center',
    marginTop: Platform.OS === 'android' ? 35 : 45,
  },
  movieLogo: {
    width: width * 0.6,
    height: 70,
    marginBottom: 8,
  },
  movieTitle: {
    color: colors.highEmphasis,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
  },
});

export default React.memo(MovieHero); 