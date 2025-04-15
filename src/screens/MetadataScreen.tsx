import React, { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { colors } from '../styles/colors';
import { useMetadata } from '../hooks/useMetadata';
import { CastSection } from '../components/metadata/CastSection';
import { SeriesContent } from '../components/metadata/SeriesContent';
import { MovieContent } from '../components/metadata/MovieContent';
import { MoreLikeThisSection } from '../components/metadata/MoreLikeThisSection';
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
} from 'react-native-reanimated';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { TMDBService } from '../services/tmdbService';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';

const { width, height } = Dimensions.get('window');

// Animation configs
const springConfig = {
  damping: 20,
  mass: 1,
  stiffness: 100
};

// Add debug log for storageService
logger.log('[MetadataScreen] StorageService instance:', storageService);

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
  } = useMetadata({ id, type });

  const contentRef = useRef<ScrollView>(null);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [isFullDescriptionOpen, setIsFullDescriptionOpen] = useState(false);

  // Animation values
  const screenScale = useSharedValue(0.8);
  const screenOpacity = useSharedValue(0);
  const heroHeight = useSharedValue(height * 0.5);
  const contentTranslateY = useSharedValue(50);

  // Add state for watch progress
  const [watchProgress, setWatchProgress] = useState<{
    currentTime: number;
    duration: number;
    lastUpdated: number;
    episodeId?: string;
  } | null>(null);

  // Add new animated value for watch progress
  const watchProgressOpacity = useSharedValue(0);
  const watchProgressScaleY = useSharedValue(0);

  // Add new animated value for logo scale
  const logoScale = useSharedValue(0);

  // Add new animated value for creator fade-in
  const creatorOpacity = useSharedValue(0);

  // Debug log for route params
  // logger.log('[MetadataScreen] Component mounted with route params:', { id, type, episodeId });

  // Function to get episode details from episodeId
  const getEpisodeDetails = useCallback((episodeId: string) => {
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
  }, [id, type, episodeId, episodes]);

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
  }, [watchProgress]);

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
      transform: [{ scale: logoScale.value }],
    };
  });

  // Effect to animate logo scale when logo URI is available
  useEffect(() => {
    if (metadata?.logo) {
      logoScale.value = withSpring(1, {
        damping: 18,
        stiffness: 120,
        mass: 0.5
      });
    } else {
      // Optional: Reset scale if logo disappears?
      // logoScale.value = withTiming(0, { duration: 100 });
    }
  }, [metadata?.logo]);

  // Add animated style for creator fade-in
  const creatorFadeInStyle = useAnimatedStyle(() => {
    return {
      opacity: creatorOpacity.value,
    };
  });

  // Effect to fade in creator section when data is available
  useEffect(() => {
    const hasCreators = metadata?.directors?.length || metadata?.creators?.length;
    creatorOpacity.value = withTiming(hasCreators ? 1 : 0, { 
      duration: 300, // Adjust duration as needed
      easing: Easing.out(Easing.quad), // Use an easing function
    });
  }, [metadata?.directors, metadata?.creators]);

  // Update the watch progress render function
  const renderWatchProgress = () => {
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
      <Animated.View style={[styles.watchProgressContainer, watchProgressAnimatedStyle]}>
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
  };

  // Update the action buttons section
  const ActionButtons = () => (
    <View style={styles.actionButtons}>
      <TouchableOpacity
        style={[styles.actionButton, styles.playButton]}
        onPress={handleShowStreams}
      >
        <MaterialIcons 
          name={watchProgress && watchProgress.currentTime > 0 ? "play-circle-outline" : "play-arrow"} 
          size={24} 
          color="#000" 
        />
        <Text style={styles.playButtonText}>
          {getPlayButtonText()}
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
          <MaterialIcons name="star-rate" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );

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

  const handleSelectCastMember = (castMember: any) => {
    logger.log('Cast member selected:', castMember);
  };

  const handleEpisodeSelect = (episode: Episode) => {
    const episodeId = episode.stremioId || `${id}:${episode.season_number}:${episode.episode_number}`;
    navigation.navigate('Streams', {
      id,
      type,
      episodeId
    });
  };

  // Animated styles
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ scale: screenScale.value }],
    opacity: screenOpacity.value
  }));

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    width: '100%',
    height: heroHeight.value,
    backgroundColor: colors.black
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
    opacity: interpolate(
      contentTranslateY.value,
      [50, 0],
      [0, 1],
      Extrapolate.CLAMP
    )
  }));

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
    screenScale.value = withSpring(1, springConfig);
    screenOpacity.value = withSpring(1, springConfig);
    contentTranslateY.value = withSpring(0, {
      damping: 25,
      mass: 1,
      stiffness: 100
    });
  }, []);

  const handleBack = useCallback(() => {
    // Use goBack() which will return to the previous screen in the navigation stack
    // This will work for both cases:
    // 1. Coming from Calendar/ThisWeek - goes back to them
    // 2. Coming from StreamsScreen - goes back to Calendar/ThisWeek
    navigation.goBack();
  }, [navigation]);

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
        <ScrollView
          ref={contentRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            // setLastScrollTop(e.nativeEvent.contentOffset.y); // Remove unused onScroll handler logic
          }}
          scrollEventThrottle={16}
        >
          {/* Hero Section */}
          <Animated.View style={heroAnimatedStyle}>
            <ImageBackground
              source={{ uri: metadata.banner || metadata.poster }}
              style={styles.heroSection}
              imageStyle={styles.heroImage}
              resizeMode="cover"
            >
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
                <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.heroContent}>
                  {/* Title */}
                  {metadata.logo ? (
                    <Animated.View style={logoAnimatedStyle}>
                      <Image
                        source={{ uri: metadata.logo }}
                        style={styles.titleLogo}
                        contentFit="contain"
                      />
                    </Animated.View>
                  ) : (
                    <Text style={styles.titleText}>{metadata.name}</Text>
                  )}

                  {/* Watch Progress */}
                  {renderWatchProgress()}

                  {/* Genre Tags */}
                  {metadata.genres && metadata.genres.length > 0 && (
                    <View style={styles.genreContainer}>
                      {metadata.genres.slice(0, 3).map((genre, index, array) => (
                        <React.Fragment key={index}>
                          <Text style={styles.genreText}>{genre}</Text>
                          {index < array.length - 1 && (
                            <Text style={styles.genreDot}>•</Text>
                          )}
                        </React.Fragment>
                      ))}
                    </View>
                  )}

                  {/* Action Buttons */}
                  <ActionButtons />
                </Animated.View>
              </LinearGradient>
            </ImageBackground>
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

            {/* Creator/Director Info */}
            <Animated.View
              style={[
                styles.creatorContainer,
                creatorFadeInStyle,
              ]}
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
              <View style={styles.descriptionContainer}>
                  <Text style={styles.description}>
                    {`${metadata.description}`}
                  </Text>
              </View>
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
                onSeasonChange={handleSeasonChange}
                onSelectEpisode={handleEpisodeSelect}
                groupedEpisodes={groupedEpisodes}
                metadata={metadata}
              />
            ) : (
              <MovieContent metadata={metadata} />
            )}
          </Animated.View>
        </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
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
  heroImage: {
    width: '100%',
    height: '100%',
    top: '0%',
    transform: [{ scale: 1 }],
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    width: '100%',
  },
  genreText: {
    color: colors.highEmphasis,
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.8,
  },
  genreDot: {
    color: colors.highEmphasis,
    fontSize: 14,
    marginHorizontal: 8,
    opacity: 0.6,
  },
  titleLogo: {
    width: width * 0.65,
    height: 70,
    marginBottom: 0,
    alignSelf: 'center',
  },
  titleText: {
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
    marginTop: 10,
    backgroundColor: colors.elevation1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  showMoreText: {
    color: colors.highEmphasis,
    fontSize: 14,
    marginRight: 4,
    fontWeight: '500',
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
  fullDescriptionContainer: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  fullDescriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.elevation1,
    position: 'relative',
  },
  fullDescriptionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  fullDescriptionCloseButton: {
    position: 'absolute',
    left: 16,
    padding: 8,
  },
  fullDescriptionContent: {
    flex: 1,
    padding: 24,
  },
  fullDescriptionText: {
    color: colors.text,
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
});

export default MetadataScreen;