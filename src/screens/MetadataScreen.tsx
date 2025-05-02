import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  StatusBar,
  ImageBackground,
  Dimensions,
  Platform,
  TouchableWithoutFeedback,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { BlurView as CommunityBlurView } from '@react-native-community/blur';
import * as Haptics from 'expo-haptics';
import { colors } from '../styles/colors';
import { useMetadata } from '../hooks/useMetadata';
import { CastSection as OriginalCastSection } from '../components/metadata/CastSection';
import { SeriesContent as OriginalSeriesContent } from '../components/metadata/SeriesContent';
import { MovieContent as OriginalMovieContent } from '../components/metadata/MovieContent';
import { MoreLikeThisSection as OriginalMoreLikeThisSection } from '../components/metadata/MoreLikeThisSection';
import { RatingsSection as OriginalRatingsSection } from '../components/metadata/RatingsSection';
import { StreamingContent } from '../services/catalogService';
import { GroupedStreams } from '../types/streams';
import { TMDBEpisode } from '../services/tmdbService';
import { Cast } from '../types/cast';
import { RouteParams, Episode } from '../types/metadata';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  Easing,
  FadeInDown,
  interpolate,
  Extrapolate,
  withSpring,
  FadeIn,
  runOnJS,
  Layout,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TMDBService } from '../services/tmdbService';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';
import { useGenres } from '../contexts/GenreContext';

const { width, height } = Dimensions.get('window');

// Memoize child components
const CastSection = React.memo(OriginalCastSection);
const SeriesContent = React.memo(OriginalSeriesContent);
const MovieContent = React.memo(OriginalMovieContent);
const MoreLikeThisSection = React.memo(OriginalMoreLikeThisSection);
const RatingsSection = React.memo(OriginalRatingsSection);

// Animation constants
const springConfig = {
  damping: 20,
  mass: 1,
  stiffness: 100
};

// Animation timing constants for staggered appearance
const ANIMATION_DELAY_CONSTANTS = {
  HERO: 100,
  LOGO: 250,
  PROGRESS: 350,
  GENRES: 400,
  BUTTONS: 450,
  CONTENT: 500
};

// Add debug log for storageService
logger.log('[MetadataScreen] StorageService instance:', storageService);

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
  navigation: NavigationProp<RootStackParamList>;
  playButtonText: string;
  animatedStyle: any;
}) => {
  // Add wrapper for play button with haptic feedback
  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    handleShowStreams();
  };

  return (
    <Animated.View style={[styles.actionButtons, animatedStyle]}>
      <TouchableOpacity
        style={[styles.actionButton, styles.playButton]}
        onPress={handlePlay}
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
          color="#fff"
        />
        <Text style={styles.infoButtonText}>
          {inLibrary ? 'Saved' : 'Save'}
        </Text>
      </TouchableOpacity>

      {type === 'series' && (
        <TouchableOpacity
          style={[styles.iconButton]}
          onPress={async () => {
            const tmdb = TMDBService.getInstance();
            const tmdbId = await tmdb.extractTMDBIdFromStremioId(id);
            if (tmdbId) {
              navigation.navigate('ShowRatings', { showId: tmdbId });
            } else {
              logger.error('Could not find TMDB ID for show');
            }
          }}
        >
          <MaterialIcons name="assessment" size={24} color="#fff" />
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
            { width: `${progressPercent}%` }
          ]} 
        />
      </View>
      <Text style={styles.watchProgressText}>
        {progressPercent >= 95 ? 'Watched' : `${Math.round(progressPercent)}% watched`}{episodeInfo} • Last watched on {formattedTime}
      </Text>
    </Animated.View>
  );
});

