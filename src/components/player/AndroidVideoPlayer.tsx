import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { View, StyleSheet, Platform, Animated, ToastAndroid } from 'react-native';
import { toast } from '@backpackapp-io/react-native-toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';

// Shared Hooks (cross-platform)
import {
  usePlayerState,
  usePlayerModals,
  useSpeedControl,
  useOpeningAnimation,
  useWatchProgress
} from './hooks';

// Android-specific hooks
import { usePlayerSetup } from './android/hooks/usePlayerSetup';
import { usePlayerTracks } from './android/hooks/usePlayerTracks';

import { usePlayerControls } from './android/hooks/usePlayerControls';
import { useNextEpisode } from './android/hooks/useNextEpisode';

// App-level Hooks
import { useTraktAutosync } from '../../hooks/useTraktAutosync';
import { useMetadata } from '../../hooks/useMetadata';
import { usePlayerGestureControls } from '../../hooks/usePlayerGestureControls';
import { useSettings } from '../../hooks/useSettings';

// Shared Components
import { GestureControls, PauseOverlay, SpeedActivatedOverlay } from './components';
import LoadingOverlay from './modals/LoadingOverlay';
import PlayerControls from './controls/PlayerControls';
import { AudioTrackModal } from './modals/AudioTrackModal';
import { SubtitleModals } from './modals/SubtitleModals';
import SpeedModal from './modals/SpeedModal';
import { SourcesModal } from './modals/SourcesModal';
import { EpisodesModal } from './modals/EpisodesModal';
import { EpisodeStreamsModal } from './modals/EpisodeStreamsModal';
import { ErrorModal } from './modals/ErrorModal';
import { CustomSubtitles } from './subtitles/CustomSubtitles';
import ParentalGuideOverlay from './overlays/ParentalGuideOverlay';
import SkipIntroButton from './overlays/SkipIntroButton';
import UpNextButton from './common/UpNextButton';

// Android-specific components
import { VideoSurface } from './android/components/VideoSurface';
import { MpvPlayerRef } from './android/MpvPlayer';

// Utils
import { logger } from '../../utils/logger';
import { styles } from './utils/playerStyles';
import { formatTime, isHlsStream, getHlsHeaders, defaultAndroidHeaders, parseSRT } from './utils/playerUtils';
import { storageService } from '../../services/storageService';
import stremioService from '../../services/stremioService';
import { WyzieSubtitle, SubtitleCue } from './utils/playerTypes';
import axios from 'axios';

const DEBUG_MODE = false;

