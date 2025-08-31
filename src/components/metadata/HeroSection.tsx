import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  InteractionManager,
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
  runOnUI,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { useTraktContext } from '../../contexts/TraktContext';
import { useSettings } from '../../hooks/useSettings';
import { logger } from '../../utils/logger';
import { TMDBService } from '../../services/tmdbService';
import TrailerService from '../../services/trailerService';
import TrailerPlayer from '../video/TrailerPlayer';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

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
  groupedEpisodes?: { [seasonNumber: number]: any[] };
  dynamicBackgroundColor?: string;
  handleBack: () => void;
}

// Ultra-optimized ActionButtons Component - minimal re-renders
const ActionButtons = memo(({ 
  handleShowStreams, 
  toggleLibrary, 
  inLibrary, 
  type, 
  id, 
  navigation, 
  playButtonText,
  animatedStyle,
  isWatched,
  watchProgress,
  groupedEpisodes
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
  groupedEpisodes?: { [seasonNumber: number]: any[] };
}) => {
  const { currentTheme } = useTheme();
  
  // Performance optimization: Cache theme colors
  const themeColors = useMemo(() => ({
    white: currentTheme.colors.white,
    black: '#000',
    primary: currentTheme.colors.primary
  }), [currentTheme.colors.white, currentTheme.colors.primary]);
  
  // Optimized navigation handler with useCallback
  const handleRatingsPress = useCallback(async () => {
    // Early return if no ID
    if (!id) return;
    
    let finalTmdbId: number | null = null;
    
    if (id.startsWith('tmdb:')) {
      const numericPart = id.split(':')[1];
      const parsedId = parseInt(numericPart, 10);
      if (!isNaN(parsedId)) {
        finalTmdbId = parsedId;
      }
    } else if (id.startsWith('tt')) {
      try {
        const tmdbService = TMDBService.getInstance();
        const convertedId = await tmdbService.findTMDBIdByIMDB(id);
        if (convertedId) {
          finalTmdbId = convertedId;
        }
      } catch (error) {
        logger.error(`[HeroSection] Error converting IMDb ID ${id}:`, error);
      }
    } else {
      const parsedId = parseInt(id, 10);
      if (!isNaN(parsedId)) {
        finalTmdbId = parsedId;
      }
    }
    
    if (finalTmdbId !== null) {
      // Use requestAnimationFrame for smoother navigation
      requestAnimationFrame(() => {
        navigation.navigate('ShowRatings', { showId: finalTmdbId });
      });
    }
  }, [id, navigation]);

  // Optimized play button style calculation
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
    // For movies, handle watched state
    if (type === 'movie') {
      return isWatched ? 'Watch Again' : playButtonText;
    }

    // For series, validate next episode existence for both watched and resume cases
    if (type === 'series' && watchProgress?.episodeId && groupedEpisodes) {
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
        if (isWatched) {
          // For watched episodes, check if next episode exists
          const nextEpisode = episodeNum + 1;
          const currentSeasonEpisodes = groupedEpisodes[seasonNum] || [];
          const nextEpisodeExists = currentSeasonEpisodes.some(ep => 
            ep.episode_number === nextEpisode
          );
          
          if (nextEpisodeExists) {
            // Show the NEXT episode number only if it exists
            const seasonStr = seasonNum.toString().padStart(2, '0');
            const episodeStr = nextEpisode.toString().padStart(2, '0');
            return `Play S${seasonStr}E${episodeStr}`;
          } else {
            // If next episode doesn't exist, show generic text
            return 'Completed';
          }
        } else {
          // For non-watched episodes, check if current episode exists
          const currentSeasonEpisodes = groupedEpisodes[seasonNum] || [];
          const currentEpisodeExists = currentSeasonEpisodes.some(ep => 
            ep.episode_number === episodeNum
          );
          
          if (currentEpisodeExists) {
            // Current episode exists, use original button text
            return playButtonText;
          } else {
            // Current episode doesn't exist, fallback to generic play
            return 'Play';
          }
        }
      }

      // Fallback label if parsing fails
      return isWatched ? 'Play Next Episode' : playButtonText;
    }

    // Default fallback for non-series or missing data
    return isWatched ? 'Play' : playButtonText;
  }, [isWatched, playButtonText, type, watchProgress, groupedEpisodes]);

  return (
    <Animated.View style={[isTablet ? styles.tabletActionButtons : styles.actionButtons, animatedStyle]}>
      <TouchableOpacity
        style={[playButtonStyle, isTablet && styles.tabletPlayButton]}
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
          size={isTablet ? 28 : 24} 
          color={isWatched && type === 'movie' ? "#fff" : "#000"} 
        />
        <Text style={[playButtonTextStyle, isTablet && styles.tabletPlayButtonText]}>{finalPlayButtonText}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.infoButton, isTablet && styles.tabletInfoButton]}
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
          size={isTablet ? 28 : 24}
          color={currentTheme.colors.white}
        />
        <Text style={[styles.infoButtonText, isTablet && styles.tabletInfoButtonText]}>
          {inLibrary ? 'Saved' : 'Save'}
        </Text>
      </TouchableOpacity>

      {type === 'series' && (
        <TouchableOpacity
          style={[styles.iconButton, isTablet && styles.tabletIconButton]}
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
            size={isTablet ? 28 : 24} 
            color={currentTheme.colors.white}
          />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
});

