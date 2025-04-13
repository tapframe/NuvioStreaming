import React, { useCallback, useMemo, memo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  SectionList,
  Platform,
  ImageBackground,
  ScrollView,
  StatusBar,
  Alert
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { RootStackParamList, RootStackNavigationProp } from '../navigation/AppNavigator';
import { useMetadata } from '../hooks/useMetadata';
import { colors } from '../styles/colors';
import { Stream } from '../types/metadata';
import { tmdbService } from '../services/tmdbService';
import { stremioService } from '../services/stremioService';
import { VideoPlayerService } from '../services/videoPlayerService';
import { useSettings } from '../hooks/useSettings';
import QualityBadge from '../components/metadata/QualityBadge';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInDown,
  withSpring,
  withTiming,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolate,
  runOnJS,
  cancelAnimation,
  SharedValue
} from 'react-native-reanimated';
import { torrentService } from '../services/torrentService';
import { TorrentProgress } from '../services/torrentService';
import { logger } from '../utils/logger';

const TMDB_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tmdb.new.logo.svg/512px-Tmdb.new.logo.svg.png?20200406190906';
const HDR_ICON = 'https://uxwing.com/wp-content/themes/uxwing/download/video-photography-multimedia/hdr-icon.png';
const DOLBY_ICON = 'https://upload.wikimedia.org/wikipedia/en/thumb/3/3f/Dolby_Vision_%28logo%29.svg/512px-Dolby_Vision_%28logo%29.svg.png?20220908042900';

