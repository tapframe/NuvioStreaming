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
import { colors } from '../styles';
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
const RatingCell = memo(({ episode, ratingSource, getTVMazeRating, isCurrentSeason }: {
  episode: TMDBEpisode;
  ratingSource: RatingSource;
  getTVMazeRating: (seasonNumber: number, episodeNumber: number) => number | null;
  isCurrentSeason: (episode: TMDBEpisode) => boolean;
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
        <View style={[styles.ratingCell, { backgroundColor: colors.darkGray }]}>
          <MaterialIcons name="schedule" size={16} color={colors.lightGray} />
        </View>
      );
    }
    return (
      <View style={[styles.ratingCell, { backgroundColor: colors.darkGray }]}>
        <Text style={[styles.ratingText, { color: colors.lightGray }]}>—</Text>
      </View>
    );
  }

  return (
    <View style={styles.ratingCellContainer}>
      <View style={[
        styles.ratingCell, 
        { 
          backgroundColor: getRatingColor(rating),
          opacity: isCurrent ? 0.7 : 1 
        }
      ]}>
        <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
      </View>
      {(isInaccurate || isCurrent) && (
        <MaterialIcons 
          name={isCurrent ? "schedule" : "warning"}
          size={12} 
          color={isCurrent ? colors.primary : colors.warning}
          style={styles.warningIcon}
        />
      )}
    </View>
  );
});

const RatingSourceToggle = memo(({ ratingSource, setRatingSource }: {
  ratingSource: RatingSource;
  setRatingSource: (source: RatingSource) => void;
}) => (
  <View style={styles.ratingSourceContainer}>
    <Text style={styles.ratingSourceTitle}>Rating Source:</Text>
    <View style={styles.ratingSourceButtons}>
      <TouchableOpacity
        style={[
          styles.sourceButton,
          ratingSource === 'imdb' && styles.sourceButtonActive
        ]}
        onPress={() => setRatingSource('imdb')}
      >
        <Text style={[
          styles.sourceButtonText,
          ratingSource === 'imdb' && styles.sourceButtonTextActive
        ]}>IMDb</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.sourceButton,
          ratingSource === 'tmdb' && styles.sourceButtonActive
        ]}
        onPress={() => setRatingSource('tmdb')}
      >
        <Text style={[
          styles.sourceButtonText,
          ratingSource === 'tmdb' && styles.sourceButtonTextActive
        ]}>TMDB</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.sourceButton,
          ratingSource === 'tvmaze' && styles.sourceButtonActive
        ]}
        onPress={() => setRatingSource('tvmaze')}
      >
        <Text style={[
          styles.sourceButtonText,
          ratingSource === 'tvmaze' && styles.sourceButtonTextActive
        ]}>TVMaze</Text>
      </TouchableOpacity>
    </View>
  </View>
));

const ShowInfo = memo(({ show }: { show: Show | null }) => (
  <View style={styles.showInfo}>
    <Image
      source={{ uri: `https://image.tmdb.org/t/p/w500${show?.poster_path}` }}
      style={styles.poster}
      contentFit="cover"
    />
    <View style={styles.showDetails}>
      <Text style={styles.showTitle}>{show?.name}</Text>
      <Text style={styles.showYear}>
        {show?.first_air_date ? `${new Date(show.first_air_date).getFullYear()} - ${show.last_air_date ? new Date(show.last_air_date).getFullYear() : 'Present'}` : ''}
      </Text>
      <View style={styles.episodeCountContainer}>
        <MaterialIcons name="tv" size={16} color={colors.primary} />
        <Text style={styles.episodeCount}>
          {show?.number_of_seasons} Seasons • {show?.number_of_episodes} Episodes
        </Text>
      </View>
    </View>
  </View>
));

