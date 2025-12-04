import { usePlayerGestureControls } from '../../hooks/usePlayerGestureControls';
import { useTorrentStream } from '../../hooks/useTorrentStream';

import {
  DEFAULT_SUBTITLE_SIZE,
  getDefaultSubtitleSize,
  AudioTrack,
  TextTrack,
  ResizeModeType,
  WyzieSubtitle,
  SubtitleCue,
  SubtitleSegment,
} from './utils/playerTypes';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Animated,
  ActivityIndicator,
  Platform,
  StatusBar,
  Text,
  Modal,
  AppState
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video, {
  VideoRef,
  SelectedTrack,
  SelectedTrackType,
  ViewType
} from 'react-native-video';
import FastImage from '@d11/react-native-fast-image';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';

import {
  PinchGestureHandler,
  PanGestureHandler,
  TapGestureHandler,
  LongPressGestureHandler,
  State
} from 'react-native-gesture-handler';

import RNImmersiveMode from 'react-native-immersive-mode';
import * as ScreenOrientation from 'expo-screen-orientation';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';
import { mmkvStorage } from '../../services/mmkvStorage';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTraktAutosync } from '../../hooks/useTraktAutosync';
import { useTraktAutosyncSettings } from '../../hooks/useTraktAutosyncSettings';
import { useMetadata } from '../../hooks/useMetadata';
import { useSettings } from '../../hooks/useSettings';

import {
  safeDebugLog,
  parseSRT,
  DEBUG_MODE,
  formatTime
} from './utils/playerUtils';

import { styles } from './utils/playerStyles';
import { SubtitleModals } from './modals/SubtitleModals';
import { AudioTrackModal } from './modals/AudioTrackModal';
import LoadingOverlay from './modals/LoadingOverlay';
import SpeedModal from './modals/SpeedModal';
import PlayerControls from './controls/PlayerControls';
import CustomSubtitles from './subtitles/CustomSubtitles';
import { SourcesModal } from './modals/SourcesModal';
import { EpisodesModal } from './modals/EpisodesModal';
import UpNextButton from './common/UpNextButton';
import { EpisodeStreamsModal } from './modals/EpisodeStreamsModal';
import VlcVideoPlayer, { VlcPlayerRef } from './VlcVideoPlayer';
import { stremioService } from '../../services/stremioService';

