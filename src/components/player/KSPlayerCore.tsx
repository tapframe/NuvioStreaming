import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, TouchableOpacity, Dimensions, Animated, ActivityIndicator, Platform, NativeModules, StatusBar, Text, StyleSheet, Modal, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import FastImage from '@d11/react-native-fast-image';
import { RootStackParamList, RootStackNavigationProp } from '../../navigation/AppNavigator';
import { PinchGestureHandler, PanGestureHandler, TapGestureHandler, LongPressGestureHandler, State, PinchGestureHandlerGestureEvent, PanGestureHandlerGestureEvent, TapGestureHandlerGestureEvent, LongPressGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import RNImmersiveMode from 'react-native-immersive-mode';
import * as ScreenOrientation from 'expo-screen-orientation';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';
import { mmkvStorage } from '../../services/mmkvStorage';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import KSPlayerComponent, { KSPlayerRef, KSPlayerSource } from './KSPlayerComponent';
import { useTraktAutosync } from '../../hooks/useTraktAutosync';
import { useTraktAutosyncSettings } from '../../hooks/useTraktAutosyncSettings';
import { useMetadata } from '../../hooks/useMetadata';
import { useSettings } from '../../hooks/useSettings';
import { usePlayerGestureControls } from '../../hooks/usePlayerGestureControls';

import {
  DEFAULT_SUBTITLE_SIZE,
  getDefaultSubtitleSize,
  AudioTrack,
  TextTrack,
  ResizeModeType,
  WyzieSubtitle,
  SubtitleCue,
  SubtitleSegment,
  RESUME_PREF_KEY,
  RESUME_PREF,
  SUBTITLE_SIZE_KEY
} from './utils/playerTypes';
import { safeDebugLog, parseSRT, DEBUG_MODE, formatTime } from './utils/playerUtils';
import { styles } from './utils/playerStyles';

// Speed settings storage key
const SPEED_SETTINGS_KEY = '@nuvio_speed_settings';
import { SubtitleModals } from './modals/SubtitleModals';
import { AudioTrackModal } from './modals/AudioTrackModal';
import { SpeedModal } from './modals/SpeedModal';
// Removed ResumeOverlay usage when alwaysResume is enabled
import PlayerControls from './controls/PlayerControls';
import CustomSubtitles from './subtitles/CustomSubtitles';
import { SourcesModal } from './modals/SourcesModal';
import UpNextButton from './common/UpNextButton';
import { EpisodesModal } from './modals/EpisodesModal';
import LoadingOverlay from './modals/LoadingOverlay';
import { EpisodeStreamsModal } from './modals/EpisodeStreamsModal';
import { Episode } from '../../types/metadata';
import axios from 'axios';
import { stremioService } from '../../services/stremioService';
import * as Brightness from 'expo-brightness';

const KSPlayerCore: React.FC = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerIOS'>>();
  const { uri, headers, streamProvider } = route.params as any;


  const navigation = useNavigation<RootStackNavigationProp>();

  // KSPlayer is active only on iOS for MKV streams
  const isKsPlayerActive = Platform.OS === 'ios';

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
    backdrop,
    groupedEpisodes
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

  // iPad/macOS-specific fullscreen handling
  const isIPad = Platform.OS === 'ios' && (screenData.width > 1000 || screenData.height > 1000);
  const isMacOS = Platform.OS === 'ios' && Platform.isPad === true;
  const shouldUseFullscreen = isIPad || isMacOS;

  // Use window dimensions for iPad instead of screen dimensions
  const windowData = Dimensions.get('window');
  const effectiveDimensions = shouldUseFullscreen ? windowData : screenData;
  
  // Helper to get appropriate dimensions for gesture areas and overlays
  const getDimensions = () => ({
    width: shouldUseFullscreen ? windowData.width : screenDimensions.width,
    height: shouldUseFullscreen ? windowData.height : screenDimensions.height,
  });

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('contain');
  const [playerBackend, setPlayerBackend] = useState<string>('');
  const [buffered, setBuffered] = useState(0);
  const [seekPosition, setSeekPosition] = useState<number | null>(null);
  const ksPlayerRef = useRef<KSPlayerRef>(null);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
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
  const [shouldHideOpeningOverlay, setShouldHideOpeningOverlay] = useState(false);
  const DISABLE_OPENING_OVERLAY = false; // Enable opening overlay animation
  const openingFadeAnim = useRef(new Animated.Value(0)).current;
  const openingScaleAnim = useRef(new Animated.Value(0.8)).current;
  const backgroundFadeAnim = useRef(new Animated.Value(1)).current;
  const [isBackdropLoaded, setIsBackdropLoaded] = useState(false);
  const backdropImageOpacityAnim = useRef(new Animated.Value(0)).current;

  const [isBuffering, setIsBuffering] = useState(false);
  const [ksAudioTracks, setKsAudioTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);
  const [ksTextTracks, setKsTextTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  // Removed progressAnim and progressBarRef - no longer needed with React Native Community Slider
  const [isDragging, setIsDragging] = useState(false);
  const isSeeking = useRef(false);
  const seekDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekValue = useRef<number | null>(null);
  const lastSeekTime = useRef<number>(0);
  const wasPlayingBeforeDragRef = useRef<boolean>(false);
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
  const [currentFormattedSegments, setCurrentFormattedSegments] = useState<SubtitleSegment[][]>([]);
  const [subtitleSize, setSubtitleSize] = useState<number>(DEFAULT_SUBTITLE_SIZE);
  const [subtitleBackground, setSubtitleBackground] = useState<boolean>(false);
  // External subtitle customization
  const [subtitleTextColor, setSubtitleTextColor] = useState<string>('#FFFFFF');
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState<number>(0.7);
  const [subtitleTextShadow, setSubtitleTextShadow] = useState<boolean>(true);
  const [subtitleOutline, setSubtitleOutline] = useState<boolean>(true);
  const [subtitleOutlineColor, setSubtitleOutlineColor] = useState<string>('#000000');
  const [subtitleOutlineWidth, setSubtitleOutlineWidth] = useState<number>(4);
  const [subtitleAlign, setSubtitleAlign] = useState<'center' | 'left' | 'right'>('center');
  const [subtitleBottomOffset, setSubtitleBottomOffset] = useState<number>(10);
  const [subtitleLetterSpacing, setSubtitleLetterSpacing] = useState<number>(0);
  const [subtitleLineHeightMultiplier, setSubtitleLineHeightMultiplier] = useState<number>(1.2);
  const [subtitleOffsetSec, setSubtitleOffsetSec] = useState<number>(0);
  const [useCustomSubtitles, setUseCustomSubtitles] = useState<boolean>(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState<boolean>(false);
  const [availableSubtitles, setAvailableSubtitles] = useState<WyzieSubtitle[]>([]);
  const [showSubtitleLanguageModal, setShowSubtitleLanguageModal] = useState<boolean>(false);
  const [isLoadingSubtitleList, setIsLoadingSubtitleList] = useState<boolean>(false);
  const [showSourcesModal, setShowSourcesModal] = useState<boolean>(false);
  const [showEpisodesModal, setShowEpisodesModal] = useState(false);
  const [showEpisodeStreamsModal, setShowEpisodeStreamsModal] = useState(false);
  const [selectedEpisodeForStreams, setSelectedEpisodeForStreams] = useState<Episode | null>(null);
  const [availableStreams, setAvailableStreams] = useState<{ [providerId: string]: { streams: any[]; addonName: string } }>(passedAvailableStreams || {});
  // Playback speed controls required by PlayerControls
  const speedOptions = [0.5, 1.0, 1.25, 1.5, 2.0, 2.5];
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  // Hold-to-speed-up feature state
  const [holdToSpeedEnabled, setHoldToSpeedEnabled] = useState(true);
  const [holdToSpeedValue, setHoldToSpeedValue] = useState(2.0);
  const [isSpeedBoosted, setIsSpeedBoosted] = useState(false);
  const [originalSpeed, setOriginalSpeed] = useState<number>(1.0);
  const [showSpeedActivatedOverlay, setShowSpeedActivatedOverlay] = useState(false);
  const speedActivatedOverlayOpacity = useRef(new Animated.Value(0)).current;
  const cyclePlaybackSpeed = useCallback(() => {
    const idx = speedOptions.indexOf(playbackSpeed);
    const nextIdx = (idx + 1) % speedOptions.length;
    setPlaybackSpeed(speedOptions[nextIdx]);
  }, [playbackSpeed, speedOptions]);
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(uri);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string | undefined>(quality);
  const [currentStreamProvider, setCurrentStreamProvider] = useState<string | undefined>(streamProvider);
  const [currentStreamName, setCurrentStreamName] = useState<string | undefined>(streamName);
  const [lastAudioTrackCheck, setLastAudioTrackCheck] = useState<number>(0);
  const [audioTrackFallbackAttempts, setAudioTrackFallbackAttempts] = useState<number>(0);
  const isMounted = useRef(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isSyncingBeforeClose, setIsSyncingBeforeClose] = useState(false);

  // AirPlay state
  const [isAirPlayActive, setIsAirPlayActive] = useState<boolean>(false);
  const [allowsAirPlay, setAllowsAirPlay] = useState<boolean>(true);

  // Silent startup-timeout retry state
  const startupRetryCountRef = useRef(0);
  const startupRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_STARTUP_RETRIES = 3;

  // Pause overlay state
  const [showPauseOverlay, setShowPauseOverlay] = useState(false);
  const pauseOverlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pauseOverlayOpacity = useRef(new Animated.Value(0)).current;
  const pauseOverlayTranslateY = useRef(new Animated.Value(12)).current;
  const metadataOpacity = useRef(new Animated.Value(1)).current;
  const metadataScale = useRef(new Animated.Value(1)).current;

  // Next episode loading state
  const [isLoadingNextEpisode, setIsLoadingNextEpisode] = useState(false);
  const [nextLoadingProvider, setNextLoadingProvider] = useState<string | null>(null);
  const [nextLoadingQuality, setNextLoadingQuality] = useState<string | null>(null);
  const [nextLoadingTitle, setNextLoadingTitle] = useState<string | null>(null);

  // Cast display state
  const [selectedCastMember, setSelectedCastMember] = useState<any>(null);
  const [showCastDetails, setShowCastDetails] = useState(false);
  const castDetailsOpacity = useRef(new Animated.Value(0)).current;
  const castDetailsScale = useRef(new Animated.Value(0.95)).current;

  // Volume and brightness controls
  const [volume, setVolume] = useState(100); // KSPlayer uses 0-100 range
  const [brightness, setBrightness] = useState(1.0);
  const [subtitleSettingsLoaded, setSubtitleSettingsLoaded] = useState(false);

  // Use reusable gesture controls hook
  const gestureControls = usePlayerGestureControls({
    volume,
    setVolume,
    brightness,
    setBrightness,
    volumeRange: { min: 0, max: 100 }, // KSPlayer uses 0-100
    volumeSensitivity: 0.006,
    brightnessSensitivity: 0.004,
    debugMode: DEBUG_MODE,
  });

  // Load speed settings from storage
  const loadSpeedSettings = useCallback(async () => {
    try {
      const saved = await mmkvStorage.getItem(SPEED_SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        if (typeof settings.holdToSpeedEnabled === 'boolean') {
          setHoldToSpeedEnabled(settings.holdToSpeedEnabled);
        }
        if (typeof settings.holdToSpeedValue === 'number') {
          setHoldToSpeedValue(settings.holdToSpeedValue);
        }
      }
    } catch (error) {
      logger.warn('[KSPlayerCore] Error loading speed settings:', error);
    }
  }, []);

  // Save speed settings to storage
  const saveSpeedSettings = useCallback(async () => {
    try {
      const settings = {
        holdToSpeedEnabled,
        holdToSpeedValue,
      };
      await mmkvStorage.setItem(SPEED_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      logger.warn('[KSPlayerCore] Error saving speed settings:', error);
    }
  }, [holdToSpeedEnabled, holdToSpeedValue]);

  // Load speed settings on mount
  useEffect(() => {
    loadSpeedSettings();
  }, [loadSpeedSettings]);

  // Save speed settings when they change
  useEffect(() => {
    saveSpeedSettings();
  }, [saveSpeedSettings]);

  // Get metadata to access logo (only if we have a valid id)
  const shouldLoadMetadata = Boolean(id && type);
  const metadataResult = useMetadata({
    id: id || 'placeholder',
    type: type || 'movie'
  });
  const { metadata, loading: metadataLoading, groupedEpisodes: metadataGroupedEpisodes, cast, loadCast } = shouldLoadMetadata ? (metadataResult as any) : { metadata: null, loading: false, groupedEpisodes: {}, cast: [], loadCast: () => {} };
  const { settings } = useSettings();

  // Logo animation values
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
  const logoOpacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Check if we have a logo to show
  const hasLogo = metadata && metadata.logo && !metadataLoading;

  // Load custom backdrop on mount
  // Prefetch backdrop and title logo for faster loading screen appearance
  useEffect(() => {
    if (backdrop && typeof backdrop === 'string') {
      // Reset loading state
      setIsBackdropLoaded(false);
      backdropImageOpacityAnim.setValue(0);

      // Prefetch the image
      try {
        FastImage.preload([{ uri: backdrop }]);
        // Image prefetch initiated, fade it in smoothly
        setIsBackdropLoaded(true);
        Animated.timing(backdropImageOpacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      } catch (error) {
        // If prefetch fails, still show the image but without animation
        if (__DEV__) logger.warn('[VideoPlayer] Backdrop prefetch failed, showing anyway:', error);
        setIsBackdropLoaded(true);
        backdropImageOpacityAnim.setValue(1);
      }
    } else {
      // No backdrop provided, consider it "loaded"
      setIsBackdropLoaded(true);
      backdropImageOpacityAnim.setValue(0);
    }
  }, [backdrop]);

  useEffect(() => {
    const logoUrl = (metadata && (metadata as any).logo) as string | undefined;
    if (logoUrl && typeof logoUrl === 'string') {
      try {
        FastImage.preload([{ uri: logoUrl }]);
      } catch (error) {
        // Silently ignore logo prefetch errors
      }
    }
  }, [metadata]);
  
  // Log video source configuration with headers
  useEffect(() => {
    console.log('[KSPlayerCore] Video source configured with:', {
      uri: currentStreamUrl,
      hasHeaders: !!(headers && Object.keys(headers).length > 0),
      headers: headers && Object.keys(headers).length > 0 ? headers : undefined
    });
  }, [currentStreamUrl, headers]);
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

  // Find next episode for series (fallback to metadataGroupedEpisodes when needed)
  const nextEpisode = useMemo(() => {
    try {
      if (type !== 'series' || !season || !episode) return null;
      const sourceGroups = groupedEpisodes && Object.keys(groupedEpisodes || {}).length > 0
        ? groupedEpisodes
        : (metadataGroupedEpisodes || {});
      const allEpisodes = Object.values(sourceGroups || {}).flat() as any[];
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
      
      if (DEBUG_MODE) {
        logger.log('[KSPlayerCore] nextEpisode computation', {
          fromRouteGroups: !!(groupedEpisodes && Object.keys(groupedEpisodes || {}).length),
          fromMetadataGroups: !!(metadataGroupedEpisodes && Object.keys(metadataGroupedEpisodes || {}).length),
          allEpisodesCount: allEpisodes?.length || 0,
          currentSeason: season,
          currentEpisode: episode,
          found: !!nextEp,
          foundId: nextEp?.stremioId || nextEp?.id,
          foundName: nextEp?.name,
        });
      }
      return nextEp;
    } catch {
      return null;
    }
  }, [type, season, episode, groupedEpisodes, metadataGroupedEpisodes]);

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

  // Long press gesture handlers for speed boost
  const onLongPressActivated = useCallback(() => {
    if (!holdToSpeedEnabled) return;
    
    if (!isSpeedBoosted && playbackSpeed !== holdToSpeedValue) {
      setOriginalSpeed(playbackSpeed);
      setPlaybackSpeed(holdToSpeedValue);
      setIsSpeedBoosted(true);
      
      // Show "Activated" overlay
      setShowSpeedActivatedOverlay(true);
      Animated.spring(speedActivatedOverlayOpacity, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();
      
      // Auto-hide after 2 seconds
      setTimeout(() => {
        Animated.timing(speedActivatedOverlayOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setShowSpeedActivatedOverlay(false);
        });
      }, 2000);
      
      logger.log(`[KSPlayerCore] Speed boost activated: ${holdToSpeedValue}x`);
    }
  }, [isSpeedBoosted, playbackSpeed, holdToSpeedEnabled, holdToSpeedValue, speedActivatedOverlayOpacity]);

  const restoreSpeedSafely = useCallback(() => {
    if (isSpeedBoosted) {
      setPlaybackSpeed(originalSpeed);
      setIsSpeedBoosted(false);
      logger.log('[KSPlayerCore] Speed boost deactivated, restored to:', originalSpeed);
    }
  }, [isSpeedBoosted, originalSpeed]);

  const onLongPressEnd = useCallback(() => {
    restoreSpeedSafely();
  }, [restoreSpeedSafely]);

  const onLongPressStateChange = useCallback((event: LongPressGestureHandlerGestureEvent) => {
    // Ensure restoration on cancel/fail/end as well
    // @ts-ignore - numeric State enum
    const state = event?.nativeEvent?.state;
    if (state === State.CANCELLED || state === State.FAILED || state === State.END) {
      restoreSpeedSafely();
    }
  }, [restoreSpeedSafely]);

  // Safety: restore speed on unmount if still boosted
  useEffect(() => {
    return () => {
      if (isSpeedBoosted) {
        try { setPlaybackSpeed(originalSpeed); } catch {}
      }
    };
  }, [isSpeedBoosted, originalSpeed]);

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

  // Force landscape orientation after opening animation completes
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        if (__DEV__) logger.log('[VideoPlayer] Locked to landscape orientation');
      } catch (error) {
        logger.warn('[VideoPlayer] Failed to lock orientation:', error);
      }
    };

    // Lock orientation after opening animation completes to prevent glitches
    if (isOpeningAnimationComplete) {
      lockOrientation();
    }

    return () => {
      // Do not unlock orientation here; we unlock explicitly on close to avoid mid-transition flips
    };
  }, [isOpeningAnimationComplete]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenDimensions(screen);
      // Re-apply immersive mode on layout changes (Android) - only after opening animation
      if (isOpeningAnimationComplete) {
        enableImmersiveMode();
      }
    });
    const initializePlayer = async () => {
      StatusBar.setHidden(true, 'none');
      // Enable immersive mode after opening animation to prevent glitches
      if (isOpeningAnimationComplete) {
        enableImmersiveMode();
      }
      startOpeningAnimation();

      // Initialize current volume and brightness levels
      // Volume starts at 100 (full volume) for KSPlayer
      setVolume(100);
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Initial volume: 100 (KSPlayer native)`);
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
  }, [isOpeningAnimationComplete]);

  // Re-apply immersive mode when screen gains focus (Android)
  useFocusEffect(
    useCallback(() => {
      if (isOpeningAnimationComplete) {
        enableImmersiveMode();
      }
      return () => {};
    }, [isOpeningAnimationComplete])
  );

  // Re-apply immersive mode when app returns to foreground (Android)
  useEffect(() => {
    const onAppStateChange = (state: string) => {
      if (state === 'active' && isOpeningAnimationComplete) {
        enableImmersiveMode();
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => {
      sub.remove();
    };
  }, [isOpeningAnimationComplete]);

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
    // Stop the pulse animation immediately
    pulseAnim.stopAnimation();
    
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
      setIsOpeningAnimationComplete(true);
      // Delay hiding the overlay to allow background fade animation to complete
      setTimeout(() => {
        setShouldHideOpeningOverlay(true);
      }, 450); // Slightly longer than the background fade duration
      // Enable immersive mode and lock orientation now that animation is complete
      enableImmersiveMode();
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

      // IMMEDIATE: Send immediate pause update to Trakt when user pauses
      if (duration > 0) {
        traktAutosync.handleProgressUpdate(currentTime, duration, true); // force=true triggers immediate sync
      }
    }
  };

  const seekToTime = (rawSeconds: number) => {
    // For KSPlayer, we need to wait for the player to be ready
    if (!ksPlayerRef.current || isSeeking.current) {
      if (DEBUG_MODE) {
        logger.error(`[VideoPlayer] Seek failed: ksPlayerRef=${!!ksPlayerRef.current}, seeking=${isSeeking.current}`);
      }
      return;
    }

    // Clamp to just before the end to avoid triggering onEnd when duration is known.
    const timeInSeconds = duration > 0
      ? Math.max(0, Math.min(rawSeconds, duration - END_EPSILON))
      : Math.max(0, rawSeconds);
    
    if (DEBUG_MODE) {
      if (__DEV__) logger.log(`[VideoPlayer] Seeking to ${timeInSeconds.toFixed(2)}s out of ${duration.toFixed(2)}s`);
    }

    isSeeking.current = true;

    // KSPlayer uses direct time seeking
    ksPlayerRef.current.seek(timeInSeconds);

    setTimeout(() => {
      if (isMounted.current) {
        isSeeking.current = false;
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] KSPlayer seek completed to ${timeInSeconds.toFixed(2)}s`);
        }

        // IMMEDIATE SYNC: Update Trakt progress immediately after seeking
        traktAutosync.handleProgressUpdate(timeInSeconds, duration, true); // force=true for immediate sync
      }
    }, 500);
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
    // Remember if we were playing before the user started dragging
    wasPlayingBeforeDragRef.current = !paused;
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
      // If the video was playing before the drag, ensure we remain in playing state after the seek
      if (wasPlayingBeforeDragRef.current) {
        setTimeout(() => {
          if (isMounted.current) {
            setPaused(false);
          }
        }, 350);
      }
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

    // KSPlayer returns times in seconds directly
    const currentTimeInSeconds = event.currentTime;
    const durationInSeconds = event.duration;

    // Update duration if it's available and different
    if (durationInSeconds > 0 && durationInSeconds !== duration) {
      setDuration(durationInSeconds);
    }

    // Only update if there's a significant change to avoid unnecessary updates
    if (Math.abs(currentTimeInSeconds - currentTime) > 0.5) {
      safeSetState(() => setCurrentTime(currentTimeInSeconds));
      // KSPlayer returns bufferTime in seconds
      const bufferedTime = event.bufferTime || currentTimeInSeconds;
      safeSetState(() => setBuffered(bufferedTime));
    }

    // Update AirPlay state if available
    if (event.airPlayState) {
      const wasAirPlayActive = isAirPlayActive;
      setIsAirPlayActive(event.airPlayState.isExternalPlaybackActive);
      setAllowsAirPlay(event.airPlayState.allowsExternalPlayback);

      // Log AirPlay state changes for debugging
      if (wasAirPlayActive !== event.airPlayState.isExternalPlaybackActive) {
        if (__DEV__) logger.log(`[VideoPlayer] AirPlay state changed: ${event.airPlayState.isExternalPlaybackActive ? 'ACTIVE' : 'INACTIVE'}`);
      }
    }

    // Safety: if audio is advancing but onLoad didn't fire, dismiss opening overlay
    if (!isOpeningAnimationComplete) {
      setIsVideoLoaded(true);
      setIsPlayerReady(true);
      completeOpeningAnimation();
    }
    
    // If time is advancing right after seek and we previously intended to play,
    // ensure paused state is false to keep UI in sync
    if (wasPlayingBeforeDragRef.current && paused && !isDragging) {
      setPaused(false);
      // Reset the intent once corrected
      wasPlayingBeforeDragRef.current = false;
    }
    
    // Periodic check for disabled audio track (every 3 seconds, max 3 attempts)
    const now = Date.now();
    if (now - lastAudioTrackCheck > 3000 && !paused && duration > 0 && audioTrackFallbackAttempts < 3) {
      setLastAudioTrackCheck(now);
      
      // Check if audio track is disabled (-1) and we have available tracks
      if (selectedAudioTrack === -1 && ksAudioTracks.length > 1) {
        logger.warn('[VideoPlayer] Detected disabled audio track, attempting fallback');
        
        // Find a fallback audio track (prefer stereo/standard formats)
        const fallbackTrack = ksAudioTracks.find((track, index) => {
          const trackName = (track.name || '').toLowerCase();
          const trackLang = (track.language || '').toLowerCase();
          // Prefer stereo, AAC, or standard audio formats, avoid heavy codecs
          return !trackName.includes('truehd') && 
                 !trackName.includes('dts') && 
                 !trackName.includes('dolby') &&
                 !trackName.includes('atmos') &&
                 !trackName.includes('7.1') &&
                 !trackName.includes('5.1') &&
                 index !== selectedAudioTrack; // Don't select the same track
        });
        
        if (fallbackTrack) {
          const fallbackIndex = ksAudioTracks.indexOf(fallbackTrack);
          logger.warn(`[VideoPlayer] Switching to fallback audio track: ${fallbackTrack.name || 'Unknown'} (index: ${fallbackIndex})`);
          
          // Increment fallback attempts counter
          setAudioTrackFallbackAttempts(prev => prev + 1);
          
          // Switch to fallback audio track
          setSelectedAudioTrack(fallbackIndex);
          
          // Brief pause to allow track switching
          setPaused(true);
          setTimeout(() => {
            if (isMounted.current) {
              setPaused(false);
            }
          }, 500);
        } else {
          logger.warn('[VideoPlayer] No suitable fallback audio track found');
          // Increment attempts even if no fallback found to prevent infinite checking
          setAudioTrackFallbackAttempts(prev => prev + 1);
        }
      }
    }
  };

  const onLoad = (data: any) => {
    try {
      if (DEBUG_MODE) {
        logger.log('[VideoPlayer] Video loaded:', data);
      }
      // Clear any pending startup silent retry timers and counters on success
      if (startupRetryTimerRef.current) {
        clearTimeout(startupRetryTimerRef.current);
        startupRetryTimerRef.current = null;
      }
      startupRetryCountRef.current = 0;
      if (!isMounted.current) {
        logger.warn('[VideoPlayer] Component unmounted, skipping onLoad');
        return;
      }
      if (!data) {
        logger.error('[VideoPlayer] onLoad called with null/undefined data');
        return;
      }
      // Extract player backend information
      if (data.playerBackend) {
        const newPlayerBackend = data.playerBackend;
        setPlayerBackend(newPlayerBackend);
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Player backend: ${newPlayerBackend}`);
        }

        // Reset AirPlay state if switching to KSMEPlayer (which doesn't support AirPlay)
        if (newPlayerBackend === 'KSMEPlayer' && (isAirPlayActive || allowsAirPlay)) {
          setIsAirPlayActive(false);
          setAllowsAirPlay(false);
          if (DEBUG_MODE) {
            logger.log('[VideoPlayer] Reset AirPlay state for KSMEPlayer');
          }
        }
      }

      // KSPlayer returns duration in seconds directly
      const videoDuration = data.duration;
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Setting duration to: ${videoDuration}`);
      }
      if (videoDuration > 0) {
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

      // Set aspect ratio from naturalSize (KSPlayer format)
      if (data.naturalSize && data.naturalSize.width && data.naturalSize.height) {
        setVideoAspectRatio(data.naturalSize.width / data.naturalSize.height);
      } else {
        // Fallback to 16:9 aspect ratio if naturalSize is not available
        setVideoAspectRatio(16 / 9);
        logger.warn('[VideoPlayer] naturalSize not available, using default 16:9 aspect ratio');
      }

      if (data.audioTracks && data.audioTracks.length > 0) {
        // Enhanced debug logging to see all available fields
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Raw audio tracks data:`, data.audioTracks);
          data.audioTracks.forEach((track: any, idx: number) => {
            logger.log(`[VideoPlayer] Track ${idx} raw data:`, {
              id: track.id,
              name: track.name,
              language: track.language,
              languageCode: track.languageCode,
              isEnabled: track.isEnabled,
              bitRate: track.bitRate,
              bitDepth: track.bitDepth,
              allKeys: Object.keys(track),
              fullTrackObject: track
            });
          });
        }
        
        const formattedAudioTracks = data.audioTracks.map((track: any, index: number) => {
          const trackIndex = track.id !== undefined ? track.id : index;
          
          // Build comprehensive track name from available fields
          let trackName = '';
          const parts = [];
          
          // Add language if available
          let language = track.language || track.languageCode;
          
          if (language && language !== 'Unknown' && language !== 'und' && language !== '') {
            parts.push(language.toUpperCase());
          }
          
          // Add bitrate if available
          const bitrate = track.bitRate;
          if (bitrate && bitrate > 0) {
            parts.push(`${Math.round(bitrate / 1000)}kbps`);
          }
          
          // Add bit depth if available
          const bitDepth = track.bitDepth;
          if (bitDepth && bitDepth > 0) {
            parts.push(`${bitDepth}bit`);
          }
          
          // Add track name if available and not generic
          let title = track.name;
          if (title && !title.match(/^(Audio|Track)\s*\d*$/i) && title !== 'Unknown') {
            // Clean up title by removing language brackets and trailing punctuation
            title = title.replace(/\s*\[[^\]]+\]\s*[-–—]*\s*$/, '').trim();
            if (title && title !== 'Unknown') {
              parts.push(title);
            }
          }
          
          // Combine parts or fallback to generic name
          if (parts.length > 0) {
            trackName = parts.join(' • ');
          } else {
            // For simple track names like "Track 1", "Audio 1", etc., use them as-is
            const simpleName = track.name;
            if (simpleName && simpleName.match(/^(Track|Audio)\s*\d*$/i)) {
              trackName = simpleName;
            } else {
              trackName = `Audio ${index + 1}`;
            }
          }
          
          const trackLanguage = language || 'Unknown';
          
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Processed KSPlayer track ${index}:`, {
              id: trackIndex,
              name: trackName,
              language: trackLanguage,
              parts: parts,
              bitRate: bitrate,
              bitDepth: bitDepth
            });
          }
          
          return {
            id: trackIndex, // Use the actual track ID from KSPlayer
            name: trackName,
            language: trackLanguage,
          };
        });
        setKsAudioTracks(formattedAudioTracks);
        
        // Auto-select English audio track if available, otherwise first track
        if (selectedAudioTrack === null && formattedAudioTracks.length > 0) {
          // Look for English track first
          const englishTrack = formattedAudioTracks.find((track: {id: number, name: string, language?: string}) => {
            const lang = (track.language || '').toLowerCase();
            return lang === 'english' || lang === 'en' || lang === 'eng' || 
                   (track.name && track.name.toLowerCase().includes('english'));
          });
          
          const selectedTrack = englishTrack || formattedAudioTracks[0];
          setSelectedAudioTrack(selectedTrack.id);
          
          if (DEBUG_MODE) {
            if (englishTrack) {
              logger.log(`[VideoPlayer] Auto-selected English audio track: ${selectedTrack.name} (ID: ${selectedTrack.id})`);
            } else {
              logger.log(`[VideoPlayer] No English track found, auto-selected first audio track: ${selectedTrack.name} (ID: ${selectedTrack.id})`);
            }
          }
        }
        
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Formatted audio tracks:`, formattedAudioTracks);
        }
      }
      if (data.textTracks && data.textTracks.length > 0) {
        // Process KSPlayer text tracks
        const formattedTextTracks = data.textTracks.map((track: any, index: number) => ({
          id: track.id !== undefined ? track.id : index,
          name: track.name || `Subtitle ${index + 1}`,
          language: track.language || track.languageCode || 'Unknown',
          isEnabled: track.isEnabled || false,
          isImageSubtitle: track.isImageSubtitle || false
        }));
        
        setKsTextTracks(formattedTextTracks);

        // Auto-select English subtitle track if available
        if (selectedTextTrack === -1 && !useCustomSubtitles && formattedTextTracks.length > 0) {
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Available KSPlayer subtitle tracks:`, formattedTextTracks);
          }

          // Look for English track first
          const englishTrack = formattedTextTracks.find((track: any) => {
            const lang = (track.language || '').toLowerCase();
            const name = (track.name || '').toLowerCase();
            return lang === 'english' || lang === 'en' || lang === 'eng' ||
                   name.includes('english') || name.includes('en');
          });

          if (englishTrack) {
            setSelectedTextTrack(englishTrack.id);
            if (DEBUG_MODE) {
              logger.log(`[VideoPlayer] Auto-selected English subtitle track: ${englishTrack.name} (ID: ${englishTrack.id})`);
            }
          } else if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] No English subtitle track found, keeping subtitles disabled`);
          }
        }
      }

      setIsVideoLoaded(true);
      setIsPlayerReady(true);
      
      // Reset audio track fallback attempts when new video loads
      setAudioTrackFallbackAttempts(0);
      setLastAudioTrackCheck(0);

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
          if (videoDuration > 0 && isMounted.current) {
            seekToTime(initialPosition);
            setIsInitialSeekComplete(true);
            logger.log(`[VideoPlayer] Initial seek completed to: ${initialPosition}s`);
          } else {
            logger.error(`[VideoPlayer] Initial seek failed: duration=${videoDuration}, mounted=${isMounted.current}`);
          }
        }, 500);
      }
      
      controlsTimeout.current = setTimeout(hideControls, 5000);
      
      // Auto-fetch and load English external subtitles if available
      if (imdbId) {
        fetchAvailableSubtitles(undefined, true);
      }
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
    const newTime = Math.max(0, Math.min(currentTime + seconds, duration - END_EPSILON));
    seekToTime(newTime);
  };

  const onAudioTracks = (data: { audioTracks: AudioTrack[] }) => {
    setAudioTracks(data.audioTracks || []);
  };

  const onTextTracks = (e: Readonly<{ textTracks: TextTrack[] }>) => {
    setTextTracks(e.textTracks || []);
  };

  const cycleAspectRatio = () => {
    // iOS KSPlayer: toggle native resize mode so subtitles remain independent
    if (Platform.OS === 'ios') {
      setResizeMode((prev) => (prev === 'cover' ? 'contain' : 'cover'));
      return;
    }
    // Fallback (non‑iOS paths): keep legacy zoom behavior
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
        // IMMEDIATE: Force immediate progress update (scrobble/pause) with the exact time
        await traktAutosync.handleProgressUpdate(actualCurrentTime, duration, true);

        // IMMEDIATE: Use user_close reason to trigger immediate scrobble stop
        await traktAutosync.handlePlaybackEnd(actualCurrentTime, duration, 'user_close');

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
      // Reinforce immersive mode after any UI toggle (Android)
      enableImmersiveMode();
      return newShowControls;
    });
  };

  const handleError = (error: any) => {
    try {
      logger.error('[VideoPlayer] Playback Error:', error);
      
      // Detect KSPlayer startup timeout and silently retry without UI
      const errText = typeof error === 'string'
        ? error
        : (error?.message || error?.error?.message || error?.title || '');
      const isStartupTimeout = /timeout/i.test(errText) && /stream.*ready/i.test(errText);
      if (isStartupTimeout && !isVideoLoaded) {
        // Suppress any error modal and retry silently
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        setShowErrorModal(false);

        const attempt = startupRetryCountRef.current;
        if (attempt < MAX_STARTUP_RETRIES) {
          const backoffMs = [4000, 8000, 12000][attempt] ?? 8000;
          startupRetryCountRef.current = attempt + 1;
          logger.warn(`[VideoPlayer] Startup timeout; retrying (${attempt + 1}/${MAX_STARTUP_RETRIES}) in ${backoffMs}ms`);

          if (startupRetryTimerRef.current) {
            clearTimeout(startupRetryTimerRef.current);
          }
          startupRetryTimerRef.current = setTimeout(() => {
            if (!ksPlayerRef.current) return;
            try {
              // Reload the same source silently using native bridge
              ksPlayerRef.current.setSource({
                uri: currentStreamUrl,
                headers: headers && Object.keys(headers).length > 0 ? headers : undefined
              });
              // Ensure playback resumes if not paused
              ksPlayerRef.current.setPaused(paused);
              logger.log('[VideoPlayer] Retried source load via KSPlayer.setSource');
            } catch (e) {
              logger.error('[VideoPlayer] Error during silent retry setSource:', e);
            }
          }, backoffMs);
          return; // Exit handler; do not show UI
        }
        logger.error('[VideoPlayer] Max startup retries reached; proceeding to normal error handling');
      }

      // Check for audio codec errors (TrueHD, DTS, Dolby, etc.)
      const isAudioCodecError = 
        (error?.message && /(trhd|truehd|true\s?hd|dts|dolby|atmos|e-ac3|ac3)/i.test(error.message)) ||
        (error?.error?.message && /(trhd|truehd|true\s?hd|dts|dolby|atmos|e-ac3|ac3)/i.test(error.error.message)) ||
        (error?.title && /codec not supported/i.test(error.title));
      
      // Handle audio codec errors with automatic fallback
      if (isAudioCodecError && ksAudioTracks.length > 1) {
        logger.warn('[VideoPlayer] Audio codec error detected, attempting audio track fallback');
        
        // Find a fallback audio track (prefer stereo/standard formats)
        const fallbackTrack = ksAudioTracks.find((track, index) => {
          const trackName = (track.name || '').toLowerCase();
          const trackLang = (track.language || '').toLowerCase();
          // Prefer stereo, AAC, or standard audio formats, avoid heavy codecs
          return !trackName.includes('truehd') && 
                 !trackName.includes('dts') && 
                 !trackName.includes('dolby') &&
                 !trackName.includes('atmos') &&
                 !trackName.includes('7.1') &&
                 !trackName.includes('5.1') &&
                 index !== selectedAudioTrack; // Don't select the same track
        });
        
        if (fallbackTrack) {
          const fallbackIndex = ksAudioTracks.indexOf(fallbackTrack);
          logger.warn(`[VideoPlayer] Switching to fallback audio track: ${fallbackTrack.name || 'Unknown'} (index: ${fallbackIndex})`);
          
          // Clear any existing error state
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = null;
          }
          setShowErrorModal(false);
          
          // Switch to fallback audio track
          setSelectedAudioTrack(fallbackIndex);
          
          // Brief pause to allow track switching
          setPaused(true);
          setTimeout(() => {
            if (isMounted.current) {
              setPaused(false);
            }
          }, 500);
          
          return; // Don't show error UI, attempt recovery
        }
      }
      
      // Format error details for user display
      let errorMessage = 'An unknown error occurred';
      if (error) {
        if (isAudioCodecError) {
          errorMessage = 'Audio codec compatibility issue detected. The video contains unsupported audio codec (TrueHD/DTS/Dolby). Please try selecting a different audio track or use an alternative video source.';
        } else if (typeof error === 'string') {
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
    } catch (handlerError) {
      // Fallback error handling to prevent crashes during error processing
      logger.error('[VideoPlayer] Error in error handler:', handlerError);
      if (isMounted.current) {
        // Minimal safe error handling
        setErrorDetails('A critical error occurred');
        setShowErrorModal(true);
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
      // REGULAR: Use regular sync for natural video end (not immediate since it's not user-triggered)
      logger.log('[VideoPlayer] Video ended naturally, sending final progress update with 100%');
      await traktAutosync.handleProgressUpdate(finalTime, duration, false); // force=false for regular sync

      // REGULAR: Use 'ended' reason for natural video end (uses regular queued method)
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
      logger.log(`[VideoPlayer] Available tracks:`, ksAudioTracks);
    }
    
    // Validate that the track exists
    const trackExists = ksAudioTracks.some(track => track.id === trackId);
    if (!trackExists) {
      logger.error(`[VideoPlayer] Audio track ${trackId} not found in available tracks`);
      return;
    }
    
    // Get the selected track info for logging
    const selectedTrack = ksAudioTracks.find(track => track.id === trackId);
    if (selectedTrack && DEBUG_MODE) {
      logger.log(`[VideoPlayer] Switching to track: ${selectedTrack.name} (${selectedTrack.language})`);
      
      // Check if this is a multi-channel track that might need downmixing
      const trackName = selectedTrack.name.toLowerCase();
      const isMultiChannel = trackName.includes('5.1') || trackName.includes('7.1') || 
                            trackName.includes('truehd') || trackName.includes('dts') ||
                            trackName.includes('dolby') || trackName.includes('atmos');
      
      if (isMultiChannel) {
        logger.log(`[VideoPlayer] Multi-channel audio track detected: ${selectedTrack.name}`);
        logger.log(`[VideoPlayer] KSPlayer will apply downmixing to ensure dialogue is audible`);
      }
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

  const disableCustomSubtitles = () => {
    setUseCustomSubtitles(false);
    setCustomSubtitles([]);
    // Reset to first available built-in track or disable all tracks
    setSelectedTextTrack(ksTextTracks.length > 0 ? 0 : -1);
  };

  // Ensure native KSPlayer text tracks are disabled when using custom (addon) subtitles
  // and re-applied when switching back to built-in tracks. This prevents double-rendering.
  useEffect(() => {
    try {
      if (useCustomSubtitles) {
        // -1 disables native subtitle rendering in KSPlayer
        setSelectedTextTrack(-1);
      } else if (typeof selectedTextTrack === 'number' && selectedTextTrack >= 0) {
        // KSPlayer picks it up via prop
      }
    } catch (e) {
      // no-op: defensive guard in case ref methods are unavailable momentarily
    }
  }, [useCustomSubtitles, selectedTextTrack]);

  const loadSubtitleSize = async () => {
    try {
      // Prefer scoped subtitle settings
      const saved = await storageService.getSubtitleSettings();
      if (saved && typeof saved.subtitleSize === 'number') {
        setSubtitleSize(saved.subtitleSize);
        return;
      }
      // One-time migrate legacy key if present
      const legacy = await mmkvStorage.getItem(SUBTITLE_SIZE_KEY);
      if (legacy) {
        const migrated = parseInt(legacy, 10);
        if (!Number.isNaN(migrated) && migrated > 0) {
          setSubtitleSize(migrated);
          try {
            const merged = { ...(saved || {}), subtitleSize: migrated };
            await storageService.saveSubtitleSettings(merged);
          } catch {}
        }
        try { await mmkvStorage.removeItem(SUBTITLE_SIZE_KEY); } catch {}
        return;
      }
      // If no saved settings, use responsive default
      const screenWidth = Dimensions.get('window').width;
      setSubtitleSize(getDefaultSubtitleSize(screenWidth));
    } catch (error) {
      logger.error('[VideoPlayer] Error loading subtitle size:', error);
      // Fallback to responsive default on error
      const screenWidth = Dimensions.get('window').width;
      setSubtitleSize(getDefaultSubtitleSize(screenWidth));
    }
  };

  const saveSubtitleSize = async (size: number) => {
    try {
      setSubtitleSize(size);
      // Persist via scoped subtitle settings so it survives restarts and account switches
      const saved = await storageService.getSubtitleSettings();
      const next = { ...(saved || {}), subtitleSize: size };
      await storageService.saveSubtitleSettings(next);
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

      // For KSPlayer on iOS: stop spinner early, then clear-apply and micro-seek nudge
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
    setPaused(!paused);
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
            navigation.replace('PlayerIOS', {
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

  // Up Next visibility handled inside reusable component

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
      
      // Cleanup gesture controls
      gestureControls.cleanup();
      
      if (startupRetryTimerRef.current) {
        clearTimeout(startupRetryTimerRef.current);
        startupRetryTimerRef.current = null;
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
      if (currentFormattedSegments.length > 0) {
        setCurrentFormattedSegments([]);
      }
      return;
    }
    const adjustedTime = currentTime + (subtitleOffsetSec || 0) - 0.2;
    const currentCue = customSubtitles.find(cue =>
      adjustedTime >= cue.start && adjustedTime <= cue.end
    );
    const newSubtitle = currentCue ? currentCue.text : '';
    setCurrentSubtitle(newSubtitle);
    
    // Extract formatted segments from current cue
    if (currentCue?.formattedSegments) {
      // Split by newlines to get per-line segments
      const lines = (currentCue.text || '').split(/\r?\n/);
      const segmentsPerLine: SubtitleSegment[][] = [];
      let segmentIndex = 0;
      
      for (const line of lines) {
        const lineSegments: SubtitleSegment[] = [];
        const words = line.split(/(\s+)/);
        
        for (const word of words) {
          if (word.trim()) {
            if (segmentIndex < currentCue.formattedSegments.length) {
              lineSegments.push(currentCue.formattedSegments[segmentIndex]);
              segmentIndex++;
            } else {
              // Fallback if segment count doesn't match
              lineSegments.push({ text: word });
            }
          }
        }
        
        if (lineSegments.length > 0) {
          segmentsPerLine.push(lineSegments);
        }
      }
      
      setCurrentFormattedSegments(segmentsPerLine.length > 0 ? segmentsPerLine : []);
    } else {
      setCurrentFormattedSegments([]);
    }
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
      } catch {} finally {
        // Mark subtitle settings as loaded so we can safely persist subsequent changes
        try { setSubtitleSettingsLoaded(true); } catch {}
      }
    })();
  }, []);

  // Persist global subtitle settings on change
  useEffect(() => {
    if (!subtitleSettingsLoaded) return;
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
    subtitleSettingsLoaded,
  ]);

  useEffect(() => {
    loadSubtitleSize();
  }, []);

  // Handle audio track changes with proper logging
  useEffect(() => {
    if (selectedAudioTrack !== null && ksAudioTracks.length > 0) {
      const selectedTrack = ksAudioTracks.find(track => track.id === selectedAudioTrack);
      if (selectedTrack) {
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Audio track selected: ${selectedTrack.name} (${selectedTrack.language}) - ID: ${selectedAudioTrack}`);
        }
      } else {
        logger.warn(`[VideoPlayer] Selected audio track ${selectedAudioTrack} not found in available tracks`);
      }
    }
  }, [selectedAudioTrack, ksAudioTracks]);

  const increaseSubtitleSize = () => {
    const newSize = Math.min(subtitleSize + 2, 80);
    saveSubtitleSize(newSize);
  };

  const decreaseSubtitleSize = () => {
    const newSize = Math.max(subtitleSize - 2, 8);
    saveSubtitleSize(newSize);
  };

  const toggleSubtitleBackground = () => {
    setSubtitleBackground(prev => !prev);
  };

  // AirPlay handler
  const handleAirPlayPress = async () => {
    if (!ksPlayerRef.current) return;
    
    try {
      // First ensure AirPlay is enabled
      if (!allowsAirPlay) {
        ksPlayerRef.current.setAllowsExternalPlayback(true);
        setAllowsAirPlay(true);
        logger.log(`[VideoPlayer] AirPlay enabled before showing picker`);
      }
      
      // Show the AirPlay picker
      ksPlayerRef.current.showAirPlayPicker();
      
      logger.log(`[VideoPlayer] AirPlay picker triggered - check console for native logs`);
    } catch (error) {
      logger.error('[VideoPlayer] Error showing AirPlay picker:', error);
    }
  };

  const handleSelectStream = async (newStream: any) => {
    if (newStream.url === currentStreamUrl) {
      setShowSourcesModal(false);
      return;
    }

    setShowSourcesModal(false);

    // Extract quality and provider information
    let newQuality = newStream.quality;
    if (!newQuality && newStream.title) {
      const qualityMatch = newStream.title.match(/(\d+)p/);
      newQuality = qualityMatch ? qualityMatch[0] : undefined;
    }

    const newProvider = newStream.addonName || newStream.name || newStream.addon || 'Unknown';
    const newStreamName = newStream.name || newStream.title || 'Unknown Stream';

    // Pause current playback
    setPaused(true);

    // Navigate with replace to reload player with new source
    setTimeout(() => {
      navigation.replace('PlayerIOS', {
        uri: newStream.url,
        title: title,
        episodeTitle: episodeTitle,
        season: season,
        episode: episode,
        quality: newQuality,
        year: year,
        streamProvider: newProvider,
        streamName: newStreamName,
        headers: newStream.headers || undefined,
        id,
        type,
        episodeId,
        imdbId: imdbId ?? undefined,
        backdrop: backdrop || undefined,
        availableStreams: availableStreams,
      });
    }, 100);
  };

  const handleEpisodeSelect = (episode: Episode) => {
    logger.log('[KSPlayerCore] Episode selected:', episode.name);
    setSelectedEpisodeForStreams(episode);
    setShowEpisodesModal(false);
    setShowEpisodeStreamsModal(true);
  };

  // Debug: Log when modal state changes
  useEffect(() => {
    if (showEpisodesModal) {
      logger.log('[KSPlayerCore] Episodes modal opened, groupedEpisodes:', groupedEpisodes);
      logger.log('[KSPlayerCore] type:', type, 'season:', season, 'episode:', episode);
    }
  }, [showEpisodesModal, groupedEpisodes, type]);

  const handleEpisodeStreamSelect = async (stream: any) => {
    if (!selectedEpisodeForStreams) return;
    
    setShowEpisodeStreamsModal(false);
    
    const newQuality = stream.quality || (stream.title?.match(/(\d+)p/)?.[0]);
    const newProvider = stream.addonName || stream.name || stream.addon || 'Unknown';
    const newStreamName = stream.name || stream.title || 'Unknown Stream';
    
    setPaused(true);
    
    setTimeout(() => {
      navigation.replace('PlayerIOS', {
        uri: stream.url,
        title: title,
        episodeTitle: selectedEpisodeForStreams.name,
        season: selectedEpisodeForStreams.season_number,
        episode: selectedEpisodeForStreams.episode_number,
        quality: newQuality,
        year: year,
        streamProvider: newProvider,
        streamName: newStreamName,
        headers: stream.headers || undefined,
        id,
        type: 'series',
        episodeId: selectedEpisodeForStreams.stremioId || `${id}:${selectedEpisodeForStreams.season_number}:${selectedEpisodeForStreams.episode_number}`,
        imdbId: imdbId ?? undefined,
        backdrop: backdrop || undefined,
        availableStreams: {},
        groupedEpisodes: groupedEpisodes,
      });
    }, 100);
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
        // iPad/macOS fullscreen: use flex layout instead of absolute positioning
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
      {!DISABLE_OPENING_OVERLAY && (
        <LoadingOverlay
          visible={!shouldHideOpeningOverlay}
          backdrop={backdrop || null}
          hasLogo={hasLogo}
          logo={metadata?.logo}
          backgroundFadeAnim={backgroundFadeAnim}
          backdropImageOpacityAnim={backdropImageOpacityAnim}
          logoScaleAnim={logoScaleAnim}
          logoOpacityAnim={logoOpacityAnim}
          pulseAnim={pulseAnim}
          onClose={handleClose}
          width={shouldUseFullscreen ? effectiveDimensions.width : screenDimensions.width}
          height={shouldUseFullscreen ? effectiveDimensions.height : screenDimensions.height}
          useFastImage={true}
        />
      )}

      <Animated.View
        style={[
          styles.videoPlayerContainer,
          {
            opacity: DISABLE_OPENING_OVERLAY ? 1 : openingFadeAnim,
            transform: DISABLE_OPENING_OVERLAY ? [{ scale: 1 }] : [{ scale: openingScaleAnim }],
            width: shouldUseFullscreen ? '100%' : screenDimensions.width,
            height: shouldUseFullscreen ? '100%' : screenDimensions.height,
          }
        ]}
      >
        {/* Combined gesture handler for left side - brightness + tap + long press */}
        <LongPressGestureHandler
          onActivated={onLongPressActivated}
          onEnded={onLongPressEnd}
          onHandlerStateChange={onLongPressStateChange}
          minDurationMs={500}
          shouldCancelWhenOutside={false}
          simultaneousHandlers={[]}
        >
          <PanGestureHandler
            onGestureEvent={gestureControls.onBrightnessGestureEvent}
            activeOffsetY={[-10, 10]}
            failOffsetX={[-30, 30]}
            shouldCancelWhenOutside={false}
            simultaneousHandlers={[]}
            maxPointers={1}
          >
            <TapGestureHandler
              onActivated={toggleControls}
              shouldCancelWhenOutside={false}
              simultaneousHandlers={[]}
            >
              <View style={{
                position: 'absolute',
                top: getDimensions().height * 0.15, // Back to original margin
                left: 0,
                width: getDimensions().width * 0.4, // Back to larger area (40% of screen)
                height: getDimensions().height * 0.7, // Back to larger middle portion (70% of screen)
                zIndex: 10, // Higher z-index to capture gestures
              }} />
            </TapGestureHandler>
          </PanGestureHandler>
        </LongPressGestureHandler>

        {/* Combined gesture handler for right side - volume + tap + long press */}
        <LongPressGestureHandler
          onActivated={onLongPressActivated}
          onEnded={onLongPressEnd}
          onHandlerStateChange={onLongPressStateChange}
          minDurationMs={500}
          shouldCancelWhenOutside={false}
          simultaneousHandlers={[]}
        >
          <PanGestureHandler
            onGestureEvent={gestureControls.onVolumeGestureEvent}
            activeOffsetY={[-10, 10]}
            failOffsetX={[-30, 30]}
            shouldCancelWhenOutside={false}
            simultaneousHandlers={[]}
            maxPointers={1}
          >
            <TapGestureHandler
              onActivated={toggleControls}
              shouldCancelWhenOutside={false}
              simultaneousHandlers={[]}
            >
              <View style={{
                position: 'absolute',
                top: getDimensions().height * 0.15, // Back to original margin
                right: 0,
                width: getDimensions().width * 0.4, // Back to larger area (40% of screen)
                height: getDimensions().height * 0.7, // Back to larger middle portion (70% of screen)
                zIndex: 10, // Higher z-index to capture gestures
              }} />
            </TapGestureHandler>
          </PanGestureHandler>
        </LongPressGestureHandler>

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
            top: getDimensions().height * 0.15,
            left: getDimensions().width * 0.4, // Start after left gesture area
            width: getDimensions().width * 0.2, // Center area (20% of screen)
            height: getDimensions().height * 0.7,
            zIndex: 5, // Lower z-index, controls use box-none to allow touches through
          }} />
        </TapGestureHandler>

        <View
          style={[styles.videoContainer, {
            width: shouldUseFullscreen ? '100%' : screenDimensions.width,
            height: shouldUseFullscreen ? '100%' : screenDimensions.height,
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
              width: getDimensions().width,
              height: getDimensions().height,
            }}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={1}
                onPress={toggleControls}
                onLongPress={resetZoom}
                delayLongPress={300}
              >
                <KSPlayerComponent
                  ref={ksPlayerRef}
                  style={styles.video}
                  source={{
                    uri: currentStreamUrl,
                    headers: headers && Object.keys(headers).length > 0 ? headers : undefined
                  }}
                  paused={paused}
                  volume={volume / 100}
                  rate={playbackSpeed}
                  audioTrack={selectedAudioTrack ?? undefined}
                  textTrack={useCustomSubtitles ? -1 : selectedTextTrack}
                  allowsExternalPlayback={allowsAirPlay}
                  usesExternalPlaybackWhileExternalScreenIsActive={true}
                  subtitleBottomOffset={subtitleBottomOffset}
                  subtitleFontSize={subtitleSize}
                  resizeMode={resizeMode === 'none' ? 'contain' : resizeMode}
                  onProgress={handleProgress}
                  onLoad={onLoad}
                  onEnd={onEnd}
                  onError={handleError}
                  onBuffering={onBuffering}
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
            ksAudioTracks={ksAudioTracks}
            selectedAudioTrack={selectedAudioTrack}
            availableStreams={availableStreams}
            togglePlayback={togglePlayback}
            skip={skip}
            handleClose={handleClose}
            cycleAspectRatio={cycleAspectRatio}
            currentResizeMode={resizeMode}
            setShowAudioModal={setShowAudioModal}
            setShowSubtitleModal={setShowSubtitleModal}
            setShowSpeedModal={setShowSpeedModal}
            isSubtitleModalOpen={showSubtitleModal}
            setShowSourcesModal={setShowSourcesModal}
            setShowEpisodesModal={type === 'series' ? setShowEpisodesModal : undefined}
            onSliderValueChange={handleSliderValueChange}
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={handleSlidingComplete}
            buffered={buffered}
            formatTime={formatTime}
            playerBackend={playerBackend}
          cyclePlaybackSpeed={cyclePlaybackSpeed}
          currentPlaybackSpeed={playbackSpeed}
          isAirPlayActive={isAirPlayActive}
          allowsAirPlay={allowsAirPlay}
          onAirPlayPress={handleAirPlayPress}
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
                <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: getDimensions().width * 0.7 }}>
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
                              <FastImage
                                source={{ uri: `https://image.tmdb.org/t/p/w300${selectedCastMember.profile_path}` }}
                                style={{
                                  width: Math.min(120, screenDimensions.width * 0.18),
                                  height: Math.min(180, screenDimensions.width * 0.27), // Proper aspect ratio 2:3
                                  borderRadius: 12,
                                  backgroundColor: 'rgba(255,255,255,0.1)'
                                }}
                                resizeMode={FastImage.resizeMode.cover}
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

          {/* Next Episode Button (reusable) */}
          <UpNextButton
            type={type as any}
            nextEpisode={nextEpisode as any}
            currentTime={currentTime}
            duration={duration}
            insets={{ top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left }}
            isLoading={isLoadingNextEpisode}
            nextLoadingProvider={nextLoadingProvider}
            nextLoadingQuality={nextLoadingQuality}
            nextLoadingTitle={nextLoadingTitle}
            onPress={handlePlayNextEpisode}
            metadata={metadata ? { poster: metadata.poster, id: metadata.id } : undefined}
            controlsVisible={showControls}
            controlsFixedOffset={Math.min(Dimensions.get('window').width, Dimensions.get('window').height) >= 768 ? 126 : 106}
          />

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
            formattedSegments={currentFormattedSegments}
            controlsVisible={showControls}
            controlsFixedOffset={Math.min(Dimensions.get('window').width, Dimensions.get('window').height) >= 768 ? 126 : 106}
          />

          {/* Volume Overlay */}
          {gestureControls.showVolumeOverlay && (
            <Animated.View
              style={{
                position: 'absolute',
                left: getDimensions().width / 2 - 60,
                top: getDimensions().height / 2 - 60,
                opacity: gestureControls.volumeOverlayOpacity,
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
          {gestureControls.showBrightnessOverlay && (
            <Animated.View
              style={{
                position: 'absolute',
                left: getDimensions().width / 2 - 60,
                top: getDimensions().height / 2 - 60,
                opacity: gestureControls.brightnessOverlayOpacity,
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

          {/* Speed Activated Overlay */}
          {showSpeedActivatedOverlay && (
            <Animated.View
              style={{
                position: 'absolute',
                top: getDimensions().height * 0.1,
                left: getDimensions().width / 2 - 40,
                opacity: speedActivatedOverlayOpacity,
                zIndex: 1000,
              }}
            >
              <View style={{
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 5,
              }}>
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: '600',
                  letterSpacing: 0.5,
                }}>
                  {holdToSpeedValue}x Speed Activated
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
        ksAudioTracks={ksAudioTracks}
        selectedAudioTrack={selectedAudioTrack}
        selectAudioTrack={selectAudioTrack}
      />
      <SpeedModal
        showSpeedModal={showSpeedModal}
        setShowSpeedModal={setShowSpeedModal}
        currentSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        holdToSpeedEnabled={holdToSpeedEnabled}
        setHoldToSpeedEnabled={setHoldToSpeedEnabled}
        holdToSpeedValue={holdToSpeedValue}
        setHoldToSpeedValue={setHoldToSpeedValue}
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
        ksTextTracks={ksTextTracks}
        selectedTextTrack={selectedTextTrack}
        useCustomSubtitles={useCustomSubtitles}
        isKsPlayerActive={isKsPlayerActive}
        subtitleSize={subtitleSize}
        subtitleBackground={subtitleBackground}
        fetchAvailableSubtitles={fetchAvailableSubtitles}
        loadWyzieSubtitle={loadWyzieSubtitle}
        selectTextTrack={selectTextTrack}
        disableCustomSubtitles={disableCustomSubtitles}
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
      />

      {type === 'series' && (
        <>
          <EpisodesModal
            showEpisodesModal={showEpisodesModal}
            setShowEpisodesModal={setShowEpisodesModal}
            groupedEpisodes={groupedEpisodes || metadataGroupedEpisodes || {}}
            currentEpisode={season && episode ? { season, episode } : undefined}
            metadata={metadata ? { poster: metadata.poster, id: metadata.id } : undefined}
            onSelectEpisode={handleEpisodeSelect}
          />
          
          <EpisodeStreamsModal
            visible={showEpisodeStreamsModal}
            episode={selectedEpisodeForStreams}
            onClose={() => {
              setShowEpisodeStreamsModal(false);
              setShowEpisodesModal(true);
            }}
            onSelectStream={handleEpisodeStreamSelect}
            metadata={metadata ? { id: metadata.id, name: metadata.name } : undefined}
          />
        </>
      )}
      
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

export default KSPlayerCore;