const ShowRatingsScreen = ({ route }: Props) => {
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
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.black }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <SafeAreaView style={{ flex: 1 }}>
        <Suspense fallback={
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        }>
          <ScrollView 
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
          >
            <View style={styles.content}>
              <Animated.View 
                entering={FadeIn.duration(150)}
                style={styles.showInfoContainer}
              >
                <ShowInfo show={show} />
              </Animated.View>
              
              <Animated.View 
                entering={FadeIn.delay(50).duration(150)}
                style={styles.ratingSourceContainer}
              >
                <RatingSourceToggle ratingSource={ratingSource} setRatingSource={setRatingSource} />
              </Animated.View>

              <Animated.View 
                entering={FadeIn.delay(100).duration(150)}
                style={styles.legend}
              >
                {/* Legend */}
                <View style={styles.legend}>
                  <Text style={styles.legendTitle}>Rating Scale</Text>
                  <View style={styles.legendItems}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, { backgroundColor: '#186A3B' }]} />
                      <Text style={styles.legendText}>Awesome (9.0+)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, { backgroundColor: '#28B463' }]} />
                      <Text style={styles.legendText}>Great (8.0-8.9)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, { backgroundColor: '#F4D03F' }]} />
                      <Text style={styles.legendText}>Good (7.5-7.9)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, { backgroundColor: '#F39C12' }]} />
                      <Text style={styles.legendText}>Regular (7.0-7.4)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, { backgroundColor: '#E74C3C' }]} />
                      <Text style={styles.legendText}>Bad (6.0-6.9)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendColor, { backgroundColor: '#633974' }]} />
                      <Text style={styles.legendText}>Garbage ({'<'}6.0)</Text>
                    </View>
                  </View>
                  <View style={styles.warningLegends}>
                    <View style={styles.warningLegend}>
                      <MaterialIcons name="warning" size={16} color={colors.warning} />
                      <Text style={styles.warningText}>Rating differs significantly from IMDb</Text>
                    </View>
                    <View style={styles.warningLegend}>
                      <MaterialIcons name="schedule" size={16} color={colors.primary} />
                      <Text style={styles.warningText}>Current season (ratings may change)</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              <Animated.View 
                entering={FadeIn.delay(150).duration(150)}
                style={styles.ratingsGrid}
              >
                {/* Ratings Grid */}
                <View style={styles.ratingsGrid}>
                  <View style={styles.gridContainer}>
                    {/* Fixed Episode Column */}
                    <View style={styles.fixedColumn}>
                      <View style={styles.episodeColumn}>
                        <Text style={styles.headerText}>Episode</Text>
                      </View>
                      {Array.from({ length: Math.max(...seasons.map(s => s.episodes.length)) }).map((_, episodeIndex) => (
                        <View key={`e${episodeIndex + 1}`} style={styles.episodeCell}>
                          <Text style={styles.episodeText}>E{episodeIndex + 1}</Text>
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
                        <View style={styles.gridHeader}>
                          {seasons.map((season) => (
                            <View key={`s${season.season_number}`} style={styles.ratingColumn}>
                              <Text style={styles.headerText}>S{season.season_number}</Text>
                            </View>
                          ))}
                          {loadingSeasons && (
                            <View style={[styles.ratingColumn, styles.loadingColumn]}>
                              <View style={styles.loadingProgressContainer}>
                                <ActivityIndicator size="small" color={colors.primary} />
                                {loadingProgress > 0 && (
                                  <Text style={styles.loadingProgressText}>
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
                              <View key={`s${season.season_number}e${episodeIndex + 1}`} style={styles.ratingColumn}>
                                {season.episodes[episodeIndex] && 
                                  <RatingCell
                                    episode={season.episodes[episodeIndex]}
                                    ratingSource={ratingSource}
                                    getTVMazeRating={getTVMazeRating}
                                    isCurrentSeason={isCurrentSeason}
                                  />
                                }
                              </View>
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
    backgroundColor: colors.black,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 8,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  showInfoContainer: {
    marginBottom: 12,
  },
  showInfo: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: colors.darkBackground,
    borderRadius: 8,
    padding: 8,
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: 6,
  },
  showDetails: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'center',
  },
  showTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  showYear: {
    fontSize: 13,
    color: colors.lightGray,
    marginBottom: 6,
  },
  episodeCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  episodeCount: {
    fontSize: 12,
    color: colors.lightGray,
  },
  ratingSection: {
    backgroundColor: colors.darkBackground,
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  ratingSourceContainer: {
    marginBottom: 8,
  },
  ratingSourceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 6,
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
    borderColor: colors.lightGray,
    flex: 1,
    alignItems: 'center',
  },
  sourceButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sourceButtonText: {
    color: colors.lightGray,
    fontSize: 14,
    fontWeight: '600',
  },
  sourceButtonTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  tmdbDisclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.black + '40',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
    gap: 6,
  },
  tmdbDisclaimerText: {
    color: colors.lightGray,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  legend: {
    backgroundColor: colors.darkBackground,
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: '45%',
    marginBottom: 2,
  },
  legendColor: {
    width: 14,
    height: 14,
    borderRadius: 3,
    marginRight: 6,
  },
  legendText: {
    color: colors.lightGray,
    fontSize: 12,
  },
  warningLegends: {
    marginTop: 8,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.black + '40',
    paddingTop: 8,
  },
  warningLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningText: {
    color: colors.lightGray,
    fontSize: 11,
    flex: 1,
  },
  ratingsGrid: {
    backgroundColor: colors.darkBackground,
    borderRadius: 8,
    padding: 8,
  },
  gridContainer: {
    flexDirection: 'row',
  },
  fixedColumn: {
    width: 40,
    borderRightWidth: 1,
    borderRightColor: colors.black + '40',
  },
  seasonsScrollView: {
    flex: 1,
  },
  gridHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.black + '40',
    paddingBottom: 6,
    paddingLeft: 6,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 6,
  },
  episodeCell: {
    height: 28,
    justifyContent: 'center',
    paddingRight: 6,
  },
  episodeColumn: {
    height: 28,
    justifyContent: 'center',
    marginBottom: 8,
    paddingRight: 6,
  },
  ratingColumn: {
    width: 40,
    alignItems: 'center',
  },
  headerText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  episodeText: {
    color: colors.lightGray,
    fontSize: 12,
    fontWeight: '500',
  },
  ratingCell: {
    width: 32,
    height: 24,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  ratingCellContainer: {
    position: 'relative',
    width: 32,
    height: 24,
  },
  warningIcon: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.black,
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
    color: colors.primary,
    fontSize: 10,
    fontWeight: '600',
  },
});

export default memo(ShowRatingsScreen, (prevProps, nextProps) => {
  return prevProps.route.params.showId === nextProps.route.params.showId;
}); 