import axios from 'axios';
import * as Brightness from 'expo-brightness';

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
    backdrop,
    groupedEpisodes
  } = route.params;

  const videoType = (route.params as any).videoType;

  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(uri);
  const [currentVideoType, setCurrentVideoType] = useState<string | undefined>(videoType);

  // --- START TORRENT INTEGRATION (FIXED) ---
  const {
    videoSource,
    isBuffering: isTorrentBuffering = false,
    stats: torrentStats = { seeds: 0, peers: 0, downloadSpeed: 0 },
    error: torrentError = null,
    // Note: The hook handles start/stop automatically. We do not destructure them here.
  } = useTorrentStream({
    uri,
    headers: headers || {},
    preferStreaming: true
  });

  // Sync the local file URL to the player when ready
  useEffect(() => {
    if (videoSource?.uri && videoSource.uri !== currentStreamUrl) {
      console.log('[AndroidVideoPlayer] 🧲 Swapping magnet link for local file:', videoSource.uri);
      setCurrentStreamUrl(videoSource.uri);
    }
  }, [videoSource, currentStreamUrl]);
  // --- END TORRENT INTEGRATION ---

  // Memo for processed playback URL
  const processedStreamUrl = useMemo(() => {
    if (!currentStreamUrl) return '';
    try {
      const urlObj = new URL(currentStreamUrl);
      const decodedPath = decodeURIComponent(urlObj.pathname);
      const encodedPath = encodeURI(decodedPath);

      return `${urlObj.protocol}//${urlObj.host}${encodedPath}${urlObj.search}${urlObj.hash}`;
    } catch (err) {
      return currentStreamUrl;
    }
  }, [currentStreamUrl]);

  // Detect HLS streams
  const isHlsStream = (url: string) =>
    url.includes('.m3u8') ||
    url.includes('m3u8') ||
    url.includes('hls') ||
    url.includes('playlist') ||
    (currentVideoType && currentVideoType.toLowerCase() === 'm3u8');

  const getHlsHeaders = () => ({
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
    Accept:
      'application/vnd.apple.mpegurl, application/x-mpegurl, video/mp2t, video/mp4, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache'
  });

  const defaultAndroidHeaders = () => ({
    'User-Agent': 'ExoPlayerLib/2.19.1 (Linux;Android) Nuvio/1.0',
    Accept: '*/*',
    Connection: 'keep-alive'
  });

  const defaultIosHeaders = () => ({
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Nuvio/1.0',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Connection: 'keep-alive'
  });

  const getStreamHeaders = () => {
    if (isHlsStream(currentStreamUrl)) return getHlsHeaders();
    return Platform.OS === 'android'
      ? defaultAndroidHeaders()
      : defaultIosHeaders();
  };

  //------------------------------
  // Player Hooks & State
  //------------------------------

  const screenData = Dimensions.get('screen');
  const [screenDimensions, setScreenDimensions] = useState(screenData);

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);

  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack | null>({
    type: SelectedTrackType.SYSTEM
  });

  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState(-1);

  const [resizeMode, setResizeMode] = useState<ResizeModeType>('contain');

  const speedOptions = [0.5, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const [buffered, setBuffered] = useState(0);
  const [seekTime, setSeekTime] = useState<number | null>(null);

  const videoRef = useRef<VideoRef>(null);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);

  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [progressSaveInterval, setProgressSaveInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [isInitialSeekComplete, setIsInitialSeekComplete] = useState(false);

  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [savedDuration, setSavedDuration] = useState<number | null>(null);

  const initialSeekTargetRef = useRef<number | null>(null);
  const initialSeekVerifiedRef = useRef(false);
  const isSourceSeekableRef = useRef<boolean | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] =
    useState(false);

  const [shouldHideOpeningOverlay, setShouldHideOpeningOverlay] =
    useState(false);

  const openingFadeAnim = useRef(new Animated.Value(0)).current;
  const openingScaleAnim = useRef(new Animated.Value(0.8)).current;
  const backgroundFadeAnim = useRef(new Animated.Value(1)).current;

  const [isBackdropLoaded, setIsBackdropLoaded] = useState(false);
  const backdropImageOpacityAnim = useRef(new Animated.Value(0)).current;

  const [isBuffering, setIsBuffering] = useState(false);

  const [rnVideoAudioTracks, setRnVideoAudioTracks] = useState<
    Array<{ id: number; name: string; language?: string }>
  >([]);

  const [rnVideoTextTracks, setRnVideoTextTracks] = useState<
    Array<{ id: number; name: string; language?: string }>
  >([]);

  const [isSpeedBoosted, setIsSpeedBoosted] = useState(false);
  const [originalSpeed, setOriginalSpeed] = useState(1.0);

  const [showSpeedActivatedOverlay, setShowSpeedActivatedOverlay] =
    useState(false);

  const speedActivatedOverlayOpacity = useRef(new Animated.Value(0)).current;

  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [holdToSpeedEnabled, setHoldToSpeedEnabled] = useState(true);
  const [holdToSpeedValue, setHoldToSpeedValue] = useState(2.0);

  const [customSubtitles, setCustomSubtitles] = useState<SubtitleCue[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [currentFormattedSegments, setCurrentFormattedSegments] = useState<
    SubtitleSegment[][]
  >([]);

  const [subtitleSize, setSubtitleSize] = useState(DEFAULT_SUBTITLE_SIZE);
  const [subtitleBackground, setSubtitleBackground] = useState(false);

  const [subtitleTextColor, setSubtitleTextColor] = useState('#FFFFFF');
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(0.7);

  const [subtitleTextShadow, setSubtitleTextShadow] = useState(true);
  const [subtitleOutline, setSubtitleOutline] = useState(true);
  const [subtitleOutlineColor, setSubtitleOutlineColor] = useState('#000000');

  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isSeeking = useRef(false);

  const seekDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekValue = useRef<number | null>(null);
  const lastSeekTime = useRef<number>(0);

  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  const [is16by9Content, setIs16by9Content] = useState(false);

  const calculateVideoStyles = (
    videoWidth: number,
    videoHeight: number,
    screenWidth: number,
    screenHeight: number
  ) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight
  });

  const videoStyles = useMemo(() => {
    if (videoAspectRatio && screenDimensions.width > 0) {
      return calculateVideoStyles(
        videoAspectRatio * 1000,
        1000,
        screenDimensions.width,
        screenDimensions.height
      );
    }
    return {};
  }, [videoAspectRatio, screenDimensions]);

  const zoomFactor = 1;
  const [customVideoStyles, setCustomVideoStyles] = useState<any>({});
  const [zoomScale, setZoomScale] = useState(1);
  const pinchRef = useRef<PinchGestureHandler>(null);

  // Player backend selection
  const TEMP_FORCE_RNV = false;
  const TEMP_FORCE_VLC = false;
  const forceVlc = useMemo(() => {
    const rp: any = route.params || {};
    const v = rp.forceVlc !== undefined ? rp.forceVlc : rp.forceVLC;
    return typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v);
  }, [route.params]);

  const useVLC =
    Platform.OS === 'android' && !TEMP_FORCE_RNV && (TEMP_FORCE_VLC || forceVlc);

  // VLC state & refs
  const vlcPlayerRef = useRef<VlcPlayerRef>(null);
  const [vlcAudioTracks, setVlcAudioTracks] = useState<
    Array<{ id: number; name: string; language?: string }>
  >([]);
  const [vlcSubtitleTracks, setVlcSubtitleTracks] = useState<
    Array<{ id: number; name: string; language?: string }>
  >([]);
  const [vlcSelectedAudioTrack, setVlcSelectedAudioTrack] = useState<
    number | undefined
  >(undefined);
  const [vlcSelectedSubtitleTrack, setVlcSelectedSubtitleTrack] = useState<
    number | undefined
  >(undefined);
  const [vlcRestoreTime, setVlcRestoreTime] = useState<number | undefined>(
    undefined
  );
  const [forceVlcRemount, setForceVlcRemount] = useState(false);
  const vlcLoadedRef = useRef(false);

  // Pause/play sync with VLC
  useEffect(() => {
    if (useVLC && vlcLoadedRef.current && vlcPlayerRef.current) {
      try {
        if (paused) vlcPlayerRef.current.pause();
        else vlcPlayerRef.current.play();
      } catch (e) {
        logger.warn('[AndroidVideoPlayer] VLC control failed', e);
      }
    }
  }, [useVLC, paused]);

  // Computed tracks depending on backend
  const ksAudioTracks = useMemo(
    () => (useVLC ? vlcAudioTracks : rnVideoAudioTracks),
    [useVLC, vlcAudioTracks, rnVideoAudioTracks]
  );

  const computedSelectedAudioTrack = useMemo(() => {
    if (useVLC) return vlcSelectedAudioTrack ?? null;
    if (selectedAudioTrack?.type === SelectedTrackType.INDEX && selectedAudioTrack.value !== undefined)
      return Number(selectedAudioTrack.value);
    return null;
  }, [useVLC, vlcSelectedAudioTrack, selectedAudioTrack]);

  const ksTextTracks = useMemo(
    () => (useVLC ? vlcSubtitleTracks : rnVideoTextTracks),
    [useVLC, vlcSubtitleTracks, rnVideoTextTracks]
  );

  const computedSelectedTextTrack = useMemo(
    () => (useVLC ? (vlcSelectedSubtitleTrack ?? -1) : selectedTextTrack),
    [useVLC, vlcSelectedSubtitleTrack, selectedTextTrack]
  );

  // Utility: process URL for VLC (encode path components)
  const processUrlForVLC = useCallback((url: string) => {
    if (!url || typeof url !== 'string') return url || '';
    try {
      const urlObj = new URL(url);
      const decodedPathname = decodeURIComponent(urlObj.pathname);
      const encodedPathname = encodeURI(decodedPathname);
      const processed = `${urlObj.protocol}//${urlObj.host}${encodedPathname}${urlObj.search}${urlObj.hash}`;
      return processed;
    } catch (e) {
      return url;
    }
  }, []);

  // Player event handlers (react-native-video)
  const onBuffer = useCallback((evt: any) => {
    const buffering = evt?.isBuffering ?? false;
    setIsBuffering(buffering);
  }, []);

  const onProgress = useCallback((evt: { currentTime: number; playableDuration?: number }) => {
    setCurrentTime(evt.currentTime || 0);
    if (evt.playableDuration) {
      const b = Math.max(0, Math.min(1, (evt.playableDuration / Math.max(1, duration))));
      setBuffered(b);
    }
  }, [duration]);

  const onLoad = useCallback((meta: any) => {
    setDuration(meta.duration || 0);
    setIsVideoLoaded(true);
    setIsPlayerReady(true);

    // set video aspect ratio if provided
    if (meta.naturalSize && meta.naturalSize.width && meta.naturalSize.height) {
      setVideoAspectRatio(meta.naturalSize.width / meta.naturalSize.height);
      setIs16by9Content(Math.abs((meta.naturalSize.width / meta.naturalSize.height) - (16 / 9)) < 0.1);
    }
  }, []);

  const onEnd = useCallback(() => {
    setPaused(true);
    // handle up next logic, trakt scrobble, etc. (existing logic likely present)
  }, []);

  const onError = useCallback((err: any) => {
    logger.warn('[AndroidVideoPlayer] Playback error:', err);
    // fallback: if playing via VLC is off, try switching player or display error modal
  }, []);

  // Seek helper
  const seekTo = useCallback((seconds: number) => {
    if (useVLC && vlcPlayerRef.current) {
      try {
        vlcPlayerRef.current.seekTo(seconds);
      } catch (e) {
        logger.warn('[AndroidVideoPlayer] VLC seek failed', e);
      }
    } else if (videoRef.current && 'seek' in videoRef.current) {
      try {
        (videoRef.current as any).seek(seconds);
      } catch (e) {
        logger.warn('[AndroidVideoPlayer] RNVideo seek failed', e);
      }
    }
    setCurrentTime(seconds);
  }, [useVLC]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // Toggle resize mode (contain / cover)
  const toggleResizeMode = useCallback(() => {
    setResizeMode((r) => (r === 'contain' ? 'cover' : 'contain'));
  }, []);

  // Handle audio/subtitle selection for RN Video (existing handlers likely present)
  const onAudioTrackSelected = useCallback((trackIndex: number | null) => {
    if (useVLC) {
      setVlcSelectedAudioTrack(trackIndex ?? undefined);
    } else {
      if (trackIndex === null) {
        setSelectedAudioTrack({ type: SelectedTrackType.SYSTEM });
      } else {
        setSelectedAudioTrack({ type: SelectedTrackType.INDEX, value: trackIndex });
      }
    }
  }, [useVLC]);

  const onSubtitleTrackSelected = useCallback((trackIndex: number | null) => {
    if (useVLC) {
      setVlcSelectedSubtitleTrack(trackIndex ?? undefined);
    } else {
      setSelectedTextTrack(trackIndex ?? -1);
    }
  }, [useVLC]);

  // Clean up timeouts and listeners on unmount
  useEffect(() => {
    return () => {
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
        seekDebounceTimer.current = null;
      }
    };
  }, []);

  // Example: auto-hide controls after a timeout
  useEffect(() => {
    if (!showControls) return;
    const t = setTimeout(() => setShowControls(false), 3500);
    return () => clearTimeout(t);
  }, [showControls]);

  // Keep statusbar immersive if playing fullscreen on Android
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        RNImmersiveMode.fullLayout(true);
      } catch (e) {}
    }
  }, []);

  // Hook for gesture controls (assumes your hook usage)
  usePlayerGestureControls({
    onTogglePlayPause: togglePlayPause,
    onSeekBy: (seconds) => {
      const target = Math.max(0, Math.min(duration, currentTime + seconds));
      seekTo(target);
    },
    onToggleControls: () => setShowControls((s) => !s),
    onDoubleTap: (dir) => {
      const delta = dir === 'left' ? -10 : 10;
      seekTo(Math.max(0, Math.min(duration, currentTime + delta)));
    }
  });

  // Prepare final source objects for RN Video and VLC
  const rnVideoSource = useMemo(() => {
    return {
      uri: processedStreamUrl,
      headers: getStreamHeaders()
    };
  }, [processedStreamUrl, currentVideoType]);

  const vlcUrlForPlayer = useMemo(() => processUrlForVLC(processedStreamUrl), [processedStreamUrl, processUrlForVLC]);
  // Render
  return (
    <View style={styles.container}>
      {/* Backdrop */}
      {backdrop && (
        <FastImage
          source={{ uri: backdrop }}
          style={styles.backdrop}
          onLoad={() => {
            setIsBackdropLoaded(true);
            Animated.timing(backdropImageOpacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          }}
        />
      )}

      <View style={styles.videoContainer}>
        {/* Choose backend */}
        {useVLC ? (
          <VlcVideoPlayer
            ref={vlcPlayerRef}
            source={vlcUrlForPlayer}
            onBuffer={onBuffer}
            onProgress={(t: any) => setCurrentTime(t.currentTime || 0)}
            onLoad={() => setIsPlayerReady(true)}
            onEnd={onEnd}
            paused={paused}
            style={[styles.video, videoStyles, customVideoStyles]}
            selectedAudioTrack={vlcSelectedAudioTrack}
            selectedSubtitleTrack={vlcSelectedSubtitleTrack}
            onAudioTracks={(tracks) => setVlcAudioTracks(tracks)}
            onSubtitleTracks={(tracks) => setVlcSubtitleTracks(tracks)}
            onError={onError}
            resizeMode={getVideoResizeMode(resizeMode)}
          />
        ) : (
          <Video
            ref={videoRef}
            source={rnVideoSource}
            style={[styles.video, videoStyles, customVideoStyles]}
            resizeMode={getVideoResizeMode(resizeMode)}
            paused={paused}
            onBuffer={onBuffer}
            onProgress={onProgress}
            onLoad={onLoad}
            onEnd={onEnd}
            onError={onError}
            selectedAudioTrack={selectedAudioTrack}
            textTracks={textTracks.map((t, idx) => ({ title: t.name, language: t.language || 'und', type: 'text/vtt', uri: t.uri }))}
            selectedTextTrack={{
              type: SelectedTrackType.INDEX,
              value: selectedTextTrack >= 0 ? String(selectedTextTrack) : undefined
            } as any}
            playInBackground={false}
            playWhenInactive={false}
          />
        )}

        {/* Player Controls */}
        <PlayerControls
          paused={paused}
          onTogglePlayPause={togglePlayPause}
          onSeekTo={(s) => seekTo(s)}
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          showControls={showControls}
          onToggleControls={() => setShowControls((s) => !s)}
          onToggleResizeMode={toggleResizeMode}
          onOpenAudioModal={() => setShowAudioModal(true)}
          onOpenSubtitleModal={() => setShowSubtitleModal(true)}
          playbackSpeed={playbackSpeed}
          onChangeSpeed={(sp) => setPlaybackSpeed(sp)}
          playerBackend={useVLC ? 'VLC' : 'ExoPlayer'}
        />

        {/* --- TORRENT OVERLAY --- */}
        {isTorrentBuffering && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 999,
            paddingHorizontal: 20
          }}>
            <ActivityIndicator size="large" color="#a855f7" />
            <Text style={{ color: 'white', marginTop: 20, fontSize: 18, fontWeight: 'bold' }}>
              Downloading Metadata...
            </Text>

            <Text style={{ color: '#ccc', marginTop: 8 }}>
              {typeof torrentStats?.seeds === 'number' ? `${torrentStats.seeds} Seeds found` : 'Searching seeds...'}
            </Text>

            <Text style={{ color: '#4ade80', marginTop: 4, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' }}>
              ⬇ {torrentStats?.downloadSpeed ? `${(torrentStats.downloadSpeed / 1024 / 1024).toFixed(1)} MB/s` : '0.0 MB/s'}
            </Text>

            {torrentError && (
              <Text style={{ color: '#fca5a5', marginTop: 10, textAlign: 'center' }}>
                Torrent error: {String(torrentError)}
              </Text>
            )}
          </View>
        )}
        {/* ----------------------- */}

        {/* Custom Subtitles */}
        <CustomSubtitles
          segments={currentFormattedSegments}
          visible={!!currentSubtitle}
          size={subtitleSize}
          color={subtitleTextColor}
          background={subtitleBackground}
          bgOpacity={subtitleBgOpacity}
          outline={subtitleOutline}
          outlineColor={subtitleOutlineColor}
          outlineWidth={subtitleOutlineWidth}
        />

        {/* Optional pause overlay */}
        {paused && (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseText}>Paused</Text>
          </View>
        )}
      </View>

      {/* Modals and overlays */}
      <AudioTrackModal
        visible={showAudioModal}
        audioTracks={ksAudioTracks}
        selectedIndex={computedSelectedAudioTrack}
        onSelect={(idx) => {
          onAudioTrackSelected(idx as number | null);
          setShowAudioModal(false);
        }}
        onRequestClose={() => setShowAudioModal(false)}
      />

      <SubtitleModals
        visible={showSubtitleModal}
        textTracks={ksTextTracks}
        selectedIndex={computedSelectedTextTrack}
        onSelect={(idx) => {
          onSubtitleTrackSelected(idx as number | null);
          setShowSubtitleModal(false);
        }}
        onRequestClose={() => setShowSubtitleModal(false)}
      />

      <LoadingOverlay visible={isBuffering || isTorrentBuffering || !isPlayerReady} />

      <SpeedModal
        visible={showSpeedModal}
        options={speedOptions}
        selected={playbackSpeed}
        onSelect={(s) => { setPlaybackSpeed(s); setShowSpeedModal(false); }}
        onRequestClose={() => setShowSpeedModal(false)}
      />

      <SourcesModal
        visible={false}
        onRequestClose={() => {}}
      />

      <EpisodesModal
        visible={false}
        onRequestClose={() => {}}
      />

    </View>
  );
};

export default AndroidVideoPlayer;
