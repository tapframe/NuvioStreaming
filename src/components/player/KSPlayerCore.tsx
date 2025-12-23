import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StatusBar, StyleSheet, Animated, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';

// Shared Components
import LoadingOverlay from './modals/LoadingOverlay';
import UpNextButton from './common/UpNextButton';
import { PlayerControls } from './controls/PlayerControls';
import AudioTrackModal from './modals/AudioTrackModal';
import SpeedModal from './modals/SpeedModal';
import SubtitleModals from './modals/SubtitleModals';
import SourcesModal from './modals/SourcesModal';
import EpisodesModal from './modals/EpisodesModal';
import { EpisodeStreamsModal } from './modals/EpisodeStreamsModal';
import { ErrorModal } from './modals/ErrorModal';
import CustomSubtitles from './subtitles/CustomSubtitles';
import { SpeedActivatedOverlay, PauseOverlay, GestureControls } from './components';

// Platform-specific components
import { KSPlayerSurface } from './ios/components/KSPlayerSurface';

// Shared Hooks
import {
  usePlayerState,
  usePlayerModals,
  useSpeedControl,
  useOpeningAnimation,
  usePlayerTracks,
  useCustomSubtitles,
  usePlayerControls,
  usePlayerSetup
} from './hooks';

// Platform-specific hooks
import { useKSPlayer } from './ios/hooks/useKSPlayer';

// App-level Hooks
import { useTraktAutosync } from '../../hooks/useTraktAutosync';
import { useMetadata } from '../../hooks/useMetadata';
import { usePlayerGestureControls } from '../../hooks/usePlayerGestureControls';
import stremioService from '../../services/stremioService';
import { logger } from '../../utils/logger';

// Utils
import { formatTime } from './utils/playerUtils';
import { WyzieSubtitle } from './utils/playerTypes';
import { parseSRT } from './utils/subtitleParser';

// Player route params interface
interface PlayerRouteParams {
  uri: string;
  title: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  quality?: string;
  year?: number;
  streamProvider?: string;
  streamName?: string;
  id: string;
  type: string;
  episodeId?: string;
  imdbId?: string;
  backdrop?: string;
  availableStreams?: { [providerId: string]: { streams: any[]; addonName: string } };
  headers?: Record<string, string>;
  initialPosition?: number;
}

