import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, TouchableOpacity, TouchableWithoutFeedback, Dimensions, Animated, ActivityIndicator, Platform, NativeModules, StatusBar, Text, StyleSheet, Modal, AppState, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video, { VideoRef, SelectedTrack, SelectedTrackType, BufferingStrategyType, ViewType } from 'react-native-video';
import FastImage from '@d11/react-native-fast-image';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
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
import VlcVideoPlayer, { VlcPlayerRef } from './VlcVideoPlayer';
import { stremioService } from '../../services/stremioService';
import { shouldUseKSPlayer } from '../../utils/playerSelection';
import axios from 'axios';
import * as Brightness from 'expo-brightness';
// Do not statically import Android-only native modules; resolve at runtime on Android

// Map VLC resize modes to react-native-video resize modes
const getVideoResizeMode = (resizeMode: ResizeModeType) => {
  switch (resizeMode) {
    case 'contain': return 'contain';
    case 'cover': return 'cover';
    case 'none': return 'contain';
    default: return 'contain';
  }
};

const AndroidVideoPlayer: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerAndroid'>>();
  
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

  // Opt-in flag to use VLC backend
  const forceVlc = useMemo(() => {
    const rp: any = route.params || {};
    const v = rp.forceVlc !== undefined ? rp.forceVlc : rp.forceVLC;
    return typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v);
  }, [route.params]);
  // TEMP: force React Native Video for testing (disable VLC)
  const TEMP_FORCE_RNV = false;
  const TEMP_FORCE_VLC = false;
  const useVLC = Platform.OS === 'android' && !TEMP_FORCE_RNV && (TEMP_FORCE_VLC || forceVlc);

  // Log player selection
  useEffect(() => {
    const playerType = useVLC ? 'VLC (expo-libvlc-player)' : 'React Native Video';
    const reason = useVLC
      ? (TEMP_FORCE_VLC ? 'TEMP_FORCE_VLC=true' : `forceVlc=${forceVlc} from route params`)
      : (TEMP_FORCE_RNV ? 'TEMP_FORCE_RNV=true' : 'default react-native-video');
    logger.log(`[AndroidVideoPlayer] Player selection: ${playerType} (${reason})`);
  }, [useVLC, forceVlc]);



  // Check if the stream is HLS (m3u8 playlist)
  const isHlsStream = (url: string) => {
    return url.includes('.m3u8') || url.includes('m3u8') || 
           url.includes('hls') || url.includes('playlist') ||
           (currentVideoType && currentVideoType.toLowerCase() === 'm3u8');
  };

  // HLS-specific headers for better ExoPlayer compatibility
  const getHlsHeaders = () => {
    return {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegurl, application/vnd.apple.mpegurl, video/mp2t, video/mp4, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    } as any;
  };


  // Get appropriate headers based on stream type
  const getStreamHeaders = () => {
    // Use HLS headers for HLS streams, default headers for everything else
    if (isHlsStream(currentStreamUrl)) {
      logger.log('[AndroidVideoPlayer] Detected HLS stream, applying HLS headers');
      return getHlsHeaders();
    }
    return Platform.OS === 'android' ? defaultAndroidHeaders() : defaultIosHeaders();
  };

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
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack | null>({ type: SelectedTrackType.SYSTEM });
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('contain');
  const speedOptions = [0.5, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
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
  const [isBackdropLoaded, setIsBackdropLoaded] = useState(false);
  const backdropImageOpacityAnim = useRef(new Animated.Value(0)).current;
  const [isBuffering, setIsBuffering] = useState(false);
  const [rnVideoAudioTracks, setRnVideoAudioTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [rnVideoTextTracks, setRnVideoTextTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);

  // Debounce track updates to prevent excessive processing
  const trackUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce resize operations to prevent rapid successive clicks
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce gesture operations to prevent rapid-fire events
  const gestureDebounceRef = useRef<NodeJS.Timeout | null>(null);



  // Process URL for VLC compatibility
  const processUrlForVLC = useCallback((url: string): string => {
    if (!url || typeof url !== 'string') {
      logger.warn('[AndroidVideoPlayer][VLC] Invalid URL provided:', url);
      return url || '';
    }

    try {
      // Check if URL is already properly formatted
      const urlObj = new URL(url);
      
      // Handle special characters in the pathname that might cause issues
      const pathname = urlObj.pathname;
      const search = urlObj.search;
      const hash = urlObj.hash;
      
      // Decode and re-encode the pathname to handle double-encoding
      const decodedPathname = decodeURIComponent(pathname);
      const encodedPathname = encodeURI(decodedPathname);
      
      // Reconstruct the URL
      const processedUrl = `${urlObj.protocol}//${urlObj.host}${encodedPathname}${search}${hash}`;
      
      logger.log(`[AndroidVideoPlayer][VLC] URL processed: ${url} -> ${processedUrl}`);
      return processedUrl;
    } catch (error) {
      logger.warn(`[AndroidVideoPlayer][VLC] URL processing failed, using original: ${error}`);
      return url;
    }
  }, []);


  // VLC track state - will be managed by VlcVideoPlayer component
  const [vlcAudioTracks, setVlcAudioTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [vlcSubtitleTracks, setVlcSubtitleTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [vlcSelectedAudioTrack, setVlcSelectedAudioTrack] = useState<number | undefined>(undefined);
  const [vlcSelectedSubtitleTrack, setVlcSelectedSubtitleTrack] = useState<number | undefined>(undefined);
  const [vlcRestoreTime, setVlcRestoreTime] = useState<number | undefined>(undefined); // Time to restore after remount
  const [forceVlcRemount, setForceVlcRemount] = useState(false); // Force complete unmount/remount

  // VLC player ref for imperative methods
  const vlcPlayerRef = useRef<VlcPlayerRef>(null);

  // Track if VLC has loaded and needs initial play command
  const vlcLoadedRef = useRef<boolean>(false);

  // Handle VLC pause/play state changes
  useEffect(() => {
    if (useVLC && vlcLoadedRef.current && vlcPlayerRef.current) {
      if (paused) {
        vlcPlayerRef.current.pause();
      } else {
        vlcPlayerRef.current.play();
      }
    }
  }, [useVLC, paused]);

  // Memoized computed props for child components
  const ksAudioTracks = useMemo(() =>
    useVLC ? vlcAudioTracks : rnVideoAudioTracks,
    [useVLC, vlcAudioTracks, rnVideoAudioTracks]
  );

  const computedSelectedAudioTrack = useMemo(() =>
    useVLC
      ? (vlcSelectedAudioTrack ?? null)
      : (selectedAudioTrack?.type === SelectedTrackType.INDEX && selectedAudioTrack.value !== undefined
          ? Number(selectedAudioTrack.value)
          : null),
    [useVLC, vlcSelectedAudioTrack, selectedAudioTrack]
  );

  const ksTextTracks = useMemo(() =>
    useVLC ? vlcSubtitleTracks : rnVideoTextTracks,
    [useVLC, vlcSubtitleTracks, rnVideoTextTracks]
  );

  const computedSelectedTextTrack = useMemo(() =>
    useVLC ? (vlcSelectedSubtitleTrack ?? -1) : selectedTextTrack,
    [useVLC, vlcSelectedSubtitleTrack, selectedTextTrack]
  );

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (trackUpdateTimeoutRef.current) {
        clearTimeout(trackUpdateTimeoutRef.current);
        trackUpdateTimeoutRef.current = null;
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      if (gestureDebounceRef.current) {
        clearTimeout(gestureDebounceRef.current);
        gestureDebounceRef.current = null;
      }
    };
  }, []);

  // Reset forceVlcRemount when VLC becomes inactive
  useEffect(() => {
    if (!useVLC && forceVlcRemount) {
      setForceVlcRemount(false);
    }
  }, [useVLC, forceVlcRemount]);

  // VLC track selection handlers
  const selectVlcAudioTrack = useCallback((trackId: number | null) => {
    setVlcSelectedAudioTrack(trackId ?? undefined);
    logger.log('[AndroidVideoPlayer][VLC] Audio track selected:', trackId);
  }, []);

  const selectVlcSubtitleTrack = useCallback((trackId: number | null) => {
    setVlcSelectedSubtitleTrack(trackId ?? undefined);
    logger.log('[AndroidVideoPlayer][VLC] Subtitle track selected:', trackId);
  }, []);

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

  const calculateVideoStyles = (videoWidth: number, videoHeight: number, screenWidth: number, screenHeight: number) => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      width: screenWidth,
      height: screenHeight,
    };
  };

  // Memoize expensive video style calculations
  const videoStyles = useMemo(() => {
    if (videoAspectRatio && screenDimensions.width > 0 && screenDimensions.height > 0) {
      return calculateVideoStyles(
        videoAspectRatio * 1000,
        1000,
        screenDimensions.width,
        screenDimensions.height
      );
    }
    return {};
  }, [videoAspectRatio, screenDimensions.width, screenDimensions.height]);

  // Memoize zoom factor calculations to prevent expensive recalculations
  const zoomFactor = useMemo(() => {
    // Zoom disabled
    return 1;
  }, [resizeMode, videoAspectRatio, screenDimensions.width, screenDimensions.height]);
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
  const [subtitleBackground, setSubtitleBackground] = useState<boolean>(false);
  // iOS seeking helpers
  const iosWasPausedDuringSeekRef = useRef<boolean | null>(null);
  const wasPlayingBeforeDragRef = useRef<boolean>(false);
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
  const [availableStreams, setAvailableStreams] = useState<{ [providerId: string]: { streams: any[]; addonName: string } }>(passedAvailableStreams || {});
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(uri);
  const [currentVideoType, setCurrentVideoType] = useState<string | undefined>(videoType);
  
  // Memoized processed URL for VLC to prevent infinite loops
  const processedStreamUrl = useMemo(() => {
    return useVLC ? processUrlForVLC(currentStreamUrl) : currentStreamUrl;
  }, [currentStreamUrl, useVLC, processUrlForVLC]);
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
  const vlcFallbackAttemptedRef = useRef(false);

  // VLC key for forcing remounts
  const [vlcKey, setVlcKey] = useState('vlc-initial'); // Force remount key

  // Handler for VLC track updates
  const handleVlcTracksUpdate = useCallback((tracks: { audio: any[], subtitle: any[] }) => {
    if (!tracks) return;

    // Clear any pending updates
    if (trackUpdateTimeoutRef.current) {
      clearTimeout(trackUpdateTimeoutRef.current);
    }

    // Debounce track updates to prevent excessive processing
    trackUpdateTimeoutRef.current = setTimeout(() => {
      const { audio = [], subtitle = [] } = tracks;
      let hasUpdates = false;

      // Process audio tracks
      if (Array.isArray(audio) && audio.length > 0) {
        const formattedAudio = audio.map(track => ({
          id: track.id,
          name: track.name || `Track ${track.id + 1}`,
          language: track.language
        }));

        // Simple comparison - check if tracks changed
        const audioChanged = formattedAudio.length !== vlcAudioTracks.length ||
          formattedAudio.some((track, index) => {
            const existing = vlcAudioTracks[index];
            return !existing || track.id !== existing.id || track.name !== existing.name;
          });

        if (audioChanged) {
          setVlcAudioTracks(formattedAudio);
          hasUpdates = true;
          if (DEBUG_MODE) {
            logger.log(`[VLC] Audio tracks updated:`, formattedAudio.length);
          }
        }
      }

      // Process subtitle tracks
      if (Array.isArray(subtitle) && subtitle.length > 0) {
        const formattedSubs = subtitle.map(track => ({
          id: track.id,
          name: track.name || `Track ${track.id + 1}`,
          language: track.language
        }));

        const subsChanged = formattedSubs.length !== vlcSubtitleTracks.length ||
          formattedSubs.some((track, index) => {
            const existing = vlcSubtitleTracks[index];
            return !existing || track.id !== existing.id || track.name !== existing.name;
          });

        if (subsChanged) {
          setVlcSubtitleTracks(formattedSubs);
          hasUpdates = true;
          if (DEBUG_MODE) {
            logger.log(`[VLC] Subtitle tracks updated:`, formattedSubs.length);
          }
        }
      }

      if (hasUpdates && DEBUG_MODE) {
        logger.log(`[AndroidVideoPlayer][VLC] Track processing complete. Audio: ${vlcAudioTracks.length}, Subs: ${vlcSubtitleTracks.length}`);
      }

      trackUpdateTimeoutRef.current = null;
    }, 100); // 100ms debounce
  }, [vlcAudioTracks, vlcSubtitleTracks]);


  // Volume and brightness controls
  const [volume, setVolume] = useState(1.0);
  const [brightness, setBrightness] = useState(1.0);
  // Store Android system brightness state to restore on exit/unmount
  const originalSystemBrightnessRef = useRef<number | null>(null);
  const originalSystemBrightnessModeRef = useRef<number | null>(null);
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const [showBrightnessOverlay, setShowBrightnessOverlay] = useState(false);
  const [subtitleSettingsLoaded, setSubtitleSettingsLoaded] = useState(false);
  const volumeOverlayOpacity = useRef(new Animated.Value(0)).current;
  const brightnessOverlayOpacity = useRef(new Animated.Value(0)).current;
  const volumeOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const brightnessOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastVolumeChange = useRef<number>(0);
  const lastBrightnessChange = useRef<number>(0);

  // iOS startup timing diagnostics
  const loadStartAtRef = useRef<number | null>(null);
  const firstFrameAtRef = useRef<number | null>(null);

  // iOS playback state tracking for system interruptions
  const wasPlayingBeforeIOSInterruptionRef = useRef<boolean>(false);

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
        if (__DEV__) logger.warn('[AndroidVideoPlayer] Backdrop prefetch failed, showing anyway:', error);
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

  // Resolve current episode description for series
  const currentEpisodeDescription = useMemo(() => {
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
  }, [type, groupedEpisodes, episodeId, season, episode]);

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


  const onPinchGestureEvent = (event: PinchGestureHandlerGestureEvent) => {
    // Zoom disabled
    return;
  };

  const onPinchHandlerStateChange = (event: PinchGestureHandlerGestureEvent) => {
    // Zoom disabled
    return;
  };

  // Volume gesture handler (right side of screen) - optimized with debouncing
  const onVolumeGestureEvent = async (event: PanGestureHandlerGestureEvent) => {
    const { translationY, state } = event.nativeEvent;
    const sensitivity = 0.002; // Lower sensitivity for gradual volume control on Android

    if (state === State.ACTIVE) {
      // Debounce rapid gesture events
      if (gestureDebounceRef.current) {
        clearTimeout(gestureDebounceRef.current);
      }
      
      gestureDebounceRef.current = setTimeout(() => {
        const deltaY = -translationY; // Invert for natural feel (up = increase)
        const volumeChange = deltaY * sensitivity;
        const newVolume = Math.max(0, Math.min(1, volume + volumeChange));

        if (Math.abs(newVolume - volume) > 0.01) { // Lower threshold for smoother Android volume control
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
      }, 16); // ~60fps debouncing
    }
  };

  // Brightness gesture handler (left side of screen) - optimized with debouncing
  const onBrightnessGestureEvent = async (event: PanGestureHandlerGestureEvent) => {
    const { translationY, state } = event.nativeEvent;
    const sensitivity = 0.001; // Lower sensitivity for finer brightness control

    if (state === State.ACTIVE) {
      // Debounce rapid gesture events
      if (gestureDebounceRef.current) {
        clearTimeout(gestureDebounceRef.current);
      }
      
      gestureDebounceRef.current = setTimeout(() => {
        const deltaY = -translationY; // Invert for natural feel (up = increase)
        const brightnessChange = deltaY * sensitivity;
        const newBrightness = Math.max(0, Math.min(1, brightness + brightnessChange));

        if (Math.abs(newBrightness - brightness) > 0.001) { // Much lower threshold for more responsive updates
          setBrightness(newBrightness);
          lastBrightnessChange.current = Date.now();
          
          // Set device brightness using Expo Brightness
          try {
            Brightness.setBrightnessAsync(newBrightness).catch((error) => {
              logger.warn('[AndroidVideoPlayer] Error setting device brightness:', error);
            });
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
      }, 16); // ~60fps debouncing
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

  // Apply memoized calculations to state
  useEffect(() => {
    setCustomVideoStyles(videoStyles);
    setZoomScale(zoomFactor);

    if (DEBUG_MODE && resizeMode === 'cover') {
      logger.log(`[AndroidVideoPlayer] Cover zoom updated: ${zoomFactor.toFixed(2)}x (video AR: ${videoAspectRatio?.toFixed(2)})`);
    }
  }, [videoStyles, zoomFactor, resizeMode, videoAspectRatio]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenDimensions(screen);
      // Re-apply immersive mode on layout changes to keep system bars hidden
      enableImmersiveMode();
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
        // Capture Android system brightness and mode to restore later
        if (Platform.OS === 'android') {
          try {
            const [sysBright, sysMode] = await Promise.all([
              (Brightness as any).getSystemBrightnessAsync?.(),
              (Brightness as any).getSystemBrightnessModeAsync?.()
            ]);
            originalSystemBrightnessRef.current = typeof sysBright === 'number' ? sysBright : null;
            originalSystemBrightnessModeRef.current = typeof sysMode === 'number' ? sysMode : null;
            if (DEBUG_MODE) {
              logger.log(`[AndroidVideoPlayer] Captured system brightness=${originalSystemBrightnessRef.current}, mode=${originalSystemBrightnessModeRef.current}`);
            }
          } catch (e) {
            if (__DEV__) logger.warn('[AndroidVideoPlayer] Failed to capture system brightness state:', e);
          }
        }
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

  // Re-apply immersive mode when screen gains focus
  useFocusEffect(
    useCallback(() => {
      enableImmersiveMode();
      // Workaround for VLC surface detach: force complete remount VLC view on focus
      if (useVLC) {
        logger.log('[VLC] Forcing complete remount due to focus gain');
        setVlcRestoreTime(currentTime); // Save current time for restoration
        setForceVlcRemount(true);
        vlcLoadedRef.current = false; // Reset loaded state
        // Re-enable after a brief moment
        setTimeout(() => {
          setForceVlcRemount(false);
          setVlcKey(`vlc-focus-${Date.now()}`);
        }, 100);
      }
      return () => {};
    }, [useVLC])
  );

  // Re-apply immersive mode when app returns to foreground
  useEffect(() => {
    const onAppStateChange = (state: string) => {
      if (state === 'active') {
        enableImmersiveMode();
        if (useVLC) {
          // Force complete remount VLC view when app returns to foreground
          logger.log('[VLC] Forcing complete remount due to app foreground');
          setVlcRestoreTime(currentTime); // Save current time for restoration
          setForceVlcRemount(true);
          vlcLoadedRef.current = false; // Reset loaded state
          // Re-enable after a brief moment
          setTimeout(() => {
            setForceVlcRemount(false);
            setVlcKey(`vlc-foreground-${Date.now()}`);
          }, 100);
        }
        // On iOS, if we were playing before system interruption and the app becomes active again,
        // ensure playback resumes (handles status bar pull-down case)
        if (Platform.OS === 'ios' && wasPlayingBeforeIOSInterruptionRef.current && isPlayerReady) {
          logger.log('[AndroidVideoPlayer] iOS app active - resuming playback after system interruption');
          // Small delay to allow system UI to settle
          setTimeout(() => {
            if (isMounted.current && wasPlayingBeforeIOSInterruptionRef.current) {
              setPaused(false); // Resume playback
              wasPlayingBeforeIOSInterruptionRef.current = false; // Reset flag
            }
          }, 300); // Slightly longer delay for iOS
        }
      } else if (state === 'background' || state === 'inactive') {
        // On iOS, when app goes inactive (like status bar pull), track if we were playing
        if (Platform.OS === 'ios') {
          wasPlayingBeforeIOSInterruptionRef.current = !paused;
          if (!paused) {
            logger.log('[AndroidVideoPlayer] iOS app inactive - tracking playing state for resume');
            setPaused(true);
          }
        }
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => {
      sub.remove();
    };
  }, [paused, isPlayerReady]);

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
      
      // Sync interval for progress updates - increased from 5s to 10s to reduce overhead
      const syncInterval = 10000; // 10 seconds for better performance
      
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

    if (useVLC) {
      // Use VLC imperative method
      if (vlcPlayerRef.current && duration > 0) {
        if (DEBUG_MODE) {
          if (__DEV__) logger.log(`[AndroidVideoPlayer][VLC] Seeking to ${timeInSeconds.toFixed(2)}s out of ${duration.toFixed(2)}s`);
        }
        vlcPlayerRef.current.seek(timeInSeconds);
      } else {
        if (DEBUG_MODE) {
          logger.error(`[AndroidVideoPlayer][VLC] Seek failed: vlcRef=${!!vlcPlayerRef.current}, duration=${duration}`);
        }
      }
    } else {
      // Use react-native-video method
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

      // IMMEDIATE SYNC: Update Trakt progress immediately after seeking
      if (duration > 0 && data?.currentTime !== undefined) {
        traktAutosync.handleProgressUpdate(data.currentTime, duration, true); // force=true for immediate sync
      }

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
  const handleSliderValueChange = useCallback((value: number) => {
    if (isDragging && duration > 0) {
      const seekTime = Math.min(value, duration - END_EPSILON);

      pendingSeekValue.current = seekTime;
    }
  }, [isDragging, duration]);

  const handleSlidingStart = useCallback(() => {
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
  }, [showControls, paused]);

  const handleSlidingComplete = useCallback((value: number) => {
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
  }, [duration, showControls]);

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
    
    // Update time less frequently for better performance (increased threshold from 0.1s to 0.5s)
    if (Math.abs(currentTimeInSeconds - currentTime) > 0.5) {
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
        // Enhanced debug logging to see all available fields
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Raw audio tracks data:`, data.audioTracks);
          data.audioTracks.forEach((track: any, idx: number) => {
            logger.log(`[AndroidVideoPlayer] Track ${idx} raw data:`, {
              index: track.index,
              title: track.title,
              language: track.language,
              type: track.type,
              channels: track.channels,
              bitrate: track.bitrate,
              codec: track.codec,
              sampleRate: track.sampleRate,
              name: track.name,
              label: track.label,
              allKeys: Object.keys(track),
              fullTrackObject: track
            });
          });
        }
        
        const formattedAudioTracks = data.audioTracks.map((track: any, index: number) => {
          const trackIndex = track.index !== undefined ? track.index : index;
          
          // Build comprehensive track name from available fields
          let trackName = '';
          const parts = [];
          
          // Add language if available (try multiple possible fields)
          let language = track.language || track.lang || track.languageCode;
          
          // If no language field, try to extract from track name (e.g., "[Russian]", "[English]")
          if ((!language || language === 'Unknown' || language === 'und' || language === '') && track.name) {
            const languageMatch = track.name.match(/\[([^\]]+)\]/);
            if (languageMatch && languageMatch[1]) {
              language = languageMatch[1].trim();
            }
          }
          
          if (language && language !== 'Unknown' && language !== 'und' && language !== '') {
            parts.push(language.toUpperCase());
          }
          
          // Add codec information if available (try multiple possible fields)
          const codec = track.type || track.codec || track.format;
          if (codec && codec !== 'Unknown') {
            parts.push(codec.toUpperCase());
          }
          
          // Add channel information if available
          const channels = track.channels || track.channelCount;
          if (channels && channels > 0) {
            if (channels === 1) {
              parts.push('MONO');
            } else if (channels === 2) {
              parts.push('STEREO');
            } else if (channels === 6) {
              parts.push('5.1CH');
            } else if (channels === 8) {
              parts.push('7.1CH');
            } else {
              parts.push(`${channels}CH`);
            }
          }
          
          // Add bitrate if available
          const bitrate = track.bitrate || track.bitRate;
          if (bitrate && bitrate > 0) {
            parts.push(`${Math.round(bitrate / 1000)}kbps`);
          }
          
          // Add sample rate if available
          const sampleRate = track.sampleRate || track.sample_rate;
          if (sampleRate && sampleRate > 0) {
            parts.push(`${Math.round(sampleRate / 1000)}kHz`);
          }
          
          // Add title if available and not generic
          let title = track.title || track.name || track.label;
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
            const simpleName = track.name || track.title || track.label;
            if (simpleName && simpleName.match(/^(Track|Audio)\s*\d*$/i)) {
              trackName = simpleName;
            } else {
              // Try to extract any meaningful info from the track object
              const meaningfulFields: string[] = [];
              Object.keys(track).forEach(key => {
                const value = track[key];
                if (value && typeof value === 'string' && value !== 'Unknown' && value !== 'und' && value.length > 1) {
                  meaningfulFields.push(`${key}: ${value}`);
                }
              });
              
              if (meaningfulFields.length > 0) {
                trackName = `Audio ${index + 1} (${meaningfulFields.slice(0, 2).join(', ')})`;
              } else {
                trackName = `Audio ${index + 1}`;
              }
            }
          }
          
          const trackLanguage = language || 'Unknown';
          
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Processed track ${index}:`, {
              index: trackIndex,
              name: trackName,
              language: trackLanguage,
              parts: parts,
              meaningfulFields: Object.keys(track).filter(key => {
                const value = track[key];
                return value && typeof value === 'string' && value !== 'Unknown' && value !== 'und' && value.length > 1;
              })
            });
          }
          
          return {
            id: trackIndex, // Use the actual track index from react-native-video
            name: trackName,
            language: trackLanguage,
          };
        });
        setRnVideoAudioTracks(formattedAudioTracks);
        
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Formatted audio tracks:`, formattedAudioTracks);
        }
      }

        // Handle text tracks
        if (data.textTracks && data.textTracks.length > 0) {
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Raw text tracks data:`, data.textTracks);
            data.textTracks.forEach((track: any, idx: number) => {
              logger.log(`[AndroidVideoPlayer] Text Track ${idx} raw data:`, {
                index: track.index,
                title: track.title,
                language: track.language,
                type: track.type,
                name: track.name,
                label: track.label,
                allKeys: Object.keys(track),
                fullTrackObject: track
              });
            });
          }
          
          const formattedTextTracks = data.textTracks.map((track: any, index: number) => {
            const trackIndex = track.index !== undefined ? track.index : index;
            
            // Build comprehensive track name from available fields
            let trackName = '';
            const parts = [];
            
            // Add language if available (try multiple possible fields)
            let language = track.language || track.lang || track.languageCode;
            
            // If no language field, try to extract from track name (e.g., "[Russian]", "[English]")
            if ((!language || language === 'Unknown' || language === 'und' || language === '') && track.title) {
              const languageMatch = track.title.match(/\[([^\]]+)\]/);
              if (languageMatch && languageMatch[1]) {
                language = languageMatch[1].trim();
              }
            }
            
            if (language && language !== 'Unknown' && language !== 'und' && language !== '') {
              parts.push(language.toUpperCase());
            }
            
            // Add codec information if available (try multiple possible fields)
            const codec = track.codec || track.format;
            if (codec && codec !== 'Unknown' && codec !== 'und') {
              parts.push(codec.toUpperCase());
            }
            
            // Add title if available and not generic
            let title = track.title || track.name || track.label;
            if (title && !title.match(/^(Subtitle|Track)\s*\d*$/i) && title !== 'Unknown') {
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
              // For simple track names like "Track 1", "Subtitle 1", etc., use them as-is
              const simpleName = track.title || track.name || track.label;
              if (simpleName && simpleName.match(/^(Track|Subtitle)\s*\d*$/i)) {
                trackName = simpleName;
              } else {
                // Try to extract any meaningful info from the track object
                const meaningfulFields: string[] = [];
                Object.keys(track).forEach(key => {
                  const value = track[key];
                  if (value && typeof value === 'string' && value !== 'Unknown' && value !== 'und' && value.length > 1) {
                    meaningfulFields.push(`${key}: ${value}`);
                  }
                });
                
                if (meaningfulFields.length > 0) {
                  trackName = meaningfulFields.join(' • ');
                } else {
                  trackName = `Subtitle ${index + 1}`;
                }
              }
            }
            
            return {
              id: trackIndex, // Use the actual track index from react-native-video
              name: trackName,
              language: language,
            };
          });
          setRnVideoTextTracks(formattedTextTracks);
          
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Formatted text tracks:`, formattedTextTracks);
          }
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
      
      // Auto-fetch and load English external subtitles if available
      if (imdbId) {
        fetchAvailableSubtitles(undefined, true);
      }
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

  const skip = useCallback((seconds: number) => {
    const newTime = Math.max(0, Math.min(currentTime + seconds, duration - END_EPSILON));
    seekToTime(newTime);
  }, [currentTime, duration]);

  const cycleAspectRatio = useCallback(() => {
    // Prevent rapid successive resize operations
    if (resizeTimeoutRef.current) {
      if (DEBUG_MODE) {
        logger.log('[AndroidVideoPlayer] Resize operation debounced - ignoring rapid click');
      }
      return;
    }
    // Cycle through allowed resize modes per platform
    // Android: exclude 'contain' for both VLC and RN Video (not well supported)
    let resizeModes: ResizeModeType[];
    if (Platform.OS === 'ios') {
      resizeModes = ['contain', 'cover'];
    } else {
      // On Android with VLC backend, only 'none' (original) and 'cover' (client-side crop)
      resizeModes = useVLC ? ['none', 'cover'] : ['cover', 'none'];
    }

    const currentIndex = resizeModes.indexOf(resizeMode);
    const nextIndex = (currentIndex + 1) % resizeModes.length;
    const newResizeMode = resizeModes[nextIndex];
    setResizeMode(newResizeMode);

    // Set zoom for cover mode to crop/fill screen
    if (newResizeMode === 'cover') {
      if (videoAspectRatio && screenDimensions.width && screenDimensions.height) {
        const screenAspect = screenDimensions.width / screenDimensions.height;
        const videoAspect = videoAspectRatio;
        // Calculate zoom needed to fill screen (cover mode crops to fill)
        const zoomFactor = Math.max(screenAspect / videoAspect, videoAspect / screenAspect);
        setZoomScale(zoomFactor);
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Cover mode zoom: ${zoomFactor.toFixed(2)}x (screen: ${screenAspect.toFixed(2)}, video: ${videoAspect.toFixed(2)})`);
        }
      } else {
        // Fallback if video aspect not available yet - will be set when video loads
        setZoomScale(1.2); // Conservative zoom that works for most content
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Cover mode zoom fallback: 1.2x (video AR not available yet)`);
        }
      }
    } else if (newResizeMode === 'none') {
      // Reset zoom for none mode
      setZoomScale(1);
    }

    if (DEBUG_MODE) {
      logger.log(`[AndroidVideoPlayer] Resize mode changed to: ${newResizeMode}`);
    }

    // Debounce for 300ms to prevent rapid successive operations
    resizeTimeoutRef.current = setTimeout(() => {
      resizeTimeoutRef.current = null;
    }, 300);
  }, [resizeMode]);



  // Cycle playback speed
  const cyclePlaybackSpeed = useCallback(() => {
    const idx = speedOptions.indexOf(playbackSpeed);
    const newIdx = (idx + 1) % speedOptions.length;
    const newSpeed = speedOptions[newIdx];
    setPlaybackSpeed(newSpeed);
  }, [playbackSpeed, speedOptions]);

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
        logger.warn('[AndroidVideoPlayer] Immersive mode error:', error);
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

  const handleClose = useCallback(async () => {
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
    
    // Restore Android system brightness state so app does not lock brightness
    const restoreSystemBrightness = async () => {
      if (Platform.OS !== 'android') return;
      try {
        // Restore mode first (if available), then brightness value
        if (originalSystemBrightnessModeRef.current !== null && typeof (Brightness as any).setSystemBrightnessModeAsync === 'function') {
          await (Brightness as any).setSystemBrightnessModeAsync(originalSystemBrightnessModeRef.current);
        }
        if (originalSystemBrightnessRef.current !== null && typeof (Brightness as any).setSystemBrightnessAsync === 'function') {
          await (Brightness as any).setSystemBrightnessAsync(originalSystemBrightnessRef.current);
        }
        if (DEBUG_MODE) {
          logger.log('[AndroidVideoPlayer] Restored Android system brightness and mode');
        }
      } catch (e) {
        logger.warn('[AndroidVideoPlayer] Failed to restore system brightness state:', e);
      }
    };

    await restoreSystemBrightness();

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
        // IMMEDIATE: Force immediate progress update (scrobble/pause) with the exact time
        await traktAutosync.handleProgressUpdate(actualCurrentTime, duration, true);

        // IMMEDIATE: Use user_close reason to trigger immediate scrobble stop
        await traktAutosync.handlePlaybackEnd(actualCurrentTime, duration, 'user_close');

        logger.log('[AndroidVideoPlayer] Background Trakt sync completed successfully');
      } catch (error) {
        logger.error('[AndroidVideoPlayer] Error in background Trakt sync:', error);
      }
    };

    // Start background sync without blocking UI
    backgroundSync();
  }, [isSyncingBeforeClose, currentTime, duration, traktAutosync, navigation, metadata, imdbId, backdrop]);

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
      // Reinforce immersive mode after any UI toggle
      enableImmersiveMode();
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
      
      // Check for codec errors that should trigger VLC fallback
      const errorString = JSON.stringify(error || {});
      const isCodecError = errorString.includes('MediaCodecVideoRenderer error') ||
                         errorString.includes('MediaCodecAudioRenderer error') ||
                         errorString.includes('NO_EXCEEDS_CAPABILITIES') ||
                         errorString.includes('NO_UNSUPPORTED_TYPE') ||
                         errorString.includes('Decoder failed') ||
                         errorString.includes('video/hevc') ||
                         errorString.includes('audio/eac3') ||
                         errorString.includes('ERROR_CODE_DECODING_FAILED') ||
                         errorString.includes('ERROR_CODE_DECODER_INIT_FAILED');
      
      // If it's a codec error and we're not already using VLC, silently switch to VLC
      if (isCodecError && !useVLC && !vlcFallbackAttemptedRef.current) {
        vlcFallbackAttemptedRef.current = true;
        logger.warn('[AndroidVideoPlayer] Codec error detected, silently switching to VLC');
        // Clear any existing timeout
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        safeSetState(() => setShowErrorModal(false));
        
        // Switch to VLC silently
        setTimeout(() => {
          if (!isMounted.current) return;
          // Force VLC by updating the route params
          navigation.setParams({ forceVlc: true } as any);
        }, 100);
        return; // Do not proceed to show error UI
      }
      
      // One-shot, silent retry without showing error UI
      if (retryAttemptRef.current < 1) {
        retryAttemptRef.current = 1;
        // Cache-bust to force a fresh fetch and warm upstream
        const addRetryParam = (url: string) => {
          const sep = url.includes('?') ? '&' : '?';
          return `${url}${sep}rn_retry_ts=${Date.now()}`;
        };
        const bustedUrl = addRetryParam(currentStreamUrl);
        logger.warn('[AndroidVideoPlayer] Silent retry with cache-busted URL');
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

      // If format unrecognized, try different approaches for HLS streams
      const isUnrecognized = !!(error?.error?.errorString && String(error.error.errorString).includes('UnrecognizedInputFormatException'));
      if (isUnrecognized && retryAttemptRef.current < 1) {
        retryAttemptRef.current = 1;
        
        // Check if this might be an HLS stream that needs different handling
        const mightBeHls = currentStreamUrl.includes('.m3u8') || currentStreamUrl.includes('playlist') || 
                          currentStreamUrl.includes('hls') || currentStreamUrl.includes('stream');
        
        if (mightBeHls) {
          logger.warn(`[AndroidVideoPlayer] HLS stream format not recognized. Retrying with explicit HLS type and headers`);
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = null;
          }
          safeSetState(() => setShowErrorModal(false));
          setPaused(true);
          setTimeout(() => {
            if (!isMounted.current) return;
            // Force HLS type and add cache-busting
            setCurrentVideoType('m3u8');
            const sep = currentStreamUrl.includes('?') ? '&' : '?';
            const retryUrl = `${currentStreamUrl}${sep}hls_retry=${Date.now()}`;
            setCurrentStreamUrl(retryUrl);
            setPaused(false);
          }, 120);
          return;
        } else {
          // For non-HLS streams, try flipping between HLS and MP4
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
            const retryUrl = `${currentStreamUrl}${sep}rn_type_retry=${Date.now()}`;
            setCurrentStreamUrl(retryUrl);
            setPaused(false);
          }, 120);
          return;
        }
      }

      // Handle HLS manifest parsing errors (when content isn't actually M3U8)
      const isManifestParseError = error?.error?.errorCode === '23002' ||
                                   error?.errorCode === '23002' ||
                                   (error?.error?.errorString &&
                                    error.error.errorString.includes('ERROR_CODE_PARSING_MANIFEST_MALFORMED'));

      if (isManifestParseError && retryAttemptRef.current < 2) {
        retryAttemptRef.current = 2;
        logger.warn('[AndroidVideoPlayer] HLS manifest parsing failed, likely not M3U8. Retrying as MP4');

        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        safeSetState(() => setShowErrorModal(false));
        setPaused(true);
        setTimeout(() => {
          if (!isMounted.current) return;
          setCurrentVideoType('mp4');
          // Force re-mount of source by tweaking URL param
          const sep = currentStreamUrl.includes('?') ? '&' : '?';
          const retryUrl = `${currentStreamUrl}${sep}manifest_fix_retry=${Date.now()}`;
          setCurrentStreamUrl(retryUrl);
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
        if (isServerConfigError) {
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
      
      // Auto-exit only when a modal is actually visible
      if (showErrorModal) {
        errorTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) {
            handleErrorExit();
          }
        }, 5000);
      }
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

  // Enhanced screen lock prevention - keep screen awake as soon as player mounts
  const keepAwakeModuleRef = useRef<any>(null);
  const keepAwakeActiveRef = useRef<boolean>(false);
  
  useEffect(() => {
    try {
      // Use require to avoid TS dynamic import constraints
      // If the module is unavailable, catch and ignore
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('expo-keep-awake');
      keepAwakeModuleRef.current = mod;
    } catch (_e) {
      keepAwakeModuleRef.current = null;
    }
  }, []);

  // Activate keep-awake immediately when player mounts and keep it active
  useEffect(() => {
    const mod = keepAwakeModuleRef.current;
    if (!mod) return;
    
    const activate = mod.activateKeepAwakeAsync || mod.activateKeepAwake;
    const deactivate = mod.deactivateKeepAwakeAsync || mod.deactivateKeepAwake;
    
    // Activate immediately when component mounts
    try {
      if (activate && !keepAwakeActiveRef.current) {
        activate();
        keepAwakeActiveRef.current = true;
        logger.log('[AndroidVideoPlayer] Screen lock prevention activated on mount');
      }
    } catch (error) {
      logger.warn('[AndroidVideoPlayer] Failed to activate keep-awake:', error);
    }

    // Keep it active throughout the entire player session
    const keepAliveInterval = setInterval(() => {
      try {
        if (activate && !keepAwakeActiveRef.current) {
          activate();
          keepAwakeActiveRef.current = true;
        }
      } catch (error) {
        logger.warn('[AndroidVideoPlayer] Failed to maintain keep-awake:', error);
      }
    }, 10000); // Reduced frequency from 5s to 10s to reduce overhead

    return () => {
      clearInterval(keepAliveInterval);
      try {
        if (deactivate && keepAwakeActiveRef.current) {
          deactivate();
          keepAwakeActiveRef.current = false;
          logger.log('[AndroidVideoPlayer] Screen lock prevention deactivated on unmount');
        }
      } catch (error) {
        logger.warn('[AndroidVideoPlayer] Failed to deactivate keep-awake:', error);
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Additional keep-awake activation on app state changes
  useEffect(() => {
    const mod = keepAwakeModuleRef.current;
    if (!mod) return;
    
    const activate = mod.activateKeepAwakeAsync || mod.activateKeepAwake;
    
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        try {
          if (activate && !keepAwakeActiveRef.current) {
            activate();
            keepAwakeActiveRef.current = true;
            logger.log('[AndroidVideoPlayer] Screen lock prevention re-activated on app foreground');
          }
        } catch (error) {
          logger.warn('[AndroidVideoPlayer] Failed to re-activate keep-awake on app foreground:', error);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);
  
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
      // REGULAR: Use regular sync for natural video end (not immediate since it's not user-triggered)
      logger.log('[AndroidVideoPlayer] Video ended naturally, sending final progress update with 100%');
      await traktAutosync.handleProgressUpdate(finalTime, duration, false); // force=false for regular sync

      // REGULAR: Use 'ended' reason for natural video end (uses regular queued method)
      logger.log('[AndroidVideoPlayer] Sending final stop call after natural end');
      await traktAutosync.handlePlaybackEnd(finalTime, duration, 'ended');

      logger.log('[AndroidVideoPlayer] Completed video end sync to Trakt');
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error syncing to Trakt on video end:', error);
    }
  };

  const selectAudioTrack = (trackSelection: SelectedTrack) => {
    if (DEBUG_MODE) {
      logger.log(`[AndroidVideoPlayer] Selecting audio track:`, trackSelection);
      logger.log(`[AndroidVideoPlayer] Available tracks:`, rnVideoAudioTracks);
    }

    // Validate track selection
    if (trackSelection.type === SelectedTrackType.INDEX) {
      const trackExists = rnVideoAudioTracks.some(track => track.id === trackSelection.value);
      if (!trackExists) {
        logger.error(`[AndroidVideoPlayer] Audio track ${trackSelection.value} not found in available tracks`);
        return;
      }

    }

    // If changing tracks, briefly pause to allow smooth transition
    const wasPlaying = !paused;
    if (wasPlaying) {
      setPaused(true);
    }

    // Set the new audio track
    setSelectedAudioTrack(trackSelection);

    if (DEBUG_MODE) {
      logger.log(`[AndroidVideoPlayer] Audio track changed to:`, trackSelection);
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

  // Wrapper function to convert number to SelectedTrack for modal usage
  const selectAudioTrackById = useCallback((trackId: number) => {
    if (useVLC) {
      // For VLC, directly set the selected track
      selectVlcAudioTrack(trackId);
    } else {
      // For RN Video, use the existing track selection system
      const trackSelection: SelectedTrack = { type: SelectedTrackType.INDEX, value: trackId };
      selectAudioTrack(trackSelection);
    }
  }, [useVLC, selectVlcAudioTrack, selectAudioTrack]);

  const selectTextTrack = useCallback((trackId: number) => {
    if (useVLC) {
      // For VLC, directly set the selected subtitle track and disable custom subtitles
      if (trackId === -999) {
        // Custom subtitles selected - disable embedded subtitles
        setUseCustomSubtitles(true);
        setSelectedTextTrack(-1);
        selectVlcSubtitleTrack(null); // Disable embedded subtitles
      } else {
        // Embedded subtitle selected - disable custom subtitles
        setUseCustomSubtitles(false);
        setSelectedTextTrack(trackId);
        selectVlcSubtitleTrack(trackId >= 0 ? trackId : null);
      }
    } else {
      // For RN Video, use existing subtitle selection logic
      if (trackId === -999) {
        setUseCustomSubtitles(true);
        setSelectedTextTrack(-1);
      } else {
        setUseCustomSubtitles(false);
        setSelectedTextTrack(trackId);
      }
    }
  }, [useVLC, selectVlcSubtitleTrack]);

  // Automatically disable VLC internal subtitles when external subtitles are enabled
  useEffect(() => {
    if (useVLC && useCustomSubtitles) {
      logger.log('[AndroidVideoPlayer][VLC] External subtitles enabled, disabling internal subtitles');
      selectVlcSubtitleTrack(null);
    }
  }, [useVLC, useCustomSubtitles, selectVlcSubtitleTrack]);

  const disableCustomSubtitles = useCallback(() => {
    setUseCustomSubtitles(false);
    setCustomSubtitles([]);
    // Reset to first available built-in track or disable all tracks
    if (useVLC) {
      selectVlcSubtitleTrack(ksTextTracks.length > 0 ? 0 : null);
    }
    setSelectedTextTrack(ksTextTracks.length > 0 ? 0 : -1);
  }, [useVLC, selectVlcSubtitleTrack, ksTextTracks.length]);

  const loadSubtitleSize = async () => {
    try {
      // Prefer scoped subtitle settings
      const saved = await storageService.getSubtitleSettings();
      if (saved && typeof saved.subtitleSize === 'number') {
        setSubtitleSize(saved.subtitleSize);
        return;
      }
      // One-time migrate legacy key if present
      const legacy = await AsyncStorage.getItem(SUBTITLE_SIZE_KEY);
      if (legacy) {
        const migrated = parseInt(legacy, 10);
        if (!Number.isNaN(migrated) && migrated > 0) {
          setSubtitleSize(migrated);
          try {
            const merged = { ...(saved || {}), subtitleSize: migrated };
            await storageService.saveSubtitleSettings(merged);
          } catch {}
        }
        try { await AsyncStorage.removeItem(SUBTITLE_SIZE_KEY); } catch {}
        return;
      }
      // If no saved settings, use default
      setSubtitleSize(DEFAULT_SUBTITLE_SIZE);
    } catch (error) {
      logger.error('[AndroidVideoPlayer] Error loading subtitle size:', error);
      // Fallback to default on error
      setSubtitleSize(DEFAULT_SUBTITLE_SIZE);
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
    
  const togglePlayback = useCallback(() => {
    const newPausedState = !paused;
    setPaused(newPausedState);

    if (duration > 0) {
      traktAutosync.handleProgressUpdate(currentTime, duration, true);
    }
  }, [paused, currentTime, duration, traktAutosync]);

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
            (navigation as any).replace('PlayerAndroid', {
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
      // Clear all timers and intervals
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
        seekDebounceTimer.current = null;
      }
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
      if (volumeOverlayTimeout.current) {
        clearTimeout(volumeOverlayTimeout.current);
        volumeOverlayTimeout.current = null;
      }
      if (brightnessOverlayTimeout.current) {
        clearTimeout(brightnessOverlayTimeout.current);
        brightnessOverlayTimeout.current = null;
      }
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
      if (pauseOverlayTimerRef.current) {
        clearTimeout(pauseOverlayTimerRef.current);
        pauseOverlayTimerRef.current = null;
      }
      if (gestureDebounceRef.current) {
        clearTimeout(gestureDebounceRef.current);
        gestureDebounceRef.current = null;
      }
      if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
        setProgressSaveInterval(null);
      }
      // Best-effort restore of Android system brightness state on unmount
      if (Platform.OS === 'android') {
        try {
          if (originalSystemBrightnessModeRef.current !== null && typeof (Brightness as any).setSystemBrightnessModeAsync === 'function') {
            (Brightness as any).setSystemBrightnessModeAsync(originalSystemBrightnessModeRef.current);
          }
          if (originalSystemBrightnessRef.current !== null && typeof (Brightness as any).setSystemBrightnessAsync === 'function') {
            (Brightness as any).setSystemBrightnessAsync(originalSystemBrightnessRef.current);
          }
        } catch (e) {
          logger.warn('[AndroidVideoPlayer] Failed to restore system brightness on unmount:', e);
        }
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
    const adjustedTime = currentTime + (subtitleOffsetSec || 0) - 0.2;
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
      if (selectedAudioTrack.type === SelectedTrackType.INDEX && selectedAudioTrack.value !== undefined) {
        const selectedTrack = rnVideoAudioTracks.find(track => track.id === selectedAudioTrack.value);
        if (selectedTrack) {
          if (DEBUG_MODE) {
            logger.log(`[AndroidVideoPlayer] Audio track selected: ${selectedTrack.name} (${selectedTrack.language}) - ID: ${selectedAudioTrack.value}`);
          }
        } else {
          logger.warn(`[AndroidVideoPlayer] Selected audio track ${selectedAudioTrack.value} not found in available tracks`);
        }
      } else if (selectedAudioTrack.type === SelectedTrackType.SYSTEM) {
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Using system audio selection`);
        }
      } else if (selectedAudioTrack.type === SelectedTrackType.DISABLED) {
        if (DEBUG_MODE) {
          logger.log(`[AndroidVideoPlayer] Audio disabled`);
        }
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
      } catch {} finally {
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

  const increaseSubtitleSize = () => {
    const newSize = Math.min(subtitleSize + 2, 80);
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

    // Note: iOS now always uses KSPlayer, so this AndroidVideoPlayer should never be used on iOS
    // This logic is kept for safety in case routing changes

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
      vlcLoadedRef.current = false;
      
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
          <Animated.View style={[
              StyleSheet.absoluteFill,
              {
                width: screenDimensions.width,
                height: screenDimensions.height,
                opacity: backdropImageOpacityAnim
              }
            ]}>
            <Image
              source={{ uri: backdrop }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          </Animated.View>
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
              <FastImage
                source={{ uri: metadata.logo }}
                style={{
                  width: 300,
                  height: 180,
                }}
                resizeMode={FastImage.resizeMode.contain}
              />
            </Animated.View>
            </>
          ) : (
            <>
          <ActivityIndicator size="large" color="#E50914" />
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
          activeOffsetY={[-5, 5]}
          failOffsetX={[-20, 20]}
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
          activeOffsetY={[-5, 5]}
          failOffsetX={[-20, 20]}
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
              >
                {useVLC && !forceVlcRemount ? (
                  <VlcVideoPlayer
                    ref={vlcPlayerRef}
                    source={processedStreamUrl}
                    volume={volume}
                    zoomScale={zoomScale}
                    resizeMode={resizeMode}
                    onLoad={(data) => {
                      vlcLoadedRef.current = true;
                      onLoad(data);
                      // Start playback if not paused
                      if (!paused && vlcPlayerRef.current) {
                        setTimeout(() => {
                          if (vlcPlayerRef.current) {
                            vlcPlayerRef.current.play();
                          }
                        }, 100);
                      }
                    }}
                    onProgress={(data) => {
                      const pos = typeof data?.position === 'number' ? data.position : 0;
                      if (duration > 0) {
                        const current = pos * duration;
                        handleProgress({ currentTime: current, playableDuration: current });
                      }
                    }}
                    onSeek={onSeek}
                    onEnd={onEnd}
                    onError={handleError}
                    onTracksUpdate={handleVlcTracksUpdate}
                    selectedAudioTrack={vlcSelectedAudioTrack}
                    selectedSubtitleTrack={vlcSelectedSubtitleTrack}
                    restoreTime={vlcRestoreTime}
                    forceRemount={forceVlcRemount}
                    key={vlcKey}
                  />
                ) : (
                  <Video
                      ref={videoRef}
                  style={[styles.video, customVideoStyles]}
                  source={{ 
                    uri: currentStreamUrl, 
                    headers: headers || getStreamHeaders(), 
                    type: isHlsStream(currentStreamUrl) ? 'm3u8' : (currentVideoType as any)
                  }}
                  paused={paused}
                    onLoadStart={() => {
                      logger.log('[AndroidVideoPlayer][RN Video] onLoadStart');
                      loadStartAtRef.current = Date.now();

                      // Log stream information for debugging
                      const streamInfo = {
                        url: currentStreamUrl,
                        isHls: isHlsStream(currentStreamUrl),
                        videoType: currentVideoType,
                        headers: headers || getStreamHeaders(),
                        provider: currentStreamProvider || streamProvider
                      };
                      logger.log('[AndroidVideoPlayer][RN Video] Stream info:', streamInfo);
                    }}
                  onProgress={handleProgress}
                  onLoad={(e) => {
                    logger.log('[AndroidVideoPlayer][RN Video] Video loaded successfully');
                    logger.log('[AndroidVideoPlayer][RN Video] onLoad fired', { duration: e?.duration });
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
                    logger.error('[AndroidVideoPlayer][RN Video] Encountered error:', err);
                    handleError(err);
                  }}
                  onBuffer={(buf) => {
                    logger.log('[AndroidVideoPlayer] onBuffer', buf);
                    onBuffer(buf);
                  }}
                  resizeMode={getVideoResizeMode(resizeMode)}
                  selectedAudioTrack={selectedAudioTrack || undefined}
                  selectedTextTrack={useCustomSubtitles ? { type: SelectedTrackType.DISABLED } : (selectedTextTrack >= 0 ? { type: SelectedTrackType.INDEX, value: selectedTextTrack } : undefined)}
                  rate={playbackSpeed}
                  volume={volume}
                  muted={false}
                  repeat={false}
                  playInBackground={false}
                  playWhenInactive={false}
                  ignoreSilentSwitch="ignore"
                  mixWithOthers="inherit"
                  progressUpdateInterval={500}
                  // Remove artificial bit rate cap to allow high-bitrate streams (e.g., Blu-ray remux) to play
                  // maxBitRate intentionally omitted
                  disableFocus={true}
                  // iOS AVPlayer optimization
                  allowsExternalPlayback={false as any}
                  preventsDisplaySleepDuringVideoPlayback={true as any}
                  // ExoPlayer HLS optimization - let the player use optimal defaults
                  // Use surfaceView on Android for improved compatibility
                  viewType={Platform.OS === 'android' ? ViewType.SURFACE : undefined}
                />
                )}
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
            ksAudioTracks={ksAudioTracks}
            selectedAudioTrack={computedSelectedAudioTrack}
            availableStreams={availableStreams}
            togglePlayback={togglePlayback}
            skip={skip}
            handleClose={handleClose}
            cycleAspectRatio={cycleAspectRatio}
            cyclePlaybackSpeed={cyclePlaybackSpeed}
            currentPlaybackSpeed={playbackSpeed}
            setShowAudioModal={setShowAudioModal}
            setShowSubtitleModal={setShowSubtitleModal}
            isSubtitleModalOpen={showSubtitleModal}
            setShowSourcesModal={setShowSourcesModal}
            onSliderValueChange={handleSliderValueChange}
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={handleSlidingComplete}
            buffered={buffered}
            formatTime={formatTime}
          playerBackend={useVLC ? 'VLC' : 'ExoPlayer'}
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
                zIndex: 50,
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


      <>
        <AudioTrackModal
        showAudioModal={showAudioModal}
        setShowAudioModal={setShowAudioModal}
        ksAudioTracks={useVLC ? vlcAudioTracks : rnVideoAudioTracks}
        selectedAudioTrack={useVLC ? (vlcSelectedAudioTrack ?? null) : (selectedAudioTrack?.type === SelectedTrackType.INDEX && selectedAudioTrack.value !== undefined ? Number(selectedAudioTrack.value) : null)}
        selectAudioTrack={selectAudioTrackById}
      />
      </>
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
        selectedTextTrack={computedSelectedTextTrack}
        useCustomSubtitles={useCustomSubtitles}
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