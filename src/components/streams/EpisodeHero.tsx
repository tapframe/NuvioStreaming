import React from 'react';
import { StyleSheet, View, Text, ImageBackground } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors } from '../../styles/colors';
import { tmdbService } from '../../services/tmdbService';

const TMDB_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tmdb.new.logo.svg/512px-Tmdb.new.logo.svg.png?20200406190906';

interface EpisodeHeroProps {
  currentEpisode: {
    name: string;
    overview?: string;
    still_path?: string;
    air_date?: string | null;
    vote_average?: number;
    runtime?: number;
    episodeString: string;
    season_number?: number;
    episode_number?: number;
  } | null;
  metadata: {
    poster?: string;
  } | null;
  animatedStyle: any;
}

const EpisodeHero = ({ currentEpisode, metadata, animatedStyle }: EpisodeHeroProps) => {
  if (!currentEpisode) return null;

  const episodeImage = currentEpisode.still_path 
    ? tmdbService.getImageUrl(currentEpisode.still_path, 'original')
    : metadata?.poster || null;

  // Format air date safely
  const formattedAirDate = currentEpisode.air_date !== undefined 
    ? tmdbService.formatAirDate(currentEpisode.air_date) 
    : 'Unknown';

  return (
    <Animated.View style={[styles.streamsHeroContainer, animatedStyle]}>
      <Animated.View
        entering={FadeIn.duration(600).springify()}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View 
          entering={FadeIn.duration(800).delay(100).springify().withInitialValues({
            transform: [{ scale: 1.05 }]
          })}
          style={StyleSheet.absoluteFill}
        >
          <ImageBackground
            source={episodeImage ? { uri: episodeImage } : undefined}
            style={styles.streamsHeroBackground}
            fadeDuration={0}
            resizeMode="cover"
          >
            <LinearGradient
              colors={[
                'rgba(0,0,0,0)',
                'rgba(0,0,0,0.4)',
                'rgba(0,0,0,0.7)',
                'rgba(0,0,0,0.85)',
                'rgba(0,0,0,0.95)',
                colors.darkBackground
              ]}
              locations={[0, 0.3, 0.5, 0.7, 0.85, 1]}
              style={styles.streamsHeroGradient}
            >
              <View style={styles.streamsHeroContent}>
                <View style={styles.streamsHeroInfo}>
                  <Text style={styles.streamsHeroEpisodeNumber}>
                    {currentEpisode.episodeString}
                  </Text>
                  <Text style={styles.streamsHeroTitle} numberOfLines={1}>
                    {currentEpisode.name}
                  </Text>
                  {currentEpisode.overview && (
                    <Text style={styles.streamsHeroOverview} numberOfLines={2}>
                      {currentEpisode.overview}
                    </Text>
                  )}
                  <View style={styles.streamsHeroMeta}>
                    <Text style={styles.streamsHeroReleased}>
                      {formattedAirDate}
                    </Text>
                    {currentEpisode.vote_average && currentEpisode.vote_average > 0 && (
                      <View style={styles.streamsHeroRating}>
                        <Image
                          source={{ uri: TMDB_LOGO }}
                          style={styles.tmdbLogo}
                          contentFit="contain"
                        />
                        <Text style={styles.streamsHeroRatingText}>
                          {currentEpisode.vote_average.toFixed(1)}
                        </Text>
                      </View>
                    )}
                    {currentEpisode.runtime && (
                      <View style={styles.streamsHeroRuntime}>
                        <MaterialIcons name="schedule" size={16} color={colors.mediumEmphasis} />
                        <Text style={styles.streamsHeroRuntimeText}>
                          {currentEpisode.runtime >= 60
                            ? `${Math.floor(currentEpisode.runtime / 60)}h ${currentEpisode.runtime % 60}m`
                            : `${currentEpisode.runtime}m`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </LinearGradient>
          </ImageBackground>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  streamsHeroContainer: {
    width: '100%',
    height: 300,
    marginBottom: 0,
    position: 'relative',
    backgroundColor: colors.black,
    pointerEvents: 'box-none',
  },
  streamsHeroBackground: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.black,
  },
  streamsHeroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 0,
  },
  streamsHeroContent: {
    width: '100%',
  },
  streamsHeroInfo: {
    width: '100%',
  },
  streamsHeroEpisodeNumber: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  streamsHeroTitle: {
    color: colors.highEmphasis,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  streamsHeroOverview: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  streamsHeroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 0,
  },
  streamsHeroReleased: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  streamsHeroRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 0,
  },
  tmdbLogo: {
    width: 20,
    height: 14,
  },
  streamsHeroRatingText: {
    color: '#01b4e4',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  streamsHeroRuntime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  streamsHeroRuntimeText: {
    color: colors.mediumEmphasis,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default React.memo(EpisodeHero); 