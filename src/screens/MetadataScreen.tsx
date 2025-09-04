import React, { useCallback, useState, useEffect, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { useMetadata } from '../hooks/useMetadata';
import { useDominantColor, preloadDominantColor } from '../hooks/useDominantColor';
import { CastSection } from '../components/metadata/CastSection';
import { CastDetailsModal } from '../components/metadata/CastDetailsModal';
import { SeriesContent } from '../components/metadata/SeriesContent';
import { MovieContent } from '../components/metadata/MovieContent';
import { MoreLikeThisSection } from '../components/metadata/MoreLikeThisSection';
import { RatingsSection } from '../components/metadata/RatingsSection';
import { RouteParams, Episode } from '../types/metadata';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  useSharedValue,
  withTiming,
  runOnJS,
  runOnUI,
  Easing,
  interpolateColor,
  withSpring,
} from 'react-native-reanimated';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings } from '../hooks/useSettings';
import { MetadataLoadingScreen } from '../components/loading/MetadataLoadingScreen';
import { useTrailer } from '../contexts/TrailerContext';

// Import our optimized components and hooks
import HeroSection from '../components/metadata/HeroSection';
import FloatingHeader from '../components/metadata/FloatingHeader';
import MetadataDetails from '../components/metadata/MetadataDetails';
import { useMetadataAnimations } from '../hooks/useMetadataAnimations';
import { useMetadataAssets } from '../hooks/useMetadataAssets';
import { useWatchProgress } from '../hooks/useWatchProgress';
import { TraktService, TraktPlaybackItem } from '../services/traktService';
import { tmdbService } from '../services/tmdbService';
import { catalogService } from '../services/catalogService';

const { height } = Dimensions.get('window');

// Memoized components for better performance
const MemoizedCastSection = memo(CastSection);
const MemoizedSeriesContent = memo(SeriesContent);
const MemoizedMovieContent = memo(MovieContent);
const MemoizedMoreLikeThisSection = memo(MoreLikeThisSection);
const MemoizedRatingsSection = memo(RatingsSection);
const MemoizedCastDetailsModal = memo(CastDetailsModal);

