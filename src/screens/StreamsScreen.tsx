import React, { useCallback, useMemo, memo, useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  Alert,
  Dimensions,
  Linking,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { RootStackParamList, RootStackNavigationProp } from '../navigation/AppNavigator';
import { useMetadata } from '../hooks/useMetadata';
import { useTheme } from '../contexts/ThemeContext';
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
  SharedValue,
  Layout
} from 'react-native-reanimated';
import { logger } from '../utils/logger';

const TMDB_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tmdb.new.logo.svg/512px-Tmdb.new.logo.svg.png?20200406190906';
const HDR_ICON = 'https://uxwing.com/wp-content/themes/uxwing/download/video-photography-multimedia/hdr-icon.png';
const DOLBY_ICON = 'https://upload.wikimedia.org/wikipedia/en/thumb/3/3f/Dolby_Vision_%28logo%29.svg/512px-Dolby_Vision_%28logo%29.svg.png?20220908042900';

const { width, height } = Dimensions.get('window');

// Extracted Components
const StreamCard = ({ stream, onPress, index, isLoading, statusMessage, theme }: { 
  stream: Stream; 
  onPress: () => void; 
  index: number;
  isLoading?: boolean;
  statusMessage?: string;
  theme: any;
}) => {
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  
  const quality = stream.title?.match(/(\d+)p/)?.[1] || null;
  const isHDR = stream.title?.toLowerCase().includes('hdr');
  const isDolby = stream.title?.toLowerCase().includes('dolby') || stream.title?.includes('DV');
  const size = stream.title?.match(/💾\s*([\d.]+\s*[GM]B)/)?.[1];
  const isDebrid = stream.behaviorHints?.cached;
  
  // Determine if this is a HDRezka stream
  const isHDRezka = stream.name === 'HDRezka';

  // For HDRezka streams, the title contains the quality information
  const displayTitle = isHDRezka ? `HDRezka ${stream.title}` : (stream.name || stream.title || 'Unnamed Stream');
  const displayAddonName = isHDRezka ? '' : (stream.title || '');

  // Animation delay based on index - stagger effect
  const enterDelay = 100 + (index * 50);

  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(enterDelay).springify()}
      layout={Layout.springify()}
    >
      <TouchableOpacity 
        style={[
          styles.streamCard, 
          isLoading && styles.streamCardLoading
        ]} 
        onPress={onPress}
        disabled={isLoading}
        activeOpacity={0.7}
      >
        <View style={styles.streamDetails}>
          <View style={styles.streamNameRow}>
            <View style={styles.streamTitleContainer}>
              <Text style={[styles.streamName, { color: theme.colors.highEmphasis }]}>
                {displayTitle}
              </Text>
              {displayAddonName && displayAddonName !== displayTitle && (
                <Text style={[styles.streamAddonName, { color: theme.colors.mediumEmphasis }]}>
                  {displayAddonName}
                </Text>
              )}
            </View>
            
            {/* Show loading indicator if stream is loading */}
            {isLoading && (
              <View style={styles.loadingIndicator}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.primary }]}>
                  {statusMessage || "Loading..."}
                </Text>
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
              <View style={[styles.chip, { backgroundColor: theme.colors.darkGray }]}>
                <Text style={[styles.chipText, { color: theme.colors.white }]}>{size}</Text>
              </View>
            )}
            
            {isDebrid && (
              <View style={[styles.chip, { backgroundColor: theme.colors.success }]}>
                <Text style={[styles.chipText, { color: theme.colors.white }]}>DEBRID</Text>
              </View>
            )}
            
            {/* Special badge for HDRezka streams */}
            {isHDRezka && (
              <View style={[styles.chip, { backgroundColor: theme.colors.accent }]}>
                <Text style={[styles.chipText, { color: theme.colors.white }]}>HDREZKA</Text>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.streamAction}>
          <MaterialIcons 
            name="play-arrow" 
            size={24} 
            color={theme.colors.primary} 
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const QualityTag = React.memo(({ text, color, theme }: { text: string; color: string; theme: any }) => {
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
});

const ProviderFilter = memo(({ 
  selectedProvider, 
  providers, 
  onSelect,
  theme
}: { 
  selectedProvider: string; 
  providers: Array<{ id: string; name: string; }>; 
  onSelect: (id: string) => void;
  theme: any;
}) => {
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  
  const renderItem = useCallback(({ item, index }: { item: { id: string; name: string }; index: number }) => (
    <Animated.View
      entering={FadeIn.duration(300).delay(100 + index * 40)}
      layout={Layout.springify()}
    >
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
    </Animated.View>
  ), [selectedProvider, onSelect, styles]);

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
    >
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
    </Animated.View>
  );
});