const MetadataScreen = () => {
  const route = useRoute<RouteProp<Record<string, RouteParams & { episodeId?: string }>, string>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { id, type, episodeId } = route.params;

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
  } = useMetadata({ id, type });

  // Get genres from context
  const { genreMap, loadingGenres } = useGenres();

  // Update the ref type to be compatible with Animated.ScrollView
  const contentRef = useRef<Animated.ScrollView>(null);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [isFullDescriptionOpen, setIsFullDescriptionOpen] = useState(false);

  // Get safe area insets
  const { top: safeAreaTop } = useSafeAreaInsets();

  // Animation values
  const screenScale = useSharedValue(0.92);
  const screenOpacity = useSharedValue(0);
  const heroHeight = useSharedValue(height * 0.5);
  const contentTranslateY = useSharedValue(60);
  
  // Additional animation values for staggered entrance
  const heroScale = useSharedValue(1.05);
  const heroOpacity = useSharedValue(0);
  const genresOpacity = useSharedValue(0);
  const genresTranslateY = useSharedValue(20);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(30);

  // Add state for watch progress
  const [watchProgress, setWatchProgress] = useState<{
    currentTime: number;
    duration: number;
    lastUpdated: number;
    episodeId?: string;
  } | null>(null);

  // Add wrapper for toggleLibrary that includes haptic feedback
  const handleToggleLibrary = useCallback(() => {
    // Trigger appropriate haptic feedback based on action
    if (inLibrary) {
      // Removed from library - light impact
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // Added to library - success feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    // Call the original toggleLibrary function
    toggleLibrary();
  }, [inLibrary, toggleLibrary]);

  // Add wrapper for season change with distinctive haptic feedback
  const handleSeasonChangeWithHaptics = useCallback((seasonNumber: number) => {
    // Change to Light impact for a more subtle feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Wait a tiny bit before changing season, making the feedback more noticeable
    setTimeout(() => {
      handleSeasonChange(seasonNumber);
    }, 10);
  }, [handleSeasonChange]);

  // Add new animated value for watch progress
  const watchProgressOpacity = useSharedValue(0);
  const watchProgressScaleY = useSharedValue(0);

  // Add animated value for logo
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.9);

  // Add shared value for parallax effect
  const scrollY = useSharedValue(0);

  // Create a dampened scroll value for smoother parallax
  const dampedScrollY = useSharedValue(0);

  // Add shared value for floating header opacity
  const headerOpacity = useSharedValue(0);
  
  // Add values for animated header elements
  const headerElementsY = useSharedValue(-10);
  const headerElementsOpacity = useSharedValue(0);

  // Debug log for route params
  // logger.log('[MetadataScreen] Component mounted with route params:', { id, type, episodeId });

  // Fetch logo immediately for TMDB content
  useEffect(() => {
    if (metadata && !metadata.logo) {
      const fetchLogo = async () => {
        try {
          // First try to get logo from Metahub
          const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
          
          logger.log(`[MetadataScreen] Attempting to fetch logo from Metahub for ${imdbId}`);
          
          // Test if Metahub logo exists with a HEAD request
          try {
            const response = await fetch(metahubUrl, { method: 'HEAD' });
            if (response.ok) {
              logger.log(`[MetadataScreen] Successfully fetched logo from Metahub:
                - Content ID: ${id}
                - Content Type: ${type}
                - Logo URL: ${metahubUrl}
              `);
              
              // Update metadata with Metahub logo
              setMetadata(prevMetadata => ({
                ...prevMetadata!,
                logo: metahubUrl
              }));
              return; // Exit if Metahub logo was found
            }
          } catch (metahubError) {
            logger.warn(`[MetadataScreen] Failed to fetch logo from Metahub:`, metahubError);
          }

          // If Metahub fails, try TMDB as fallback
          if (id.startsWith('tmdb:')) {
            const tmdbId = id.split(':')[1];
            const tmdbType = type === 'series' ? 'tv' : 'movie';
            
            logger.log(`[MetadataScreen] Attempting to fetch logo from TMDB as fallback for ${tmdbType} (ID: ${tmdbId})`);
            
            const logoUrl = await TMDBService.getInstance().getContentLogo(tmdbType, tmdbId);
            
            if (logoUrl) {
              logger.log(`[MetadataScreen] Successfully fetched fallback logo from TMDB:
                - Content Type: ${tmdbType}
                - TMDB ID: ${tmdbId}
                - Logo URL: ${logoUrl}
              `);
              
              // Update metadata with TMDB logo
              setMetadata(prevMetadata => ({
                ...prevMetadata!,
                logo: logoUrl
              }));
            } else {
              logger.warn(`[MetadataScreen] No logo found from either Metahub or TMDB for ${type} (ID: ${id})`);
            }
          }
        } catch (error) {
          logger.error('[MetadataScreen] Failed to fetch logo from all sources:', {
            error,
            contentId: id,
            contentType: type
          });
        }
      };
      
      fetchLogo();
    } else if (metadata?.logo) {
      logger.log(`[MetadataScreen] Using existing logo from metadata:
        - Content ID: ${id}
        - Content Type: ${type}
        - Logo URL: ${metadata.logo}
      `);
    }
  }, [id, type, metadata, setMetadata, imdbId]);

  // Function to get episode details from episodeId
  const getEpisodeDetails = useCallback((episodeId: string): { seasonNumber: string; episodeNumber: string; episodeName: string } | null => {
    // Try to parse from format "seriesId:season:episode"
    const parts = episodeId.split(':');
    if (parts.length === 3) {
      const [, seasonNum, episodeNum] = parts;
      // Find episode in our local episodes array
      const episode = episodes.find(
        ep => ep.season_number === parseInt(seasonNum) && 
              ep.episode_number === parseInt(episodeNum)
      );
      
      if (episode) {
        return {
          seasonNumber: seasonNum,
          episodeNumber: episodeNum,
          episodeName: episode.name
        };
      }
    }

    // If not found by season/episode, try stremioId
    const episodeByStremioId = episodes.find(ep => ep.stremioId === episodeId);
    if (episodeByStremioId) {
      return {
        seasonNumber: episodeByStremioId.season_number.toString(),
        episodeNumber: episodeByStremioId.episode_number.toString(),
        episodeName: episodeByStremioId.name
      };
    }

    return null;
  }, [episodes]);

  const loadWatchProgress = useCallback(async () => {
    try {
      if (id && type) {
        if (type === 'series') {
          const allProgress = await storageService.getAllWatchProgress();
          
          // Function to get episode number from episodeId
          const getEpisodeNumber = (epId: string) => {
            const parts = epId.split(':');
            if (parts.length === 3) {
              return {
                season: parseInt(parts[1]),
                episode: parseInt(parts[2])
              };
            }
            return null;
          };

          // Get all episodes for this series with progress
          const seriesProgresses = Object.entries(allProgress)
            .filter(([key]) => key.includes(`${type}:${id}:`))
            .map(([key, value]) => ({
              episodeId: key.split(`${type}:${id}:`)[1],
              progress: value
            }))
            .filter(({ episodeId, progress }) => {
              const progressPercent = (progress.currentTime / progress.duration) * 100;
              return progressPercent > 0;
            });

          // If we have a specific episodeId in route params
          if (episodeId) {
            const progress = await storageService.getWatchProgress(id, type, episodeId);
            if (progress) {
              const progressPercent = (progress.currentTime / progress.duration) * 100;
              
              // If current episode is finished (≥95%), try to find next unwatched episode
              if (progressPercent >= 95) {
                const currentEpNum = getEpisodeNumber(episodeId);
                if (currentEpNum && episodes.length > 0) {
                  // Find the next episode
                  const nextEpisode = episodes.find(ep => {
                    // First check in same season
                    if (ep.season_number === currentEpNum.season && ep.episode_number > currentEpNum.episode) {
                      const epId = ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`;
                      const epProgress = seriesProgresses.find(p => p.episodeId === epId);
                      if (!epProgress) return true;
                      const percent = (epProgress.progress.currentTime / epProgress.progress.duration) * 100;
                      return percent < 95;
                    }
                    // Then check next seasons
                    if (ep.season_number > currentEpNum.season) {
                      const epId = ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`;
                      const epProgress = seriesProgresses.find(p => p.episodeId === epId);
                      if (!epProgress) return true;
                      const percent = (epProgress.progress.currentTime / epProgress.progress.duration) * 100;
                      return percent < 95;
                    }
                    return false;
                  });

                  if (nextEpisode) {
                    const nextEpisodeId = nextEpisode.stremioId || 
                      `${id}:${nextEpisode.season_number}:${nextEpisode.episode_number}`;
                    const nextProgress = await storageService.getWatchProgress(id, type, nextEpisodeId);
                    if (nextProgress) {
                      setWatchProgress({ ...nextProgress, episodeId: nextEpisodeId });
                    } else {
                      setWatchProgress({ currentTime: 0, duration: 0, lastUpdated: Date.now(), episodeId: nextEpisodeId });
                    }
                    return;
                  }
                }
                // If no next episode found or current episode is finished, show no progress
                setWatchProgress(null);
                return;
              }
              
              // If current episode is not finished, show its progress
              setWatchProgress({ ...progress, episodeId });
            } else {
              setWatchProgress(null);
            }
          } else {
            // Find the first unfinished episode
            const unfinishedEpisode = episodes.find(ep => {
              const epId = ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`;
              const progress = seriesProgresses.find(p => p.episodeId === epId);
              if (!progress) return true;
              const percent = (progress.progress.currentTime / progress.progress.duration) * 100;
              return percent < 95;
            });

            if (unfinishedEpisode) {
              const epId = unfinishedEpisode.stremioId || 
                `${id}:${unfinishedEpisode.season_number}:${unfinishedEpisode.episode_number}`;
              const progress = await storageService.getWatchProgress(id, type, epId);
              if (progress) {
                setWatchProgress({ ...progress, episodeId: epId });
              } else {
                setWatchProgress({ currentTime: 0, duration: 0, lastUpdated: Date.now(), episodeId: epId });
              }
            } else {
              setWatchProgress(null);
            }
          }
        } else {
          // For movies
          const progress = await storageService.getWatchProgress(id, type, episodeId);
          if (progress && progress.currentTime > 0) {
            const progressPercent = (progress.currentTime / progress.duration) * 100;
            if (progressPercent >= 95) {
              setWatchProgress(null);
            } else {
              setWatchProgress({ ...progress, episodeId });
            }
          } else {
            setWatchProgress(null);
          }
        }
      }
    } catch (error) {
      logger.error('[MetadataScreen] Error loading watch progress:', error);
      setWatchProgress(null);
    }
  }, [id, type, episodeId, episodes, getEpisodeDetails]);

  // Initial load
  useEffect(() => {
    loadWatchProgress();
  }, [loadWatchProgress]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadWatchProgress();
    }, [loadWatchProgress])
  );

  // Function to get play button text
  const getPlayButtonText = useCallback(() => {
    if (!watchProgress || watchProgress.currentTime <= 0) {
      return 'Play';
    }

    // Consider episode complete if progress is >= 95%
    const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
    if (progressPercent >= 95) {
      return 'Play';
    }

    return 'Resume';
  }, [watchProgress]);

  // Add effect to animate watch progress when it changes
  useEffect(() => {
    if (watchProgress && watchProgress.duration > 0) {
      watchProgressOpacity.value = withSpring(1, {
        mass: 0.2,
        stiffness: 100,
        damping: 14
      });
      watchProgressScaleY.value = withSpring(1, {
        mass: 0.3,
        stiffness: 120,
        damping: 18
      });
    } else {
      watchProgressOpacity.value = withSpring(0, {
        mass: 0.2,
        stiffness: 100,
        damping: 14
      });
      watchProgressScaleY.value = withSpring(0, {
        mass: 0.3,
        stiffness: 120,
        damping: 18
      });
    }
  }, [watchProgress, watchProgressOpacity, watchProgressScaleY]);

  // Add animated style for watch progress
  const watchProgressAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      watchProgressScaleY.value,
      [0, 1],
      [-8, 0],
      Extrapolate.CLAMP
    );

    return {
      opacity: watchProgressOpacity.value,
      transform: [
        { translateY: translateY },
        { scaleY: watchProgressScaleY.value }
      ]
    };
  });

  // Add animated style for logo
  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: logoOpacity.value,
      transform: [{ scale: logoScale.value }]
    };
  });

  // Effect to animate logo when it's available
  useEffect(() => {
    if (metadata?.logo) {
      logoOpacity.value = withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.ease)
      });
    } else {
      logoOpacity.value = withTiming(0, {
        duration: 200,
        easing: Easing.in(Easing.ease)
      });
    }
  }, [metadata?.logo, logoOpacity]);

  // Update the watch progress render function - Now uses WatchProgressDisplay component
  // const renderWatchProgress = () => { ... }; // Removed old inline function

  // Handler functions
  const handleShowStreams = useCallback(() => {
    if (type === 'series') {
      // If we have watch progress with an episodeId, use that
      if (watchProgress?.episodeId) {
        navigation.navigate('Streams', { 
          id, 
          type, 
          episodeId: watchProgress.episodeId 
        });
        return;
      }
      
      // If we have a specific episodeId from route params, use that
      if (episodeId) {
        navigation.navigate('Streams', { id, type, episodeId });
        return;
      }
      
      // Otherwise, if we have episodes, start with the first one
      if (episodes.length > 0) {
        const firstEpisode = episodes[0];
        const newEpisodeId = firstEpisode.stremioId || `${id}:${firstEpisode.season_number}:${firstEpisode.episode_number}`;
        navigation.navigate('Streams', { id, type, episodeId: newEpisodeId });
        return;
      }
    }
    
    navigation.navigate('Streams', { id, type, episodeId });
  }, [navigation, id, type, episodes, episodeId, watchProgress]);

  const handleSelectCastMember = useCallback((castMember: any) => {
    // Potentially navigate to a cast member screen or show details
    logger.log('Cast member selected:', castMember); 
  }, []); // Empty dependency array as it doesn't depend on component state/props currently

  const handleEpisodeSelect = useCallback((episode: Episode) => {
    // Removed haptic feedback
    
    const episodeId = episode.stremioId || `${id}:${episode.season_number}:${episode.episode_number}`;
    navigation.navigate('Streams', {
      id,
      type,
      episodeId
    });
  }, [navigation, id, type]);

  // Animated styles
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ scale: screenScale.value }],
    opacity: screenOpacity.value
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
    opacity: interpolate(
      contentTranslateY.value,
      [60, 0],
      [0, 1],
      Extrapolate.CLAMP
    )
  }));

  // Add animated style for genres
  const genresAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: genresOpacity.value,
      transform: [{ translateY: genresTranslateY.value }]
    };
  });

  // Add animated style for buttons
  const buttonsAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: buttonsOpacity.value,
      transform: [{ translateY: buttonsTranslateY.value }]
    };
  });

  // Debug logs for director/creator data
  React.useEffect(() => {
    if (metadata && metadata.id) {
      const fetchCrewData = async () => {
        try {
          const tmdb = TMDBService.getInstance();
          const tmdbId = await tmdb.extractTMDBIdFromStremioId(id);
          
          if (tmdbId) {
            const credits = await tmdb.getCredits(tmdbId, type);
            // logger.log("Credits data structure:", JSON.stringify(credits).substring(0, 300));
            
            // Extract directors for movies
            if (type === 'movie' && credits.crew) {
              const directors = credits.crew
                .filter((person: { job: string }) => person.job === 'Director')
                .map((director: { name: string }) => director.name);
                
              if (directors.length > 0 && metadata) {
                // Update metadata with directors
                setMetadata({
                  ...metadata,
                  directors
                });
                // logger.log("Updated directors:", directors);
              }
            }
            
            // Extract creators for TV shows
            if (type === 'series' && credits.crew) {
              const creators = credits.crew
                .filter((person: { job?: string; department?: string }) => 
                  person.job === 'Creator' || 
                  person.job === 'Series Creator' ||
                  person.department === 'Production' || 
                  person.job === 'Executive Producer'
                )
                .map((creator: { name: string }) => creator.name);
                
              if (creators.length > 0 && metadata) {
                // Update metadata with creators
                setMetadata({
                  ...metadata,
                  creators: creators.slice(0, 3) // Limit to first 3 creators
                });
                // logger.log("Updated creators:", creators.slice(0, 3));
              }
            }
          }
        } catch (error) {
          logger.error('Error fetching crew data:', error);
        }
      };
      
      fetchCrewData();
    }
  }, [metadata?.id, id, type, setMetadata]);

  // Start entrance animation
  React.useEffect(() => {
    // Use a timeout to ensure the animations starts after the component is mounted
    const animationTimeout = setTimeout(() => {
      // 1. First animate the container
      screenScale.value = withSpring(1, springConfig);
      screenOpacity.value = withSpring(1, springConfig);
      
      // 2. Then animate the hero section with a slight delay
      setTimeout(() => {
        heroOpacity.value = withSpring(1, {
          damping: 14,
          stiffness: 80
        });
        heroScale.value = withSpring(1, {
          damping: 18,
          stiffness: 100
        });
      }, ANIMATION_DELAY_CONSTANTS.HERO);
      
      // 3. Then animate the logo
      setTimeout(() => {
        logoOpacity.value = withSpring(1, {
          damping: 12,
          stiffness: 100
        });
        logoScale.value = withSpring(1, {
          damping: 14,
          stiffness: 90
        });
      }, ANIMATION_DELAY_CONSTANTS.LOGO);
      
      // 4. Then animate the watch progress if applicable
      setTimeout(() => {
        if (watchProgress && watchProgress.duration > 0) {
          watchProgressOpacity.value = withSpring(1, {
            damping: 14,
            stiffness: 100
          });
          watchProgressScaleY.value = withSpring(1, {
            damping: 18,
            stiffness: 120
          });
        }
      }, ANIMATION_DELAY_CONSTANTS.PROGRESS);
      
      // 5. Then animate the genres
      setTimeout(() => {
        genresOpacity.value = withSpring(1, {
          damping: 14,
          stiffness: 100
        });
        genresTranslateY.value = withSpring(0, {
          damping: 18,
          stiffness: 120
        });
      }, ANIMATION_DELAY_CONSTANTS.GENRES);
      
      // 6. Then animate the buttons
      setTimeout(() => {
        buttonsOpacity.value = withSpring(1, {
          damping: 14,
          stiffness: 100
        });
        buttonsTranslateY.value = withSpring(0, {
          damping: 18,
          stiffness: 120
        });
      }, ANIMATION_DELAY_CONSTANTS.BUTTONS);
      
      // 7. Finally animate the content section
      setTimeout(() => {
        contentTranslateY.value = withSpring(0, {
          damping: 25,
          mass: 1,
          stiffness: 100
        });
      }, ANIMATION_DELAY_CONSTANTS.CONTENT);
    }, 50); // Small timeout to ensure component is fully mounted
    
    return () => clearTimeout(animationTimeout);
  }, []);

  const handleBack = useCallback(() => {
    // Use goBack() which will return to the previous screen in the navigation stack
    // This will work for both cases:
    // 1. Coming from Calendar/ThisWeek - goes back to them
    // 2. Coming from StreamsScreen - goes back to Calendar/ThisWeek
    navigation.goBack();
  }, [navigation]);

  // Function to render genres (updated to handle string array and use useMemo)
  const renderGenres = useMemo(() => {
    if (!metadata?.genres || !Array.isArray(metadata.genres) || metadata.genres.length === 0) {
      return null;
    }

    // Since metadata.genres is string[], we display them directly
    const genresToDisplay: string[] = metadata.genres as string[];

    return genresToDisplay.slice(0, 4).map((genreName, index, array) => (
      // Use React.Fragment to avoid extra View wrappers
      <React.Fragment key={index}>
        <Text style={styles.genreText}>{genreName}</Text>
        {/* Add dot separator */}
        {index < array.length - 1 && (
          <Text style={styles.genreDot}>•</Text>
        )}
      </React.Fragment>
    ));
  }, [metadata?.genres]); // Dependency on metadata.genres

  // Update the heroAnimatedStyle for parallax effect
  const heroAnimatedStyle = useAnimatedStyle(() => ({
    width: '100%',
    height: heroHeight.value,
    backgroundColor: colors.black,
    transform: [{ scale: heroScale.value }],
    opacity: heroOpacity.value,
  }));
  
  // Replace direct onScroll with useAnimatedScrollHandler
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const rawScrollY = event.contentOffset.y;
      scrollY.value = rawScrollY;
      
      // Apply spring-like damping for smoother transitions
      dampedScrollY.value = withTiming(rawScrollY, {
        duration: 300,
        easing: Easing.bezier(0.16, 1, 0.3, 1), // Custom spring-like curve
      });

      // Update header opacity based on scroll position
      const headerThreshold = height * 0.5 - safeAreaTop - 70; // Hero height - inset - buffer
      if (rawScrollY > headerThreshold) {
        headerOpacity.value = withTiming(1, { duration: 200 });
        headerElementsY.value = withTiming(0, { duration: 300 });
        headerElementsOpacity.value = withTiming(1, { duration: 450 });
      } else {
        headerOpacity.value = withTiming(0, { duration: 150 });
        headerElementsY.value = withTiming(-10, { duration: 200 });
        headerElementsOpacity.value = withTiming(0, { duration: 200 });
      }
    },
  });

  // Add a new animated style for the parallax image
  const parallaxImageStyle = useAnimatedStyle(() => {
    // Use dampedScrollY instead of direct scrollY for smoother effect
    return {
      width: '100%',
      height: '120%', // Increase height for more movement range
      top: '-10%', // Start image slightly higher to allow more upward movement
      transform: [
        { 
          translateY: interpolate(
            dampedScrollY.value,
            [0, 100, 300],
            [20, -20, -60],  // Start with a lower position, then move up
            Extrapolate.CLAMP
          )
        },
        { 
          scale: interpolate(
            dampedScrollY.value,
            [0, 150, 300],
            [1.1, 1.02, 0.95],  // More dramatic scale changes
            Extrapolate.CLAMP
          )
        }
      ],
    };
  });

  // Add animated style for floating header
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [
      { translateY: interpolate(headerOpacity.value, [0, 1], [-20, 0], Extrapolate.CLAMP) }
    ]
  }));
  
  // Add animated style for header elements
  const headerElementsStyle = useAnimatedStyle(() => ({
    opacity: headerElementsOpacity.value,
    transform: [{ translateY: headerElementsY.value }]
  }));

  if (loading) {
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.darkBackground }]}
        edges={['bottom']}
      >
        <StatusBar
          translucent={true}
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.lightGray }]}>
            Loading content...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (metadataError || !metadata) {
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.darkBackground }]}
        edges={['bottom']}
      >
        <StatusBar
          translucent={true}
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <View style={styles.errorContainer}>
          <MaterialIcons 
            name="error-outline" 
            size={64} 
            color={colors.textMuted} 
          />
          <Text style={[styles.errorText, { color: colors.text }]}>
            {metadataError || 'Content not found'}
          </Text>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: colors.primary }
            ]}
            onPress={loadMetadata}
          >
            <MaterialIcons 
              name="refresh" 
              size={20} 
              color={colors.white}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.backButton,
              { borderColor: colors.primary }
            ]}
            onPress={handleBack}
          >
            <Text style={[styles.backButtonText, { color: colors.primary }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.darkBackground }]}
      edges={['bottom']}
    >
      <StatusBar
        translucent={true}
        backgroundColor="transparent"
        barStyle="light-content"
        animated={true}
      />
      <Animated.View style={containerAnimatedStyle}>
        {/* Floating Header */}
        <Animated.View style={[styles.floatingHeader, headerAnimatedStyle]}>
          {Platform.OS === 'ios' ? (
            <ExpoBlurView
              intensity={50}
              tint="dark"
              style={[styles.blurContainer, { paddingTop: Math.max(safeAreaTop * 0.8, safeAreaTop - 6) }]}
            >
              <Animated.View style={[styles.floatingHeaderContent, headerElementsStyle]}>
                <TouchableOpacity 
                  style={styles.backButton} 
                  onPress={handleBack}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons name="arrow-back" size={24} color={colors.highEmphasis} />
                </TouchableOpacity>
                
                <View style={styles.headerTitleContainer}>
                  {metadata.logo ? (
                    <Image
                      source={{ uri: metadata.logo }}
                      style={styles.floatingHeaderLogo}
                      contentFit="contain"
                      transition={150}
                    />
                  ) : (
                    <Text style={styles.floatingHeaderTitle} numberOfLines={1}>{metadata.name}</Text>
                  )}
                </View>
                
                <TouchableOpacity 
                  style={styles.headerActionButton}
                  onPress={handleToggleLibrary}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons 
                    name={inLibrary ? 'bookmark' : 'bookmark-border'} 
                    size={22} 
                    color={colors.highEmphasis} 
                  />
                </TouchableOpacity>
              </Animated.View>
            </ExpoBlurView>
          ) : (
            <View style={[styles.blurContainer, { paddingTop: Math.max(safeAreaTop * 0.8, safeAreaTop - 6) }]}>
              <CommunityBlurView
                style={styles.absoluteFill}
                blurType="dark"
                blurAmount={15}
                reducedTransparencyFallbackColor="rgba(20, 20, 20, 0.9)"
              />
              <Animated.View style={[styles.floatingHeaderContent, headerElementsStyle]}>
                <TouchableOpacity 
                  style={styles.backButton} 
                  onPress={handleBack}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons name="arrow-back" size={24} color={colors.highEmphasis} />
                </TouchableOpacity>
                
                <View style={styles.headerTitleContainer}>
                  {metadata.logo ? (
                    <Image
                      source={{ uri: metadata.logo }}
                      style={styles.floatingHeaderLogo}
                      contentFit="contain"
                      transition={150}
                    />
                  ) : (
                    <Text style={styles.floatingHeaderTitle} numberOfLines={1}>{metadata.name}</Text>
                  )}
                </View>
                
                <TouchableOpacity 
                  style={styles.headerActionButton}
                  onPress={handleToggleLibrary}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons 
                    name={inLibrary ? 'bookmark' : 'bookmark-border'} 
                    size={22} 
                    color={colors.highEmphasis} 
                  />
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
          {Platform.OS === 'ios' && <View style={styles.headerBottomBorder} />}
        </Animated.View>

        <Animated.ScrollView
          ref={contentRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16} // Back to standard value
        >
          {/* Hero Section */}
          <Animated.View style={heroAnimatedStyle}>
            <View style={styles.heroSection}>
              {/* Use Animated.Image directly instead of ImageBackground with imageStyle */}
              <Animated.Image 
                source={{ uri: metadata.banner || metadata.poster }}
                style={[styles.absoluteFill, parallaxImageStyle]}
                resizeMode="cover"
              />
              <LinearGradient
                colors={[
                  `${colors.darkBackground}00`,
                  `${colors.darkBackground}20`,
                  `${colors.darkBackground}50`,
                  `${colors.darkBackground}C0`,
                  `${colors.darkBackground}F8`,
                  colors.darkBackground
                ]}
                locations={[0, 0.4, 0.65, 0.8, 0.9, 1]}
                style={styles.heroGradient}
              >
                <View style={styles.heroContent}>
                  {/* Title */}
                  <View style={styles.logoContainer}>
                    <Animated.View style={[styles.titleLogoContainer, logoAnimatedStyle]}>
                      {metadata.logo ? (
                        <Image
                          source={{ uri: metadata.logo }}
                          style={styles.titleLogo}
                          contentFit="contain"
                          transition={300}
                        />
                      ) : (
                        <Text style={styles.heroTitle}>{metadata.name}</Text>
                      )}
                    </Animated.View>
                  </View>

                  {/* Watch Progress */}
                  <WatchProgressDisplay 
                    watchProgress={watchProgress}
                    type={type as 'movie' | 'series'}
                    getEpisodeDetails={getEpisodeDetails}
                    animatedStyle={watchProgressAnimatedStyle}
                  />

                  {/* Genre Tags */}
                  <Animated.View style={genresAnimatedStyle}>
                    <View style={styles.genreContainer}>
                      {renderGenres}
                    </View>
                  </Animated.View>

                  {/* Action Buttons */}
                  <ActionButtons 
                    handleShowStreams={handleShowStreams}
                    toggleLibrary={handleToggleLibrary}
                    inLibrary={inLibrary}
                    type={type as 'movie' | 'series'}
                    id={id}
                    navigation={navigation}
                    playButtonText={getPlayButtonText()}
                    animatedStyle={buttonsAnimatedStyle}
                  />
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Main Content */}
          <Animated.View style={contentAnimatedStyle}>
            {/* Meta Info */}
            <View style={styles.metaInfo}>
              {metadata.year && (
                <Text style={styles.metaText}>{metadata.year}</Text>
              )}
              {metadata.runtime && (
                <Text style={styles.metaText}>{metadata.runtime}</Text>
              )}
              {metadata.certification && (
                <Text style={styles.metaText}>{metadata.certification}</Text>
              )}
              {metadata.imdbRating && (
                <View style={styles.ratingContainer}>
                  <Image 
                    source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/575px-IMDB_Logo_2016.svg.png' }}
                    style={styles.imdbLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.ratingText}>{metadata.imdbRating}</Text>
                </View>
              )}
            </View>

            {/* Add RatingsSection right under the main metadata */}
            {imdbId && (
              <RatingsSection 
                imdbId={imdbId}
                type={type === 'series' ? 'show' : 'movie'} 
              />
            )}

            {/* Creator/Director Info */}
            <Animated.View
              entering={FadeIn.duration(500).delay(200)}
              style={styles.creatorContainer}
            >
              {metadata.directors && metadata.directors.length > 0 && (
                <View style={styles.creatorSection}>
                  <Text style={styles.creatorLabel}>Director{metadata.directors.length > 1 ? 's' : ''}:</Text>
                  <Text style={styles.creatorText}>{metadata.directors.join(', ')}</Text>
                </View>
              )}
              {metadata.creators && metadata.creators.length > 0 && (
                <View style={styles.creatorSection}>
                  <Text style={styles.creatorLabel}>Creator{metadata.creators.length > 1 ? 's' : ''}:</Text>
                  <Text style={styles.creatorText}>{metadata.creators.join(', ')}</Text>
                </View>
              )}
            </Animated.View>

            {/* Description */}
            {metadata.description && (
              <Animated.View 
                style={styles.descriptionContainer}
                layout={Layout.duration(300).easing(Easing.inOut(Easing.ease))}
              >
                <TouchableOpacity 
                  onPress={() => setIsFullDescriptionOpen(!isFullDescriptionOpen)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.description} numberOfLines={isFullDescriptionOpen ? undefined : 3}>
                    {metadata.description}
                  </Text>
                  <View style={styles.showMoreButton}>
                    <Text style={styles.showMoreText}>
                      {isFullDescriptionOpen ? 'Show Less' : 'Show More'}
                    </Text>
                    <MaterialIcons 
                      name={isFullDescriptionOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                      size={18} 
                      color={colors.textMuted} 
                    />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Cast Section */}
            <CastSection
              cast={cast}
              loadingCast={loadingCast}
              onSelectCastMember={handleSelectCastMember}
            />

            {/* More Like This Section - Only for movies */}
            {type === 'movie' && (
              <MoreLikeThisSection 
                recommendations={recommendations}
                loadingRecommendations={loadingRecommendations}
              />
            )}

            {/* Type-specific content */}
            {type === 'series' ? (
              <SeriesContent
                episodes={episodes}
                selectedSeason={selectedSeason}
                loadingSeasons={loadingSeasons}
                onSeasonChange={handleSeasonChangeWithHaptics}
                onSelectEpisode={handleEpisodeSelect}
                groupedEpisodes={groupedEpisodes}
                metadata={metadata}
              />
            ) : (
              <MovieContent metadata={metadata} />
            )}
          </Animated.View>
        </Animated.ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 0,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 24,
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
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  heroSection: {
    width: '100%',
    height: height * 0.5,
    backgroundColor: colors.black,
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
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  genreDot: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 4,
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
    color: colors.highEmphasis,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metaText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imdbLogo: {
    width: 35,
    height: 18,
    marginRight: 4,
  },
  ratingText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  descriptionContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  description: {
    color: colors.mediumEmphasis,
    fontSize: 15,
    lineHeight: 24,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  showMoreText: {
    color: colors.textMuted,
    fontSize: 14,
    marginRight: 4,
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
    backgroundColor: colors.white,
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
  creatorContainer: {
    marginBottom: 2,
    paddingHorizontal: 16,
  },
  creatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    height: 20
  },
  creatorLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
    lineHeight: 20
  },
  creatorText: {
    color: colors.lightGray,
    fontSize: 14,
    flex: 1,
    lineHeight: 20
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
    backgroundColor: colors.primary,
    borderRadius: 1.5,
  },
  watchProgressText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.9,
    letterSpacing: 0.2
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
    elevation: 4, // for Android shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  blurContainer: {
    width: '100%',
  },
  floatingHeaderContent: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerBottomBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  headerRightPlaceholder: {
    width: 40, // same width as back button for symmetry
  },
  headerActionButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  floatingHeaderLogo: {
    height: 42,
    width: width * 0.6,
    maxWidth: 240,
  },
  floatingHeaderTitle: {
    color: colors.highEmphasis,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default MetadataScreen;