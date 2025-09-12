import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, TouchableOpacity, Dimensions, Animated, ActivityIndicator, Platform, NativeModules, StatusBar, Text, Image, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList, RootStackNavigationProp } from '../../navigation/AppNavigator';
import { PinchGestureHandler, PanGestureHandler, TapGestureHandler, State, PinchGestureHandlerGestureEvent, PanGestureHandlerGestureEvent, TapGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import RNImmersiveMode from 'react-native-immersive-mode';
import * as ScreenOrientation from 'expo-screen-orientation';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import AndroidVideoPlayer from './AndroidVideoPlayer';
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
import axios from 'axios';
import { stremioService } from '../../services/stremioService';
import * as Brightness from 'expo-brightness';

const VideoPlayer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const { streamProvider, uri, headers, forceVlc } = route.params as any;
  
  // Check if the stream is from Xprime
  const isXprimeStream = streamProvider === 'xprime' || streamProvider === 'Xprime';
  
  // Check if the file format is MKV
  const lowerUri = (uri || '').toLowerCase();
  const contentType = (headers && (headers['Content-Type'] || headers['content-type'])) || '';
  const isMkvByHeader = typeof contentType === 'string' && contentType.includes('matroska');
  const isMkvByPath = lowerUri.includes('.mkv') || /[?&]ext=mkv\b/.test(lowerUri) || /format=mkv\b/.test(lowerUri) || /container=mkv\b/.test(lowerUri);
  const isMkvFile = Boolean(isMkvByHeader || isMkvByPath);
  
  // Use AndroidVideoPlayer for:
  // - Android devices
  // - Xprime streams on any platform
  // - Non-MKV files on iOS (unless forceVlc is set)
  const shouldUseAndroidPlayer = Platform.OS === 'android' || isXprimeStream || (Platform.OS === 'ios' && !isMkvFile && !forceVlc);
  if (__DEV__) {
    logger.log('[VideoPlayer] Player selection:', {
      platform: Platform.OS,
      isXprimeStream,
      isMkvFile,
      forceVlc: !!forceVlc,
      selected: shouldUseAndroidPlayer ? 'AndroidVideoPlayer' : 'VLCPlayer',
      streamProvider,
      uri
    });
  }
  if (shouldUseAndroidPlayer) {
    return <AndroidVideoPlayer />;
  }

  const navigation = useNavigation<RootStackNavigationProp>();

  const {
    title = 'Episode Name',
    season,
    episode,
    episodeTitle,
    quality,
    year,
    streamName,
    id,
    type,
    episodeId,
    imdbId,
    availableStreams: passedAvailableStreams,
    backdrop
  } = route.params;

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

  // App settings
  const { settings: appSettings } = useSettings();

  safeDebugLog("Component mounted with props", {
    uri, title, season, episode, episodeTitle, quality, year,
    streamProvider, id, type, episodeId, imdbId
  });

  const screenData = Dimensions.get('screen');
  const [screenDimensions, setScreenDimensions] = useState(screenData);

  // iPad-specific fullscreen handling
  const isIPad = Platform.OS === 'ios' && (screenData.width > 1000 || screenData.height > 1000);
  const shouldUseFullscreen = isIPad;

  // Use window dimensions for iPad instead of screen dimensions
  const windowData = Dimensions.get('window');
  const effectiveDimensions = shouldUseFullscreen ? windowData : screenData;

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('stretch');
  const [buffered, setBuffered] = useState(0);
  const [seekPosition, setSeekPosition] = useState<number | null>(null);
  const vlcRef = useRef<any>(null);
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
  const [vlcAudioTracks, setVlcAudioTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);
  const [vlcTextTracks, setVlcTextTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);
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
  const [subtitleSize, setSubtitleSize] = useState<number>(DEFAULT_SUBTITLE_SIZE);
  const [subtitleBackground, setSubtitleBackground] = useState<boolean>(true);
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
  const [isChangingSource, setIsChangingSource] = useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pendingSeek, setPendingSeek] = useState<{ position: number; shouldPlay: boolean } | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string | undefined>(quality);
  const [currentStreamProvider, setCurrentStreamProvider] = useState<string | undefined>(streamProvider);
  const [currentStreamName, setCurrentStreamName] = useState<string | undefined>(streamName);
  const isMounted = useRef(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isSyncingBeforeClose, setIsSyncingBeforeClose] = useState(false);

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

  // Volume and brightness controls
  const [volume, setVolume] = useState(100); // VLC uses 0-100 range
  const [brightness, setBrightness] = useState(1.0);
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const [showBrightnessOverlay, setShowBrightnessOverlay] = useState(false);
  const [showVlcVolumeWarning, setShowVlcVolumeWarning] = useState(false);
  const [hasShownVlcWarning, setHasShownVlcWarning] = useState(false);

  // Load VLC warning state from storage
  useEffect(() => {
    const loadWarningState = async () => {
      try {
        const warningShown = await AsyncStorage.getItem('vlc_volume_warning_shown');
        if (warningShown === 'true') {
          setHasShownVlcWarning(true);
        }
      } catch (error) {
        // Ignore storage errors
      }
    };
    loadWarningState();
  }, []);
  const volumeOverlayOpacity = useRef(new Animated.Value(0)).current;
  const brightnessOverlayOpacity = useRef(new Animated.Value(0)).current;
  const volumeOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const brightnessOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastVolumeChange = useRef<number>(0);
  const lastBrightnessChange = useRef<number>(0);

  // Get metadata to access logo (only if we have a valid id)
  const shouldLoadMetadata = Boolean(id && type);
  const metadataResult = useMetadata({
    id: id || 'placeholder',
    type: type || 'movie'
  });
  const { metadata, loading: metadataLoading, groupedEpisodes, cast, loadCast } = shouldLoadMetadata ? (metadataResult as any) : { metadata: null, loading: false, groupedEpisodes: {}, cast: [], loadCast: () => {} };
  const { settings } = useSettings();

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
      if (type !== 'series') return '';
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
      if (type !== 'series' || !season || !episode) return null;
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
      if (__DEV__) logger.log(`[VideoPlayer] Center Zoom: ${newScale.toFixed(2)}x`);
    }
  };

  const onPinchHandlerStateChange = (event: PinchGestureHandlerGestureEvent) => {
    if (event.nativeEvent.state === State.END) {
      setLastZoomScale(zoomScale);
      if (DEBUG_MODE) {
        if (__DEV__) logger.log(`[VideoPlayer] Pinch ended - saved scale: ${zoomScale.toFixed(2)}x`);
      }
    }
  };

  const resetZoom = () => {
    const targetZoom = is16by9Content ? 1.1 : 1;
    setZoomScale(targetZoom);
    setLastZoomScale(targetZoom);
    if (DEBUG_MODE) {
      if (__DEV__) logger.log(`[VideoPlayer] Zoom reset to ${targetZoom}x (16:9: ${is16by9Content})`);
    }
  };

  // Volume gesture handler (right side of screen)
  const onVolumeGestureEvent = async (event: PanGestureHandlerGestureEvent) => {
    const { translationY, state } = event.nativeEvent;

    if (state === State.ACTIVE) {
      // Show VLC volume warning only once per session
      if (!showVlcVolumeWarning && !hasShownVlcWarning) {
        setShowVlcVolumeWarning(true);
        setHasShownVlcWarning(true);

        // Save to storage that warning has been shown
        AsyncStorage.setItem('vlc_volume_warning_shown', 'true').catch(() => {});

        // Hide warning after 4 seconds
        setTimeout(() => {
          setShowVlcVolumeWarning(false);
        }, 4000);
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
            logger.log(`[VideoPlayer] Device brightness set to: ${newBrightness}`);
          }
        } catch (error) {
          logger.warn('[VideoPlayer] Error setting device brightness:', error);
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

  useEffect(() => {
    if (videoAspectRatio && effectiveDimensions.width > 0 && effectiveDimensions.height > 0) {
      const styles = calculateVideoStyles(
        videoAspectRatio * 1000,
        1000,
        effectiveDimensions.width,
        effectiveDimensions.height
      );
      setCustomVideoStyles(styles);
      if (DEBUG_MODE) {
        if (__DEV__) logger.log(`[VideoPlayer] Screen dimensions changed, recalculated styles:`, styles);
      }
    }
  }, [effectiveDimensions, videoAspectRatio]);

  // Force landscape orientation immediately when component mounts
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        if (__DEV__) logger.log('[VideoPlayer] Locked to landscape orientation');
      } catch (error) {
        logger.warn('[VideoPlayer] Failed to lock orientation:', error);
      }
    };

    // Lock orientation immediately
    lockOrientation();

    return () => {
      // Do not unlock orientation here; we unlock explicitly on close to avoid mid-transition flips
    };
  }, []);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenDimensions(screen);
    });
    const initializePlayer = async () => {
      StatusBar.setHidden(true, 'none');
      enableImmersiveMode();
      startOpeningAnimation();
      
      // Initialize current volume and brightness levels
      // Volume starts at 100 (full volume) for VLC
      setVolume(100);
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Initial volume: 100 (VLC native)`);
      }
      
      try {
        const currentBrightness = await Brightness.getBrightnessAsync();
        setBrightness(currentBrightness);
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Initial brightness: ${currentBrightness}`);
        }
      } catch (error) {
        logger.warn('[VideoPlayer] Error getting initial brightness:', error);
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
      setTimeout(() => {
        backgroundFadeAnim.setValue(0);
      }, 100);
    });
  };

  useEffect(() => {
    const loadWatchProgress = async () => {
      if (id && type) {
        try {
          if (__DEV__) {
            logger.log(`[VideoPlayer] Loading watch progress for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
          }
          const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
          if (__DEV__) {
            logger.log(`[VideoPlayer] Saved progress:`, savedProgress);
          }

          if (savedProgress) {
            const progressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
            if (__DEV__) logger.log(`[VideoPlayer] Progress: ${progressPercent.toFixed(1)}% (${savedProgress.currentTime}/${savedProgress.duration})`);

            if (progressPercent < 85) {
              setResumePosition(savedProgress.currentTime);
              setSavedDuration(savedProgress.duration);
              if (__DEV__) logger.log(`[VideoPlayer] Set resume position to: ${savedProgress.currentTime} of ${savedProgress.duration}`);
              if (appSettings.alwaysResume) {
                // Only prepare auto-resume state and seek when AlwaysResume is enabled
                setInitialPosition(savedProgress.currentTime);
                initialSeekTargetRef.current = savedProgress.currentTime;
                if (__DEV__) logger.log(`[VideoPlayer] AlwaysResume enabled. Auto-seeking to ${savedProgress.currentTime}`);
                // Seek immediately after load
                seekToTime(savedProgress.currentTime);
              } else {
                // Do not set initialPosition; start from beginning with no auto-seek
                setShowResumeOverlay(true);
                if (__DEV__) logger.log(`[VideoPlayer] AlwaysResume disabled. Not auto-seeking; overlay shown (if enabled)`);
              }
            } else {
              if (__DEV__) logger.log(`[VideoPlayer] Progress too high (${progressPercent.toFixed(1)}%), not showing resume overlay`);
            }
          } else {
            logger.log(`[VideoPlayer] No saved progress found`);
          }
        } catch (error) {
          logger.error('[VideoPlayer] Error loading watch progress:', error);
        }
      } else {
        if (__DEV__) logger.log(`[VideoPlayer] Missing id or type: id=${id}, type=${type}`);
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
        logger.error('[VideoPlayer] Error saving watch progress:', error);
      }
    }
  };

  useEffect(() => {
    if (id && type && !paused && duration > 0) {
      if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
      }

      const syncInterval = 20000; // 20s to further reduce CPU load

      const interval = setInterval(() => {
        saveWatchProgress();
      }, syncInterval);

      setProgressSaveInterval(interval);
      return () => {
        clearInterval(interval);
        setProgressSaveInterval(null);
      };
    }
  }, [id, type, paused, duration]);

  useEffect(() => {
    return () => {
      if (id && type && duration > 0) {
        saveWatchProgress();
        // Final Trakt sync on component unmount
        traktAutosync.handlePlaybackEnd(currentTime, duration, 'unmount');
      }
    };
  }, [id, type, currentTime, duration]);

  const onPlaying = () => {
    if (isMounted.current && !isSeeking.current) {
      setPaused(false);

      // Note: handlePlaybackStart is already called in onLoad
      // We don't need to call it again here to avoid duplicate calls
    }
  };

  const onPaused = () => {
    if (isMounted.current) {
      setPaused(true);

      // Send a forced pause update to Trakt immediately when user pauses
      if (duration > 0) {
        traktAutosync.handleProgressUpdate(currentTime, duration, true);
      }
    }
  };

  const seekToTime = (rawSeconds: number) => {
    // Clamp to just before the end to avoid triggering onEnd.
    const timeInSeconds = Math.max(0, Math.min(rawSeconds, duration > 0 ? duration - END_EPSILON : rawSeconds));
    if (vlcRef.current && duration > 0 && !isSeeking.current) {
      if (DEBUG_MODE) {
        if (__DEV__) logger.log(`[VideoPlayer] Seeking to ${timeInSeconds.toFixed(2)}s out of ${duration.toFixed(2)}s`);
      }

      isSeeking.current = true;

      // For Android, use direct seeking on VLC player ref instead of seek prop
      if (Platform.OS === 'android' && vlcRef.current.seek) {
        // Calculate position as fraction
        const position = timeInSeconds / duration;
        vlcRef.current.seek(position);
        // Clear seek state after Android seek
        setTimeout(() => {
          if (isMounted.current) {
            isSeeking.current = false;
            if (DEBUG_MODE) {
              logger.log(`[VideoPlayer] Android seek completed to ${timeInSeconds.toFixed(2)}s`);
            }
          }
        }, 500);
      } else {
        // iOS (and other platforms) – prefer direct seek on the ref to avoid re-mounts caused by the `seek` prop
        const position = timeInSeconds / duration; // VLC expects a 0-1 fraction
        if (vlcRef.current && typeof vlcRef.current.seek === 'function') {
          vlcRef.current.seek(position);
        } else {
          // Fallback to legacy behaviour only if direct seek is unavailable
          setSeekPosition(position);
        }

        setTimeout(() => {
          if (isMounted.current) {
            // Reset temporary seek state
            setSeekPosition(null);
            isSeeking.current = false;
            if (DEBUG_MODE) {
              logger.log(`[VideoPlayer] iOS seek completed to ${timeInSeconds.toFixed(2)}s`);
            }
          }
        }, 500);
      }
    } else {
      if (DEBUG_MODE) {
        logger.error(`[VideoPlayer] Seek failed: vlcRef=${!!vlcRef.current}, duration=${duration}, seeking=${isSeeking.current}`);
      }
    }
  };

  // Slider callback functions for React Native Community Slider
  const handleSliderValueChange = (value: number) => {
    if (isDragging && duration > 0) {
      const seekTime = Math.min(value, duration - END_EPSILON);
      setCurrentTime(seekTime);
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
  };

  const handleSlidingComplete = (value: number) => {
    setIsDragging(false);
    if (duration > 0) {
      const seekTime = Math.min(value, duration - END_EPSILON);
      seekToTime(seekTime);
      pendingSeekValue.current = null;
    }
    // Restart auto-hide timer after interaction finishes
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
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

  const handleProgress = (event: any) => {
    if (isDragging || isSeeking.current) return;

    const currentTimeInSeconds = event.currentTime / 1000;

    // Only update if there's a significant change to avoid unnecessary updates
    if (Math.abs(currentTimeInSeconds - currentTime) > 0.5) {
      safeSetState(() => setCurrentTime(currentTimeInSeconds));
      // Removed progressAnim animation - no longer needed with React Native Community Slider
      const bufferedTime = event.bufferTime / 1000 || currentTimeInSeconds;
      safeSetState(() => setBuffered(bufferedTime));
    }
  };

  const onLoad = (data: any) => {
    try {
      if (DEBUG_MODE) {
        logger.log('[VideoPlayer] Video loaded:', data);
      }
      if (!isMounted.current) {
        logger.warn('[VideoPlayer] Component unmounted, skipping onLoad');
        return;
      }
      if (!data) {
        logger.error('[VideoPlayer] onLoad called with null/undefined data');
        return;
      }
      const videoDuration = data.duration / 1000;
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
      // Set aspect ratio with null check for videoSize
      if (data.videoSize && data.videoSize.width && data.videoSize.height) {
        setVideoAspectRatio(data.videoSize.width / data.videoSize.height);
      } else {
        // Fallback to 16:9 aspect ratio if videoSize is not available
        setVideoAspectRatio(16 / 9);
        logger.warn('[VideoPlayer] videoSize not available, using default 16:9 aspect ratio');
      }

      if (data.audioTracks && data.audioTracks.length > 0) {
        const formattedAudioTracks = data.audioTracks.map((track: any, index: number) => {
          const trackIndex = track.index !== undefined ? track.index : index;
          const trackName = track.title || track.language || `Audio ${index + 1}`;
          const trackLanguage = track.language || 'Unknown';
          
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Audio track ${index}: index=${trackIndex}, name="${trackName}", language="${trackLanguage}"`);
          }
          
          return {
            id: trackIndex, // Use the actual track index from VLC
            name: trackName,
            language: trackLanguage,
          };
        });
        setVlcAudioTracks(formattedAudioTracks);
        
        // Auto-select the first audio track if none is selected
        if (selectedAudioTrack === null && formattedAudioTracks.length > 0) {
          const firstTrack = formattedAudioTracks[0];
          setSelectedAudioTrack(firstTrack.id);
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Auto-selected first audio track: ${firstTrack.name} (ID: ${firstTrack.id})`);
          }
        }
        
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Formatted audio tracks:`, formattedAudioTracks);
        }
      }
      if (data.textTracks && data.textTracks.length > 0) {
        setVlcTextTracks(data.textTracks);
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
        logger.log(`[VideoPlayer] Seeking to initial position: ${initialPosition}s (duration: ${videoDuration}s)`);
        // Reduced timeout from 1000ms to 500ms
        setTimeout(() => {
          if (vlcRef.current && videoDuration > 0 && isMounted.current) {
            seekToTime(initialPosition);
            setIsInitialSeekComplete(true);
            logger.log(`[VideoPlayer] Initial seek completed to: ${initialPosition}s`);
          } else {
            logger.error(`[VideoPlayer] Initial seek failed: vlcRef=${!!vlcRef.current}, duration=${videoDuration}, mounted=${isMounted.current}`);
          }
        }, 500);
      }
      
      controlsTimeout.current = setTimeout(hideControls, 5000);
    } catch (error) {
      logger.error('[VideoPlayer] Error in onLoad:', error);
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
    if (vlcRef.current) {
      const newTime = Math.max(0, Math.min(currentTime + seconds, duration - END_EPSILON));
      seekToTime(newTime);
    }
  };

  const onAudioTracks = (data: { audioTracks: AudioTrack[] }) => {
    setAudioTracks(data.audioTracks || []);
  };

  const onTextTracks = (e: Readonly<{ textTracks: TextTrack[] }>) => {
    setTextTracks(e.textTracks || []);
  };

  const cycleAspectRatio = () => {
    const newZoom = zoomScale === 1.1 ? 1 : 1.1;
    setZoomScale(newZoom);
    setZoomTranslateX(0);
    setZoomTranslateY(0);
    setLastZoomScale(newZoom);
    setLastTranslateX(0);
    setLastTranslateY(0);
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
      logger.log('[VideoPlayer] Close already in progress, ignoring duplicate call');
      return;
    }

    logger.log('[VideoPlayer] Close button pressed - closing immediately and syncing to Trakt in background');
    setIsSyncingBeforeClose(true);

    // Make sure we have the most accurate current time
    const actualCurrentTime = currentTime;
    const progressPercent = duration > 0 ? (actualCurrentTime / duration) * 100 : 0;

    logger.log(`[VideoPlayer] Current progress: ${actualCurrentTime}/${duration} (${progressPercent.toFixed(1)}%)`);

    // Cleanup and navigate back immediately without delay
    const cleanup = async () => {
      try {
        // Unlock orientation first
        await ScreenOrientation.unlockAsync();
        logger.log('[VideoPlayer] Orientation unlocked');
      } catch (orientationError) {
        logger.warn('[VideoPlayer] Failed to unlock orientation:', orientationError);
      }

      // On iOS tablets, keep rotation unlocked; on phones, return to portrait
      if (Platform.OS === 'ios') {
        const { width: dw, height: dh } = Dimensions.get('window');
        const isTablet = (Platform as any).isPad === true || Math.min(dw, dh) >= 768;
        setTimeout(() => {
          if (isTablet) {
            ScreenOrientation.unlockAsync().catch(() => {});
          } else {
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
          }
        }, 50);
      }

      // Disable immersive mode
      disableImmersiveMode();

      // Navigate back to previous screen (StreamsScreen expected to be below Player)
      try {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          // Fallback: navigate to Streams if stack was not set as expected
          (navigation as any).navigate('Streams', { id, type, episodeId, fromPlayer: true });
        }
        logger.log('[VideoPlayer] Navigation completed');
      } catch (navError) {
        logger.error('[VideoPlayer] Navigation error:', navError);
        // Last resort: try to navigate to Streams
        (navigation as any).navigate('Streams', { id, type, episodeId, fromPlayer: true });
      }
    };

    // Navigate immediately
    cleanup();

    // Send Trakt sync in background (don't await)
    const backgroundSync = async () => {
      try {
        logger.log('[VideoPlayer] Starting background Trakt sync');
        // Force one last progress update (scrobble/pause) with the exact time
        await traktAutosync.handleProgressUpdate(actualCurrentTime, duration, true);
        
        // Sync progress to Trakt
        await traktAutosync.handlePlaybackEnd(actualCurrentTime, duration, 'unmount');
        
        logger.log('[VideoPlayer] Background Trakt sync completed successfully');
      } catch (error) {
        logger.error('[VideoPlayer] Error in background Trakt sync:', error);
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
    logger.error('[VideoPlayer] Playback Error:', error);
    
    // Format error details for user display
    let errorMessage = 'An unknown error occurred';
    if (error) {
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.error && error.error.message) {
        errorMessage = error.error.message;
      } else if (error.code) {
        errorMessage = `Error Code: ${error.code}`;
      } else {
        errorMessage = JSON.stringify(error, null, 2);
      }
    }
    
    setErrorDetails(errorMessage);
    setShowErrorModal(true);
    
    // Clear any existing timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    
    // Auto-exit after 5 seconds if user doesn't dismiss
    errorTimeoutRef.current = setTimeout(() => {
      handleErrorExit();
    }, 5000);
  };
  
  const handleErrorExit = () => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    setShowErrorModal(false);
    handleClose();
  };

  const onBuffering = (event: any) => {
    setIsBuffering(event.isBuffering);
  };

  const onEnd = async () => {
    // Make sure we report 100% progress to Trakt
    const finalTime = duration;
    setCurrentTime(finalTime);

    try {
      // Force one last progress update (scrobble/pause) with the exact final time
      logger.log('[VideoPlayer] Video ended naturally, sending final progress update with 100%');
      await traktAutosync.handleProgressUpdate(finalTime, duration, true);

      // IMMEDIATE SYNC: Remove delay for instant sync
      // Now send the stop call immediately
      logger.log('[VideoPlayer] Sending final stop call after natural end');
      await traktAutosync.handlePlaybackEnd(finalTime, duration, 'ended');

      logger.log('[VideoPlayer] Completed video end sync to Trakt');
    } catch (error) {
      logger.error('[VideoPlayer] Error syncing to Trakt on video end:', error);
    }
  };

  const selectAudioTrack = (trackId: number) => {
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Selecting audio track: ${trackId}`);
      logger.log(`[VideoPlayer] Available tracks:`, vlcAudioTracks);
    }
    
    // Validate that the track exists
    const trackExists = vlcAudioTracks.some(track => track.id === trackId);
    if (!trackExists) {
      logger.error(`[VideoPlayer] Audio track ${trackId} not found in available tracks`);
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
      logger.log(`[VideoPlayer] Audio track changed to: ${trackId}`);
    }
    
    // Resume playback after a brief delay if it was playing
    if (wasPlaying) {
      setTimeout(() => {
        if (isMounted.current) {
          setPaused(false);
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Resumed playback after audio track change`);
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
      logger.error('[VideoPlayer] Error loading subtitle size:', error);
    }
  };

  const saveSubtitleSize = async (size: number) => {
    try {
      await AsyncStorage.setItem(SUBTITLE_SIZE_KEY, size.toString());
      setSubtitleSize(size);
    } catch (error) {
      logger.error('[VideoPlayer] Error saving subtitle size:', error);
    }
  };

  const fetchAvailableSubtitles = async (imdbIdParam?: string, autoSelectEnglish = true) => {
    const targetImdbId = imdbIdParam || imdbId;
    if (!targetImdbId) {
      logger.error('[VideoPlayer] No IMDb ID available for subtitle search');
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
      logger.error('[VideoPlayer] Error fetching subtitles from OpenSubtitles addon:', error);
    } finally {
      setIsLoadingSubtitleList(false);
    }
  };

  const loadWyzieSubtitle = async (subtitle: WyzieSubtitle) => {
    logger.log(`[VideoPlayer] Subtitle click received: id=${subtitle.id}, lang=${subtitle.language}, url=${subtitle.url}`);
    setShowSubtitleLanguageModal(false);
    setIsLoadingSubtitles(true);
    try {
      logger.log('[VideoPlayer] Fetching subtitle SRT start');
      let srtContent = '';
      try {
        const axiosResp = await axios.get(subtitle.url, {
          timeout: 10000,
          headers: {
            'Accept': 'text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Nuvio/1.0'
          },
          responseType: 'text',
          transitional: { clarifyTimeoutError: true }
        });
        srtContent = typeof axiosResp.data === 'string' ? axiosResp.data : String(axiosResp.data || '');
      } catch (axiosErr: any) {
        logger.warn('[VideoPlayer] Axios subtitle fetch failed, falling back to fetch()', {
          message: axiosErr?.message,
          code: axiosErr?.code
        });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const resp = await fetch(subtitle.url, { signal: controller.signal });
          srtContent = await resp.text();
        } finally {
          clearTimeout(timeoutId);
        }
      }
      logger.log(`[VideoPlayer] Fetching subtitle SRT done, size=${srtContent.length}`);
      const parsedCues = parseSRT(srtContent);
      logger.log(`[VideoPlayer] Parsed cues count=${parsedCues.length}`);

      // For VLC on iOS: stop spinner early, then clear-apply and micro-seek nudge
      setIsLoadingSubtitles(false);
      logger.log('[VideoPlayer] isLoadingSubtitles -> false (early)');

      // Clear existing state
      setUseCustomSubtitles(false);
      logger.log('[VideoPlayer] useCustomSubtitles -> false');
      setCustomSubtitles([]);
      logger.log('[VideoPlayer] customSubtitles -> []');
      setSelectedTextTrack(-1);
      logger.log('[VideoPlayer] selectedTextTrack -> -1');

      // Apply immediately
      setCustomSubtitles(parsedCues);
      logger.log('[VideoPlayer] customSubtitles <- parsedCues');
      setUseCustomSubtitles(true);
      logger.log('[VideoPlayer] useCustomSubtitles -> true');
      setSelectedTextTrack(-1);
      logger.log('[VideoPlayer] selectedTextTrack -> -1 (disable native while using custom)');

      // Immediately set current subtitle text
      try {
        const adjustedTime = currentTime + (subtitleOffsetSec || 0);
        const cueNow = parsedCues.find(cue => adjustedTime >= cue.start && adjustedTime <= cue.end);
        const textNow = cueNow ? cueNow.text : '';
        setCurrentSubtitle(textNow);
        logger.log('[VideoPlayer] currentSubtitle set immediately after apply');
      } catch (e) {
        logger.error('[VideoPlayer] Error setting immediate subtitle', e);
      }

      // Removed micro-seek nudge
    } catch (error) {
      logger.error('[VideoPlayer] Error loading Wyzie subtitle:', error);
      setIsLoadingSubtitles(false);
    }
  };

  const togglePlayback = () => {
    if (vlcRef.current) {
      setPaused(!paused);
    }
  };

  // Handle next episode button press
  const handlePlayNextEpisode = useCallback(async () => {
    if (!nextEpisode || !id || isLoadingNextEpisode) return;

    setIsLoadingNextEpisode(true);
    
    try {
      logger.log('[VideoPlayer] Loading next episode:', nextEpisode);
      
      // Create episode ID for next episode using stremioId if available, otherwise construct it
      const nextEpisodeId = nextEpisode.stremioId || `${id}:${nextEpisode.season_number}:${nextEpisode.episode_number}`;
      
      logger.log('[VideoPlayer] Fetching streams for next episode:', nextEpisodeId);
      
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
          
          logger.log('[VideoPlayer] Found stream for next episode:', bestStream);
          
          // Pause current playback to ensure no background player remains active
          setPaused(true);

          // Start navigation immediately but let stream fetching continue in background
          setTimeout(() => {
            navigation.replace('Player', {
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
          logger.warn('[VideoPlayer] No streams found for next episode after checking all providers');
          setIsLoadingNextEpisode(false);
        }
      });
      
      // Fallback timeout in case providers don't respond
      setTimeout(() => {
        if (!streamFound) {
          logger.warn('[VideoPlayer] Timeout: No streams found for next episode');
          setIsLoadingNextEpisode(false);
        }
      }, 8000);
      
    } catch (error) {
      logger.error('[VideoPlayer] Error loading next episode:', error);
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
    if (type !== 'series' || !nextEpisode || duration <= 0) {
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

  useEffect(() => {
    loadSubtitleSize();
  }, []);

  // Handle audio track changes with proper logging
  useEffect(() => {
    if (selectedAudioTrack !== null && vlcAudioTracks.length > 0) {
      const selectedTrack = vlcAudioTracks.find(track => track.id === selectedAudioTrack);
      if (selectedTrack) {
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Audio track selected: ${selectedTrack.name} (${selectedTrack.language}) - ID: ${selectedAudioTrack}`);
        }
      } else {
        logger.warn(`[VideoPlayer] Selected audio track ${selectedAudioTrack} not found in available tracks`);
      }
    }
  }, [selectedAudioTrack, vlcAudioTracks]);

  const increaseSubtitleSize = () => {
    const newSize = Math.min(subtitleSize + 2, 32);
    saveSubtitleSize(newSize);
  };

  const decreaseSubtitleSize = () => {
    const newSize = Math.max(subtitleSize - 2, 8);
    saveSubtitleSize(newSize);
  };

  const toggleSubtitleBackground = () => {
    setSubtitleBackground(prev => !prev);
  };

  useEffect(() => {
    if (pendingSeek && isPlayerReady && isVideoLoaded && duration > 0) {
      logger.log(`[VideoPlayer] Player ready after source change, seeking to position: ${pendingSeek.position}s out of ${duration}s total`);

      if (pendingSeek.position > 0 && vlcRef.current) {
        const delayTime = Platform.OS === 'android' ? 1500 : 1000;

        setTimeout(() => {
          if (vlcRef.current && duration > 0 && pendingSeek) {
            logger.log(`[VideoPlayer] Executing seek to ${pendingSeek.position}s`);

            seekToTime(pendingSeek.position);

            if (pendingSeek.shouldPlay) {
              setTimeout(() => {
                logger.log('[VideoPlayer] Resuming playback after source change seek');
                setPaused(false);
              }, 850); // Delay should be slightly more than seekToTime's internal timeout
            }

            setTimeout(() => {
              setPendingSeek(null);
              setIsChangingSource(false);
            }, 900);
          }
        }, delayTime);
      } else {
        // No seeking needed, just resume playback if it was playing
        if (pendingSeek.shouldPlay) {
          setTimeout(() => {
            logger.log('[VideoPlayer] No seek needed, just resuming playback');
            setPaused(false);
          }, 500);
        }

        setTimeout(() => {
          setPendingSeek(null);
          setIsChangingSource(false);
        }, 600);
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

      logger.log(`[VideoPlayer] Changing source from ${currentStreamUrl} to ${newStream.url}`);
      logger.log(`[VideoPlayer] Saved position: ${savedPosition}, was playing: ${wasPlaying}`);

      // Extract quality and provider information from the new stream
      let newQuality = newStream.quality;
      if (!newQuality && newStream.title) {
        // Try to extract quality from title (e.g., "1080p", "720p")
        const qualityMatch = newStream.title.match(/(\d+)p/);
        newQuality = qualityMatch ? qualityMatch[0] : undefined; // Use [0] to get full match like "1080p"
      }

      // For provider, try multiple fields
      const newProvider = newStream.addonName || newStream.name || newStream.addon || 'Unknown';

      // For stream name, prioritize the stream name over title
      const newStreamName = newStream.name || newStream.title || 'Unknown Stream';

      logger.log(`[VideoPlayer] Stream object:`, newStream);
      logger.log(`[VideoPlayer] Extracted - Quality: ${newQuality}, Provider: ${newProvider}, Stream Name: ${newStreamName}`);
      logger.log(`[VideoPlayer] Available fields - quality: ${newStream.quality}, title: ${newStream.title}, addonName: ${newStream.addonName}, name: ${newStream.name}, addon: ${newStream.addon}`);

      // Stop current playback
      if (vlcRef.current) {
        vlcRef.current.pause && vlcRef.current.pause();
      }
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
      logger.error('[VideoPlayer] Error changing source:', error);
      setPendingSeek(null);
      setIsChangingSource(false);
    }
  };

  useEffect(() => {
    if (isVideoLoaded && initialPosition && !isInitialSeekComplete && duration > 0) {
      logger.log(`[VideoPlayer] Post-load initial seek to: ${initialPosition}s`);
      seekToTime(initialPosition);
      setIsInitialSeekComplete(true);
      // Verify whether the seek actually took effect (detect non-seekable sources)
      if (!initialSeekVerifiedRef.current) {
        initialSeekVerifiedRef.current = true;
        const target = initialSeekTargetRef.current ?? initialPosition;
        setTimeout(() => {
          const delta = Math.abs(currentTime - (target || 0));
          if (target && (currentTime < target - 1.5)) {
            logger.warn(`[VideoPlayer] Initial seek appears ignored (delta=${delta.toFixed(2)}). Treating source as non-seekable; starting from 0`);
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
    <View style={[
      styles.container,
      shouldUseFullscreen ? {
        // iPad fullscreen: use flex layout instead of absolute positioning
        flex: 1,
        width: '100%',
        height: '100%',
      } : {
        // iPhone: use absolute positioning with screen dimensions
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
            {/* Minimal provider/quality indicator under logo (not animated) */}
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
              {/* Minimal provider/quality indicator under spinner */}
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
                <VLCPlayer
                  ref={vlcRef}
                  style={[styles.video, customVideoStyles, { transform: [{ scale: zoomScale }] }]}
                  source={(() => {
                     // FORCEFULLY use headers from route params if available - no filtering or modification
                     const sourceWithHeaders = headers ? {
                       uri: currentStreamUrl,
                       headers: headers
                     } : { uri: currentStreamUrl };
                     
                     return sourceWithHeaders;
                   })()}
                  paused={paused}
                  onProgress={handleProgress}
                  onLoad={onLoad}
                  onEnd={onEnd}
                  onError={handleError}
                  onBuffering={onBuffering}
                  onPlaying={onPlaying}
                  onPaused={onPaused}
                  resizeMode={resizeMode as any}
                  audioTrack={selectedAudioTrack ?? undefined}
                  textTrack={useCustomSubtitles ? -1 : (selectedTextTrack ?? undefined)}
                  autoAspectRatio
                  volume={volume / 100}
                />
              </TouchableOpacity>
            </View>
          </PinchGestureHandler>

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
            vlcAudioTracks={vlcAudioTracks}
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
                    colors={[ 'rgba(0,0,0,0.98)', 'rgba(0,0,0,0.2)' ]}
                    locations={[0, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
                <LinearGradient
                  colors={[
                    'rgba(0,0,0,0.9)',
                    'rgba(0,0,0,0.7)',
                    'rgba(0,0,0,0.4)',
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
                            {type === 'series' ? (currentEpisodeDescription || metadata?.description || '') : (metadata?.description || '')}
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
            controlsFixedOffset={Math.min(Dimensions.get('window').width, Dimensions.get('window').height) >= 768 ? 126 : 106}
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
                  name={volume === 0 ? "volume-off" : volume < 30 ? "volume-mute" : volume < 70 ? "volume-down" : "volume-up"} 
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
                    width: `${volume}%`,
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
                  {Math.round(volume)}%
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

          {/* VLC Volume Warning Overlay */}
          {showVlcVolumeWarning && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 1000,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
              }}
            >
              <View style={{
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                borderRadius: 16,
                padding: 20,
                alignItems: 'center',
                width: Math.min(280, screenDimensions.width * 0.8),
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.6,
                shadowRadius: 12,
                elevation: 15,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}>
                <MaterialIcons
                  name="volume-off"
                  size={28}
                  color="#FF6B6B"
                  style={{ marginBottom: 12 }}
                />

                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '700',
                  textAlign: 'center',
                  marginBottom: 8,
                }}>
                  Volume Control Not Available
                </Text>

                <Text style={{
                  color: '#CCCCCC',
                  fontSize: 13,
                  textAlign: 'center',
                  lineHeight: 18,
                  marginBottom: 12,
                }}>
                  VLC player doesn't support volume gestures.{'\n'}Use your device volume buttons instead.
                </Text>

                <Text style={{
                  color: '#888888',
                  fontSize: 11,
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}>
                  This message won't be shown again
                </Text>
              </View>
            </View>
          )}

          {/* Resume overlay removed when AlwaysResume is enabled; overlay component omitted */}
        </View>
      </Animated.View>

      <AudioTrackModal
        showAudioModal={showAudioModal}
        setShowAudioModal={setShowAudioModal}
        vlcAudioTracks={vlcAudioTracks}
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
        vlcTextTracks={vlcTextTracks}
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
      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        supportedOrientations={["landscape", "landscape-left", "landscape-right", "portrait"]}
        onRequestClose={handleErrorExit}
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
    </View>
  );
};

export default VideoPlayer;