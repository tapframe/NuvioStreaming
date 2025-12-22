import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { View, StyleSheet, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';

// Shared Hooks (cross-platform)
import {
  usePlayerState,
  usePlayerModals,
  useSpeedControl,
  useOpeningAnimation
} from './hooks';

// Android-specific hooks (VLC integration, dual player support)
import { usePlayerSetup } from './android/hooks/usePlayerSetup';
import { useVlcPlayer } from './android/hooks/useVlcPlayer';
import { usePlayerTracks } from './android/hooks/usePlayerTracks';
import { useWatchProgress } from './android/hooks/useWatchProgress';
import { usePlayerControls } from './android/hooks/usePlayerControls';
import { useNextEpisode } from './android/hooks/useNextEpisode';

// App-level Hooks
import { useTraktAutosync } from '../../hooks/useTraktAutosync';
import { useMetadata } from '../../hooks/useMetadata';
import { usePlayerGestureControls } from '../../hooks/usePlayerGestureControls';

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

// Android-specific components
import { VideoSurface } from './android/components/VideoSurface';

// Utils
import { logger } from '../../utils/logger';
import { styles } from './utils/playerStyles';
import { formatTime, isHlsStream, processUrlForVLC, getHlsHeaders, defaultAndroidHeaders } from './utils/playerUtils';
import { storageService } from '../../services/storageService';

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

  const forceVlc = useMemo(() => {
    const rp: any = route.params || {};
    const v = rp.forceVlc !== undefined ? rp.forceVlc : rp.forceVLC;
    return typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v);
  }, [route.params]);

  const useVLC = (Platform.OS === 'android' && forceVlc);

  const videoRef = useRef<any>(null);
  const vlcHook = useVlcPlayer(useVLC, playerState.paused, playerState.currentTime);
  const tracksHook = usePlayerTracks(
    useVLC,
    vlcHook.vlcAudioTracks,
    vlcHook.vlcSubtitleTracks,
    vlcHook.vlcSelectedAudioTrack,
    vlcHook.vlcSelectedSubtitleTrack
  );

  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(uri);
  const [currentVideoType, setCurrentVideoType] = useState<string | undefined>((route.params as any).videoType);
  const processedStreamUrl = useMemo(() => useVLC ? processUrlForVLC(currentStreamUrl) : currentStreamUrl, [currentStreamUrl, useVLC]);

  const [availableStreams, setAvailableStreams] = useState<any>(passedAvailableStreams || {});
  const [currentQuality, setCurrentQuality] = useState(quality);
  const [currentStreamProvider, setCurrentStreamProvider] = useState(streamProvider);
  const [currentStreamName, setCurrentStreamName] = useState(streamName);

  const metadataResult = useMetadata({ id: id || 'placeholder', type: (type as any) });
  const { metadata, cast } = Boolean(id && type) ? (metadataResult as any) : { metadata: null, cast: [] };
  const hasLogo = metadata && metadata.logo;
  const openingAnimation = useOpeningAnimation(backdrop, metadata);

  const [volume, setVolume] = useState(1.0);
  const [brightness, setBrightness] = useState(1.0);
  const setupHook = usePlayerSetup(playerState.setScreenDimensions, setVolume, setBrightness, playerState.paused);

  const controlsHook = usePlayerControls(
    videoRef,
    vlcHook.vlcPlayerRef,
    useVLC,
    playerState.paused,
    playerState.setPaused,
    playerState.currentTime,
    playerState.duration,
    playerState.isSeeking,
    playerState.isMounted
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

  const handleLoad = useCallback((data: any) => {
    if (!playerState.isMounted.current) return;

    const videoDuration = data.duration;
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

    if (!useVLC) {
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
    }

    playerState.setIsVideoLoaded(true);
    openingAnimation.completeOpeningAnimation();

    // Handle Resume
    if (watchProgress.initialPosition && !watchProgress.showResumeOverlay) {
      controlsHook.seekToTime(watchProgress.initialPosition);
    }
  }, [id, type, episodeId, useVLC, playerState.isMounted, watchProgress.initialPosition]);

  const handleProgress = useCallback((data: any) => {
    if (playerState.isDragging.current || playerState.isSeeking.current || !playerState.isMounted.current || setupHook.isAppBackgrounded.current) return;
    const currentTimeInSeconds = data.currentTime;
    if (Math.abs(currentTimeInSeconds - playerState.currentTime) > 0.5) {
      playerState.setCurrentTime(currentTimeInSeconds);
      playerState.setBuffered(data.playableDuration || currentTimeInSeconds);
    }
  }, [playerState.currentTime, playerState.isDragging, playerState.isSeeking, setupHook.isAppBackgrounded]);

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

  const handleSelectStream = async (newStream: any) => {
    if (newStream.url === currentStreamUrl) {
      modals.setShowSourcesModal(false);
      return;
    }
    modals.setShowSourcesModal(false);
    playerState.setPaused(true);

    const newQuality = newStream.quality || newStream.title?.match(/(\d+)p/)?.[0];
    const newProvider = newStream.addonName || newStream.name || newStream.addon || 'Unknown';
    const newStreamName = newStream.name || newStream.title || 'Unknown';

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
    }, 100);
  };

  const handleEpisodeStreamSelect = async (stream: any) => {
    if (!modals.selectedEpisodeForStreams) return;
    modals.setShowEpisodeStreamsModal(false);
    playerState.setPaused(true);
    const ep = modals.selectedEpisodeForStreams;

    const newQuality = stream.quality || (stream.title?.match(/(\d+)p/)?.[0]);
    const newProvider = stream.addonName || stream.name || stream.addon || 'Unknown';
    const newStreamName = stream.name || stream.title || 'Unknown Stream';

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
        forceVlc: false,
        id,
        type: 'series',
        episodeId: ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number}`,
        imdbId: imdbId ?? undefined,
        backdrop: backdrop || undefined,
        availableStreams: {},
        groupedEpisodes: groupedEpisodes,
      });
    }, 100);
  };

  const cycleResizeMode = useCallback(() => {
    if (playerState.resizeMode === 'contain') playerState.setResizeMode('cover');
    else playerState.setResizeMode('contain');
  }, [playerState.resizeMode]);

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
        <VideoSurface
          useVLC={!!useVLC}
          forceVlcRemount={vlcHook.forceVlcRemount}
          processedStreamUrl={processedStreamUrl}
          volume={volume}
          playbackSpeed={speedControl.playbackSpeed}
          zoomScale={1.0}
          resizeMode={playerState.resizeMode}
          paused={playerState.paused}
          currentStreamUrl={currentStreamUrl}
          headers={headers || (isHlsStream(currentStreamUrl) ? getHlsHeaders() : defaultAndroidHeaders)}
          videoType={currentVideoType}
          vlcSelectedAudioTrack={vlcHook.vlcSelectedAudioTrack}
          vlcSelectedSubtitleTrack={vlcHook.vlcSelectedSubtitleTrack}
          vlcRestoreTime={vlcHook.vlcRestoreTime}
          vlcKey={vlcHook.vlcKey}
          selectedAudioTrack={tracksHook.selectedAudioTrack}
          selectedTextTrack={tracksHook.selectedTextTrack}
          useCustomSubtitles={false}
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
          onError={(err) => {
            logger.error('Video Error', err);
            modals.setErrorDetails(JSON.stringify(err));
            modals.setShowErrorModal(true);
          }}
          onBuffer={(buf) => playerState.setIsBuffering(buf.isBuffering)}
          onTracksUpdate={vlcHook.handleVlcTracksUpdate}
          vlcPlayerRef={vlcHook.vlcPlayerRef}
          videoRef={videoRef}
          pinchRef={useRef(null)}
          onPinchGestureEvent={() => { }}
          onPinchHandlerStateChange={() => { }}
          vlcLoadedRef={vlcHook.vlcLoadedRef}
          screenDimensions={playerState.screenDimensions}
          customVideoStyles={{}}
          loadStartAtRef={loadStartAtRef}
          firstFrameAtRef={firstFrameAtRef}
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
          playerBackend={useVLC ? 'VLC' : 'ExoPlayer'}
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
      </View>

      <AudioTrackModal
        showAudioModal={modals.showAudioModal}
        setShowAudioModal={modals.setShowAudioModal}
        ksAudioTracks={tracksHook.ksAudioTracks}
        selectedAudioTrack={tracksHook.computedSelectedAudioTrack}
        selectAudioTrack={(trackId) => {
          useVLC ? vlcHook.selectVlcAudioTrack(trackId) :
            tracksHook.setSelectedAudioTrack(trackId === null ? null : { type: 'index', value: trackId });
        }}
      />

      <SubtitleModals
        showSubtitleModal={modals.showSubtitleModal}
        setShowSubtitleModal={modals.setShowSubtitleModal}
        showSubtitleLanguageModal={false} // Placeholder
        setShowSubtitleLanguageModal={() => { }} // Placeholder
        isLoadingSubtitleList={false} // Placeholder
        isLoadingSubtitles={false} // Placeholder
        customSubtitles={[]} // Placeholder
        availableSubtitles={[]} // Placeholder
        ksTextTracks={tracksHook.ksTextTracks}
        selectedTextTrack={tracksHook.computedSelectedTextTrack}
        useCustomSubtitles={false}
        isKsPlayerActive={!useVLC}
        subtitleSize={30} // Placeholder
        subtitleBackground={false} // Placeholder
        fetchAvailableSubtitles={() => { }} // Placeholder
        loadWyzieSubtitle={() => { }} // Placeholder
        selectTextTrack={(trackId) => {
          useVLC ? vlcHook.selectVlcSubtitleTrack(trackId) : tracksHook.setSelectedTextTrack(trackId);
          modals.setShowSubtitleModal(false);
        }}
        disableCustomSubtitles={() => { }} // Placeholder
        increaseSubtitleSize={() => { }} // Placeholder
        decreaseSubtitleSize={() => { }} // Placeholder
        toggleSubtitleBackground={() => { }} // Placeholder
        subtitleTextColor="#FFF" // Placeholder
        setSubtitleTextColor={() => { }} // Placeholder
        subtitleBgOpacity={0.5} // Placeholder
        setSubtitleBgOpacity={() => { }} // Placeholder
        subtitleTextShadow={false} // Placeholder
        setSubtitleTextShadow={() => { }} // Placeholder
        subtitleOutline={false} // Placeholder
        setSubtitleOutline={() => { }} // Placeholder
        subtitleOutlineColor="#000" // Placeholder
        setSubtitleOutlineColor={() => { }} // Placeholder
        subtitleOutlineWidth={1} // Placeholder
        setSubtitleOutlineWidth={() => { }} // Placeholder
        subtitleAlign="center" // Placeholder
        setSubtitleAlign={() => { }} // Placeholder
        subtitleBottomOffset={10} // Placeholder
        setSubtitleBottomOffset={() => { }} // Placeholder
        subtitleLetterSpacing={0} // Placeholder
        setSubtitleLetterSpacing={() => { }} // Placeholder
        subtitleLineHeightMultiplier={1} // Placeholder
        setSubtitleLineHeightMultiplier={() => { }} // Placeholder
        subtitleOffsetSec={0} // Placeholder
        setSubtitleOffsetSec={() => { }} // Placeholder
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
