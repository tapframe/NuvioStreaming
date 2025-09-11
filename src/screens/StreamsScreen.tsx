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
  Clipboard,
  Image as RNImage,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as ScreenOrientation from 'expo-screen-orientation';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { RootStackParamList, RootStackNavigationProp } from '../navigation/AppNavigator';
import { useMetadata } from '../hooks/useMetadata';
import { useMetadataAssets } from '../hooks/useMetadataAssets';
import { useTheme } from '../contexts/ThemeContext';
import { useTrailer } from '../contexts/TrailerContext';
import { Stream } from '../types/metadata';
import { tmdbService } from '../services/tmdbService';
import { stremioService } from '../services/stremioService';
import { localScraperService } from '../services/localScraperService';
import { VideoPlayerService } from '../services/videoPlayerService';
import { useSettings } from '../hooks/useSettings';
import QualityBadge from '../components/metadata/QualityBadge';
import Animated, {
  FadeIn,
  FadeOut,
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

// Cache for scraper logos to avoid repeated async calls
const scraperLogoCache = new Map<string, string>();
let scraperLogoCachePromise: Promise<void> | null = null;

// Short-budget HEAD detection to avoid long delays before navigation
const MKV_HEAD_TIMEOUT_MS = 600;

const detectMkvViaHead = async (url: string, headers?: Record<string, string>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MKV_HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers,
      signal: controller.signal as any,
    } as any);
    const contentType = res.headers.get('content-type') || '';
    return /matroska|x-matroska/i.test(contentType);
  } catch (_e) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

