import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Dimensions, Animated, ActivityIndicator, Platform, NativeModules, StatusBar, Text, Image, StyleSheet } from 'react-native';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { PinchGestureHandler, State, PinchGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import RNImmersiveMode from 'react-native-immersive-mode';
import * as ScreenOrientation from 'expo-screen-orientation';
import { storageService } from '../../services/storageService';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import ResumeOverlay from './modals/ResumeOverlay';
import PlayerControls from './controls/PlayerControls';
import CustomSubtitles from './subtitles/CustomSubtitles';
import { SourcesModal } from './modals/SourcesModal';

const VideoPlayer: React.FC = () => {
  // If on Android, use the AndroidVideoPlayer component
  if (Platform.OS === 'android') {
    return <AndroidVideoPlayer />;
  }

  const navigation = useNavigation();
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

  // Get the Trakt autosync settings to use the user-configured sync frequency
  const { settings: traktSettings } = useTraktAutosyncSettings();

  safeDebugLog("Component mounted with props", {
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
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] = useState(false);
  const openingFadeAnim = useRef(new Animated.Value(0)).current;
  const openingScaleAnim = useRef(new Animated.Value(0.8)).current;
  const backgroundFadeAnim = useRef(new Animated.Value(1)).current;
  const [isBuffering, setIsBuffering] = useState(false);
  const [vlcAudioTracks, setVlcAudioTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [vlcTextTracks, setVlcTextTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressBarRef = useRef<View>(null);
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
  const [useCustomSubtitles, setUseCustomSubtitles] = useState<boolean>(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState<boolean>(false);
  const [availableSubtitles, setAvailableSubtitles] = useState<WyzieSubtitle[]>([]);
  const [showSubtitleLanguageModal, setShowSubtitleLanguageModal] = useState<boolean>(false);
  const [isLoadingSubtitleList, setIsLoadingSubtitleList] = useState<boolean>(false);
  const [showSourcesModal, setShowSourcesModal] = useState<boolean>(false);
  const [availableStreams, setAvailableStreams] = useState<{ [providerId: string]: { streams: any[]; addonName: string } }>(passedAvailableStreams || {});
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>(uri);
  const [isChangingSource, setIsChangingSource] = useState<boolean>(false);
  const [pendingSeek, setPendingSeek] = useState<{ position: number; shouldPlay: boolean } | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string | undefined>(quality);
  const [currentStreamProvider, setCurrentStreamProvider] = useState<string | undefined>(streamProvider);
  const [currentStreamName, setCurrentStreamName] = useState<string | undefined>(streamName);
  const isMounted = useRef(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isSyncingBeforeClose, setIsSyncingBeforeClose] = useState(false);
  
  // Get metadata to access logo (only if we have a valid id)
  const shouldLoadMetadata = Boolean(id && type);
  const metadataResult = useMetadata({ 
    id: id || 'placeholder', 
    type: type || 'movie' 
  });
  const { metadata, loading: metadataLoading } = shouldLoadMetadata ? metadataResult : { metadata: null, loading: false };
  const { settings } = useSettings();
  
  // Logo animation values
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
  const logoOpacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Check if we have a logo to show
  const hasLogo = metadata && metadata.logo && !metadataLoading;
  
  // Small offset (in seconds) used to avoid seeking to the *exact* end of the
  // file which triggers the `onEnd` callback and causes playback to restart.
  const END_EPSILON = 0.3;

  const hideControls = () => {
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
      logger.log(`[VideoPlayer] Center Zoom: ${newScale.toFixed(2)}x`);
    }
  };

  const onPinchHandlerStateChange = (event: PinchGestureHandlerGestureEvent) => {
    if (event.nativeEvent.state === State.END) {
      setLastZoomScale(zoomScale);
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Pinch ended - saved scale: ${zoomScale.toFixed(2)}x`);
      }
    }
  };

  const resetZoom = () => {
    const targetZoom = is16by9Content ? 1.1 : 1;
    setZoomScale(targetZoom);
    setLastZoomScale(targetZoom);
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Zoom reset to ${targetZoom}x (16:9: ${is16by9Content})`);
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
        logger.log(`[VideoPlayer] Screen dimensions changed, recalculated styles:`, styles);
      }
    }
  }, [screenDimensions, videoAspectRatio]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenDimensions(screen);
    });
    const initializePlayer = () => {
      StatusBar.setHidden(true, 'none');
      enableImmersiveMode();
      startOpeningAnimation();
    };
    initializePlayer();
    return () => {
      subscription?.remove();
      const unlockOrientation = async () => {
        await ScreenOrientation.unlockAsync();
      };
      unlockOrientation();
      disableImmersiveMode();
    };
  }, []);

  const startOpeningAnimation = () => {
    // Logo entrance animation
    Animated.parallel([
      Animated.timing(logoOpacityAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Continuous pulse animation for the logo
    const createPulseAnimation = () => {
      return Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
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
    
    // Start pulsing after a short delay
    setTimeout(() => {
      if (!isOpeningAnimationComplete) {
        loopPulse();
      }
    }, 800);
  };

  const completeOpeningAnimation = () => {
    Animated.parallel([
      Animated.timing(openingFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(openingScaleAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(backgroundFadeAnim, {
        toValue: 0,
        duration: 800,
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
          logger.log(`[VideoPlayer] Loading watch progress for ${type}:${id}${episodeId ? `:${episodeId}` : ''}`);
          const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
          logger.log(`[VideoPlayer] Saved progress:`, savedProgress);
          
          if (savedProgress) {
            const progressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
            logger.log(`[VideoPlayer] Progress: ${progressPercent.toFixed(1)}% (${savedProgress.currentTime}/${savedProgress.duration})`);
            
            if (progressPercent < 85) {
              setResumePosition(savedProgress.currentTime);
              setSavedDuration(savedProgress.duration);
              logger.log(`[VideoPlayer] Set resume position to: ${savedProgress.currentTime} of ${savedProgress.duration}`);
              setShowResumeOverlay(true);
              logger.log(`[VideoPlayer] Showing resume overlay`);
            } else {
              logger.log(`[VideoPlayer] Progress too high (${progressPercent.toFixed(1)}%), not showing resume overlay`);
            }
          } else {
            logger.log(`[VideoPlayer] No saved progress found`);
          }
        } catch (error) {
          logger.error('[VideoPlayer] Error loading watch progress:', error);
        }
      } else {
        logger.log(`[VideoPlayer] Missing id or type: id=${id}, type=${type}`);
      }
    };
    loadWatchProgress();
  }, [id, type, episodeId]);

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
      
      // Use the user's configured sync frequency instead of hard-coded 5000ms
      // But ensure we have a minimum interval of 5 seconds
      const syncInterval = Math.max(5000, traktSettings.syncFrequency);
      
      const interval = setInterval(() => {
        saveWatchProgress();
      }, syncInterval);
      
      logger.log(`[VideoPlayer] Watch progress save interval set to ${syncInterval}ms`);
      
      setProgressSaveInterval(interval);
      return () => {
        clearInterval(interval);
        setProgressSaveInterval(null);
      };
    }
  }, [id, type, paused, currentTime, duration, traktSettings.syncFrequency]);

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
        logger.log('[VideoPlayer] Sent forced pause update to Trakt');
      }
    }
  };

  const seekToTime = (rawSeconds: number) => {
    // Clamp to just before the end to avoid triggering onEnd.
    const timeInSeconds = Math.max(0, Math.min(rawSeconds, duration > 0 ? duration - END_EPSILON : rawSeconds));
    if (vlcRef.current && duration > 0 && !isSeeking.current) {
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Seeking to ${timeInSeconds.toFixed(2)}s out of ${duration.toFixed(2)}s`);
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

  const handleProgressBarTouch = (event: any) => {
    if (duration > 0) {
      const { locationX } = event.nativeEvent;
      processProgressTouch(locationX);
    }
  };
  
  const handleProgressBarDragStart = () => {
    setIsDragging(true);
  };
  
  const handleProgressBarDragMove = (event: any) => {
    if (!isDragging || !duration || duration <= 0) return;
    const { locationX } = event.nativeEvent;
    processProgressTouch(locationX, true);
  };
  
  const handleProgressBarDragEnd = () => {
    setIsDragging(false);
    if (pendingSeekValue.current !== null) {
      seekToTime(pendingSeekValue.current);
      pendingSeekValue.current = null;
    }
  };
  
  const processProgressTouch = (locationX: number, isDragging = false) => {
    progressBarRef.current?.measure((x, y, width, height, pageX, pageY) => {
      const percentage = Math.max(0, Math.min(locationX / width, 0.999));
      const seekTime = Math.min(percentage * duration, duration - END_EPSILON);
      progressAnim.setValue(percentage);
      if (isDragging) {
        pendingSeekValue.current = seekTime;
        setCurrentTime(seekTime);
      } else {
        seekToTime(seekTime);
      }
    });
  };

  const handleProgress = (event: any) => {
    if (isDragging || isSeeking.current) return;
    
    const currentTimeInSeconds = event.currentTime / 1000;
    
    // Only update if there's a significant change to avoid unnecessary updates
    if (Math.abs(currentTimeInSeconds - currentTime) > 0.5) {
      safeSetState(() => setCurrentTime(currentTimeInSeconds));
      const progressPercent = duration > 0 ? currentTimeInSeconds / duration : 0;
      Animated.timing(progressAnim, {
        toValue: progressPercent,
        duration: 250,
        useNativeDriver: false,
      }).start();
      const bufferedTime = event.bufferTime / 1000 || currentTimeInSeconds;
      safeSetState(() => setBuffered(bufferedTime));
    }
  };

  const onLoad = (data: any) => {
    if (DEBUG_MODE) {
      logger.log('[VideoPlayer] Video loaded:', data);
    }
    if (isMounted.current) {
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
      setVideoAspectRatio(data.videoSize.width / data.videoSize.height);

      if (data.audioTracks && data.audioTracks.length > 0) {
        setVlcAudioTracks(data.audioTracks);
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
      
      if (initialPosition && !isInitialSeekComplete) {
        logger.log(`[VideoPlayer] Seeking to initial position: ${initialPosition}s (duration: ${videoDuration}s)`);
        setTimeout(() => {
          if (vlcRef.current && videoDuration > 0 && isMounted.current) {
            seekToTime(initialPosition);
            setIsInitialSeekComplete(true);
            logger.log(`[VideoPlayer] Initial seek completed to: ${initialPosition}s`);
          } else {
            logger.error(`[VideoPlayer] Initial seek failed: vlcRef=${!!vlcRef.current}, duration=${videoDuration}, mounted=${isMounted.current}`);
          }
        }, 1000);
      }
      completeOpeningAnimation();
      controlsTimeout.current = setTimeout(hideControls, 5000);
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
        console.log('Immersive mode error:', error);
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
    logger.log('[VideoPlayer] Close button pressed - syncing to Trakt before closing');
    
    // Set syncing state to prevent multiple close attempts
    setIsSyncingBeforeClose(true);
    
    // Make sure we have the most accurate current time
    const actualCurrentTime = currentTime;
    const progressPercent = duration > 0 ? (actualCurrentTime / duration) * 100 : 0;
    
    logger.log(`[VideoPlayer] Current progress: ${actualCurrentTime}/${duration} (${progressPercent.toFixed(1)}%)`);
    
    try {
      // Force one last progress update (scrobble/pause) with the exact time
      await traktAutosync.handleProgressUpdate(actualCurrentTime, duration, true);
      
      // Sync progress to Trakt before closing
      await traktAutosync.handlePlaybackEnd(actualCurrentTime, duration, 'unmount');
      
      // Start exit animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(openingFadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
  
      // Longer delay to ensure Trakt sync completes
      setTimeout(() => {
        ScreenOrientation.unlockAsync().then(() => {
          disableImmersiveMode();
          navigation.goBack();
        }).catch(() => {
          // Fallback: navigate even if orientation unlock fails
          disableImmersiveMode();
          navigation.goBack();
        });
      }, 500); // Increased from 100ms to 500ms
    } catch (error) {
      logger.error('[VideoPlayer] Error syncing to Trakt before closing:', error);
      // Navigate anyway even if sync fails
      disableImmersiveMode();
      navigation.goBack();
    }
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
      
      // Small delay to ensure the progress update is processed
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Now send the stop call
      logger.log('[VideoPlayer] Sending final stop call after natural end');
      await traktAutosync.handlePlaybackEnd(finalTime, duration, 'ended');
      
      logger.log('[VideoPlayer] Completed video end sync to Trakt');
    } catch (error) {
      logger.error('[VideoPlayer] Error syncing to Trakt on video end:', error);
    }
  };

  const selectAudioTrack = (trackId: number) => {
    setSelectedAudioTrack(trackId);
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

  const fetchAvailableSubtitles = async (imdbIdParam?: string, autoSelectEnglish = false) => {
    const targetImdbId = imdbIdParam || imdbId;
    if (!targetImdbId) {
      logger.error('[VideoPlayer] No IMDb ID available for subtitle search');
      return;
    }
    setIsLoadingSubtitleList(true);
    try {
      let searchUrl = `https://sub.wyzie.ru/search?id=${targetImdbId}&encoding=utf-8&source=all`;
      if (season && episode) {
        searchUrl += `&season=${season}&episode=${episode}`;
      }
      const response = await fetch(searchUrl);
      const subtitles: WyzieSubtitle[] = await response.json();
      const uniqueSubtitles = subtitles.reduce((acc, current) => {
        const exists = acc.find(item => item.language === current.language);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, [] as WyzieSubtitle[]);
      uniqueSubtitles.sort((a, b) => a.display.localeCompare(b.display));
      setAvailableSubtitles(uniqueSubtitles);
      if (autoSelectEnglish) {
        const englishSubtitle = uniqueSubtitles.find(sub => 
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
        setShowSubtitleLanguageModal(true);
      }
    } catch (error) {
      logger.error('[VideoPlayer] Error fetching subtitles from Wyzie API:', error);
    } finally {
      setIsLoadingSubtitleList(false);
    }
  };

  const loadWyzieSubtitle = async (subtitle: WyzieSubtitle) => {
    setShowSubtitleLanguageModal(false);
    setIsLoadingSubtitles(true);
    try {
      const response = await fetch(subtitle.url);
      const srtContent = await response.text();
      const parsedCues = parseSRT(srtContent);
      setCustomSubtitles(parsedCues);
      setUseCustomSubtitles(true);
      setSelectedTextTrack(-1);
    } catch (error) {
      logger.error('[VideoPlayer] Error loading Wyzie subtitle:', error);
    } finally {
      setIsLoadingSubtitles(false);
    }
  };
    
  const togglePlayback = () => {
    if (vlcRef.current) {
        setPaused(!paused);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
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
    const currentCue = customSubtitles.find(cue => 
      currentTime >= cue.start && currentTime <= cue.end
    );
    const newSubtitle = currentCue ? currentCue.text : '';
    setCurrentSubtitle(newSubtitle);
  }, [currentTime, customSubtitles, useCustomSubtitles]);

  useEffect(() => {
    loadSubtitleSize();
  }, []);

  const increaseSubtitleSize = () => {
    const newSize = Math.min(subtitleSize + 2, 32);
    saveSubtitleSize(newSize);
  };

  const decreaseSubtitleSize = () => {
    const newSize = Math.max(subtitleSize - 2, 8);
    saveSubtitleSize(newSize);
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
        <TouchableOpacity
          style={[styles.videoContainer, {
            width: screenDimensions.width,
            height: screenDimensions.height,
          }]}
          onPress={toggleControls}
          activeOpacity={1}
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
                  source={{ uri: currentStreamUrl }}
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
            setShowSourcesModal={setShowSourcesModal}
            progressBarRef={progressBarRef}
            progressAnim={progressAnim}
            handleProgressBarTouch={handleProgressBarTouch}
            handleProgressBarDragStart={handleProgressBarDragStart}
            handleProgressBarDragMove={handleProgressBarDragMove}
            handleProgressBarDragEnd={handleProgressBarDragEnd}
            buffered={buffered}
            formatTime={formatTime}
          />
          
          <CustomSubtitles
            useCustomSubtitles={useCustomSubtitles}
            currentSubtitle={currentSubtitle}
            subtitleSize={subtitleSize}
            zoomScale={zoomScale}
          />

          <ResumeOverlay
            showResumeOverlay={showResumeOverlay}
            resumePosition={resumePosition}
            duration={savedDuration || duration}
            title={episodeTitle || title}
            season={season}
            episode={episode}
            handleResume={handleResume}
            handleStartFromBeginning={handleStartFromBeginning}
          />
        </TouchableOpacity> 
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
        fetchAvailableSubtitles={fetchAvailableSubtitles}
        loadWyzieSubtitle={loadWyzieSubtitle}
        selectTextTrack={selectTextTrack}
        increaseSubtitleSize={increaseSubtitleSize}
        decreaseSubtitleSize={decreaseSubtitleSize}
      />
      
      <SourcesModal
        showSourcesModal={showSourcesModal}
        setShowSourcesModal={setShowSourcesModal}
        availableStreams={availableStreams}
        currentStreamUrl={currentStreamUrl}
        onSelectStream={handleSelectStream}
        isChangingSource={isChangingSource}
      />
    </View> 
  );
};

export default VideoPlayer; 