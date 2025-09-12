import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, TouchableOpacity, TouchableWithoutFeedback, Dimensions, Animated, ActivityIndicator, Platform, NativeModules, StatusBar, Text, Image, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video, { VideoRef, SelectedTrack, SelectedTrackType, BufferingStrategyType } from 'react-native-video';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { PinchGestureHandler, PanGestureHandler, TapGestureHandler, State, PinchGestureHandlerGestureEvent, PanGestureHandlerGestureEvent, TapGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import RNImmersiveMode from 'react-native-immersive-mode';
import * as ScreenOrientation from 'expo-screen-orientation';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTraktAutosync } from '../../hooks/useTraktAutosync';
import { useTraktAutosyncSettings } from '../../hooks/useTraktAutosyncSettings';
import { useMetadata } from '../../hooks/useMetadata';
import { useSettings } from '../../hooks/useSettings';

import { 
  DEFAULT_SUBTITLE_SIZE, 
  AudioTrack,
  TextTrack,
  ResizeModeType, 
  WyzieSubtitle, 
  SubtitleCue,
  RESUME_PREF_KEY,
  RESUME_PREF,
  SUBTITLE_SIZE_KEY
} from './utils/playerTypes';
import { safeDebugLog, parseSRT, DEBUG_MODE, formatTime } from './utils/playerUtils';
import { styles } from './utils/playerStyles';
import { SubtitleModals } from './modals/SubtitleModals';
import { AudioTrackModal } from './modals/AudioTrackModal';
// Removed ResumeOverlay usage when alwaysResume is enabled
import PlayerControls from './controls/PlayerControls';
import CustomSubtitles from './subtitles/CustomSubtitles';
import { SourcesModal } from './modals/SourcesModal';
import { stremioService } from '../../services/stremioService';
import axios from 'axios';
import * as Brightness from 'expo-brightness';

// Map VLC resize modes to react-native-video resize modes
const getVideoResizeMode = (resizeMode: ResizeModeType) => {
  switch (resizeMode) {
    case 'contain': return 'contain';
    case 'cover': return 'cover';
    case 'stretch': return 'stretch';
    case 'none': return 'contain';
    default: return 'contain';
  }
};

