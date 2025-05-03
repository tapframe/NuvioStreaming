import React, { useState, useEffect, useRef, useCallback, memo, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { TMDBService, TMDBShow as Show, TMDBSeason, TMDBEpisode } from '../services/tmdbService';
import { RouteProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import axios from 'axios';
import Animated, { FadeIn, SlideInRight, withTiming, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { logger } from '../utils/logger';

type RootStackParamList = {
  ShowRatings: { showId: number };
};

type ShowRatingsRouteProp = RouteProp<RootStackParamList, 'ShowRatings'>;

type RatingSource = 'tmdb' | 'imdb' | 'tvmaze';

interface TVMazeEpisode {
  id: number;
  rating: {
    average: number | null;
  };
  season: number;
  number: number;
}

interface TVMazeShow {
  id: number;
  externals: {
    imdb: string | null;
    thetvdb: number | null;
  };
  _embedded?: {
    episodes: TVMazeEpisode[];
  };
}

interface Props {
  route: ShowRatingsRouteProp;
}

const getRatingColor = (rating: number): string => {
  if (rating >= 9.0) return '#186A3B'; // Awesome
  if (rating >= 8.5) return '#28B463'; // Great
  if (rating >= 8.0) return '#28B463'; // Great
  if (rating >= 7.5) return '#F4D03F'; // Good
  if (rating >= 7.0) return '#F39C12'; // Regular
  if (rating >= 6.0) return '#E74C3C'; // Bad
  return '#633974'; // Garbage
};

// Memoized components
const RatingCell = memo(({ episode, ratingSource, getTVMazeRating, isCurrentSeason, theme }: {
  episode: TMDBEpisode;
  ratingSource: RatingSource;
  getTVMazeRating: (seasonNumber: number, episodeNumber: number) => number | null;
  isCurrentSeason: (episode: TMDBEpisode) => boolean;
  theme: any;
}) => {
  const getRatingForSource = useCallback((episode: TMDBEpisode): number | null => {
    switch (ratingSource) {
      case 'imdb':
        return episode.imdb_rating || null;
      case 'tmdb':
        return episode.vote_average || null;
      case 'tvmaze':
        return getTVMazeRating(episode.season_number, episode.episode_number);
      default:
        return null;
    }
  }, [ratingSource, getTVMazeRating]);

  const isRatingPotentiallyInaccurate = useCallback((episode: TMDBEpisode): boolean => {
    const rating = getRatingForSource(episode);
    if (!rating) return false;

    if (ratingSource === 'tmdb' && episode.imdb_rating) {
      const difference = Math.abs(rating - episode.imdb_rating);
      return difference >= 2;
    }

    return false;
  }, [getRatingForSource, ratingSource]);

  const rating = getRatingForSource(episode);
  const isInaccurate = isRatingPotentiallyInaccurate(episode);
  const isCurrent = isCurrentSeason(episode);

  if (!rating) {
    if (!episode.air_date || new Date(episode.air_date) > new Date()) {
      return (
        <View style={[styles.ratingCell, { backgroundColor: theme.colors.darkGray }]}>
          <MaterialIcons name="schedule" size={16} color={theme.colors.lightGray} />
        </View>
      );
    }
    return (
      <View style={[styles.ratingCell, { backgroundColor: theme.colors.darkGray }]}>
        <Text style={[styles.ratingText, { color: theme.colors.lightGray }]}>—</Text>
      </View>
    );
  }

  return (
    <Animated.View style={styles.ratingCellContainer}>
      <Animated.View style={[
        styles.ratingCell, 
        { 
          backgroundColor: getRatingColor(rating),
          opacity: isCurrent ? 0.7 : 1,
        }
      ]}>
        <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
      </Animated.View>
      {(isInaccurate || isCurrent) && (
        <MaterialIcons 
          name={isCurrent ? "schedule" : "warning"}
          size={12} 
          color={isCurrent ? theme.colors.primary : theme.colors.warning}
          style={styles.warningIcon}
        />
      )}
    </Animated.View>
  );
});

const RatingSourceToggle = memo(({ ratingSource, setRatingSource, theme }: {
  ratingSource: RatingSource;
  setRatingSource: (source: RatingSource) => void;
  theme: any;
}) => (
  <View style={styles.ratingSourceContainer}>
    <Text style={[styles.sectionTitle, { color: theme.colors.white }]}>Rating Source:</Text>
    <View style={styles.ratingSourceButtons}>
      {['imdb', 'tmdb', 'tvmaze'].map((source) => {
        const isActive = ratingSource === source;
        return (
          <TouchableOpacity
            key={source}
            style={[
              styles.sourceButton,
              { borderColor: theme.colors.lightGray },
              isActive && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
            ]}
            onPress={() => setRatingSource(source as RatingSource)}
          >
            <Text 
              style={{
                fontSize: 13,
                fontWeight: isActive ? '700' : '600',
                color: isActive ? theme.colors.white : theme.colors.lightGray
              }}
            >
              {source.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
));

const ShowInfo = memo(({ show, theme }: { show: Show | null, theme: any }) => (
  <View style={styles.showInfo}>
    <Image
      source={{ uri: `https://image.tmdb.org/t/p/w500${show?.poster_path}` }}
      style={styles.poster}
      contentFit="cover"
      transition={200}
    />
    <View style={styles.showDetails}>
      <Text style={[styles.showTitle, { color: theme.colors.white }]}>{show?.name}</Text>
      <Text style={[styles.showYear, { color: theme.colors.lightGray }]}>
        {show?.first_air_date ? `${new Date(show.first_air_date).getFullYear()} - ${show.last_air_date ? new Date(show.last_air_date).getFullYear() : 'Present'}` : ''}
      </Text>
      <View style={styles.episodeCountContainer}>
        <MaterialIcons name="tv" size={16} color={theme.colors.primary} />
        <Text style={[styles.episodeCount, { color: theme.colors.lightGray }]}>
          {show?.number_of_seasons} Seasons • {show?.number_of_episodes} Episodes
        </Text>
      </View>
    </View>
  </View>
));

const ShowRatingsScreen = ({ route }: Props) => {
  const { currentTheme } = useTheme();
  const { colors } = currentTheme;
  const { showId } = route.params;
  const [show, setShow] = useState<Show | null>(null);
  const [seasons, setSeasons] = useState<TMDBSeason[]>([]);
  const [tvmazeEpisodes, setTvmazeEpisodes] = useState<TVMazeEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadedSeasons, setLoadedSeasons] = useState<number[]>([]);
  const [ratingSource, setRatingSource] = useState<RatingSource>('tmdb');
  const [visibleSeasonRange, setVisibleSeasonRange] = useState({ start: 0, end: 8 });
  const [loadingProgress, setLoadingProgress] = useState(0);
  const ratingsCache = useRef<{[key: string]: number | null}>({});

  const fetchTVMazeData = async (imdbId: string) => {
    try {
      const lookupResponse = await axios.get(`https://api.tvmaze.com/lookup/shows?imdb=${imdbId}`);
      const tvmazeId = lookupResponse.data?.id;
      
      if (tvmazeId) {
        const showResponse = await axios.get(`https://api.tvmaze.com/shows/${tvmazeId}?embed=episodes`);
        if (showResponse.data?._embedded?.episodes) {
          setTvmazeEpisodes(showResponse.data._embedded.episodes);
        }
      }
    } catch (error) {
      logger.error('Error fetching TVMaze data:', error);
    }
  };

  const loadMoreSeasons = async () => {
    if (!show || loadingSeasons) return;

    setLoadingSeasons(true);
    try {
      const tmdb = TMDBService.getInstance();
      const seasonsToLoad = show.seasons
        .filter(season => 
          season.season_number > 0 && 
          !loadedSeasons.includes(season.season_number) &&
          season.season_number > visibleSeasonRange.start &&
          season.season_number <= visibleSeasonRange.end
        );

      // Load seasons in parallel in larger batches
      const batchSize = 4; // Load 4 seasons at a time
      const batches = [];
      
      for (let i = 0; i < seasonsToLoad.length; i += batchSize) {
        const batch = seasonsToLoad.slice(i, i + batchSize);
        batches.push(batch);
      }

      let loadedCount = 0;
      const totalToLoad = seasonsToLoad.length;

      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(season => 
            tmdb.getSeasonDetails(showId, season.season_number, show.name)
          )
        );

        const validResults = batchResults.filter((s): s is TMDBSeason => s !== null);
        setSeasons(prev => [...prev, ...validResults]);
        setLoadedSeasons(prev => [...prev, ...batch.map(s => s.season_number)]);
        
        loadedCount += batch.length;
        setLoadingProgress((loadedCount / totalToLoad) * 100);
      }
    } catch (error) {
      logger.error('Error loading more seasons:', error);
    } finally {
      setLoadingProgress(0);
      setLoadingSeasons(false);
    }
  };

  const onScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isCloseToRight = (contentOffset.x + layoutMeasurement.width) >= (contentSize.width * 0.8);
    
    if (isCloseToRight && show && !loadingSeasons) {
      const maxSeasons = Math.max(...show.seasons.map(s => s.season_number));
      if (visibleSeasonRange.end < maxSeasons) {
        setVisibleSeasonRange(prev => ({
          start: prev.end,
          end: Math.min(prev.end + 8, maxSeasons)
        }));
      }
    }
  }, [show, loadingSeasons, visibleSeasonRange.end]);

  useEffect(() => {
    const fetchShowData = async () => {
      try {
        const tmdb = TMDBService.getInstance();
        
        // Log the showId being used
        logger.log(`[ShowRatingsScreen] Fetching show details for ID: ${showId}`);
        
        const showData = await tmdb.getTVShowDetails(showId);
        if (showData) {
          setShow(showData);
          
          // Get external IDs to fetch TVMaze data
          const externalIds = await tmdb.getShowExternalIds(showId);
          if (externalIds?.imdb_id) {
            fetchTVMazeData(externalIds.imdb_id);
          }
          
          // Set initial season range
          const initialEnd = Math.min(8, Math.max(...showData.seasons.map(s => s.season_number)));
          setVisibleSeasonRange({ start: 0, end: initialEnd });
        }
      } catch (error) {
        logger.error('Error fetching show data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShowData();
  }, [showId]);

  useEffect(() => {
    loadMoreSeasons();
  }, [visibleSeasonRange]);

  const getTVMazeRating = useCallback((seasonNumber: number, episodeNumber: number): number | null => {
    const episode = tvmazeEpisodes.find(
      ep => ep.season === seasonNumber && ep.number === episodeNumber
    );
    return episode?.rating?.average || null;
  }, [tvmazeEpisodes]);

  const isCurrentSeason = useCallback((episode: TMDBEpisode): boolean => {
    if (!seasons.length || !episode.air_date) return false;
    
    const latestSeasonNumber = Math.max(...seasons.map(s => s.season_number));
    if (episode.season_number !== latestSeasonNumber) return false;
    
    const now = new Date();
    const airDate = new Date(episode.air_date);
    const monthsDiff = (now.getFullYear() - airDate.getFullYear()) * 12 + 
                      (now.getMonth() - airDate.getMonth());
    
    return monthsDiff <= 6;
  }, [seasons]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.black }]}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.lightGray }]}>Loading show data...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.black }]}>
      {Platform.OS === 'ios' && (
        <BlurView
          style={StyleSheet.absoluteFill}
          tint="dark"
          intensity={60}
        />
      )}
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <SafeAreaView style={{ flex: 1 }}>
        <Suspense fallback={
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.lightGray }]}>Loading content...</Text>
          </View>
        }>
          <ScrollView 
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            contentContainerStyle={styles.scrollViewContent}
          >
            <View style={styles.content}>
              <Animated.View 
                entering={FadeIn.duration(300)}
                style={styles.showInfoContainer}
              >
                <ShowInfo show={show} theme={currentTheme} />
              </Animated.View>
              
              <Animated.View 
                entering={FadeIn.delay(100).duration(300)}
                style={styles.section}
              >
                <RatingSourceToggle 
                  ratingSource={ratingSource} 
                  setRatingSource={setRatingSource} 
                  theme={currentTheme} 
                />
              </Animated.View>

              <Animated.View 
                entering={FadeIn.delay(200).duration(300)}
                style={styles.section}
              >
                {/* Legend */}
                <View style={[styles.legend, { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.darkBackground }]}>
                  <Text style={[styles.sectionTitle, { color: colors.white }]}>Rating Scale</Text>
                  <View style={styles.legendItems}>
                    {[
                      { color: '#186A3B', text: 'Awesome (9.0+)' },
                      { color: '#28B463', text: 'Great (8.0-8.9)' },
                      { color: '#F4D03F', text: 'Good (7.5-7.9)' },
                      { color: '#F39C12', text: 'Regular (7.0-7.4)' },
                      { color: '#E74C3C', text: 'Bad (6.0-6.9)' },
                      { color: '#633974', text: 'Garbage (<6.0)' }
                    ].map((item, index) => (
                      <View key={index} style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: item.color }]} />
                        <Text style={[styles.legendText, { color: colors.lightGray }]}>{item.text}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.warningLegends, { borderTopColor: colors.black + '40' }]}>
                    <View style={styles.warningLegend}>
                      <MaterialIcons name="warning" size={14} color={colors.warning} />
                      <Text style={[styles.warningText, { color: colors.lightGray }]}>Rating differs significantly from IMDb</Text>
                    </View>
                    <View style={styles.warningLegend}>
                      <MaterialIcons name="schedule" size={14} color={colors.primary} />
                      <Text style={[styles.warningText, { color: colors.lightGray }]}>Current season (ratings may change)</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              <Animated.View 
                entering={FadeIn.delay(300).duration(300)}
                style={styles.section}
              >
                {/* Ratings Grid */}
                <Text style={[styles.sectionTitle, { color: colors.white }]}>Episode Ratings</Text>
                <View style={[styles.ratingsGrid, { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.darkBackground }]}>
                  <View style={styles.gridContainer}>
                    {/* Fixed Episode Column */}
                    <View style={[styles.fixedColumn, { borderRightColor: colors.black + '40' }]}>
                      <View style={styles.episodeColumn}>
                        <Text style={[styles.headerText, { color: colors.white }]}>Episode</Text>
                      </View>
                      {Array.from({ length: Math.max(...seasons.map(s => s.episodes.length)) }).map((_, episodeIndex) => (
                        <View key={`e${episodeIndex + 1}`} style={styles.episodeCell}>
                          <Text style={[styles.episodeText, { color: colors.lightGray }]}>E{episodeIndex + 1}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Scrollable Seasons */}
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      style={styles.seasonsScrollView}
                      onScroll={onScroll}
                      scrollEventThrottle={16}
                    >
                      <View>
                        {/* Seasons Header */}
                        <View style={[styles.gridHeader, { borderBottomColor: colors.black + '40' }]}>
                          {seasons.map((season) => (
                            <Animated.View 
                              key={`s${season.season_number}`} 
                              style={styles.ratingColumn}
                              entering={SlideInRight.delay(season.season_number * 50).duration(200)}
                            >
                              <Text style={[styles.headerText, { color: colors.white }]}>S{season.season_number}</Text>
                            </Animated.View>
                          ))}
                          {loadingSeasons && (
                            <View style={[styles.ratingColumn, styles.loadingColumn]}>
                              <View style={styles.loadingProgressContainer}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                {loadingProgress > 0 && (
                                  <Text style={[styles.loadingProgressText, { color: colors.primary }]}>
                                    {Math.round(loadingProgress)}%
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}
                        </View>

                        {/* Episodes Grid */}
                        {Array.from({ length: Math.max(...seasons.map(s => s.episodes.length)) }).map((_, episodeIndex) => (
                          <View key={`e${episodeIndex + 1}`} style={styles.gridRow}>
                            {seasons.map((season) => (
                              <Animated.View 
                                key={`s${season.season_number}e${episodeIndex + 1}`} 
                                style={styles.ratingColumn}
                                entering={SlideInRight.delay((season.season_number + episodeIndex) * 10).duration(200)}
                              >
                                {season.episodes[episodeIndex] && 
                                  <RatingCell
                                    episode={season.episodes[episodeIndex]}
                                    ratingSource={ratingSource}
                                    getTVMazeRating={getTVMazeRating}
                                    isCurrentSeason={isCurrentSeason}
                                    theme={currentTheme}
                                  />
                                }
                              </Animated.View>
                            ))}
                            {loadingSeasons && <View style={[styles.ratingColumn, styles.loadingColumn]} />}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </Animated.View>
            </View>
          </ScrollView>
        </Suspense>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  content: {
    padding: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  showInfoContainer: {
    marginBottom: 12,
  },
  section: {
    marginBottom: 12,
  },
  showInfo: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: 6,
  },
  showDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  showTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  showYear: {
    fontSize: 13,
    marginBottom: 4,
  },
  episodeCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  episodeCount: {
    fontSize: 13,
  },
  ratingSourceContainer: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  ratingSourceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sourceButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    alignItems: 'center',
  },
  sourceButtonActive: {
    fontWeight: '700',
  },
  sourceButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sourceButtonTextActive: {
    fontWeight: '700',
  },
  legend: {
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
  },
  warningLegends: {
    marginTop: 8,
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  warningLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningText: {
    fontSize: 12,
    flex: 1,
  },
  ratingsGrid: {
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gridContainer: {
    flexDirection: 'row',
  },
  fixedColumn: {
    width: 40,
    borderRightWidth: 1,
    paddingRight: 6,
  },
  seasonsScrollView: {
    flex: 1,
  },
  gridHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    borderBottomWidth: 1,
    paddingBottom: 6,
    paddingLeft: 6,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 6,
  },
  episodeCell: {
    height: 26,
    justifyContent: 'center',
    paddingRight: 6,
  },
  episodeColumn: {
    height: 26,
    justifyContent: 'center',
    marginBottom: 8,
    paddingRight: 6,
  },
  ratingColumn: {
    width: 40,
    alignItems: 'center',
  },
  headerText: {
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  episodeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  ratingCell: {
    width: 32,
    height: 26,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  ratingCellContainer: {
    position: 'relative',
    width: 32,
    height: 26,
  },
  warningIcon: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'black',
    borderRadius: 8,
    padding: 1,
  },
  loadingColumn: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.7,
  },
  loadingProgressContainer: {
    alignItems: 'center',
    gap: 4,
  },
  loadingProgressText: {
    fontSize: 10,
    fontWeight: '600',
  },
});

export default memo(ShowRatingsScreen, (prevProps, nextProps) => {
  return prevProps.route.params.showId === nextProps.route.params.showId;
}); 