export const StreamsScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Streams'>>();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { id, type, episodeId } = route.params;
  const { settings } = useSettings();
  const { currentTheme } = useTheme();
  const { colors } = currentTheme;

  // Add ref to prevent excessive updates
  const isMounted = useRef(true);
  const loadStartTimeRef = useRef(0);
  const hasDoneInitialLoadRef = useRef(false);
  
  // Add state for handling orientation transition
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Add timing logs
  const [loadStartTime, setLoadStartTime] = useState(0);
  const [providerLoadTimes, setProviderLoadTimes] = useState<{[key: string]: number}>({});
  
  // Prevent excessive re-renders by using this guard
  const guardedSetState = useCallback((setter: () => void) => {
    if (isMounted.current) {
      setter();
    }
  }, []);

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
    imdbId,
  } = useMetadata({ id, type });

  // Create styles using current theme colors
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [selectedProvider, setSelectedProvider] = React.useState('all');
  const [availableProviders, setAvailableProviders] = React.useState<Set<string>>(new Set());

  // Optimize animation values with cleanup
  const headerOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.95);
  const filterOpacity = useSharedValue(0);

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

  // Monitor streams loading start and completion - FIXED to prevent loops
  useEffect(() => {
    // Skip processing if component is unmounting
    if (!isMounted.current) return;
    
    const now = Date.now();
    // Define all providers you expect to load. This could be dynamic.
    const expectedProviders = ['stremio', 'hdrezka'];

    // Prevent infinite rerendering by using refs
    if (loadingStreams || loadingEpisodeStreams) {
      // --- Stream Loading has STARTED or is IN PROGRESS ---
      // Only log once when loading starts
      if (loadStartTimeRef.current === 0) {
        logger.log("⏱️ Stream loading started or in progress...");
        // Update ref directly to avoid render cycle
        loadStartTimeRef.current = now;
        // Also update state for components that need it
        setLoadStartTime(now);
      }
      
      // Only update these once per loading cycle
      if (!hasDoneInitialLoadRef.current) {
        hasDoneInitialLoadRef.current = true;
        
        // Use the guarded setState to prevent issues after unmount
        guardedSetState(() => setProviderLoadTimes({}));

        // Update provider status to loading for all expected providers
        guardedSetState(() => setProviderStatus(prevStatus => {
          const newStatus = { ...prevStatus };
          expectedProviders.forEach(providerId => {
            // If not already marked as loading, or if it's a fresh cycle, set to loading
            if (!newStatus[providerId] || !newStatus[providerId].loading) {
              newStatus[providerId] = {
                loading: true,
                success: false,
                error: false,
                message: 'Loading...',
                timeStarted: (newStatus[providerId]?.loading && newStatus[providerId]?.timeStarted) ? newStatus[providerId].timeStarted : now,
                timeCompleted: 0,
              };
            }
          });
          return newStatus;
        }));

        // Update simple loading flag for all expected providers
        guardedSetState(() => setLoadingProviders(prevLoading => {
          const newLoading = { ...prevLoading };
          expectedProviders.forEach(providerId => {
            newLoading[providerId] = true;
          });
          return newLoading;
        }));
      }
    } else if (loadStartTimeRef.current > 0) { 
      // --- Stream Loading has FINISHED ---
      logger.log("🏁 Stream loading finished. Processing results.");
      
      const currentStreamsData = type === 'series' ? episodeStreams : groupedStreams;
      
      // Find all providers that returned streams
      const providersWithStreams = Object.entries(currentStreamsData)
        .filter(([_, data]) => data.streams && data.streams.length > 0)
        .map(([providerId]) => providerId);
      
      logger.log(`📊 Providers with streams: ${providersWithStreams.join(', ')}`);

      // Reset refs for next load cycle
      loadStartTimeRef.current = 0;
      hasDoneInitialLoadRef.current = false;
      
      // Update states only if component is still mounted
      if (isMounted.current) {
        // Update simple loading flag: all expected providers are no longer loading
        guardedSetState(() => setLoadingProviders(prevLoading => {
          const newLoading = { ...prevLoading };
          expectedProviders.forEach(providerId => {
            newLoading[providerId] = false;
          });
          return newLoading;
        }));

        // Update detailed provider status based on results
        guardedSetState(() => setProviderStatus(prevStatus => {
          const newStatus = { ...prevStatus };
          expectedProviders.forEach(providerId => {
            if (newStatus[providerId]) { // Ensure the provider entry exists
              const providerHasStreams = currentStreamsData[providerId] && 
                                        currentStreamsData[providerId].streams && 
                                        currentStreamsData[providerId].streams.length > 0;
              
              newStatus[providerId] = {
                ...newStatus[providerId], // Preserve timeStarted
                loading: false,
                success: providerHasStreams,
                // Mark error if it was loading and now no streams, and wasn't already successful
                error: !providerHasStreams && newStatus[providerId].loading && !newStatus[providerId].success, 
                message: providerHasStreams ? 'Loaded successfully' : (newStatus[providerId].error ? 'Error or no streams' : 'No streams found'),
                timeCompleted: now,
              };
            }
          });
          return newStatus;
        }));

        // Update the set of available providers based on what actually loaded streams
        const providersWithStreamsSet = new Set(providersWithStreams);
        guardedSetState(() => setAvailableProviders(providersWithStreamsSet));

        // Reset loadStartTime to signify the end of this loading cycle
        guardedSetState(() => setLoadStartTime(0));
      }
    }
  }, [loadingStreams, loadingEpisodeStreams, groupedStreams, episodeStreams, type, guardedSetState]);

  // Add useEffect to update availableProviders whenever streams change
  useEffect(() => {
    if (!loadingStreams && !loadingEpisodeStreams) {
      const streams = type === 'series' ? episodeStreams : groupedStreams;
      // Only include providers that actually have streams
      const providers = new Set(
        Object.entries(streams)
          .filter(([_, data]) => data.streams && data.streams.length > 0)
          .map(([providerId]) => providerId)
      );
      setAvailableProviders(providers);
      
      // Also reset the selected provider to 'all' if the current selection is no longer available
      if (selectedProvider !== 'all' && !providers.has(selectedProvider)) {
        setSelectedProvider('all');
      }
    }
  }, [type, groupedStreams, episodeStreams, loadingStreams, loadingEpisodeStreams, selectedProvider]);

  React.useEffect(() => {
    if (type === 'series' && episodeId) {
      logger.log(`🎬 Loading episode streams for: ${episodeId}`);
      setLoadingProviders({
        'stremio': true,
        'hdrezka': true
      });
      setSelectedEpisode(episodeId);
      loadEpisodeStreams(episodeId);
    } else if (type === 'movie') {
      logger.log(`🎬 Loading movie streams for: ${id}`);
      // setLoadingProviders({ // This is now handled by the main effect
      //   'stremio': true, 
      //   'hdrezka': true
      // });
      loadStreams();
    }
  }, [type, episodeId]);

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

  const navigateToPlayer = useCallback(async (stream: Stream) => {
    try {
      // Lock orientation to landscape before navigation to prevent glitches
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      
      // Small delay to ensure orientation is set before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
        episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined,
        imdbId: imdbId || undefined,
      });
    } catch (error) {
      logger.error('[StreamsScreen] Error locking orientation before navigation:', error);
      // Fallback: navigate anyway
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
        episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined,
        imdbId: imdbId || undefined,
      });
    }
  }, [metadata, type, currentEpisode, navigation, id, selectedEpisode, imdbId]);

  // Update handleStreamPress
  const handleStreamPress = useCallback(async (stream: Stream) => {
    try {
      if (stream.url) {
        logger.log('handleStreamPress called with stream:', {
          url: stream.url,
          behaviorHints: stream.behaviorHints,
          useExternalPlayer: settings.useExternalPlayer,
          preferredPlayer: settings.preferredPlayer
        });
        
        // For iOS, try to open with the preferred external player
        if (Platform.OS === 'ios' && settings.preferredPlayer !== 'internal') {
          try {
            // Format the URL for the selected player
            const streamUrl = encodeURIComponent(stream.url);
            let externalPlayerUrls: string[] = [];
            
            // Configure URL formats based on the selected player
            switch (settings.preferredPlayer) {
              case 'vlc':
                externalPlayerUrls = [
                  `vlc://${stream.url}`,
                  `vlc-x-callback://x-callback-url/stream?url=${streamUrl}`,
                  `vlc://${streamUrl}`
                ];
                break;
                
              case 'outplayer':
                externalPlayerUrls = [
                  `outplayer://${stream.url}`,
                  `outplayer://${streamUrl}`,
                  `outplayer://play?url=${streamUrl}`,
                  `outplayer://stream?url=${streamUrl}`,
                  `outplayer://play/browser?url=${streamUrl}`
                ];
                break;
                
              case 'infuse':
                externalPlayerUrls = [
                  `infuse://x-callback-url/play?url=${streamUrl}`,
                  `infuse://play?url=${streamUrl}`,
                  `infuse://${streamUrl}`
                ];
                break;
                
              case 'vidhub':
                externalPlayerUrls = [
                  `vidhub://play?url=${streamUrl}`,
                  `vidhub://${streamUrl}`
                ];
                break;
                
              default:
                // If no matching player or the setting is somehow invalid, use internal player
                navigateToPlayer(stream);
                return;
            }
            
            console.log(`Attempting to open stream in ${settings.preferredPlayer}`);
            
            // Try each URL format in sequence
            const tryNextUrl = (index: number) => {
              if (index >= externalPlayerUrls.length) {
                console.log(`All ${settings.preferredPlayer} formats failed, falling back to direct URL`);
                // Try direct URL as last resort
                Linking.openURL(stream.url)
                  .then(() => console.log('Opened with direct URL'))
                  .catch(() => {
                    console.log('Direct URL failed, falling back to built-in player');
                    navigateToPlayer(stream);
                  });
                return;
              }
              
              const url = externalPlayerUrls[index];
              console.log(`Trying ${settings.preferredPlayer} URL format ${index + 1}: ${url}`);
              
              Linking.openURL(url)
                .then(() => console.log(`Successfully opened stream with ${settings.preferredPlayer} format ${index + 1}`))
                .catch(err => {
                  console.log(`Format ${index + 1} failed: ${err.message}`, err);
                  tryNextUrl(index + 1);
                });
            };
            
            // Start with the first URL format
            tryNextUrl(0);
            
          } catch (error) {
            console.error(`Error with ${settings.preferredPlayer}:`, error);
            // Fallback to the built-in player
            navigateToPlayer(stream);
          }
        } 
        // For Android with external player preference
        else if (Platform.OS === 'android' && settings.useExternalPlayer) {
          try {
            console.log('Opening stream with Android native app chooser');
            
            // For Android, determine if the URL is a direct http/https URL or a magnet link
            const isMagnet = stream.url.startsWith('magnet:');
            
            if (isMagnet) {
              // For magnet links, open directly which will trigger the torrent app chooser
              console.log('Opening magnet link directly');
              Linking.openURL(stream.url)
                .then(() => console.log('Successfully opened magnet link'))
                .catch(err => {
                  console.error('Failed to open magnet link:', err);
                  // No good fallback for magnet links
                  navigateToPlayer(stream);
                });
            } else {
              // For direct video URLs, use the S.Browser.ACTION_VIEW approach
              // This is a more reliable way to force Android to show all video apps
              
              // Strip query parameters if they exist as they can cause issues with some apps
              let cleanUrl = stream.url;
              if (cleanUrl.includes('?')) {
                cleanUrl = cleanUrl.split('?')[0];
              }
              
              // Create an Android intent URL that forces the chooser
              // Set component=null to ensure chooser is shown
              // Set action=android.intent.action.VIEW to open the content
              const intentUrl = `intent:${cleanUrl}#Intent;action=android.intent.action.VIEW;category=android.intent.category.DEFAULT;component=;type=video/*;launchFlags=0x10000000;end`;
              
              console.log(`Using intent URL: ${intentUrl}`);
              
              Linking.openURL(intentUrl)
                .then(() => console.log('Successfully opened with intent URL'))
                .catch(err => {
                  console.error('Failed to open with intent URL:', err);
                  
                  // First fallback: Try direct URL with regular Linking API
                  console.log('Trying plain URL as fallback');
                  Linking.openURL(stream.url)
                    .then(() => console.log('Opened with direct URL'))
                    .catch(directErr => {
                      console.error('Failed to open direct URL:', directErr);
                      
                      // Final fallback: Use built-in player
                      console.log('All external player attempts failed, using built-in player');
                      navigateToPlayer(stream);
                    });
                });
            }
          } catch (error) {
            console.error('Error with external player:', error);
            // Fallback to the built-in player
            navigateToPlayer(stream);
          }
        }
        else {
          // For internal player or if other options failed, use the built-in player
          navigateToPlayer(stream);
        }
      }
    } catch (error) {
      console.error('Error in handleStreamPress:', error);
      // Final fallback: Use built-in player
      navigateToPlayer(stream);
    }
  }, [settings.preferredPlayer, settings.useExternalPlayer, navigateToPlayer]);

  const filterItems = useMemo(() => {
    const installedAddons = stremioService.getInstalledAddons();
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    
    // Make sure we include all providers with streams, not just those in availableProviders
    const allProviders = new Set([
      ...availableProviders,
      ...Object.keys(streams).filter(key => 
        streams[key] && 
        streams[key].streams && 
        streams[key].streams.length > 0
      )
    ]);

    return [
      { id: 'all', name: 'All Providers' },
      ...Array.from(allProviders)
        .sort((a, b) => {
          // Always put HDRezka at the top
          if (a === 'hdrezka') return -1;
          if (b === 'hdrezka') return 1;
          
          // Then sort Stremio addons by installation order
          const indexA = installedAddons.findIndex(addon => addon.id === a);
          const indexB = installedAddons.findIndex(addon => addon.id === b);
          
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        })
        .map(provider => {
          const addonInfo = streams[provider];
          
          // Special handling for HDRezka
          if (provider === 'hdrezka') {
            return { id: provider, name: 'HDRezka' };
          }
          
          // Standard handling for Stremio addons
          const installedAddon = installedAddons.find(addon => addon.id === provider);
          
          let displayName = provider;
          if (installedAddon) displayName = installedAddon.name;
          else if (addonInfo?.addonName) displayName = addonInfo.addonName;
          
          return { id: provider, name: displayName };
        })
    ];
  }, [availableProviders, type, episodeStreams, groupedStreams]);

  const sections = useMemo(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    const installedAddons = stremioService.getInstalledAddons();

    // Helper function to extract quality as a number for sorting
    const getQualityNumeric = (title: string | undefined): number => {
      if (!title) return 0;
      const match = title.match(/(\d+)p/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Filter streams by selected provider - only if not "all"
    const filteredEntries = Object.entries(streams)
      .filter(([addonId]) => {
        // If "all" is selected, show all providers
        if (selectedProvider === 'all') {
          return true;
        }
        // Otherwise only show the selected provider
        return addonId === selectedProvider;
      })
      .sort(([addonIdA], [addonIdB]) => {
        // Always put HDRezka at the top
        if (addonIdA === 'hdrezka') return -1;
        if (addonIdB === 'hdrezka') return 1;
        
        // Then sort by Stremio addon installation order
        const indexA = installedAddons.findIndex(addon => addon.id === addonIdA);
        const indexB = installedAddons.findIndex(addon => addon.id === addonIdB);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      })
      .map(([addonId, { addonName, streams: providerStreams }]) => {
        let sortedProviderStreams = providerStreams;
        if (addonId === 'hdrezka') {
          sortedProviderStreams = [...providerStreams].sort((a, b) => {
            const qualityA = getQualityNumeric(a.title);
            const qualityB = getQualityNumeric(b.title);
            return qualityB - qualityA; // Sort descending (e.g., 1080p before 720p)
          });
        }
        return {
          title: addonName,
          addonId,
          data: sortedProviderStreams
        };
      });
      
    return filteredEntries;
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
    const isLoading = loadingProviders[section.addonId];
    
    // Special handling for HDRezka streams
    const quality = stream.title?.match(/(\d+)p/)?.[1] || null;
    const isHDRezka = section.addonId === 'hdrezka';
    
    return (
      <StreamCard 
        key={`${stream.url}-${index}`}
        stream={stream} 
        onPress={() => handleStreamPress(stream)} 
        index={index}
        isLoading={isLoading}
        statusMessage={providerStatus[section.addonId]?.message}
        theme={currentTheme}
      />
    );
  }, [handleStreamPress, loadingProviders, providerStatus, currentTheme]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string; addonId: string } }) => (
    <Animated.View
      entering={FadeIn.duration(400)}
      layout={Layout.springify()}
    >
      <Text style={styles.streamGroupTitle}>{section.title}</Text>
    </Animated.View>
  ), [styles.streamGroupTitle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Add orientation handling when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Set transitioning state to mask any visual glitches
      setIsTransitioning(true);
      
      // Immediately lock to portrait when returning to this screen
      const lockToPortrait = async () => {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          // Small delay then unlock to allow natural portrait orientation
          setTimeout(async () => {
            try {
              await ScreenOrientation.unlockAsync();
              // Clear transition state after orientation is handled
              setTimeout(() => {
                setIsTransitioning(false);
              }, 100);
            } catch (error) {
              logger.error('[StreamsScreen] Error unlocking orientation:', error);
              setIsTransitioning(false);
            }
          }, 200);
        } catch (error) {
          logger.error('[StreamsScreen] Error locking to portrait:', error);
          setIsTransitioning(false);
        }
      };

      lockToPortrait();

      return () => {
        // Cleanup when screen loses focus
        setIsTransitioning(false);
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      
      {/* Transition overlay to mask orientation changes */}
      {isTransitioning && (
        <View style={styles.transitionOverlay}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
      
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[styles.backButtonContainer]}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.white} />
          <Text style={styles.backButtonText}>
            {type === 'series' ? 'Back to Episodes' : 'Back to Info'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {type === 'movie' && metadata && (
        <Animated.View style={[styles.movieTitleContainer, heroStyle]}>
          <ImageBackground
            source={{ uri: metadata.banner || metadata.poster }}
            style={styles.movieTitleBackground}
            resizeMode="cover"
          >
            <LinearGradient
              colors={[
                'rgba(0,0,0,0.2)',
                'rgba(0,0,0,0.4)',
                'rgba(0,0,0,0.6)',
                colors.darkBackground
              ]}
              locations={[0, 0.4, 0.7, 1]}
              style={styles.movieTitleGradient}
            >
              <View style={styles.movieTitleContent}>
                {metadata.logo ? (
                  <Image
                    source={{ uri: metadata.logo }}
                    style={styles.movieLogo}
                    contentFit="contain"
                  />
                ) : (
                  <Text style={styles.movieTitle} numberOfLines={2}>
                    {metadata.name}
                  </Text>
                )}
              </View>
            </LinearGradient>
          </ImageBackground>
        </Animated.View>
      )}

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
                    'rgba(0,0,0,0.3)',
                    'rgba(0,0,0,0.5)',
                    'rgba(0,0,0,0.7)',
                    colors.darkBackground
                  ]}
                  locations={[0, 0.4, 0.6, 0.8, 1]}
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
                        {currentEpisode.runtime && (
                          <View style={styles.streamsHeroRuntime}>
                            <MaterialIcons name="schedule" size={16} color={colors.mediumEmphasis} />
                            <Text style={styles.streamsHeroRuntimeText}>
                              {currentEpisode.runtime >= 60
                                ? `${Math.floor(currentEpisode.runtime / 60)}h ${currentEpisode.runtime % 60}m`
                                : `${currentEpisode.runtime}m`}
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
              theme={currentTheme}
            />
          )}
        </Animated.View>

        {isLoading || (Object.keys(streams).length === 0 && (loadingStreams || loadingEpisodeStreams)) ? (
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
          <View collapsable={false} style={{ flex: 1 }}>
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.url || `${item.name}-${item.title}`}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              initialNumToRender={8}
              maxToRenderPerBatch={4}
              windowSize={5}
              removeClippedSubviews={false}
              contentContainerStyle={styles.streamsContainer}
              style={styles.streamsContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
              overScrollMode="never"
              ListFooterComponent={
                isLoading ? (
                  <View style={styles.footerLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.footerLoadingText}>Loading more sources...</Text>
                  </View>
                ) : null
              }
            />
          </View>
        )}
      </View>
    </View>
  );
};