const KSPlayerCore: React.FC = () => {
  // Navigation & Route
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const params = route.params as PlayerRouteParams;

  // Deconstruct params
  const {
    uri, title, episodeTitle, season, episode, id, type, quality, year,
    episodeId, imdbId, backdrop, availableStreams,
    headers, streamProvider, streamName,
    initialPosition: routeInitialPosition
  } = params;

  // --- Hooks ---
  const playerState = usePlayerState();
  const {
    paused, setPaused,
    currentTime, setCurrentTime,
    duration, setDuration,
    buffered, setBuffered,
    isBuffering, setIsBuffering,
    isVideoLoaded, setIsVideoLoaded,
    isPlayerReady, setIsPlayerReady,
    showControls, setShowControls,
    resizeMode, setResizeMode,
    screenDimensions, setScreenDimensions,
    zoomScale, setZoomScale,
    lastZoomScale, setLastZoomScale,
    isAirPlayActive,
    allowsAirPlay,
    isSeeking,
    isMounted,
  } = playerState;

  const modals = usePlayerModals();
  const speedControl = useSpeedControl(1.0);

  // Metadata Hook
  const { metadata, groupedEpisodes, cast } = useMetadata({ id, type: type as 'movie' | 'series' });

  // Trakt Autosync
  const traktAutosync = useTraktAutosync({
    type: type as 'movie' | 'series',
    imdbId: imdbId || (id?.startsWith('tt') ? id : ''),
    season,
    episode,
    title,
    id,
    year: year?.toString() || metadata?.year?.toString() || ''
  });

  const openingAnim = useOpeningAnimation(backdrop, metadata);
  const tracks = usePlayerTracks();
  const { ksPlayerRef, seek } = useKSPlayer();
  const customSubs = useCustomSubtitles();

  const controls = usePlayerControls({
    playerRef: ksPlayerRef,
    paused,
    setPaused,
    currentTime,
    duration,
    isSeeking,
    isMounted
  });

  // Gestures
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Controls timeout
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const hideControls = useCallback(() => {
    // Allow hiding controls even when paused (per user request)
    setShowControls(false);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, setShowControls]);

  // Volume/Brightness State
  const [volume, setVolumeState] = useState(1.0);
  const [brightness, setBrightnessState] = useState(0.5);
  const [isSliderDragging, setIsSliderDragging] = useState(false);

  // Watch Progress State
  const [initialPosition, setInitialPosition] = useState<number | null>(routeInitialPosition || null);

  // Shared Gesture Hook
  const gestureControls = usePlayerGestureControls({
    volume: volume,
    setVolume: (v) => setVolumeState(v),
    brightness: brightness,
    setBrightness: (b) => setBrightnessState(b),
  });

  // Setup Hook (Listeners, StatusBar, etc)
  usePlayerSetup({
    setScreenDimensions,
    setVolume: setVolumeState,
    setBrightness: setBrightnessState,
    isOpeningAnimationComplete: openingAnim.isOpeningAnimationComplete
  });

  // Refs for Logic
  const isSyncingBeforeClose = useRef(false);

  // Toggle controls wrapper
  const toggleControls = useCallback(() => {
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
      controlsTimeout.current = null;
    }
    setShowControls(prev => {
      const next = !prev;
      Animated.timing(fadeAnim, {
        toValue: next ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
      // Start auto-hide timer if showing controls and not paused
      if (next && !paused) {
        controlsTimeout.current = setTimeout(hideControls, 5000);
      }
      return next;
    });
  }, [fadeAnim, hideControls, setShowControls, paused]);

  // Auto-hide controls when playback resumes
  useEffect(() => {
    if (showControls && !paused) {
      // Reset auto-hide timer when playback resumes
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
      controlsTimeout.current = setTimeout(hideControls, 5000);
    } else if (paused) {
      // Clear timeout when paused - user controls when to hide
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
    }
    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, [paused, showControls, hideControls]);

  // Subtitle Fetching Logic
  const fetchAvailableSubtitles = async (imdbIdParam?: string, autoSelectEnglish = true) => {
    const targetImdbId = imdbIdParam || imdbId;
    if (!targetImdbId) return;

    customSubs.setIsLoadingSubtitleList(true);
    try {
      const stremioType = type === 'series' ? 'series' : 'movie';
      const stremioVideoId = stremioType === 'series' && season && episode ? `series:${targetImdbId}:${season}:${episode}` : undefined;
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

      customSubs.setAvailableSubtitles(subs);

      if (autoSelectEnglish) {
        const englishSubtitle = subs.find(sub =>
          sub.language.includes('en') || sub.display.toLowerCase().includes('english')
        );
        if (englishSubtitle) {
          loadWyzieSubtitle(englishSubtitle);
          return;
        }
      }
      if (!autoSelectEnglish) {
        modals.setShowSubtitleLanguageModal(true);
      }
    } catch (e) {
      logger.error('[VideoPlayer] Error fetching subtitles', e);
    } finally {
      customSubs.setIsLoadingSubtitleList(false);
    }
  };

  const loadWyzieSubtitle = async (subtitle: WyzieSubtitle) => {
    modals.setShowSubtitleLanguageModal(false);
    customSubs.setIsLoadingSubtitles(true);
    try {
      let srtContent = '';
      try {
        const resp = await axios.get(subtitle.url, { timeout: 10000 });
        srtContent = typeof resp.data === 'string' ? resp.data : String(resp.data);
      } catch {
        const resp = await fetch(subtitle.url);
        srtContent = await resp.text();
      }
      const parsedCues = parseSRT(srtContent);
      customSubs.setCustomSubtitles(parsedCues);
      customSubs.setUseCustomSubtitles(true);
      tracks.selectTextTrack(-1);

      const adjustedTime = currentTime + (customSubs.subtitleOffsetSec || 0);
      const cueNow = parsedCues.find(cue => adjustedTime >= cue.start && adjustedTime <= cue.end);
      customSubs.setCurrentSubtitle(cueNow ? cueNow.text : '');

    } catch (e) {
      logger.error('[VideoPlayer] Error loading wyzie', e);
    } finally {
      customSubs.setIsLoadingSubtitles(false);
    }
  };

  // Auto-fetch subtitles on load
  useEffect(() => {
    if (imdbId) {
      fetchAvailableSubtitles(undefined, true);
    }
  }, [imdbId]);

  // Sync custom subtitle text with current playback time
  useEffect(() => {
    if (!customSubs.useCustomSubtitles || customSubs.customSubtitles.length === 0) return;

    const adjustedTime = currentTime + (customSubs.subtitleOffsetSec || 0);
    const cueNow = customSubs.customSubtitles.find(
      cue => adjustedTime >= cue.start && adjustedTime <= cue.end
    );
    customSubs.setCurrentSubtitle(cueNow ? cueNow.text : '');
  }, [currentTime, customSubs.useCustomSubtitles, customSubs.customSubtitles, customSubs.subtitleOffsetSec]);

  // Handlers
  const onLoad = (data: any) => {
    setDuration(data.duration);
    if (data.audioTracks) tracks.setKsAudioTracks(data.audioTracks);
    if (data.textTracks) tracks.setKsTextTracks(data.textTracks);

    setIsVideoLoaded(true);
    setIsPlayerReady(true);
    openingAnim.completeOpeningAnimation();

    // Initial Seek
    if (initialPosition && initialPosition > 0) {
      setTimeout(() => {
        controls.seekToTime(initialPosition);
      }, 500);
    }

    // Start trakt session
    if (data.duration > 0) {
      traktAutosync.handlePlaybackStart(currentTime, data.duration);
    }
  };

  const handleError = (error: any) => {
    let msg = 'Unknown Error';
    try {
      if (typeof error === 'string') {
        msg = error;
      } else if (error?.error?.localizedDescription) {
        msg = error.error.localizedDescription;
      } else if (error?.error?.message) {
        msg = error.error.message;
      } else if (error?.message) {
        msg = error.message;
      } else if (error?.error) {
        msg = typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
      } else {
        msg = JSON.stringify(error);
      }
    } catch (e) {
      msg = 'Error parsing error details';
    }
    modals.setErrorDetails(msg);
    modals.setShowErrorModal(true);
  };

  const handleClose = async () => {
    if (isSyncingBeforeClose.current) return;
    isSyncingBeforeClose.current = true;

    await traktAutosync.handleProgressUpdate(currentTime, duration, true);
    await traktAutosync.handlePlaybackEnd(currentTime, duration, 'user_close');

    navigation.goBack();
  };

  // Stream selection handler
  const handleSelectStream = async (newStream: any) => {
    if (newStream.url === uri) {
      modals.setShowSourcesModal(false);
      return;
    }
    modals.setShowSourcesModal(false);
    setPaused(true);

    const newQuality = newStream.quality || newStream.title?.match(/(\d+)p/)?.[0];
    const newProvider = newStream.addonName || newStream.name || newStream.addon || 'Unknown';
    const newStreamName = newStream.name || newStream.title || 'Unknown';

    setTimeout(() => {
      (navigation as any).replace('PlayerIOS', {
        ...params,
        uri: newStream.url,
        quality: newQuality,
        streamProvider: newProvider,
        streamName: newStreamName,
        headers: newStream.headers,
        availableStreams: availableStreams
      });
    }, 100);
  };

  // Episode selection handler - opens streams modal
  const handleSelectEpisode = (ep: any) => {
    modals.setSelectedEpisodeForStreams(ep);
    modals.setShowEpisodesModal(false);
    modals.setShowEpisodeStreamsModal(true);
  };

  // Episode stream selection handler - navigates to new episode with selected stream
  const handleEpisodeStreamSelect = async (stream: any) => {
    if (!modals.selectedEpisodeForStreams) return;
    modals.setShowEpisodeStreamsModal(false);
    setPaused(true);
    const ep = modals.selectedEpisodeForStreams;

    const newQuality = stream.quality || (stream.title?.match(/(\d+)p/)?.[0]);
    const newProvider = stream.addonName || stream.name || stream.addon || 'Unknown';
    const newStreamName = stream.name || stream.title || 'Unknown Stream';

    setTimeout(() => {
      (navigation as any).replace('PlayerIOS', {
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
        episodeId: ep.stremioId || `${id}:${ep.season_number}:${ep.episode_number} `,
        imdbId: imdbId ?? undefined,
        backdrop: backdrop || undefined,
      });
    }, 100);
  };

  // Slider handlers
  const onSliderValueChange = (value: number) => {
    setCurrentTime(value);
  };

  const onSlidingStart = () => {
    setIsSliderDragging(true);
  };

  const onSlidingComplete = (value: number) => {
    setIsSliderDragging(false);
    controls.seekToTime(value);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar hidden={true} />

      {/* Opening Animation Overlay */}
      <LoadingOverlay
        visible={!openingAnim.shouldHideOpeningOverlay}
        backdrop={backdrop}
        hasLogo={!!metadata?.logo}
        logo={metadata?.logo}
        backgroundFadeAnim={openingAnim.backgroundFadeAnim}
        backdropImageOpacityAnim={openingAnim.backdropImageOpacityAnim}
        onClose={handleClose}
        width={screenDimensions.width}
        height={screenDimensions.height}
      />

      {/* Video Surface & Pinch Zoom */}
      <KSPlayerSurface
        ksPlayerRef={ksPlayerRef}
        uri={uri}
        headers={headers}
        paused={paused}
        volume={volume}
        playbackSpeed={speedControl.playbackSpeed}
        resizeMode={resizeMode}
        zoomScale={zoomScale}
        setZoomScale={setZoomScale}
        lastZoomScale={lastZoomScale}
        setLastZoomScale={setLastZoomScale}
        audioTrack={tracks.selectedAudioTrack !== null ? tracks.selectedAudioTrack : undefined}
        textTrack={customSubs.useCustomSubtitles ? undefined : (tracks.selectedTextTrack !== -1 ? tracks.selectedTextTrack : undefined)}
        onAudioTracks={(d) => tracks.setKsAudioTracks(d.audioTracks || [])}
        onTextTracks={(d) => tracks.setKsTextTracks(d.textTracks || [])}
        onLoad={onLoad}
        onProgress={(d) => {
          if (!isSliderDragging) {
            setCurrentTime(d.currentTime);
          }
          setBuffered(d.buffered || 0);
        }}
        onEnd={async () => {
          setCurrentTime(duration);
          await traktAutosync.handlePlaybackEnd(duration, duration, 'ended');
        }}
        onError={handleError}
        onBuffer={setIsBuffering}
        onReadyForDisplay={() => setIsPlayerReady(true)}
        onPlaybackStalled={() => setIsBuffering(true)}
        onPlaybackResume={() => setIsBuffering(false)}
        screenWidth={screenDimensions.width}
        screenHeight={screenDimensions.height}
        customVideoStyles={{ width: '100%', height: '100%' }}
      />

      {/* Custom Subtitles Overlay */}
      <CustomSubtitles
        useCustomSubtitles={customSubs.useCustomSubtitles}
        currentSubtitle={customSubs.currentSubtitle}
        subtitleSize={customSubs.subtitleSize}
        subtitleBackground={customSubs.subtitleBackground}
        zoomScale={zoomScale}
        textColor={customSubs.subtitleTextColor}
        backgroundOpacity={customSubs.subtitleBgOpacity}
        textShadow={customSubs.subtitleTextShadow}
        outline={customSubs.subtitleOutline}
        outlineColor={customSubs.subtitleOutlineColor}
        outlineWidth={customSubs.subtitleOutlineWidth}
        align={customSubs.subtitleAlign}
        bottomOffset={customSubs.subtitleBottomOffset}
        letterSpacing={customSubs.subtitleLetterSpacing}
        lineHeightMultiplier={customSubs.subtitleLineHeightMultiplier}
        formattedSegments={customSubs.currentFormattedSegments}
        controlsVisible={showControls}
        controlsFixedOffset={106}
      />

      {/* Gesture Controls Overlay (Pan/Tap) */}
      <GestureControls
        screenDimensions={screenDimensions}
        gestureControls={gestureControls}
        onLongPressActivated={speedControl.activateSpeedBoost}
        onLongPressEnd={speedControl.deactivateSpeedBoost}
        onLongPressStateChange={() => { }}
        toggleControls={toggleControls}
        showControls={showControls}
        hideControls={hideControls}
        volume={volume}
        brightness={brightness}
        controlsTimeout={controlsTimeout}
      />

      {/* UI Controls */}
      {isVideoLoaded && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <PlayerControls
            showControls={showControls}
            fadeAnim={fadeAnim}
            paused={paused}
            title={title}
            episodeTitle={episodeTitle}
            season={season}
            episode={episode}
            quality={quality}
            year={year}
            streamProvider={streamProvider}
            streamName={streamName}
            currentTime={currentTime}
            duration={duration}
            zoomScale={zoomScale}
            currentResizeMode={resizeMode}
            ksAudioTracks={tracks.ksAudioTracks}
            selectedAudioTrack={tracks.selectedAudioTrack}
            availableStreams={availableStreams}
            togglePlayback={controls.togglePlayback}
            skip={controls.skip}
            handleClose={handleClose}
            cycleAspectRatio={() => setResizeMode(prev => prev === 'cover' ? 'contain' : 'cover')}
            cyclePlaybackSpeed={() => speedControl.setPlaybackSpeed(speedControl.playbackSpeed >= 2 ? 1 : speedControl.playbackSpeed + 0.25)}
            currentPlaybackSpeed={speedControl.playbackSpeed}
            setShowAudioModal={modals.setShowAudioModal}
            setShowSubtitleModal={modals.setShowSubtitleModal}
            setShowSpeedModal={modals.setShowSpeedModal}
            isSubtitleModalOpen={modals.showSubtitleModal}
            setShowSourcesModal={modals.setShowSourcesModal}
            setShowEpisodesModal={type === 'series' ? modals.setShowEpisodesModal : undefined}
            onSliderValueChange={onSliderValueChange}
            onSlidingStart={onSlidingStart}
            onSlidingComplete={onSlidingComplete}
            buffered={buffered}
            formatTime={formatTime}
            playerBackend="KSAVPlayer"
            isAirPlayActive={isAirPlayActive}
            allowsAirPlay={allowsAirPlay}
            onAirPlayPress={() => ksPlayerRef.current?.showAirPlayPicker()}
          />
        </View>
      )}

      {/* Speed Overlay */}
      <SpeedActivatedOverlay
        visible={speedControl.showSpeedActivatedOverlay}
        opacity={speedControl.speedActivatedOverlayOpacity}
        speed={speedControl.holdToSpeedValue}
      />

      {/* Pause Overlay */}
      <PauseOverlay
        visible={paused && !showControls}
        onClose={() => setShowControls(true)}
        title={title}
        episodeTitle={episodeTitle}
        season={season}
        episode={episode}
        year={year}
        type={type}
        description={metadata?.description || ''}
        cast={cast || []}
        screenDimensions={screenDimensions}
      />

      {/* Up Next Button */}
      <UpNextButton
        type={type}
        nextEpisode={null}
        currentTime={currentTime}
        duration={duration}
        insets={insets}
        isLoading={false}
        nextLoadingProvider={null}
        nextLoadingQuality={null}
        nextLoadingTitle={null}
        onPress={() => { }}
        metadata={metadata ? { poster: metadata.poster, id: metadata.id } : undefined}
        controlsVisible={showControls}
        controlsFixedOffset={126}
      />

      {/* Modals */}
      <AudioTrackModal
        showAudioModal={modals.showAudioModal}
        setShowAudioModal={modals.setShowAudioModal}
        ksAudioTracks={tracks.ksAudioTracks}
        selectedAudioTrack={tracks.selectedAudioTrack}
        selectAudioTrack={tracks.selectAudioTrack}
      />

      <ErrorModal
        showErrorModal={modals.showErrorModal}
        setShowErrorModal={modals.setShowErrorModal}
        errorDetails={modals.errorDetails}
        onDismiss={handleClose}
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

      <SubtitleModals
        showSubtitleModal={modals.showSubtitleModal}
        setShowSubtitleModal={modals.setShowSubtitleModal}
        showSubtitleLanguageModal={modals.showSubtitleLanguageModal}
        setShowSubtitleLanguageModal={modals.setShowSubtitleLanguageModal}
        customSubtitles={customSubs.customSubtitles}
        availableSubtitles={customSubs.availableSubtitles}
        fetchAvailableSubtitles={fetchAvailableSubtitles}
        loadWyzieSubtitle={loadWyzieSubtitle}
        subtitleSize={customSubs.subtitleSize}
        increaseSubtitleSize={() => customSubs.setSubtitleSize((s: number) => s + 2)}
        decreaseSubtitleSize={() => customSubs.setSubtitleSize((s: number) => Math.max(10, s - 2))}
        subtitleBackground={customSubs.subtitleBackground}
        toggleSubtitleBackground={() => customSubs.setSubtitleBackground((b: boolean) => !b)}
        subtitleTextColor={customSubs.subtitleTextColor}
        setSubtitleTextColor={customSubs.setSubtitleTextColor}
        subtitleBgOpacity={customSubs.subtitleBgOpacity}
        setSubtitleBgOpacity={customSubs.setSubtitleBgOpacity}
        subtitleTextShadow={customSubs.subtitleTextShadow}
        setSubtitleTextShadow={customSubs.setSubtitleTextShadow}
        subtitleOutline={customSubs.subtitleOutline}
        setSubtitleOutline={customSubs.setSubtitleOutline}
        subtitleOutlineColor={customSubs.subtitleOutlineColor}
        setSubtitleOutlineColor={customSubs.setSubtitleOutlineColor}
        subtitleOutlineWidth={customSubs.subtitleOutlineWidth}
        setSubtitleOutlineWidth={customSubs.setSubtitleOutlineWidth}
        subtitleAlign={customSubs.subtitleAlign}
        setSubtitleAlign={customSubs.setSubtitleAlign}
        subtitleBottomOffset={customSubs.subtitleBottomOffset}
        setSubtitleBottomOffset={customSubs.setSubtitleBottomOffset}
        subtitleLetterSpacing={customSubs.subtitleLetterSpacing}
        setSubtitleLetterSpacing={customSubs.setSubtitleLetterSpacing}
        subtitleLineHeightMultiplier={customSubs.subtitleLineHeightMultiplier}
        setSubtitleLineHeightMultiplier={customSubs.setSubtitleLineHeightMultiplier}
        subtitleOffsetSec={customSubs.subtitleOffsetSec}
        setSubtitleOffsetSec={customSubs.setSubtitleOffsetSec}
        isLoadingSubtitleList={customSubs.isLoadingSubtitleList}
        isLoadingSubtitles={customSubs.isLoadingSubtitles}
        ksTextTracks={tracks.ksTextTracks}
        selectedTextTrack={tracks.selectedTextTrack !== null ? tracks.selectedTextTrack : -1}
        useCustomSubtitles={customSubs.useCustomSubtitles}
        selectTextTrack={tracks.selectTextTrack}
        disableCustomSubtitles={() => {
          customSubs.setUseCustomSubtitles(false);
          tracks.selectTextTrack(-1);
        }}
      />

      <SourcesModal
        showSourcesModal={modals.showSourcesModal}
        setShowSourcesModal={modals.setShowSourcesModal}
        availableStreams={availableStreams || {}}
        currentStreamUrl={uri}
        onSelectStream={handleSelectStream}
      />

      {type === 'series' && (
        <EpisodesModal
          showEpisodesModal={modals.showEpisodesModal}
          setShowEpisodesModal={modals.setShowEpisodesModal}
          groupedEpisodes={groupedEpisodes}
          currentEpisode={{ season: season || 1, episode: episode || 1 }}
          metadata={{ poster: metadata?.poster, id: id }}
          onSelectEpisode={handleSelectEpisode}
        />
      )}

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

export default KSPlayerCore;