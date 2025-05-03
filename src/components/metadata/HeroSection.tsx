import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';
import { TMDBService } from '../../services/tmdbService';

const { width, height } = Dimensions.get('window');

// Types
interface HeroSectionProps {
  metadata: any;
  bannerImage: string | null;
  loadingBanner: boolean;
  logoLoadError: boolean;
  scrollY: Animated.SharedValue<number>;
  dampedScrollY: Animated.SharedValue<number>;
  heroHeight: Animated.SharedValue<number>;
  heroOpacity: Animated.SharedValue<number>;
  heroScale: Animated.SharedValue<number>;
  logoOpacity: Animated.SharedValue<number>;
  logoScale: Animated.SharedValue<number>;
  genresOpacity: Animated.SharedValue<number>;
  genresTranslateY: Animated.SharedValue<number>;
  buttonsOpacity: Animated.SharedValue<number>;
  buttonsTranslateY: Animated.SharedValue<number>;
  watchProgressOpacity: Animated.SharedValue<number>;
  watchProgressScaleY: Animated.SharedValue<number>;
  watchProgress: {
    currentTime: number;
    duration: number;
    lastUpdated: number;
    episodeId?: string;
  } | null;
  type: 'movie' | 'series';
  getEpisodeDetails: (episodeId: string) => { seasonNumber: string; episodeNumber: string; episodeName: string } | null;
  handleShowStreams: () => void;
  handleToggleLibrary: () => void;
  inLibrary: boolean;
  id: string;
  navigation: any;
  getPlayButtonText: () => string;
  setBannerImage: (bannerImage: string | null) => void;
  setLogoLoadError: (error: boolean) => void;
}