// Create a function to generate styles with the current theme colors
const createStyles = (colors: any) => StyleSheet.create({
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
    pointerEvents: 'box-none',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    paddingTop: Platform.OS === 'android' ? 20 : 15,
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
    zIndex: 1,
  },
  streamsMainContentMovie: {
    paddingTop: Platform.OS === 'android' ? 10 : 15,
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
    zIndex: 2,
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
    height: 220,
    marginBottom: 0,
    position: 'relative',
    backgroundColor: colors.black,
    pointerEvents: 'box-none',
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
    color: colors.accent,
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
  movieTitleContainer: {
    width: '100%',
    height: 200,
    backgroundColor: colors.black,
    pointerEvents: 'box-none',
  },
  movieTitleBackground: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.black,
  },
  movieTitleGradient: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  movieTitleContent: {
    width: '100%',
    alignItems: 'center',
    marginTop: Platform.OS === 'android' ? 35 : 45,
  },
  movieLogo: {
    width: width * 0.6,
    height: 70,
    marginBottom: 8,
  },
  movieTitle: {
    color: colors.highEmphasis,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
  },
  streamsHeroRuntime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  streamsHeroRuntimeText: {
    color: colors.mediumEmphasis,
    fontSize: 13,
    fontWeight: '600',
  },
  transitionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.darkBackground,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
});

export default memo(StreamsScreen); 