// Enhanced WatchProgress Component with Trakt integration and watched status
const WatchProgressDisplay = memo(({ 
  watchProgress, 
  type, 
  getEpisodeDetails, 
  animatedStyle,
  isWatched,
  isTrailerPlaying,
  trailerMuted
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
  isTrailerPlaying: boolean;
  trailerMuted: boolean;
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
        ? new Date(watchProgress.lastUpdated).toLocaleDateString('en-US')
        : new Date().toLocaleDateString('en-US');
      
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
    const formattedTime = new Date(watchProgress.lastUpdated).toLocaleDateString('en-US');
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
  
  // Hide watch progress when trailer is playing AND unmuted
  if (isTrailerPlaying && !trailerMuted) return null;

  const isCompleted = progressData.isWatched || progressData.progressPercent >= 85;

  return (
    <Animated.View style={[isTablet ? styles.tabletWatchProgressContainer : styles.watchProgressContainer, animatedStyle]}>
      {/* Glass morphism background with entrance animation */}
      <Animated.View style={[isTablet ? styles.tabletProgressGlassBackground : styles.progressGlassBackground, progressBoxAnimatedStyle]}>
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
            <Text style={[isTablet ? styles.tabletWatchProgressMainText : styles.watchProgressMainText, { 
              color: isCompleted ? '#00ff88' : currentTheme.colors.white,
              fontSize: isCompleted ? (isTablet ? 15 : 13) : (isTablet ? 14 : 12),
              fontWeight: isCompleted ? '700' : '600'
            }]}>
              {progressData.displayText}
            </Text>
            
      </View>
          
          <Text style={[isTablet ? styles.tabletWatchProgressSubText : styles.watchProgressSubText, { 
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

/**
 * HeroSection Component - Performance Optimized
 * 
 * Optimizations Applied:
 * - Component memoization with React.memo
 * - Lazy loading system using InteractionManager
 * - Optimized image loading with useCallback handlers
 * - Cached theme colors to reduce re-renders
 * - Conditional rendering based on shouldLoadSecondaryData
 * - Memory management with cleanup on unmount
 * - Development-mode performance monitoring
 * - Optimized animated styles and memoized calculations
 * - Reduced re-renders through strategic memoization
 * - runOnUI for animation performance
 */
const HeroSection: React.FC<HeroSectionProps> = memo(({
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
  groupedEpisodes,
  dynamicBackgroundColor,
  handleBack,
}) => {
  const { currentTheme } = useTheme();
  const { isAuthenticated: isTraktAuthenticated } = useTraktContext();
  const { settings, updateSetting } = useSettings();

  // Performance optimization: Refs for avoiding re-renders
  const interactionComplete = useRef(false);
  const [shouldLoadSecondaryData, setShouldLoadSecondaryData] = useState(false);

  // Image loading state with optimized management
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState(false);
  // Use persistent setting instead of local state
  const trailerMuted = settings.trailerMuted;
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  const [trailerReady, setTrailerReady] = useState(false);
  const [trailerPreloaded, setTrailerPreloaded] = useState(false);
  const trailerVideoRef = useRef<any>(null);
  const imageOpacity = useSharedValue(1);
  const imageLoadOpacity = useSharedValue(0);
  const shimmerOpacity = useSharedValue(0.3);
  const trailerOpacity = useSharedValue(0);
  const thumbnailOpacity = useSharedValue(1);
  
  // Animation values for trailer unmute effects
  const actionButtonsOpacity = useSharedValue(1);
  const titleCardTranslateY = useSharedValue(0);
  const genreOpacity = useSharedValue(1);
  
  // Performance optimization: Cache theme colors
  const themeColors = useMemo(() => ({
    black: currentTheme.colors.black,
    darkBackground: currentTheme.colors.darkBackground,
    highEmphasis: currentTheme.colors.highEmphasis,
    text: currentTheme.colors.text
  }), [currentTheme.colors.black, currentTheme.colors.darkBackground, currentTheme.colors.highEmphasis, currentTheme.colors.text]);

  // Handle trailer preload completion
  const handleTrailerPreloaded = useCallback(() => {
    setTrailerPreloaded(true);
    logger.info('HeroSection', 'Trailer preloaded successfully');
  }, []);

  // Handle smooth transition when trailer is ready to play
  const handleTrailerReady = useCallback(() => {
    if (!trailerPreloaded) {
      setTrailerPreloaded(true);
    }
    setTrailerReady(true);
    setIsTrailerPlaying(true);
    
    // Smooth transition: fade out thumbnail, fade in trailer
    thumbnailOpacity.value = withTiming(0, { duration: 500 });
    trailerOpacity.value = withTiming(1, { duration: 500 });
  }, [thumbnailOpacity, trailerOpacity, trailerPreloaded]);

  // Handle fullscreen toggle
  const handleFullscreenToggle = useCallback(async () => {
    try {
      if (trailerVideoRef.current) {
        // Use the native fullscreen player
        await trailerVideoRef.current.presentFullscreenPlayer();
      }
    } catch (error) {
      logger.error('HeroSection', 'Error toggling fullscreen:', error);
    }
  }, []);

  // Handle trailer error - fade back to thumbnail
  const handleTrailerError = useCallback(() => {
    setTrailerError(true);
    setTrailerReady(false);
    setIsTrailerPlaying(false);
    
    // Fade back to thumbnail
    trailerOpacity.value = withTiming(0, { duration: 300 });
    thumbnailOpacity.value = withTiming(1, { duration: 300 });
  }, [trailerOpacity, thumbnailOpacity]);
  
  // Memoized image source
  const imageSource = useMemo(() => 
    bannerImage || metadata.banner || metadata.poster
  , [bannerImage, metadata.banner, metadata.poster]);
  
  // Performance optimization: Lazy loading setup
  useEffect(() => {
    const timer = InteractionManager.runAfterInteractions(() => {
      if (!interactionComplete.current) {
        interactionComplete.current = true;
        setShouldLoadSecondaryData(true);
      }
    });
    
    return () => timer.cancel();
  }, []);

  // Fetch trailer URL when component mounts (only if trailers are enabled)
  useEffect(() => {
    const fetchTrailer = async () => {
      if (!metadata?.name || !metadata?.year || !settings?.showTrailers) return;
      
      setTrailerLoading(true);
      setTrailerError(false);
      setTrailerReady(false);
      setTrailerPreloaded(false);
      
      try {
        const url = await TrailerService.getTrailerUrl(metadata.name, metadata.year);
        if (url) {
          const bestUrl = TrailerService.getBestFormatUrl(url);
          setTrailerUrl(bestUrl);
          logger.info('HeroSection', `Trailer URL loaded for ${metadata.name}`);
        } else {
          logger.info('HeroSection', `No trailer found for ${metadata.name}`);
        }
      } catch (error) {
        logger.error('HeroSection', 'Error fetching trailer:', error);
        setTrailerError(true);
      } finally {
        setTrailerLoading(false);
      }
    };

    fetchTrailer();
  }, [metadata?.name, metadata?.year, settings?.showTrailers]);

  // Optimized shimmer animation for loading state
  useEffect(() => {
    if (!shouldLoadSecondaryData) return;
    
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
  }, [imageLoaded, imageSource, shouldLoadSecondaryData]);
  
  // Optimized loading state reset when image source changes
  useEffect(() => {
    if (imageSource) {
      setImageLoaded(false);
      imageLoadOpacity.value = 0;
    }
  }, [imageSource]);
  
  // Optimized image handlers with useCallback
  const handleImageError = useCallback(() => {
    if (!shouldLoadSecondaryData) return;
    
    runOnUI(() => {
      imageOpacity.value = withTiming(0.6, { duration: 150 });
      imageLoadOpacity.value = withTiming(0, { duration: 150 });
    })();
    
    setImageError(true);
    setImageLoaded(false);
    
    // Fallback to poster if banner fails
    if (bannerImage !== metadata.banner) {
      setBannerImage(metadata.banner || metadata.poster);
    }
  }, [shouldLoadSecondaryData, bannerImage, metadata.banner, metadata.poster, setBannerImage]);

  const handleImageLoad = useCallback(() => {
    runOnUI(() => {
      imageOpacity.value = withTiming(1, { duration: 150 });
      imageLoadOpacity.value = withTiming(1, { duration: 400 });
    })();
    
    setImageError(false);
    setImageLoaded(true);
  }, []);

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
        // Keep logo stable by not applying translateY based on scroll
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
    opacity: buttonsOpacity.value * actionButtonsOpacity.value,
    transform: [{ 
      translateY: interpolate(
        buttonsTranslateY.value,
        [0, 20],
        [0, 20],
        Extrapolate.CLAMP
      )
    }]
  }), []);

  // Title card animation for lowering position when trailer is unmuted
  const titleCardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: titleCardTranslateY.value }]
  }), []);

  // Genre animation for hiding when trailer is unmuted
  const genreAnimatedStyle = useAnimatedStyle(() => ({
    opacity: genreOpacity.value
  }), []);

  // Optimized genre rendering with lazy loading and memory management
  const genreElements = useMemo(() => {
    if (!shouldLoadSecondaryData || !metadata?.genres?.length) return null;

    const genresToDisplay = metadata.genres.slice(0, 3); // Reduced to 3 for performance
    return genresToDisplay.map((genreName: string, index: number, array: string[]) => (
      <Animated.View
        key={`${genreName}-${index}`}
        entering={FadeIn.duration(400).delay(200 + index * 100)}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <Text style={[isTablet ? styles.tabletGenreText : styles.genreText, { color: themeColors.text }]}>
          {genreName}
        </Text>
        {index < array.length - 1 && (
          <Text style={[isTablet ? styles.tabletGenreDot : styles.genreDot, { color: themeColors.text }]}>•</Text>
        )}
      </Animated.View>
    ));
  }, [metadata.genres, themeColors.text, shouldLoadSecondaryData]);

  // Memoized play button text
  const playButtonText = useMemo(() => getPlayButtonText(), [getPlayButtonText]);

  // Calculate if content is watched (>=85% progress) - check both local and Trakt progress
  const isWatched = useMemo(() => {
    if (!watchProgress) return false;
    
    // Check Trakt progress first if available and user is authenticated
    if (isTraktAuthenticated && watchProgress.traktProgress !== undefined) {
      const traktWatched = watchProgress.traktProgress >= 95;
      // Removed excessive logging for Trakt progress
      return traktWatched;
    }
    
    // Fall back to local progress
    if (watchProgress.duration === 0) return false;
    const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
    const localWatched = progressPercent >= 85;
    // Removed excessive logging for local progress
    return localWatched;
  }, [watchProgress, isTraktAuthenticated]);

  // Memory management and cleanup
  useEffect(() => {
    return () => {
      // Reset animation values on unmount
      imageOpacity.value = 1;
      imageLoadOpacity.value = 0;
      shimmerOpacity.value = 0.3;
      interactionComplete.current = false;
      
      // Cleanup on unmount
    };
  }, []);

  // Development-only performance monitoring
  useEffect(() => {
    if (__DEV__) {
      const startTime = Date.now();
      const timer = setTimeout(() => {
        const renderTime = Date.now() - startTime;
        if (renderTime > 100) {
          console.warn(`[HeroSection] Slow render detected: ${renderTime}ms`);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  });



  return (
    <Animated.View style={[styles.heroSection, heroAnimatedStyle]}>
      {/* Optimized Background */}
      <View style={[styles.absoluteFill, { backgroundColor: themeColors.black }]} />
      
      {/* Optimized shimmer loading effect */}
      {shouldLoadSecondaryData && (trailerLoading || ((imageSource && !imageLoaded) || loadingBanner)) && (
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
      
      {/* Background thumbnail image - always rendered when available */}
      {shouldLoadSecondaryData && imageSource && !loadingBanner && (
        <Animated.View style={[styles.absoluteFill, {
          opacity: thumbnailOpacity
        }]}>
          <Animated.Image 
            source={{ uri: imageSource }}
            style={[styles.absoluteFill, backdropImageStyle]}
            resizeMode="cover"
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        </Animated.View>
      )}
      
      {/* Hidden preload trailer player - loads in background */}
      {shouldLoadSecondaryData && settings?.showTrailers && trailerUrl && !trailerLoading && !trailerError && !trailerPreloaded && (
        <View style={[styles.absoluteFill, { opacity: 0, pointerEvents: 'none' }]}>
          <TrailerPlayer
            trailerUrl={trailerUrl}
            autoPlay={false}
            muted={true}
            style={styles.absoluteFill}
            hideLoadingSpinner={true}
            onLoad={handleTrailerPreloaded}
            onError={handleTrailerError}
          />
        </View>
      )}
      
      {/* Visible trailer player - rendered on top with fade transition */}
      {shouldLoadSecondaryData && settings?.showTrailers && trailerUrl && !trailerLoading && !trailerError && trailerPreloaded && (
        <Animated.View style={[styles.absoluteFill, {
          opacity: trailerOpacity
        }]}>
          <TrailerPlayer
              ref={trailerVideoRef}
              trailerUrl={trailerUrl}
              autoPlay={true}
              muted={trailerMuted}
              style={styles.absoluteFill}
              hideLoadingSpinner={true}
              onFullscreenToggle={handleFullscreenToggle}
              onLoad={handleTrailerReady}
              onError={handleTrailerError}
              onPlaybackStatusUpdate={(status) => {
                if (status.isLoaded && !trailerReady) {
                  handleTrailerReady();
                }
              }}
            />
        </Animated.View>
      )}

      {/* Trailer control buttons (unmute and fullscreen) */}
      {settings?.showTrailers && trailerReady && trailerUrl && (
        <Animated.View style={{
          position: 'absolute',
          top: Platform.OS === 'android' ? 40 : 50,
          right: width >= 768 ? 32 : 16,
          zIndex: 10,
          opacity: trailerOpacity,
          flexDirection: 'row',
          gap: 8,
        }}>
          {/* Fullscreen button */}
          <TouchableOpacity
            onPress={handleFullscreenToggle}
            activeOpacity={0.7}
            style={{
              padding: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              borderRadius: 20,
            }}
          >
            <MaterialIcons
              name="fullscreen"
              size={24}
              color="white"
            />
          </TouchableOpacity>

          {/* Unmute button */}
          <TouchableOpacity
            onPress={() => {
              updateSetting('trailerMuted', !trailerMuted);
              if (trailerMuted) {
                // When unmuting, hide action buttons, genre, title card, and watch progress
                actionButtonsOpacity.value = withTiming(0, { duration: 300 });
                genreOpacity.value = withTiming(0, { duration: 300 });
                titleCardTranslateY.value = withTiming(60, { duration: 300 });
                watchProgressOpacity.value = withTiming(0, { duration: 300 });
              } else {
                // When muting, show action buttons, genre, title card, and watch progress
                actionButtonsOpacity.value = withTiming(1, { duration: 300 });
                genreOpacity.value = withTiming(1, { duration: 300 });
                titleCardTranslateY.value = withTiming(0, { duration: 300 });
                watchProgressOpacity.value = withTiming(1, { duration: 300 });
              }
            }}
            activeOpacity={0.7}
            style={{
              padding: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              borderRadius: 20,
            }}
          >
            <MaterialIcons
              name={trailerMuted ? 'volume-off' : 'volume-up'}
              size={24}
              color="white"
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.View style={styles.backButtonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <MaterialIcons 
            name="arrow-back" 
            size={28} 
            color="#fff" 
            style={styles.backButtonIcon}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Ultra-light Gradient with subtle dynamic background blend */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.05)',
          'rgba(0,0,0,0.15)',
          'rgba(0,0,0,0.35)',
          'rgba(0,0,0,0.65)',
          dynamicBackgroundColor || themeColors.darkBackground
        ]}
        locations={[0, 0.3, 0.55, 0.75, 0.9, 1]}
        style={styles.heroGradient}
      >
        {/* Enhanced bottom fade with stronger gradient */}
        <LinearGradient
          colors={[
            'transparent',
            `${dynamicBackgroundColor || themeColors.darkBackground}10`,
            `${dynamicBackgroundColor || themeColors.darkBackground}25`,
            `${dynamicBackgroundColor || themeColors.darkBackground}45`,
            `${dynamicBackgroundColor || themeColors.darkBackground}65`,
            `${dynamicBackgroundColor || themeColors.darkBackground}85`,
            `${dynamicBackgroundColor || themeColors.darkBackground}95`,
            dynamicBackgroundColor || themeColors.darkBackground
          ]}
          locations={[0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1]}
          style={styles.bottomFadeGradient}
          pointerEvents="none"
        />
        <View style={[styles.heroContent, isTablet && { maxWidth: 800, alignSelf: 'center' }]}>
          {/* Optimized Title/Logo */}
          <Animated.View style={[styles.logoContainer, titleCardAnimatedStyle]}>
            <Animated.View style={[styles.titleLogoContainer, logoAnimatedStyle]}>
              {shouldLoadSecondaryData && metadata.logo && !logoLoadError ? (
                <Image
                  source={{ uri: metadata.logo }}
                  style={isTablet ? styles.tabletTitleLogo : styles.titleLogo}
                  contentFit="contain"
                  transition={150}
                  onError={() => {
                    runOnJS(setLogoLoadError)(true);
                  }}
                />
              ) : (
                <Text style={[isTablet ? styles.tabletHeroTitle : styles.heroTitle, { color: themeColors.highEmphasis }]}>
                  {metadata.name}
                </Text>
              )}
            </Animated.View>
          </Animated.View>

          {/* Enhanced Watch Progress with Trakt integration */}
          <WatchProgressDisplay 
            watchProgress={watchProgress}
            type={type}
            getEpisodeDetails={getEpisodeDetails}
            animatedStyle={watchProgressAnimatedStyle}
            isWatched={isWatched}
            isTrailerPlaying={isTrailerPlaying}
            trailerMuted={trailerMuted}
          />

          {/* Optimized genre display with lazy loading */}
          {shouldLoadSecondaryData && genreElements && (
            <Animated.View style={[isTablet ? styles.tabletGenreContainer : styles.genreContainer, genreAnimatedStyle]}>
              {genreElements}
            </Animated.View>
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
            groupedEpisodes={groupedEpisodes}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

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
  backButtonContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 50,
    left: isTablet ? 32 : 16,
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  backButtonIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },

  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  bottomFadeGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 400,
    zIndex: 1,
  },
  heroContent: {
    padding: isTablet ? 32 : 16,
    paddingTop: isTablet ? 16 : 8,
    paddingBottom: isTablet ? 16 : 8,
    position: 'relative',
    zIndex: 2,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 4,
    flex: 0,
    display: 'flex',
    maxWidth: isTablet ? 600 : '100%',
    alignSelf: 'center',
  },
  titleLogoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    flex: 0,
    display: 'flex',
    maxWidth: isTablet ? 600 : '100%',
    alignSelf: 'center',
  },
  titleLogo: {
    width: width * 0.75,
    height: 90,
    alignSelf: 'center',
    textAlign: 'center',
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
    maxWidth: isTablet ? 600 : '100%',
    alignSelf: 'center',
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
    maxWidth: isTablet ? 600 : '100%',
    alignSelf: 'center',
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
    maxWidth: isTablet ? 600 : '100%',
    alignSelf: 'center',
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
  
  // Tablet-specific styles
  tabletActionButtons: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'relative',
    maxWidth: 600,
    alignSelf: 'center',
  },
  tabletPlayButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 32,
    minWidth: 180,
  },
  tabletPlayButtonText: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  tabletInfoButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    minWidth: 140,
  },
  tabletInfoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  tabletIconButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  tabletHeroTitle: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 42,
  },
  tabletTitleLogo: {
    width: width * 0.5,
    height: 120,
    alignSelf: 'center',
    maxWidth: 400,
    textAlign: 'center',
  },
  tabletGenreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
  },
  tabletGenreText: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.9,
  },
  tabletGenreDot: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 4,
  },
  tabletWatchProgressContainer: {
    marginTop: 8,
    marginBottom: 8,
    width: '100%',
    alignItems: 'center',
    minHeight: 44,
    position: 'relative',
    maxWidth: 800,
    alignSelf: 'center',
  },
  tabletProgressGlassBackground: {
     width: width * 0.7,
     maxWidth: 700,
     backgroundColor: 'rgba(255,255,255,0.08)',
     borderRadius: 16,
     padding: 12,
     borderWidth: 1,
     borderColor: 'rgba(255,255,255,0.1)',
     overflow: 'hidden',
     alignSelf: 'center',
   },
   tabletWatchProgressMainText: {
     fontSize: 14,
     fontWeight: '600',
     textAlign: 'center',
   },
   tabletWatchProgressSubText: {
     fontSize: 12,
     textAlign: 'center',
     opacity: 0.8,
     marginBottom: 1,
   },
});

export default HeroSection;