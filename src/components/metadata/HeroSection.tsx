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
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';
import { TMDBService } from '../../services/tmdbService';

const { width, height } = Dimensions.get('window');

// Types - optimized
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

// Ultra-optimized ActionButtons Component with minimal re-renders
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
  
  // Memoized navigation handler for better performance
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
          logger.log(`[HeroSection] Converted IMDb ID ${id} to TMDB ID: ${finalTmdbId}`);
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
        activeOpacity={0.8}
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
        activeOpacity={0.8}
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
          activeOpacity={0.8}
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
  
  // Optimized state management
  const [imageError, setImageError] = useState(false);
  const imageOpacity = useSharedValue(1);
  
  // Memoized image source for better performance
  const imageSource = useMemo(() => 
    bannerImage || metadata.banner || metadata.poster
  , [bannerImage, metadata.banner, metadata.poster]);
  
  // Optimized image handlers
  const handleImageError = () => {
    logger.warn(`[HeroSection] Banner failed to load: ${imageSource}`);
    setImageError(true);
    imageOpacity.value = withTiming(0.7, { duration: 150 });
    if (bannerImage !== metadata.banner) {
      setBannerImage(metadata.banner || metadata.poster);
    }
  };

  const handleImageLoad = () => {
    setImageError(false);
    imageOpacity.value = withTiming(1, { duration: 200 });
  };

  // Ultra-optimized animated styles with minimal calculations
  const heroAnimatedStyle = useAnimatedStyle(() => ({
    height: heroHeight.value,
    opacity: heroOpacity.value,
  }), []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }), []);

  const watchProgressAnimatedStyle = useAnimatedStyle(() => ({
    opacity: watchProgressOpacity.value,
  }), []);

  // Simplified backdrop animation - fewer calculations
  const backdropImageStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
    transform: [
      { 
        translateY: interpolate(
          scrollY.value,
          [0, 200],
          [0, -60],
          Extrapolate.CLAMP
        )
      },
      { 
        scale: interpolate(
          scrollY.value,
          [0, 200],
          [1.05, 1.02],
          Extrapolate.CLAMP
        )
      },
    ],
  }), []);

  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }]
  }), []);

  // Memoized genre rendering for performance
  const genreElements = useMemo(() => {
    if (!metadata?.genres || !Array.isArray(metadata.genres) || metadata.genres.length === 0) {
      return null;
    }

    const genresToDisplay: string[] = metadata.genres.slice(0, 4);
    return genresToDisplay.map((genreName: string, index: number, array: string[]) => (
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
  }, [metadata.genres, currentTheme.colors.text]);

  // Memoized play button text
  const playButtonText = useMemo(() => getPlayButtonText(), [getPlayButtonText]);

  return (
    <Animated.View style={[styles.heroSection, heroAnimatedStyle]}>
      {/* Background Layer */}
      <View style={[styles.absoluteFill, { backgroundColor: currentTheme.colors.black }]} />
      
      {/* Background Image - Optimized */}
      {!loadingBanner && imageSource && (
        <Animated.Image 
          source={{ uri: imageSource }}
          style={[styles.absoluteFill, backdropImageStyle]}
          resizeMode="cover"
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      )}

      {/* Gradient Overlay */}
      <LinearGradient
        colors={[
          `${currentTheme.colors.darkBackground}00`,
          `${currentTheme.colors.darkBackground}30`,
          `${currentTheme.colors.darkBackground}70`,
          `${currentTheme.colors.darkBackground}E0`,
          currentTheme.colors.darkBackground
        ]}
        locations={[0, 0.5, 0.7, 0.85, 1]}
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
                  transition={200}
                  onError={() => {
                    logger.warn(`[HeroSection] Logo failed to load: ${metadata.logo}`);
                    setLogoLoadError(true);
                  }}
                />
              ) : (
                <Text style={[styles.heroTitle, { color: currentTheme.colors.highEmphasis }]}>
                  {metadata.name}
                </Text>
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

          {/* Genres */}
          {genreElements && (
            <View style={styles.genreContainer}>
              {genreElements}
            </View>
          )}

          {/* Action Buttons */}
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

// Optimized styles with minimal properties
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
    textAlign: 'center',
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
    justifyContent: 'center',
    width: '100%',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 28,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
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