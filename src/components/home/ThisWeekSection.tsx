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
import { useTheme } from '../../contexts/ThemeContext';
import { stremioService } from '../../services/stremioService';
import { tmdbService } from '../../services/tmdbService';
import { useLibrary } from '../../hooks/useLibrary';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { parseISO, isThisWeek, format, isAfter, isBefore } from 'date-fns';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.75; // Reduced width for better spacing
const ITEM_HEIGHT = 220; // Increased height for better proportions

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
  const { currentTheme } = useTheme();

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
  
  // Load episodes when library items change
  useEffect(() => {
    if (!libraryLoading) {
      console.log('[ThisWeekSection] Library items changed, refreshing episodes. Items count:', libraryItems.length);
      fetchThisWeekEpisodes();
    }
  }, [libraryLoading, libraryItems, fetchThisWeekEpisodes]);
  
  const handleEpisodePress = (episode: ThisWeekEpisode) => {
    // For upcoming episodes, go to the metadata screen
    if (!episode.isReleased) {
      const episodeId = `${episode.seriesId}:${episode.season}:${episode.episode}`;
      navigation.navigate('Metadata', {
        id: episode.seriesId,
        type: 'series',
        episodeId
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
        <ActivityIndicator size="large" color={currentTheme.colors.primary} />
        <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>
          Loading this week's episodes...
        </Text>
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
        entering={FadeInRight.delay(index * 150).duration(600)}
        style={styles.episodeItemContainer}
      >
        <TouchableOpacity
          style={[
            styles.episodeItem,
            { 
              shadowColor: currentTheme.colors.black,
              backgroundColor: currentTheme.colors.background,
            }
          ]}
          onPress={() => handleEpisodePress(item)}
          activeOpacity={0.8}
        >
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.poster}
              contentFit="cover"
              transition={400}
            />
            
            {/* Enhanced gradient overlay */}
            <LinearGradient
              colors={[
                'transparent', 
                'rgba(0,0,0,0.3)', 
                'rgba(0,0,0,0.7)', 
                'rgba(0,0,0,0.9)'
              ]}
              style={styles.gradient}
              locations={[0, 0.3, 0.7, 1]}
            >
              {/* Top badges */}
              <View style={styles.topBadgeContainer}>
                <View style={[
                  styles.statusBadge, 
                  isReleased ? styles.releasedBadge : styles.upcomingBadge,
                  { 
                    backgroundColor: isReleased 
                      ? currentTheme.colors.success + 'E6' 
                      : currentTheme.colors.primary + 'E6',
                    borderColor: isReleased 
                      ? currentTheme.colors.success 
                      : currentTheme.colors.primary,
                  }
                ]}>
                  <MaterialIcons
                    name={isReleased ? "check-circle" : "schedule"}
                    size={14}
                    color={currentTheme.colors.white}
                  />
                  <Text style={styles.statusBadgeText}>
                    {isReleased ? 'Available' : 'Upcoming'}
                  </Text>
                </View>
                
                {item.vote_average > 0 && (
                  <View style={[
                    styles.ratingBadge, 
                    { 
                      backgroundColor: 'rgba(255,193,7,0.9)',
                      borderColor: '#FFD700',
                    }
                  ]}>
                    <MaterialIcons
                      name="star"
                      size={14}
                      color="#FFF"
                    />
                    <Text style={styles.ratingText}>
                      {item.vote_average.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
              
              {/* Content area */}
              <View style={styles.contentArea}>
                <View style={styles.seriesHeader}>
                  <Text style={[styles.seriesName, { color: currentTheme.colors.white }]} numberOfLines={1}>
                    {item.seriesName}
                  </Text>
                  <View style={[styles.episodeNumber, { backgroundColor: currentTheme.colors.primary + '40' }]}>
                    <Text style={[styles.episodeNumberText, { color: currentTheme.colors.primary }]}>
                      S{item.season}:E{item.episode}
                    </Text>
                  </View>
                </View>
                
                <Text style={[styles.episodeTitle, { color: currentTheme.colors.lightGray }]} numberOfLines={2}>
                  {item.title}
                </Text>
                
                {item.overview && (
                  <Text style={[styles.overview, { color: currentTheme.colors.lightGray }]} numberOfLines={2}>
                    {item.overview}
                  </Text>
                )}
                
                <View style={styles.dateContainer}>
                  <MaterialIcons 
                    name="event" 
                    size={14} 
                    color={currentTheme.colors.primary} 
                  />
                  <Text style={[styles.releaseDate, { color: currentTheme.colors.primary }]}>
                    {formattedDate}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };
  
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: currentTheme.colors.text }]}>This Week</Text>
          <View style={[styles.titleUnderline, { backgroundColor: currentTheme.colors.primary }]} />
        </View>
        <TouchableOpacity onPress={handleViewAll} style={styles.viewAllButton}>
          <Text style={[styles.viewAllText, { color: currentTheme.colors.textMuted }]}>View All</Text>
          <MaterialIcons name="chevron-right" size={20} color={currentTheme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.id}
        renderItem={renderEpisodeItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={ITEM_WIDTH + 16}
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  titleContainer: {
    position: 'relative',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    width: 40,
    height: 3,
    borderRadius: 2,
    opacity: 0.8,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  episodeItemContainer: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
  },
  episodeItem: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
  },
  topBadgeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  releasedBadge: {},
  upcomingBadge: {},
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 4,
  },
  contentArea: {
    justifyContent: 'flex-end',
  },
  seriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seriesName: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  episodeNumber: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  episodeNumberText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  episodeTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 20,
  },
  overview: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
    opacity: 0.9,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  releaseDate: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    letterSpacing: 0.3,
  },
}); 