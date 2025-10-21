import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, useWindowDimensions, useColorScheme, FlatList } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { Episode } from '../../types/metadata';
import { tmdbService } from '../../services/tmdbService';
import { storageService } from '../../services/storageService';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { TraktService } from '../../services/traktService';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Enhanced responsive breakpoints for Seasons Section
const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  largeTablet: 1024,
  tv: 1440,
};

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
  const isDarkMode = useColorScheme() === 'dark';
  
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
  
  // Enhanced spacing and padding for seasons section
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

  // Match ThisWeekSection card sizing for horizontal episode cards
  const horizontalCardWidth = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return Math.min(deviceWidth * 0.25, 400);
      case 'largeTablet':
        return Math.min(deviceWidth * 0.35, 350);
      case 'tablet':
        return Math.min(deviceWidth * 0.46, 300);
      default:
        return width * 0.75;
    }
  }, [deviceType, deviceWidth, width]);

  const horizontalCardHeight = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 280;
      case 'largeTablet':
        return 250;
      case 'tablet':
        return 220;
      default:
        return 180;
    }
  }, [deviceType]);

  const horizontalItemSpacing = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 20;
      case 'largeTablet':
        return 18;
      case 'tablet':
        return 16;
      default:
        return 16;
    }
  }, [deviceType]);
  
  // Enhanced season poster sizing
  const seasonPosterWidth = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 140;
      case 'largeTablet':
        return 130;
      case 'tablet':
        return 120;
      default:
        return 100; // phone
    }
  }, [deviceType]);
  
  const seasonPosterHeight = useMemo(() => {
    switch (deviceType) {
      case 'tv':
        return 210;
      case 'largeTablet':
        return 195;
      case 'tablet':
        return 180;
      default:
        return 150; // phone
    }
  }, [deviceType]);
  
  const seasonButtonSpacing = useMemo(() => {
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
  
  const [episodeProgress, setEpisodeProgress] = useState<{ [key: string]: { currentTime: number; duration: number; lastUpdated: number } }>({});
  // Delay item entering animations to avoid FlashList initial layout glitches
  const [enableItemAnimations, setEnableItemAnimations] = useState(false);
  // Local TMDB hydration for rating/runtime when addon (Cinemeta) lacks these
  const [tmdbEpisodeOverrides, setTmdbEpisodeOverrides] = useState<{ [epKey: string]: { vote_average?: number; runtime?: number; still_path?: string } }>({});
  
  // Add state for season view mode (persists for current show across navigation)
  const [seasonViewMode, setSeasonViewMode] = useState<'posters' | 'text'>('posters');
  
  // View mode state (no animations)
  const [posterViewVisible, setPosterViewVisible] = useState(true);
  const [textViewVisible, setTextViewVisible] = useState(false);
  
  // Add refs for the scroll views
  const seasonScrollViewRef = useRef<ScrollView | null>(null);
  const episodeScrollViewRef = useRef<FlashListRef<Episode>>(null);
  const horizontalEpisodeScrollViewRef = useRef<FlatList<Episode>>(null);

  // Load saved global view mode preference when component mounts
  useEffect(() => {
    const loadViewModePreference = async () => {
      try {
        const savedMode = await AsyncStorage.getItem('global_season_view_mode');
        if (savedMode === 'text' || savedMode === 'posters') {
          setSeasonViewMode(savedMode);
          if (__DEV__) console.log('[SeriesContent] Loaded global view mode:', savedMode);
        }
      } catch (error) {
        if (__DEV__) console.log('[SeriesContent] Error loading global view mode preference:', error);
      }
    };
    
    loadViewModePreference();
  }, []);

  // Initialize view mode visibility based on current view mode
  useEffect(() => {
    if (seasonViewMode === 'text') {
      setPosterViewVisible(false);
      setTextViewVisible(true);
    } else {
      setPosterViewVisible(true);
      setTextViewVisible(false);
    }
  }, [seasonViewMode]);



  // Update view mode without animations
  const updateViewMode = (newMode: 'posters' | 'text') => {
    setSeasonViewMode(newMode);
    AsyncStorage.setItem('global_season_view_mode', newMode).catch(error => {
      if (__DEV__) console.log('[SeriesContent] Error saving global view mode preference:', error);
    });
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

  // Memory optimization: Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (__DEV__) console.log('[SeriesContent] Component unmounted, cleaning up memory');
      
      // Force garbage collection if available (development only)
      if (__DEV__ && global.gc) {
        global.gc();
      }
    };
  }, []);

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
    
    if (__DEV__) console.log('[SeriesContent] renderSeasonSelector called, current view mode:', seasonViewMode);
    
    const seasons = Object.keys(groupedEpisodes).map(Number).sort((a, b) => a - b);
    
    return (
      <View style={[
        styles.seasonSelectorWrapper,
        { paddingHorizontal: horizontalPadding }
      ]}>
        <View style={[
          styles.seasonSelectorHeader,
          {
            marginBottom: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12
          }
        ]}>
          <Text style={[
            styles.seasonSelectorTitle,
            { 
              color: currentTheme.colors.highEmphasis,
              fontSize: isTV ? 28 : isLargeTablet ? 26 : isTablet ? 24 : 18
            }
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
                  : 'rgba(255,255,255,0.3)',
                paddingHorizontal: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8,
                paddingVertical: isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 4,
                borderRadius: isTV ? 10 : isLargeTablet ? 8 : isTablet ? 6 : 6
              }
            ]}
            onPress={() => {
              const newMode = seasonViewMode === 'posters' ? 'text' : 'posters';
              updateViewMode(newMode);
              if (__DEV__) console.log('[SeriesContent] View mode changed to:', newMode, 'Current ref value:', seasonViewMode);
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.seasonViewToggleText, 
              { 
                color: seasonViewMode === 'posters' 
                  ? currentTheme.colors.mediumEmphasis 
                  : currentTheme.colors.highEmphasis,
                fontSize: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 12
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
          contentContainerStyle={[
            styles.seasonSelectorContent,
            {
              paddingBottom: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8
            }
          ]}
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
              if (__DEV__) console.log('[SeriesContent] Rendering text view for season:', season, 'View mode ref:', seasonViewMode);
              return (
                <View 
                  key={season}
                  style={{ opacity: textViewVisible ? 1 : 0 }}
                >
                  <TouchableOpacity
                    style={[
                      styles.seasonTextButton,
                      {
                        marginRight: seasonButtonSpacing,
                        width: isTV ? 150 : isLargeTablet ? 140 : isTablet ? 130 : 110,
                        paddingVertical: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12,
                        paddingHorizontal: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 16,
                        borderRadius: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12
                      },
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
                </View>
              );
            }
            
            // Poster view (current implementation)
            if (__DEV__) console.log('[SeriesContent] Rendering poster view for season:', season, 'View mode ref:', seasonViewMode);
            return (
              <View 
                key={season}
                style={{ opacity: posterViewVisible ? 1 : 0 }}
              >
                <TouchableOpacity
                  style={[
                    styles.seasonButton,
                    {
                      marginRight: seasonButtonSpacing,
                      width: seasonPosterWidth
                    },
                    selectedSeason === season && [styles.selectedSeasonButton, { borderColor: currentTheme.colors.primary }]
                  ]}
                  onPress={() => onSeasonChange(season)}
                >
                  <View style={[
                    styles.seasonPosterContainer,
                    {
                      width: seasonPosterWidth,
                      height: seasonPosterHeight,
                      borderRadius: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 8,
                      marginBottom: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8
                    }
                  ]}>
                    <FastImage
                      source={{ uri: seasonPoster }}
                      style={styles.seasonPoster}
                      resizeMode={FastImage.resizeMode.cover}
                    />
                    {selectedSeason === season && (
                      <View style={[
                        styles.selectedSeasonIndicator,
                        {
                          backgroundColor: currentTheme.colors.primary,
                          height: isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 4
                        }
                      ]} />
                    )}

                  </View>
                  <Text 
                    style={[
                      styles.seasonButtonText,
                      { 
                        color: currentTheme.colors.mediumEmphasis,
                        fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14
                      },
                      selectedSeason === season && [
                        styles.selectedSeasonButtonText,
                        { color: currentTheme.colors.primary }
                      ]
                    ]}
                  >
                    Season {season}
                  </Text>
                </TouchableOpacity>
                </View>
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
          { 
            backgroundColor: currentTheme.colors.elevation2,
            borderRadius: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 16,
            marginBottom: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 16,
            height: isTV ? 200 : isLargeTablet ? 180 : isTablet ? 160 : 120
          }
        ]}
        onPress={() => onSelectEpisode(episode)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.episodeImageContainer,
          {
            width: isTV ? 200 : isLargeTablet ? 180 : isTablet ? 160 : 120,
            height: isTV ? 200 : isLargeTablet ? 180 : isTablet ? 160 : 120
          }
        ]}>
          <FastImage
            source={{ uri: episodeImage }}
            style={styles.episodeImage}
            resizeMode={FastImage.resizeMode.cover}
          />
          <View style={[
            styles.episodeNumberBadge,
            {
              paddingHorizontal: isTV ? 8 : isLargeTablet ? 7 : isTablet ? 6 : 6,
              paddingVertical: isTV ? 4 : isLargeTablet ? 3 : isTablet ? 2 : 2,
              borderRadius: isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 4
            }
          ]}>
            <Text style={[
              styles.episodeNumberText,
              {
                fontSize: isTV ? 13 : isLargeTablet ? 12 : isTablet ? 11 : 11,
                fontWeight: '600'
              }
            ]}>{episodeString}</Text>
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
            <View style={[
              styles.completedBadge,
              {
                backgroundColor: currentTheme.colors.primary,
                width: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20,
                height: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20,
                borderRadius: isTV ? 12 : isLargeTablet ? 11 : isTablet ? 10 : 10
              }
            ]}>
              <MaterialIcons name="check" size={isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 12} color={currentTheme.colors.white} />
            </View>
          )}
          {(!progress || progressPercent === 0) && (
            <View style={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20,
              height: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20,
              borderRadius: isTV ? 12 : isLargeTablet ? 11 : isTablet ? 10 : 10,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: currentTheme.colors.textMuted,
              opacity: 0.85,
            }} />
          )}
        </View>

        <View style={[
          styles.episodeInfo,
          {
            paddingLeft: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 12,
            flex: 1,
            justifyContent: 'center'
          }
        ]}>
          <View style={[
            styles.episodeHeader,
            {
              marginBottom: isTV ? 8 : isLargeTablet ? 6 : isTablet ? 6 : 4
            }
          ]}>
            <Text style={[
              styles.episodeTitle,
              { 
                color: currentTheme.colors.text,
                fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 15,
                lineHeight: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 18,
                marginBottom: isTV ? 4 : isLargeTablet ? 3 : isTablet ? 2 : 2
              }
            ]} numberOfLines={isLargeScreen ? 3 : 2}>
              {episode.name}
            </Text>
            <View style={[
              styles.episodeMetadata,
              {
                gap: isTV ? 8 : isLargeTablet ? 7 : isTablet ? 6 : 4,
                flexWrap: 'wrap'
              }
            ]}>
              {effectiveVote > 0 && (
                <View style={styles.ratingContainer}>
                  <FastImage
                    source={{ uri: TMDB_LOGO }}
                    style={[
                      styles.tmdbLogo,
                      {
                        width: isTV ? 22 : isLargeTablet ? 20 : isTablet ? 20 : 20,
                        height: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 14
                      }
                    ]}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <Text style={[
                    styles.ratingText,
                    {
                      color: currentTheme.colors.textMuted,
                      fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 13 : 13
                    }
                  ]}>
                    {effectiveVote.toFixed(1)}
                  </Text>
                </View>
              )}
              {effectiveRuntime && (
                <View style={styles.runtimeContainer}>
                  <MaterialIcons name="schedule" size={isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 14} color={currentTheme.colors.textMuted} />
                  <Text style={[
                    styles.runtimeText,
                    {
                      color: currentTheme.colors.textMuted,
                      fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 13 : 13
                    }
                  ]}>
                    {formatRuntime(effectiveRuntime)}
                  </Text>
                </View>
              )}
              {episode.air_date && (
                <Text style={[
                  styles.airDateText,
                  {
                    color: currentTheme.colors.textMuted,
                    fontSize: isTV ? 13 : isLargeTablet ? 12 : isTablet ? 12 : 12
                  }
                ]}>
                  {formatDate(episode.air_date)}
                </Text>
              )}
            </View>
          </View>
          <Text style={[
            styles.episodeOverview,
            {
              color: currentTheme.colors.mediumEmphasis,
              fontSize: isTV ? 15 : isLargeTablet ? 14 : isTablet ? 14 : 13,
              lineHeight: isTV ? 22 : isLargeTablet ? 20 : isTablet ? 20 : 18
            }
          ]} numberOfLines={isLargeScreen ? 4 : isTablet ? 3 : 2}>
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
          {
            borderRadius: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 16,
            height: horizontalCardHeight,
            elevation: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 8,
            shadowOpacity: isTV ? 0.4 : isLargeTablet ? 0.35 : isTablet ? 0.3 : 0.3,
            shadowRadius: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 8
          },
          // Gradient border styling
          { 
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
          }
        ]}
        onPress={() => onSelectEpisode(episode)}
        activeOpacity={0.85}
      >
        {/* Solid outline replaces gradient border */}

        {/* Background Image */}
        <FastImage
          source={{ uri: episodeImage }}
          style={styles.episodeBackgroundImage}
          resizeMode={FastImage.resizeMode.cover}
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
          <View style={[
            styles.episodeContent,
            {
              padding: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 12,
              paddingBottom: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 16
            }
          ]}>
            {/* Episode Number Badge */}
            <View style={[
              styles.episodeNumberBadgeHorizontal,
              {
                paddingHorizontal: isTV ? 10 : isLargeTablet ? 8 : isTablet ? 6 : 6,
                paddingVertical: isTV ? 5 : isLargeTablet ? 4 : isTablet ? 3 : 3,
                borderRadius: isTV ? 8 : isLargeTablet ? 6 : isTablet ? 4 : 4,
                marginBottom: isTV ? 10 : isLargeTablet ? 8 : isTablet ? 6 : 6
              }
            ]}>
            <Text style={[
              styles.episodeNumberHorizontal,
              {
                fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 10,
                fontWeight: isTV ? '700' : isLargeTablet ? '700' : isTablet ? '600' : '600'
              }
            ]}>{episodeString}</Text>
            </View>
            
            {/* Episode Title */}
            <Text style={[
              styles.episodeTitleHorizontal,
              {
                fontSize: isTV ? 20 : isLargeTablet ? 19 : isTablet ? 18 : 15,
                fontWeight: isTV ? '800' : isLargeTablet ? '800' : isTablet ? '700' : '700',
                lineHeight: isTV ? 26 : isLargeTablet ? 24 : isTablet ? 22 : 18,
                marginBottom: isTV ? 8 : isLargeTablet ? 6 : isTablet ? 4 : 4
              }
            ]} numberOfLines={2}>
              {episode.name}
            </Text>
            
            {/* Episode Description */}
            <Text style={[
              styles.episodeDescriptionHorizontal,
              {
                fontSize: isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 12,
                lineHeight: isTV ? 22 : isLargeTablet ? 20 : isTablet ? 18 : 16,
                marginBottom: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8,
                opacity: isTV ? 0.95 : isLargeTablet ? 0.9 : isTablet ? 0.9 : 0.9
              }
            ]} numberOfLines={isLargeScreen ? 4 : 3}>
              {episode.overview || 'No description available'}
            </Text>
            
            {/* Metadata Row */}
            <View style={[
              styles.episodeMetadataRowHorizontal,
              {
                gap: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 8 : 8
              }
            ]}>
              {episode.runtime && (
                <View style={styles.runtimeContainerHorizontal}>
                <Text style={[
                  styles.runtimeTextHorizontal,
                  {
                    fontSize: isTV ? 13 : isLargeTablet ? 12 : isTablet ? 11 : 11,
                    fontWeight: isTV ? '600' : isLargeTablet ? '500' : isTablet ? '500' : '500'
                  }
                ]}>
                  {formatRuntime(episode.runtime)}
                </Text>
                </View>
              )}
              {episode.vote_average > 0 && (
                <View style={styles.ratingContainerHorizontal}>
                  <MaterialIcons name="star" size={isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 14} color="#FFD700" />
                  <Text style={[
                    styles.ratingTextHorizontal,
                    {
                      fontSize: isTV ? 13 : isLargeTablet ? 12 : isTablet ? 11 : 11,
                      fontWeight: isTV ? '600' : isLargeTablet ? '600' : isTablet ? '600' : '600'
                    }
                  ]}>
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
            <View style={[
              styles.completedBadgeHorizontal,
              { 
                backgroundColor: currentTheme.colors.primary,
                width: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 24 : 24,
                height: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 24 : 24,
                borderRadius: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12,
                top: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12,
                left: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12
              }
            ]}>
              <MaterialIcons name="check" size={isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 16} color="#fff" />
            </View>
          )}
          {(!progress || progressPercent === 0) && (
            <View style={{
              position: 'absolute',
              top: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12,
              left: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12,
              width: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 24 : 24,
              height: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 24 : 24,
              borderRadius: isTV ? 16 : isLargeTablet ? 14 : isTablet ? 12 : 12,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: currentTheme.colors.textMuted,
              opacity: 0.9,
            }} />
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
        <Text style={[
          styles.sectionTitle,
          {
            color: currentTheme.colors.highEmphasis,
            fontSize: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20,
            marginBottom: isTV ? 20 : isLargeTablet ? 18 : isTablet ? 16 : 16,
            paddingHorizontal: horizontalPadding
          }
        ]}>
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
                    {
                      width: horizontalCardWidth,
                      marginRight: horizontalItemSpacing
                    }
                  ]}
                >
                  {renderHorizontalEpisodeCard(episode)}
                </Animated.View>
              )}
              keyExtractor={episode => episode.id.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[
                styles.episodeListContentHorizontal,
                {
                  paddingLeft: horizontalPadding,
                  paddingRight: horizontalPadding
                }
              ]}
              removeClippedSubviews
              initialNumToRender={3}
              maxToRenderPerBatch={5}
              windowSize={5}
              getItemLayout={(data, index) => {
                const length = horizontalCardWidth + horizontalItemSpacing;
                return {
                  length,
                  offset: length * index,
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
              contentContainerStyle={[
                styles.episodeListContentVertical,
                {
                  paddingHorizontal: horizontalPadding,
                  paddingBottom: isTV ? 32 : isLargeTablet ? 28 : isTablet ? 24 : 8
                }
              ]}
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
    paddingBottom: 8,
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
    // Padding will be added responsively
  },
  episodeCardWrapperHorizontal: {
    // Dimensions will be set responsively
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
  },
  selectedSeasonButton: {
    opacity: 1,
  },
  seasonPosterContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
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
    justifyContent: 'center',
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

});