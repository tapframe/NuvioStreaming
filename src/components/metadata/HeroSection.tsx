import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { BlurView as CommunityBlurView } from '@react-native-community/blur';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  useSharedValue,
  withTiming,
  runOnJS,
  withRepeat,
  FadeIn,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { useTraktContext } from '../../contexts/TraktContext';
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
    traktSynced?: boolean;
    traktProgress?: number;
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
  animatedStyle,
  isWatched,
  watchProgress
}: {
  handleShowStreams: () => void;
  toggleLibrary: () => void;
  inLibrary: boolean;
  type: 'movie' | 'series';
  id: string;
  navigation: any;
  playButtonText: string;
  animatedStyle: any;
  isWatched: boolean;
  watchProgress: any;
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

  // Determine play button style and text based on watched status
  const playButtonStyle = useMemo(() => {
    if (isWatched && type === 'movie') {
      // Only movies get the dark watched style for "Watch Again"
      return [styles.actionButton, styles.playButton, styles.watchedPlayButton];
    }
    // All other buttons (Resume, Play SxxEyy, regular Play) get white background
    return [styles.actionButton, styles.playButton];
  }, [isWatched, type]);

  const playButtonTextStyle = useMemo(() => {
    if (isWatched && type === 'movie') {
      // Only movies get white text for "Watch Again"
      return [styles.playButtonText, styles.watchedPlayButtonText];
    }
    // All other buttons get black text
    return styles.playButtonText;
  }, [isWatched, type]);

  const finalPlayButtonText = useMemo(() => {
    if (!isWatched) {
      return playButtonText;
    }

    // If content is a movie, keep existing "Watch Again" label
    if (type === 'movie') {
      return 'Watch Again';
    }

    // For series, attempt to show the next episode label (e.g., "Play S02E05")
    if (type === 'series' && watchProgress?.episodeId) {
      let seasonNum: number | null = null;
      let episodeNum: number | null = null;

      const parts = watchProgress.episodeId.split(':');

      if (parts.length === 3) {
        // Format: showId:season:episode
        seasonNum = parseInt(parts[1], 10);
        episodeNum = parseInt(parts[2], 10);
      } else if (parts.length === 2) {
        // Format: season:episode (no show id)
        seasonNum = parseInt(parts[0], 10);
        episodeNum = parseInt(parts[1], 10);
      } else {
        // Try pattern s1e2
        const match = watchProgress.episodeId.match(/s(\d+)e(\d+)/i);
        if (match) {
          seasonNum = parseInt(match[1], 10);
          episodeNum = parseInt(match[2], 10);
        }
      }

      if (seasonNum !== null && episodeNum !== null && !isNaN(seasonNum) && !isNaN(episodeNum)) {
        // For watched episodes, show the NEXT episode number
        const nextEpisode = episodeNum + 1;
        const seasonStr = seasonNum.toString().padStart(2, '0');
        const episodeStr = nextEpisode.toString().padStart(2, '0');
        return `Play S${seasonStr}E${episodeStr}`;
      }

      // Fallback label if parsing fails
      return 'Play Next Episode';
    }

    // Default fallback
    return 'Play';
  }, [isWatched, playButtonText, type, watchProgress]);

  return (
    <Animated.View style={[styles.actionButtons, animatedStyle]}>
      <TouchableOpacity
        style={playButtonStyle}
        onPress={handleShowStreams}
        activeOpacity={0.85}
      >
        <MaterialIcons 
          name={(() => {
            if (isWatched) {
              return type === 'movie' ? 'replay' : 'play-arrow';
            }
            return playButtonText === 'Resume' ? 'play-circle-outline' : 'play-arrow';
          })()} 
          size={24} 
          color={isWatched && type === 'movie' ? "#fff" : "#000"} 
        />
        <Text style={playButtonTextStyle}>{finalPlayButtonText}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.infoButton]}
        onPress={toggleLibrary}
        activeOpacity={0.85}
      >
        {Platform.OS === 'ios' ? (
          <ExpoBlurView intensity={80} style={styles.blurBackground} tint="dark" />
        ) : (
          <View style={styles.androidFallbackBlur} />
        )}
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
          {Platform.OS === 'ios' ? (
            <ExpoBlurView intensity={80} style={styles.blurBackgroundRound} tint="dark" />
          ) : (
            <View style={styles.androidFallbackBlurRound} />
          )}
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

