import React, { memo } from 'react';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';
import FastImage, { resizeMode as FIResizeMode } from '../../../utils/FastImageCompat';

import AnimatedText from '../../../components/AnimatedText';

const { width } = Dimensions.get('window');

interface MovieHeroProps {
  metadata: {
    name: string;
    logo?: string;
  };
  movieLogoError: boolean;
  setMovieLogoError: (error: boolean) => void;
  colors: any;
  enableStreamsBackdrop: boolean;
}

const MovieHero = memo(
  ({ metadata, movieLogoError, setMovieLogoError, colors, enableStreamsBackdrop }: MovieHeroProps) => {
    const styles = React.useMemo(() => createStyles(colors), [colors]);

    return (
      <View
        style={[styles.container, !enableStreamsBackdrop && { backgroundColor: colors.darkBackground }]}
      >
        <View style={styles.content}>
          {metadata.logo && !movieLogoError ? (
            <FastImage
              source={{ uri: metadata.logo }}
              style={styles.logo}
              resizeMode={FIResizeMode.contain}
              onError={() => setMovieLogoError(true)}
            />
          ) : (
            <AnimatedText style={styles.title} numberOfLines={2}>
              {metadata.name}
            </AnimatedText>
          )}
        </View>
      </View>
    );
  }
);

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      width: '100%',
      height: 140,
      backgroundColor: 'transparent',
      pointerEvents: 'box-none',
      justifyContent: 'center',
      paddingTop: Platform.OS === 'android' ? 65 : 35,
    },
    content: {
      width: '100%',
      height: 80,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: {
      width: '100%',
      height: 80,
      maxWidth: width * 0.85,
    },
    title: {
      color: colors.highEmphasis,
      fontSize: 28,
      fontWeight: '900',
      textAlign: 'center',
      letterSpacing: -0.5,
      paddingHorizontal: 20,
    },
  });

MovieHero.displayName = 'MovieHero';

export default MovieHero;
