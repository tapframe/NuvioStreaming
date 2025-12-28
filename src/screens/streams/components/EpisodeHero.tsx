import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FastImage, { resizeMode as FIResizeMode } from '../../../utils/FastImageCompat';
import { MaterialIcons } from '@expo/vector-icons';

import AnimatedImage from '../../../components/AnimatedImage';
import AnimatedText from '../../../components/AnimatedText';
import AnimatedView from '../../../components/AnimatedView';
import { tmdbService } from '../../../services/tmdbService';
import { TMDB_LOGO, IMDb_LOGO } from '../constants';

interface EpisodeHeroProps {
  episodeImage: string | null;
  currentEpisode: {
    episodeString: string;
    name: string;
    overview?: string;
    air_date?: string;
    season_number: number;
    episode_number: number;
  };
  effectiveEpisodeVote: number;
  effectiveEpisodeRuntime?: number;
  hasIMDbRating: boolean;
  gradientColors: [string, string, string, string, string];
  colors: any;
  enableStreamsBackdrop: boolean;
}

const EpisodeHero = memo(
  ({
    episodeImage,
    currentEpisode,
    effectiveEpisodeVote,
    effectiveEpisodeRuntime,
    hasIMDbRating,
    gradientColors,
    colors,
    enableStreamsBackdrop,
  }: EpisodeHeroProps) => {
    const styles = React.useMemo(() => createStyles(colors), [colors]);

    return (
      <View
        style={[styles.container, !enableStreamsBackdrop && { backgroundColor: colors.darkBackground }]}
      >
        <View style={StyleSheet.absoluteFill}>
          <View style={StyleSheet.absoluteFill}>
            <AnimatedImage
              source={episodeImage ? { uri: episodeImage } : undefined}
              style={styles.background}
              contentFit="cover"
            />
            <LinearGradient
              colors={gradientColors}
              locations={[0, 0.4, 0.6, 0.8, 1]}
              style={styles.gradient}
            >
              <View style={styles.content}>
                <View style={styles.info}>
                  <AnimatedText style={styles.episodeNumber} delay={50}>
                    {currentEpisode.episodeString}
                  </AnimatedText>
                  <AnimatedText style={styles.title} numberOfLines={1} delay={100}>
                    {currentEpisode.name}
                  </AnimatedText>
                  {!!currentEpisode.overview && (
                    <AnimatedView delay={150}>
                      <Text style={styles.overview} numberOfLines={2}>
                        {currentEpisode.overview}
                      </Text>
                    </AnimatedView>
                  )}
                  <AnimatedView style={styles.meta} delay={200}>
                    <Text style={styles.released}>
                      {tmdbService.formatAirDate(currentEpisode.air_date || null)}
                    </Text>
                    {effectiveEpisodeVote > 0 && (
                      <View style={styles.rating}>
                        {hasIMDbRating ? (
                          <>
                            <FastImage
                              source={{ uri: IMDb_LOGO }}
                              style={styles.imdbLogo}
                              resizeMode={FIResizeMode.contain}
                            />
                            <Text style={[styles.ratingText, { color: '#F5C518' }]}>
                              {effectiveEpisodeVote.toFixed(1)}
                            </Text>
                          </>
                        ) : (
                          <>
                            <FastImage
                              source={{ uri: TMDB_LOGO }}
                              style={styles.tmdbLogo}
                              resizeMode={FIResizeMode.contain}
                            />
                            <Text style={styles.ratingText}>{effectiveEpisodeVote.toFixed(1)}</Text>
                          </>
                        )}
                      </View>
                    )}
                    {!!effectiveEpisodeRuntime && (
                      <View style={styles.runtime}>
                        <MaterialIcons name="schedule" size={16} color={colors.mediumEmphasis} />
                        <Text style={styles.runtimeText}>
                          {effectiveEpisodeRuntime >= 60
                            ? `${Math.floor(effectiveEpisodeRuntime / 60)}h ${effectiveEpisodeRuntime % 60}m`
                            : `${effectiveEpisodeRuntime}m`}
                        </Text>
                      </View>
                    )}
                  </AnimatedView>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>
      </View>
    );
  }
);

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      width: '100%',
      height: 220,
      marginBottom: 0,
      position: 'relative',
      backgroundColor: 'transparent',
      pointerEvents: 'box-none',
      zIndex: 1,
    },
    background: {
      width: '100%',
      height: '100%',
      backgroundColor: 'transparent',
    },
    gradient: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      padding: 16,
      paddingBottom: 0,
    },
    content: {
      width: '100%',
    },
    info: {
      width: '100%',
    },
    episodeNumber: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: 'bold',
      marginBottom: 2,
      textShadowColor: 'rgba(0,0,0,0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    title: {
      color: colors.highEmphasis,
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 4,
      textShadowColor: 'rgba(0,0,0,0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    overview: {
      color: colors.mediumEmphasis,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 2,
      textShadowColor: 'rgba(0,0,0,0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 0,
    },
    released: {
      color: colors.mediumEmphasis,
      fontSize: 14,
      textShadowColor: 'rgba(0,0,0,0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    rating: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 0,
    },
    tmdbLogo: {
      width: 20,
      height: 14,
    },
    imdbLogo: {
      width: 28,
      height: 15,
    },
    ratingText: {
      color: colors.highEmphasis,
      fontSize: 13,
      fontWeight: '700',
      marginLeft: 4,
    },
    runtime: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    runtimeText: {
      color: colors.mediumEmphasis,
      fontSize: 13,
      fontWeight: '600',
    },
  });

EpisodeHero.displayName = 'EpisodeHero';

export default EpisodeHero;