// Extracted Components
const StreamCard = memo(({ stream, onPress, index, isLoading, statusMessage, theme, showLogos, scraperLogo }: { 
  stream: Stream; 
  onPress: () => void; 
  index: number;
  isLoading?: boolean;
  statusMessage?: string;
  theme: any;
  showLogos?: boolean;
  scraperLogo?: string | null;
}) => {
  
  // Handle long press to copy stream URL to clipboard
  const handleLongPress = useCallback(async () => {
    if (stream.url) {
      try {
        await Clipboard.setString(stream.url);
        Alert.alert(
          'Copied!',
          'Stream URL has been copied to clipboard.',
          [{ text: 'OK' }]
        );
      } catch (error) {
        // Fallback: show URL in alert if clipboard fails
        Alert.alert(
          'Stream URL',
          stream.url,
          [{ text: 'OK' }]
        );
      }
    }
  }, [stream.url]);
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  
  const streamInfo = useMemo(() => {
    const title = stream.title || '';
    const name = stream.name || '';
    
    // Helper function to format size from bytes
    const formatSize = (bytes: number): string => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // Get size from title (legacy format) or from stream.size field
    let sizeDisplay = title.match(/💾\s*([\d.]+\s*[GM]B)/)?.[1];
    if (!sizeDisplay && stream.size && typeof stream.size === 'number' && stream.size > 0) {
      sizeDisplay = formatSize(stream.size);
    }
    
    // Extract quality for badge display
    const basicQuality = title.match(/(\d+)p/)?.[1] || null;
    
    return {
      quality: basicQuality,
      isHDR: title.toLowerCase().includes('hdr'),
      isDolby: title.toLowerCase().includes('dolby') || title.includes('DV'),
      size: sizeDisplay,
      isDebrid: stream.behaviorHints?.cached,
      displayName: name || 'Unnamed Stream',
      subTitle: title && title !== name ? title : null
    };
  }, [stream.name, stream.title, stream.behaviorHints, stream.size]);
  
  // Logo is provided by parent to avoid per-card async work
  
  const isDebrid = streamInfo.isDebrid;
  return (
    <TouchableOpacity 
        style={[
          styles.streamCard, 
          isLoading && styles.streamCardLoading,
          isDebrid && styles.streamCardHighlighted
        ]} 
        onPress={onPress}
        onLongPress={handleLongPress}
        disabled={isLoading}
        activeOpacity={0.7}
      >
        {/* Scraper Logo */}
        {showLogos && scraperLogo && (
          <View style={styles.scraperLogoContainer}>
            <Image
              source={{ uri: scraperLogo }}
              style={styles.scraperLogo}
              resizeMode="contain"
            />
          </View>
        )}
        
        <View style={styles.streamDetails}>
          <View style={styles.streamNameRow}>
            <View style={styles.streamTitleContainer}>
              <Text style={[styles.streamName, { color: theme.colors.highEmphasis }]}>
                {streamInfo.displayName}
              </Text>
              {streamInfo.subTitle && (
                <Text style={[styles.streamAddonName, { color: theme.colors.mediumEmphasis }]}>
                  {streamInfo.subTitle}
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
            {streamInfo.isDolby && (
              <QualityBadge type="VISION" />
            )}
            
            {streamInfo.size && (
              <View style={[styles.chip, { backgroundColor: theme.colors.darkGray }]}>
                <Text style={[styles.chipText, { color: theme.colors.white }]}>💾 {streamInfo.size}</Text>
              </View>
            )}
            
            {streamInfo.isDebrid && (
              <View style={[styles.chip, { backgroundColor: theme.colors.success }]}>
                <Text style={[styles.chipText, { color: theme.colors.white }]}>DEBRID</Text>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.streamAction}>
          <MaterialIcons 
            name="play-arrow" 
            size={22} 
            color={theme.colors.white} 
          />
        </View>
      </TouchableOpacity>
  );
});

const QualityTag = React.memo(({ text, color, theme }: { text: string; color: string; theme: any }) => {
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
});

const PulsingChip = memo(({ text, delay }: { text: string; delay: number }) => {
  const { currentTheme } = useTheme();
  const styles = React.useMemo(() => createStyles(currentTheme.colors), [currentTheme.colors]);
  // Make chip static to avoid continuous animation load
  return (
    <View style={styles.activeScraperChip}>
      <Text style={styles.activeScraperText}>{text}</Text>
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
    <Animated.View entering={FadeIn.duration(300).delay(index * 75)}>
      <TouchableOpacity
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
    <View>
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
    </View>
  );
});

export const StreamsScreen = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'Streams'>>();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { id, type, episodeId, episodeThumbnail, fromPlayer } = route.params;
  const { settings } = useSettings();
  const { currentTheme } = useTheme();
  const { colors } = currentTheme;
  const { pauseTrailer, resumeTrailer } = useTrailer();

  // Add ref to prevent excessive updates
  const isMounted = useRef(true);
  const loadStartTimeRef = useRef(0);
  const hasDoneInitialLoadRef = useRef(false);
  
  

  // Track when we started fetching streams so we can show an extended loading state
  const [streamsLoadStart, setStreamsLoadStart] = useState<number | null>(null);
  const [providerLoadTimes, setProviderLoadTimes] = useState<{[key: string]: number}>({});
  
  // Prevent excessive re-renders by using this guard
  const guardedSetState = useCallback((setter: () => void) => {
    if (isMounted.current) {
      setter();
    }
  }, []);

  useEffect(() => {
    if (__DEV__) console.log('[StreamsScreen] Received thumbnail from params:', episodeThumbnail);
  }, [episodeThumbnail]);

  // Pause trailer when StreamsScreen is opened
  useEffect(() => {
    // Pause trailer when component mounts
    pauseTrailer();
    
    // Resume trailer when component unmounts
    return () => {
      resumeTrailer();
    };
  }, [pauseTrailer, resumeTrailer]);

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
    scraperStatuses,
    activeFetchingScrapers,
  } = useMetadata({ id, type });

  // Get backdrop from metadata assets
  const setMetadataStub = useCallback(() => {}, []);
  const memoizedSettings = useMemo(() => settings, [settings.logoSourcePreference, settings.tmdbLanguagePreference]);
  const { bannerImage } = useMetadataAssets(metadata, id, type, imdbId, memoizedSettings, setMetadataStub);

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

  // Add state for autoplay functionality
  const [autoplayTriggered, setAutoplayTriggered] = useState(false);
  const [isAutoplayWaiting, setIsAutoplayWaiting] = useState(false);

  // Add check for available streaming sources
  const [hasStreamProviders, setHasStreamProviders] = useState(true); // Assume true initially
  const [hasStremioStreamProviders, setHasStremioStreamProviders] = useState(true); // For footer logic

  // Add state for no sources error
  const [showNoSourcesError, setShowNoSourcesError] = useState(false);
  
  // Scraper logos map to avoid per-card async fetches
  const [scraperLogos, setScraperLogos] = useState<Record<string, string>>({});
  // Preload scraper logos once and expose via state
  React.useEffect(() => {
    const preloadScraperLogos = async () => {
      if (!scraperLogoCachePromise) {
        scraperLogoCachePromise = (async () => {
          try {
            const availableScrapers = await localScraperService.getAvailableScrapers();
            const map: Record<string, string> = {};
            availableScrapers.forEach(scraper => {
              if (scraper.logo && scraper.id) {
                scraperLogoCache.set(scraper.id, scraper.logo);
                map[scraper.id] = scraper.logo;
              }
            });
            setScraperLogos(map);
          } catch (error) {
            // Silently fail
          }
        })();
      } else {
        // If already loading, update state after it resolves
        scraperLogoCachePromise.then(() => {
          // Build map from cache
          const map: Record<string, string> = {};
          // No direct way to iterate Map keys safely without exposing it; copy known ids on demand during render
          setScraperLogos(prev => prev); // no-op to ensure consistency
        }).catch(() => {});
      }
    };
    preloadScraperLogos();
  }, []);

  // Monitor streams loading and update available providers immediately
  useEffect(() => {
    // Skip processing if component is unmounting
    if (!isMounted.current) return;
    
    const currentStreamsData = type === 'series' ? episodeStreams : groupedStreams;
    
    // Update available providers immediately when streams change
    const providersWithStreams = Object.entries(currentStreamsData)
      .filter(([_, data]) => data.streams && data.streams.length > 0)
      .map(([providerId]) => providerId);
    
    if (providersWithStreams.length > 0) {
      logger.log(`📊 Providers with streams: ${providersWithStreams.join(', ')}`);
      const providersWithStreamsSet = new Set(providersWithStreams);
      
      // Only update if we have new providers, don't remove existing ones during loading
      setAvailableProviders(prevProviders => {
        const newProviders = new Set([...prevProviders, ...providersWithStreamsSet]);
        return newProviders;
      });
    }
    
    // Update loading states for individual providers
    const expectedProviders = ['stremio'];
    const now = Date.now();
    
    setLoadingProviders(prevLoading => {
      const nextLoading = { ...prevLoading };
      let changed = false;
      expectedProviders.forEach(providerId => {
        const hasStreams = currentStreamsData[providerId] &&
                          currentStreamsData[providerId].streams &&
                          currentStreamsData[providerId].streams.length > 0;
        const value = (loadingStreams || loadingEpisodeStreams) && !hasStreams;
        if (nextLoading[providerId] !== value) {
          nextLoading[providerId] = value;
          changed = true;
        }
      });
      return changed ? nextLoading : prevLoading;
    });
    
  }, [loadingStreams, loadingEpisodeStreams, groupedStreams, episodeStreams, type]);

  // Reset the selected provider to 'all' if the current selection is no longer available
  // But preserve special filter values like 'grouped-plugins' and 'all'
  useEffect(() => {
    // Don't reset if it's a special filter value
    const isSpecialFilter = selectedProvider === 'all' || selectedProvider === 'grouped-plugins';
    
    if (isSpecialFilter) {
      return; // Always preserve special filters
    }
    
    // Check if provider exists in current streams data
    const currentStreamsData = type === 'series' ? episodeStreams : groupedStreams;
    const hasStreamsForProvider = currentStreamsData[selectedProvider] && 
                                 currentStreamsData[selectedProvider].streams && 
                                 currentStreamsData[selectedProvider].streams.length > 0;
    
    // Only reset if the provider doesn't exist in available providers AND doesn't have streams
    const isAvailableProvider = availableProviders.has(selectedProvider);
    
    if (!isAvailableProvider && !hasStreamsForProvider) {
      setSelectedProvider('all');
    }
  }, [selectedProvider, availableProviders, episodeStreams, groupedStreams, type]);

  // Update useEffect to check for sources
  useEffect(() => {
    const checkProviders = async () => {
      // Check for Stremio addons
      const hasStremioProviders = await stremioService.hasStreamProviders();
      
      // Check for local scrapers (only if enabled in settings)
      const hasLocalScrapers = settings.enableLocalScrapers && await localScraperService.hasScrapers();
      
      // We have providers if we have either Stremio addons OR enabled local scrapers
      const hasProviders = hasStremioProviders || hasLocalScrapers;

      if (!isMounted.current) return;

      setHasStreamProviders(hasProviders);
      setHasStremioStreamProviders(hasStremioProviders);

      if (!hasProviders) {
        const timer = setTimeout(() => {
          if (isMounted.current) setShowNoSourcesError(true);
        }, 500);
        return () => clearTimeout(timer);
      } else {
          if (type === 'series' && episodeId) {
            logger.log(`🎬 Loading episode streams for: ${episodeId}`);
            setLoadingProviders({
              'stremio': true
            });
            setSelectedEpisode(episodeId);
            setStreamsLoadStart(Date.now());
            loadEpisodeStreams(episodeId);
          } else if (type === 'movie') {
            logger.log(`🎬 Loading movie streams for: ${id}`);
            setStreamsLoadStart(Date.now());
            loadStreams();
          }
  
          // Reset autoplay state when content changes
          setAutoplayTriggered(false);
          if (settings.autoplayBestStream && !fromPlayer) {
            setIsAutoplayWaiting(true);
            logger.log('🔄 Autoplay enabled, waiting for best stream...');
          } else {
            setIsAutoplayWaiting(false);
            if (fromPlayer) {
              logger.log('🚫 Autoplay disabled: returning from player');
            }
          }
      }
    };

    checkProviders();
  }, [type, id, episodeId, settings.autoplayBestStream, fromPlayer]);

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
      headerOpacity.value = withTiming(0, { duration: 100 });
      heroScale.value = withTiming(0.95, { duration: 100 });
      filterOpacity.value = withTiming(0, { duration: 100 });
    };
    cleanup();

    if (type === 'series') {
      // Reset stack to ensure there is always a screen to go back to from Metadata
      (navigation as any).reset({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'Metadata', params: { id, type } }
        ]
      });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation as any).navigate('MainTabs');
    }
  }, [navigation, headerOpacity, heroScale, filterOpacity, type, id]);

  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
  }, []);

  // Helper function to filter streams by quality exclusions
  const filterStreamsByQuality = useCallback((streams: Stream[]) => {
    if (!settings.excludedQualities || settings.excludedQualities.length === 0) {
      return streams;
    }

    return streams.filter(stream => {
      const streamTitle = stream.title || stream.name || '';
      
      // Check if any excluded quality is found in the stream title
      const hasExcludedQuality = settings.excludedQualities.some(excludedQuality => {
        // Create a case-insensitive regex pattern for the quality
        const pattern = new RegExp(excludedQuality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return pattern.test(streamTitle);
      });
      
      // Return true to keep the stream (if it doesn't have excluded quality)
      return !hasExcludedQuality;
    });
  }, [settings.excludedQualities]);

  // Helper function to sort streams based on user preference
  const sortStreams = useCallback((streams: Stream[]) => {
    const installedAddons = stremioService.getInstalledAddons();
    
    // Helper function to extract quality as number
    const getQualityNumeric = (title: string | undefined): number => {
      if (!title) return 0;
      
      // Check for 4K first (treat as 2160p)
      if (/\b4k\b/i.test(title)) {
        return 2160;
      }
      
      const matchWithP = title.match(/(\d+)p/i);
      if (matchWithP) return parseInt(matchWithP[1], 10);
      
      const qualityPatterns = [
        /\b(240|360|480|720|1080|1440|2160|4320|8000)\b/i
      ];
      
      for (const pattern of qualityPatterns) {
        const match = title.match(pattern);
        if (match) {
          const quality = parseInt(match[1], 10);
          if (quality >= 240 && quality <= 8000) return quality;
        }
      }
      return 0;
    };

    // Provider priority (higher number = higher priority)
    const getProviderPriority = (stream: Stream): number => {
      const addonId = stream.addonId || stream.addonName || '';
      const addonIndex = installedAddons.findIndex(addon => addon.id === addonId);
      
      if (addonIndex !== -1) {
        // Higher priority for addons installed earlier (reverse index)
        return 50 - addonIndex;
      }
      
      return 0; // Unknown providers get lowest priority
    };

    return [...streams].sort((a, b) => {
      const qualityA = getQualityNumeric(a.name || a.title);
      const qualityB = getQualityNumeric(b.name || b.title);
      const providerPriorityA = getProviderPriority(a);
      const providerPriorityB = getProviderPriority(b);
      const isCachedA = a.behaviorHints?.cached || false;
      const isCachedB = b.behaviorHints?.cached || false;

      // Always prioritize cached/debrid streams first
      if (isCachedA !== isCachedB) {
        return isCachedA ? -1 : 1;
      }

      if (settings.streamSortMode === 'quality-then-scraper') {
        // Sort by quality first, then by provider
        if (qualityA !== qualityB) {
          return qualityB - qualityA; // Higher quality first
        }
        if (providerPriorityA !== providerPriorityB) {
          return providerPriorityB - providerPriorityA; // Better provider first
        }
      } else {
        // Default: Sort by provider first, then by quality
        if (providerPriorityA !== providerPriorityB) {
          return providerPriorityB - providerPriorityA; // Better provider first
        }
        if (qualityA !== qualityB) {
          return qualityB - qualityA; // Higher quality first
        }
      }

      return 0;
    });
  }, [settings.excludedQualities, settings.streamSortMode]);

  // Function to determine the best stream based on quality, provider priority, and other factors
  const getBestStream = useCallback((streamsData: typeof groupedStreams): Stream | null => {
    if (!streamsData || Object.keys(streamsData).length === 0) {
      return null;
    }

    // Helper function to extract quality as number
    const getQualityNumeric = (title: string | undefined): number => {
      if (!title) return 0;
      
      // Check for 4K first (treat as 2160p)
      if (/\b4k\b/i.test(title)) {
        return 2160;
      }
      
      const matchWithP = title.match(/(\d+)p/i);
      if (matchWithP) return parseInt(matchWithP[1], 10);
      
      const qualityPatterns = [
        /\b(240|360|480|720|1080|1440|2160|4320|8000)\b/i
      ];
      
      for (const pattern of qualityPatterns) {
        const match = title.match(pattern);
        if (match) {
          const quality = parseInt(match[1], 10);
          if (quality >= 240 && quality <= 8000) return quality;
        }
      }
      return 0;
    };

    // Provider priority (higher number = higher priority)
    const getProviderPriority = (addonId: string): number => {
      // Get Stremio addon installation order (earlier = higher priority)
      const installedAddons = stremioService.getInstalledAddons();
      const addonIndex = installedAddons.findIndex(addon => addon.id === addonId);
      
      if (addonIndex !== -1) {
        // Higher priority for addons installed earlier (reverse index)
        return 50 - addonIndex;
      }
      
      return 0; // Unknown providers get lowest priority
    };

    // Collect all streams with metadata
    const allStreams: Array<{
      stream: Stream;
      quality: number;
      providerPriority: number;
      isDebrid: boolean;
      isCached: boolean;
    }> = [];

    Object.entries(streamsData).forEach(([addonId, { streams }]) => {
      // Apply quality filtering to streams before processing
      const filteredStreams = filterStreamsByQuality(streams);
      
      filteredStreams.forEach(stream => {
        const quality = getQualityNumeric(stream.name || stream.title);
        const providerPriority = getProviderPriority(addonId);
        const isDebrid = stream.behaviorHints?.cached || false;
        const isCached = isDebrid;

        allStreams.push({
          stream,
          quality,
          providerPriority,
          isDebrid,
          isCached,
        });
      });
    });

    if (allStreams.length === 0) return null;

    // Sort streams by multiple criteria (best first)
    allStreams.sort((a, b) => {
      // 1. Prioritize cached/debrid streams
      if (a.isCached !== b.isCached) {
        return a.isCached ? -1 : 1;
      }

      // 2. Prioritize higher quality
      if (a.quality !== b.quality) {
        return b.quality - a.quality;
      }

      // 3. Prioritize better providers
      if (a.providerPriority !== b.providerPriority) {
        return b.providerPriority - a.providerPriority;
      }

      return 0;
    });

    logger.log(`🎯 Best stream selected: ${allStreams[0].stream.name || allStreams[0].stream.title} (Quality: ${allStreams[0].quality}p, Provider Priority: ${allStreams[0].providerPriority}, Cached: ${allStreams[0].isCached})`);
    
    return allStreams[0].stream;
  }, [filterStreamsByQuality]);

  const currentEpisode = useMemo(() => {
    if (!selectedEpisode) return null;

    // Search through all episodes in all seasons
    const allEpisodes = Object.values(groupedEpisodes).flat();
    return allEpisodes.find(ep => 
      ep.stremioId === selectedEpisode || 
      `${id}:${ep.season_number}:${ep.episode_number}` === selectedEpisode
    );
  }, [selectedEpisode, groupedEpisodes, id]);

  // TMDB hydration for series hero (rating/runtime/still)
  const [tmdbEpisodeOverride, setTmdbEpisodeOverride] = useState<{ vote_average?: number; runtime?: number; still_path?: string } | null>(null);

  useEffect(() => {
    const hydrateEpisodeFromTmdb = async () => {
      try {
        setTmdbEpisodeOverride(null);
        if (type !== 'series' || !currentEpisode || !id) return;
        // Skip if data already present
        const needsHydration = !(currentEpisode as any).runtime || !(currentEpisode as any).vote_average || !currentEpisode.still_path;
        if (!needsHydration) return;

        // Resolve TMDB show id
        let tmdbShowId: number | null = null;
        if (id.startsWith('tmdb:')) {
          tmdbShowId = parseInt(id.split(':')[1], 10);
        } else if (id.startsWith('tt')) {
          tmdbShowId = await tmdbService.findTMDBIdByIMDB(id);
        }
        if (!tmdbShowId) return;

        const allEpisodes: Record<string, any[]> = await tmdbService.getAllEpisodes(tmdbShowId) as any;
        const seasonKey = String(currentEpisode.season_number);
        const seasonList: any[] = (allEpisodes && (allEpisodes as any)[seasonKey]) || [];
        const ep = seasonList.find((e: any) => e.episode_number === currentEpisode.episode_number);
        if (ep) {
          setTmdbEpisodeOverride({
            vote_average: ep.vote_average,
            runtime: ep.runtime,
            still_path: ep.still_path,
          });
        }
      } catch (e) {
        logger.warn('[StreamsScreen] TMDB hydration failed:', e);
      }
    };

    hydrateEpisodeFromTmdb();
  }, [type, id, currentEpisode?.season_number, currentEpisode?.episode_number]);

  const navigateToPlayer = useCallback(async (stream: Stream, options?: { forceVlc?: boolean; headers?: Record<string, string> }) => {
    // Prepare available streams for the change source feature
    const streamsToPass = type === 'series' ? episodeStreams : groupedStreams;
    
    // Determine the stream name using the same logic as StreamCard
    const streamName = stream.name || stream.title || 'Unnamed Stream';
    const streamProvider = stream.addonId || stream.addonName || stream.name;
    
    // Determine if we should force VLC on iOS based on provider-declared formats (e.g., MKV)
    let forceVlc = !!options?.forceVlc;
    try {
      const providerId = stream.addonId || (stream as any).addon;
      if (Platform.OS === 'ios' && providerId && !forceVlc) {
        forceVlc = await localScraperService.supportsFormat(providerId, 'mkv');
        logger.log(`[StreamsScreen] Provider '${providerId}' MKV support -> ${forceVlc}`);
      }
    } catch (e) {
      logger.warn('[StreamsScreen] MKV support detection failed:', e);
    }

    // Add pre-navigation orientation lock to reduce glitch on phones only; tablets can rotate freely
    try {
      const { width: dw, height: dh } = Dimensions.get('window');
      const isTablet = Math.min(dw, dh) >= 768 || ((Platform as any).isPad === true);
      if (!isTablet) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.unlockAsync();
      }
    } catch (e) {
      logger.warn('[StreamsScreen] Pre-navigation orientation lock failed:', e);
    }
    // Small delay to allow orientation to settle
    await new Promise(res => setTimeout(res, Platform.OS === 'ios' ? 120 : 60));

    // Show a quick full-screen black overlay to mask rotation flicker
    // by setting a transient state that renders a covering View (implementation already supported by dark backgrounds)
    
    // Infer video type for player (helps Android ExoPlayer choose correct extractor)
    const inferVideoTypeFromUrl = (u?: string): string | undefined => {
      if (!u) return undefined;
      const lower = u.toLowerCase();
      if (/(\.|ext=)(m3u8)(\b|$)/i.test(lower)) return 'm3u8';
      if (/(\.|ext=)(mpd)(\b|$)/i.test(lower)) return 'mpd';
      if (/(\.|ext=)(mp4)(\b|$)/i.test(lower)) return 'mp4';
      return undefined;
    };
    let videoType = inferVideoTypeFromUrl(stream.url);
    // Heuristic: certain providers (e.g., Xprime) serve HLS without .m3u8 extension
    try {
      const providerId = stream.addonId || (stream as any).addon || '';
      if (!videoType && /xprime/i.test(providerId)) {
        videoType = 'm3u8';
      }
    } catch {}

    navigation.navigate('Player', {
      uri: stream.url,
      title: metadata?.name || '',
      episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
      season: type === 'series' ? currentEpisode?.season_number : undefined,
      episode: type === 'series' ? currentEpisode?.episode_number : undefined,
      quality: (stream.title?.match(/(\d+)p/) || [])[1] || undefined,
      year: metadata?.year,
      streamProvider: streamProvider,
      streamName: streamName,
      // Always prefer stream.headers; player will use these for requests
      headers: options?.headers || stream.headers || undefined,
      // Force VLC for providers that declare MKV format support on iOS
      forceVlc,
      id,
      type,
      episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined,
      imdbId: imdbId || undefined,
      availableStreams: streamsToPass,
      backdrop: bannerImage || undefined,
      // Hint for Android ExoPlayer/react-native-video
      videoType: videoType,
    } as any);
  }, [metadata, type, currentEpisode, navigation, id, selectedEpisode, imdbId, episodeStreams, groupedStreams, bannerImage]);


  // Update handleStreamPress
  const handleStreamPress = useCallback(async (stream: Stream) => {
    try {
      if (stream.url) {
        // Block magnet links - not supported yet
        if (stream.url.startsWith('magnet:')) {
          try {
            Alert.alert('Not supported', 'Torrent streaming is not supported yet.');
          } catch (_e) {}
          return;
        }
        // If provider declares MKV support, force the in-app VLC-based player on iOS
        try {
          const providerId = stream.addonId || (stream as any).addon;
          if (Platform.OS === 'ios' && providerId) {
            const providerRequiresVlc = await localScraperService.supportsFormat(providerId, 'mkv');
            if (providerRequiresVlc) {
              logger.log(`[StreamsScreen] Forcing in-app VLC for provider '${providerId}' on iOS due to MKV support`);
              navigateToPlayer(stream);
              return;
            }
          }
        } catch (err) {
          logger.warn('[StreamsScreen] MKV pre-check failed:', err);
        }

        // iOS: very short MKV detection race; never block longer than MKV_HEAD_TIMEOUT_MS
        if (Platform.OS === 'ios') {
          const lowerUrl = (stream.url || '').toLowerCase();
          const isMkvByPath = lowerUrl.includes('.mkv') || /[?&]ext=mkv\b/i.test(lowerUrl) || /format=mkv\b/i.test(lowerUrl) || /container=mkv\b/i.test(lowerUrl);
          const isHttp = lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://');
          if (!isMkvByPath && isHttp) {
            try {
              const mkvDetected = await Promise.race<boolean>([
                detectMkvViaHead(stream.url, (stream.headers as any) || undefined),
                new Promise<boolean>(res => setTimeout(() => res(false), MKV_HEAD_TIMEOUT_MS)),
              ]);
              if (mkvDetected) {
                const mergedHeaders = {
                  ...(stream.headers || {}),
                  'Content-Type': 'video/x-matroska',
                } as Record<string, string>;
                logger.log('[StreamsScreen] HEAD detected MKV via Content-Type quickly, forcing in-app VLC on iOS');
                navigateToPlayer(stream, { forceVlc: true, headers: mergedHeaders });
                return;
              }
            } catch (e) {
              logger.warn('[StreamsScreen] Short MKV detection failed:', e);
            }
          }
        }

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
            
            if (__DEV__) console.log(`Attempting to open stream in ${settings.preferredPlayer}`);
            
            // Try each URL format in sequence
            const tryNextUrl = (index: number) => {
              if (index >= externalPlayerUrls.length) {
                if (__DEV__) console.log(`All ${settings.preferredPlayer} formats failed, falling back to direct URL`);
                // Try direct URL as last resort
                Linking.openURL(stream.url)
                  .then(() => { if (__DEV__) console.log('Opened with direct URL'); })
                  .catch(() => {
                    if (__DEV__) console.log('Direct URL failed, falling back to built-in player');
                    navigateToPlayer(stream);
                  });
                return;
              }
              
              const url = externalPlayerUrls[index];
              if (__DEV__) console.log(`Trying ${settings.preferredPlayer} URL format ${index + 1}: ${url}`);
              
              Linking.openURL(url)
                .then(() => { if (__DEV__) console.log(`Successfully opened stream with ${settings.preferredPlayer} format ${index + 1}`); })
                .catch(err => {
                  if (__DEV__) console.log(`Format ${index + 1} failed: ${err.message}`, err);
                  tryNextUrl(index + 1);
                });
            };
            
            // Start with the first URL format
            tryNextUrl(0);
            
          } catch (error) {
            if (__DEV__) console.error(`Error with ${settings.preferredPlayer}:`, error);
            // Fallback to the built-in player
            navigateToPlayer(stream);
          }
        } 
        // For Android with external player preference
        else if (Platform.OS === 'android' && settings.useExternalPlayer) {
          try {
            if (__DEV__) console.log('Opening stream with Android native app chooser');
            
            // For Android, determine if the URL is a direct http/https URL or a magnet link
            const isMagnet = stream.url.startsWith('magnet:');
            
            if (isMagnet) {
              // For magnet links, open directly which will trigger the torrent app chooser
              if (__DEV__) console.log('Opening magnet link directly');
              Linking.openURL(stream.url)
                .then(() => { if (__DEV__) console.log('Successfully opened magnet link'); })
                  .catch(err => {
                    if (__DEV__) console.error('Failed to open magnet link:', err);
                  // No good fallback for magnet links
                  navigateToPlayer(stream);
                });
            } else {
              // For direct video URLs, use the VideoPlayerService to show the Android app chooser
              const success = await VideoPlayerService.playVideo(stream.url, {
                useExternalPlayer: true,
                title: metadata?.name || 'Video',
                episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
                episodeNumber: type === 'series' && currentEpisode ? `S${currentEpisode.season_number}E${currentEpisode.episode_number}` : undefined,
              });
              
              if (!success) {
                if (__DEV__) console.log('VideoPlayerService failed, falling back to built-in player');
                      navigateToPlayer(stream);
              }
            }
          } catch (error) {
            if (__DEV__) console.error('Error with external player:', error);
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
      if (__DEV__) console.error('Error in handleStreamPress:', error);
      // Final fallback: Use built-in player
      navigateToPlayer(stream);
    }
  }, [settings.preferredPlayer, settings.useExternalPlayer, navigateToPlayer]);

  // Ensure portrait when returning to this screen on iOS
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'ios') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
      return () => {};
    }, [])
  );

  // Autoplay effect - triggers immediately when streams are available and autoplay is enabled
  useEffect(() => {
    if (
      settings.autoplayBestStream && 
      !autoplayTriggered && 
      isAutoplayWaiting
    ) {
      const streams = type === 'series' ? episodeStreams : groupedStreams;
      
      if (Object.keys(streams).length > 0) {
        const bestStream = getBestStream(streams);
        
        if (bestStream) {
          logger.log('🚀 Autoplay: Best stream found, starting playback immediately...');
          setAutoplayTriggered(true);
          setIsAutoplayWaiting(false);
          
          // Start playback immediately - no delay needed
          handleStreamPress(bestStream);
        } else {
          logger.log('⚠️ Autoplay: No suitable stream found');
          setIsAutoplayWaiting(false);
        }
      }
    }
  }, [
    settings.autoplayBestStream,
    autoplayTriggered,
    isAutoplayWaiting,
    type,
    episodeStreams,
    groupedStreams,
    getBestStream,
    handleStreamPress
  ]);

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

    // In grouped mode, separate addons and plugins
    if (settings.streamDisplayMode === 'grouped') {
      const addonProviders: string[] = [];
      const pluginProviders: string[] = [];
      
      Array.from(allProviders).forEach(provider => {
        const isInstalledAddon = installedAddons.some(addon => addon.id === provider);
        if (isInstalledAddon) {
          addonProviders.push(provider);
        } else {
          pluginProviders.push(provider);
        }
      });
      
      const filterChips = [{ id: 'all', name: 'All Providers' }];
      
      // Add individual addon chips
      addonProviders
        .sort((a, b) => {
          const indexA = installedAddons.findIndex(addon => addon.id === a);
          const indexB = installedAddons.findIndex(addon => addon.id === b);
          return indexA - indexB;
        })
        .forEach(provider => {
          const installedAddon = installedAddons.find(addon => addon.id === provider);
          filterChips.push({ id: provider, name: installedAddon?.name || provider });
        });
      
      // Add single grouped plugins chip if there are any plugins
      if (pluginProviders.length > 0) {
        filterChips.push({ id: 'grouped-plugins', name: localScraperService.getRepositoryName() });
      }
      
      return filterChips;
    }

    // Normal mode - individual chips for all providers
    return [
      { id: 'all', name: 'All Providers' },
      ...Array.from(allProviders)
        .sort((a, b) => {
          // Sort by Stremio addon installation order
          const indexA = installedAddons.findIndex(addon => addon.id === a);
          const indexB = installedAddons.findIndex(addon => addon.id === b);
          
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        })
        .map(provider => {
          const addonInfo = streams[provider];
          
          // Standard handling for Stremio addons
          const installedAddon = installedAddons.find(addon => addon.id === provider);
          
          let displayName = provider;
          if (installedAddon) displayName = installedAddon.name;
          else if (addonInfo?.addonName) displayName = addonInfo.addonName;
          
          return { id: provider, name: displayName };
        })
    ];
  }, [availableProviders, type, episodeStreams, groupedStreams, settings.streamDisplayMode]);

  const sections = useMemo(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    const installedAddons = stremioService.getInstalledAddons();

    // Filter streams by selected provider
    const filteredEntries = Object.entries(streams)
      .filter(([addonId]) => {
        // If "all" is selected, show all providers
        if (selectedProvider === 'all') {
          return true;
        }
        
        // In grouped mode, handle special 'grouped-plugins' filter
        if (settings.streamDisplayMode === 'grouped' && selectedProvider === 'grouped-plugins') {
          const isInstalledAddon = installedAddons.some(addon => addon.id === addonId);
          return !isInstalledAddon; // Show only plugins (non-installed addons)
        }
        
        // Otherwise only show the selected provider
        return addonId === selectedProvider;
      })
      .sort(([addonIdA], [addonIdB]) => {
        // Sort by Stremio addon installation order
        const indexA = installedAddons.findIndex(addon => addon.id === addonIdA);
        const indexB = installedAddons.findIndex(addon => addon.id === addonIdB);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });

    // Check if we should group all streams under one section
    if (settings.streamDisplayMode === 'grouped') {
      // Separate streams by type: installed addons vs plugins
      const addonStreams: Stream[] = [];
      const pluginStreams: Stream[] = [];
      const addonNames: string[] = [];
      const pluginNames: string[] = [];
      
      filteredEntries.forEach(([addonId, { addonName, streams: providerStreams }]) => {
        const isInstalledAddon = installedAddons.some(addon => addon.id === addonId);
        
        // Apply quality filtering and sorting to streams
        const filteredStreams = filterStreamsByQuality(providerStreams);
        const sortedStreams = sortStreams(filteredStreams);
        
        if (isInstalledAddon) {
          addonStreams.push(...sortedStreams);
          if (!addonNames.includes(addonName)) {
            addonNames.push(addonName);
          }
        } else {
          pluginStreams.push(...sortedStreams);
          if (!pluginNames.includes(addonName)) {
            pluginNames.push(addonName);
          }
        }
      });
      
      const sections = [];
      if (addonStreams.length > 0) {
        // Apply final sorting to the combined addon streams for quality-first mode
        const finalSortedAddonStreams = settings.streamSortMode === 'quality-then-scraper' ? 
          sortStreams(addonStreams) : addonStreams;
        
        sections.push({
          title: addonNames.join(', '),
          addonId: 'grouped-addons',
          data: finalSortedAddonStreams
        });
      }
      if (pluginStreams.length > 0) {
        // Apply final sorting to the combined plugin streams for quality-first mode
        const finalSortedPluginStreams = settings.streamSortMode === 'quality-then-scraper' ? 
          sortStreams(pluginStreams) : pluginStreams;
        
        sections.push({
          title: localScraperService.getRepositoryName(),
          addonId: 'grouped-plugins',
          data: finalSortedPluginStreams
        });
      }
      
      return sections;
    } else {
      // Use separate sections for each provider (current behavior)
      return filteredEntries.map(([addonId, { addonName, streams: providerStreams }]) => {
        // Apply quality filtering and sorting to streams
        const filteredStreams = filterStreamsByQuality(providerStreams);
        const sortedStreams = sortStreams(filteredStreams);
        
        return {
          title: addonName,
          addonId,
          data: sortedStreams
        };
      });
    }
  }, [selectedProvider, type, episodeStreams, groupedStreams, settings.streamDisplayMode, filterStreamsByQuality, sortStreams]);

  const episodeImage = useMemo(() => {
    if (episodeThumbnail) {
      if (episodeThumbnail.startsWith('http')) {
        return episodeThumbnail;
      }
      return tmdbService.getImageUrl(episodeThumbnail, 'original');
    }
    if (!currentEpisode) return null;
    const hydratedStill = tmdbEpisodeOverride?.still_path;
    if (currentEpisode.still_path || hydratedStill) {
      if (currentEpisode.still_path.startsWith('http')) {
        return currentEpisode.still_path;
      }
      const path = currentEpisode.still_path || hydratedStill || '';
      return tmdbService.getImageUrl(path, 'original');
    }
    return metadata?.poster || null;
  }, [currentEpisode, metadata, episodeThumbnail, tmdbEpisodeOverride?.still_path]);

  // Effective TMDB fields for hero (series)
  const effectiveEpisodeVote = useMemo(() => {
    if (!currentEpisode) return 0;
    const v = (tmdbEpisodeOverride?.vote_average ?? currentEpisode.vote_average) || 0;
    return typeof v === 'number' ? v : Number(v) || 0;
  }, [currentEpisode, tmdbEpisodeOverride?.vote_average]);

  const effectiveEpisodeRuntime = useMemo(() => {
    if (!currentEpisode) return undefined as number | undefined;
    const r = (tmdbEpisodeOverride?.runtime ?? (currentEpisode as any).runtime) as number | undefined;
    return r;
  }, [currentEpisode, tmdbEpisodeOverride?.runtime]);

  // Prefetch hero/backdrop and title logo when StreamsScreen opens
  useEffect(() => {
    const urls: string[] = [];
    if (episodeImage && typeof episodeImage === 'string') urls.push(episodeImage);
    if (bannerImage && typeof bannerImage === 'string') urls.push(bannerImage);
    if (metadata && (metadata as any).logo && typeof (metadata as any).logo === 'string') {
      urls.push((metadata as any).logo as string);
    }
    // Deduplicate and prefetch
    Array.from(new Set(urls)).forEach(u => {
      RNImage.prefetch(u).catch(() => {});
    });
  }, [episodeImage, bannerImage, metadata]);

  const isLoading = type === 'series' ? loadingEpisodeStreams : loadingStreams;
  const streams = type === 'series' ? episodeStreams : groupedStreams;

  // Determine extended loading phases
  const streamsEmpty = Object.keys(streams).length === 0;
  const loadElapsed = streamsLoadStart ? Date.now() - streamsLoadStart : 0;
  const showInitialLoading = streamsEmpty && (streamsLoadStart === null || loadElapsed < 10000);
  const showStillFetching = streamsEmpty && loadElapsed >= 10000;

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
    // Don't show loading for individual streams that are already available and displayed
    const isLoading = false; // If streams are being rendered, they're available and shouldn't be loading
    
    return (
      <View>
        <StreamCard 
          stream={stream} 
          onPress={() => handleStreamPress(stream)} 
          index={index}
          isLoading={isLoading}
          statusMessage={undefined}
          theme={currentTheme}
          showLogos={settings.showScraperLogos}
          scraperLogo={(stream.addonId && scraperLogos[stream.addonId]) || (stream as any).addon ? scraperLogoCache.get((stream.addonId || (stream as any).addon) as string) || null : null}
        />
      </View>
    );
  }, [handleStreamPress, currentTheme, settings.showScraperLogos, scraperLogos]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string; addonId: string } }) => {
    const isProviderLoading = loadingProviders[section.addonId];
    
    return (
      <View style={styles.sectionHeaderContainer}>
        <View style={styles.sectionHeaderContent}>
          <Text style={styles.streamGroupTitle}>{section.title}</Text>
          {isProviderLoading && (
            <View style={styles.sectionLoadingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.sectionLoadingText, { color: colors.primary }]}>
                Loading...
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [styles.streamGroupTitle, styles.sectionHeaderContainer, styles.sectionHeaderContent, styles.sectionLoadingIndicator, styles.sectionLoadingText, loadingProviders, colors.primary]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);



  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      
      
      {Platform.OS !== 'ios' && (
        <Animated.View
          style={[styles.backButtonContainer]}
        >
          <TouchableOpacity 
            style={[
              styles.backButton,
              Platform.OS === 'android' ? { paddingTop: 45 } : null
            ]}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.white} />
            <Text style={styles.backButtonText}>
              {type === 'series' ? 'Back to Episodes' : 'Back to Info'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {type === 'movie' && metadata && (
        <Animated.View style={[styles.movieTitleContainer, heroStyle]}>
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
        </Animated.View>
      )}

      {type === 'series' && (
        <Animated.View style={[styles.streamsHeroContainer, heroStyle]}>
          <Animated.View style={StyleSheet.absoluteFill}>
            <Animated.View
              style={StyleSheet.absoluteFill}
            >
              <Image
                source={episodeImage ? { uri: episodeImage } : undefined}
                style={styles.streamsHeroBackground}
                contentFit="cover"
                transition={500}
              />
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)', colors.darkBackground]}
                locations={[0, 0.4, 0.6, 0.8, 1]}
                style={styles.streamsHeroGradient}
              >
                <View style={styles.streamsHeroContent}>
                  {currentEpisode ? (
                    <Animated.View style={styles.streamsHeroInfo}>
                      <Text style={styles.streamsHeroEpisodeNumber}>{currentEpisode.episodeString}</Text>
                      <Text style={styles.streamsHeroTitle} numberOfLines={1}>
                        {currentEpisode.name}
                      </Text>
                      {!!currentEpisode.overview && (
                        <Animated.View>
                          <Text style={styles.streamsHeroOverview} numberOfLines={2}>
                            {currentEpisode.overview}
                          </Text>
                        </Animated.View>
                      )}
                      <Animated.View style={styles.streamsHeroMeta}>
                        <Text style={styles.streamsHeroReleased}>
                          {tmdbService.formatAirDate(currentEpisode.air_date)}
                        </Text>
                        {effectiveEpisodeVote > 0 && (
                          <Animated.View style={styles.streamsHeroRating}>
                            <Image source={{ uri: TMDB_LOGO }} style={styles.tmdbLogo} contentFit="contain" />
                            <Text style={styles.streamsHeroRatingText}>
                              {effectiveEpisodeVote.toFixed(1)}
                            </Text>
                          </Animated.View>
                        )}
                        {!!effectiveEpisodeRuntime && (
                          <Animated.View style={styles.streamsHeroRuntime}>
                            <MaterialIcons name="schedule" size={16} color={colors.mediumEmphasis} />
                            <Text style={styles.streamsHeroRuntimeText}>
                              {effectiveEpisodeRuntime >= 60
                                ? `${Math.floor(effectiveEpisodeRuntime / 60)}h ${effectiveEpisodeRuntime % 60}m`
                                : `${effectiveEpisodeRuntime}m`}
                            </Text>
                          </Animated.View>
                        )}
                      </Animated.View>
                    </Animated.View>
                  ) : (
                    // Placeholder to reserve space and avoid layout shift while loading
                    <View style={{ width: '100%', height: 120 }} />
                  )}
                </View>
              </LinearGradient>
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

        {/* Active Scrapers Status */}
        {activeFetchingScrapers.length > 0 && (
          <Animated.View 
            style={styles.activeScrapersContainer}
          >
            <Text style={styles.activeScrapersTitle}>Fetching from:</Text>
            <View style={styles.activeScrapersRow}>
              {activeFetchingScrapers.map((scraperName, index) => (
                <PulsingChip key={scraperName} text={scraperName} delay={index * 200} />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Update the streams/loading state display logic */}
        { showNoSourcesError ? (
            <Animated.View 
              entering={FadeIn.duration(300)}
              style={styles.noStreams}
            >
              <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
              <Text style={styles.noStreamsText}>No streaming sources available</Text>
              <Text style={styles.noStreamsSubText}>
                Please add streaming sources in settings
              </Text>
              <TouchableOpacity
                style={styles.addSourcesButton}
                onPress={() => navigation.navigate('Addons')}
              >
                <Text style={styles.addSourcesButtonText}>Add Sources</Text>
              </TouchableOpacity>
            </Animated.View>
        ) : streamsEmpty ? (
          showInitialLoading ? (
            <Animated.View 
              style={styles.loadingContainer}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>
                {isAutoplayWaiting ? 'Finding best stream for autoplay...' : 'Finding available streams...'}
              </Text>
            </Animated.View>
          ) : showStillFetching ? (
            <Animated.View 
              style={styles.loadingContainer}
            >
              <MaterialIcons name="hourglass-bottom" size={32} color={colors.primary} />
              <Text style={styles.loadingText}>Still fetching streams…</Text>
            </Animated.View>
          ) : (
            // No streams and not loading = no streams available
            <Animated.View 
              style={styles.noStreams}
            >
              <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
              <Text style={styles.noStreamsText}>No streams available</Text>
            </Animated.View>
          )
        ) : (
          // Show streams immediately when available, even if still loading others
          <View collapsable={false} style={{ flex: 1 }}>
            {/* Show autoplay loading overlay if waiting for autoplay */}
            {isAutoplayWaiting && !autoplayTriggered && (
              <Animated.View 
                style={styles.autoplayOverlay}
              >
                <View style={styles.autoplayIndicator}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.autoplayText}>Starting best stream...</Text>
                </View>
              </Animated.View>
            )}
            
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.url || `${item.name}-${item.title}`}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              initialNumToRender={6}
              maxToRenderPerBatch={2}
              windowSize={3}
              removeClippedSubviews={true}
              contentContainerStyle={styles.streamsContainer}
              style={styles.streamsContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
              overScrollMode="never"
              ListFooterComponent={
                (loadingStreams || loadingEpisodeStreams) && hasStremioStreamProviders ? (
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? 45 : 15,
    backgroundColor: 'transparent',
  },
  backButtonText: {
    color: colors.highEmphasis,
    fontSize: 13,
    fontWeight: '600',
  },
  streamsMainContent: {
    flex: 1,
    backgroundColor: colors.darkBackground,
    paddingTop: 12,
    zIndex: 1,
  },
  streamsMainContentMovie: {
    paddingTop: Platform.OS === 'android' ? 10 : 15,
  },
  filterContainer: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    backgroundColor: colors.elevation2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 0,
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    color: colors.highEmphasis,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  filterChipTextSelected: {
    color: colors.white,
    fontWeight: '700',
  },
  streamsContent: {
    flex: 1,
    width: '100%',
    zIndex: 2,
  },
  streamsContainer: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    width: '100%',
  },
  streamGroup: {
    marginBottom: 24,
    width: '100%',
  },
  streamGroupTitle: {
    color: colors.highEmphasis,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 0,
    opacity: 0.9,
    backgroundColor: 'transparent',
  },
  streamCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    minHeight: 68,
    backgroundColor: colors.card,
    borderWidth: 0,
    width: '100%',
    zIndex: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  },
  scraperLogoContainer: {
    width: 32,
    height: 32,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.elevation2,
    borderRadius: 6,
  },
  scraperLogo: {
    width: 24,
    height: 24,
  },
  streamCardLoading: {
    opacity: 0.7,
  },
  streamCardHighlighted: {
    backgroundColor: colors.elevation2,
    shadowOpacity: 0.18,
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
    fontWeight: '700',
    marginBottom: 2,
    lineHeight: 20,
    color: colors.highEmphasis,
    letterSpacing: 0.1,
  },
  streamAddonName: {
    fontSize: 12,
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
    paddingVertical: 3,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: colors.elevation2,
  },
  chipText: {
    color: colors.highEmphasis,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
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
    height: 220, // Fixed height to prevent layout shift
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
    ...StyleSheet.absoluteFillObject,
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
    // chip background removed
    marginTop: 0,
  },
  tmdbLogo: {
    width: 20,
    height: 14,
  },
  streamsHeroRatingText: {
    color: colors.highEmphasis,
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
    height: 140,
    backgroundColor: colors.darkBackground,
    pointerEvents: 'box-none',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'android' ? 65 : 35,
  },
  movieTitleContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movieLogo: {
    width: '100%',
    height: '100%',
    maxWidth: width * 0.85,
  },
  movieTitle: {
    color: colors.highEmphasis,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
  },
  streamsHeroRuntime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // chip background removed
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
  sectionHeaderContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLoadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionLoadingText: {
    marginLeft: 8,
  },
  autoplayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  autoplayIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevation2,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  autoplayText: {
    color: colors.primary,
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '600',
  },
  noStreamsSubText: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  addSourcesButton: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  addSourcesButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  activeScrapersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    marginHorizontal: 16,
    marginBottom: 4,
  },
  activeScrapersTitle: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    opacity: 0.8,
  },
  activeScrapersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  activeScraperChip: {
    backgroundColor: colors.elevation2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0,
  },
  activeScraperText: {
    color: colors.mediumEmphasis,
    fontSize: 11,
    fontWeight: '400',
  },
});

export default memo(StreamsScreen);