const AndroidVideoPlayer: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  
  const {
    uri,
    title = 'Episode Name',
    season,
    episode,
    episodeTitle,
    quality,
    year,
    streamProvider,
    streamName,
    headers,
    id,
    type,
    episodeId,
    imdbId,
    availableStreams: passedAvailableStreams,
    backdrop
  } = route.params;

  // Optional hint not yet in typed navigator params
  const videoType = (route.params as any).videoType as string | undefined;

  const defaultAndroidHeaders = () => {
    if (Platform.OS !== 'android') return {} as any;
    return {
      'User-Agent': 'ExoPlayerLib/2.19.1 (Linux;Android) Nuvio/1.0',
      'Accept': '*/*',
      'Connection': 'keep-alive',
    } as any;
  };

  const defaultIosHeaders = () => {
    if (Platform.OS !== 'ios') return {} as any;
    return {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Nuvio/1.0',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
    } as any;
  };

  // Initialize Trakt autosync
  const traktAutosync = useTraktAutosync({
    id: id || '',
    type: type === 'series' ? 'series' : 'movie',
    title: episodeTitle || title,
    year: year || 0,
    imdbId: imdbId || '',
    season: season,
    episode: episode,
    showTitle: title,
    showYear: year,
    showImdbId: imdbId,
    episodeId: episodeId
  });

  // Get the Trakt autosync settings to use the user-configured sync frequency
  const { settings: traktSettings } = useTraktAutosyncSettings();

  safeDebugLog("Android Component mounted with props", {
    uri, title, season, episode, episodeTitle, quality, year,
    streamProvider, id, type, episodeId, imdbId
  });

  const screenData = Dimensions.get('screen');
  const [screenDimensions, setScreenDimensions] = useState(screenData);

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('contain');
  const [buffered, setBuffered] = useState(0);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const videoRef = useRef<VideoRef>(null);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [progressSaveInterval, setProgressSaveInterval] = useState<NodeJS.Timeout | null>(null);
  const [isInitialSeekComplete, setIsInitialSeekComplete] = useState(false);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [savedDuration, setSavedDuration] = useState<number | null>(null);
  const initialSeekTargetRef = useRef<number | null>(null);
  const initialSeekVerifiedRef = useRef(false);
  const isSourceSeekableRef = useRef<boolean | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] = useState(false);
  const openingFadeAnim = useRef(new Animated.Value(0)).current;
  const openingScaleAnim = useRef(new Animated.Value(0.8)).current;
  const backgroundFadeAnim = useRef(new Animated.Value(1)).current;
  const [isBuffering, setIsBuffering] = useState(false);
  const [rnVideoAudioTracks, setRnVideoAudioTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [rnVideoTextTracks, setRnVideoTextTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  // Removed progressAnim and progressBarRef - no longer needed with React Native Community Slider
  const [isDragging, setIsDragging] = useState(false);
  const isSeeking = useRef(false);
  const seekDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekValue = useRef<number | null>(null);
  const lastSeekTime = useRef<number>(0);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  const [is16by9Content, setIs16by9Content] = useState(false);
  const [customVideoStyles, setCustomVideoStyles] = useState<any>({});
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomTranslateX, setZoomTranslateX] = useState(0);
  const [zoomTranslateY, setZoomTranslateY] = useState(0);
  const [lastZoomScale, setLastZoomScale] = useState(1);
  const [lastTranslateX, setLastTranslateX] = useState(0);
  const [lastTranslateY, setLastTranslateY] = useState(0);
  const pinchRef = useRef<PinchGestureHandler>(null);
  const [customSubtitles, setCustomSubtitles] = useState<SubtitleCue[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [customSubtitleVersion, setCustomSubtitleVersion] = useState<number>(0);
  const [subtitleSize, setSubtitleSize] = useState<number>(DEFAULT_SUBTITLE_SIZE);
  const [subtitleBackground, setSubtitleBackground] = useState<boolean>(true);
  // iOS seeking helpers
  const iosWasPausedDuringSeekRef = useRef<boolean | null>(null);
  const wasPlayingBeforeDragRef = useRef<boolean>(false);
  // External subtitle customization
  const [subtitleTextColor, setSubtitleTextColor] = useState<string>('#FFFFFF');
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState<number>(0.7);
  const [subtitleTextShadow, setSubtitleTextShadow] = useState<boolean>(true);
  const [subtitleOutline, setSubtitleOutline] = useState<boolean>(false);
  const [subtitleOutlineColor, setSubtitleOutlineColor] = useState<string>('#000000');
  const [subtitleOutlineWidth, setSubtitleOutlineWidth] = useState<number>(2);
  const [subtitleAlign, setSubtitleAlign] = useState<'center' | 'left' | 'right'>('center');
  const [subtitleBottomOffset, setSubtitleBottomOffset] = useState<number>(20);
  const [subtitleLetterSpacing, setSubtitleLetterSpacing] = useState<number>(0);
  const [subtitleLineHeightMultiplier, setSubtitleLineHeightMultiplier] = useState<number>(1.2);
  const [subtitleOffsetSec, setSubtitleOffsetSec] = useState<number>(0);
  const [useCustomSubtitles, setUseCustomSubtitles] = useState<boolean>(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState<boolean>(false);
  const [availableSubtitles, setAvailableSubtitles] = useState<WyzieSubtitle[]>([]);
  const [showSubtitleLanguageModal, setShowSubtitleLanguageModal] = useState<boolean>(false);
  const [isLoadingSubtitleList, setIsLoadingSubtitleList] = useState<boolean>(false);
  const [showSourcesModal, setShowSourcesModal] = useState<boolean>(false);
  const [availableStreams, setAvailableStreams] = useState<{ [providerId: string]: { streams: any[]; addonName: string } }>(passedAvailableStreams || {});
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(uri);
  const [currentVideoType, setCurrentVideoType] = useState<string | undefined>(videoType);
  // Track a single silent retry per source to avoid loops
  const retryAttemptRef = useRef<number>(0);
  const [isChangingSource, setIsChangingSource] = useState<boolean>(false);
  const [pendingSeek, setPendingSeek] = useState<{ position: number; shouldPlay: boolean } | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string | undefined>(quality);
  const [currentStreamProvider, setCurrentStreamProvider] = useState<string | undefined>(streamProvider);
  const [currentStreamName, setCurrentStreamName] = useState<string | undefined>(streamName);
  const isMounted = useRef(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isSyncingBeforeClose, setIsSyncingBeforeClose] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Volume and brightness controls
  const [volume, setVolume] = useState(1.0);
  const [brightness, setBrightness] = useState(1.0);
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const [showBrightnessOverlay, setShowBrightnessOverlay] = useState(false);
  const volumeOverlayOpacity = useRef(new Animated.Value(0)).current;
  const brightnessOverlayOpacity = useRef(new Animated.Value(0)).current;
  const volumeOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const brightnessOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastVolumeChange = useRef<number>(0);
  const lastBrightnessChange = useRef<number>(0);

  // iOS startup timing diagnostics
  const loadStartAtRef = useRef<number | null>(null);
  const firstFrameAtRef = useRef<number | null>(null);

  // Pause overlay state
  const [showPauseOverlay, setShowPauseOverlay] = useState(false);
  const pauseOverlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pauseOverlayOpacity = useRef(new Animated.Value(0)).current;
  const pauseOverlayTranslateY = useRef(new Animated.Value(12)).current;
  const metadataOpacity = useRef(new Animated.Value(1)).current;
  const metadataScale = useRef(new Animated.Value(1)).current;

  // Next episode button state
  const [showNextEpisodeButton, setShowNextEpisodeButton] = useState(false);
  const [isLoadingNextEpisode, setIsLoadingNextEpisode] = useState(false);
  const [nextLoadingProvider, setNextLoadingProvider] = useState<string | null>(null);
  const [nextLoadingQuality, setNextLoadingQuality] = useState<string | null>(null);
  const [nextLoadingTitle, setNextLoadingTitle] = useState<string | null>(null);
  const nextEpisodeButtonOpacity = useRef(new Animated.Value(0)).current;
  const nextEpisodeButtonScale = useRef(new Animated.Value(0.8)).current;

  // Cast display state
  const [selectedCastMember, setSelectedCastMember] = useState<any>(null);
  const [showCastDetails, setShowCastDetails] = useState(false);
  const castDetailsOpacity = useRef(new Animated.Value(0)).current;
  const castDetailsScale = useRef(new Animated.Value(0.95)).current;

  // Get metadata to access logo (only if we have a valid id)
  const shouldLoadMetadata = Boolean(id && type);
  const metadataResult = useMetadata({ id: id || 'placeholder', type: (type as any) });
  const { settings: appSettings } = useSettings();
  const { metadata, loading: metadataLoading, groupedEpisodes, cast, loadCast } = shouldLoadMetadata ? (metadataResult as any) : { metadata: null, loading: false, groupedEpisodes: {}, cast: [], loadCast: () => {} };
  
  // Logo animation values
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
  const logoOpacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Check if we have a logo to show
  const hasLogo = metadata && metadata.logo && !metadataLoading;

  // Prefetch backdrop and title logo for faster loading screen appearance
  useEffect(() => {
    if (backdrop && typeof backdrop === 'string') {
      Image.prefetch(backdrop).catch(() => {});
    }
  }, [backdrop]);

  useEffect(() => {
    const logoUrl = (metadata && (metadata as any).logo) as string | undefined;
    if (logoUrl && typeof logoUrl === 'string') {
      Image.prefetch(logoUrl).catch(() => {});
    }
  }, [metadata]);

  // Resolve current episode description for series
  const currentEpisodeDescription = (() => {
    try {
      if ((type as any) !== 'series') return '';
      const allEpisodes = Object.values(groupedEpisodes || {}).flat() as any[];
      if (!allEpisodes || allEpisodes.length === 0) return '';
      let match: any | null = null;
      if (episodeId) {
        match = allEpisodes.find(ep => ep?.stremioId === episodeId || String(ep?.id) === String(episodeId));
      }
      if (!match && season && episode) {
        match = allEpisodes.find(ep => ep?.season_number === season && ep?.episode_number === episode);
      }
      return (match?.overview || '').trim();
    } catch {
      return '';
    }
  })();

  // Find next episode for series
  const nextEpisode = useMemo(() => {
    try {
      if ((type as any) !== 'series' || !season || !episode) return null;
      const allEpisodes = Object.values(groupedEpisodes || {}).flat() as any[];
      if (!allEpisodes || allEpisodes.length === 0) return null;
      
      // First try next episode in same season
      let nextEp = allEpisodes.find((ep: any) => 
        ep.season_number === season && ep.episode_number === episode + 1
      );
      
      // If not found, try first episode of next season
      if (!nextEp) {
        nextEp = allEpisodes.find((ep: any) => 
          ep.season_number === season + 1 && ep.episode_number === 1
        );
      }
      
      return nextEp;
    } catch {
      return null;
    }
  }, [type, season, episode, groupedEpisodes]);
  
  // Small offset (in seconds) used to avoid seeking to the *exact* end of the
  // file which triggers the `onEnd` callback and causes playback to restart.
  const END_EPSILON = 0.3;

  const hideControls = () => {
    // Do not hide while user is interacting with the slider
    if (isDragging) {
      return;
    }
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowControls(false));
  };

  const calculateVideoStyles = (videoWidth: number, videoHeight: number, screenWidth: number, screenHeight: number) => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      width: screenWidth,
      height: screenHeight,
    };
  };

  const onPinchGestureEvent = (event: PinchGestureHandlerGestureEvent) => {
    const { scale } = event.nativeEvent;
    const newScale = Math.max(1, Math.min(lastZoomScale * scale, 1.1));
    setZoomScale(newScale);
    if (DEBUG_MODE) {
      if (__DEV__) logger.log(`[AndroidVideoPlayer] Center Zoom: ${newScale.toFixed(2)}x`);
    }
  };

  const onPinchHandlerStateChange = (event: PinchGestureHandlerGestureEvent) => {
    if (event.nativeEvent.state === State.END) {
      setLastZoomScale(zoomScale);
      if (DEBUG_MODE) {
        if (__DEV__) logger.log(`[AndroidVideoPlayer] Pinch ended - saved scale: ${zoomScale.toFixed(2)}x`);
      }
    }
  };

  // Volume gesture handler (right side of screen)
  const onVolumeGestureEvent = async (event: PanGestureHandlerGestureEvent) => {
    const { translationY, state } = event.nativeEvent;
    const screenHeight = screenDimensions.height;
    const sensitivity = 0.002; // Reduced for finer control
    
    if (state === State.ACTIVE) {
      const deltaY = -translationY; // Invert for natural feel (up = increase)
      const volumeChange = deltaY * sensitivity;
      const newVolume = Math.max(0, Math.min(1, volume + volumeChange));
      
      if (Math.abs(newVolume - volume) > 0.005) { // Reduced threshold for smoother updates
        setVolume(newVolume);
        lastVolumeChange.current = Date.now();
        
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Volume set to: ${newVolume}`);
        }
        
        // Show overlay with smoother animation
        if (!showVolumeOverlay) {
          setShowVolumeOverlay(true);
          Animated.spring(volumeOverlayOpacity, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
        
        // Clear existing timeout
        if (volumeOverlayTimeout.current) {
          clearTimeout(volumeOverlayTimeout.current);
        }
        
        // Hide overlay after 1.5 seconds (reduced from 2 seconds)
        volumeOverlayTimeout.current = setTimeout(() => {
          Animated.timing(volumeOverlayOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            setShowVolumeOverlay(false);
          });
        }, 1500);
      }
    }
  };

  // Brightness gesture handler (left side of screen)
  const onBrightnessGestureEvent = async (event: PanGestureHandlerGestureEvent) => {
    const { translationY, state } = event.nativeEvent;
    const screenHeight = screenDimensions.height;
    const sensitivity = 0.002; // Reduced for finer control
    
    if (state === State.ACTIVE) {
      const deltaY = -translationY; // Invert for natural feel (up = increase)
      const brightnessChange = deltaY * sensitivity;
      const newBrightness = Math.max(0, Math.min(1, brightness + brightnessChange));
      
      if (Math.abs(newBrightness - brightness) > 0.005) { // Reduced threshold for smoother updates
        setBrightness(newBrightness);
        lastBrightnessChange.current = Date.now();
        
        // Set device brightness using Expo Brightness
        try {
          await Brightness.setBrightnessAsync(newBrightness);
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Device brightness set to: ${newBrightness}`);
          }
        } catch (error) {
          logger.warn('[AndroidVideoPlayer] Error setting device brightness:', error);
        }
        
        // Show overlay with smoother animation
        if (!showBrightnessOverlay) {
          setShowBrightnessOverlay(true);
          Animated.spring(brightnessOverlayOpacity, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
        
        // Clear existing timeout
        if (brightnessOverlayTimeout.current) {
          clearTimeout(brightnessOverlayTimeout.current);
        }
        
        // Hide overlay after 1.5 seconds (reduced from 2 seconds)
        brightnessOverlayTimeout.current = setTimeout(() => {
          Animated.timing(brightnessOverlayOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => {
            setShowBrightnessOverlay(false);
          });
        }, 1500);
      }
    }
  };

  const resetZoom = () => {
    const targetZoom = is16by9Content ? 1.1 : 1;
    setZoomScale(targetZoom);
    setLastZoomScale(targetZoom);
    if (DEBUG_MODE) {
      if (__DEV__) logger.log(`[AndroidVideoPlayer] Zoom reset to ${targetZoom}x (16:9: ${is16by9Content})`);
    }
  };

  useEffect(() => {
    if (videoAspectRatio && screenDimensions.width > 0 && screenDimensions.height > 0) {
      const styles = calculateVideoStyles(
        videoAspectRatio * 1000,
        1000,
        screenDimensions.width,
        screenDimensions.height
      );
      setCustomVideoStyles(styles);
      if (DEBUG_MODE) {
        if (__DEV__) logger.log(`[AndroidVideoPlayer] Screen dimensions changed, recalculated styles:`, styles);
      }
    }
  }, [screenDimensions, videoAspectRatio]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenDimensions(screen);
    });
    const initializePlayer = async () => {
      StatusBar.setHidden(true, 'none');
      enableImmersiveMode();
      startOpeningAnimation();
      
      // Initialize current volume and brightness levels
      // Volume starts at 1.0 (full volume) - React Native Video handles this natively
      setVolume(1.0);
      if (DEBUG_MODE) {
        logger.log(`[AndroidVideoPlayer] Initial volume: 1.0 (native)`);
      }
      
      try {
        const currentBrightness = await Brightness.getBrightnessAsync();
        setBrightness(currentBrightness);
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Initial brightness: ${currentBrightness}`);
        }
      } catch (error) {
        logger.warn('[AndroidVideoPlayer] Error getting initial brightness:', error);
        // Fallback to 1.0 if brightness API fails
        setBrightness(1.0);
      }
    };
    initializePlayer();
    return () => {
      subscription?.remove();
      disableImmersiveMode();
    };
  }, []);

  const startOpeningAnimation = () => {
    // Logo entrance animation - optimized for faster appearance
    Animated.parallel([
      Animated.timing(logoOpacityAnim, {
        toValue: 1,
        duration: 300, // Reduced from 600ms to 300ms
        useNativeDriver: true,
      }),
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        tension: 80, // Increased tension for faster spring
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Continuous pulse animation for the logo
    const createPulseAnimation = () => {
      return Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 800, // Reduced from 1000ms to 800ms
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800, // Reduced from 1000ms to 800ms
          useNativeDriver: true,
        }),
      ]);
    };
    
    const loopPulse = () => {
      createPulseAnimation().start(() => {
        if (!isOpeningAnimationComplete) {
          loopPulse();
        }
      });
    };
    
    // Start pulsing immediately without delay
    // Removed the 800ms delay
    loopPulse();
  };

  const completeOpeningAnimation = () => {
    Animated.parallel([
      Animated.timing(openingFadeAnim, {
        toValue: 1,
        duration: 300, // Reduced from 600ms to 300ms
        useNativeDriver: true,
      }),
      Animated.timing(openingScaleAnim, {
        toValue: 1,
        duration: 350, // Reduced from 700ms to 350ms
        useNativeDriver: true,
      }),
      Animated.timing(backgroundFadeAnim, {
        toValue: 0,
        duration: 400, // Reduced from 800ms to 400ms
        useNativeDriver: true,
      }),
    ]).start(() => {
      openingScaleAnim.setValue(1);
      openingFadeAnim.setValue(1);
      setIsOpeningAnimationComplete(true);
      // Removed the 100ms delay
      backgroundFadeAnim.setValue(0);
    });
    
    // Fallback: ensure animation completes even if something goes wrong
    setTimeout(() => {
      if (!isOpeningAnimationComplete) {
        if (__DEV__) logger.warn('[AndroidVideoPlayer] Opening animation fallback triggered');
        setIsOpeningAnimationComplete(true);
        openingScaleAnim.setValue(1);
        openingFadeAnim.setValue(1);
        backgroundFadeAnim.setValue(0);
      }
    }, 1000); // 1 second fallback
  };

  useEffect(() => {
    const loadWatchProgress = async () => {
      if (id && type) {
        try {
          if (__DEV__) logger.log(`[AndroidVideoPlayer] Loading watch progress for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
          const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
          if (__DEV__) logger.log(`[AndroidVideoPlayer] Saved progress:`, savedProgress);
          
          if (savedProgress) {
            const progressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
            if (__DEV__) logger.log(`[AndroidVideoPlayer] Progress: ${progressPercent.toFixed(1)}% (${savedProgress.currentTime}/${savedProgress.duration})`);
            
            if (progressPercent < 85) {
              setResumePosition(savedProgress.currentTime);
              setSavedDuration(savedProgress.duration);
              if (__DEV__) logger.log(`[AndroidVideoPlayer] Set resume position to: ${savedProgress.currentTime} of ${savedProgress.duration}`);
              if (appSettings.alwaysResume) {
                // Only prepare auto-resume state and seek when AlwaysResume is enabled
                setInitialPosition(savedProgress.currentTime);
                initialSeekTargetRef.current = savedProgress.currentTime;
                if (__DEV__) logger.log(`[AndroidVideoPlayer] AlwaysResume enabled. Auto-seeking to ${savedProgress.currentTime}`);
                seekToTime(savedProgress.currentTime);
              } else {
                // Do not set initialPosition; start from beginning with no auto-seek
                setShowResumeOverlay(true);
                if (__DEV__) logger.log(`[AndroidVideoPlayer] AlwaysResume disabled. Not auto-seeking; overlay shown (if enabled)`);
              }
            } else {
              if (__DEV__) logger.log(`[AndroidVideoPlayer] Progress too high (${progressPercent.toFixed(1)}%), not showing resume overlay`);
            }
          } else {
            if (__DEV__) logger.log(`[AndroidVideoPlayer] No saved progress found`);
          }
        } catch (error) {
          logger.error('[AndroidVideoPlayer] Error loading watch progress:', error);
        }
      } else {
        if (__DEV__) logger.log(`[AndroidVideoPlayer] Missing id or type: id=${id}, type=${type}`);
      }
    };
    loadWatchProgress();
  }, [id, type, episodeId, appSettings.alwaysResume]);

  const saveWatchProgress = async () => {
    if (id && type && currentTime > 0 && duration > 0) {
      const progress = {
        currentTime,
        duration,
        lastUpdated: Date.now()
      };
      try {
        await storageService.setWatchProgress(id, type, progress, episodeId);
        
        // Sync to Trakt if authenticated
        await traktAutosync.handleProgressUpdate(currentTime, duration);
      } catch (error) {
        logger.error('[AndroidVideoPlayer] Error saving watch progress:', error);
      }
    }
  };
    
  useEffect(() => {
    if (id && type && !paused && duration > 0) {
      if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
      }
      
      // HEATING FIX: Increase sync interval to 15 seconds to reduce CPU load
      const syncInterval = 15000; // 15 seconds to prevent heating
      
      const interval = setInterval(() => {
        saveWatchProgress();
      }, syncInterval);
      
      setProgressSaveInterval(interval);
      return () => {
        clearInterval(interval);
        setProgressSaveInterval(null);
      };
    }
  }, [id, type, paused, currentTime, duration]);

  useEffect(() => {
    return () => {
      if (id && type && duration > 0) {
        saveWatchProgress();
        // Final Trakt sync on component unmount
        traktAutosync.handlePlaybackEnd(currentTime, duration, 'unmount');
      }
    };
  }, [id, type, currentTime, duration]);

  const seekToTime = (rawSeconds: number) => {
    // Clamp to just before the end of the media.
    const timeInSeconds = Math.max(0, Math.min(rawSeconds, duration > 0 ? duration - END_EPSILON : rawSeconds));
    if (videoRef.current && duration > 0 && !isSeeking.current) {
      if (DEBUG_MODE) {
        if (__DEV__) logger.log(`[AndroidVideoPlayer] Seeking to ${timeInSeconds.toFixed(2)}s out of ${duration.toFixed(2)}s`);
      }
      
      isSeeking.current = true;
      setSeekTime(timeInSeconds);
      if (Platform.OS === 'ios') {
        iosWasPausedDuringSeekRef.current = paused;
        if (!paused) setPaused(true);
      }
      
      // Clear seek state handled in onSeek; keep a fallback timeout
      setTimeout(() => {
        if (isMounted.current && isSeeking.current) {
          setSeekTime(null);
          isSeeking.current = false;
          if (DEBUG_MODE) logger.log('[AndroidVideoPlayer] Seek fallback timeout cleared seeking state');
          if (Platform.OS === 'ios' && iosWasPausedDuringSeekRef.current === false) {
            setPaused(false);
            iosWasPausedDuringSeekRef.current = null;
          }
        }
      }, 1200);
    } else {
      if (DEBUG_MODE) {
        logger.error(`[AndroidVideoPlayer] Seek failed: videoRef=${!!videoRef.current}, duration=${duration}, seeking=${isSeeking.current}`);
      }
    }
  };

  // Handle seeking when seekTime changes
  useEffect(() => {
    if (seekTime !== null && videoRef.current && duration > 0) {
      // Use tolerance on iOS for more reliable seeks
      if (Platform.OS === 'ios') {
        try {
          (videoRef.current as any).seek(seekTime, 1);
        } catch {
          videoRef.current.seek(seekTime);
        }
      } else {
        videoRef.current.seek(seekTime);
      }
    }
  }, [seekTime, duration]);

  const onSeek = (data: any) => {
    if (DEBUG_MODE) logger.log('[AndroidVideoPlayer] onSeek', data);
    if (isMounted.current) {
      setSeekTime(null);
      isSeeking.current = false;
      // Resume playback on iOS if we paused for seeking
      if (Platform.OS === 'ios') {
        const shouldResume = wasPlayingBeforeDragRef.current || iosWasPausedDuringSeekRef.current === false || isDragging;
        // Aggressively resume on iOS after seek if user was playing or this was a drag
        if (shouldResume) {
          logger.log('[AndroidVideoPlayer] onSeek: resuming after seek (iOS)');
          setPaused(false);
        } else {
          logger.log('[AndroidVideoPlayer] onSeek: staying paused (iOS)');
        }
        // Reset flags
        wasPlayingBeforeDragRef.current = false;
        iosWasPausedDuringSeekRef.current = null;
      }
    }
  };
  
  // Slider callback functions for React Native Community Slider
  const handleSliderValueChange = (value: number) => {
    if (isDragging && duration > 0) {
      const seekTime = Math.min(value, duration - END_EPSILON);
      
      pendingSeekValue.current = seekTime;
    }
  };

  const handleSlidingStart = () => {
    setIsDragging(true);
    // Keep controls visible while dragging and cancel any hide timeout
    if (!showControls) setShowControls(true);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
      controlsTimeout.current = null;
    }
    // On iOS, pause during drag for more reliable seeks
    if (Platform.OS === 'ios') {
      wasPlayingBeforeDragRef.current = !paused;
      if (!paused) setPaused(true);
      logger.log('[AndroidVideoPlayer] handleSlidingStart: pausing for iOS drag');
    }
  };

  const handleSlidingComplete = (value: number) => {
    setIsDragging(false);
    if (duration > 0) {
      const seekTime = Math.min(value, duration - END_EPSILON);
      seekToTime(seekTime);
      pendingSeekValue.current = null;
      // iOS safety: if the user was playing before drag, ensure resume shortly after seek
      if (Platform.OS === 'ios' && wasPlayingBeforeDragRef.current) {
        setTimeout(() => {
          logger.log('[AndroidVideoPlayer] handleSlidingComplete: forcing resume after seek (iOS)');
          setPaused(false);
        }, 60);
      }
    }
    // Restart auto-hide timer after interaction finishes
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    // Ensure controls are visible, then schedule auto-hide
    if (!showControls) setShowControls(true);
    controlsTimeout.current = setTimeout(hideControls, 5000);
  };

  // Ensure auto-hide resumes after drag ends
  useEffect(() => {
    if (!isDragging && showControls) {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
      controlsTimeout.current = setTimeout(hideControls, 5000);
    }
  }, [isDragging, showControls]);
  
  // Removed processProgressTouch - no longer needed with React Native Community Slider

  const handleProgress = (data: any) => {
    if (isDragging || isSeeking.current) return;
    
    const currentTimeInSeconds = data.currentTime;
    
    // Update time more frequently for subtitle synchronization (0.1s threshold)
    if (Math.abs(currentTimeInSeconds - currentTime) > 0.1) {
      safeSetState(() => setCurrentTime(currentTimeInSeconds));
      // Removed progressAnim animation - no longer needed with React Native Community Slider
      const bufferedTime = data.playableDuration || currentTimeInSeconds;
      safeSetState(() => setBuffered(bufferedTime));
    }
  };

  const onLoad = (data: any) => {
    try {
      if (DEBUG_MODE) {
        logger.log('[AndroidVideoPlayer] Video loaded:', data);
      }
      if (!isMounted.current) {
        logger.warn('[AndroidVideoPlayer] Component unmounted, skipping onLoad');
        return;
      }
      if (!data) {
        logger.error('[AndroidVideoPlayer] onLoad called with null/undefined data');
        return;
      }
      const videoDuration = data.duration;
      if (data.duration > 0) {
        setDuration(videoDuration);
        
        // Store the actual duration for future reference and update existing progress
        if (id && type) {
          storageService.setContentDuration(id, type, videoDuration, episodeId);
          storageService.updateProgressDuration(id, type, videoDuration, episodeId);
          
          // Update the saved duration for resume overlay if it was using an estimate
          if (savedDuration && Math.abs(savedDuration - videoDuration) > 60) {
            setSavedDuration(videoDuration);
          }
        }
      }
      
      // Set aspect ratio from video dimensions
      if (data.naturalSize && data.naturalSize.width && data.naturalSize.height) {
        setVideoAspectRatio(data.naturalSize.width / data.naturalSize.height);
      } else {
        // Fallback to 16:9 aspect ratio if naturalSize is not available
        setVideoAspectRatio(16 / 9);
        logger.warn('[AndroidVideoPlayer] naturalSize not available, using default 16:9 aspect ratio');
      }

      // Handle audio tracks
      if (data.audioTracks && data.audioTracks.length > 0) {
        const formattedAudioTracks = data.audioTracks.map((track: any, index: number) => {
          const trackIndex = track.index !== undefined ? track.index : index;
          const trackName = track.title || track.language || `Audio ${index + 1}`;
          const trackLanguage = track.language || 'Unknown';
          
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Audio track ${index}: index=${trackIndex}, name="${trackName}", language="${trackLanguage}"`);
          }
          
          return {
            id: trackIndex, // Use the actual track index from react-native-video
            name: trackName,
            language: trackLanguage,
          };
        });
        setRnVideoAudioTracks(formattedAudioTracks);
        
        // Auto-select the first audio track if none is selected
        if (selectedAudioTrack === null && formattedAudioTracks.length > 0) {
          const firstTrack = formattedAudioTracks[0];
          setSelectedAudioTrack(firstTrack.id);
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Auto-selected first audio track: ${firstTrack.name} (ID: ${firstTrack.id})`);
          }
        }
        
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Formatted audio tracks:`, formattedAudioTracks);
        }
      }

      // Handle text tracks
      if (data.textTracks && data.textTracks.length > 0) {
        const formattedTextTracks = data.textTracks.map((track: any, index: number) => ({
          id: track.index || index,
          name: track.title || track.language || `Subtitle ${index + 1}`,
          language: track.language,
        }));
        setRnVideoTextTracks(formattedTextTracks);
      }

      setIsVideoLoaded(true);
      setIsPlayerReady(true);
      
      // Start Trakt watching session when video loads with proper duration
      if (videoDuration > 0) {
        traktAutosync.handlePlaybackStart(currentTime, videoDuration);
      }
      
      // Complete opening animation immediately before seeking
      completeOpeningAnimation();
      
      if (initialPosition && !isInitialSeekComplete) {
        logger.log(`[AndroidVideoPlayer] Seeking to initial position: ${initialPosition}s (duration: ${videoDuration}s)`);
        // Reduced timeout from 1000ms to 500ms
        setTimeout(() => {
          if (videoRef.current && videoDuration > 0 && isMounted.current) {
            seekToTime(initialPosition);
            setIsInitialSeekComplete(true);
            logger.log(`[AndroidVideoPlayer] Initial seek completed to: ${initialPosition}s`);
          } else {
            logger.error(`[AndroidVideoPlayer] Initial seek failed: videoRef=${!!videoRef.current}, duration=${videoDuration}, mounted=${isMounted.current}`);
          }
        }, 500);
      }
      
      controlsTimeout.current = setTimeout(hideControls, 5000);
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error in onLoad:', error);
      // Set fallback values to prevent crashes
      if (isMounted.current) {
        setVideoAspectRatio(16 / 9);
        setIsVideoLoaded(true);
        setIsPlayerReady(true);
        completeOpeningAnimation();
      }
    }
  };

  const skip = (seconds: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(currentTime + seconds, duration - END_EPSILON));
      seekToTime(newTime);
    }
  };

  const cycleAspectRatio = () => {
    // Android: cycle through native resize modes
    const resizeModes: ResizeModeType[] = ['contain', 'cover', 'fill', 'none'];
    const currentIndex = resizeModes.indexOf(resizeMode);
    const nextIndex = (currentIndex + 1) % resizeModes.length;
    setResizeMode(resizeModes[nextIndex]);
    if (DEBUG_MODE) {
      logger.log(`[AndroidVideoPlayer] Resize mode changed to: ${resizeModes[nextIndex]}`);
    }
  };

  const enableImmersiveMode = () => {
    StatusBar.setHidden(true, 'none');
    if (Platform.OS === 'android') {
      try {
        RNImmersiveMode.setBarMode('FullSticky');
        RNImmersiveMode.fullLayout(true);
        if (NativeModules.StatusBarManager) {
          NativeModules.StatusBarManager.setHidden(true);
        }
      } catch (error) {
        if (__DEV__) console.log('Immersive mode error:', error);
      }
    }
  };

  const disableImmersiveMode = () => {
    StatusBar.setHidden(false);
    if (Platform.OS === 'android') {
      RNImmersiveMode.setBarMode('Normal');
      RNImmersiveMode.fullLayout(false);
    }
  };

  const handleClose = async () => {
    // Prevent multiple close attempts
    if (isSyncingBeforeClose) {
      logger.log('[AndroidVideoPlayer] Close already in progress, ignoring duplicate call');
      return;
    }

    logger.log('[AndroidVideoPlayer] Close button pressed - closing immediately and syncing to Trakt in background');
    setIsSyncingBeforeClose(true);
    
    // Make sure we have the most accurate current time
    const actualCurrentTime = currentTime;
    const progressPercent = duration > 0 ? (actualCurrentTime / duration) * 100 : 0;
    
    logger.log(`[AndroidVideoPlayer] Current progress: ${actualCurrentTime}/${duration} (${progressPercent.toFixed(1)}%)`);
    
    // Navigate immediately without delay
    ScreenOrientation.unlockAsync().then(() => {
      // On tablets keep rotation unlocked; on phones, return to portrait
      const { width: dw, height: dh } = Dimensions.get('window');
      const isTablet = Math.min(dw, dh) >= 768 || ((Platform as any).isPad === true);
      if (!isTablet) {
        setTimeout(() => {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        }, 50);
      } else {
        ScreenOrientation.unlockAsync().catch(() => {});
      }
      disableImmersiveMode();
      
      // Simple back navigation (StreamsScreen should be below Player)
      if ((navigation as any).canGoBack && (navigation as any).canGoBack()) {
        (navigation as any).goBack();
      } else {
        // Fallback to Streams if stack isn't present
        (navigation as any).navigate('Streams', { id, type, episodeId, fromPlayer: true });
      }
    }).catch(() => {
      // Fallback: still try to restore portrait on phones then navigate
      const { width: dw, height: dh } = Dimensions.get('window');
      const isTablet = Math.min(dw, dh) >= 768 || ((Platform as any).isPad === true);
      if (!isTablet) {
        setTimeout(() => {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        }, 50);
      } else {
        ScreenOrientation.unlockAsync().catch(() => {});
      }
      disableImmersiveMode();
      
      // Simple back navigation fallback path
      if ((navigation as any).canGoBack && (navigation as any).canGoBack()) {
        (navigation as any).goBack();
      } else {
        (navigation as any).navigate('Streams', { id, type, episodeId, fromPlayer: true });
      }
    });

    // Send Trakt sync in background (don't await)
    const backgroundSync = async () => {
      try {
        logger.log('[AndroidVideoPlayer] Starting background Trakt sync');
        // Force one last progress update (scrobble/pause) with the exact time
        await traktAutosync.handleProgressUpdate(actualCurrentTime, duration, true);
        
        // Sync progress to Trakt
        await traktAutosync.handlePlaybackEnd(actualCurrentTime, duration, 'unmount');
        
        logger.log('[AndroidVideoPlayer] Background Trakt sync completed successfully');
      } catch (error) {
        logger.error('[AndroidVideoPlayer] Error in background Trakt sync:', error);
      }
    };

    // Start background sync without blocking UI
    backgroundSync();
  };

  const handleResume = async () => {
    if (resumePosition) {
      seekToTime(resumePosition);
    }
    setShowResumeOverlay(false);
  };

  const handleStartFromBeginning = async () => {
    seekToTime(0);
    setShowResumeOverlay(false);
  };

  const toggleControls = () => {
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
      controlsTimeout.current = null;
    }
    
    setShowControls(prevShowControls => {
      const newShowControls = !prevShowControls;
      Animated.timing(fadeAnim, {
        toValue: newShowControls ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
      if (newShowControls) {
        controlsTimeout.current = setTimeout(hideControls, 5000);
      }
      return newShowControls;
    });
  };

  const handleError = (error: any) => {
    try {
      logger.error('AndroidVideoPlayer error: ', error);
      
      // Early return if component is unmounted to prevent iOS crashes
      if (!isMounted.current) {
        logger.warn('[AndroidVideoPlayer] Component unmounted, skipping error handling');
        return;
      }
      
      // Check for Dolby Digital Plus audio codec errors (ExoPlayer)
      const isDolbyCodecError = error?.error?.errorCode === '24001' ||
                               error?.errorCode === '24001' ||
                               (error?.error?.errorString && 
                                error.error.errorString.includes('ERROR_CODE_DECODER_INIT_FAILED')) ||
                               (error?.error?.errorException && 
                                error.error.errorException.includes('audio/eac3')) ||
                               (error?.error?.errorException && 
                                error.error.errorException.includes('Dolby Digital Plus'));
      
      // Handle Dolby Digital Plus codec errors with audio track fallback
      if (isDolbyCodecError && rnVideoAudioTracks.length > 1) {
        logger.warn('[AndroidVideoPlayer] Dolby Digital Plus codec error detected, attempting audio track fallback');
        
        // Find a non-Dolby audio track (usually index 0 is stereo/standard)
        const fallbackTrack = rnVideoAudioTracks.find((track, index) => {
          const trackName = (track.name || '').toLowerCase();
          const trackLang = (track.language || '').toLowerCase();
          // Prefer stereo, AAC, or standard audio formats
          return !trackName.includes('dolby') && 
                 !trackName.includes('dts') && 
                 !trackName.includes('7.1') &&
                 !trackName.includes('5.1') &&
                 index !== selectedAudioTrack; // Don't select the same track
        });
        
        if (fallbackTrack) {
          const fallbackIndex = rnVideoAudioTracks.indexOf(fallbackTrack);
          logger.warn(`[AndroidVideoPlayer] Switching to fallback audio track: ${fallbackTrack.name || 'Unknown'} (index: ${fallbackIndex})`);
          
          // Clear any existing error state
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = null;
          }
          safeSetState(() => setShowErrorModal(false));
          
          // Switch to fallback audio track
          setSelectedAudioTrack(fallbackIndex);
          
          // Brief pause to allow track switching
          setPaused(true);
          setTimeout(() => {
            if (!isMounted.current) return;
            setPaused(false);
          }, 500);
          
          return; // Don't show error UI, attempt recovery
        }
      }
      
      // Detect Xprime provider to enable a one-shot silent retry (warms upstream/cache)
      const providerName = ((currentStreamProvider || streamProvider || '') as string).toLowerCase();
      const isXprimeProvider = providerName.includes('xprime');

      // One-shot, silent retry without showing error UI
      if (isXprimeProvider && retryAttemptRef.current < 1) {
        retryAttemptRef.current = 1;
        // Cache-bust to force a fresh fetch and warm upstream
        const addRetryParam = (url: string) => {
          const sep = url.includes('?') ? '&' : '?';
          return `${url}${sep}rn_retry_ts=${Date.now()}`;
        };
        const bustedUrl = addRetryParam(currentStreamUrl);
        logger.warn('[AndroidVideoPlayer] Silent retry for Xprime with cache-busted URL');
        // Ensure no modal is visible
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        safeSetState(() => setShowErrorModal(false));
        // Brief pause to let the player reset
        setPaused(true);
        setTimeout(() => {
          if (!isMounted.current) return;
          setCurrentStreamUrl(bustedUrl);
          setPaused(false);
        }, 120);
        return; // Do not proceed to show error UI
      }

      // If format unrecognized, try flipping between HLS and MP4 once
      const isUnrecognized = !!(error?.error?.errorString && String(error.error.errorString).includes('UnrecognizedInputFormatException'));
      if (isUnrecognized && retryAttemptRef.current < 1) {
        retryAttemptRef.current = 1;
        const nextType = currentVideoType === 'm3u8' ? 'mp4' : 'm3u8';
        logger.warn(`[AndroidVideoPlayer] Format not recognized. Retrying with type='${nextType}'`);
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        safeSetState(() => setShowErrorModal(false));
        setPaused(true);
        setTimeout(() => {
          if (!isMounted.current) return;
          setCurrentVideoType(nextType);
          // Force re-mount of source by tweaking URL param
          const sep = currentStreamUrl.includes('?') ? '&' : '?';
          setCurrentStreamUrl(`${currentStreamUrl}${sep}rn_type_retry=${Date.now()}`);
          setPaused(false);
        }, 120);
        return;
      }

      // Check for specific AVFoundation server configuration errors (iOS)
      const isServerConfigError = error?.error?.code === -11850 ||
                                  error?.code === -11850 ||
                                  (error?.error?.localizedDescription &&
                                   error.error.localizedDescription.includes('server is not correctly configured'));
      
      // Format error details for user display
      let errorMessage = 'An unknown error occurred';
      if (error) {
        if (isDolbyCodecError) {
          errorMessage = 'Audio codec compatibility issue detected. The video contains Dolby Digital Plus audio which is not supported on this device. Please try selecting a different audio track or use an alternative video source.';
        } else if (isServerConfigError) {
          errorMessage = 'Stream server configuration issue. This may be a temporary problem with the video source.';
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (error.error && error.error.message) {
          errorMessage = error.error.message;
        } else if (error.error && error.error.localizedDescription) {
          errorMessage = error.error.localizedDescription;
        } else if (error.code) {
          errorMessage = `Error Code: ${error.code}`;
        } else {
          try {
            errorMessage = JSON.stringify(error, null, 2);
          } catch (jsonError) {
            errorMessage = 'Error occurred but details could not be serialized';
          }
        }
      }
      
      // Use safeSetState to prevent crashes on iOS when component is unmounted
      safeSetState(() => {
        setErrorDetails(errorMessage);
        setShowErrorModal(true);
      });
      
      // Clear any existing timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      
      // Auto-exit after 5 seconds if user doesn't dismiss
      errorTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          handleErrorExit();
        }
      }, 5000);
    } catch (handlerError) {
      // Fallback error handling to prevent crashes during error processing
      logger.error('[AndroidVideoPlayer] Error in error handler:', handlerError);
      if (isMounted.current) {
        // Minimal safe error handling
        safeSetState(() => {
          setErrorDetails('A critical error occurred');
          setShowErrorModal(true);
        });
        // Force exit after 3 seconds if error handler itself fails
        setTimeout(() => {
          if (isMounted.current) {
            handleClose();
          }
        }, 3000);
      }
    }
  };
  
  const handleErrorExit = () => {
    try {
      // Early return if component is unmounted
      if (!isMounted.current) {
        logger.warn('[AndroidVideoPlayer] Component unmounted, skipping error exit');
        return;
      }
      
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
      
      // Use safeSetState to prevent crashes on iOS when component is unmounted
      safeSetState(() => {
        setShowErrorModal(false);
      });
      
      // Add small delay before closing to ensure modal state is updated
      setTimeout(() => {
        if (isMounted.current) {
          handleClose();
        }
      }, 100);
    } catch (exitError) {
      logger.error('[AndroidVideoPlayer] Error in handleErrorExit:', exitError);
      // Force close as last resort
      if (isMounted.current) {
        handleClose();
      }
    }
  };

  const onBuffer = (data: any) => {
    setIsBuffering(data.isBuffering);
  };

  const onEnd = async () => {
    // Make sure we report 100% progress to Trakt
    const finalTime = duration;
    setCurrentTime(finalTime);

    try {
      // Force one last progress update (scrobble/pause) with the exact final time
      logger.log('[AndroidVideoPlayer] Video ended naturally, sending final progress update with 100%');
      await traktAutosync.handleProgressUpdate(finalTime, duration, true);
      
      // IMMEDIATE SYNC: Remove delay for instant sync
      // Now send the stop call immediately
      logger.log('[AndroidVideoPlayer] Sending final stop call after natural end');
      await traktAutosync.handlePlaybackEnd(finalTime, duration, 'ended');
      
      logger.log('[AndroidVideoPlayer] Completed video end sync to Trakt');
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error syncing to Trakt on video end:', error);
    }
  };

  const selectAudioTrack = (trackId: number) => {
    if (DEBUG_MODE) {
      logger.log(`[AndroidVideoPlayer] Selecting audio track: ${trackId}`);
      logger.log(`[AndroidVideoPlayer] Available tracks:`, rnVideoAudioTracks);
    }
    
    // Validate that the track exists
    const trackExists = rnVideoAudioTracks.some(track => track.id === trackId);
    if (!trackExists) {
      logger.error(`[AndroidVideoPlayer] Audio track ${trackId} not found in available tracks`);
      return;
    }
    
    // If changing tracks, briefly pause to allow smooth transition
    const wasPlaying = !paused;
    if (wasPlaying) {
      setPaused(true);
    }
    
    // Set the new audio track
    setSelectedAudioTrack(trackId);
    
    if (DEBUG_MODE) {
      logger.log(`[AndroidVideoPlayer] Audio track changed to: ${trackId}`);
    }
    
    // Resume playback after a brief delay if it was playing
    if (wasPlaying) {
      setTimeout(() => {
        if (isMounted.current) {
          setPaused(false);
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Resumed playback after audio track change`);
          }
        }
      }, 300);
    }
  };

  const selectTextTrack = (trackId: number) => {
    if (trackId === -999) {
      setUseCustomSubtitles(true);
      setSelectedTextTrack(-1);
    } else {
      setUseCustomSubtitles(false);
      setSelectedTextTrack(trackId);
    }
  };
  
  const loadSubtitleSize = async () => {
    try {
      const savedSize = await AsyncStorage.getItem(SUBTITLE_SIZE_KEY);
      if (savedSize) {
        setSubtitleSize(parseInt(savedSize, 10));
      }
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error loading subtitle size:', error);
    }
  };

  const saveSubtitleSize = async (size: number) => {
    try {
      await AsyncStorage.setItem(SUBTITLE_SIZE_KEY, size.toString());
      setSubtitleSize(size);
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error saving subtitle size:', error);
    }
  };

  const fetchAvailableSubtitles = async (imdbIdParam?: string, autoSelectEnglish = true) => {
    const targetImdbId = imdbIdParam || imdbId;
    if (!targetImdbId) {
      logger.error('[AndroidVideoPlayer] No IMDb ID available for subtitle search');
      return;
    }
    setIsLoadingSubtitleList(true);
    try {
      // Fetch from all installed subtitle-capable addons via Stremio
      const stremioType = type === 'series' ? 'series' : 'movie';
      const stremioVideoId = stremioType === 'series' && season && episode
        ? `series:${targetImdbId}:${season}:${episode}`
        : undefined;
      const stremioResults = await stremioService.getSubtitles(stremioType, targetImdbId, stremioVideoId);
      const stremioSubs: WyzieSubtitle[] = (stremioResults || []).map(sub => ({
        id: sub.id || `${sub.lang}-${sub.url}`,
        url: sub.url,
        flagUrl: '',
        format: 'srt',
        encoding: 'utf-8',
        media: sub.addonName || sub.addon || '',
        display: sub.lang || 'Unknown',
        language: (sub.lang || '').toLowerCase(),
        isHearingImpaired: false,
        source: sub.addonName || sub.addon || 'Addon',
      }));
      // Sort with English languages first, then alphabetical over full list
      const isEnglish = (s: WyzieSubtitle) => {
        const lang = (s.language || '').toLowerCase();
        const disp = (s.display || '').toLowerCase();
        return lang === 'en' || lang === 'eng' || /^en([-_]|$)/.test(lang) || disp.includes('english');
      };
      stremioSubs.sort((a, b) => {
        const aIsEn = isEnglish(a);
        const bIsEn = isEnglish(b);
        if (aIsEn && !bIsEn) return -1;
        if (!aIsEn && bIsEn) return 1;
        return (a.display || '').localeCompare(b.display || '');
      });
      setAvailableSubtitles(stremioSubs);
      if (autoSelectEnglish) {
        const englishSubtitle = stremioSubs.find(sub => 
          sub.language.toLowerCase() === 'eng' || 
          sub.language.toLowerCase() === 'en' ||
          sub.display.toLowerCase().includes('english')
        );
        if (englishSubtitle) {
          loadWyzieSubtitle(englishSubtitle);
          return;
        }
      }
      if (!autoSelectEnglish) {
        // If no English found and not auto-selecting, still open the modal
        setShowSubtitleLanguageModal(true);
      }
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error fetching subtitles from OpenSubtitles addon:', error);
    } finally {
      setIsLoadingSubtitleList(false);
    }
  };

  const loadWyzieSubtitle = async (subtitle: WyzieSubtitle) => {
    logger.log(`[AndroidVideoPlayer] Subtitle click received: id=${subtitle.id}, lang=${subtitle.language}, url=${subtitle.url}`);
    setShowSubtitleLanguageModal(false);
    logger.log('[AndroidVideoPlayer] setShowSubtitleLanguageModal(false)');
    setIsLoadingSubtitles(true);
    logger.log('[AndroidVideoPlayer] isLoadingSubtitles -> true');
    try {
      logger.log('[AndroidVideoPlayer] Fetching subtitle SRT start');
      let srtContent = '';
      try {
        const axiosResp = await axios.get(subtitle.url, {
          timeout: 10000,
          headers: {
            'Accept': 'text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Nuvio/1.0'
          },
          responseType: 'text',
          transitional: {
            clarifyTimeoutError: true
          }
        });
        srtContent = typeof axiosResp.data === 'string' ? axiosResp.data : String(axiosResp.data || '');
      } catch (axiosErr: any) {
        logger.warn('[AndroidVideoPlayer] Axios subtitle fetch failed, falling back to fetch()', {
          message: axiosErr?.message,
          code: axiosErr?.code
        });
        // Fallback with explicit timeout using AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const resp = await fetch(subtitle.url, { signal: controller.signal });
          srtContent = await resp.text();
        } finally {
          clearTimeout(timeoutId);
        }
      }
      logger.log(`[AndroidVideoPlayer] Fetching subtitle SRT done, size=${srtContent.length}`);
      const parsedCues = parseSRT(srtContent);
      logger.log(`[AndroidVideoPlayer] Parsed cues count=${parsedCues.length}`);
      
      // iOS AVPlayer workaround: clear subtitle state first, then apply
      if (Platform.OS === 'ios') {
        logger.log('[AndroidVideoPlayer] iOS detected; clearing subtitle state before apply');
        // Immediately stop spinner so UI doesn't get stuck
        setIsLoadingSubtitles(false);
        logger.log('[AndroidVideoPlayer] isLoadingSubtitles -> false (early stop for iOS)');
        // Step 1: Clear any existing subtitle state
        setUseCustomSubtitles(false);
        logger.log('[AndroidVideoPlayer] useCustomSubtitles -> false');
        setCustomSubtitles([]);
        logger.log('[AndroidVideoPlayer] customSubtitles -> []');
        setSelectedTextTrack(-1);
        logger.log('[AndroidVideoPlayer] selectedTextTrack -> -1');
        
        // Step 2: Apply immediately (no scheduling), then do a small micro-nudge
        logger.log('[AndroidVideoPlayer] Applying parsed cues immediately (iOS)');
        setCustomSubtitles(parsedCues);
        logger.log('[AndroidVideoPlayer] customSubtitles <- parsedCues');
        setUseCustomSubtitles(true);
        logger.log('[AndroidVideoPlayer] useCustomSubtitles -> true');
        setSelectedTextTrack(-1);
        logger.log('[AndroidVideoPlayer] selectedTextTrack -> -1 (disable native while using custom)');
        setCustomSubtitleVersion(v => v + 1);
        logger.log('[AndroidVideoPlayer] customSubtitleVersion incremented');

        // Immediately set current subtitle based on currentTime to avoid waiting for next onProgress
        try {
          const adjustedTime = currentTime + (subtitleOffsetSec || 0);
          const cueNow = parsedCues.find(cue => adjustedTime >= cue.start && adjustedTime <= cue.end);
          const textNow = cueNow ? cueNow.text : '';
          setCurrentSubtitle(textNow);
          logger.log('[AndroidVideoPlayer] currentSubtitle set immediately after apply (iOS)');
        } catch (e) {
          logger.error('[AndroidVideoPlayer] Error setting immediate subtitle', e);
        }

        // Removed micro-seek nudge on iOS
      } else {
        // Android works immediately
        setCustomSubtitles(parsedCues);
        logger.log('[AndroidVideoPlayer] (Android) customSubtitles <- parsedCues');
        setUseCustomSubtitles(true);
        logger.log('[AndroidVideoPlayer] (Android) useCustomSubtitles -> true');
        setSelectedTextTrack(-1);
        logger.log('[AndroidVideoPlayer] (Android) selectedTextTrack -> -1');
        setIsLoadingSubtitles(false);
        logger.log('[AndroidVideoPlayer] (Android) isLoadingSubtitles -> false');
        try {
          const adjustedTime = currentTime + (subtitleOffsetSec || 0);
          const cueNow = parsedCues.find(cue => adjustedTime >= cue.start && adjustedTime <= cue.end);
          const textNow = cueNow ? cueNow.text : '';
          setCurrentSubtitle(textNow);
          logger.log('[AndroidVideoPlayer] currentSubtitle set immediately after apply (Android)');
        } catch {}
      }
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error loading Wyzie subtitle:', error);
      setIsLoadingSubtitles(false);
      logger.log('[AndroidVideoPlayer] isLoadingSubtitles -> false (error path)');
    }
  };
    
  const togglePlayback = () => {
    if (videoRef.current) {
      const newPausedState = !paused;
      setPaused(newPausedState);
      
      // Send a forced pause update to Trakt immediately when user pauses
      if (newPausedState && duration > 0) {
        traktAutosync.handleProgressUpdate(currentTime, duration, true);
      }
    }
  };

  // Handle next episode button press
  const handlePlayNextEpisode = useCallback(async () => {
    if (!nextEpisode || !id || isLoadingNextEpisode) return;

    setIsLoadingNextEpisode(true);
    
    try {
      logger.log('[AndroidVideoPlayer] Loading next episode:', nextEpisode);
      
      // Create episode ID for next episode using stremioId if available, otherwise construct it
      const nextEpisodeId = nextEpisode.stremioId || `${id}:${nextEpisode.season_number}:${nextEpisode.episode_number}`;
      
      logger.log('[AndroidVideoPlayer] Fetching streams for next episode:', nextEpisodeId);
      
      // Import stremio service 
      const stremioService = require('../../services/stremioService').default;
      
      let bestStream: any = null;
      let streamFound = false;
      let completedProviders = 0;
      const expectedProviders = new Set<string>();
      
      // Get installed addons to know how many providers to expect
      const installedAddons = stremioService.getInstalledAddons();
      const streamAddons = installedAddons.filter((addon: any) => 
        addon.resources && addon.resources.includes('stream')
      );
      
      streamAddons.forEach((addon: any) => expectedProviders.add(addon.id));
      
      // Collect all streams from all providers for the sources modal
      const allStreams: { [providerId: string]: { streams: any[]; addonName: string } } = {};
      let hasNavigated = false;
      
      // Fetch streams for next episode
      await stremioService.getStreams('series', nextEpisodeId, (streams: any, addonId: any, addonName: any, error: any) => {
        completedProviders++;
        
        // Always collect streams from this provider for sources modal (even after navigation)
        if (streams && streams.length > 0) {
          allStreams[addonId] = {
            streams: streams,
            addonName: addonName || addonId
          };
        }
        
        // Navigate with first good stream found, but continue collecting streams in background
        if (!hasNavigated && !streamFound && streams && streams.length > 0) {
          // Sort streams by quality and cache status (prefer cached/debrid streams)
          const sortedStreams = streams.sort((a: any, b: any) => {
            const aQuality = parseInt(a.title?.match(/(\d+)p/)?.[1] || '0', 10);
            const bQuality = parseInt(b.title?.match(/(\d+)p/)?.[1] || '0', 10);
            const aCached = a.behaviorHints?.cached || false;
            const bCached = b.behaviorHints?.cached || false;
            
            // Prioritize cached streams first
            if (aCached !== bCached) {
              return aCached ? -1 : 1;
            }
            // Then sort by quality (higher quality first)
            return bQuality - aQuality;
          });
          
          bestStream = sortedStreams[0];
          streamFound = true;
          hasNavigated = true;

          // Update loading details for the chip
          const qualityText = (bestStream.title?.match(/(\d+)p/) || [])[1] || null;
          setNextLoadingProvider(addonName || addonId || null);
          setNextLoadingQuality(qualityText);
          setNextLoadingTitle(bestStream.name || bestStream.title || null);
          
          logger.log('[AndroidVideoPlayer] Found stream for next episode:', bestStream);
          
          // Pause current playback to ensure no background player remains active
          setPaused(true);

          // Start navigation immediately but let stream fetching continue in background
          setTimeout(() => {
            (navigation as any).replace('Player', {
              uri: bestStream.url,
              title: metadata?.name || '',
              episodeTitle: nextEpisode.name,
              season: nextEpisode.season_number,
              episode: nextEpisode.episode_number,
              quality: (bestStream.title?.match(/(\d+)p/) || [])[1] || undefined,
              year: metadata?.year,
              streamProvider: addonName,
              streamName: bestStream.name || bestStream.title,
              headers: bestStream.headers || undefined,
              forceVlc: false,
              id,
              type: 'series',
              episodeId: nextEpisodeId,
              imdbId: imdbId ?? undefined,
              backdrop: backdrop || undefined,
              availableStreams: allStreams, // Pass current available streams (more will be added)
            });
            setIsLoadingNextEpisode(false);
          }, 100); // Small delay to ensure smooth transition
        }
        
        // If we've checked all providers and no stream found
        if (completedProviders >= expectedProviders.size && !streamFound) {
          logger.warn('[AndroidVideoPlayer] No streams found for next episode after checking all providers');
          setIsLoadingNextEpisode(false);
        }
      });
      
      // Fallback timeout in case providers don't respond
      setTimeout(() => {
        if (!streamFound) {
          logger.warn('[AndroidVideoPlayer] Timeout: No streams found for next episode');
          setIsLoadingNextEpisode(false);
        }
      }, 8000);
      
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error loading next episode:', error);
      setIsLoadingNextEpisode(false);
    }
  }, [nextEpisode, id, isLoadingNextEpisode, navigation, metadata, imdbId, backdrop]);

  // Function to hide pause overlay and show controls
  const hidePauseOverlay = useCallback(() => {
    if (showPauseOverlay) {
      // Reset cast details state when hiding overlay
      if (showCastDetails) {
        Animated.parallel([
          Animated.timing(castDetailsOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(castDetailsScale, {
            toValue: 0.95,
            duration: 200,
            useNativeDriver: true,
          })
        ]).start(() => {
          setShowCastDetails(false);
          setSelectedCastMember(null);
          // Reset metadata animations
          metadataOpacity.setValue(1);
          metadataScale.setValue(1);
        });
      } else {
        setShowCastDetails(false);
        setSelectedCastMember(null);
        // Reset metadata animations
        metadataOpacity.setValue(1);
        metadataScale.setValue(1);
      }
      
      Animated.parallel([
        Animated.timing(pauseOverlayOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(pauseOverlayTranslateY, {
          toValue: 8,
          duration: 220,
          useNativeDriver: true,
        })
      ]).start(() => setShowPauseOverlay(false));
      
      // Show controls when overlay is touched
      if (!showControls) {
        setShowControls(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
        
        // Auto-hide controls after 5 seconds
        if (controlsTimeout.current) {
          clearTimeout(controlsTimeout.current);
        }
        controlsTimeout.current = setTimeout(hideControls, 5000);
      }
    }
  }, [showPauseOverlay, pauseOverlayOpacity, pauseOverlayTranslateY, showControls, fadeAnim, controlsTimeout, hideControls]);

  // Handle paused overlay after 5 seconds of being paused
  useEffect(() => {
    if (paused) {
      if (pauseOverlayTimerRef.current) {
        clearTimeout(pauseOverlayTimerRef.current);
      }
      pauseOverlayTimerRef.current = setTimeout(() => {
        setShowPauseOverlay(true);
        pauseOverlayOpacity.setValue(0);
        pauseOverlayTranslateY.setValue(12);
        Animated.parallel([
          Animated.timing(pauseOverlayOpacity, {
            toValue: 1,
            duration: 550,
            useNativeDriver: true,
          }),
          Animated.timing(pauseOverlayTranslateY, {
            toValue: 0,
            duration: 450,
            useNativeDriver: true,
          })
        ]).start();
      }, 5000);
    } else {
      if (pauseOverlayTimerRef.current) {
        clearTimeout(pauseOverlayTimerRef.current);
        pauseOverlayTimerRef.current = null;
      }
      hidePauseOverlay();
    }
    return () => {
      if (pauseOverlayTimerRef.current) {
        clearTimeout(pauseOverlayTimerRef.current);
        pauseOverlayTimerRef.current = null;
      }
    };
  }, [paused]);

  // Handle next episode button visibility based on current time and next episode availability
  useEffect(() => {
    if ((type as any) !== 'series' || !nextEpisode || duration <= 0) {
      if (showNextEpisodeButton) {
        // Hide button with animation
        Animated.parallel([
          Animated.timing(nextEpisodeButtonOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(nextEpisodeButtonScale, {
            toValue: 0.8,
            duration: 200,
            useNativeDriver: true,
          })
        ]).start(() => {
          setShowNextEpisodeButton(false);
        });
      }
      return;
    }

    // Show button when 1 minute (60 seconds) remains
    const timeRemaining = duration - currentTime;
    const shouldShowButton = timeRemaining <= 60 && timeRemaining > 10; // Hide in last 10 seconds

    if (shouldShowButton && !showNextEpisodeButton) {
      setShowNextEpisodeButton(true);
      Animated.parallel([
        Animated.timing(nextEpisodeButtonOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(nextEpisodeButtonScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        })
      ]).start();
    } else if (!shouldShowButton && showNextEpisodeButton) {
      Animated.parallel([
        Animated.timing(nextEpisodeButtonOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(nextEpisodeButtonScale, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start(() => {
        setShowNextEpisodeButton(false);
      });
    }
  }, [type, nextEpisode, duration, currentTime, showNextEpisodeButton]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
      }
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      if (volumeOverlayTimeout.current) {
        clearTimeout(volumeOverlayTimeout.current);
      }
      if (brightnessOverlayTimeout.current) {
        clearTimeout(brightnessOverlayTimeout.current);
      }
    };
  }, []);
  
  const safeSetState = (setter: any) => {
    if (isMounted.current) {
      setter();
    }
  };

  useEffect(() => {
    if (!useCustomSubtitles || customSubtitles.length === 0) {
      if (currentSubtitle !== '') {
        setCurrentSubtitle('');
      }
      return;
    }
    const adjustedTime = currentTime + (subtitleOffsetSec || 0);
    const currentCue = customSubtitles.find(cue => 
      adjustedTime >= cue.start && adjustedTime <= cue.end
    );
    const newSubtitle = currentCue ? currentCue.text : '';
    setCurrentSubtitle(newSubtitle);
  }, [currentTime, customSubtitles, useCustomSubtitles, subtitleOffsetSec]);

  useEffect(() => {
    loadSubtitleSize();
  }, []);

  // Handle audio track changes with proper logging
  useEffect(() => {
    if (selectedAudioTrack !== null && rnVideoAudioTracks.length > 0) {
      const selectedTrack = rnVideoAudioTracks.find(track => track.id === selectedAudioTrack);
      if (selectedTrack) {
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Audio track selected: ${selectedTrack.name} (${selectedTrack.language}) - ID: ${selectedAudioTrack}`);
        }
      } else {
        logger.warn(`[AndroidVideoPlayer] Selected audio track ${selectedAudioTrack} not found in available tracks`);
      }
    }
  }, [selectedAudioTrack, rnVideoAudioTracks]);

  // Load global subtitle settings
  useEffect(() => {
    (async () => {
      try {
        const saved = await storageService.getSubtitleSettings();
        if (saved) {
          if (typeof saved.subtitleSize === 'number') setSubtitleSize(saved.subtitleSize);
          if (typeof saved.subtitleBackground === 'boolean') setSubtitleBackground(saved.subtitleBackground);
          if (typeof saved.subtitleTextColor === 'string') setSubtitleTextColor(saved.subtitleTextColor);
          if (typeof saved.subtitleBgOpacity === 'number') setSubtitleBgOpacity(saved.subtitleBgOpacity);
          if (typeof saved.subtitleTextShadow === 'boolean') setSubtitleTextShadow(saved.subtitleTextShadow);
          if (typeof saved.subtitleOutline === 'boolean') setSubtitleOutline(saved.subtitleOutline);
          if (typeof saved.subtitleOutlineColor === 'string') setSubtitleOutlineColor(saved.subtitleOutlineColor);
          if (typeof saved.subtitleOutlineWidth === 'number') setSubtitleOutlineWidth(saved.subtitleOutlineWidth);
          if (typeof saved.subtitleAlign === 'string') setSubtitleAlign(saved.subtitleAlign as 'center' | 'left' | 'right');
          if (typeof saved.subtitleBottomOffset === 'number') setSubtitleBottomOffset(saved.subtitleBottomOffset);
          if (typeof saved.subtitleLetterSpacing === 'number') setSubtitleLetterSpacing(saved.subtitleLetterSpacing);
          if (typeof saved.subtitleLineHeightMultiplier === 'number') setSubtitleLineHeightMultiplier(saved.subtitleLineHeightMultiplier);
          if (typeof saved.subtitleOffsetSec === 'number') setSubtitleOffsetSec(saved.subtitleOffsetSec);
        }
      } catch {}
    })();
  }, []);

  // Persist global subtitle settings on change
  useEffect(() => {
    storageService.saveSubtitleSettings({
      subtitleSize,
      subtitleBackground,
      subtitleTextColor,
      subtitleBgOpacity,
      subtitleTextShadow,
      subtitleOutline,
      subtitleOutlineColor,
      subtitleOutlineWidth,
      subtitleAlign,
      subtitleBottomOffset,
      subtitleLetterSpacing,
      subtitleLineHeightMultiplier,
      subtitleOffsetSec,
    });
  }, [
    subtitleSize,
    subtitleBackground,
    subtitleTextColor,
    subtitleBgOpacity,
    subtitleTextShadow,
    subtitleOutline,
    subtitleOutlineColor,
    subtitleOutlineWidth,
    subtitleAlign,
    subtitleBottomOffset,
    subtitleLetterSpacing,
    subtitleLineHeightMultiplier,
    subtitleOffsetSec,
  ]);

  const increaseSubtitleSize = () => {
    const newSize = Math.min(subtitleSize + 2, 32);
    saveSubtitleSize(newSize);
  };

  const decreaseSubtitleSize = () => {
    const newSize = Math.max(subtitleSize - 2, 8);
    saveSubtitleSize(newSize);
  };

  const toggleSubtitleBackground = () => {
    setSubtitleBackground(!subtitleBackground);
  };

  useEffect(() => {
    if (pendingSeek && isPlayerReady && isVideoLoaded && duration > 0) {
      logger.log(`[AndroidVideoPlayer] Player ready after source change, seeking to position: ${pendingSeek.position}s out of ${duration}s total`);
      
      if (pendingSeek.position > 0 && videoRef.current) {
        const delayTime = 800; // Shorter delay for react-native-video
        
        setTimeout(() => {
          if (videoRef.current && duration > 0 && pendingSeek) {
            logger.log(`[AndroidVideoPlayer] Executing seek to ${pendingSeek.position}s`);
            
            seekToTime(pendingSeek.position);
            
            if (pendingSeek.shouldPlay) {
              setTimeout(() => {
                logger.log('[AndroidVideoPlayer] Resuming playback after source change seek');
                setPaused(false);
              }, 300);
            }
            
            setTimeout(() => {
              setPendingSeek(null);
              setIsChangingSource(false);
            }, 400);
          }
        }, delayTime);
      } else {
        // No seeking needed, just resume playback if it was playing
        if (pendingSeek.shouldPlay) {
          setTimeout(() => {
            logger.log('[AndroidVideoPlayer] No seek needed, just resuming playback');
            setPaused(false);
          }, 300);
        }
        
        setTimeout(() => {
          setPendingSeek(null);
          setIsChangingSource(false);
        }, 400);
      }
    }
  }, [pendingSeek, isPlayerReady, isVideoLoaded, duration]);

  const handleSelectStream = async (newStream: any) => {
    if (newStream.url === currentStreamUrl) {
      setShowSourcesModal(false);
      return;
    }

    setIsChangingSource(true);
    setShowSourcesModal(false);
    
    try {
      // Save current state
      const savedPosition = currentTime;
      const wasPlaying = !paused;
      
      logger.log(`[AndroidVideoPlayer] Changing source from ${currentStreamUrl} to ${newStream.url}`);
      logger.log(`[AndroidVideoPlayer] Saved position: ${savedPosition}, was playing: ${wasPlaying}`);
      
      // Extract quality and provider information from the new stream
      let newQuality = newStream.quality;
      if (!newQuality && newStream.title) {
        // Try to extract quality from title (e.g., "1080p", "720p")
        const qualityMatch = newStream.title.match(/(\d+)p/);
        newQuality = qualityMatch ? qualityMatch[0] : undefined;
      }
      
      // For provider, try multiple fields
      const newProvider = newStream.addonName || newStream.name || newStream.addon || 'Unknown';
      
      // For stream name, prioritize the stream name over title
      const newStreamName = newStream.name || newStream.title || 'Unknown Stream';
      
      logger.log(`[AndroidVideoPlayer] Stream object:`, newStream);
      logger.log(`[AndroidVideoPlayer] Extracted - Quality: ${newQuality}, Provider: ${newProvider}, Stream Name: ${newStreamName}`);
      
      // Stop current playback
      setPaused(true);
      
      // Set pending seek state
      setPendingSeek({ position: savedPosition, shouldPlay: wasPlaying });
      
      // Update the stream URL and details immediately
      setCurrentStreamUrl(newStream.url);
      setCurrentQuality(newQuality);
      setCurrentStreamProvider(newProvider);
      setCurrentStreamName(newStreamName);
      
      // Reset player state for new source
      setCurrentTime(0);
      setDuration(0);
      setIsPlayerReady(false);
      setIsVideoLoaded(false);
      
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error changing source:', error);
      setPendingSeek(null);
      setIsChangingSource(false);
    }
  };

  useEffect(() => {
    if (isVideoLoaded && initialPosition && !isInitialSeekComplete && duration > 0) {
      logger.log(`[AndroidVideoPlayer] Post-load initial seek to: ${initialPosition}s`);
      seekToTime(initialPosition);
      setIsInitialSeekComplete(true);
      // Verify whether the seek actually took effect (detect non-seekable sources)
      if (!initialSeekVerifiedRef.current) {
        initialSeekVerifiedRef.current = true;
        const target = initialSeekTargetRef.current ?? initialPosition;
        setTimeout(() => {
          const delta = Math.abs(currentTime - (target || 0));
          if (target && (currentTime < target - 1.5)) {
            logger.warn(`[AndroidVideoPlayer] Initial seek appears ignored (delta=${delta.toFixed(2)}). Treating source as non-seekable; starting from 0`);
            isSourceSeekableRef.current = false;
            // Reset resume intent and continue from 0
            setInitialPosition(null);
            setResumePosition(null);
            setShowResumeOverlay(false);
          } else {
            isSourceSeekableRef.current = true;
          }
        }, 1200);
      }
    }
  }, [isVideoLoaded, initialPosition, duration]);

  return (
    <View style={[styles.container, {
      width: screenDimensions.width,
      height: screenDimensions.height,
      position: 'absolute',
      top: 0,
      left: 0,
    }]}> 
      <Animated.View 
        style={[
          styles.openingOverlay,
          {
            opacity: backgroundFadeAnim,
            zIndex: isOpeningAnimationComplete ? -1 : 3000,
            width: screenDimensions.width,
            height: screenDimensions.height,
          }
        ]}
        pointerEvents={isOpeningAnimationComplete ? 'none' : 'auto'}
      >
        {backdrop && (
          <Image
            source={{ uri: backdrop }}
            style={[StyleSheet.absoluteFill, { width: screenDimensions.width, height: screenDimensions.height }]}
            resizeMode="cover"
            blurRadius={0}
          />
        )}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.3)',
            'rgba(0,0,0,0.6)',
            'rgba(0,0,0,0.8)',
            'rgba(0,0,0,0.9)'
          ]}
          locations={[0, 0.3, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        
        <TouchableOpacity 
          style={styles.loadingCloseButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <MaterialIcons name="close" size={24} color="#ffffff" />
        </TouchableOpacity>
        
        <View style={styles.openingContent}>
          {hasLogo ? (
            <>
            <Animated.View style={{
              transform: [
                { scale: Animated.multiply(logoScaleAnim, pulseAnim) }
              ],
              opacity: logoOpacityAnim,
              alignItems: 'center',
            }}>
              <Image
                source={{ uri: metadata.logo }}
                style={{
                  width: 300,
                  height: 180,
                  resizeMode: 'contain',
                }}
              />
            </Animated.View>
            <Text style={{
              color: '#B8B8B8',
              fontSize: 12,
              marginTop: 8,
              opacity: 0.9
            }} numberOfLines={1}>
              {`Via ${(currentStreamProvider || streamProvider || '').toString().toUpperCase()}${(currentQuality || quality) ? ` • ${(currentQuality || quality)}p` : ''}`}
            </Text>
            </>
          ) : (
            <>
          <ActivityIndicator size="large" color="#E50914" />
              <Text style={{
                color: '#B8B8B8',
                fontSize: 12,
                marginTop: 12,
                opacity: 0.9
              }} numberOfLines={1}>
                {`Via ${(currentStreamProvider || streamProvider || '').toString().toUpperCase()}${(currentQuality || quality) ? ` • ${(currentQuality || quality)}p` : ''}`}
              </Text>
            </>
          )}
        </View>
      </Animated.View>

      {/* Source Change Loading Overlay */}
      {isChangingSource && (
        <Animated.View 
          style={[
            styles.sourceChangeOverlay,
            {
              width: screenDimensions.width,
              height: screenDimensions.height,
              opacity: fadeAnim,
            }
          ]}
          pointerEvents="auto"
        >
          <View style={styles.sourceChangeContent}>
            <ActivityIndicator size="large" color="#E50914" />
            <Text style={styles.sourceChangeText}>Changing source...</Text>
            <Text style={styles.sourceChangeSubtext}>Please wait while we load the new stream</Text>
          </View>
        </Animated.View>
      )}

      <Animated.View 
        style={[
          styles.videoPlayerContainer,
          {
            opacity: openingFadeAnim,
            transform: isOpeningAnimationComplete ? [] : [{ scale: openingScaleAnim }],
            width: screenDimensions.width,
            height: screenDimensions.height,
          }
        ]}
      >
        {/* Combined gesture handler for left side - brightness + tap */}
        <PanGestureHandler
          onGestureEvent={onBrightnessGestureEvent}
          activeOffsetY={[-10, 10]}
          failOffsetX={[-50, 50]}
          shouldCancelWhenOutside={true}
          simultaneousHandlers={[]}
        >
          <TapGestureHandler
            onActivated={toggleControls}
            shouldCancelWhenOutside={false}
            simultaneousHandlers={[]}
          >
            <View style={{
              position: 'absolute',
              top: screenDimensions.height * 0.15, // Back to original margin
              left: 0,
              width: screenDimensions.width * 0.4, // Back to larger area (40% of screen)
              height: screenDimensions.height * 0.7, // Back to larger middle portion (70% of screen)
              zIndex: 10, // Higher z-index to capture gestures
            }} />
          </TapGestureHandler>
        </PanGestureHandler>

        {/* Combined gesture handler for right side - volume + tap */}
        <PanGestureHandler
          onGestureEvent={onVolumeGestureEvent}
          activeOffsetY={[-10, 10]}
          failOffsetX={[-50, 50]}
          shouldCancelWhenOutside={true}
          simultaneousHandlers={[]}
        >
          <TapGestureHandler
            onActivated={toggleControls}
            shouldCancelWhenOutside={false}
            simultaneousHandlers={[]}
          >
            <View style={{
              position: 'absolute',
              top: screenDimensions.height * 0.15, // Back to original margin
              right: 0,
              width: screenDimensions.width * 0.4, // Back to larger area (40% of screen)
              height: screenDimensions.height * 0.7, // Back to larger middle portion (70% of screen)
              zIndex: 10, // Higher z-index to capture gestures
            }} />
          </TapGestureHandler>
        </PanGestureHandler>

        {/* Center area tap handler - handles both show and hide */}
        <TapGestureHandler
          onActivated={() => {
            if (showControls) {
              // If controls are visible, hide them
              const timeoutId = setTimeout(() => {
                hideControls();
              }, 0);
              // Clear any existing timeout
              if (controlsTimeout.current) {
                clearTimeout(controlsTimeout.current);
              }
              controlsTimeout.current = timeoutId;
            } else {
              // If controls are hidden, show them
              toggleControls();
            }
          }}
          shouldCancelWhenOutside={false}
          simultaneousHandlers={[]}
        >
          <View style={{
            position: 'absolute',
            top: screenDimensions.height * 0.15,
            left: screenDimensions.width * 0.4, // Start after left gesture area
            width: screenDimensions.width * 0.2, // Center area (20% of screen)
            height: screenDimensions.height * 0.7,
            zIndex: 5, // Lower z-index, controls use box-none to allow touches through
          }} />
        </TapGestureHandler>

        <View
          style={[styles.videoContainer, {
            width: screenDimensions.width,
            height: screenDimensions.height,
          }]}
        >

          <PinchGestureHandler
            ref={pinchRef}
            onGestureEvent={onPinchGestureEvent}
            onHandlerStateChange={onPinchHandlerStateChange}
          >
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: screenDimensions.width,
              height: screenDimensions.height,
            }}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={toggleControls}
                onLongPress={resetZoom}
                delayLongPress={300}
              >
                <Video
                  ref={videoRef}
                  style={[styles.video, customVideoStyles, { transform: [{ scale: zoomScale }] }]}
                  source={{ uri: currentStreamUrl, headers: headers || (Platform.OS === 'android' ? defaultAndroidHeaders() : defaultIosHeaders()), type: (currentVideoType as any) }}
                  paused={paused}
                  onLoadStart={() => {
                    loadStartAtRef.current = Date.now();
                    logger.log('[AndroidVideoPlayer] onLoadStart');
                  }}
                  onProgress={handleProgress}
                  onLoad={(e) => {
                    logger.log('[AndroidVideoPlayer] onLoad fired', { duration: e?.duration });
                    onLoad(e);
                  }}
                  onReadyForDisplay={() => {
                    firstFrameAtRef.current = Date.now();
                    const startedAt = loadStartAtRef.current;
                    if (startedAt) {
                      const deltaMs = firstFrameAtRef.current - startedAt;
                      logger.log(`[AndroidVideoPlayer] First frame ready after ${deltaMs} ms (${Platform.OS})`);
                    } else {
                      logger.log('[AndroidVideoPlayer] First frame ready (no start timestamp)');
                    }
                  }}
                  onSeek={onSeek}
                  onEnd={onEnd}
                  onError={(err) => {
                    logger.error('[AndroidVideoPlayer] onError', err);
                    handleError(err);
                  }}
                  onBuffer={(buf) => {
                    logger.log('[AndroidVideoPlayer] onBuffer', buf);
                    onBuffer(buf);
                  }}
                  resizeMode={getVideoResizeMode(resizeMode)}
                  selectedAudioTrack={selectedAudioTrack !== null ? { type: SelectedTrackType.INDEX, value: selectedAudioTrack } : undefined}
                  selectedTextTrack={useCustomSubtitles ? { type: SelectedTrackType.DISABLED } : (selectedTextTrack >= 0 ? { type: SelectedTrackType.INDEX, value: selectedTextTrack } : undefined)}
                  rate={1.0}
                  volume={volume}
                  muted={false}
                  repeat={false}
                  playInBackground={false}
                  playWhenInactive={false}
                  ignoreSilentSwitch="ignore"
                  mixWithOthers="inherit"
                  progressUpdateInterval={1000}
                  maxBitRate={2000000}
                  disableFocus={true}
                  // iOS AVPlayer startup tuning
                  automaticallyWaitsToMinimizeStalling={true as any}
                  preferredForwardBufferDuration={1 as any}
                  allowsExternalPlayback={false as any}
                  preventsDisplaySleepDuringVideoPlayback={true as any}
                />
              </TouchableOpacity>
            </View>
          </PinchGestureHandler>

          {/* Tap-capture overlay above the Video to toggle controls (Android fix) */}
          <TouchableWithoutFeedback onPress={toggleControls}>
            <View
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              pointerEvents={showControls ? 'none' : 'auto'}
            />
          </TouchableWithoutFeedback>

          <PlayerControls
            showControls={showControls}
            fadeAnim={fadeAnim}
            paused={paused}
            title={title}
            episodeTitle={episodeTitle}
            season={season}
            episode={episode}
            quality={currentQuality || quality}
            year={year}
            streamProvider={currentStreamProvider || streamProvider}
            streamName={currentStreamName}
            currentTime={currentTime}
            duration={duration}
            zoomScale={zoomScale}
            currentResizeMode={resizeMode}
            vlcAudioTracks={rnVideoAudioTracks}
            selectedAudioTrack={selectedAudioTrack}
            availableStreams={availableStreams}
            togglePlayback={togglePlayback}
            skip={skip}
            handleClose={handleClose}
            cycleAspectRatio={cycleAspectRatio}
            setShowAudioModal={setShowAudioModal}
            setShowSubtitleModal={setShowSubtitleModal}
            isSubtitleModalOpen={showSubtitleModal}
            setShowSourcesModal={setShowSourcesModal}
            onSliderValueChange={handleSliderValueChange}
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={handleSlidingComplete}
            buffered={buffered}
            formatTime={formatTime}
          />

          {showPauseOverlay && (
            <TouchableOpacity
              activeOpacity={1}
              onPress={hidePauseOverlay}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 30,
              }}
            >
              <Animated.View 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: pauseOverlayOpacity,
                }}
              >
                {/* Strong horizontal fade from left side */}
                <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: screenDimensions.width * 0.7 }}>
                  <LinearGradient
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    colors={[ 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0.0)' ]}
                    locations={[0, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
                <LinearGradient
                  colors={[
                    'rgba(0,0,0,0.6)',
                    'rgba(0,0,0,0.4)',
                    'rgba(0,0,0,0.2)',
                    'rgba(0,0,0,0.0)'
                  ]}
                  locations={[0, 0.3, 0.6, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <Animated.View style={{
                  position: 'absolute',
                  left: 24 + insets.left,
                  right: 24 + insets.right,
                  top: 24 + insets.top,
                  bottom: 110 + insets.bottom,
                  transform: [{ translateY: pauseOverlayTranslateY }]
                }}>
                  {showCastDetails && selectedCastMember ? (
                    // Cast Detail View with fade transition
                    <Animated.View 
                      style={{ 
                        flex: 1, 
                        justifyContent: 'center',
                        opacity: castDetailsOpacity,
                        transform: [{ 
                          scale: castDetailsScale
                        }]
                      }}
                    >
                      <View style={{ 
                        alignItems: 'flex-start',
                        paddingBottom: screenDimensions.height * 0.1 
                      }}>
                        <TouchableOpacity 
                          style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            marginBottom: 24,
                            paddingVertical: 8,
                            paddingHorizontal: 4
                          }}
                          onPress={() => {
                            // Animate cast details out, then metadata back in
                            Animated.parallel([
                              Animated.timing(castDetailsOpacity, {
                                toValue: 0,
                                duration: 250,
                                useNativeDriver: true,
                              }),
                              Animated.timing(castDetailsScale, {
                                toValue: 0.95,
                                duration: 250,
                                useNativeDriver: true,
                              })
                            ]).start(() => {
                              setShowCastDetails(false);
                              setSelectedCastMember(null);
                              // Animate metadata back in
                              Animated.parallel([
                                Animated.timing(metadataOpacity, {
                                  toValue: 1,
                                  duration: 400,
                                  useNativeDriver: true,
                                }),
                                Animated.spring(metadataScale, {
                                  toValue: 1,
                                  tension: 80,
                                  friction: 8,
                                  useNativeDriver: true,
                                })
                              ]).start();
                            });
                          }}
                        >
                          <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={{ 
                            color: '#B8B8B8', 
                            fontSize: Math.min(14, screenDimensions.width * 0.02) 
                          }}>Back to details</Text>
                        </TouchableOpacity>
                        
                        <View style={{ 
                          flexDirection: 'row', 
                          alignItems: 'flex-start',
                          width: '100%'
                        }}>
                          {selectedCastMember.profile_path && (
                            <View style={{
                              marginRight: 20,
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.3,
                              shadowRadius: 8,
                              elevation: 5,
                            }}>
                              <Image
                                source={{ uri: `https://image.tmdb.org/t/p/w300${selectedCastMember.profile_path}` }}
                                style={{
                                  width: Math.min(120, screenDimensions.width * 0.18),
                                  height: Math.min(180, screenDimensions.width * 0.27), // Proper aspect ratio 2:3
                                  borderRadius: 12,
                                  backgroundColor: 'rgba(255,255,255,0.1)'
                                }}
                                resizeMode="cover"
                              />
                            </View>
                          )}
                          <View style={{ 
                            flex: 1,
                            paddingTop: 8
                          }}>
                            <Text style={{ 
                              color: '#FFFFFF', 
                              fontSize: Math.min(32, screenDimensions.width * 0.045), 
                              fontWeight: '800', 
                              marginBottom: 8,
                              lineHeight: Math.min(38, screenDimensions.width * 0.05)
                            }} numberOfLines={2}>
                              {selectedCastMember.name}
                            </Text>
                            {selectedCastMember.character && (
                              <Text style={{ 
                                color: '#CCCCCC', 
                                fontSize: Math.min(16, screenDimensions.width * 0.022), 
                                marginBottom: 8,
                                fontWeight: '500',
                                fontStyle: 'italic'
                              }} numberOfLines={2}>
                                as {selectedCastMember.character}
                              </Text>
                            )}
                            
                            {/* Biography if available */}
                            {selectedCastMember.biography && (
                              <Text style={{ 
                                color: '#D6D6D6', 
                                fontSize: Math.min(14, screenDimensions.width * 0.019), 
                                lineHeight: Math.min(20, screenDimensions.width * 0.026),
                                marginTop: 16,
                                opacity: 0.9
                              }} numberOfLines={4}>
                                {selectedCastMember.biography}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  ) : (
                    // Default Metadata View
                    <Animated.View style={{ 
                      flex: 1, 
                      justifyContent: 'space-between',
                      opacity: metadataOpacity,
                      transform: [{ scale: metadataScale }]
                    }}>
                      <View>
                        <Text style={{ 
                          color: '#B8B8B8', 
                          fontSize: Math.min(18, screenDimensions.width * 0.025), 
                          marginBottom: 8 
                        }}>You're watching</Text>
                        <Text style={{ 
                          color: '#FFFFFF', 
                          fontSize: Math.min(48, screenDimensions.width * 0.06), 
                          fontWeight: '800', 
                          marginBottom: 10 
                        }} numberOfLines={2}>
                          {title}
                        </Text>
                        {!!year && (
                          <Text style={{ 
                            color: '#CCCCCC', 
                            fontSize: Math.min(18, screenDimensions.width * 0.025), 
                            marginBottom: 8 
                          }} numberOfLines={1}>
                            {`${year}${type === 'series' && season && episode ? ` • S${season}E${episode}` : ''}`}
                          </Text>
                        )}
                        {!!episodeTitle && (
                          <Text style={{ 
                            color: '#FFFFFF', 
                            fontSize: Math.min(20, screenDimensions.width * 0.03), 
                            fontWeight: '600', 
                            marginBottom: 8 
                          }} numberOfLines={2}>
                            {episodeTitle}
                          </Text>
                        )}
                        {(currentEpisodeDescription || metadata?.description) && (
                          <Text style={{ 
                            color: '#D6D6D6', 
                            fontSize: Math.min(18, screenDimensions.width * 0.025), 
                            lineHeight: Math.min(24, screenDimensions.width * 0.03) 
                          }} numberOfLines={3}>
                            {(type as any) === 'series' ? (currentEpisodeDescription || metadata?.description || '') : (metadata?.description || '')}
                          </Text>
                        )}
                        {cast && cast.length > 0 && (
                          <View style={{ marginTop: 16 }}>
                            <Text style={{ 
                              color: '#B8B8B8', 
                              fontSize: Math.min(16, screenDimensions.width * 0.022), 
                              marginBottom: 8 
                            }}>Cast</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                              {cast.slice(0, 6).map((castMember: any, index: number) => (
                                <TouchableOpacity
                                  key={castMember.id || index}
                                  style={{
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    borderRadius: 12,
                                    paddingHorizontal: Math.min(12, screenDimensions.width * 0.015),
                                    paddingVertical: Math.min(6, screenDimensions.height * 0.008),
                                    marginRight: 8,
                                    marginBottom: 8,
                                  }}
                                                                  onPress={() => {
                                  setSelectedCastMember(castMember);
                                  // Animate metadata out, then cast details in
                                  Animated.parallel([
                                    Animated.timing(metadataOpacity, {
                                      toValue: 0,
                                      duration: 250,
                                      useNativeDriver: true,
                                    }),
                                    Animated.timing(metadataScale, {
                                      toValue: 0.95,
                                      duration: 250,
                                      useNativeDriver: true,
                                    })
                                  ]).start(() => {
                                    setShowCastDetails(true);
                                    // Animate cast details in
                                    Animated.parallel([
                                      Animated.timing(castDetailsOpacity, {
                                        toValue: 1,
                                        duration: 400,
                                        useNativeDriver: true,
                                      }),
                                      Animated.spring(castDetailsScale, {
                                        toValue: 1,
                                        tension: 80,
                                        friction: 8,
                                        useNativeDriver: true,
                                      })
                                    ]).start();
                                  });
                                }}
                                >
                                  <Text style={{ 
                                    color: '#FFFFFF', 
                                    fontSize: Math.min(14, screenDimensions.width * 0.018) 
                                  }}>
                                    {castMember.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  )}
                </Animated.View>
              </Animated.View>
            </TouchableOpacity>
          )}

          {/* Next Episode Button */}
          {showNextEpisodeButton && nextEpisode && (
            <Animated.View 
              style={{
                position: 'absolute',
                bottom: 80 + insets.bottom,
                right: 8 + insets.right,
                opacity: nextEpisodeButtonOpacity,
                transform: [{ scale: nextEpisodeButtonScale }],
              }}
            >
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
                onPress={handlePlayNextEpisode}
                activeOpacity={0.8}
              >
                {isLoadingNextEpisode ? (
                  <ActivityIndicator size="small" color="#000000" style={{ marginRight: 8 }} />
                ) : (
                  <MaterialIcons name="skip-next" size={18} color="#000000" style={{ marginRight: 8 }} />
                )}
                <View>
                  <Text style={{ color: '#000000', fontSize: 11, fontWeight: '700', opacity: 0.8 }}>
                    {isLoadingNextEpisode ? 'Loading next episode…' : 'Up next'}
                  </Text>
                  <Text style={{ color: '#000000', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                    S{nextEpisode.season_number}E{nextEpisode.episode_number}
                    {nextEpisode.name ? `: ${nextEpisode.name}` : ''}
                  </Text>
                  {isLoadingNextEpisode && (
                    <Text style={{ color: '#333333', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {nextLoadingProvider ? `${nextLoadingProvider}` : 'Finding source…'}
                      {nextLoadingQuality ? ` • ${nextLoadingQuality}p` : ''}
                      {nextLoadingTitle ? ` • ${nextLoadingTitle}` : ''}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}
          
          <CustomSubtitles
            key={customSubtitleVersion}
            useCustomSubtitles={useCustomSubtitles}
            currentSubtitle={currentSubtitle}
            subtitleSize={subtitleSize}
            subtitleBackground={subtitleBackground}
            zoomScale={zoomScale}
            textColor={subtitleTextColor}
            backgroundOpacity={subtitleBgOpacity}
            textShadow={subtitleTextShadow}
            outline={subtitleOutline}
            outlineColor={subtitleOutlineColor}
            outlineWidth={subtitleOutlineWidth}
            align={subtitleAlign}
            bottomOffset={subtitleBottomOffset}
            letterSpacing={subtitleLetterSpacing}
            lineHeightMultiplier={subtitleLineHeightMultiplier}
            controlsVisible={showControls}
            controlsFixedOffset={Math.min(Dimensions.get('window').width, Dimensions.get('window').height) >= 768 ? 120 : 100}
          />

          {/* Volume Overlay */}
          {showVolumeOverlay && (
            <Animated.View
              style={{
                position: 'absolute',
                left: screenDimensions.width / 2 - 60,
                top: screenDimensions.height / 2 - 60,
                opacity: volumeOverlayOpacity,
                zIndex: 1000,
              }}
            >
              <View style={{
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                width: 120,
                height: 120,
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 8,
                elevation: 10,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}>
                <MaterialIcons 
                  name={volume === 0 ? "volume-off" : volume < 0.3 ? "volume-mute" : volume < 0.7 ? "volume-down" : "volume-up"} 
                  size={24} 
                  color={volume === 0 ? "#FF6B6B" : "#FFFFFF"} 
                  style={{ marginBottom: 8 }}
                />
                
                {/* Horizontal Dotted Progress Bar */}
                <View style={{
                  width: 80,
                  height: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  marginBottom: 8,
                }}>
                  {/* Dotted background */}
                  <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 1,
                  }}>
                    {Array.from({ length: 16 }, (_, i) => (
                      <View
                        key={i}
                        style={{
                          width: 1.5,
                          height: 1.5,
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          borderRadius: 0.75,
                        }}
                      />
                    ))}
                  </View>
                  
                  {/* Progress fill */}
                  <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${volume * 100}%`,
                    height: 6,
                    backgroundColor: volume === 0 ? '#FF6B6B' : '#E50914',
                    borderRadius: 3,
                    shadowColor: volume === 0 ? '#FF6B6B' : '#E50914',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.6,
                    shadowRadius: 2,
                  }} />
                </View>
                
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 0.5,
                }}>
                  {Math.round(volume * 100)}%
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Brightness Overlay */}
          {showBrightnessOverlay && (
            <Animated.View
              style={{
                position: 'absolute',
                left: screenDimensions.width / 2 - 60,
                top: screenDimensions.height / 2 - 60,
                opacity: brightnessOverlayOpacity,
                zIndex: 1000,
              }}
            >
              <View style={{
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                width: 120,
                height: 120,
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 8,
                elevation: 10,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}>
                <MaterialIcons 
                  name={brightness < 0.2 ? "brightness-low" : brightness < 0.5 ? "brightness-medium" : brightness < 0.8 ? "brightness-high" : "brightness-auto"} 
                  size={24} 
                  color={brightness < 0.2 ? "#FFD700" : "#FFFFFF"} 
                  style={{ marginBottom: 8 }}
                />
                
                {/* Horizontal Dotted Progress Bar */}
                <View style={{
                  width: 80,
                  height: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  marginBottom: 8,
                }}>
                  {/* Dotted background */}
                  <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 1,
                  }}>
                    {Array.from({ length: 16 }, (_, i) => (
                      <View
                        key={i}
                        style={{
                          width: 1.5,
                          height: 1.5,
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          borderRadius: 0.75,
                        }}
                      />
                    ))}
                  </View>
                  
                  {/* Progress fill */}
                  <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${brightness * 100}%`,
                    height: 6,
                    backgroundColor: brightness < 0.2 ? '#FFD700' : '#FFA500',
                    borderRadius: 3,
                    shadowColor: brightness < 0.2 ? '#FFD700' : '#FFA500',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.6,
                    shadowRadius: 2,
                  }} />
                </View>
                
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 0.5,
                }}>
                  {Math.round(brightness * 100)}%
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Resume overlay removed when AlwaysResume is enabled; overlay component omitted */}
        </View> 
      </Animated.View>

      <AudioTrackModal
        showAudioModal={showAudioModal}
        setShowAudioModal={setShowAudioModal}
        vlcAudioTracks={rnVideoAudioTracks}
        selectedAudioTrack={selectedAudioTrack}
        selectAudioTrack={selectAudioTrack}
      />
      <SubtitleModals
        showSubtitleModal={showSubtitleModal}
        setShowSubtitleModal={setShowSubtitleModal}
        showSubtitleLanguageModal={showSubtitleLanguageModal}
        setShowSubtitleLanguageModal={setShowSubtitleLanguageModal}
        isLoadingSubtitleList={isLoadingSubtitleList}
        isLoadingSubtitles={isLoadingSubtitles}
        customSubtitles={customSubtitles}
        availableSubtitles={availableSubtitles}
        vlcTextTracks={rnVideoTextTracks}
        selectedTextTrack={selectedTextTrack}
        useCustomSubtitles={useCustomSubtitles}
        subtitleSize={subtitleSize}
        subtitleBackground={subtitleBackground}
        fetchAvailableSubtitles={fetchAvailableSubtitles}
        loadWyzieSubtitle={loadWyzieSubtitle}
        selectTextTrack={selectTextTrack}
        increaseSubtitleSize={increaseSubtitleSize}
        decreaseSubtitleSize={decreaseSubtitleSize}
        toggleSubtitleBackground={toggleSubtitleBackground}
        subtitleTextColor={subtitleTextColor}
        setSubtitleTextColor={setSubtitleTextColor}
        subtitleBgOpacity={subtitleBgOpacity}
        setSubtitleBgOpacity={setSubtitleBgOpacity}
        subtitleTextShadow={subtitleTextShadow}
        setSubtitleTextShadow={setSubtitleTextShadow}
        subtitleOutline={subtitleOutline}
        setSubtitleOutline={setSubtitleOutline}
        subtitleOutlineColor={subtitleOutlineColor}
        setSubtitleOutlineColor={setSubtitleOutlineColor}
        subtitleOutlineWidth={subtitleOutlineWidth}
        setSubtitleOutlineWidth={setSubtitleOutlineWidth}
        subtitleAlign={subtitleAlign}
        setSubtitleAlign={setSubtitleAlign}
        subtitleBottomOffset={subtitleBottomOffset}
        setSubtitleBottomOffset={setSubtitleBottomOffset}
        subtitleLetterSpacing={subtitleLetterSpacing}
        setSubtitleLetterSpacing={setSubtitleLetterSpacing}
        subtitleLineHeightMultiplier={subtitleLineHeightMultiplier}
        setSubtitleLineHeightMultiplier={setSubtitleLineHeightMultiplier}
        subtitleOffsetSec={subtitleOffsetSec}
        setSubtitleOffsetSec={setSubtitleOffsetSec}
      />
      
      <SourcesModal
        showSourcesModal={showSourcesModal}
        setShowSourcesModal={setShowSourcesModal}
        availableStreams={availableStreams}
        currentStreamUrl={currentStreamUrl}
        onSelectStream={handleSelectStream}
        isChangingSource={isChangingSource}
      />
      
      {/* Error Modal */}
      {isMounted.current && (
        <Modal
          visible={showErrorModal}
          transparent
          animationType="fade"
          onRequestClose={handleErrorExit}
          supportedOrientations={['landscape', 'portrait']}
          statusBarTranslucent={true}
        >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)'
        }}>
          <View style={{
            backgroundColor: '#1a1a1a',
            borderRadius: 14,
            width: '85%',
            maxHeight: '70%',
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 5,
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <MaterialIcons name="error" size={24} color="#ff4444" style={{ marginRight: 8 }} />
              <Text style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: '#ffffff',
                flex: 1
              }}>Playback Error</Text>
              <TouchableOpacity onPress={handleErrorExit}>
                <MaterialIcons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            
            <Text style={{
              fontSize: 14,
              color: '#cccccc',
              marginBottom: 16,
              lineHeight: 20
            }}>The video player encountered an error and cannot continue playback:</Text>
            
            <View style={{
              backgroundColor: '#2a2a2a',
              borderRadius: 8,
              padding: 12,
              marginBottom: 20,
              maxHeight: 200
            }}>
              <Text style={{
                fontSize: 12,
                color: '#ff8888',
                fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
              }}>{errorDetails}</Text>
            </View>
            
            <View style={{
              flexDirection: 'row',
              justifyContent: 'flex-end'
            }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#ff4444',
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 20
                }}
                onPress={handleErrorExit}
              >
                <Text style={{
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: 16
                }}>Exit Player</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={{
              fontSize: 12,
              color: '#888888',
              textAlign: 'center',
              marginTop: 12
            }}>This dialog will auto-close in 5 seconds</Text>
          </View>
        </View>
        </Modal>
      )}
    </View> 
  );
};

export default AndroidVideoPlayer;