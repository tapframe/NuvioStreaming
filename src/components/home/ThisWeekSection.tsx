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
import FastImage from '@d11/react-native-fast-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useTraktContext } from '../../contexts/TraktContext';
import { useLibrary } from '../../hooks/useLibrary';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { parseISO, isThisWeek, format, isAfter, isBefore } from 'date-fns';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';
import { useCalendarData } from '../../hooks/useCalendarData';
import { memoryManager } from '../../utils/memoryManager';
import { tmdbService } from '../../services/tmdbService';

// Compute base sizes; actual tablet sizes will be adjusted inside component for responsiveness
const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.75; // phone default
const ITEM_HEIGHT = 180; // phone default

// Enhanced responsive breakpoints
const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  largeTablet: 1024,
  tv: 1440,
};

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
  const { currentTheme } = useTheme();
  const { calendarData, loading } = useCalendarData();

  // Enhanced responsive sizing for tablets and TV screens
  const deviceWidth = Dimensions.get('window').width;
  const deviceHeight = Dimensions.get('window').height;
  
  // Determine device type based on width
  const getDeviceType = useCallback(() => {
    if (deviceWidth >= BREAKPOINTS.tv) return 'tv';
    if (deviceWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
    if (deviceWidth >= BREAKPOINTS.tablet) return 'tablet';
    return 'phone';
  }, [deviceWidth]);
  
  const deviceType = getDeviceType();
  const isTablet = deviceType === 'tablet';
  const isLargeTablet = deviceType === 'largeTablet';
  const isTV = deviceType === 'tv';
  const isLargeScreen = isTablet || isLargeTablet || isTV;
  
  // Enhanced responsive sizing
  const computedItemWidth = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return Math.min(deviceWidth * 0.25, 400); // 4 items per row on TV
      case 'largeTablet':
        return Math.min(deviceWidth * 0.35, 350); // 3 items per row on large tablet
      case 'tablet':
        return Math.min(deviceWidth * 0.46, 300); // 2 items per row on tablet
      default:
        return ITEM_WIDTH; // phone
    }
  }, [deviceType, deviceWidth]);
  
  const computedItemHeight = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 280;
      case 'largeTablet':
        return 250;
      case 'tablet':
        return 220;
      default:
        return ITEM_HEIGHT; // phone
    }
  }, [deviceType]);
  
  // Enhanced spacing and padding
  const horizontalPadding = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 32;
      case 'largeTablet':
        return 28;
      case 'tablet':
        return 24;
      default:
        return 16; // phone
    }
  }, [deviceType]);
  
  const itemSpacing = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 20;
      case 'largeTablet':
        return 18;
      case 'tablet':
        return 16;
      default:
        return 16; // phone
    }
  }, [deviceType]);

  // Use the already memory-optimized calendar data instead of fetching separately
  const thisWeekEpisodes = useMemo(() => {
    const thisWeekSection = calendarData.find(section => section.title === 'This Week');
    if (!thisWeekSection) return [];

    // Limit episodes to prevent memory issues and add release status
    const episodes = memoryManager.limitArraySize(thisWeekSection.data, 20); // Limit to 20 for home screen
    
    return episodes.map(episode => ({
      ...episode,
      isReleased: episode.releaseDate ? isBefore(parseISO(episode.releaseDate), new Date()) : false,
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
    // Handle episodes without release dates gracefully
    const releaseDate = item.releaseDate ? parseISO(item.releaseDate) : null;
    const formattedDate = releaseDate ? format(releaseDate, 'E, MMM d') : 'TBA';
    const isReleased = item.isReleased;
    
    // Use episode still image if available, fallback to series poster
    const imageUrl = item.still_path ? 
      tmdbService.getImageUrl(item.still_path) : 
      (item.season_poster_path ? 
        tmdbService.getImageUrl(item.season_poster_path) : 
        item.poster);
    
    return (
      <View style={[styles.episodeItemContainer, { width: computedItemWidth, height: computedItemHeight }]}>
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
          <FastImage
            source={{ 
              uri: imageUrl || undefined,
              priority: FastImage.priority.normal,
              cache: FastImage.cacheControl.immutable
            }}
            style={styles.poster}
            resizeMode={FastImage.resizeMode.cover}
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
            style={[
              styles.gradient,
              {
                padding: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12
              }
            ]}
              locations={[0, 0.4, 0.6, 0.8, 1]}
            >
              {/* Content area */}
              <View style={styles.contentArea}>
                <Text style={[
                  styles.seriesName, 
                  { 
                    color: currentTheme.colors.white,
                    fontSize: isTV ? 22 : isLargeTablet ? 20 : isTablet ? 18 : 16
                  }
                ]} numberOfLines={1}>
                  {item.seriesName}
                </Text>
                
                <Text style={[
                  styles.episodeTitle, 
                  { 
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14
                  }
                ]} numberOfLines={2}>
                  {item.title}
                </Text>
              
                {item.overview && (
                  <Text style={[
                    styles.overview, 
                    { 
                      color: 'rgba(255,255,255,0.8)',
                      fontSize: isTV ? 15 : isLargeTablet ? 14 : isTablet ? 13 : 12
                    }
                  ]} numberOfLines={isLargeScreen ? 3 : 2}>
                    {item.overview}
                  </Text>
                )}
                
                <View style={styles.dateContainer}>
                  <Text style={[
                    styles.episodeInfo, 
                    { 
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: isTV ? 15 : isLargeTablet ? 14 : isTablet ? 13 : 12
                    }
                  ]}>
                    S{item.season}:E{item.episode} • 
                  </Text>
                  <MaterialIcons
                    name="event" 
                    size={isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14} 
                    color={currentTheme.colors.primary}
                  />
                  <Text style={[
                    styles.releaseDate, 
                    { 
                      color: currentTheme.colors.primary,
                      fontSize: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 13
                    }
                  ]}>
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
    <Animated.View
      style={styles.container}
      entering={FadeIn.duration(350)}
    >
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.titleContainer}>
        <Text style={[
          styles.title, 
          { 
            color: currentTheme.colors.text,
            fontSize: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 26 : 24
          }
        ]}>This Week</Text>
          <View style={[
            styles.titleUnderline, 
            { 
              backgroundColor: currentTheme.colors.primary,
              width: isTV ? 50 : isLargeTablet ? 45 : isTablet ? 40 : 40,
              height: isTV ? 4 : isLargeTablet ? 3.5 : isTablet ? 3 : 3
            }
          ]} />
        </View>
        <TouchableOpacity onPress={handleViewAll} style={[
          styles.viewAllButton,
          {
            paddingVertical: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8,
            paddingHorizontal: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 10
          }
        ]}>
          <Text style={[
            styles.viewAllText, 
            { 
              color: currentTheme.colors.textMuted,
              fontSize: isTV ? 18 : isLargeTablet ? 16 : isTablet ? 15 : 14
            }
          ]}>View All</Text>
          <MaterialIcons 
            name="chevron-right" 
            size={isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20} 
            color={currentTheme.colors.textMuted} 
          />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={thisWeekEpisodes}
        keyExtractor={(item) => item.id}
        renderItem={renderEpisodeItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent, 
          { 
            paddingLeft: horizontalPadding, 
            paddingRight: horizontalPadding 
          }
        ]}
        snapToInterval={computedItemWidth + itemSpacing}
        decelerationRate="fast"
        snapToAlignment="start"
        initialNumToRender={isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 3}
        windowSize={isTV ? 4 : isLargeTablet ? 4 : 3}
        maxToRenderPerBatch={isTV ? 4 : isLargeTablet ? 4 : 3}
        removeClippedSubviews
        getItemLayout={(data, index) => {
          const length = computedItemWidth + itemSpacing;
          const offset = length * index;
          return { length, offset, index };
        }}
        ItemSeparatorComponent={() => <View style={{ width: itemSpacing }} />}
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