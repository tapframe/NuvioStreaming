import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { useTraktContext } from '../../contexts/TraktContext';
import { stremioService } from '../../services/stremioService';
import { tmdbService } from '../../services/tmdbService';
import { useLibrary } from '../../hooks/useLibrary';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { parseISO, isThisWeek, format, isAfter, isBefore } from 'date-fns';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useCalendarData } from '../../hooks/useCalendarData';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.75; // Reduced width for better spacing
const ITEM_HEIGHT = 180; // Compact height for cleaner design

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

export const ThisWeekSection = React.memo(() => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { libraryItems, loading: libraryLoading } = useLibrary();
  const {
    isAuthenticated: traktAuthenticated,
    isLoading: traktLoading,
    watchedShows,
    watchlistShows,
    continueWatching,
    loadAllCollections
  } = useTraktContext();
  const { currentTheme } = useTheme();
  const { calendarData, loading } = useCalendarData();

  const thisWeekEpisodes = useMemo(() => {
    const thisWeekSection = calendarData.find(section => section.title === 'This Week');
    if (!thisWeekSection) return [];

    return thisWeekSection.data.map(episode => ({
      ...episode,
      isReleased: isBefore(parseISO(episode.releaseDate), new Date()),
    }));
  }, [calendarData]);
  
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
  
  if (thisWeekEpisodes.length === 0) {
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
      <View style={styles.episodeItemContainer}>
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
            transition={0}
          />
          
                        {/* Enhanced gradient overlay */}
          <LinearGradient
              colors={[
                'transparent', 
                'transparent',
                'rgba(0,0,0,0.4)', 
                'rgba(0,0,0,0.8)',
                'rgba(0,0,0,0.95)'
              ]}
            style={styles.gradient}
              locations={[0, 0.4, 0.6, 0.8, 1]}
            >
              {/* Content area */}
              <View style={styles.contentArea}>
                <Text style={[styles.seriesName, { color: currentTheme.colors.white }]} numberOfLines={1}>
                  {item.seriesName}
                </Text>
                
                <Text style={[styles.episodeTitle, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={2}>
                  {item.title}
                </Text>
              
                {item.overview && (
                  <Text style={[styles.overview, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={2}>
                    {item.overview}
                  </Text>
                )}
                
                <View style={styles.dateContainer}>
                  <Text style={[styles.episodeInfo, { color: 'rgba(255,255,255,0.7)' }]}>
                    S{item.season}:E{item.episode} • 
                  </Text>
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
      </View>
    );
  };
  
  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(350)}>
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
        data={thisWeekEpisodes}
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
});

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
    marginRight: -10,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  listContent: {
    paddingLeft: 16,
    paddingRight: 16,
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
    justifyContent: 'flex-end',
    padding: 12,
    borderRadius: 16,
  },
    contentArea: {
    width: '100%',
  },
  seriesName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18,
  },
  overview: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
    opacity: 0.9,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  episodeInfo: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  releaseDate: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    letterSpacing: 0.3,
  },
}); 