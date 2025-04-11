import React, { useState, useRef, useCallback } from 'react';
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
import { useRoute, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { colors } from '../styles/colors';
import { useMetadata } from '../hooks/useMetadata';
import { CastSection } from '../components/metadata/CastSection';
import { SeriesContent } from '../components/metadata/SeriesContent';
import { MovieContent } from '../components/metadata/MovieContent';
import { MoreLikeThisSection } from '../components/metadata/MoreLikeThisSection';
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

const { width, height } = Dimensions.get('window');

// Animation configs
const springConfig = {
  damping: 15,
  mass: 1,
  stiffness: 100
};

const MetadataScreen = () => {
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { id, type } = route.params;

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

  const [showFullDescription, setShowFullDescription] = useState(false);
  const contentRef = useRef<ScrollView>(null);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [isFullDescriptionOpen, setIsFullDescriptionOpen] = useState(false);
  const fullDescriptionAnimation = useSharedValue(0);
  const [textTruncated, setTextTruncated] = useState(false);

  // Animation values
  const screenScale = useSharedValue(0.8);
  const screenOpacity = useSharedValue(0);
  const heroHeight = useSharedValue(height * 0.75);
  const contentTranslateY = useSharedValue(50);

  // Handler functions
  const handleShowStreams = useCallback(() => {
    if (type === 'series' && episodes.length > 0) {
      const firstEpisode = episodes[0];
      const episodeId = firstEpisode.stremioId || `${id}:${firstEpisode.season_number}:${firstEpisode.episode_number}`;
      navigation.navigate('Streams', {
        id,
        type,
        episodeId
      });
    } else {
      navigation.navigate('Streams', {
        id,
        type
      });
    }
  }, [navigation, id, type, episodes]);

  const handleSelectCastMember = (castMember: any) => {
    // TODO: Implement cast member selection
    console.log('Cast member selected:', castMember);
  };

  const handleEpisodeSelect = (episode: Episode) => {
    const episodeId = episode.stremioId || `${id}:${episode.season_number}:${episode.episode_number}`;
    navigation.navigate('Streams', {
      id,
      type,
      episodeId
    });
  };

  const handleOpenFullDescription = useCallback(() => {
    setIsFullDescriptionOpen(true);
    fullDescriptionAnimation.value = withTiming(1, {
      duration: 300,
      easing: Easing.bezier(0.33, 0.01, 0, 1),
    });
  }, []);

  const handleCloseFullDescription = useCallback(() => {
    fullDescriptionAnimation.value = withTiming(0, {
      duration: 250,
      easing: Easing.bezier(0.33, 0.01, 0, 1),
    }, () => {
      runOnJS(setIsFullDescriptionOpen)(false);
    });
  }, []);

  const fullDescriptionStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.darkBackground,
      opacity: fullDescriptionAnimation.value,
      transform: [
        {
          translateY: interpolate(
            fullDescriptionAnimation.value,
            [0, 1],
            [height, 0],
            Extrapolate.CLAMP
          ),
        },
      ],
    };
  });

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
            console.log("Credits data structure:", JSON.stringify(credits).substring(0, 300));
            
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
                console.log("Updated directors:", directors);
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
                console.log("Updated creators:", creators.slice(0, 3));
              }
            }
          }
        } catch (error) {
          console.error('Error fetching crew data:', error);
        }
      };
      
      fetchCrewData();
    }
  }, [metadata?.id, id, type, setMetadata]);

  // Start entrance animation
  React.useEffect(() => {
    screenScale.value = withSpring(1, springConfig);
    screenOpacity.value = withSpring(1, springConfig);
    heroHeight.value = withSpring(height * 0.75, springConfig);
    contentTranslateY.value = withSpring(0, springConfig);
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
      />
      <Animated.View style={containerAnimatedStyle}>
        <ScrollView
          ref={contentRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            setLastScrollTop(e.nativeEvent.contentOffset.y);
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
                  `${colors.darkBackground}15`,
                  `${colors.darkBackground}40`,
                  `${colors.darkBackground}B3`,
                  `${colors.darkBackground}E6`,
                  colors.darkBackground
                ]}
                locations={[0, 0.3, 0.5, 0.7, 0.85, 1]}
                style={styles.heroGradient}
              >
                <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.heroContent}>
                  {/* Title */}
                  {metadata.logo ? (
                    <Image
                      source={{ uri: metadata.logo }}
                      style={styles.titleLogo}
                      contentFit="contain"
                    />
                  ) : (
                    <Text style={styles.titleText}>{metadata.name}</Text>
                  )}

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
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.playButton]}
                      onPress={handleShowStreams}
                    >
                      <MaterialIcons name="play-arrow" size={24} color="#000" />
                      <Text style={styles.playButtonText}>Play</Text>
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
                            // TODO: Show error toast
                            console.error('Could not find TMDB ID for show');
                          }
                        }}
                      >
                        <MaterialIcons name="star-rate" size={24} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              </LinearGradient>
            </ImageBackground>
          </Animated.View>

          {/* Main Content */}
          <Animated.View style={contentAnimatedStyle}>
            {/* Meta Info */}
            <View style={styles.metaInfo}>
              {metadata.year && (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{metadata.year}</Text>
                </View>
              )}
              {metadata.runtime && (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{metadata.runtime}</Text>
                </View>
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
            {((metadata.directors && metadata.directors.length > 0) || (metadata.creators && metadata.creators.length > 0)) && (
              <View style={styles.creatorContainer}>
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
              </View>
            )}

            {/* Description */}
            {metadata.description && (
              <View style={styles.descriptionContainer}>
                <Text
                  style={styles.description}
                  numberOfLines={showFullDescription ? undefined : 3}
                  onTextLayout={({ nativeEvent: { lines } }) => {
                    if (!showFullDescription) {
                      setTextTruncated(lines.length > 3);
                    }
                  }}
                >
                  {`${metadata.description}`}
                </Text>
                {textTruncated && (
                  <TouchableOpacity
                    onPress={() => setShowFullDescription(!showFullDescription)}
                    style={styles.showMoreButton}
                  >
                    <Text style={styles.showMoreText}>
                      {showFullDescription ? 'See less' : 'See more'}
                    </Text>
                    <MaterialIcons
                      name={showFullDescription ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                      size={20}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                )}
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

        {/* Full Description Modal */}
        {isFullDescriptionOpen && (
          <Animated.View style={fullDescriptionStyle}>
            <SafeAreaView style={styles.fullDescriptionContainer}>
              <View style={styles.fullDescriptionHeader}>
                <TouchableOpacity
                  onPress={handleCloseFullDescription}
                  style={styles.fullDescriptionCloseButton}
                >
                  <MaterialIcons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.fullDescriptionTitle}>About</Text>
              </View>
              <ScrollView
                style={styles.fullDescriptionContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.fullDescriptionText}>
                  {metadata?.description}
                </Text>
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight || 0,
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
    height: height * 0.75,
    backgroundColor: colors.black,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '105%',
    top: '-2.5%',
    transform: [{ scale: 1 }],
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  heroContent: {
    padding: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
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
    height: 90,
    marginBottom: 0,
    alignSelf: 'center',
  },
  titleText: {
    color: colors.highEmphasis,
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  metaChip: {
    backgroundColor: colors.elevation3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  metaChipText: {
    color: colors.highEmphasis,
    fontSize: 12,
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevation3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  imdbLogo: {
    width: 40,
    height: 20,
    marginRight: 6,
  },
  ratingText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  descriptionContainer: {
    marginBottom: 28,
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
    gap: 12,
    alignItems: 'center',
    marginBottom: -16,
    justifyContent: 'center',
    width: '100%',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
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
    marginBottom: 8,
  },
  creatorLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  creatorText: {
    color: colors.lightGray,
    fontSize: 14,
    flex: 1,
  },
});

export default MetadataScreen;