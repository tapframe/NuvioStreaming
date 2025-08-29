import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, useWindowDimensions, useColorScheme, FlatList } from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { Episode } from '../../types/metadata';
import { tmdbService } from '../../services/tmdbService';
import { storageService } from '../../services/storageService';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft, withTiming, withSpring, useSharedValue, useAnimatedStyle, Easing } from 'react-native-reanimated';
import { TraktService } from '../../services/traktService';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  // Delay item entering animations to avoid FlashList initial layout glitches
  const [enableItemAnimations, setEnableItemAnimations] = useState(false);
  // Local TMDB hydration for rating/runtime when addon (Cinemeta) lacks these
  const [tmdbEpisodeOverrides, setTmdbEpisodeOverrides] = useState<{ [epKey: string]: { vote_average?: number; runtime?: number; still_path?: string } }>({});
  
  // Add state for season view mode (persists for current show across navigation)
  const [seasonViewMode, setSeasonViewMode] = useState<'posters' | 'text'>('posters');
  
  // Animated values for view mode transitions
  const posterViewOpacity = useSharedValue(1);
  const textViewOpacity = useSharedValue(0);
  const posterViewTranslateX = useSharedValue(0);
  const textViewTranslateX = useSharedValue(50);
  const posterViewScale = useSharedValue(1);
  const textViewScale = useSharedValue(0.95);
  
  // Animated styles for view transitions
  const posterViewAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterViewOpacity.value,
    transform: [
      { translateX: posterViewTranslateX.value },
      { scale: posterViewScale.value }
    ],
  }));
  
  const textViewAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textViewOpacity.value,
    transform: [
      { translateX: textViewTranslateX.value },
      { scale: textViewScale.value }
    ],
  }));
  
  // Add refs for the scroll views
  const seasonScrollViewRef = useRef<ScrollView | null>(null);
  const episodeScrollViewRef = useRef<FlashListRef<Episode>>(null);
  const horizontalEpisodeScrollViewRef = useRef<FlatList<Episode>>(null);

  // Load saved view mode preference when component mounts or show changes
  useEffect(() => {
    const loadViewModePreference = async () => {
      if (metadata?.id) {
        try {
          const savedMode = await AsyncStorage.getItem(`season_view_mode_${metadata.id}`);
          if (savedMode === 'text' || savedMode === 'posters') {
            setSeasonViewMode(savedMode);
            console.log('[SeriesContent] Loaded saved view mode:', savedMode, 'for show:', metadata.id);
          }
        } catch (error) {
          console.log('[SeriesContent] Error loading view mode preference:', error);
        }
      }
    };
    
    loadViewModePreference();
  }, [metadata?.id]);

  // Initialize animated values based on current view mode
  useEffect(() => {
    if (seasonViewMode === 'text') {
      // Initialize text view as visible
      posterViewOpacity.value = 0;
      posterViewTranslateX.value = -60;
      posterViewScale.value = 0.95;
      textViewOpacity.value = 1;
      textViewTranslateX.value = 0;
      textViewScale.value = 1;
    } else {
      // Initialize poster view as visible
      posterViewOpacity.value = 1;
      posterViewTranslateX.value = 0;
      posterViewScale.value = 1;
      textViewOpacity.value = 0;
      textViewTranslateX.value = 50;
      textViewScale.value = 0.95;
    }
  }, [seasonViewMode]);

  // Save view mode preference when it changes
  const updateViewMode = (newMode: 'posters' | 'text') => {
    setSeasonViewMode(newMode);
    if (metadata?.id) {
      AsyncStorage.setItem(`season_view_mode_${metadata.id}`, newMode).catch(error => {
        console.log('[SeriesContent] Error saving view mode preference:', error);
      });
    }
  };

  // Animate view mode transition
  const animateViewModeTransition = (newMode: 'posters' | 'text') => {
    if (newMode === 'text') {
      // Animate to text view with spring animations for smoother feel
      posterViewOpacity.value = withTiming(0, { 
        duration: 250, 
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) 
      });
      posterViewTranslateX.value = withSpring(-60, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
      posterViewScale.value = withSpring(0.95, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
      
      textViewOpacity.value = withTiming(1, { 
        duration: 300, 
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) 
      });
      textViewTranslateX.value = withSpring(0, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
      textViewScale.value = withSpring(1, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
    } else {
      // Animate to poster view with spring animations
      textViewOpacity.value = withTiming(0, { 
        duration: 250, 
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) 
      });
      textViewTranslateX.value = withSpring(60, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
      textViewScale.value = withSpring(0.95, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
      
      posterViewOpacity.value = withTiming(1, { 
        duration: 300, 
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) 
      });
      posterViewTranslateX.value = withSpring(0, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
      posterViewScale.value = withSpring(1, { 
        damping: 20, 
        stiffness: 200,
        mass: 0.8
      });
    }
  };
  
  // Add refs for the scroll views
  


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
    
    // ---------------- Trakt watched-history integration ----------------
    try {
      const traktService = TraktService.getInstance();
      const isAuthed = await traktService.isAuthenticated();
      if (isAuthed && metadata?.id) {
        const historyItems = await traktService.getWatchedEpisodesHistory(1, 400);

        historyItems.forEach(item => {
          if (item.type !== 'episode') return;

          const showImdb = item.show?.ids?.imdb ? `tt${item.show.ids.imdb.replace(/^tt/, '')}` : null;
          if (!showImdb || showImdb !== metadata.id) return;

          const season = item.episode?.season;
          const epNum = item.episode?.number;
          if (season === undefined || epNum === undefined) return;

          const episodeId = `${metadata.id}:${season}:${epNum}`;
          const watchedAt = new Date(item.watched_at).getTime();

          // Mark as 100% completed (use 1/1 to avoid divide-by-zero)
          const traktProgressEntry = {
            currentTime: 1,
            duration: 1,
            lastUpdated: watchedAt,
          };

          const existing = progress[episodeId];
          const existingPercent = existing ? (existing.currentTime / existing.duration) * 100 : 0;

          // Prefer local progress if it is already >=85%; otherwise use Trakt data
          if (!existing || existingPercent < 85) {
            progress[episodeId] = traktProgressEntry;
          }
        });
      }
    } catch (err) {
      logger.error('[SeriesContent] Failed to merge Trakt history:', err);
    }
    
    setEpisodeProgress(progress);
  };

  // Function to find and scroll to the most recently watched episode
  const scrollToMostRecentEpisode = () => {
    if (!metadata?.id || !settings?.episodeLayoutStyle || settings.episodeLayoutStyle !== 'horizontal') {
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
        if (horizontalEpisodeScrollViewRef.current) {
          horizontalEpisodeScrollViewRef.current.scrollToOffset({
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

  // Hydrate TMDB rating/runtime for current season episodes if missing
  useEffect(() => {
    const hydrateFromTmdb = async () => {
      try {
        if (!metadata?.id || !selectedSeason) return;
        const currentSeasonEpisodes = groupedEpisodes[selectedSeason] || [];
        if (currentSeasonEpisodes.length === 0) return;

        // Check if hydration is needed
        const needsHydration = currentSeasonEpisodes.some(ep => !(ep as any).runtime || !(ep as any).vote_average);
        if (!needsHydration) return;

        // Resolve TMDB show id
        let tmdbShowId: number | null = null;
        if (metadata.id.startsWith('tmdb:')) {
          tmdbShowId = parseInt(metadata.id.split(':')[1], 10);
        } else if (metadata.id.startsWith('tt')) {
          tmdbShowId = await tmdbService.findTMDBIdByIMDB(metadata.id);
        }
        if (!tmdbShowId) return;

        // Fetch all episodes from TMDB and build override map for the current season
        const all = await tmdbService.getAllEpisodes(tmdbShowId);
        const overrides: { [k: string]: { vote_average?: number; runtime?: number; still_path?: string } } = {};
        const seasonEpisodes = all?.[selectedSeason] || [];
        seasonEpisodes.forEach((tmdbEp: any) => {
          const key = `${metadata.id}:${tmdbEp.season_number}:${tmdbEp.episode_number}`;
          overrides[key] = {
            vote_average: tmdbEp.vote_average,
            runtime: tmdbEp.runtime,
            still_path: tmdbEp.still_path,
          };
        });
        if (Object.keys(overrides).length > 0) {
          setTmdbEpisodeOverrides(prev => ({ ...prev, ...overrides }));
        }
      } catch (err) {
        logger.error('[SeriesContent] TMDB hydration failed:', err);
      }
    };

    hydrateFromTmdb();
  }, [metadata?.id, selectedSeason, groupedEpisodes]);

  // Enable item animations shortly after mount to avoid initial overlap/glitch
  useEffect(() => {
    const timer = setTimeout(() => setEnableItemAnimations(true), 200);
    return () => clearTimeout(timer);
  }, []);

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
    if (Object.keys(episodeProgress).length > 0 && selectedSeason && settings?.episodeLayoutStyle) {
      scrollToMostRecentEpisode();
    }
  }, [selectedSeason, episodeProgress, settings?.episodeLayoutStyle, groupedEpisodes]);



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
    
    console.log('[SeriesContent] renderSeasonSelector called, current view mode:', seasonViewMode);
    
    const seasons = Object.keys(groupedEpisodes).map(Number).sort((a, b) => a - b);
    
    return (
      <View style={[styles.seasonSelectorWrapper, isTablet && styles.seasonSelectorWrapperTablet]}>
        <View style={styles.seasonSelectorHeader}>
          <Text style={[
            styles.seasonSelectorTitle,
            isTablet && styles.seasonSelectorTitleTablet,
            { color: currentTheme.colors.highEmphasis }
          ]}>Seasons</Text>
          
          {/* Dropdown Toggle Button */}
          <TouchableOpacity
            style={[
              styles.seasonViewToggle, 
              { 
                backgroundColor: seasonViewMode === 'posters' 
                  ? currentTheme.colors.elevation2 
                  : currentTheme.colors.elevation3,
                borderColor: seasonViewMode === 'posters' 
                  ? 'rgba(255,255,255,0.2)' 
                  : 'rgba(255,255,255,0.3)'
              }
            ]}
            onPress={() => {
              const newMode = seasonViewMode === 'posters' ? 'text' : 'posters';
              animateViewModeTransition(newMode);
              updateViewMode(newMode);
              console.log('[SeriesContent] View mode changed to:', newMode, 'Current ref value:', seasonViewMode);
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.seasonViewToggleText, 
              { 
                color: seasonViewMode === 'posters' 
                  ? currentTheme.colors.mediumEmphasis 
                  : currentTheme.colors.highEmphasis
              }
            ]}>
              {seasonViewMode === 'posters' ? 'Posters' : 'Text'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <FlatList
          ref={seasonScrollViewRef as React.RefObject<FlatList<any>>}
          data={seasons}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.seasonSelectorContainer}
          contentContainerStyle={[styles.seasonSelectorContent, isTablet && styles.seasonSelectorContentTablet]}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={3}
          renderItem={({ item: season }) => {
            const seasonEpisodes = groupedEpisodes[season] || [];
            
            // Get season poster URL (needed for both views)
            let seasonPoster = DEFAULT_PLACEHOLDER;
            if (seasonEpisodes[0]?.season_poster_path) {
              const tmdbUrl = tmdbService.getImageUrl(seasonEpisodes[0].season_poster_path, 'w500');
              if (tmdbUrl) seasonPoster = tmdbUrl;
            } else if (metadata?.poster) {
              seasonPoster = metadata.poster;
            }
            
            if (seasonViewMode === 'text') {
              // Text-only view
              console.log('[SeriesContent] Rendering text view for season:', season, 'View mode ref:', seasonViewMode);
              return (
                <Animated.View 
                  key={season}
                  style={textViewAnimatedStyle}
                  entering={SlideInRight.duration(400).easing(Easing.bezier(0.25, 0.1, 0.25, 1.0))}
                  exiting={SlideOutLeft.duration(350).easing(Easing.bezier(0.25, 0.1, 0.25, 1.0))}
                >
                  <TouchableOpacity
                    style={[
                      styles.seasonTextButton,
                      isTablet && styles.seasonTextButtonTablet,
                      selectedSeason === season && styles.selectedSeasonTextButton
                    ]}
                    onPress={() => onSeasonChange(season)}
                  >
                    <Text style={[
                      styles.seasonTextButtonText,
                      isTablet && styles.seasonTextButtonTextTablet,
                      { color: currentTheme.colors.highEmphasis },
                      selectedSeason === season && [
                        styles.selectedSeasonTextButtonText,
                        isTablet && styles.selectedSeasonTextButtonTextTablet,
                        { color: currentTheme.colors.highEmphasis }
                      ]
                    ]} numberOfLines={1}>
                      Season {season}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            }
            
            // Poster view (current implementation)
            console.log('[SeriesContent] Rendering poster view for season:', season, 'View mode ref:', seasonViewMode);
            return (
              <Animated.View 
                key={season}
                style={posterViewAnimatedStyle}
                entering={SlideInRight.duration(400).easing(Easing.bezier(0.25, 0.1, 0.25, 1.0))}
                exiting={SlideOutLeft.duration(350).easing(Easing.bezier(0.25, 0.1, 0.25, 1.0))}
              >
                <TouchableOpacity
                  style={[
                    styles.seasonButton,
                    isTablet && styles.seasonButtonTablet,
                    selectedSeason === season && [styles.selectedSeasonButton, { borderColor: currentTheme.colors.primary }]
                  ]}
                  onPress={() => onSeasonChange(season)}
                >
                  <View style={[styles.seasonPosterContainer, isTablet && styles.seasonPosterContainerTablet]}>
                    <Image
                      source={{ uri: seasonPoster }}
                      style={styles.seasonPoster}
                      contentFit="cover"
                    />
                    {selectedSeason === season && (
                      <View style={[
                        styles.selectedSeasonIndicator,
                        isTablet && styles.selectedSeasonIndicatorTablet,
                        { backgroundColor: currentTheme.colors.primary }
                      ]} />
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
                      isTablet && styles.seasonButtonTextTablet,
                      { color: currentTheme.colors.mediumEmphasis },
                      selectedSeason === season && [
                        styles.selectedSeasonButtonText,
                        isTablet && styles.selectedSeasonButtonTextTablet,
                        { color: currentTheme.colors.primary }
                      ]
                    ]}
                  >
                    Season {season}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
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
      // Check if still_path is already a full URL
      if (episode.still_path.startsWith('http')) {
        episodeImage = episode.still_path;
      } else {
        const tmdbUrl = tmdbService.getImageUrl(episode.still_path, 'w500');
        if (tmdbUrl) episodeImage = tmdbUrl;
      }
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
    const tmdbOverride = tmdbEpisodeOverrides[`${metadata?.id}:${episode.season_number}:${episode.episode_number}`];
    const effectiveVote = (tmdbOverride?.vote_average ?? episode.vote_average) || 0;
    const effectiveRuntime = tmdbOverride?.runtime ?? (episode as any).runtime;
    if (!episode.still_path && tmdbOverride?.still_path) {
      const tmdbUrl = tmdbService.getImageUrl(tmdbOverride.still_path, 'w500');
      if (tmdbUrl) episodeImage = tmdbUrl;
    }
    const progress = episodeProgress[episodeId];
    const progressPercent = progress ? (progress.currentTime / progress.duration) * 100 : 0;
    
    // Don't show progress bar if episode is complete (>= 85%)
    const showProgress = progress && progressPercent < 85;

    return (
      <TouchableOpacity
        key={episode.id}
        style={[
          styles.episodeCardVertical, 
          { backgroundColor: currentTheme.colors.elevation2 }
        ]}
        onPress={() => onSelectEpisode(episode)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.episodeImageContainer,
          isTablet && styles.episodeImageContainerTablet
        ]}>
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

        <View style={[
          styles.episodeInfo,
          isTablet && styles.episodeInfoTablet
        ]}>
          <View style={[
            styles.episodeHeader,
            isTablet && styles.episodeHeaderTablet
          ]}>
            <Text style={[
              styles.episodeTitle,
              isTablet && styles.episodeTitleTablet,
              { color: currentTheme.colors.text }
            ]} numberOfLines={2}>
              {episode.name}
            </Text>
            <View style={[
              styles.episodeMetadata,
              isTablet && styles.episodeMetadataTablet
            ]}>
              {effectiveVote > 0 && (
                <View style={styles.ratingContainer}>
                  <Image
                    source={{ uri: TMDB_LOGO }}
                    style={styles.tmdbLogo}
                    contentFit="contain"
                  />
                  <Text style={[styles.ratingText, { color: currentTheme.colors.textMuted }]}>
                    {effectiveVote.toFixed(1)}
                  </Text>
                </View>
              )}
              {effectiveRuntime && (
                <View style={styles.runtimeContainer}>
                  <MaterialIcons name="schedule" size={14} color={currentTheme.colors.textMuted} />
                  <Text style={[styles.runtimeText, { color: currentTheme.colors.textMuted }]}>
                    {formatRuntime(effectiveRuntime)}
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
          <Text style={[
            styles.episodeOverview,
            isTablet && styles.episodeOverviewTablet,
            { color: currentTheme.colors.mediumEmphasis }
          ]} numberOfLines={isTablet ? 3 : 2}>
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
      // Check if still_path is already a full URL
      if (episode.still_path.startsWith('http')) {
        episodeImage = episode.still_path;
      } else {
        const tmdbUrl = tmdbService.getImageUrl(episode.still_path, 'w500');
        if (tmdbUrl) episodeImage = tmdbUrl;
      }
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
          <View style={[styles.episodeContent, isTablet && styles.episodeContentTablet]}>
            {/* Episode Number Badge */}
            <View style={[styles.episodeNumberBadgeHorizontal, isTablet && styles.episodeNumberBadgeHorizontalTablet]}>
            <Text style={[styles.episodeNumberHorizontal, isTablet && styles.episodeNumberHorizontalTablet]}>{episodeString}</Text>
            </View>
            
            {/* Episode Title */}
            <Text style={[styles.episodeTitleHorizontal, isTablet && styles.episodeTitleHorizontalTablet]} numberOfLines={2}>
              {episode.name}
            </Text>
            
            {/* Episode Description */}
            <Text style={[styles.episodeDescriptionHorizontal, isTablet && styles.episodeDescriptionHorizontalTablet]} numberOfLines={3}>
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
          (settings?.episodeLayoutStyle === 'horizontal') ? (
            // Horizontal Layout (Netflix-style) - Using FlatList
            <FlatList
              key={`episodes-${settings?.episodeLayoutStyle}-${selectedSeason}`}
              ref={horizontalEpisodeScrollViewRef}
              data={currentSeasonEpisodes}
              renderItem={({ item: episode, index }) => (
                <Animated.View
                  entering={enableItemAnimations ? FadeIn.duration(300).delay(100 + index * 30) : undefined as any}
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
              contentContainerStyle={isTablet ? styles.episodeListContentHorizontalTablet : styles.episodeListContentHorizontal}
              removeClippedSubviews
              initialNumToRender={3}
              maxToRenderPerBatch={5}
              windowSize={5}
              getItemLayout={(data, index) => {
                const cardWidth = isTablet ? width * 0.4 : width * 0.75;
                const margin = isTablet ? 20 : 16;
                return {
                  length: cardWidth + margin,
                  offset: (cardWidth + margin) * index,
                  index,
                };
              }}
            />
          ) : (
            // Vertical Layout (Traditional) - Using FlashList
            <FlashList
              key={`episodes-${settings?.episodeLayoutStyle}-${selectedSeason}`}
              ref={episodeScrollViewRef}
              data={currentSeasonEpisodes}
              renderItem={({ item: episode, index }) => (
                <Animated.View 
                  entering={enableItemAnimations ? FadeIn.duration(300).delay(100 + index * 30) : undefined as any}
                >
                  {renderVerticalEpisodeCard(episode)}
                </Animated.View>
              )}
              keyExtractor={episode => episode.id.toString()}
              contentContainerStyle={isTablet ? styles.episodeListContentVerticalTablet : styles.episodeListContentVertical}
              removeClippedSubviews
            />
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
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  episodeGridVertical: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
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
    width: '100%',
    flexDirection: 'row',
    height: 160,
    marginBottom: 16,
  },
  episodeImageContainer: {
    position: 'relative',
    width: 120,
    height: 120,
  },
  episodeImageContainerTablet: {
    width: 160,
    height: 160,
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
  episodeInfoTablet: {
    padding: 16,
  },
  episodeHeader: {
    marginBottom: 4,
  },
  episodeHeaderTablet: {
    marginBottom: 6,
  },
  episodeTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  episodeTitleTablet: {
    fontSize: 16,
    marginBottom: 4,
  },
  episodeMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  episodeMetadataTablet: {
    gap: 6,
    flexWrap: 'wrap',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // chip background removed
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
    // chip background removed
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
  episodeOverviewTablet: {
    fontSize: 14,
    lineHeight: 20,
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
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 2,
  },

  // Horizontal Layout Styles
  episodeListContentHorizontal: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  episodeListContentHorizontalTablet: {
    paddingLeft: 24,
    paddingRight: 24,
  },
  episodeCardWrapperHorizontal: {
    width: Dimensions.get('window').width * 0.75,
    marginRight: 16,
  },
  episodeCardWrapperHorizontalTablet: {
    width: Dimensions.get('window').width * 0.4,
    marginRight: 20,
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
    height: 260,
    borderRadius: 20,
    elevation: 12,
    shadowOpacity: 0.4,
    shadowRadius: 16,
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
  episodeContentTablet: {
    padding: 16,
    paddingBottom: 20,
  },
  episodeNumberBadgeHorizontal: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  episodeNumberBadgeHorizontalTablet: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
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
  episodeNumberHorizontalTablet: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.0,
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
  episodeTitleHorizontalTablet: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 6,
    lineHeight: 22,
  },
  episodeDescriptionHorizontal: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
    opacity: 0.9,
  },
  episodeDescriptionHorizontalTablet: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 10,
    opacity: 0.95,
  },
  episodeMetadataRowHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  runtimeContainerHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    // chip background removed
  },
  runtimeTextHorizontal: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  ratingContainerHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    // chip background removed
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
    top: 12,
    left: 12,
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
  seasonSelectorWrapperTablet: {
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  seasonSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seasonSelectorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 0, // Removed margin bottom here
  },
  seasonSelectorTitleTablet: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 0, // Removed margin bottom here
  },
  seasonSelectorContainer: {
    flexGrow: 0,
  },
  seasonSelectorContent: {
    paddingBottom: 8,
  },
  seasonSelectorContentTablet: {
    paddingBottom: 12,
  },
  seasonButton: {
    alignItems: 'center',
    marginRight: 16,
    width: 100,
  },
  seasonButtonTablet: {
    alignItems: 'center',
    marginRight: 20,
    width: 120,
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
  seasonPosterContainerTablet: {
    position: 'relative',
    width: 120,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
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
  selectedSeasonIndicatorTablet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  seasonButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  seasonButtonTextTablet: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectedSeasonButtonText: {
    fontWeight: '700',
  },
  selectedSeasonButtonTextTablet: {
    fontWeight: '800',
  },
  seasonViewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  seasonViewToggleText: {
    fontSize: 12,
    fontWeight: '500',
    marginRight: 4,
  },
  seasonTextButton: {
    alignItems: 'center',
    marginRight: 16,
    width: 110,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  seasonTextButtonTablet: {
    alignItems: 'center',
    marginRight: 20,
    width: 130,
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  selectedSeasonTextButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  seasonTextButtonText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  seasonTextButtonTextTablet: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  selectedSeasonTextButtonText: {
    fontWeight: '700',
  },
  selectedSeasonTextButtonTextTablet: {
    fontWeight: '800',
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