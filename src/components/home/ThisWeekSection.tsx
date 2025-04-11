import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../styles/colors';
import { stremioService } from '../../services/stremioService';
import { tmdbService } from '../../services/tmdbService';
import { useLibrary } from '../../hooks/useLibrary';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { parseISO, isThisWeek, format, isAfter, isBefore } from 'date-fns';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { catalogService } from '../../services/catalogService';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.85;
const ITEM_HEIGHT = 180;

interface ThisWeekEpisode {
  id: string;
  seriesId: string;
  seriesName: string;
  title: string;
  poster: string;
  releaseDate: string;
  season: number;
  episode: number;
  isReleased: boolean;
  overview: string;
  vote_average: number;
  still_path: string | null;
  season_poster_path: string | null;
}

export const ThisWeekSection = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { libraryItems, loading: libraryLoading } = useLibrary();
  const [episodes, setEpisodes] = useState<ThisWeekEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThisWeekEpisodes = useCallback(async () => {
    if (libraryItems.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    try {
      const seriesItems = libraryItems.filter(item => item.type === 'series');
      let allEpisodes: ThisWeekEpisode[] = [];
      
      for (const series of seriesItems) {
        try {
          const metadata = await stremioService.getMetaDetails(series.type, series.id);
          
          if (metadata?.videos) {
            // Get TMDB ID for additional metadata
            const tmdbId = await tmdbService.findTMDBIdByIMDB(series.id);
            let tmdbEpisodes: { [key: string]: any } = {};
            
            if (tmdbId) {
              const allTMDBEpisodes = await tmdbService.getAllEpisodes(tmdbId);
              // Flatten episodes into a map for easy lookup
              Object.values(allTMDBEpisodes).forEach(seasonEpisodes => {
                seasonEpisodes.forEach(episode => {
                  const key = `${episode.season_number}:${episode.episode_number}`;
                  tmdbEpisodes[key] = episode;
                });
              });
            }
            
            const thisWeekEpisodes = metadata.videos
              .filter(video => {
                if (!video.released) return false;
                const releaseDate = parseISO(video.released);
                return isThisWeek(releaseDate);
              })
              .map(video => {
                const releaseDate = parseISO(video.released);
                const tmdbEpisode = tmdbEpisodes[`${video.season}:${video.episode}`] || {};
                
                return {
                  id: video.id,
                  seriesId: series.id,
                  seriesName: series.name || metadata.name,
                  title: tmdbEpisode.name || video.title || `Episode ${video.episode}`,
                  poster: series.poster || metadata.poster || '',
                  releaseDate: video.released,
                  season: video.season || 0,
                  episode: video.episode || 0,
                  isReleased: isBefore(releaseDate, new Date()),
                  overview: tmdbEpisode.overview || '',
                  vote_average: tmdbEpisode.vote_average || 0,
                  still_path: tmdbEpisode.still_path || null,
                  season_poster_path: tmdbEpisode.season_poster_path || null
                };
              });
            
            allEpisodes = [...allEpisodes, ...thisWeekEpisodes];
          }
        } catch (error) {
          console.error(`Error fetching episodes for ${series.name}:`, error);
        }
      }
      
      // Sort episodes by release date
      allEpisodes.sort((a, b) => {
        return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
      });
      
      setEpisodes(allEpisodes);
    } catch (error) {
      console.error('Error fetching this week episodes:', error);
    } finally {
      setLoading(false);
    }
  }, [libraryItems]);
  
  // Subscribe to library updates
  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates(() => {
      console.log('[ThisWeekSection] Library updated, refreshing episodes');
      fetchThisWeekEpisodes();
    });

    return () => unsubscribe();
  }, [fetchThisWeekEpisodes]);

  // Initial load
  useEffect(() => {
    if (!libraryLoading) {
      fetchThisWeekEpisodes();
    }
  }, [libraryLoading, fetchThisWeekEpisodes]);
  
  const handleEpisodePress = (episode: ThisWeekEpisode) => {
    // For upcoming episodes, go to the metadata screen
    if (!episode.isReleased) {
      navigation.navigate('Metadata', {
        id: episode.seriesId,
        type: 'series'
      });
      return;
    }
    
    // For released episodes, go to the streams screen
    const episodeId = `${episode.seriesId}:${episode.season}:${episode.episode}`;
    navigation.navigate('Streams', {
      id: episode.seriesId,
      type: 'series',
      episodeId
    });
  };
  
  const handleViewAll = () => {
    navigation.navigate('Calendar' as any);
  };
  
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  
  if (episodes.length === 0) {
    return null;
  }
  
  const renderEpisodeItem = ({ item, index }: { item: ThisWeekEpisode, index: number }) => {
    const releaseDate = parseISO(item.releaseDate);
    const formattedDate = format(releaseDate, 'E, MMM d');
    const isReleased = item.isReleased;
    
    // Use episode still image if available, fallback to series poster
    const imageUrl = item.still_path ? 
      tmdbService.getImageUrl(item.still_path) : 
      (item.season_poster_path ? 
        tmdbService.getImageUrl(item.season_poster_path) : 
        item.poster);
    
    return (
      <Animated.View 
        entering={FadeInRight.delay(index * 100).duration(400)}
        style={styles.episodeItemContainer}
      >
        <TouchableOpacity
          style={styles.episodeItem}
          onPress={() => handleEpisodePress(item)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.poster}
            contentFit="cover"
            transition={300}
          />
          
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.9)']}
            style={styles.gradient}
          >
            <View style={styles.badgeContainer}>
              <View style={[
                styles.badge, 
                isReleased ? styles.releasedBadge : styles.upcomingBadge
              ]}>
                <MaterialIcons
                  name={isReleased ? "check-circle" : "event"}
                  size={12}
                  color={isReleased ? "#ffffff" : "#ffffff"}
                />
                <Text style={styles.badgeText}>
                  {isReleased ? 'Released' : 'Coming Soon'}
                </Text>
              </View>
              
              {item.vote_average > 0 && (
                <View style={styles.ratingBadge}>
                  <MaterialIcons
                    name="star"
                    size={12}
                    color={colors.primary}
                  />
                  <Text style={styles.ratingText}>
                    {item.vote_average.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.content}>
              <Text style={styles.seriesName} numberOfLines={1}>
                {item.seriesName}
              </Text>
              <Text style={styles.episodeTitle} numberOfLines={2}>
                S{item.season}:E{item.episode} - {item.title}
              </Text>
              {item.overview ? (
                <Text style={styles.overview} numberOfLines={2}>
                  {item.overview}
                </Text>
              ) : null}
              <Text style={styles.releaseDate}>
                {formattedDate}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  };
  
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <TouchableOpacity onPress={handleViewAll} style={styles.viewAllButton}>
          <Text style={styles.viewAllText}>View All</Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.lightGray} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.id}
        renderItem={renderEpisodeItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={ITEM_WIDTH + 12}
        decelerationRate="fast"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 14,
    color: colors.lightGray,
    marginRight: 4,
  },
  listContent: {
    paddingHorizontal: 8,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  episodeItemContainer: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    marginHorizontal: 6,
  },
  episodeItem: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
    justifyContent: 'space-between',
    padding: 16,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  releasedBadge: {
    backgroundColor: colors.success + 'CC', // 80% opacity
  },
  upcomingBadge: {
    backgroundColor: colors.primary + 'CC', // 80% opacity
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ratingText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  content: {
    width: '100%',
  },
  seriesName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  episodeTitle: {
    color: colors.lightGray,
    fontSize: 14,
    marginBottom: 4,
  },
  overview: {
    color: colors.lightGray,
    fontSize: 12,
    marginBottom: 6,
    opacity: 0.8,
  },
  releaseDate: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
}); 