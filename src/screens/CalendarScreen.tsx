import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Dimensions,
  SectionList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { stremioService } from '../services/stremioService';
import { useLibrary } from '../hooks/useLibrary';
import { format, parseISO, isThisWeek, isAfter, startOfToday, addWeeks, isBefore, isSameDay } from 'date-fns';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CalendarSection } from '../components/calendar/CalendarSection';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';

const { width } = Dimensions.get('window');

interface CalendarEpisode {
  id: string;
  seriesId: string;
  title: string;
  seriesName: string;
  poster: string;
  releaseDate: string;
  season: number;
  episode: number;
  overview: string;
  vote_average: number;
  still_path: string | null;
  season_poster_path: string | null;
}

interface CalendarSection {
  title: string;
  data: CalendarEpisode[];
}

const CalendarScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { libraryItems, loading: libraryLoading } = useLibrary();
  const { currentTheme } = useTheme();
  logger.log(`[Calendar] Initial load - Library has ${libraryItems?.length || 0} items, loading: ${libraryLoading}`);
  const [calendarData, setCalendarData] = useState<CalendarSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filteredEpisodes, setFilteredEpisodes] = useState<CalendarEpisode[]>([]);

  const fetchCalendarData = useCallback(async () => {
    logger.log("[Calendar] Starting to fetch calendar data");
    setLoading(true);
    
    try {
      // Filter for only series in library
      const seriesItems = libraryItems.filter(item => item.type === 'series');
      logger.log(`[Calendar] Library items: ${libraryItems.length}, Series items: ${seriesItems.length}`);
      
      let allEpisodes: CalendarEpisode[] = [];
      let seriesWithoutEpisodes: CalendarEpisode[] = [];
      
      // For each series, fetch upcoming episodes
      for (const series of seriesItems) {
        try {
          logger.log(`[Calendar] Fetching episodes for series: ${series.name} (${series.id})`);
          const metadata = await stremioService.getMetaDetails(series.type, series.id);
          logger.log(`[Calendar] Metadata fetched:`, metadata ? 'success' : 'null');
          
          if (metadata?.videos && metadata.videos.length > 0) {
            logger.log(`[Calendar] Series ${series.name} has ${metadata.videos.length} videos`);
            // Filter for upcoming episodes or recently released
            const today = startOfToday();
            const fourWeeksLater = addWeeks(today, 4);
            const twoWeeksAgo = addWeeks(today, -2);
            
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
            
            const upcomingEpisodes = metadata.videos
              .filter(video => {
                if (!video.released) return false;
                const releaseDate = parseISO(video.released);
                return isBefore(releaseDate, fourWeeksLater) && isAfter(releaseDate, twoWeeksAgo);
              })
              .map(video => {
                const tmdbEpisode = tmdbEpisodes[`${video.season}:${video.episode}`] || {};
                return {
                  id: video.id,
                  seriesId: series.id,
                  title: tmdbEpisode.name || video.title || `Episode ${video.episode}`,
                  seriesName: series.name || metadata.name,
                  poster: series.poster || metadata.poster || '',
                  releaseDate: video.released,
                  season: video.season || 0,
                  episode: video.episode || 0,
                  overview: tmdbEpisode.overview || '',
                  vote_average: tmdbEpisode.vote_average || 0,
                  still_path: tmdbEpisode.still_path || null,
                  season_poster_path: tmdbEpisode.season_poster_path || null
                };
              });
            
            if (upcomingEpisodes.length > 0) {
              allEpisodes = [...allEpisodes, ...upcomingEpisodes];
            } else {
              // Add to series without episode dates
              seriesWithoutEpisodes.push({
                id: series.id,
                seriesId: series.id,
                title: 'No upcoming episodes',
                seriesName: series.name || (metadata?.name || ''),
                poster: series.poster || (metadata?.poster || ''),
                releaseDate: '',
                season: 0,
                episode: 0,
                overview: '',
                vote_average: 0,
                still_path: null,
                season_poster_path: null
              });
            }
          } else {
            // Add to series without episode dates
            seriesWithoutEpisodes.push({
              id: series.id,
              seriesId: series.id,
              title: 'No upcoming episodes',
              seriesName: series.name || (metadata?.name || ''),
              poster: series.poster || (metadata?.poster || ''),
              releaseDate: '',
              season: 0,
              episode: 0,
              overview: '',
              vote_average: 0,
              still_path: null,
              season_poster_path: null
            });
          }
        } catch (error) {
          logger.error(`Error fetching episodes for ${series.name}:`, error);
        }
      }
      
      // Sort episodes by release date
      allEpisodes.sort((a, b) => {
        return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
      });
      
      // Group episodes into sections
      const thisWeekEpisodes = allEpisodes.filter(
        episode => isThisWeek(parseISO(episode.releaseDate))
      );
      
      const upcomingEpisodes = allEpisodes.filter(
        episode => isAfter(parseISO(episode.releaseDate), new Date()) && 
          !isThisWeek(parseISO(episode.releaseDate))
      );
      
      const recentEpisodes = allEpisodes.filter(
        episode => isBefore(parseISO(episode.releaseDate), new Date()) && 
          !isThisWeek(parseISO(episode.releaseDate))
      );
      
      logger.log(`[Calendar] Episodes summary: All episodes: ${allEpisodes.length}, This Week: ${thisWeekEpisodes.length}, Upcoming: ${upcomingEpisodes.length}, Recent: ${recentEpisodes.length}, No Schedule: ${seriesWithoutEpisodes.length}`);
      
      const sections: CalendarSection[] = [];
      
      if (thisWeekEpisodes.length > 0) {
        sections.push({ title: 'This Week', data: thisWeekEpisodes });
      }
      
      if (upcomingEpisodes.length > 0) {
        sections.push({ title: 'Upcoming', data: upcomingEpisodes });
      }
      
      if (recentEpisodes.length > 0) {
        sections.push({ title: 'Recently Released', data: recentEpisodes });
      }
      
      if (seriesWithoutEpisodes.length > 0) {
        sections.push({ title: 'Series with No Scheduled Episodes', data: seriesWithoutEpisodes });
      }
      
      setCalendarData(sections);
    } catch (error) {
      logger.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [libraryItems]);
  
  useEffect(() => {
    if (libraryItems.length > 0 && !libraryLoading) {
      logger.log(`[Calendar] Library loaded with ${libraryItems.length} items, fetching calendar data`);
      fetchCalendarData();
    } else if (!libraryLoading) {
      logger.log(`[Calendar] Library loaded but empty (${libraryItems.length} items)`);
      setLoading(false);
    }
  }, [libraryItems, libraryLoading, fetchCalendarData]);
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCalendarData();
  }, [fetchCalendarData]);
  
  const handleSeriesPress = useCallback((seriesId: string, episode?: CalendarEpisode) => {
    navigation.navigate('Metadata', {
      id: seriesId,
      type: 'series',
      episodeId: episode ? `${episode.seriesId}:${episode.season}:${episode.episode}` : undefined
    });
  }, [navigation]);
  
  const handleEpisodePress = useCallback((episode: CalendarEpisode) => {
    // For series without episode dates, just go to the series page
    if (!episode.releaseDate) {
      handleSeriesPress(episode.seriesId, episode);
      return;
    }
    
    // For episodes with dates, go to the stream screen
    const episodeId = `${episode.seriesId}:${episode.season}:${episode.episode}`;
    navigation.navigate('Streams', {
      id: episode.seriesId,
      type: 'series',
      episodeId
    });
  }, [navigation, handleSeriesPress]);
  
  const renderEpisodeItem = ({ item }: { item: CalendarEpisode }) => {
    const hasReleaseDate = !!item.releaseDate;
    const releaseDate = hasReleaseDate ? parseISO(item.releaseDate) : null;
    const formattedDate = releaseDate ? format(releaseDate, 'MMM d, yyyy') : '';
    const isFuture = releaseDate ? isAfter(releaseDate, new Date()) : false;
    
    // Use episode still image if available, fallback to series poster
    const imageUrl = item.still_path ? 
      tmdbService.getImageUrl(item.still_path) : 
      (item.season_poster_path ? 
        tmdbService.getImageUrl(item.season_poster_path) : 
        item.poster);
    
    return (
      <Animated.View entering={FadeIn.duration(300).delay(100)}>
        <TouchableOpacity 
          style={[styles.episodeItem, { borderBottomColor: currentTheme.colors.border + '20' }]}
          onPress={() => handleEpisodePress(item)}
          activeOpacity={0.7}
        >
          <TouchableOpacity
            onPress={() => handleSeriesPress(item.seriesId, item)}
            activeOpacity={0.7}
          >
            <Image
              source={{ uri: imageUrl }}
              style={styles.poster}
              contentFit="cover"
              transition={300}
            />
          </TouchableOpacity>
          
          <View style={styles.episodeDetails}>
            <Text style={[styles.seriesName, { color: currentTheme.colors.text }]} numberOfLines={1}>
              {item.seriesName}
            </Text>
            
            {hasReleaseDate ? (
              <>
                <Text style={[styles.episodeTitle, { color: currentTheme.colors.lightGray }]} numberOfLines={2}>
                  S{item.season}:E{item.episode} - {item.title}
                </Text>
                
                {item.overview ? (
                  <Text style={[styles.overview, { color: currentTheme.colors.lightGray }]} numberOfLines={2}>
                    {item.overview}
                  </Text>
                ) : null}
                
                <View style={styles.metadataContainer}>
                  <View style={styles.dateContainer}>
                    <MaterialIcons 
                      name={isFuture ? "event" : "event-available"} 
                      size={16} 
                      color={currentTheme.colors.lightGray} 
                    />
                    <Text style={[styles.date, { color: currentTheme.colors.lightGray }]}>{formattedDate}</Text>
                  </View>
                  
                  {item.vote_average > 0 && (
                    <View style={styles.ratingContainer}>
                      <MaterialIcons 
                        name="star" 
                        size={16} 
                        color={currentTheme.colors.primary} 
                      />
                      <Text style={[styles.rating, { color: currentTheme.colors.primary }]}>
                        {item.vote_average.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.noEpisodesText, { color: currentTheme.colors.text }]}>
                  No scheduled episodes
                </Text>
                <View style={styles.dateContainer}>
                  <MaterialIcons 
                    name="event-busy" 
                    size={16} 
                    color={currentTheme.colors.lightGray} 
                  />
                  <Text style={[styles.date, { color: currentTheme.colors.lightGray }]}>Check back later</Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };
  
  const renderSectionHeader = ({ section }: { section: CalendarSection }) => (
    <View style={[styles.sectionHeader, { 
      backgroundColor: currentTheme.colors.darkBackground,
      borderBottomColor: currentTheme.colors.border 
    }]}>
      <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>
        {section.title}
      </Text>
    </View>
  );
  
  // Process all episodes once data is loaded
  const allEpisodes = calendarData.reduce((acc, section) => 
    [...acc, ...section.data], [] as CalendarEpisode[]);
  
  // Log when rendering with relevant state info
  logger.log(`[Calendar] Rendering: loading=${loading}, calendarData sections=${calendarData.length}, allEpisodes=${allEpisodes.length}`);
  
  // Handle date selection from calendar
  const handleDateSelect = useCallback((date: Date) => {
    logger.log(`[Calendar] Date selected: ${format(date, 'yyyy-MM-dd')}`);
    setSelectedDate(date);
    
    // Filter episodes for the selected date
    const filtered = allEpisodes.filter(episode => {
      if (!episode.releaseDate) return false;
      const episodeDate = parseISO(episode.releaseDate);
      return isSameDay(episodeDate, date);
    });
    
    logger.log(`[Calendar] Filtered episodes for selected date: ${filtered.length}`);
    setFilteredEpisodes(filtered);
  }, [allEpisodes]);

  // Reset date filter
  const clearDateFilter = useCallback(() => {
    logger.log(`[Calendar] Clearing date filter`);
    setSelectedDate(null);
    setFilteredEpisodes([]);
  }, []);
  
  if (libraryItems.length === 0 && !libraryLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
        <StatusBar barStyle="light-content" />
        
        <View style={[styles.header, { borderBottomColor: currentTheme.colors.border }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>Calendar</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <View style={styles.emptyLibraryContainer}>
          <MaterialIcons name="video-library" size={64} color={currentTheme.colors.lightGray} />
          <Text style={styles.emptyText}>
            Your library is empty
          </Text>
          <Text style={styles.emptySubtext}>
            Add series to your library to see their upcoming episodes in the calendar
          </Text>
          <TouchableOpacity 
            style={styles.discoverButton}
            onPress={() => navigation.navigate('MainTabs')}
          >
            <Text style={styles.discoverButtonText}>
              Return to Home
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
          <Text style={styles.loadingText}>Loading calendar...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      
      <View style={[styles.header, { borderBottomColor: currentTheme.colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>Calendar</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {selectedDate && filteredEpisodes.length > 0 && (
        <View style={[styles.filterInfoContainer, { borderBottomColor: currentTheme.colors.border }]}>
          <Text style={[styles.filterInfoText, { color: currentTheme.colors.text }]}>
            Showing episodes for {format(selectedDate, 'MMMM d, yyyy')}
          </Text>
          <TouchableOpacity onPress={clearDateFilter} style={styles.clearFilterButton}>
            <MaterialIcons name="close" size={18} color={currentTheme.colors.text} />
          </TouchableOpacity>
        </View>
      )}
      
      <CalendarSection 
        episodes={allEpisodes}
        onSelectDate={handleDateSelect}
      />
      
      {selectedDate && filteredEpisodes.length > 0 ? (
        <FlatList
          data={filteredEpisodes}
          keyExtractor={(item) => item.id}
          renderItem={renderEpisodeItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={currentTheme.colors.primary}
              colors={[currentTheme.colors.primary]}
            />
          }
        />
      ) : selectedDate && filteredEpisodes.length === 0 ? (
        <View style={styles.emptyFilterContainer}>
          <MaterialIcons name="event-busy" size={48} color={currentTheme.colors.lightGray} />
          <Text style={[styles.emptyFilterText, { color: currentTheme.colors.text }]}>
            No episodes for {format(selectedDate, 'MMMM d, yyyy')}
          </Text>
          <TouchableOpacity 
            style={[styles.clearFilterButtonLarge, { backgroundColor: currentTheme.colors.primary }]}
            onPress={clearDateFilter}
          >
            <Text style={[styles.clearFilterButtonText, { color: currentTheme.colors.text }]}>
              Show All Episodes
            </Text>
          </TouchableOpacity>
        </View>
      ) : calendarData.length > 0 ? (
        <SectionList
          sections={calendarData}
          keyExtractor={(item) => item.id}
          renderItem={renderEpisodeItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={currentTheme.colors.primary}
              colors={[currentTheme.colors.primary]}
            />
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="calendar-today" size={64} color={currentTheme.colors.lightGray} />
          <Text style={[styles.emptyText, { color: currentTheme.colors.text }]}>
            No upcoming episodes found
          </Text>
          <Text style={[styles.emptySubtext, { color: currentTheme.colors.lightGray }]}>
            Add series to your library to see their upcoming episodes here
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  episodeItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
  },
  poster: {
    width: 120,
    height: 68,
    borderRadius: 8,
  },
  episodeDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  seriesName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  episodeTitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  overview: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  metadataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: 14,
    marginLeft: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    fontSize: 14,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  filterInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  filterInfoText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearFilterButton: {
    padding: 8,
  },
  emptyFilterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyFilterText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center',
  },
  clearFilterButtonLarge: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
  },
  clearFilterButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  emptyLibraryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  discoverButton: {
    padding: 16,
    borderRadius: 8,
  },
  discoverButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  noEpisodesText: {
    fontSize: 14,
    marginBottom: 4,
  },
});

export default CalendarScreen; 