const MetadataScreen: React.FC = () => {
  const route = useRoute<RouteProp<Record<string, RouteParams & { episodeId?: string; addonId?: string }>, string>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { id, type, episodeId, addonId } = route.params;
  
  // Consolidated hooks for better performance
  const { settings } = useSettings();
  const { currentTheme } = useTheme();
  const { top: safeAreaTop } = useSafeAreaInsets();
  const { pauseTrailer } = useTrailer();

  // Optimized state management - reduced state variables
  const [isContentReady, setIsContentReady] = useState(false);
  const [showCastModal, setShowCastModal] = useState(false);
  const [selectedCastMember, setSelectedCastMember] = useState<any>(null);
  const [shouldLoadSecondaryData, setShouldLoadSecondaryData] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  // Source switching removed
  const transitionOpacity = useSharedValue(1);
  const interactionComplete = useRef(false);

  const {
    metadata,
    loading,
    error: metadataError,
    cast,
    loadingCast,
    episodes,
    selectedSeason,
    loadingSeasons,
    loadMetadata,
    handleSeasonChange,
    toggleLibrary,
    inLibrary,
    groupedEpisodes,
    recommendations,
    loadingRecommendations,
    setMetadata,
    imdbId,
  } = useMetadata({ id, type, addonId });

  // Optimized hooks with memoization and conditional loading
  const watchProgressData = useWatchProgress(id, type as 'movie' | 'series', episodeId, episodes);
  const assetData = useMetadataAssets(metadata, id, type, imdbId, settings, setMetadata);
  const animations = useMetadataAnimations(safeAreaTop, watchProgressData.watchProgress);
  
  // Extract dominant color from hero image for dynamic background
  const heroImageUri = useMemo(() => {
    if (!metadata) return null;
    return assetData.bannerImage || metadata.banner || metadata.poster || null;
  }, [metadata, assetData.bannerImage]);
  
  // Preload color extraction as soon as we have the URI
  useEffect(() => {
    if (heroImageUri) {
      preloadDominantColor(heroImageUri);
    }
  }, [heroImageUri]);
  
  const { dominantColor, loading: colorLoading } = useDominantColor(heroImageUri);
  
  // Create shared values for smooth color interpolation
  const bgFromColor = useSharedValue(currentTheme.colors.darkBackground);
  const bgToColor = useSharedValue(currentTheme.colors.darkBackground);
  const bgProgress = useSharedValue(1);
  
  // Update the shared value when dominant color changes
  const hasAnimatedInitialColorRef = useRef(false);
  useEffect(() => {
    const base = currentTheme.colors.darkBackground;
    const target = (settings.useDominantBackgroundColor && dominantColor && dominantColor !== '#1a1a1a' && dominantColor !== null)
      ? dominantColor
      : base;

    if (!hasAnimatedInitialColorRef.current) {
      // Initial: animate from base to target smoothly
      bgFromColor.value = base as any;
      bgToColor.value = target as any;
      bgProgress.value = 0;
      bgProgress.value = withSpring(1, {
        damping: 30,
        stiffness: 90,
      });
      hasAnimatedInitialColorRef.current = true;
      return;
    }

    // Subsequent updates: retarget smoothly from the current on-screen color
    runOnUI(() => {
      'worklet';
      const current = interpolateColor(
        bgProgress.value,
        [0, 1],
        [bgFromColor.value as any, bgToColor.value as any]
      );
      bgFromColor.value = current as any;
      bgToColor.value = target as any;
      bgProgress.value = 0;
      bgProgress.value = withSpring(1, {
        damping: 30,
        stiffness: 90,
      });
    })();
  }, [dominantColor, currentTheme.colors.darkBackground, settings.useDominantBackgroundColor]);
  
  // Create an animated style for the background color
  const animatedBackgroundStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      bgProgress.value,
      [0, 1],
      [bgFromColor.value as any, bgToColor.value as any]
    );
    return { backgroundColor: color as any };
  });
  
  // For compatibility with existing code, maintain the static value as well
  const dynamicBackgroundColor = useMemo(() => {
    if (settings.useDominantBackgroundColor && dominantColor && dominantColor !== '#1a1a1a' && dominantColor !== null && dominantColor !== currentTheme.colors.darkBackground) {
      return dominantColor;
    }
    return currentTheme.colors.darkBackground;
  }, [dominantColor, currentTheme.colors.darkBackground, settings.useDominantBackgroundColor]);

  // Debug logging for color extraction timing
  useEffect(() => {
    if (heroImageUri && dominantColor) {
      console.log('[MetadataScreen] Dynamic background color:', {
        dominantColor,
        fallback: currentTheme.colors.darkBackground,
        finalColor: dynamicBackgroundColor,
        heroImageUri
      });
    }
  }, [dominantColor, dynamicBackgroundColor, heroImageUri, currentTheme.colors.darkBackground]);

  // Focus effect for performance optimization
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      
      // Delay secondary data loading until interactions are complete
      const timer = setTimeout(() => {
        if (!interactionComplete.current) {
          InteractionManager.runAfterInteractions(() => {
            setShouldLoadSecondaryData(true);
            interactionComplete.current = true;
          });
        }
      }, 100);

      return () => {
        setIsScreenFocused(false);
        clearTimeout(timer);
      };
    }, [])
  );

  // Optimize secondary data loading
  useEffect(() => {
    if (metadata && isScreenFocused && !shouldLoadSecondaryData) {
      const timer = setTimeout(() => {
        setShouldLoadSecondaryData(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [metadata, isScreenFocused, shouldLoadSecondaryData]);

  // Optimized Trakt progress fetching - only when secondary data should load
  const fetchTraktProgress = useCallback(async () => {
    if (!shouldLoadSecondaryData || !metadata || !id) return;
    
    try {
      const traktService = TraktService.getInstance();
      const isAuthenticated = await traktService.isAuthenticated();
      
      if (!isAuthenticated) {
        console.log(`[MetadataScreen] Not authenticated with Trakt`);
        return;
      }

      // Get all playback progress from Trakt (cached)
      const allProgress = await traktService.getPlaybackProgress();
      
      if (allProgress.length === 0) return;

      // Filter progress for current content
      let relevantProgress: TraktPlaybackItem[] = [];
      
      if (type === 'movie') {
        relevantProgress = allProgress.filter(item => 
          item.type === 'movie' && 
          item.movie?.ids.imdb === id.replace('tt', '')
        );
      } else if (type === 'series') {
        relevantProgress = allProgress.filter(item => 
          item.type === 'episode' && 
          item.show?.ids.imdb === id.replace('tt', '')
        );
      }

      if (relevantProgress.length === 0) return;

      // Log only essential progress information for performance
      console.log(`[MetadataScreen] Found ${relevantProgress.length} Trakt progress items for ${type}`);
      
      // Find most recent progress if multiple episodes
      if (type === 'series' && relevantProgress.length > 1) {
        const mostRecent = relevantProgress.sort((a, b) => 
          new Date(b.paused_at).getTime() - new Date(a.paused_at).getTime()
        )[0];
        
        if (mostRecent.episode && mostRecent.show) {
          console.log(`[MetadataScreen] Most recent: S${mostRecent.episode.season}E${mostRecent.episode.number} - ${mostRecent.progress.toFixed(1)}%`);
        }
      }
        
    } catch (error) {
      console.error(`[MetadataScreen] Failed to fetch Trakt progress:`, error);
    }
  }, [shouldLoadSecondaryData, metadata, id, type]);

  // Debounced Trakt progress fetching
  useEffect(() => {
    if (shouldLoadSecondaryData && metadata && id) {
      const timer = setTimeout(fetchTraktProgress, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldLoadSecondaryData, metadata, id, fetchTraktProgress]);

  // Memory management and cleanup
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (transitionOpacity.value !== 0) {
        transitionOpacity.value = 0;
      }
      // Reset secondary data loading state
      setShouldLoadSecondaryData(false);
      interactionComplete.current = false;
    };
  }, []);

  // Performance monitoring (development only)
  useEffect(() => {
    if (__DEV__ && metadata) {
      const startTime = Date.now();
      const timer = setTimeout(() => {
        const renderTime = Date.now() - startTime;
        if (renderTime > 100) {
          console.warn(`[MetadataScreen] Slow render detected: ${renderTime}ms for ${metadata.name}`);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [metadata]);

  // Memoized derived values for performance
  const isReady = useMemo(() => !loading && metadata && !metadataError, [loading, metadata, metadataError]);
  
  // Optimized content ready state management
  useEffect(() => {
    if (isReady && isScreenFocused) {
      setIsContentReady(true);
      transitionOpacity.value = withTiming(1, { duration: 50 });
    } else if (!isReady && isContentReady) {
      setIsContentReady(false);
      transitionOpacity.value = 0;
    }
  }, [isReady, isContentReady, isScreenFocused]);

  // Optimized callback functions with reduced dependencies and haptics throttling
  const handleToggleLibrary = useCallback(() => {
    if (isScreenFocused) {
      Haptics.impactAsync(inLibrary ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    }
    toggleLibrary();
  }, [inLibrary, toggleLibrary, isScreenFocused]);

  const handleSeasonChangeWithHaptics = useCallback((seasonNumber: number) => {
    if (isScreenFocused) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    handleSeasonChange(seasonNumber);
  }, [handleSeasonChange, isScreenFocused]);

  const handleShowStreams = useCallback(() => {
    const { watchProgress } = watchProgressData;

    // Ensure trailer stops immediately before navigating to Streams
    try { pauseTrailer(); } catch {}

    // Helper to build episodeId from episode object
    const buildEpisodeId = (ep: any): string => {
      return ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`;
    };

    if (type === 'series') {
      // Determine if current episode is finished
      let progressPercent = 0;
      if (watchProgress && watchProgress.duration > 0) {
        progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
      }

      let targetEpisodeId: string | undefined;

      if (progressPercent >= 85 && watchProgress?.episodeId) {
        // Try to navigate to next episode – support multiple episodeId formats
        let currentSeason: number | null = null;
        let currentEpisode: number | null = null;

        const parts = watchProgress.episodeId.split(':');

        if (parts.length === 3) {
          // showId:season:episode
          currentSeason = parseInt(parts[1], 10);
          currentEpisode = parseInt(parts[2], 10);
        } else if (parts.length === 2) {
          // season:episode
          currentSeason = parseInt(parts[0], 10);
          currentEpisode = parseInt(parts[1], 10);
        } else {
          // pattern like s5e01
          const match = watchProgress.episodeId.match(/s(\d+)e(\d+)/i);
          if (match) {
            currentSeason = parseInt(match[1], 10);
            currentEpisode = parseInt(match[2], 10);
          }
        }

        if (currentSeason !== null && currentEpisode !== null) {
          // DIRECT APPROACH: Just create the next episode ID directly
          // This ensures we navigate to the next episode even if it's not yet in our episodes array
          const nextEpisodeId = `${id}:${currentSeason}:${currentEpisode + 1}`;
          console.log(`[MetadataScreen] Created next episode ID directly: ${nextEpisodeId}`);
          
          // Still try to find the episode in our list to verify it exists
          const nextEpisodeExists = episodes.some(ep => 
            ep.season_number === currentSeason && ep.episode_number === (currentEpisode + 1)
          );
          
          if (nextEpisodeExists) {
            console.log(`[MetadataScreen] Verified next episode S${currentSeason}E${currentEpisode + 1} exists in episodes list`);
          } else {
            console.log(`[MetadataScreen] Warning: Next episode S${currentSeason}E${currentEpisode + 1} not found in episodes list, but proceeding anyway`);
          }
          
          targetEpisodeId = nextEpisodeId;
        }
      }

      // Fallback logic: if not finished or nextEp not found
      if (!targetEpisodeId) {
        targetEpisodeId = watchProgress?.episodeId || episodeId || (episodes.length > 0 ? buildEpisodeId(episodes[0]) : undefined);
        console.log(`[MetadataScreen] Using fallback episode ID: ${targetEpisodeId}`);
      }

      if (targetEpisodeId) {
        // Ensure the episodeId has showId prefix (id:season:episode)
        const epParts = targetEpisodeId.split(':');
        let normalizedEpisodeId = targetEpisodeId;
        if (epParts.length === 2) {
          normalizedEpisodeId = `${id}:${epParts[0]}:${epParts[1]}`;
        }
        console.log(`[MetadataScreen] Navigating to streams with episodeId: ${normalizedEpisodeId}`);
        navigation.navigate('Streams', { id, type, episodeId: normalizedEpisodeId });
        return;
      }
    }

    // Normalize fallback episodeId too
    let fallbackEpisodeId = episodeId;
    if (episodeId && episodeId.split(':').length === 2) {
      const p = episodeId.split(':');
      fallbackEpisodeId = `${id}:${p[0]}:${p[1]}`;
    }
    console.log(`[MetadataScreen] Navigating with fallback episodeId: ${fallbackEpisodeId}`);
    navigation.navigate('Streams', { id, type, episodeId: fallbackEpisodeId });
  }, [navigation, id, type, episodes, episodeId, watchProgressData.watchProgress]);

  const handleEpisodeSelect = useCallback((episode: Episode) => {
    if (!isScreenFocused) return;
    
    console.log('[MetadataScreen] Selected Episode:', episode.episode_number, episode.season_number);
    const episodeId = episode.stremioId || `${id}:${episode.season_number}:${episode.episode_number}`;
    
    // Optimize navigation with requestAnimationFrame
    requestAnimationFrame(() => {
      // Ensure trailer stops immediately before navigating to Streams
      try { pauseTrailer(); } catch {}
      navigation.navigate('Streams', { 
        id, 
        type, 
        episodeId,
        episodeThumbnail: episode.still_path || undefined
      });
    });
  }, [navigation, id, type, isScreenFocused, pauseTrailer]);

  const handleBack = useCallback(() => {
    if (isScreenFocused) {
      navigation.goBack();
    }
  }, [navigation, isScreenFocused]);
  
  const handleSelectCastMember = useCallback((castMember: any) => {
    if (!isScreenFocused) return;
    setSelectedCastMember(castMember);
    setShowCastModal(true);
  }, [isScreenFocused]);

  // Source switching removed

  // Ultra-optimized animated styles - minimal calculations with conditional updates
  const containerStyle = useAnimatedStyle(() => ({
    opacity: isScreenFocused ? animations.screenOpacity.value : 0.8,
  }), [isScreenFocused]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: animations.contentOpacity.value,
    transform: [{ translateY: animations.uiElementsTranslateY.value }]
  }), []);

  const transitionStyle = useAnimatedStyle(() => ({
    opacity: transitionOpacity.value,
  }), []);

  // Memoized error component for performance
  const ErrorComponent = useMemo(() => {
    if (!metadataError) return null;
    
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: dynamicBackgroundColor }]}
        edges={['bottom']}
      >
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color={currentTheme.colors.textMuted} />
          <Text style={[styles.errorText, { color: currentTheme.colors.highEmphasis }]}>
            {metadataError || 'Content not found'}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: currentTheme.colors.primary }]}
            onPress={loadMetadata}
          >
            <MaterialIcons name="refresh" size={20} color={currentTheme.colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backButton, { borderColor: currentTheme.colors.primary }]}
            onPress={handleBack}
          >
            <Text style={[styles.backButtonText, { color: currentTheme.colors.primary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }, [metadataError, currentTheme, loadMetadata, handleBack]);

  // Show error if exists
  if (metadataError || (!loading && !metadata)) {
    return ErrorComponent;
  }

  // Show loading screen if metadata is not yet available
  if (loading || !isContentReady) {
    return <MetadataLoadingScreen type={type as 'movie' | 'series'} />;
  }

  return (
    <Animated.View style={[animatedBackgroundStyle, { flex: 1 }]}>
    <SafeAreaView 
      style={[containerStyle, styles.container]}
      edges={['bottom']}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" animated />
      
      {metadata && (
        <>
          {/* Floating Header - Optimized */}
          <FloatingHeader 
            metadata={metadata}
            logoLoadError={assetData.logoLoadError}
            handleBack={handleBack}
            handleToggleLibrary={handleToggleLibrary}
            headerElementsY={animations.headerElementsY}
            inLibrary={inLibrary}
            headerOpacity={animations.headerOpacity}
            headerElementsOpacity={animations.headerElementsOpacity}
            safeAreaTop={safeAreaTop}
            setLogoLoadError={assetData.setLogoLoadError}
          />

          <Animated.ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            onScroll={animations.scrollHandler}
            scrollEventThrottle={16}
            bounces={false}
            overScrollMode="never"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Hero Section - Optimized */}
            <HeroSection 
              metadata={metadata}
              bannerImage={assetData.bannerImage}
              loadingBanner={assetData.loadingBanner}
              logoLoadError={assetData.logoLoadError}
              scrollY={animations.scrollY}
              heroHeight={animations.heroHeight}
              heroOpacity={animations.heroOpacity}
              logoOpacity={animations.logoOpacity}
              buttonsOpacity={animations.buttonsOpacity}
              buttonsTranslateY={animations.buttonsTranslateY}
              watchProgressOpacity={animations.watchProgressOpacity}
              watchProgressWidth={animations.watchProgressWidth}
              watchProgress={watchProgressData.watchProgress}
              type={type as 'movie' | 'series'}
              getEpisodeDetails={watchProgressData.getEpisodeDetails}
              handleShowStreams={handleShowStreams}
              handleToggleLibrary={handleToggleLibrary}
              inLibrary={inLibrary}
              id={id}
              navigation={navigation}
              getPlayButtonText={watchProgressData.getPlayButtonText}
              setBannerImage={assetData.setBannerImage}
              setLogoLoadError={assetData.setLogoLoadError}
              groupedEpisodes={groupedEpisodes}
              dynamicBackgroundColor={dynamicBackgroundColor}
              handleBack={handleBack}
            />

            {/* Main Content - Optimized */}
            <Animated.View style={contentStyle}>
              <MetadataDetails 
                metadata={metadata}
                imdbId={imdbId}
                type={type as 'movie' | 'series'}
                contentId={id}
                loadingMetadata={false}
                renderRatings={() => imdbId && shouldLoadSecondaryData ? (
                  <MemoizedRatingsSection imdbId={imdbId} type={type === 'series' ? 'show' : 'movie'} />
                ) : null}
              />

              {/* Cast Section with skeleton when loading - Lazy loaded */}
              {shouldLoadSecondaryData && (
                <MemoizedCastSection
                  cast={cast}
                  loadingCast={loadingCast}
                  onSelectCastMember={handleSelectCastMember}
                />
              )}

              {/* Recommendations Section with skeleton when loading - Lazy loaded */}
              {type === 'movie' && shouldLoadSecondaryData && (
                <MemoizedMoreLikeThisSection 
                  recommendations={recommendations}
                  loadingRecommendations={loadingRecommendations}
                />
              )}

              {/* Series/Movie Content with episode skeleton when loading */}
              {type === 'series' ? (
                <MemoizedSeriesContent
                  episodes={Object.values(groupedEpisodes).flat()}
                  selectedSeason={selectedSeason}
                  loadingSeasons={loadingSeasons}
                  onSeasonChange={handleSeasonChangeWithHaptics}
                  onSelectEpisode={handleEpisodeSelect}
                  groupedEpisodes={groupedEpisodes}
                  metadata={metadata || undefined}
                />
              ) : (
                metadata && <MemoizedMovieContent metadata={metadata} />
              )}
            </Animated.View>
          </Animated.ScrollView>
        </>
      )}
      
      {/* Cast Details Modal - Memoized */}
      {showCastModal && (
        <MemoizedCastDetailsModal
          visible={showCastModal}
          onClose={() => setShowCastModal(false)}
          castMember={selectedCastMember}
        />
      )}
    </SafeAreaView>
    </Animated.View>
  );
};

// Optimized styles with minimal properties
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 2,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Skeleton loading styles
  skeletonSection: {
    padding: 16,
    marginBottom: 24,
  },
  skeletonTitle: {
    width: 150,
    height: 20,
    borderRadius: 4,
    marginBottom: 16,
  },
  skeletonCastRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonCastItem: {
    width: 80,
    height: 120,
    borderRadius: 8,
  },
  skeletonRecommendationsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonRecommendationItem: {
    width: 120,
    height: 180,
    borderRadius: 8,
  },
  skeletonEpisodesContainer: {
    gap: 12,
  },
  skeletonEpisodeItem: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    marginBottom: 8,
  },
});

// Performance Optimizations Applied:
// 1. Memoized components (Cast, Series, Movie, Ratings, Modal)
// 2. Lazy loading of secondary data (cast, recommendations, ratings)
// 3. Focus-based rendering and interaction management
// 4. Debounced Trakt progress fetching with reduced logging
// 5. Optimized callback functions with screen focus checks
// 6. Conditional haptics feedback based on screen focus
// 7. Memory management and cleanup on unmount
// 8. Performance monitoring in development mode
// 9. Reduced re-renders through better state management
// 10. RequestAnimationFrame for navigation optimization

export default MetadataScreen;