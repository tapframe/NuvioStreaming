import React, { useState, useEffect, useMemo } from 'react';
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
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';
import { TMDBService } from '../../services/tmdbService';

const { width, height } = Dimensions.get('window');

// Ultra-optimized animation constants
const PARALLAX_FACTOR = 0.3;
const SCALE_FACTOR = 1.02;
const FADE_THRESHOLD = 200;

// Types - streamlined
interface HeroSectionProps {
  metadata: any;
  bannerImage: string | null;
  loadingBanner: boolean;
  logoLoadError: boolean;
  scrollY: Animated.SharedValue<number>;
  heroHeight: Animated.SharedValue<number>;
  heroOpacity: Animated.SharedValue<number>;
  logoOpacity: Animated.SharedValue<number>;
  buttonsOpacity: Animated.SharedValue<number>;
  buttonsTranslateY: Animated.SharedValue<number>;
  watchProgressOpacity: Animated.SharedValue<number>;
  watchProgressWidth: Animated.SharedValue<number>;
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

// Ultra-optimized ActionButtons Component - minimal re-renders
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
  
  // Memoized navigation handler
  const handleRatingsPress = useMemo(() => async () => {
    let finalTmdbId: number | null = null;
    
    if (id?.startsWith('tmdb:')) {
      const numericPart = id.split(':')[1];
      const parsedId = parseInt(numericPart, 10);
      if (!isNaN(parsedId)) {
        finalTmdbId = parsedId;
      }
    } else if (id?.startsWith('tt')) {
      try {
        const tmdbService = TMDBService.getInstance();
        const convertedId = await tmdbService.findTMDBIdByIMDB(id);
        if (convertedId) {
          finalTmdbId = convertedId;
        }
      } catch (error) {
        logger.error(`[HeroSection] Error converting IMDb ID ${id}:`, error);
      }
    } else if (id) {
      const parsedId = parseInt(id, 10);
      if (!isNaN(parsedId)) {
        finalTmdbId = parsedId;
      }
    }
    
    if (finalTmdbId !== null) {
      navigation.navigate('ShowRatings', { showId: finalTmdbId });
    }
  }, [id, navigation]);

  return (
    <Animated.View style={[styles.actionButtons, animatedStyle]}>
      <TouchableOpacity
        style={[styles.actionButton, styles.playButton]}
        onPress={handleShowStreams}
        activeOpacity={0.85}
      >
        <MaterialIcons 
          name={playButtonText === 'Resume' ? "play-circle-outline" : "play-arrow"} 
          size={24} 
          color="#000" 
        />
        <Text style={styles.playButtonText}>{playButtonText}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.infoButton]}
        onPress={toggleLibrary}
        activeOpacity={0.85}
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
          style={styles.iconButton}
          onPress={handleRatingsPress}
          activeOpacity={0.85}
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

