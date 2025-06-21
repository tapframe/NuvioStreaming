import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, useWindowDimensions, useColorScheme, FlatList } from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { Episode } from '../../types/metadata';
import { tmdbService } from '../../services/tmdbService';
import { storageService } from '../../services/storageService';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';

interface SeriesContentProps {
  episodes: Episode[];
  selectedSeason: number;
  loadingSeasons: boolean;
  onSeasonChange: (season: number) => void;
  onSelectEpisode: (episode: Episode) => void;
  groupedEpisodes?: { [seasonNumber: number]: Episode[] };
  metadata?: { poster?: string; id?: string };
}

// Add placeholder constant at the top
const DEFAULT_PLACEHOLDER = 'https://via.placeholder.com/300x450/1a1a1a/666666?text=No+Image';
const EPISODE_PLACEHOLDER = 'https://via.placeholder.com/500x280/1a1a1a/666666?text=No+Preview';
const TMDB_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tmdb.new.logo.svg/512px-Tmdb.new.logo.svg.png?20200406190906';

export const SeriesContent: React.FC<SeriesContentProps> = ({
  episodes,
  selectedSeason,
  loadingSeasons,
  onSeasonChange,
  onSelectEpisode,
  groupedEpisodes = {},
  metadata
}) => {
  const { currentTheme } = useTheme();
  const { settings } = useSettings();
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  const isDarkMode = useColorScheme() === 'dark';
  const [episodeProgress, setEpisodeProgress] = useState<{ [key: string]: { currentTime: number; duration: number; lastUpdated: number } }>({});
  
  // Add refs for the scroll views
  const seasonScrollViewRef = useRef<ScrollView | null>(null);
  const episodeScrollViewRef = useRef<ScrollView | null>(null);
  


  const loadEpisodesProgress = async () => {
    if (!metadata?.id) return;
    
    const allProgress = await storageService.getAllWatchProgress();
    const progress: { [key: string]: { currentTime: number; duration: number; lastUpdated: number } } = {};
    
    episodes.forEach(episode => {
      const episodeId = episode.stremioId || `${metadata.id}:${episode.season_number}:${episode.episode_number}`;
      const key = `series:${metadata.id}:${episodeId}`;
      if (allProgress[key]) {
        progress[episodeId] = {
          currentTime: allProgress[key].currentTime,
          duration: allProgress[key].duration,
          lastUpdated: allProgress[key].lastUpdated
        };
      }
    });
    
    setEpisodeProgress(progress);
  };

  // Function to find and scroll to the most recently watched episode
  const scrollToMostRecentEpisode = () => {
    if (!metadata?.id || !episodeScrollViewRef.current || settings.episodeLayoutStyle !== 'horizontal') {
      return;
    }
    
    const currentSeasonEpisodes = groupedEpisodes[selectedSeason] || [];
    if (currentSeasonEpisodes.length === 0) {
      return;
    }
    
    // Find the most recently watched episode in the current season
    let mostRecentEpisodeIndex = -1;
    let mostRecentTimestamp = 0;
    let mostRecentEpisodeName = '';
    
    currentSeasonEpisodes.forEach((episode, index) => {
      const episodeId = episode.stremioId || `${metadata.id}:${episode.season_number}:${episode.episode_number}`;
      const progress = episodeProgress[episodeId];
      
      if (progress && progress.lastUpdated > mostRecentTimestamp && progress.currentTime > 0) {
        mostRecentTimestamp = progress.lastUpdated;
        mostRecentEpisodeIndex = index;
        mostRecentEpisodeName = episode.name;
      }
    });
    
    // Scroll to the most recently watched episode if found
    if (mostRecentEpisodeIndex >= 0) {
      const cardWidth = isTablet ? width * 0.4 + 16 : width * 0.85 + 16;
      const scrollPosition = mostRecentEpisodeIndex * cardWidth;
      
      setTimeout(() => {
        if (episodeScrollViewRef.current && typeof (episodeScrollViewRef.current as any).scrollToOffset === 'function') {
          (episodeScrollViewRef.current as any).scrollToOffset({
            offset: scrollPosition,
            animated: true
          });
        }
      }, 500); // Delay to ensure the season has loaded
    }
  };

  // Initial load of watch progress
  useEffect(() => {
    loadEpisodesProgress();
  }, [episodes, metadata?.id]);

  // Refresh watch progress when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadEpisodesProgress();
    }, [episodes, metadata?.id])
  );

  // Add effect to scroll to selected season
  useEffect(() => {
    if (selectedSeason && seasonScrollViewRef.current && Object.keys(groupedEpisodes).length > 0) {
      // Find the index of the selected season
      const seasons = Object.keys(groupedEpisodes).map(Number).sort((a, b) => a - b);
      const selectedIndex = seasons.findIndex(season => season === selectedSeason);
      
      if (selectedIndex !== -1) {
        // Wait a small amount of time for layout to be ready
        setTimeout(() => {
          if (seasonScrollViewRef.current && typeof (seasonScrollViewRef.current as any).scrollToOffset === 'function') {
            (seasonScrollViewRef.current as any).scrollToOffset({
              offset: selectedIndex * 116, // 100px width + 16px margin
              animated: true
            });
          }
        }, 300);
      }
    }
  }, [selectedSeason, groupedEpisodes]);

  // Add effect to scroll to most recently watched episode when season changes or progress loads
  useEffect(() => {
    if (Object.keys(episodeProgress).length > 0 && selectedSeason) {
      scrollToMostRecentEpisode();
    }
  }, [selectedSeason, episodeProgress, settings.episodeLayoutStyle, groupedEpisodes]);



  if (loadingSeasons) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={currentTheme.colors.primary} />
        <Text style={[styles.centeredText, { color: currentTheme.colors.text }]}>Loading episodes...</Text>
      </View>
    );
  }

  if (episodes.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <MaterialIcons name="error-outline" size={48} color={currentTheme.colors.textMuted} />
        <Text style={[styles.centeredText, { color: currentTheme.colors.text }]}>No episodes available</Text>
      </View>
    );
  }

  const renderSeasonSelector = () => {
    // Show selector if we have grouped episodes data or can derive from episodes
    if (!groupedEpisodes || Object.keys(groupedEpisodes).length <= 1) {
      return null;
    }
    
    const seasons = Object.keys(groupedEpisodes).map(Number).sort((a, b) => a - b);
    
    return (
      <View style={styles.seasonSelectorWrapper}>
        <Text style={[styles.seasonSelectorTitle, { color: currentTheme.colors.highEmphasis }]}>Seasons</Text>
        <FlatList
          ref={seasonScrollViewRef as React.RefObject<FlatList<any>>}
          data={seasons}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.seasonSelectorContainer}
          contentContainerStyle={styles.seasonSelectorContent}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={3}
          renderItem={({ item: season }) => {
            const seasonEpisodes = groupedEpisodes[season] || [];
            let seasonPoster = DEFAULT_PLACEHOLDER;
            if (seasonEpisodes[0]?.season_poster_path) {
              const tmdbUrl = tmdbService.getImageUrl(seasonEpisodes[0].season_poster_path, 'w500');
              if (tmdbUrl) seasonPoster = tmdbUrl;
            } else if (metadata?.poster) {
              seasonPoster = metadata.poster;
            }
            
            return (
              <TouchableOpacity
                key={season}
                style={[
                  styles.seasonButton,
                  selectedSeason === season && [styles.selectedSeasonButton, { borderColor: currentTheme.colors.primary }]
                ]}
                onPress={() => onSeasonChange(season)}
              >
                <View style={styles.seasonPosterContainer}>
                  <Image
                    source={{ uri: seasonPoster }}
                    style={styles.seasonPoster}
                    contentFit="cover"
                  />
                  {selectedSeason === season && (
                    <View style={[styles.selectedSeasonIndicator, { backgroundColor: currentTheme.colors.primary }]} />
                  )}
                  {/* Show episode count badge, including when there are no episodes */}
                  <View style={[styles.episodeCountBadge, { backgroundColor: currentTheme.colors.elevation2 }]}>
                    <Text style={[styles.episodeCountText, { color: currentTheme.colors.textMuted }]}>
                      {seasonEpisodes.length} ep{seasonEpisodes.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
                <Text 
                  style={[
                    styles.seasonButtonText,
                    { color: currentTheme.colors.mediumEmphasis },
                    selectedSeason === season && [styles.selectedSeasonButtonText, { color: currentTheme.colors.primary }]
                  ]}
                >
                  Season {season}
                </Text>
              </TouchableOpacity>
            );
          }}
          keyExtractor={season => season.toString()}
        />
      </View>
    );
  };

  // Vertical layout episode card (traditional)
  const renderVerticalEpisodeCard = (episode: Episode) => {
    let episodeImage = EPISODE_PLACEHOLDER;
    if (episode.still_path) {
      const tmdbUrl = tmdbService.getImageUrl(episode.still_path, 'w500');
      if (tmdbUrl) episodeImage = tmdbUrl;
    } else if (metadata?.poster) {
      episodeImage = metadata.poster;
    }
    
    const episodeNumber = typeof episode.episode_number === 'number' ? episode.episode_number.toString() : '';
    const seasonNumber = typeof episode.season_number === 'number' ? episode.season_number.toString() : '';
    const episodeString = seasonNumber && episodeNumber ? `S${seasonNumber.padStart(2, '0')}E${episodeNumber.padStart(2, '0')}` : '';
    
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    };

    const formatRuntime = (runtime: number) => {
      if (!runtime) return null;
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    };

    // Get episode progress
    const episodeId = episode.stremioId || `${metadata?.id}:${episode.season_number}:${episode.episode_number}`;
    const progress = episodeProgress[episodeId];
    const progressPercent = progress ? (progress.currentTime / progress.duration) * 100 : 0;
    
    // Don't show progress bar if episode is complete (>= 85%)
    const showProgress = progress && progressPercent < 85;

    return (
      <TouchableOpacity
        key={episode.id}
        style={[
          styles.episodeCardVertical, 
          isTablet && styles.episodeCardVerticalTablet, 
          { backgroundColor: currentTheme.colors.elevation2 }
        ]}
        onPress={() => onSelectEpisode(episode)}
        activeOpacity={0.7}
      >
        <View style={styles.episodeImageContainer}>
          <Image
            source={{ uri: episodeImage }}
            style={styles.episodeImage}
            contentFit="cover"
          />
          <View style={styles.episodeNumberBadge}>
            <Text style={styles.episodeNumberText}>{episodeString}</Text>
          </View>
          {showProgress && (
            <View style={styles.progressBarContainer}>
              <View 
                style={[
                  styles.progressBar,
                  { width: `${progressPercent}%`, backgroundColor: currentTheme.colors.primary }
                ]} 
              />
            </View>
          )}
          {progressPercent >= 85 && (
            <View style={[styles.completedBadge, { backgroundColor: currentTheme.colors.primary }]}>
              <MaterialIcons name="check" size={12} color={currentTheme.colors.white} />
            </View>
          )}
        </View>

        <View style={styles.episodeInfo}>
          <View style={styles.episodeHeader}>
            <Text style={[styles.episodeTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>
              {episode.name}
            </Text>
            <View style={styles.episodeMetadata}>
              {episode.vote_average > 0 && (
                <View style={styles.ratingContainer}>
                  <Image
                    source={{ uri: TMDB_LOGO }}
                    style={styles.tmdbLogo}
                    contentFit="contain"
                  />
                  <Text style={[styles.ratingText, { color: currentTheme.colors.textMuted }]}>
                    {episode.vote_average.toFixed(1)}
                  </Text>
                </View>
              )}
              {episode.runtime && (
                <View style={styles.runtimeContainer}>
                  <MaterialIcons name="schedule" size={14} color={currentTheme.colors.textMuted} />
                  <Text style={[styles.runtimeText, { color: currentTheme.colors.textMuted }]}>
                    {formatRuntime(episode.runtime)}
                  </Text>
                </View>
              )}
              {episode.air_date && (
                <Text style={[styles.airDateText, { color: currentTheme.colors.textMuted }]}>
                  {formatDate(episode.air_date)}
                </Text>
              )}
            </View>
          </View>
          <Text style={[styles.episodeOverview, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={2}>
            {episode.overview || 'No description available'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Horizontal layout episode card (Netflix-style)
  const renderHorizontalEpisodeCard = (episode: Episode) => {
    let episodeImage = EPISODE_PLACEHOLDER;
    if (episode.still_path) {
      const tmdbUrl = tmdbService.getImageUrl(episode.still_path, 'w500');
      if (tmdbUrl) episodeImage = tmdbUrl;
    } else if (metadata?.poster) {
      episodeImage = metadata.poster;
    }
    
    const episodeNumber = typeof episode.episode_number === 'number' ? episode.episode_number.toString() : '';
    const seasonNumber = typeof episode.season_number === 'number' ? episode.season_number.toString() : '';
    const episodeString = seasonNumber && episodeNumber ? `EPISODE ${episodeNumber}` : '';
    
    const formatRuntime = (runtime: number) => {
      if (!runtime) return null;
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    };

    // Get episode progress
    const episodeId = episode.stremioId || `${metadata?.id}:${episode.season_number}:${episode.episode_number}`;
    const progress = episodeProgress[episodeId];
    const progressPercent = progress ? (progress.currentTime / progress.duration) * 100 : 0;
    
    // Don't show progress bar if episode is complete (>= 85%)
    const showProgress = progress && progressPercent < 85;

    return (
      <TouchableOpacity
        key={episode.id}
        style={[
          styles.episodeCardHorizontal,
          isTablet && styles.episodeCardHorizontalTablet,
          // Gradient border styling
          { 
            borderWidth: 1,
            borderColor: 'transparent',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 12,
          }
        ]}
        onPress={() => onSelectEpisode(episode)}
        activeOpacity={0.85}
      >
        {/* Gradient Border Container */}
        <View style={{
          position: 'absolute',
          top: -1,
          left: -1,
          right: -1,
          bottom: -1,
          borderRadius: 17,
          zIndex: -1,
        }}>
          <LinearGradient
            colors={[
              '#ffffff80', // White with 50% opacity
              '#ffffff40', // White with 25% opacity  
              '#ffffff20', // White with 12% opacity
              '#ffffff40', // White with 25% opacity
              '#ffffff80', // White with 50% opacity
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flex: 1,
              borderRadius: 17,
            }}
          />
        </View>

        {/* Background Image */}
        <Image
          source={{ uri: episodeImage }}
          style={styles.episodeBackgroundImage}
          contentFit="cover"
        />
        
        {/* Standard Gradient Overlay */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.05)',
            'rgba(0,0,0,0.2)', 
            'rgba(0,0,0,0.6)',
            'rgba(0,0,0,0.85)',
            'rgba(0,0,0,0.95)'
          ]}
          locations={[0, 0.2, 0.5, 0.8, 1]}
          style={styles.episodeGradient}
        >
          {/* Content Container */}
          <View style={styles.episodeContent}>
            {/* Episode Number Badge */}
            <View style={styles.episodeNumberBadgeHorizontal}>
            <Text style={styles.episodeNumberHorizontal}>{episodeString}</Text>
            </View>
            
            {/* Episode Title */}
            <Text style={styles.episodeTitleHorizontal} numberOfLines={2}>
              {episode.name}
            </Text>
            
            {/* Episode Description */}
            <Text style={styles.episodeDescriptionHorizontal} numberOfLines={3}>
              {episode.overview || 'No description available'}
            </Text>
            
            {/* Metadata Row */}
            <View style={styles.episodeMetadataRowHorizontal}>
              {episode.runtime && (
                <View style={styles.runtimeContainerHorizontal}>
                <Text style={styles.runtimeTextHorizontal}>
                  {formatRuntime(episode.runtime)}
                </Text>
                </View>
              )}
              {episode.vote_average > 0 && (
                <View style={styles.ratingContainerHorizontal}>
                  <MaterialIcons name="star" size={14} color="#FFD700" />
                  <Text style={styles.ratingTextHorizontal}>
                    {episode.vote_average.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          {/* Progress Bar */}
          {showProgress && (
            <View style={styles.progressBarContainerHorizontal}>
              <View 
                style={[
                  styles.progressBarHorizontal,
                  { 
                    width: `${progressPercent}%`, 
                    backgroundColor: currentTheme.colors.primary,
                  }
                ]} 
              />
            </View>
          )}
          
          {/* Completed Badge */}
          {progressPercent >= 85 && (
            <View style={[styles.completedBadgeHorizontal, { 
              backgroundColor: currentTheme.colors.primary,
            }]}>
              <MaterialIcons name="check" size={16} color="#fff" />
            </View>
          )}
          
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const currentSeasonEpisodes = groupedEpisodes[selectedSeason] || [];

  return (
    <View style={styles.container}>
      <Animated.View 
        entering={FadeIn.duration(300).delay(50)}
      >
        {renderSeasonSelector()}
      </Animated.View>
      
      <Animated.View 
        entering={FadeIn.duration(300).delay(100)}
      >
        <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
          {currentSeasonEpisodes.length} {currentSeasonEpisodes.length === 1 ? 'Episode' : 'Episodes'}
        </Text>
        
        {/* Show message when no episodes are available for selected season */}
        {currentSeasonEpisodes.length === 0 && (
          <View style={styles.centeredContainer}>
            <MaterialIcons name="schedule" size={48} color={currentTheme.colors.textMuted} />
            <Text style={[styles.centeredText, { color: currentTheme.colors.text }]}>
              No episodes available for Season {selectedSeason}
            </Text>
            <Text style={[styles.centeredSubText, { color: currentTheme.colors.textMuted }]}>
              Episodes may not be released yet
            </Text>
          </View>
        )}
        
        {/* Only render episode list if there are episodes */}
        {currentSeasonEpisodes.length > 0 && (
          settings.episodeLayoutStyle === 'horizontal' ? (
            // Horizontal Layout (Netflix-style)
            <FlatList
              ref={episodeScrollViewRef as React.RefObject<FlatList<any>>}
              data={currentSeasonEpisodes}
              renderItem={({ item: episode, index }) => (
                <Animated.View
                  key={episode.id}
                  entering={FadeIn.duration(300).delay(100 + index * 30)}
                  style={[
                    styles.episodeCardWrapperHorizontal,
                    isTablet && styles.episodeCardWrapperHorizontalTablet
                  ]}
                >
                  {renderHorizontalEpisodeCard(episode)}
                </Animated.View>
              )}
              keyExtractor={episode => episode.id.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.episodeListContentHorizontal}
              decelerationRate="fast"
              snapToInterval={isTablet ? width * 0.4 + 16 : width * 0.85 + 16}
              snapToAlignment="start"
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              windowSize={5}
            />
          ) : (
            // Vertical Layout (Traditional)
            <View 
              style={[
                styles.episodeList,
                isTablet ? styles.episodeListContentVerticalTablet : styles.episodeListContentVertical
              ]}
            >
              {isTablet ? (
                <View style={styles.episodeGridVertical}>
                  {currentSeasonEpisodes.map((episode, index) => (
                    <Animated.View 
                      key={episode.id}
                      entering={FadeIn.duration(300).delay(100 + index * 30)}
                    >
                      {renderVerticalEpisodeCard(episode)}
                    </Animated.View>
                  ))}
                </View>
              ) : (
                currentSeasonEpisodes.map((episode, index) => (
                  <Animated.View 
                    key={episode.id}
                    entering={FadeIn.duration(300).delay(100 + index * 30)}
                  >
                    {renderVerticalEpisodeCard(episode)}
                  </Animated.View>
                ))
              )}
            </View>
          )
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 16,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centeredText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  centeredSubText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  episodeList: {
    flex: 1,
  },
  
  // Vertical Layout Styles
  episodeListContentVertical: {
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  episodeListContentVerticalTablet: {
    paddingHorizontal: 8,
  },
  episodeGridVertical: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  episodeCardVertical: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    height: 120,
  },
  episodeCardVerticalTablet: {
    width: '48%',
    flexDirection: 'column',
    height: 120,
  },
  episodeImageContainer: {
    position: 'relative',
    width: 120,
    height: 120,
  },
  episodeImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.02 }],
  },
  episodeNumberBadge: {
    position: 'absolute',
    bottom: 8,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 1,
  },
  episodeNumberText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  episodeInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  episodeHeader: {
    marginBottom: 4,
  },
  episodeTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  episodeMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tmdbLogo: {
    width: 20,
    height: 14,
  },
  ratingText: {
    color: '#01b4e4',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  runtimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  runtimeText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  airDateText: {
    fontSize: 12,
    opacity: 0.8,
  },
  episodeOverview: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  progressBar: {
    height: '100%',
  },
  completedBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  // Horizontal Layout Styles
  episodeListContentHorizontal: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  episodeCardWrapperHorizontal: {
    width: Dimensions.get('window').width * 0.85,
    marginRight: 16,
  },
  episodeCardWrapperHorizontalTablet: {
    width: Dimensions.get('window').width * 0.4,
  },
  episodeCardHorizontal: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    height: 200,
    position: 'relative',
    width: '100%',
    backgroundColor: 'transparent',
  },
  episodeCardHorizontalTablet: {
    height: 180,
  },
  episodeBackgroundImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  episodeGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    justifyContent: 'flex-end',
  },
  episodeContent: {
    padding: 12,
    paddingBottom: 16,
  },
  episodeNumberBadgeHorizontal: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  episodeNumberHorizontal: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  episodeTitleHorizontal: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
    lineHeight: 18,
  },
  episodeDescriptionHorizontal: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
    opacity: 0.9,
  },
  episodeMetadataRowHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  runtimeContainerHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  runtimeTextHorizontal: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  ratingContainerHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    gap: 2,
  },
  ratingTextHorizontal: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  progressBarContainerHorizontal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBarHorizontal: {
    height: '100%',
    borderRadius: 2,
  },
  completedBadgeHorizontal: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  // Season Selector Styles
  seasonSelectorWrapper: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  seasonSelectorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  seasonSelectorContainer: {
    flexGrow: 0,
  },
  seasonSelectorContent: {
    paddingBottom: 8,
  },
  seasonButton: {
    alignItems: 'center',
    marginRight: 16,
    width: 100,
  },
  selectedSeasonButton: {
    opacity: 1,
  },
  seasonPosterContainer: {
    position: 'relative',
    width: 100,
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  seasonPoster: {
    width: '100%',
    height: '100%',
  },
  selectedSeasonIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  seasonButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedSeasonButtonText: {
    fontWeight: '700',
  },
  episodeCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  episodeCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
}); 