const AndroidVideoPlayer: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerAndroid'>>();
  const insets = useSafeAreaInsets();

  const {
    uri, title = 'Episode Name', season, episode, episodeTitle, quality, year,
    streamProvider, streamName, headers, id, type, episodeId, imdbId,
    availableStreams: passedAvailableStreams, backdrop, groupedEpisodes
  } = route.params;

  // --- State & Custom Hooks ---

  const playerState = usePlayerState();
  const modals = usePlayerModals();
  const speedControl = useSpeedControl();
  const { settings } = useSettings();

  const videoRef = useRef<any>(null);
  const mpvPlayerRef = useRef<MpvPlayerRef>(null);
  const exoPlayerRef = useRef<any>(null);
  const pinchRef = useRef(null);
  const tracksHook = usePlayerTracks();

  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(uri);
  const [currentVideoType, setCurrentVideoType] = useState<string | undefined>((route.params as any).videoType);

  const [availableStreams, setAvailableStreams] = useState<any>(passedAvailableStreams || {});
  const [currentQuality, setCurrentQuality] = useState(quality);
  const [currentStreamProvider, setCurrentStreamProvider] = useState(streamProvider);
  const [currentStreamName, setCurrentStreamName] = useState(streamName);

  // State to force unmount VideoSurface during stream transitions
  const [isTransitioningStream, setIsTransitioningStream] = useState(false);

  // Dual video engine state: ExoPlayer primary, MPV fallback
  // If videoPlayerEngine is 'mpv', always use MPV; otherwise use auto behavior
  const [useExoPlayer, setUseExoPlayer] = useState(settings.videoPlayerEngine !== 'mpv');
  const hasExoPlayerFailed = useRef(false);

  // Sync useExoPlayer with settings when videoPlayerEngine changes
  useEffect(() => {
    if (settings.videoPlayerEngine === 'mpv') {
      setUseExoPlayer(false);
    }
    // Note: We don't reset to true when 'auto' because ExoPlayer might have failed
  }, [settings.videoPlayerEngine]);

  // Subtitle addon state
  const [availableSubtitles, setAvailableSubtitles] = useState<WyzieSubtitle[]>([]);
  const [isLoadingSubtitleList, setIsLoadingSubtitleList] = useState(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  const [useCustomSubtitles, setUseCustomSubtitles] = useState(false);
  const [customSubtitles, setCustomSubtitles] = useState<SubtitleCue[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');

  // Subtitle customization state
  const [subtitleSize, setSubtitleSize] = useState(28);
  const [subtitleBackground, setSubtitleBackground] = useState(false);
  const [subtitleTextColor, setSubtitleTextColor] = useState('#FFFFFF');
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(0.7);
  const [subtitleTextShadow, setSubtitleTextShadow] = useState(true);
  const [subtitleOutline, setSubtitleOutline] = useState(true);
  const [subtitleOutlineColor, setSubtitleOutlineColor] = useState('#000000');
  const [subtitleOutlineWidth, setSubtitleOutlineWidth] = useState(3);
  const [subtitleAlign, setSubtitleAlign] = useState<'center' | 'left' | 'right'>('center');
  const [subtitleBottomOffset, setSubtitleBottomOffset] = useState(20);
  const [subtitleLetterSpacing, setSubtitleLetterSpacing] = useState(0);
  const [subtitleLineHeightMultiplier, setSubtitleLineHeightMultiplier] = useState(1.2);
  const [subtitleOffsetSec, setSubtitleOffsetSec] = useState(0);

  const metadataResult = useMetadata({ id: id || 'placeholder', type: (type as any) });
  const { metadata, cast } = Boolean(id && type) ? (metadataResult as any) : { metadata: null, cast: [] };
  const hasLogo = metadata && metadata.logo;
  const openingAnimation = useOpeningAnimation(backdrop, metadata);

  const [volume, setVolume] = useState(1.0);
  const [brightness, setBrightness] = useState(1.0);
  const setupHook = usePlayerSetup(playerState.setScreenDimensions, setVolume, setBrightness, playerState.paused);

  const controlsHook = usePlayerControls(
    mpvPlayerRef,
    playerState.paused,
    playerState.setPaused,
    playerState.currentTime,
    playerState.duration,
    playerState.isSeeking,
    playerState.isMounted,
    exoPlayerRef,
    useExoPlayer
  );

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

  const watchProgress = useWatchProgress(
    id, type, episodeId,
    playerState.currentTime,
    playerState.duration,
    playerState.paused,
    traktAutosync,
    controlsHook.seekToTime
  );

  const gestureControls = usePlayerGestureControls({
    volume,
    setVolume,
    brightness,
    setBrightness,
    volumeRange: { min: 0, max: 1 },
    volumeSensitivity: 0.006,
    brightnessSensitivity: 0.004,
    debugMode: DEBUG_MODE,
  });

  const nextEpisodeHook = useNextEpisode(type, season, episode, groupedEpisodes, (metadataResult as any)?.groupedEpisodes, episodeId);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: playerState.showControls ? 1 : 0,
      duration: 300,
      useNativeDriver: true
    }).start();
  }, [playerState.showControls]);

  useEffect(() => {
    openingAnimation.startOpeningAnimation();
  }, []);

  // Load subtitle settings on mount
  useEffect(() => {
    const loadSubtitleSettings = async () => {
      const settings = await storageService.getSubtitleSettings();
      if (settings) {
        if (settings.subtitleSize !== undefined) setSubtitleSize(settings.subtitleSize);
        if (settings.subtitleBackground !== undefined) setSubtitleBackground(settings.subtitleBackground);
        if (settings.subtitleTextColor !== undefined) setSubtitleTextColor(settings.subtitleTextColor);
        if (settings.subtitleBgOpacity !== undefined) setSubtitleBgOpacity(settings.subtitleBgOpacity);
        if (settings.subtitleTextShadow !== undefined) setSubtitleTextShadow(settings.subtitleTextShadow);
        if (settings.subtitleOutline !== undefined) setSubtitleOutline(settings.subtitleOutline);
        if (settings.subtitleOutlineColor !== undefined) setSubtitleOutlineColor(settings.subtitleOutlineColor);
        if (settings.subtitleOutlineWidth !== undefined) setSubtitleOutlineWidth(settings.subtitleOutlineWidth);
        if (settings.subtitleAlign !== undefined) setSubtitleAlign(settings.subtitleAlign);
        if (settings.subtitleBottomOffset !== undefined) setSubtitleBottomOffset(settings.subtitleBottomOffset);
        if (settings.subtitleLetterSpacing !== undefined) setSubtitleLetterSpacing(settings.subtitleLetterSpacing);
        if (settings.subtitleLineHeightMultiplier !== undefined) setSubtitleLineHeightMultiplier(settings.subtitleLineHeightMultiplier);
      }
    };
    loadSubtitleSettings();
  }, []);

  // Save subtitle settings when they change
  useEffect(() => {
    const saveSettings = async () => {
      await storageService.saveSubtitleSettings({
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
      });
    };
    saveSettings();
  }, [
    subtitleSize, subtitleBackground, subtitleTextColor, subtitleBgOpacity,
    subtitleTextShadow, subtitleOutline, subtitleOutlineColor, subtitleOutlineWidth,
    subtitleAlign, subtitleBottomOffset, subtitleLetterSpacing, subtitleLineHeightMultiplier
  ]);

  const handleLoad = useCallback((data: any) => {
    if (!playerState.isMounted.current) return;

    const videoDuration = data.duration;
    console.log('[AndroidVideoPlayer] handleLoad called:', {
      duration: videoDuration,
      initialPosition: watchProgress.initialPosition,
      showResumeOverlay: watchProgress.showResumeOverlay,
      initialSeekTarget: watchProgress.initialSeekTargetRef?.current
    });

    if (videoDuration > 0) {
      playerState.setDuration(videoDuration);
      if (id && type) {
        storageService.setContentDuration(id, type, videoDuration, episodeId);
        storageService.updateProgressDuration(id, type, videoDuration, episodeId);
      }
    }

    if (data.naturalSize) {
      playerState.setVideoAspectRatio(data.naturalSize.width / data.naturalSize.height);
    } else {
      playerState.setVideoAspectRatio(16 / 9);
    }

    if (data.audioTracks) {
      const formatted = data.audioTracks.map((t: any, i: number) => ({
        id: t.index !== undefined ? t.index : i,
        name: t.title || t.name || `Track ${i + 1}`,
        language: t.language
      }));
      tracksHook.setRnVideoAudioTracks(formatted);
    }
    if (data.textTracks) {
      const formatted = data.textTracks.map((t: any, i: number) => ({
        id: t.index !== undefined ? t.index : i,
        name: t.title || t.name || `Track ${i + 1}`,
        language: t.language
      }));
      tracksHook.setRnVideoTextTracks(formatted);
    }

    playerState.setIsVideoLoaded(true);
    openingAnimation.completeOpeningAnimation();

    // Handle Resume - check both initialPosition and initialSeekTargetRef
    const resumeTarget = watchProgress.initialPosition || watchProgress.initialSeekTargetRef?.current;
    if (resumeTarget && resumeTarget > 0 && !watchProgress.showResumeOverlay && videoDuration > 0) {
      console.log('[AndroidVideoPlayer] Seeking to resume position:', resumeTarget, 'duration:', videoDuration);
      // Use a small delay to ensure the player is ready, then seek directly
      setTimeout(() => {
        if (mpvPlayerRef.current) {
          console.log('[AndroidVideoPlayer] Calling mpvPlayerRef.current.seek directly');
          mpvPlayerRef.current.seek(Math.min(resumeTarget, videoDuration - 0.5));
        }
      }, 200);
    }
  }, [id, type, episodeId, playerState.isMounted, watchProgress.initialPosition]);

  const handleProgress = useCallback((data: any) => {
    if (playerState.isDragging.current || playerState.isSeeking.current || !playerState.isMounted.current || setupHook.isAppBackgrounded.current) return;
    const currentTimeInSeconds = data.currentTime;
    if (Math.abs(currentTimeInSeconds - playerState.currentTime) > 0.5) {
      playerState.setCurrentTime(currentTimeInSeconds);
      playerState.setBuffered(data.playableDuration || currentTimeInSeconds);
    }
  }, [playerState.currentTime, playerState.isDragging, playerState.isSeeking, setupHook.isAppBackgrounded]);

  // Sync custom subtitle text with current playback time
  useEffect(() => {
    if (!useCustomSubtitles || customSubtitles.length === 0) return;

    const cueNow = customSubtitles.find(
      cue => playerState.currentTime >= cue.start && playerState.currentTime <= cue.end
    );
    setCurrentSubtitle(cueNow ? cueNow.text : '');
  }, [playerState.currentTime, useCustomSubtitles, customSubtitles]);

  const toggleControls = useCallback(() => {
    playerState.setShowControls(prev => !prev);
  }, []);

  const hideControls = useCallback(() => {
    if (playerState.isDragging.current) return;
    playerState.setShowControls(false);
  }, []);

  const loadStartAtRef = useRef<number | null>(null);
  const firstFrameAtRef = useRef<number | null>(null);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleClose = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Home' }] } as any);
  }, [navigation]);

  // Handle codec errors from ExoPlayer - silently switch to MPV
  const handleCodecError = useCallback(() => {
    if (!hasExoPlayerFailed.current) {
      hasExoPlayerFailed.current = true;
      logger.warn('[AndroidVideoPlayer] ExoPlayer codec error detected, switching to MPV silently');
      ToastAndroid.show('Switching to MPV due to unsupported codec', ToastAndroid.SHORT);
      setUseExoPlayer(false);
    }
  }, []);

  const handleSelectStream = async (newStream: any) => {
    if (newStream.url === currentStreamUrl) {
      modals.setShowSourcesModal(false);
      return;
    }
    modals.setShowSourcesModal(false);
    playerState.setPaused(true);

    // Unmount VideoSurface first to ensure MPV is fully destroyed
    setIsTransitioningStream(true);

    const newQuality = newStream.quality || newStream.title?.match(/(\d+)p/)?.[0];
    const newProvider = newStream.addonName || newStream.name || newStream.addon || 'Unknown';
    const newStreamName = newStream.name || newStream.title || 'Unknown';

    // Wait for unmount to complete, then navigate
    setTimeout(() => {
      (navigation as any).replace('PlayerAndroid', {
        ...route.params,
        uri: newStream.url,
        quality: newQuality,
        streamProvider: newProvider,
        streamName: newStreamName,
        headers: newStream.headers,
        availableStreams: availableStreams
      });
    }, 300);
  };

  const handleEpisodeStreamSelect = async (stream: any) => {
    if (!modals.selectedEpisodeForStreams) return;
    modals.setShowEpisodeStreamsModal(false);
    playerState.setPaused(true);

    // Unmount VideoSurface first to ensure MPV is fully destroyed
    setIsTransitioningStream(true);

    const ep = modals.selectedEpisodeForStreams;

    const newQuality = stream.quality || (stream.title?.match(/(\d+)p/)?.[0]);
    const newProvider = stream.addonName || stream.name || stream.addon || 'Unknown';
    const newStreamName = stream.name || stream.title || 'Unknown Stream';

    // Wait for unmount to complete, then navigate
    setTimeout(() => {
      (navigation as any).replace('PlayerAndroid', {
        uri: stream.url,
        title: title,
        episodeTitle: ep.name,
        season: ep.season_number,
        episode: ep.episode_number,
        quality: newQuality,
        year: year,
        streamProvider: newProvider,
        streamName: newStreamName,
        headers: stream.headers || undefined,
        id,
        type: 'series',
        episodeId: ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`,
        imdbId: imdbId ?? undefined,
        backdrop: backdrop || undefined,
        availableStreams: {},
        groupedEpisodes: groupedEpisodes,
      });
    }, 300);
  };

  // Subtitle addon fetching
  const fetchAvailableSubtitles = useCallback(async () => {
    const targetImdbId = imdbId;
    if (!targetImdbId) {
      logger.warn('[AndroidVideoPlayer] No IMDB ID for subtitle fetch');
      return;
    }

    setIsLoadingSubtitleList(true);
    try {
      const stremioType = type === 'series' ? 'series' : 'movie';
      const stremioVideoId = stremioType === 'series' && season && episode
        ? `series:${targetImdbId}:${season}:${episode}`
        : undefined;
      const results = await stremioService.getSubtitles(stremioType, targetImdbId, stremioVideoId);

      const subs: WyzieSubtitle[] = (results || []).map((sub: any) => ({
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

      setAvailableSubtitles(subs);
      logger.info(`[AndroidVideoPlayer] Fetched ${subs.length} addon subtitles`);
    } catch (e) {
      logger.error('[AndroidVideoPlayer] Error fetching addon subtitles', e);
    } finally {
      setIsLoadingSubtitleList(false);
    }
  }, [imdbId, type, season, episode]);

  const loadWyzieSubtitle = useCallback(async (subtitle: WyzieSubtitle) => {
    if (!subtitle.url) return;

    modals.setShowSubtitleModal(false);
    setIsLoadingSubtitles(true);
    try {
      // Download subtitle file
      let srtContent = '';
      try {
        const resp = await axios.get(subtitle.url, { timeout: 10000 });
        srtContent = typeof resp.data === 'string' ? resp.data : String(resp.data);
      } catch {
        const resp = await fetch(subtitle.url);
        srtContent = await resp.text();
      }

      // Parse subtitle file
      const parsedCues = parseSRT(srtContent);
      setCustomSubtitles(parsedCues);
      setUseCustomSubtitles(true);

      // Disable MPV's built-in subtitle track when using custom subtitles
      tracksHook.setSelectedTextTrack(-1);
      if (mpvPlayerRef.current) {
        mpvPlayerRef.current.setSubtitleTrack(-1);
      }

      // Set initial subtitle based on current time
      const adjustedTime = playerState.currentTime;
      const cueNow = parsedCues.find(cue => adjustedTime >= cue.start && adjustedTime <= cue.end);
      setCurrentSubtitle(cueNow ? cueNow.text : '');

      logger.info(`[AndroidVideoPlayer] Loaded addon subtitle: ${subtitle.display} (${parsedCues.length} cues)`);
      toast.success(`Subtitle loaded: ${subtitle.display}`);
    } catch (e) {
      logger.error('[AndroidVideoPlayer] Error loading subtitle', e);
      toast.error('Failed to load subtitle');
    } finally {
      setIsLoadingSubtitles(false);
    }
  }, [modals, playerState.currentTime, tracksHook]);

  const disableCustomSubtitles = useCallback(() => {
    setUseCustomSubtitles(false);
    setCustomSubtitles([]);
    setCurrentSubtitle('');
  }, []);

  const cycleResizeMode = useCallback(() => {
    if (playerState.resizeMode === 'contain') playerState.setResizeMode('cover');
    else playerState.setResizeMode('contain');
  }, [playerState.resizeMode]);

  // Memoize selectedTextTrack to prevent unnecessary re-renders
  const memoizedSelectedTextTrack = useMemo(() => {
    return tracksHook.selectedTextTrack === -1
      ? { type: 'disabled' as const }
      : { type: 'index' as const, value: tracksHook.selectedTextTrack };
  }, [tracksHook.selectedTextTrack]);

  return (
    <View style={[styles.container, {
      width: playerState.screenDimensions.width,
      height: playerState.screenDimensions.height,
      position: 'absolute', top: 0, left: 0
    }]}>
      <LoadingOverlay
        visible={!openingAnimation.shouldHideOpeningOverlay}
        backdrop={backdrop || null}
        hasLogo={hasLogo}
        logo={metadata?.logo}
        backgroundFadeAnim={openingAnimation.backgroundFadeAnim}
        backdropImageOpacityAnim={openingAnimation.backdropImageOpacityAnim}
        onClose={handleClose}
        width={playerState.screenDimensions.width}
        height={playerState.screenDimensions.height}
      />

      <View style={{ flex: 1, backgroundColor: 'black' }}>
        {!isTransitioningStream && (
          <VideoSurface
            processedStreamUrl={currentStreamUrl}
            headers={headers}
            volume={volume}
            playbackSpeed={speedControl.playbackSpeed}
            resizeMode={playerState.resizeMode}
            paused={playerState.paused}
            currentStreamUrl={currentStreamUrl}
            toggleControls={toggleControls}
            onLoad={handleLoad}
            onProgress={handleProgress}
            onSeek={(data) => {
              playerState.isSeeking.current = false;
              if (data.currentTime) traktAutosync.handleProgressUpdate(data.currentTime, playerState.duration, true);
            }}
            onEnd={() => {
              if (modals.showEpisodeStreamsModal) return;
              playerState.setPaused(true);
            }}
            onError={(err: any) => {
              logger.error('Video Error', err);

              // Determine the actual error message
              let displayError = 'An unknown error occurred';

              if (typeof err?.error === 'string') {
                displayError = err.error;
              } else if (err?.error?.errorString) {
                displayError = err.error.errorString;
              } else if (err?.errorString) {
                displayError = err.errorString;
              } else if (typeof err === 'string') {
                displayError = err;
              } else {
                displayError = JSON.stringify(err);
              }

              modals.setErrorDetails(displayError);
              modals.setShowErrorModal(true);
            }}
            onBuffer={(buf) => playerState.setIsBuffering(buf.isBuffering)}
            onTracksChanged={(data) => {
              console.log('[AndroidVideoPlayer] onTracksChanged:', data);
              if (data?.audioTracks) {
                const formatted = data.audioTracks.map((t: any) => ({
                  id: t.id,
                  name: t.name || `Track ${t.id}`,
                  language: t.language
                }));
                tracksHook.setRnVideoAudioTracks(formatted);
              }
              if (data?.subtitleTracks) {
                const formatted = data.subtitleTracks.map((t: any) => ({
                  id: t.id,
                  name: t.name || `Track ${t.id}`,
                  language: t.language
                }));
                tracksHook.setRnVideoTextTracks(formatted);
              }
            }}
            mpvPlayerRef={mpvPlayerRef}
            exoPlayerRef={exoPlayerRef}
            pinchRef={pinchRef}
            onPinchGestureEvent={() => { }}
            onPinchHandlerStateChange={() => { }}
            screenDimensions={playerState.screenDimensions}
            decoderMode={settings.decoderMode}
            gpuMode={settings.gpuMode}
            // Dual video engine props
            useExoPlayer={useExoPlayer}
            onCodecError={handleCodecError}
            selectedAudioTrack={tracksHook.selectedAudioTrack as any || undefined}
            selectedTextTrack={memoizedSelectedTextTrack as any}
            // Subtitle Styling - pass to MPV for built-in subtitle customization
            // MPV uses different scaling than React Native, so we apply conversion factors:
            // - Font size: MPV needs ~1.5x larger values (MPV's sub-font-size vs RN fontSize)
            // - Border: MPV needs ~1.5x larger values
            // - Position: MPV sub-pos uses 0=top, 100=bottom, >100=below screen
            subtitleSize={Math.round(subtitleSize * 1.5)}
            subtitleColor={subtitleTextColor}
            subtitleBackgroundOpacity={subtitleBackground ? subtitleBgOpacity : 0}
            subtitleBorderSize={subtitleOutline ? Math.round(subtitleOutlineWidth * 1.5) : 0}
            subtitleBorderColor={subtitleOutlineColor}
            subtitleShadowEnabled={subtitleTextShadow}
            subtitlePosition={Math.max(50, 100 - Math.floor(subtitleBottomOffset * 0.3))} // Scale offset to MPV range
            subtitleDelay={subtitleOffsetSec}
            subtitleAlignment={subtitleAlign}
          />
        )}

        {/* Custom Subtitles for addon subtitles */}
        <CustomSubtitles
          useCustomSubtitles={useCustomSubtitles}
          currentSubtitle={currentSubtitle}
          subtitleSize={subtitleSize}
          subtitleBackground={subtitleBackground}
          zoomScale={1.0}
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
          controlsVisible={playerState.showControls}
          controlsExtraOffset={100}
        />
        <GestureControls
          screenDimensions={playerState.screenDimensions}
          gestureControls={gestureControls}
          onLongPressActivated={speedControl.activateSpeedBoost}
          onLongPressEnd={speedControl.deactivateSpeedBoost}
          onLongPressStateChange={(e) => {
            if (e.nativeEvent.state !== 4 && e.nativeEvent.state !== 2) speedControl.deactivateSpeedBoost();
          }}
          toggleControls={toggleControls}
          showControls={playerState.showControls}
          hideControls={hideControls}
          volume={volume}
          brightness={brightness}
          controlsTimeout={controlsTimeout}
        />

        <PlayerControls
          showControls={playerState.showControls}
          fadeAnim={fadeAnim}
          paused={playerState.paused}
          title={title}
          episodeTitle={episodeTitle}
          season={season}
          episode={episode}
          quality={currentQuality || quality}
          year={year}
          streamProvider={currentStreamProvider || streamProvider}
          streamName={currentStreamName}
          currentTime={playerState.currentTime}
          duration={playerState.duration}
          zoomScale={1}
          currentResizeMode={playerState.resizeMode}
          ksAudioTracks={tracksHook.ksAudioTracks}
          selectedAudioTrack={tracksHook.computedSelectedAudioTrack}
          availableStreams={availableStreams}
          togglePlayback={controlsHook.togglePlayback}
          skip={controlsHook.skip}
          handleClose={handleClose}
          cycleAspectRatio={cycleResizeMode}
          cyclePlaybackSpeed={() => {
            const speeds = [0.5, 1, 1.25, 1.5, 2];
            const idx = speeds.indexOf(speedControl.playbackSpeed);
            const next = speeds[(idx + 1) % speeds.length];
            speedControl.setPlaybackSpeed(next);
          }}
          currentPlaybackSpeed={speedControl.playbackSpeed}
          setShowAudioModal={modals.setShowAudioModal}
          setShowSubtitleModal={modals.setShowSubtitleModal}
          setShowSpeedModal={modals.setShowSpeedModal}
          isSubtitleModalOpen={modals.showSubtitleModal}
          setShowSourcesModal={modals.setShowSourcesModal}
          setShowEpisodesModal={type === 'series' ? modals.setShowEpisodesModal : undefined}
          onSliderValueChange={(val) => { playerState.isDragging.current = true; }}
          onSlidingStart={() => { playerState.isDragging.current = true; }}
          onSlidingComplete={(val) => {
            playerState.isDragging.current = false;
            controlsHook.seekToTime(val);
          }}
          buffered={playerState.buffered}
          formatTime={formatTime}
          playerBackend={useExoPlayer ? 'ExoPlayer' : 'MPV'}
        />

        <SpeedActivatedOverlay
          visible={speedControl.showSpeedActivatedOverlay}
          opacity={speedControl.speedActivatedOverlayOpacity}
          speed={speedControl.holdToSpeedValue}
        />

        <PauseOverlay
          visible={playerState.paused && !playerState.showControls}
          onClose={() => playerState.setShowControls(true)}
          title={title}
          episodeTitle={episodeTitle}
          season={season}
          episode={episode}
          year={year}
          type={type || 'movie'}
          description={nextEpisodeHook.currentEpisodeDescription || ''}
          cast={cast}
          screenDimensions={playerState.screenDimensions}
        />

        {/* Parental Guide Overlay - Shows after controls first hide */}
        <ParentalGuideOverlay
          imdbId={imdbId || (id?.startsWith('tt') ? id : undefined)}
          type={type as 'movie' | 'series'}
          season={season}
          episode={episode}
          shouldShow={playerState.isVideoLoaded && !playerState.showControls && !playerState.paused}
        />

        {/* Skip Intro Button - Shows during intro section of TV episodes */}
        <SkipIntroButton
          imdbId={imdbId || (id?.startsWith('tt') ? id : undefined)}
          type={type || 'movie'}
          season={season}
          episode={episode}
          currentTime={playerState.currentTime}
          onSkip={(endTime) => controlsHook.seekToTime(endTime)}
          controlsVisible={playerState.showControls}
          controlsFixedOffset={100}
        />

        {/* Up Next Button - Shows near end of episodes */}
        <UpNextButton
          type={type || 'movie'}
          nextEpisode={nextEpisodeHook.nextEpisode}
          currentTime={playerState.currentTime}
          duration={playerState.duration}
          insets={insets}
          isLoading={false}
          nextLoadingProvider={null}
          nextLoadingQuality={null}
          nextLoadingTitle={null}
          onPress={() => {
            if (nextEpisodeHook.nextEpisode) {
              logger.log(`[AndroidVideoPlayer] Opening streams for next episode: S${nextEpisodeHook.nextEpisode.season_number}E${nextEpisodeHook.nextEpisode.episode_number}`);
              modals.setSelectedEpisodeForStreams(nextEpisodeHook.nextEpisode);
              modals.setShowEpisodeStreamsModal(true);
            }
          }}
          metadata={metadataResult?.metadata ? { poster: metadataResult.metadata.poster, id: metadataResult.metadata.id } : undefined}
          controlsVisible={playerState.showControls}
          controlsFixedOffset={100}
        />
      </View>

      <AudioTrackModal
        showAudioModal={modals.showAudioModal}
        setShowAudioModal={modals.setShowAudioModal}
        ksAudioTracks={tracksHook.ksAudioTracks}
        selectedAudioTrack={tracksHook.computedSelectedAudioTrack}
        selectAudioTrack={(trackId) => {
          tracksHook.setSelectedAudioTrack(trackId === null ? null : { type: 'index', value: trackId });
          // Actually tell MPV to switch the audio track
          if (trackId !== null && mpvPlayerRef.current) {
            mpvPlayerRef.current.setAudioTrack(trackId);
          }
        }}
      />

      <SubtitleModals
        showSubtitleModal={modals.showSubtitleModal}
        setShowSubtitleModal={modals.setShowSubtitleModal}
        showSubtitleLanguageModal={false}
        setShowSubtitleLanguageModal={() => { }}
        isLoadingSubtitleList={isLoadingSubtitleList}
        isLoadingSubtitles={isLoadingSubtitles}
        customSubtitles={[]}
        availableSubtitles={availableSubtitles}
        ksTextTracks={tracksHook.ksTextTracks}
        selectedTextTrack={tracksHook.computedSelectedTextTrack}
        useCustomSubtitles={useCustomSubtitles}
        isKsPlayerActive={true}
        useExoPlayer={useExoPlayer}
        subtitleSize={subtitleSize}
        subtitleBackground={subtitleBackground}
        fetchAvailableSubtitles={fetchAvailableSubtitles}
        loadWyzieSubtitle={loadWyzieSubtitle}
        selectTextTrack={(trackId) => {
          tracksHook.setSelectedTextTrack(trackId);
          // For MPV, manually switch the subtitle track
          if (!useExoPlayer && mpvPlayerRef.current) {
            mpvPlayerRef.current.setSubtitleTrack(trackId);
          }
          // For ExoPlayer, the selectedTextTrack prop will be updated via memoizedSelectedTextTrack
          // which triggers a re-render with the new track selection
          // Disable custom subtitles when selecting built-in track
          setUseCustomSubtitles(false);
          modals.setShowSubtitleModal(false);
        }}
        disableCustomSubtitles={disableCustomSubtitles}
        increaseSubtitleSize={() => setSubtitleSize(prev => Math.min(prev + 2, 60))}
        decreaseSubtitleSize={() => setSubtitleSize(prev => Math.max(prev - 2, 12))}
        toggleSubtitleBackground={() => setSubtitleBackground(prev => !prev)}
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
        showSourcesModal={modals.showSourcesModal}
        setShowSourcesModal={modals.setShowSourcesModal}
        availableStreams={availableStreams}
        currentStreamUrl={currentStreamUrl}
        onSelectStream={(stream) => handleSelectStream(stream)}
      />

      <SpeedModal
        showSpeedModal={modals.showSpeedModal}
        setShowSpeedModal={modals.setShowSpeedModal}
        currentSpeed={speedControl.playbackSpeed}
        setPlaybackSpeed={speedControl.setPlaybackSpeed}
        holdToSpeedEnabled={speedControl.holdToSpeedEnabled}
        setHoldToSpeedEnabled={speedControl.setHoldToSpeedEnabled}
        holdToSpeedValue={speedControl.holdToSpeedValue}
        setHoldToSpeedValue={speedControl.setHoldToSpeedValue}
      />

      <EpisodesModal
        showEpisodesModal={modals.showEpisodesModal}
        setShowEpisodesModal={modals.setShowEpisodesModal}
        groupedEpisodes={groupedEpisodes || (metadataResult as any)?.groupedEpisodes}
        currentEpisode={season && episode ? { season, episode } : undefined}
        metadata={metadata}
        onSelectEpisode={(ep) => {
          modals.setSelectedEpisodeForStreams(ep);
          modals.setShowEpisodesModal(false);
          modals.setShowEpisodeStreamsModal(true);
        }}
      />



      <ErrorModal
        showErrorModal={modals.showErrorModal}
        setShowErrorModal={modals.setShowErrorModal}
        errorDetails={modals.errorDetails}
        onDismiss={handleClose}
      />

      <EpisodeStreamsModal
        visible={modals.showEpisodeStreamsModal}
        onClose={() => modals.setShowEpisodeStreamsModal(false)}
        episode={modals.selectedEpisodeForStreams}
        onSelectStream={handleEpisodeStreamSelect}
        metadata={{ id: id, name: title }}
      />

    </View>
  );
};

export default AndroidVideoPlayer;