// Extracted Components
const StreamCard = memo(({ stream, onPress, index, torrentProgress, isLoading, statusMessage }: { 
  stream: Stream; 
  onPress: () => void; 
  index: number;
  torrentProgress?: TorrentProgress;
  isLoading?: boolean;
  statusMessage?: string;
}) => {
  const quality = stream.title?.match(/(\d+)p/)?.[1] || null;
  const isHDR = stream.title?.toLowerCase().includes('hdr');
  const isDolby = stream.title?.toLowerCase().includes('dolby') || stream.title?.includes('DV');
  const size = stream.title?.match(/💾\s*([\d.]+\s*[GM]B)/)?.[1];
  const isTorrent = stream.url?.startsWith('magnet:') || stream.behaviorHints?.isMagnetStream;
  const isDebrid = stream.behaviorHints?.cached;

  const displayTitle = stream.name || stream.title || 'Unnamed Stream';
  const displayAddonName = stream.title || '';

  // Only disable if it's a torrent that's not debrid and not currently downloading
  const isDisabled = isTorrent && !isDebrid && !torrentProgress && !stream.behaviorHints?.notWebReady;

  // Keep track of downloading status
  const isDownloading = !!torrentProgress && isTorrent;

  return (
    <TouchableOpacity 
      style={[
        styles.streamCard, 
        isDisabled && styles.streamCardDisabled,
        isLoading && styles.streamCardLoading
      ]} 
      onPress={onPress}
      disabled={isDisabled || isLoading}
      activeOpacity={0.7}
    >
      <View style={styles.streamDetails}>
        <View style={styles.streamNameRow}>
          <View style={styles.streamTitleContainer}>
            <Text style={styles.streamName}>
              {displayTitle}
            </Text>
            {displayAddonName && displayAddonName !== displayTitle && (
              <Text style={styles.streamAddonName}>
                {displayAddonName}
              </Text>
            )}
          </View>
          
          {/* Show loading indicator if stream is loading */}
          {isLoading && (
            <View style={styles.loadingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>
                {statusMessage || "Loading..."}
              </Text>
            </View>
          )}
          
          {/* Show download indicator for active downloads */}
          {isDownloading && (
            <View style={styles.downloadingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.downloadingText}>Downloading...</Text>
            </View>
          )}
        </View>
        
        <View style={styles.streamMetaRow}>
          {quality && quality >= "720" && (
            <QualityBadge type="HD" />
          )}
          
          {isDolby && (
            <QualityBadge type="VISION" />
          )}
          
          {size && (
            <View style={[styles.chip, { backgroundColor: colors.darkGray }]}>
              <Text style={styles.chipText}>{size}</Text>
            </View>
          )}
          
          {isTorrent && !isDebrid && (
            <View style={[styles.chip, { backgroundColor: colors.error }]}>
              <Text style={styles.chipText}>TORRENT</Text>
            </View>
          )}
          
          {isDebrid && (
            <View style={[styles.chip, { backgroundColor: colors.success }]}>
              <Text style={styles.chipText}>DEBRID</Text>
            </View>
          )}
        </View>

        {/* Render progress bar if there's progress */}
        {torrentProgress && (
          <View style={styles.progressContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${torrentProgress.bufferProgress}%` }
              ]} 
            />
            <Text style={styles.progressText}>
              {`${Math.round(torrentProgress.bufferProgress)}% • ${Math.round(torrentProgress.downloadSpeed / 1024)} KB/s • ${torrentProgress.seeds} seeds`}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.streamAction}>
        <MaterialIcons 
          name="play-arrow" 
          size={24} 
          color={isDisabled ? colors.textMuted : colors.primary} 
        />
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  // Simplified memo comparison that won't interfere with onPress
  return (
    prevProps.stream.url === nextProps.stream.url &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.torrentProgress?.bufferProgress === nextProps.torrentProgress?.bufferProgress &&
    prevProps.statusMessage === nextProps.statusMessage
  );
});

const QualityTag = React.memo(({ text, color }: { text: string; color: string }) => (
  <View style={[styles.chip, { backgroundColor: color }]}>
    <Text style={styles.chipText}>{text}</Text>
  </View>
));

const ProviderFilter = memo(({ 
  selectedProvider, 
  providers, 
  onSelect 
}: { 
  selectedProvider: string; 
  providers: Array<{ id: string; name: string; }>; 
  onSelect: (id: string) => void;
}) => {
  const renderItem = useCallback(({ item }: { item: { id: string; name: string } }) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.filterChip,
        selectedProvider === item.id && styles.filterChipSelected
      ]}
      onPress={() => onSelect(item.id)}
    >
      <Text style={[
        styles.filterChipText,
        selectedProvider === item.id && styles.filterChipTextSelected
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  ), [selectedProvider, onSelect]);

  return (
    <FlatList
      data={providers}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      bounces={true}
      overScrollMode="never"
      decelerationRate="fast"
      initialNumToRender={5}
      maxToRenderPerBatch={3}
      windowSize={3}
      getItemLayout={(data, index) => ({
        length: 100, // Approximate width of each item
        offset: 100 * index,
        index,
      })}
    />
  );
});

export const StreamsScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Streams'>>();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { id, type, episodeId } = route.params;
  const { settings } = useSettings();

  // Log the stream details and installed addons for debugging
  useEffect(() => {
    // Log installed addons
    const installedAddons = stremioService.getInstalledAddons();
    console.log('📦 [StreamsScreen] INSTALLED ADDONS:', installedAddons.map(addon => ({
      id: addon.id,
      name: addon.name,
      version: addon.version,
      resources: addon.resources,
      types: addon.types
    })));

    // Log request details
    console.log('🎬 [StreamsScreen] REQUEST DETAILS:', {
      id,
      type,
      episodeId: episodeId || 'none'
    });
  }, [id, type, episodeId]);

  // Add timing logs
  const [loadStartTime, setLoadStartTime] = useState(0);
  const [providerLoadTimes, setProviderLoadTimes] = useState<{[key: string]: number}>({});
  
  const {
    metadata,
    episodes,
    groupedStreams,
    loadingStreams,
    episodeStreams,
    loadingEpisodeStreams,
    selectedEpisode,
    loadStreams,
    loadEpisodeStreams,
    setSelectedEpisode,
    groupedEpisodes,
  } = useMetadata({ id, type });

  // Log stream results when they arrive
  useEffect(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    console.log('🔍 [StreamsScreen] STREAM RESULTS:', {
      totalProviders: Object.keys(streams).length,
      providers: Object.keys(streams),
      streamCounts: Object.entries(streams).map(([provider, data]) => ({
        provider,
        addonName: data.addonName,
        streams: data.streams.length
      }))
    });
  }, [episodeStreams, groupedStreams, type]);

  const [selectedProvider, setSelectedProvider] = React.useState('all');
  const [availableProviders, setAvailableProviders] = React.useState<Set<string>>(new Set());

  // Optimize animation values with cleanup
  const headerOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.95);
  const filterOpacity = useSharedValue(0);

  // Add new state for torrent progress
  const [torrentProgress, setTorrentProgress] = React.useState<{[key: string]: TorrentProgress}>({});
  const [activeTorrent, setActiveTorrent] = React.useState<string | null>(null);

  // Add new state to track video player status
  const [isVideoPlaying, setIsVideoPlaying] = React.useState(false);
  
  // Add state for provider loading status
  const [loadingProviders, setLoadingProviders] = useState<{[key: string]: boolean}>({});
  
  // Add state for more detailed provider loading tracking
  const [providerStatus, setProviderStatus] = useState<{
    [key: string]: {
      loading: boolean;
      success: boolean;
      error: boolean;
      message: string;
      timeStarted: number;
      timeCompleted: number;
    }
  }>({});

  // Monitor streams loading start
  useEffect(() => {
    if (loadingStreams || loadingEpisodeStreams) {
      logger.log("⏱️ Stream loading started");
      const now = Date.now();
      setLoadStartTime(now);
      setProviderLoadTimes({});
      
      // Reset provider status
      setProviderStatus({
        'source_1': {
          loading: true,
          success: false,
          error: false,
          message: 'Loading...',
          timeStarted: now,
          timeCompleted: 0
        },
        'source_2': {
          loading: true,
          success: false,
          error: false,
          message: 'Loading...',
          timeStarted: now,
          timeCompleted: 0
        },
        'stremio': {
          loading: true,
          success: false,
          error: false,
          message: 'Loading...',
          timeStarted: now,
          timeCompleted: 0
        }
      });
      
      // Also update the simpler loading state
      setLoadingProviders({
        'source_1': true, 
        'source_2': true,
        'stremio': true
      });
    }
  }, [loadingStreams, loadingEpisodeStreams]);
  
  // Monitor new provider results as they appear
  useEffect(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    const now = Date.now();
    
    // Check for new providers
    Object.keys(streams).forEach(provider => {
      // Identify the parent provider (source_1, source_2, stremio addon)
      let parentProvider = provider;
      if (provider !== 'source_1' && provider !== 'source_2') {
        parentProvider = 'stremio';
      }
      
      // Update provider status when new streams appear
      setProviderStatus(prev => {
        const loadTime = now - loadStartTime;
        logger.log(`✅ Provider "${parentProvider}" loaded successfully after ${loadTime}ms with ${streams[provider].streams.length} streams`);
        
        // Only update if it was previously loading
        if (prev[parentProvider]?.loading) {
          return {
            ...prev,
            [parentProvider]: {
              ...prev[parentProvider],
              loading: false,
              success: true,
              message: `Loaded ${streams[provider].streams.length} streams`,
              timeCompleted: now
            }
          };
        }
        return prev;
      });
      
      // Update the simpler loading state
      setLoadingProviders((prev: {[key: string]: boolean}) => ({...prev, [parentProvider]: false}));
    });
  }, [episodeStreams, groupedStreams, type, loadStartTime]);
  
  // Mark loading as complete when all loading is done
  useEffect(() => {
    if (!loadingStreams && !loadingEpisodeStreams) {
      // Check for any providers that are still marked as loading but didn't complete
      setProviderStatus(prev => {
        const updatedStatus = {...prev};
        let updated = false;
        
        Object.keys(updatedStatus).forEach(provider => {
          if (updatedStatus[provider]?.loading) {
            updatedStatus[provider] = {
              ...updatedStatus[provider],
              loading: false,
              error: true,
              message: 'Failed to load',
              timeCompleted: Date.now()
            };
            updated = true;
            logger.log(`⚠️ Provider "${provider}" timed out or failed`);
            
            // Update the simpler loading state
            setLoadingProviders((prevLoading: {[key: string]: boolean}) => ({...prevLoading, [provider]: false}));
          }
        });
        
        return updated ? updatedStatus : prev;
      });
    }
  }, [loadingStreams, loadingEpisodeStreams]);

  React.useEffect(() => {
    if (type === 'series' && episodeId) {
      logger.log(`🎬 Loading episode streams for: ${episodeId}`);
      setLoadingProviders({
        'source_1': true, 
        'source_2': true,
        'stremio': true
      });
      setSelectedEpisode(episodeId);
      loadEpisodeStreams(episodeId);
    } else if (type === 'movie') {
      logger.log(`🎬 Loading movie streams for: ${id}`);
      setLoadingProviders({
        'source_1': true, 
        'source_2': true,
        'stremio': true
      });
      loadStreams();
    }
  }, [type, episodeId]);

  React.useEffect(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    const providers = new Set(Object.keys(streams));
    setAvailableProviders(providers);
  }, [type, groupedStreams, episodeStreams]);

  React.useEffect(() => {
    // Trigger entrance animations
    headerOpacity.value = withTiming(1, { duration: 400 });
    heroScale.value = withSpring(1, {
      damping: 15,
      stiffness: 100,
      mass: 0.9,
      restDisplacementThreshold: 0.01
    });
    filterOpacity.value = withTiming(1, { duration: 500 });

    return () => {
      // Cleanup animations on unmount
      cancelAnimation(headerOpacity);
      cancelAnimation(heroScale);
      cancelAnimation(filterOpacity);
    };
  }, []);

  // Memoize handlers
  const handleBack = useCallback(() => {
    const cleanup = () => {
      headerOpacity.value = withTiming(0, { duration: 200 });
      heroScale.value = withTiming(0.95, { duration: 200 });
      filterOpacity.value = withTiming(0, { duration: 200 });
    };
    cleanup();
    
    // For series episodes, always replace current screen with metadata screen
    if (type === 'series') {
      navigation.replace('Metadata', {
        id: id,
        type: type
      });
    } else {
      navigation.goBack();
    }
  }, [navigation, headerOpacity, heroScale, filterOpacity, type, id]);

  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
  }, []);

  const currentEpisode = useMemo(() => {
    if (!selectedEpisode) return null;

    // Search through all episodes in all seasons
    const allEpisodes = Object.values(groupedEpisodes).flat();
    return allEpisodes.find(ep => 
      ep.stremioId === selectedEpisode || 
      `${id}:${ep.season_number}:${ep.episode_number}` === selectedEpisode
    );
  }, [selectedEpisode, groupedEpisodes, id]);

  // Update handleStreamPress
  const handleStreamPress = useCallback(async (stream: Stream) => {
    try {
      if (stream.url) {
        logger.log('handleStreamPress called with stream:', {
          url: stream.url,
          behaviorHints: stream.behaviorHints,
          isMagnet: stream.url.startsWith('magnet:'),
          isMagnetStream: stream.behaviorHints?.isMagnetStream,
          useExternalPlayer: settings.useExternalPlayer
        });
        
        // Check if it's a magnet link either directly or through behaviorHints
        const isMagnet = stream.url.startsWith('magnet:') || stream.behaviorHints?.isMagnetStream;
        
        if (isMagnet) {
          logger.log('Handling magnet link...');
          // Check if there's already an active torrent
          if (activeTorrent && activeTorrent !== stream.url) {
            Alert.alert(
              'Active Download',
              'There is already an active download. Do you want to stop it and start this one?',
              [
                {
                  text: 'Cancel',
                  style: 'cancel'
                },
                {
                  text: 'Stop and Switch',
                  style: 'destructive',
                  onPress: async () => {
                    logger.log('Stopping current torrent and starting new one');
                    await torrentService.stopStreamAndWait();
                    setActiveTorrent(null);
                    setTorrentProgress({});
                    startTorrentStream(stream);
                  }
                }
              ]
            );
            return;
          }

          logger.log('Starting torrent stream...');
          startTorrentStream(stream);
        } else {
          logger.log('Playing regular stream...');
          
          // Check if external player is enabled in settings
          if (settings.useExternalPlayer) {
            logger.log('Using external player for URL:', stream.url);
            // Use VideoPlayerService to launch external player
            const videoPlayerService = VideoPlayerService;
            const launched = await videoPlayerService.playVideo(stream.url, {
              useExternalPlayer: true,
              title: metadata?.name || '',
              episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
              episodeNumber: type === 'series' ? `S${currentEpisode?.season_number}E${currentEpisode?.episode_number}` : undefined,
              releaseDate: metadata?.year?.toString(),
            });

            if (!launched) {
              logger.log('External player launch failed, falling back to built-in player');
              navigation.navigate('Player', {
                uri: stream.url,
                title: metadata?.name || '',
                episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
                season: type === 'series' ? currentEpisode?.season_number : undefined,
                episode: type === 'series' ? currentEpisode?.episode_number : undefined,
                quality: stream.title?.match(/(\d+)p/)?.[1] || undefined,
                year: metadata?.year,
                streamProvider: stream.name,
                id,
                type,
                episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined
              });
            }
          } else {
            // Use built-in player
            navigation.navigate('Player', {
              uri: stream.url,
              title: metadata?.name || '',
              episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
              season: type === 'series' ? currentEpisode?.season_number : undefined,
              episode: type === 'series' ? currentEpisode?.episode_number : undefined,
              quality: stream.title?.match(/(\d+)p/)?.[1] || undefined,
              year: metadata?.year,
              streamProvider: stream.name,
              id,
              type,
              episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined
            });
          }
        }
      }
    } catch (error) {
      logger.error('Stream error:', error);
      Alert.alert(
        'Playback Error',
        error instanceof Error ? error.message : 'An error occurred while playing the video'
      );
    }
  }, [metadata, type, currentEpisode, activeTorrent, navigation, settings.useExternalPlayer]);

  // Clean up torrent when component unmounts or when returning from player
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // This runs when returning from the player screen
      logger.log('[StreamsScreen] Screen focused, checking if cleanup needed');
      if (isVideoPlaying) {
        logger.log('[StreamsScreen] Playback ended, cleaning up torrent');
        setIsVideoPlaying(false);
        
        // Clean up the torrent when returning from video player
        if (activeTorrent) {
          logger.log('[StreamsScreen] Stopping torrent after playback');
          torrentService.stopStreamAndWait().catch(error => {
            logger.error('[StreamsScreen] Error during cleanup:', error);
          });
          setActiveTorrent(null);
          setTorrentProgress({});
        }
      }
    });

    return () => {
      unsubscribe();
      logger.log('[StreamsScreen] Component unmounting, cleaning up torrent');
      if (activeTorrent) {
        logger.log('[StreamsScreen] Stopping torrent on unmount');
        torrentService.stopStreamAndWait().catch(error => {
          logger.error('[StreamsScreen] Error during cleanup:', error);
        });
      }
    };
  }, [navigation, activeTorrent, isVideoPlaying]);

  const startTorrentStream = useCallback(async (stream: Stream) => {
    if (!stream.url) return;

    try {
      logger.log('[StreamsScreen] Starting torrent stream with URL:', stream.url);
      
      // Make sure any existing stream is fully stopped
      if (activeTorrent && activeTorrent !== stream.url) {
        await torrentService.stopStreamAndWait();
        setActiveTorrent(null);
        setTorrentProgress({});
      }
      
      setActiveTorrent(stream.url);
      setIsVideoPlaying(false);
      
      const videoPath = await torrentService.startStream(stream.url, {
        onProgress: (progress) => {
          // Check if progress object is valid and has data
          if (!progress || Object.keys(progress).length === 0) {
            logger.log('[StreamsScreen] Received empty progress object, ignoring');
            return;
          }
          
          logger.log('[StreamsScreen] Torrent progress update:', {
            url: stream.url,
            progress,
            currentTorrentProgress: torrentProgress[stream.url!]
          });
          
          // Validate progress values before updating state
          if (typeof progress.bufferProgress === 'number' || 
              typeof progress.downloadSpeed === 'number' ||
              typeof progress.progress === 'number' ||
              typeof progress.seeds === 'number') {
            
            setTorrentProgress(prev => ({
              ...prev,
              [stream.url!]: progress
            }));
          }
        }
      });
      
      logger.log('[StreamsScreen] Got video path:', videoPath);
      
      // Once we have the video file path, play it using VideoPlayer screen
      if (videoPath) {
        setIsVideoPlaying(true);
        
        try {
          if (settings.useExternalPlayer) {
            logger.log('[StreamsScreen] Using external player for torrent video path:', videoPath);
            // Use VideoPlayerService to launch external player
            const videoPlayerService = VideoPlayerService;
            const launched = await videoPlayerService.playVideo(`file://${videoPath}`, {
              useExternalPlayer: true,
              title: metadata?.name || '',
              episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
              episodeNumber: type === 'series' ? `S${currentEpisode?.season_number}E${currentEpisode?.episode_number}` : undefined,
              releaseDate: metadata?.year?.toString(),
            });

            if (!launched) {
              logger.log('[StreamsScreen] External player launch failed, falling back to built-in player');
              navigation.navigate('Player', {
                uri: `file://${videoPath}`,
                title: metadata?.name || '',
                episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
                season: type === 'series' ? currentEpisode?.season_number : undefined,
                episode: type === 'series' ? currentEpisode?.episode_number : undefined,
                year: metadata?.year,
                id,
                type,
                episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined
              });
            }
          } else {
            // Use built-in player
            navigation.navigate('Player', {
              uri: `file://${videoPath}`,
              title: metadata?.name || '',
              episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
              season: type === 'series' ? currentEpisode?.season_number : undefined,
              episode: type === 'series' ? currentEpisode?.episode_number : undefined,
              year: metadata?.year,
              id,
              type,
              episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined
            });
          }
          
          // Note: Cleanup happens in the focus effect when returning from the player
        } catch (playerError) {
          logger.error('[StreamsScreen] Video player navigation error:', playerError);
          setIsVideoPlaying(false);
          
          // Also stop the torrent on player error
          logger.log('[StreamsScreen] Stopping torrent after player error');
          await torrentService.stopStreamAndWait();
          setActiveTorrent(null);
          setTorrentProgress({});
          
          throw playerError;
        }
      } else {
        // If we didn't get a video path, there's a problem
        logger.error('[StreamsScreen] No video path returned from torrent service');
        Alert.alert(
          'Playback Error',
          'No video file found in torrent'
        );
        await torrentService.stopStreamAndWait();
        setActiveTorrent(null);
        setTorrentProgress({});
      }
      
    } catch (error) {
      logger.error('[StreamsScreen] Torrent error:', error);
      // Clean up on error
      setIsVideoPlaying(false);
      await torrentService.stopStreamAndWait();
      setActiveTorrent(null);
      setTorrentProgress({});
      Alert.alert(
        'Download Error',
        error instanceof Error ? error.message : 'An error occurred while playing the video'
      );
    }
  }, [metadata, type, currentEpisode, torrentProgress, activeTorrent, navigation, settings.useExternalPlayer]);

  const filterItems = useMemo(() => {
    const installedAddons = stremioService.getInstalledAddons();
    const streams = type === 'series' ? episodeStreams : groupedStreams;

    return [
      { id: 'all', name: 'All Providers' },
      ...Array.from(availableProviders)
        .sort((a, b) => {
          const indexA = installedAddons.findIndex(addon => addon.id === a);
          const indexB = installedAddons.findIndex(addon => addon.id === b);
          
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        })
        .map(provider => {
          const addonInfo = streams[provider];
          const installedAddon = installedAddons.find(addon => addon.id === provider);
          
          let displayName = provider;
          if (provider === 'source_1') displayName = 'Source 1';
          else if (provider === 'source_2') displayName = 'Source 2';
          else if (provider === 'external_sources') displayName = 'External Sources';
          else if (installedAddon) displayName = installedAddon.name;
          else if (addonInfo?.addonName) displayName = addonInfo.addonName;
          
          return { id: provider, name: displayName };
        })
    ];
  }, [availableProviders, type, episodeStreams, groupedStreams]);

  const sections = useMemo(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    const installedAddons = stremioService.getInstalledAddons();

    // Remove test addon section
    return Object.entries(streams)
      .filter(([addonId]) => {
        // Filter out test_addon and source_1
        if (addonId === 'test_addon' || addonId === 'source_1') return false;
        return selectedProvider === 'all' || selectedProvider === addonId;
      })
      .sort(([addonIdA], [addonIdB]) => {
        const indexA = installedAddons.findIndex(addon => addon.id === addonIdA);
        const indexB = installedAddons.findIndex(addon => addon.id === addonIdB);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      })
      .map(([addonId, { addonName, streams }]) => ({
        title: addonName,
        addonId,
        data: streams
      }));
  }, [selectedProvider, type, episodeStreams, groupedStreams]);

  const episodeImage = useMemo(() => {
    if (!currentEpisode) return null;
    if (currentEpisode.still_path) {
      return tmdbService.getImageUrl(currentEpisode.still_path, 'original');
    }
    return metadata?.poster || null;
  }, [currentEpisode, metadata]);

  const isLoading = type === 'series' ? loadingEpisodeStreams : loadingStreams;
  const streams = type === 'series' ? episodeStreams : groupedStreams;

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value }],
    opacity: headerOpacity.value
  }));

  const filterStyle = useAnimatedStyle(() => ({
    opacity: filterOpacity.value,
    transform: [
      { 
        translateY: interpolate(
          filterOpacity.value,
          [0, 1],
          [20, 0],
          Extrapolate.CLAMP
        )
      }
    ]
  }));

  const renderItem = useCallback(({ item, index, section }: { item: Stream; index: number; section: any }) => {
    const stream = item;
    const progress = torrentProgress[stream.url!];
    const isLoading = loadingProviders[section.addonId];
    
    return (
      <StreamCard 
        key={`${stream.url}-${index}`}
        stream={stream} 
        onPress={() => handleStreamPress(stream)} 
        index={index}
        torrentProgress={progress}
        isLoading={isLoading}
        statusMessage={providerStatus[section.addonId]?.message}
      />
    );
  }, [handleStreamPress, torrentProgress, loadingProviders, providerStatus]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string } }) => (
    <Animated.View
      entering={FadeIn.duration(300)}
    >
      <Text style={styles.streamGroupTitle}>{section.title}</Text>
    </Animated.View>
  ), []);

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[styles.backButtonContainer]}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.backButtonText}>
            {type === 'series' ? 'Back to Episodes' : 'Back to Info'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {type === 'series' && currentEpisode && (
        <Animated.View style={[styles.streamsHeroContainer, heroStyle]}>
          <Animated.View
            entering={FadeIn.duration(600).springify()}
            style={StyleSheet.absoluteFill}
          >
            <Animated.View 
              entering={FadeIn.duration(800).delay(100).springify().withInitialValues({
                transform: [{ scale: 1.05 }]
              })}
              style={StyleSheet.absoluteFill}
            >
              <ImageBackground
                source={episodeImage ? { uri: episodeImage } : undefined}
                style={styles.streamsHeroBackground}
                fadeDuration={0}
                resizeMode="cover"
              >
                <LinearGradient
                  colors={[
                    'rgba(0,0,0,0)',
                    'rgba(0,0,0,0.4)',
                    'rgba(0,0,0,0.7)',
                    'rgba(0,0,0,0.85)',
                    'rgba(0,0,0,0.95)',
                    colors.darkBackground
                  ]}
                  locations={[0, 0.3, 0.5, 0.7, 0.85, 1]}
                  style={styles.streamsHeroGradient}
                >
                  <View style={styles.streamsHeroContent}>
                    <View style={styles.streamsHeroInfo}>
                      <Text style={styles.streamsHeroEpisodeNumber}>
                        {currentEpisode.episodeString}
                      </Text>
                      <Text style={styles.streamsHeroTitle} numberOfLines={1}>
                        {currentEpisode.name}
                      </Text>
                      {currentEpisode.overview && (
                        <Text style={styles.streamsHeroOverview} numberOfLines={2}>
                          {currentEpisode.overview}
                        </Text>
                      )}
                      <View style={styles.streamsHeroMeta}>
                        <Text style={styles.streamsHeroReleased}>
                          {tmdbService.formatAirDate(currentEpisode.air_date)}
                        </Text>
                        {currentEpisode.vote_average > 0 && (
                          <View style={styles.streamsHeroRating}>
                            <Image
                              source={{ uri: TMDB_LOGO }}
                              style={styles.tmdbLogo}
                              contentFit="contain"
                            />
                            <Text style={styles.streamsHeroRatingText}>
                              {currentEpisode.vote_average.toFixed(1)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </ImageBackground>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}

      <View style={[
        styles.streamsMainContent,
        type === 'movie' && styles.streamsMainContentMovie
      ]}>
        <Animated.View style={[styles.filterContainer, filterStyle]}>
          {Object.keys(streams).length > 0 && (
            <ProviderFilter
              selectedProvider={selectedProvider}
              providers={filterItems}
              onSelect={handleProviderChange}
            />
          )}
        </Animated.View>

        {isLoading && Object.keys(streams).length === 0 ? (
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.loadingContainer}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Finding available streams...</Text>
          </Animated.View>
        ) : Object.keys(streams).length === 0 ? (
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.noStreams}
          >
            <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
            <Text style={styles.noStreamsText}>No streams available</Text>
          </Animated.View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => `${item.url}-${index}`}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            initialNumToRender={8}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews={true}
            contentContainerStyle={styles.streamsContainer}
            style={styles.streamsContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
            overScrollMode="never"
            getItemLayout={(data, index) => ({
              length: 86, // Height of each stream card + margin
              offset: 86 * index,
              index,
            })}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
              autoscrollToTopThreshold: 10
            }}
            ListFooterComponent={
              isLoading ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.footerLoadingText}>Loading more sources...</Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    paddingTop: Platform.OS === 'android' ? 35 : 45,
  },
  backButtonText: {
    color: colors.highEmphasis,
    fontSize: 13,
    fontWeight: '600',
  },
  streamsMainContent: {
    flex: 1,
    backgroundColor: colors.darkBackground,
    paddingTop: 20,
    zIndex: 0,
  },
  streamsMainContentMovie: {
    paddingTop: Platform.OS === 'android' ? 90 : 100,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    backgroundColor: colors.transparentLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.transparent,
  },
  filterChipSelected: {
    backgroundColor: colors.transparentLight,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.text,
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  streamsContent: {
    flex: 1,
    width: '100%',
    zIndex: 1,
  },
  streamsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    width: '100%',
  },
  streamGroup: {
    marginBottom: 24,
    width: '100%',
  },
  streamGroupTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 0,
    backgroundColor: 'transparent',
  },
  streamCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    minHeight: 70,
    backgroundColor: colors.elevation1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    width: '100%',
    zIndex: 1,
  },
  streamCardDisabled: {
    backgroundColor: colors.elevation2,
  },
  streamCardLoading: {
    opacity: 0.7,
  },
  streamDetails: {
    flex: 1,
  },
  streamNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'wrap',
    gap: 8
  },
  streamTitleContainer: {
    flex: 1,
  },
  streamName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    lineHeight: 20,
    color: colors.highEmphasis,
  },
  streamAddonName: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.mediumEmphasis,
    marginBottom: 6,
  },
  streamMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  chipText: {
    color: colors.highEmphasis,
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    height: 20,
    backgroundColor: colors.transparentLight,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    color: colors.highEmphasis,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  streamAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.elevation2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonCard: {
    opacity: 0.7,
  },
  skeletonTitle: {
    height: 24,
    width: '40%',
    backgroundColor: colors.transparentLight,
    borderRadius: 4,
    marginBottom: 16,
  },
  skeletonIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.transparentLight,
    marginRight: 12,
  },
  skeletonText: {
    height: 16,
    borderRadius: 4,
    marginBottom: 8,
    backgroundColor: colors.transparentLight,
  },
  skeletonTag: {
    width: 60,
    height: 20,
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: colors.transparentLight,
  },
  noStreams: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  noStreamsText: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 16,
  },
  streamsHeroContainer: {
    width: '100%',
    height: 300,
    marginBottom: 0,
    position: 'relative',
    backgroundColor: colors.black,
  },
  streamsHeroBackground: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.black,
  },
  streamsHeroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 0,
  },
  streamsHeroContent: {
    width: '100%',
  },
  streamsHeroInfo: {
    width: '100%',
  },
  streamsHeroEpisodeNumber: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  streamsHeroTitle: {
    color: colors.highEmphasis,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  streamsHeroOverview: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  streamsHeroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 0,
  },
  streamsHeroReleased: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  streamsHeroRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 0,
  },
  tmdbLogo: {
    width: 20,
    height: 14,
  },
  streamsHeroRatingText: {
    color: '#01b4e4',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    color: colors.primary,
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  downloadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.transparentLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  downloadingText: {
    color: colors.primary,
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  loadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  footerLoadingText: {
    color: colors.primary,
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '500',
  },
});

export default memo(StreamsScreen); 