// Memoized ActionButtons Component
const ActionButtons = React.memo(({ 
  handleShowStreams, 
  toggleLibrary, 
  inLibrary, 
  type, 
  id, 
  navigation, 
  playButtonText,
  animatedStyle
}: {
  handleShowStreams: () => void;
  toggleLibrary: () => void;
  inLibrary: boolean;
  type: 'movie' | 'series';
  id: string;
  navigation: any;
  playButtonText: string;
  animatedStyle: any;
}) => {
  const { currentTheme } = useTheme();
  return (
    <Animated.View style={[styles.actionButtons, animatedStyle]}>
      <TouchableOpacity
        style={[styles.actionButton, styles.playButton]}
        onPress={handleShowStreams}
      >
        <MaterialIcons 
          name={playButtonText === 'Resume' ? "play-circle-outline" : "play-arrow"} 
          size={24} 
          color="#000" 
        />
        <Text style={styles.playButtonText}>
          {playButtonText}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.infoButton]}
        onPress={toggleLibrary}
      >
        <MaterialIcons
          name={inLibrary ? 'bookmark' : 'bookmark-border'}
          size={24}
          color={currentTheme.colors.white}
        />
        <Text style={styles.infoButtonText}>
          {inLibrary ? 'Saved' : 'Save'}
        </Text>
      </TouchableOpacity>

      {type === 'series' && (
        <TouchableOpacity
          style={[styles.iconButton]}
          onPress={async () => {
            let finalTmdbId: number | null = null;
            
            if (id && id.startsWith('tmdb:')) {
              const numericPart = id.split(':')[1];
              const parsedId = parseInt(numericPart, 10);
              if (!isNaN(parsedId)) {
                finalTmdbId = parsedId;
              } else {
                logger.error(`[HeroSection] Failed to parse TMDB ID from: ${id}`);
              }
            } else if (id && id.startsWith('tt')) {
              // It's an IMDb ID, convert it
              logger.log(`[HeroSection] Detected IMDb ID: ${id}, attempting conversion to TMDB ID.`);
              try {
                const tmdbService = TMDBService.getInstance();
                const convertedId = await tmdbService.findTMDBIdByIMDB(id);
                if (convertedId) {
                  finalTmdbId = convertedId;
                  logger.log(`[HeroSection] Successfully converted IMDb ID ${id} to TMDB ID: ${finalTmdbId}`);
                } else {
                  logger.error(`[HeroSection] Could not convert IMDb ID ${id} to TMDB ID.`);
                }
              } catch (error) {
                logger.error(`[HeroSection] Error converting IMDb ID ${id}:`, error);
              }
            } else if (id) {
              // Assume it might be a raw TMDB ID (numeric string)
              const parsedId = parseInt(id, 10);
              if (!isNaN(parsedId)) {
                finalTmdbId = parsedId;
              } else {
                logger.error(`[HeroSection] Unrecognized ID format or invalid numeric ID: ${id}`);
              }
            }
            
            // Navigate if we have a valid TMDB ID
            if (finalTmdbId !== null) {
              navigation.navigate('ShowRatings', { showId: finalTmdbId });
            } else {
              logger.error(`[HeroSection] Could not navigate to ShowRatings, failed to obtain a valid TMDB ID from original id: ${id}`);
              // Optionally show an error message to the user here
            }
          }}
        >
          <MaterialIcons 
            name="assessment" 
            size={24} 
            color={currentTheme.colors.white}
          />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
});

// Memoized WatchProgress Component
const WatchProgressDisplay = React.memo(({ 
  watchProgress, 
  type, 
  getEpisodeDetails, 
  animatedStyle 
}: {
  watchProgress: { currentTime: number; duration: number; lastUpdated: number; episodeId?: string } | null;
  type: 'movie' | 'series';
  getEpisodeDetails: (episodeId: string) => { seasonNumber: string; episodeNumber: string; episodeName: string } | null;
  animatedStyle: any;
}) => {
  const { currentTheme } = useTheme();
  if (!watchProgress || watchProgress.duration === 0) {
    return null;
  }

  const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
  const formattedTime = new Date(watchProgress.lastUpdated).toLocaleDateString();
  let episodeInfo = '';

  if (type === 'series' && watchProgress.episodeId) {
    const details = getEpisodeDetails(watchProgress.episodeId);
    if (details) {
      episodeInfo = ` • S${details.seasonNumber}:E${details.episodeNumber}${details.episodeName ? ` - ${details.episodeName}` : ''}`;
    }
  }

  return (
    <Animated.View style={[styles.watchProgressContainer, animatedStyle]}>
      <View style={styles.watchProgressBar}>
        <View 
          style={[
            styles.watchProgressFill, 
            { 
              width: `${progressPercent}%`,
              backgroundColor: currentTheme.colors.primary 
            }
          ]} 
        />
      </View>
      <Text style={[styles.watchProgressText, { color: currentTheme.colors.textMuted }]}>
        {progressPercent >= 95 ? 'Watched' : `${Math.round(progressPercent)}% watched`}{episodeInfo} • Last watched on {formattedTime}
      </Text>
    </Animated.View>
  );
});

const HeroSection: React.FC<HeroSectionProps> = ({
  metadata,
  bannerImage,
  loadingBanner,
  logoLoadError,
  scrollY,
  dampedScrollY,
  heroHeight,
  heroOpacity,
  heroScale,
  logoOpacity,
  logoScale,
  genresOpacity,
  genresTranslateY,
  buttonsOpacity,
  buttonsTranslateY,
  watchProgressOpacity,
  watchProgressScaleY,
  watchProgress,
  type,
  getEpisodeDetails,
  handleShowStreams,
  handleToggleLibrary,
  inLibrary,
  id,
  navigation,
  getPlayButtonText,
  setBannerImage,
  setLogoLoadError,
}) => {
  const { currentTheme } = useTheme();
  // Animated styles
  const heroAnimatedStyle = useAnimatedStyle(() => ({
    width: '100%',
    height: heroHeight.value,
    backgroundColor: currentTheme.colors.black,
    transform: [{ scale: heroScale.value }],
    opacity: heroOpacity.value,
  }));

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }]
  }));

  const watchProgressAnimatedStyle = useAnimatedStyle(() => ({
    opacity: watchProgressOpacity.value,
    transform: [
      { 
        translateY: interpolate(
          watchProgressScaleY.value,
          [0, 1],
          [-8, 0],
          Extrapolate.CLAMP
        )
      },
      { scaleY: watchProgressScaleY.value }
    ]
  }));

  const genresAnimatedStyle = useAnimatedStyle(() => ({
    opacity: genresOpacity.value,
    transform: [{ translateY: genresTranslateY.value }]
  }));

  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }]
  }));

  const parallaxImageStyle = useAnimatedStyle(() => ({
    width: '100%',
    height: '120%',
    top: '-10%',
    transform: [
      { 
        translateY: interpolate(
          dampedScrollY.value,
          [0, 100, 300],
          [20, -20, -60],
          Extrapolate.CLAMP
        )
      },
      { 
        scale: interpolate(
          dampedScrollY.value,
          [0, 150, 300],
          [1.1, 1.02, 0.95],
          Extrapolate.CLAMP
        )
      }
    ],
  }));

  // Render genres
  const renderGenres = () => {
    if (!metadata?.genres || !Array.isArray(metadata.genres) || metadata.genres.length === 0) {
      return null;
    }

    const genresToDisplay: string[] = metadata.genres as string[];

    return genresToDisplay.slice(0, 4).map((genreName, index, array) => (
      <React.Fragment key={index}>
        <Text style={[styles.genreText, { color: currentTheme.colors.text }]}>
          {genreName}
        </Text>
        {index < array.length - 1 && (
          <Text style={[styles.genreDot, { color: currentTheme.colors.text, opacity: 0.6 }]}>
            •
          </Text>
        )}
      </React.Fragment>
    ));
  };

  return (
    <Animated.View style={heroAnimatedStyle}>
      <View style={styles.heroSection}>
        {loadingBanner ? (
          <View style={[styles.absoluteFill, { backgroundColor: currentTheme.colors.black }]} />
        ) : (
          <Animated.Image 
            source={{ uri: bannerImage || metadata.banner || metadata.poster }}
            style={[styles.absoluteFill, parallaxImageStyle]}
            resizeMode="cover"
            onError={() => {
              logger.warn(`[HeroSection] Banner failed to load: ${bannerImage}`);
              if (bannerImage !== metadata.banner) {
                setBannerImage(metadata.banner || metadata.poster);
              }
            }}
          />
        )}
        <LinearGradient
          colors={[
            `${currentTheme.colors.darkBackground}00`,
            `${currentTheme.colors.darkBackground}20`,
            `${currentTheme.colors.darkBackground}50`,
            `${currentTheme.colors.darkBackground}C0`,
            `${currentTheme.colors.darkBackground}F8`,
            currentTheme.colors.darkBackground
          ]}
          locations={[0, 0.4, 0.65, 0.8, 0.9, 1]}
          style={styles.heroGradient}
        >
          <View style={styles.heroContent}>
            {/* Title/Logo */}
            <View style={styles.logoContainer}>
              <Animated.View style={[styles.titleLogoContainer, logoAnimatedStyle]}>
                {metadata.logo && !logoLoadError ? (
                  <Image
                    source={{ uri: metadata.logo }}
                    style={styles.titleLogo}
                    contentFit="contain"
                    transition={300}
                    onError={() => {
                      logger.warn(`[HeroSection] Logo failed to load: ${metadata.logo}`);
                      setLogoLoadError(true);
                    }}
                  />
                ) : (
                  <Text style={[styles.heroTitle, { color: currentTheme.colors.highEmphasis }]}>{metadata.name}</Text>
                )}
              </Animated.View>
            </View>

            {/* Watch Progress */}
            <WatchProgressDisplay 
              watchProgress={watchProgress}
              type={type}
              getEpisodeDetails={getEpisodeDetails}
              animatedStyle={watchProgressAnimatedStyle}
            />

            {/* Genre Tags */}
            <Animated.View style={genresAnimatedStyle}>
              <View style={styles.genreContainer}>
                {renderGenres()}
              </View>
            </Animated.View>

            {/* Action Buttons */}
            <ActionButtons 
              handleShowStreams={handleShowStreams}
              toggleLibrary={handleToggleLibrary}
              inLibrary={inLibrary}
              type={type}
              id={id}
              navigation={navigation}
              playButtonText={getPlayButtonText()}
              animatedStyle={buttonsAnimatedStyle}
            />
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  heroSection: {
    width: '100%',
    height: height * 0.5,
    backgroundColor: '#000',
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
  },
  genreText: {
    fontSize: 12,
    fontWeight: '500',
  },
  genreDot: {
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: -12,
    justifyContent: 'center',
    width: '100%',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 100,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flex: 1,
  },
  playButton: {
    backgroundColor: '#fff',
  },
  infoButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: '#fff',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  playButtonText: {
    color: '#000',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  infoButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 16,
  },
  watchProgressContainer: {
    marginTop: 6,
    marginBottom: 8,
    width: '100%',
    alignItems: 'center',
    overflow: 'hidden',
    height: 48,
  },
  watchProgressBar: {
    width: '75%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginBottom: 6
  },
  watchProgressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  watchProgressText: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.9,
    letterSpacing: 0.2
  },
});

export default React.memo(HeroSection); 