// Enhanced WatchProgress Component with Trakt integration and watched status
const WatchProgressDisplay = React.memo(({ 
  watchProgress, 
  type, 
  getEpisodeDetails, 
  animatedStyle,
  isWatched
}: {
  watchProgress: { 
    currentTime: number; 
    duration: number; 
    lastUpdated: number; 
    episodeId?: string;
    traktSynced?: boolean;
    traktProgress?: number;
  } | null;
  type: 'movie' | 'series';
  getEpisodeDetails: (episodeId: string) => { seasonNumber: string; episodeNumber: string; episodeName: string } | null;
  animatedStyle: any;
  isWatched: boolean;
}) => {
  const { currentTheme } = useTheme();
  const { isAuthenticated: isTraktAuthenticated, forceSyncTraktProgress } = useTraktContext();
  
  // State to trigger refresh after manual sync
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Animated values for enhanced effects
  const completionGlow = useSharedValue(0);
  const celebrationScale = useSharedValue(1);
  const progressPulse = useSharedValue(1);
  const progressBoxOpacity = useSharedValue(0);
  const progressBoxScale = useSharedValue(0.8);
  const progressBoxTranslateY = useSharedValue(20);
  const syncRotation = useSharedValue(0);
  
  // Animate the sync icon when syncing
  useEffect(() => {
    if (isSyncing) {
      syncRotation.value = withRepeat(
        withTiming(360, { duration: 1000 }),
        -1, // Infinite repeats
        false // No reverse
      );
    } else {
      syncRotation.value = 0;
    }
  }, [isSyncing, syncRotation]);
  
  // Handle manual Trakt sync
  const handleTraktSync = useMemo(() => async () => {
    if (isTraktAuthenticated && forceSyncTraktProgress) {
      logger.log('[HeroSection] Manual Trakt sync requested');
      setIsSyncing(true);
      try {
        const success = await forceSyncTraktProgress();
        logger.log(`[HeroSection] Manual Trakt sync ${success ? 'successful' : 'failed'}`);
        
        // Force component to re-render after a short delay to update sync status
        if (success) {
          setTimeout(() => {
            setRefreshTrigger(prev => prev + 1);
            setIsSyncing(false);
          }, 500);
        } else {
          setIsSyncing(false);
        }
      } catch (error) {
        logger.error('[HeroSection] Manual Trakt sync error:', error);
        setIsSyncing(false);
      }
    }
  }, [isTraktAuthenticated, forceSyncTraktProgress, setRefreshTrigger]);

  // Sync rotation animation style
  const syncIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${syncRotation.value}deg` }],
  }));
  
  // Memoized progress calculation with Trakt integration
  const progressData = useMemo(() => {
    // If content is fully watched, show watched status instead of progress
    if (isWatched) {
      let episodeInfo = '';
      if (type === 'series' && watchProgress?.episodeId) {
        const details = getEpisodeDetails(watchProgress.episodeId);
        if (details) {
          episodeInfo = ` • S${details.seasonNumber}:E${details.episodeNumber}${details.episodeName ? ` - ${details.episodeName}` : ''}`;
        }
      }
      
      const watchedDate = watchProgress?.lastUpdated 
        ? new Date(watchProgress.lastUpdated).toLocaleDateString()
        : new Date().toLocaleDateString();
      
      // Determine if watched via Trakt or local
      const watchedViaTrakt = isTraktAuthenticated && 
        watchProgress?.traktProgress !== undefined && 
        watchProgress.traktProgress >= 95;
      
      return {
        progressPercent: 100,
        formattedTime: watchedDate,
        episodeInfo,
        displayText: watchedViaTrakt ? 'Watched on Trakt' : 'Watched',
        syncStatus: isTraktAuthenticated && watchProgress?.traktSynced ? '' : '', // Clean look for watched
        isTraktSynced: watchProgress?.traktSynced && isTraktAuthenticated,
        isWatched: true
      };
    }

    if (!watchProgress || watchProgress.duration === 0) return null;

    // Determine which progress to show - prioritize Trakt if available and authenticated
    let progressPercent;
    let isUsingTraktProgress = false;
    
    if (isTraktAuthenticated && watchProgress.traktProgress !== undefined) {
      progressPercent = watchProgress.traktProgress;
      isUsingTraktProgress = true;
    } else {
      progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
    }
    const formattedTime = new Date(watchProgress.lastUpdated).toLocaleDateString();
    let episodeInfo = '';

    if (type === 'series' && watchProgress.episodeId) {
      const details = getEpisodeDetails(watchProgress.episodeId);
      if (details) {
        episodeInfo = ` • S${details.seasonNumber}:E${details.episodeNumber}${details.episodeName ? ` - ${details.episodeName}` : ''}`;
      }
    }

    // Enhanced display text with Trakt integration
    let displayText = progressPercent >= 85 ? 'Watched' : `${Math.round(progressPercent)}% watched`;
    let syncStatus = '';
    
    // Show Trakt sync status if user is authenticated
    if (isTraktAuthenticated) {
      if (isUsingTraktProgress) {
        syncStatus = ' • Using Trakt progress';
        if (watchProgress.traktSynced) {
          syncStatus = ' • Synced with Trakt';
        }
      } else if (watchProgress.traktSynced) {
        syncStatus = ' • Synced with Trakt';
        // If we have specific Trakt progress that differs from local, mention it
        if (watchProgress.traktProgress !== undefined && 
            Math.abs(progressPercent - watchProgress.traktProgress) > 5) {
          displayText = `${Math.round(progressPercent)}% watched (${Math.round(watchProgress.traktProgress)}% on Trakt)`;
        }
      } else {
        // Do not show "Sync pending" label anymore; leave status empty.
        syncStatus = '';
      }
    }

    return {
      progressPercent,
      formattedTime,
      episodeInfo,
      displayText,
      syncStatus,
      isTraktSynced: watchProgress.traktSynced && isTraktAuthenticated,
      isWatched: false
    };
  }, [watchProgress, type, getEpisodeDetails, isTraktAuthenticated, isWatched, refreshTrigger]);

  // Trigger appearance and completion animations
  useEffect(() => {
    if (progressData) {
      // Smooth entrance animation for the glassmorphic box
      progressBoxOpacity.value = withTiming(1, { duration: 400 });
      progressBoxScale.value = withTiming(1, { duration: 400 });
      progressBoxTranslateY.value = withTiming(0, { duration: 400 });
      
      if (progressData.isWatched || (progressData.progressPercent && progressData.progressPercent >= 85)) {
        // Celebration animation sequence
        celebrationScale.value = withRepeat(
          withTiming(1.05, { duration: 200 }),
          2,
          true
        );
        
        // Glow effect
        completionGlow.value = withRepeat(
          withTiming(1, { duration: 1500 }),
          -1,
          true
        );
      } else {
        // Subtle progress pulse for ongoing content
        progressPulse.value = withRepeat(
          withTiming(1.02, { duration: 2000 }),
          -1,
          true
        );
      }
    } else {
      // Hide animation when no progress data
      progressBoxOpacity.value = withTiming(0, { duration: 300 });
      progressBoxScale.value = withTiming(0.8, { duration: 300 });
      progressBoxTranslateY.value = withTiming(20, { duration: 300 });
    }
  }, [progressData]);

  // Animated styles for enhanced effects
  const celebrationAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(completionGlow.value, [0, 1], [0.3, 0.8], Extrapolate.CLAMP),
  }));

  const progressPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: progressPulse.value }],
  }));

  const progressBoxAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progressBoxOpacity.value,
    transform: [
      { scale: progressBoxScale.value },
      { translateY: progressBoxTranslateY.value }
    ],
  }));

  if (!progressData) return null;

  const isCompleted = progressData.isWatched || progressData.progressPercent >= 85;

  return (
    <Animated.View style={[styles.watchProgressContainer, animatedStyle]}>
      {/* Glass morphism background with entrance animation */}
      <Animated.View style={[styles.progressGlassBackground, progressBoxAnimatedStyle]}>
        {Platform.OS === 'ios' ? (
          <ExpoBlurView intensity={20} style={styles.blurBackground} tint="dark" />
        ) : (
          <View style={styles.androidProgressBlur} />
        )}
        
        {/* Enhanced progress bar with glow effects */}
        <Animated.View style={[styles.watchProgressBarContainer, celebrationAnimatedStyle]}>
      <View style={styles.watchProgressBar}>
            {/* Background glow for completed content */}
            {isCompleted && (
              <Animated.View style={[styles.completionGlow, glowAnimatedStyle]} />
            )}
            
            <Animated.View 
          style={[
            styles.watchProgressFill,
                !isCompleted && progressPulseStyle,
            { 
              width: `${progressData.progressPercent}%`,
                  backgroundColor: isCompleted
                    ? '#00ff88' // Bright green for completed
                : progressData.isTraktSynced 
                  ? '#E50914' // Netflix red for Trakt synced content
                      : currentTheme.colors.primary,
                  // Add gradient effect for completed content
                  ...(isCompleted && {
                    background: 'linear-gradient(90deg, #00ff88, #00cc6a)',
                  })
            }
          ]} 
        />
            
            {/* Shimmer effect for active progress */}
            {!isCompleted && progressData.progressPercent > 0 && (
              <View style={styles.progressShimmer} />
            )}
          </View>
        </Animated.View>

        {/* Enhanced text container with better typography */}
        <View style={styles.watchProgressTextContainer}>
          <View style={styles.progressInfoMain}>
            <Text style={[styles.watchProgressMainText, { 
              color: isCompleted ? '#00ff88' : currentTheme.colors.white,
              fontSize: isCompleted ? 13 : 12,
              fontWeight: isCompleted ? '700' : '600'
            }]}>
              {progressData.displayText}
            </Text>
            
      </View>
          
          <Text style={[styles.watchProgressSubText, { 
            color: isCompleted ? 'rgba(0,255,136,0.7)' : currentTheme.colors.textMuted,
          }]}>
            {progressData.episodeInfo} • Last watched {progressData.formattedTime}
          </Text>
          
          {/* Trakt sync status with enhanced styling */}
          {progressData.syncStatus && (
            <View style={styles.syncStatusContainer}>
              <MaterialIcons 
                name={progressData.isTraktSynced ? "sync" : "sync-problem"} 
                size={12} 
                color={progressData.isTraktSynced ? "#E50914" : "rgba(255,255,255,0.6)"} 
              />
              <Text style={[styles.syncStatusText, {
                color: progressData.isTraktSynced ? "#E50914" : "rgba(255,255,255,0.6)"
              }]}>
          {progressData.syncStatus}
        </Text>
        
              {/* Enhanced manual Trakt sync button - moved inline */}
        {isTraktAuthenticated && forceSyncTraktProgress && (
          <TouchableOpacity 
                  style={styles.traktSyncButtonInline}
            onPress={handleTraktSync}
            activeOpacity={0.7}
            disabled={isSyncing}
                >
                  <LinearGradient
                    colors={['#E50914', '#B8070F']}
                    style={styles.syncButtonGradientInline}
          >
            <Animated.View style={syncIconStyle}>
              <MaterialIcons 
                name={isSyncing ? "sync" : "refresh"} 
                      size={12} 
                      color="#fff" 
              />
            </Animated.View>
                  </LinearGradient>
          </TouchableOpacity>
              )}
            </View>
        )}
      </View>
      </Animated.View>
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
  const { isAuthenticated: isTraktAuthenticated } = useTraktContext();
  
  // Enhanced state for smooth image loading
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageOpacity = useSharedValue(1);
  const imageLoadOpacity = useSharedValue(0);
  const shimmerOpacity = useSharedValue(0.3);
  
  // Memoized image source
  const imageSource = useMemo(() => 
    bannerImage || metadata.banner || metadata.poster
  , [bannerImage, metadata.banner, metadata.poster]);
  
  // Start shimmer animation for loading state
  useEffect(() => {
    if (!imageLoaded && imageSource) {
      // Start shimmer animation
      shimmerOpacity.value = withRepeat(
        withTiming(0.8, { duration: 1200 }),
        -1,
        true
      );
    } else {
      // Stop shimmer when loaded
      shimmerOpacity.value = withTiming(0.3, { duration: 300 });
    }
  }, [imageLoaded, imageSource]);
  
  // Reset loading state when image source changes
  useEffect(() => {
    if (imageSource) {
      setImageLoaded(false);
      imageLoadOpacity.value = 0;
    }
  }, [imageSource]);
  
  // Enhanced image handlers with smooth transitions
  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
    imageOpacity.value = withTiming(0.6, { duration: 150 });
    imageLoadOpacity.value = withTiming(0, { duration: 150 });
    runOnJS(() => {
      if (bannerImage !== metadata.banner) {
        setBannerImage(metadata.banner || metadata.poster);
      }
    })();
  };

  const handleImageLoad = () => {
    setImageError(false);
    setImageLoaded(true);
    imageOpacity.value = withTiming(1, { duration: 150 });
    // Smooth fade-in for the loaded image
    imageLoadOpacity.value = withTiming(1, { duration: 400 });
  };

  // Ultra-optimized animated styles - single calculations
  const heroAnimatedStyle = useAnimatedStyle(() => ({
    height: heroHeight.value,
    opacity: heroOpacity.value,
  }), []);

  const logoAnimatedStyle = useAnimatedStyle(() => {
    // Determine if progress bar should be shown
    const hasProgress = watchProgress && watchProgress.duration > 0;
    
    // Scale down logo when progress bar is present
    const logoScale = hasProgress ? 0.85 : 1;
    
    return {
    opacity: logoOpacity.value,
      transform: [
        { 
      translateY: interpolate(
        scrollY.value,
        [0, 100],
        [0, -20],
        Extrapolate.CLAMP
      )
        },
        { scale: withTiming(logoScale, { duration: 300 }) }
      ]
    };
  }, [watchProgress]);

  const watchProgressAnimatedStyle = useAnimatedStyle(() => ({
    opacity: watchProgressOpacity.value,
  }), []);

  // Enhanced backdrop with smooth loading animation
  const backdropImageStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY = scrollY.value * PARALLAX_FACTOR;
    const scale = 1 + (scrollY.value * 0.0001); // Micro scale effect
    
    return {
      opacity: imageOpacity.value * imageLoadOpacity.value,
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

  // Ultra-optimized genre rendering with smooth animation
  const genreElements = useMemo(() => {
    if (!metadata?.genres?.length) return null;

    const genresToDisplay = metadata.genres.slice(0, 3); // Reduced to 3 for performance
    return genresToDisplay.map((genreName: string, index: number, array: string[]) => (
      <Animated.View
        key={`${genreName}-${index}`}
        entering={FadeIn.duration(400).delay(200 + index * 100)}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <Text style={[styles.genreText, { color: currentTheme.colors.text }]}>
          {genreName}
        </Text>
        {index < array.length - 1 && (
          <Text style={[styles.genreDot, { color: currentTheme.colors.text }]}>•</Text>
        )}
      </Animated.View>
    ));
  }, [metadata.genres, currentTheme.colors.text]);

  // Memoized play button text
  const playButtonText = useMemo(() => getPlayButtonText(), [getPlayButtonText]);

  // Calculate if content is watched (>=85% progress) - check both local and Trakt progress
  const isWatched = useMemo(() => {
    if (!watchProgress) return false;
    
    // Check Trakt progress first if available and user is authenticated
    if (isTraktAuthenticated && watchProgress.traktProgress !== undefined) {
      const traktWatched = watchProgress.traktProgress >= 95;
      logger.log(`[HeroSection] Trakt authenticated: ${isTraktAuthenticated}, Trakt progress: ${watchProgress.traktProgress}%, Watched: ${traktWatched}`);
      return traktWatched;
    }
    
    // Fall back to local progress
    if (watchProgress.duration === 0) return false;
    const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
    const localWatched = progressPercent >= 85;
    logger.log(`[HeroSection] Local progress: ${progressPercent.toFixed(1)}%, Watched: ${localWatched}`);
    return localWatched;
  }, [watchProgress, isTraktAuthenticated]);

  return (
    <Animated.View style={[styles.heroSection, heroAnimatedStyle]}>
      {/* Optimized Background */}
      <View style={[styles.absoluteFill, { backgroundColor: currentTheme.colors.black }]} />
      
      {/* Loading placeholder for smooth transition */}
      {((imageSource && !imageLoaded) || loadingBanner) && (
        <Animated.View style={[styles.absoluteFill, {
          opacity: shimmerOpacity,
        }]}>
          <LinearGradient
            colors={['#111', '#222', '#111']}
            style={styles.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
      )}
      
      {/* Enhanced Background Image with smooth loading */}
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

          {/* Enhanced Watch Progress with Trakt integration */}
          <WatchProgressDisplay 
            watchProgress={watchProgress}
            type={type}
            getEpisodeDetails={getEpisodeDetails}
            animatedStyle={watchProgressAnimatedStyle}
            isWatched={isWatched}
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
            isWatched={isWatched}
            watchProgress={watchProgress}
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
    position: 'relative',
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
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    marginBottom: 4,
    width: '100%',
    alignItems: 'center',
    minHeight: 36,
    position: 'relative',
  },
  progressGlassBackground: {
    width: '75%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  androidProgressBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  watchProgressBarContainer: {
    position: 'relative',
    marginBottom: 6,
  },
  watchProgressBar: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 1.5,
    overflow: 'hidden',
    position: 'relative',
  },
  watchProgressFill: {
    height: '100%',
    borderRadius: 1.25,
  },
  traktSyncIndicator: {
    position: 'absolute',
    right: 2,
    top: -2,
    bottom: -2,
    width: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traktSyncIndicatorEnhanced: {
    position: 'absolute',
    right: 4,
    top: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  watchedProgressIndicator: {
    position: 'absolute',
    right: 2,
    top: -1,
    bottom: -1,
    width: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchProgressTextContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  watchProgressText: {
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.85,
    letterSpacing: 0.1,
    flex: 1,
  },
  traktSyncButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  blurBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  androidFallbackBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  blurBackgroundRound: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 25,
  },
  androidFallbackBlurRound: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
          watchedIndicator: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 8,
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    watchedPlayButton: {
      backgroundColor: '#1e1e1e',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 4,
    },
    watchedPlayButtonText: {
      color: '#fff',
      fontWeight: '700',
      marginLeft: 6,
      fontSize: 15,
    },
    // Enhanced progress indicator styles
    progressShimmer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    completionGlow: {
      position: 'absolute',
      top: -2,
      left: -2,
      right: -2,
      bottom: -2,
      borderRadius: 4,
      backgroundColor: 'rgba(0,255,136,0.2)',
    },
    completionIndicator: {
      position: 'absolute',
      right: 4,
      top: -6,
      bottom: -6,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    completionGradient: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sparkleContainer: {
      position: 'absolute',
      top: -10,
      left: 0,
      right: 0,
      bottom: -10,
      borderRadius: 2,
    },
    sparkle: {
      position: 'absolute',
      width: 8,
      height: 8,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressInfoMain: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    watchProgressMainText: {
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
    },
    watchProgressSubText: {
      fontSize: 9,
      textAlign: 'center',
      opacity: 0.8,
      marginBottom: 1,
    },
    syncStatusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      width: '100%',
      flexWrap: 'wrap',
    },
    syncStatusText: {
      fontSize: 9,
      marginLeft: 4,
      fontWeight: '500',
    },
    traktSyncButtonEnhanced: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      overflow: 'hidden',
    },
    traktSyncButtonInline: {
      marginLeft: 8,
      width: 20,
      height: 20,
      borderRadius: 10,
      overflow: 'hidden',
    },
    syncButtonGradient: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    syncButtonGradientInline: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    traktIndicatorGradient: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
});

export default React.memo(HeroSection); 