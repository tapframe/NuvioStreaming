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
  // Grouping fields
  isGroup?: boolean;
  episodeCount?: number;
  episodeRange?: string;
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

    // Get raw episodes (limit to 60 to be safe for performance but allow grouping)
    const rawEpisodes = memoryManager.limitArraySize(thisWeekSection.data, 60);

    // Group by series and date
    const groups: Record<string, typeof rawEpisodes> = {};

    rawEpisodes.forEach(ep => {
      // Create a unique key for series + date
      const dateKey = ep.releaseDate || 'unknown';
      const key = `${ep.seriesId}_${dateKey}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(ep);
    });

    const processedItems: ThisWeekEpisode[] = [];

    Object.values(groups).forEach(group => {
      // Sort episodes in the group by episode number
      group.sort((a, b) => a.episode - b.episode);

      const firstEp = group[0];
      const isReleased = firstEp.releaseDate ? isBefore(parseISO(firstEp.releaseDate), new Date()) : false;

      if (group.length === 1) {
        processedItems.push({
          ...firstEp,
          isReleased
        });
      } else {
        // Create group item
        const lastEp = group[group.length - 1];
        processedItems.push({
          ...firstEp,
          id: `group_${firstEp.seriesId}_${firstEp.releaseDate}`, // Unique ID for the group
          title: `${group.length} New Episodes`,
          isReleased,
          isGroup: true,
          episodeCount: group.length,
          episodeRange: `E${firstEp.episode}-${lastEp.episode}`
        });
      }
    });

    // Sort by release date
    processedItems.sort((a, b) => {
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return a.releaseDate.localeCompare(b.releaseDate);
    });

    return memoryManager.limitArraySize(processedItems, 20);
  }, [calendarData]);

  const handleEpisodePress = (episode: ThisWeekEpisode) => {
    // For grouped episodes, always go to series details
    if (episode.isGroup) {
      navigation.navigate('Metadata', {
        id: episode.seriesId,
        type: 'series'
      });
      return;
    }

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
    const formattedDate = releaseDate ? format(releaseDate, 'MMM d') : 'TBA';
    const isReleased = item.isReleased;

    // Use episode still image if available, fallback to series poster
    const imageUrl = item.still_path ?
      tmdbService.getImageUrl(item.still_path) :
      (item.season_poster_path ?
        tmdbService.getImageUrl(item.season_poster_path) :
        item.poster);

    return (
      <View style={[styles.episodeItemContainer, { width: computedItemWidth, height: computedItemHeight }]}>
        {item.isGroup && (
          <View style={[
            styles.cardStackEffect,
            {
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderColor: 'rgba(255,255,255,0.05)',
            }
          ]} />
        )}
        <TouchableOpacity
          style={[
            styles.episodeItem,
            {
              backgroundColor: currentTheme.colors.background,
              borderColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
            }
          ]}
          onPress={() => handleEpisodePress(item)}
          activeOpacity={0.7}
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

            <LinearGradient
              colors={[
                'transparent',
                'rgba(0,0,0,0.0)',
                'rgba(0,0,0,0.5)',
                'rgba(0,0,0,0.9)'
              ]}
              style={styles.gradient}
              locations={[0, 0.4, 0.7, 1]}
            >
              <View style={styles.cardHeader}>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: isReleased ? currentTheme.colors.primary : 'rgba(0,0,0,0.6)' }
                ]}>
                  <Text style={styles.statusText}>
                    {isReleased ? (item.isGroup ? 'Released' : 'New') : formattedDate}
                  </Text>
                </View>
              </View>

              <View style={styles.contentArea}>
                <Text style={[
                  styles.seriesName,
                  {
                    color: currentTheme.colors.white,
                    fontSize: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 17 : 16
                  }
                ]} numberOfLines={1}>
                  {item.seriesName}
                </Text>

                <View style={styles.metaContainer}>
                  <Text style={[
                    styles.seasonBadge,
                    {
                      color: currentTheme.colors.primary,
                      fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 13 : 12
                    }
                  ]}>
                    S{item.season} {item.isGroup ? item.episodeRange : `E${item.episode}`}
                  </Text>
                  <Text style={styles.dotSeparator}>•</Text>
                  <Text style={[
                    styles.episodeTitle,
                    {
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 13 : 12
                    }
                  ]} numberOfLines={1}>
                    {item.title}
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
    marginVertical: 24,
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  viewAllText: {
    fontSize: 13,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
    padding: 12,
    borderRadius: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  contentArea: {
    width: '100%',
  },
  seriesName: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seasonBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  dotSeparator: {
    marginHorizontal: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  episodeTitle: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  cardStackEffect: {
    position: 'absolute',
    top: -6,
    width: '92%',
    height: '100%',
    left: '4%',
    borderRadius: 16,
    borderWidth: 1,
    zIndex: -1,
  },
}); 