// Ultra-optimized WatchProgress Component
const WatchProgressDisplay = React.memo(({ 
  watchProgress, 
  type, 
  getEpisodeDetails, 
  animatedStyle,
}: {
  watchProgress: { currentTime: number; duration: number; lastUpdated: number; episodeId?: string } | null;
  type: 'movie' | 'series';
  getEpisodeDetails: (episodeId: string) => { seasonNumber: string; episodeNumber: string; episodeName: string } | null;
  animatedStyle: any;
}) => {
  const { currentTheme } = useTheme();
  
  // Memoized progress calculation
  const progressData = useMemo(() => {
    if (!watchProgress || watchProgress.duration === 0) return null;

    const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
    const formattedTime = new Date(watchProgress.lastUpdated).toLocaleDateString();
    let episodeInfo = '';

    if (type === 'series' && watchProgress.episodeId) {
      const details = getEpisodeDetails(watchProgress.episodeId);
      if (details) {
        episodeInfo = ` • S${details.seasonNumber}:E${details.episodeNumber}${details.episodeName ? ` - ${details.episodeName}` : ''}`;
      }
    }

    return {
      progressPercent,
      formattedTime,
      episodeInfo,
      displayText: progressPercent >= 95 ? 'Watched' : `${Math.round(progressPercent)}% watched`
    };
  }, [watchProgress, type, getEpisodeDetails]);

  if (!progressData) return null;

  return (
    <Animated.View style={[styles.watchProgressContainer, animatedStyle]}>
      <View style={styles.watchProgressBar}>
        <View 
          style={[
            styles.watchProgressFill,
            { 
              width: `${progressData.progressPercent}%`,
              backgroundColor: currentTheme.colors.primary 
            }
          ]} 
        />
      </View>
      <Text style={[styles.watchProgressText, { color: currentTheme.colors.textMuted }]}>
        {progressData.displayText}{progressData.episodeInfo} • Last watched on {progressData.formattedTime}
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
  heroHeight,
  heroOpacity,
  logoOpacity,
  buttonsOpacity,
  buttonsTranslateY,
  watchProgressOpacity,
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
  
  // Minimal state for image handling
  const [imageError, setImageError] = useState(false);
  const imageOpacity = useSharedValue(1);
  
  // Memoized image source
  const imageSource = useMemo(() => 
    bannerImage || metadata.banner || metadata.poster
  , [bannerImage, metadata.banner, metadata.poster]);
  
  // Ultra-fast image handlers
  const handleImageError = () => {
    setImageError(true);
    imageOpacity.value = withTiming(0.6, { duration: 150 });
    runOnJS(() => {
      if (bannerImage !== metadata.banner) {
        setBannerImage(metadata.banner || metadata.poster);
      }
    })();
  };

  const handleImageLoad = () => {
    setImageError(false);
    imageOpacity.value = withTiming(1, { duration: 150 });
  };

  // Ultra-optimized animated styles - single calculations
  const heroAnimatedStyle = useAnimatedStyle(() => ({
    height: heroHeight.value,
    opacity: heroOpacity.value,
  }), []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ 
      translateY: interpolate(
        scrollY.value,
        [0, 100],
        [0, -20],
        Extrapolate.CLAMP
      )
    }]
  }), []);

  const watchProgressAnimatedStyle = useAnimatedStyle(() => ({
    opacity: watchProgressOpacity.value,
  }), []);

  // Ultra-optimized backdrop with minimal calculations
  const backdropImageStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY = scrollY.value * PARALLAX_FACTOR;
    const scale = 1 + (scrollY.value * 0.0001); // Micro scale effect
    
    return {
      opacity: imageOpacity.value,
      transform: [
        { translateY: -Math.min(translateY, 100) }, // Cap translation
        { scale: Math.min(scale, SCALE_FACTOR) }    // Cap scale
      ],
    };
  }, []);

  // Simplified buttons animation
  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ 
      translateY: interpolate(
        buttonsTranslateY.value,
        [0, 20],
        [0, 20],
        Extrapolate.CLAMP
      )
    }]
  }), []);

  // Ultra-optimized genre rendering
  const genreElements = useMemo(() => {
    if (!metadata?.genres?.length) return null;

    const genresToDisplay = metadata.genres.slice(0, 3); // Reduced to 3 for performance
    return genresToDisplay.map((genreName: string, index: number, array: string[]) => (
      <React.Fragment key={`${genreName}-${index}`}>
        <Text style={[styles.genreText, { color: currentTheme.colors.text }]}>
          {genreName}
        </Text>
        {index < array.length - 1 && (
          <Text style={[styles.genreDot, { color: currentTheme.colors.text }]}>•</Text>
        )}
      </React.Fragment>
    ));
  }, [metadata.genres, currentTheme.colors.text]);

  // Memoized play button text
  const playButtonText = useMemo(() => getPlayButtonText(), [getPlayButtonText]);

  return (
    <Animated.View style={[styles.heroSection, heroAnimatedStyle]}>
      {/* Optimized Background */}
      <View style={[styles.absoluteFill, { backgroundColor: currentTheme.colors.black }]} />
      
      {/* Ultra-optimized Background Image */}
      {imageSource && !loadingBanner && (
        <Animated.Image 
          source={{ uri: imageSource }}
          style={[styles.absoluteFill, backdropImageStyle]}
          resizeMode="cover"
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      )}

      {/* Simplified Gradient */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.4)',
          'rgba(0,0,0,0.8)',
          currentTheme.colors.darkBackground
        ]}
        locations={[0, 0.6, 0.85, 1]}
        style={styles.heroGradient}
      >
        <View style={styles.heroContent}>
          {/* Optimized Title/Logo */}
          <View style={styles.logoContainer}>
            <Animated.View style={[styles.titleLogoContainer, logoAnimatedStyle]}>
              {metadata.logo && !logoLoadError ? (
                <Image
                  source={{ uri: metadata.logo }}
                  style={styles.titleLogo}
                  contentFit="contain"
                  transition={150}
                  onError={() => {
                    runOnJS(setLogoLoadError)(true);
                  }}
                />
              ) : (
                <Text style={[styles.heroTitle, { color: currentTheme.colors.highEmphasis }]}>
                  {metadata.name}
                </Text>
              )}
            </Animated.View>
          </View>

          {/* Optimized Watch Progress */}
          <WatchProgressDisplay 
            watchProgress={watchProgress}
            type={type}
            getEpisodeDetails={getEpisodeDetails}
            animatedStyle={watchProgressAnimatedStyle}
          />

          {/* Optimized Genres */}
          {genreElements && (
            <View style={styles.genreContainer}>
              {genreElements}
            </View>
          )}

          {/* Optimized Action Buttons */}
          <ActionButtons 
            handleShowStreams={handleShowStreams}
            toggleLibrary={handleToggleLibrary}
            inLibrary={inLibrary}
            type={type}
            id={id}
            navigation={navigation}
            playButtonText={playButtonText}
            animatedStyle={buttonsAnimatedStyle}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

// Ultra-optimized styles
const styles = StyleSheet.create({
  heroSection: {
    width: '100%',
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
    paddingBottom: 20,
  },
  heroContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 4,
  },
  titleLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  titleLogo: {
    width: width * 0.75,
    height: 90,
    alignSelf: 'center',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
    gap: 6,
  },
  genreText: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.9,
  },
  genreDot: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 26,
    flex: 1,
  },
  playButton: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  infoButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: '#000',
    fontWeight: '700',
    marginLeft: 6,
    fontSize: 15,
  },
  infoButtonText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 15,
  },
  watchProgressContainer: {
    marginTop: 4,
    marginBottom: 6,
    width: '100%',
    alignItems: 'center',
    height: 44,
  },
  watchProgressBar: {
    width: '70%',
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1.25,
    overflow: 'hidden',
    marginBottom: 6
  },
  watchProgressFill: {
    height: '100%',
    borderRadius: 1.25,
  },
  watchProgressText: {
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.85,
    letterSpacing: 0.1
  },
});

export default React.memo(HeroSection); 