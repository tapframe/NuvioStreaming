import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Dimensions, Animated, ActivityIndicator, Platform, NativeModules, StatusBar, Text } from 'react-native';
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
import SubtitleModals from './modals/SubtitleModals';
import AudioTrackModal from './modals/AudioTrackModal';
import ResumeOverlay from './modals/ResumeOverlay';
import PlayerControls from './controls/PlayerControls';
import CustomSubtitles from './subtitles/CustomSubtitles';

const VideoPlayer: React.FC = () => {
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
    id,
    type,
    episodeId,
    imdbId
  } = route.params;

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
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('stretch');
  const [buffered, setBuffered] = useState(0);
  const vlcRef = useRef<any>(null);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [progressSaveInterval, setProgressSaveInterval] = useState<NodeJS.Timeout | null>(null);
  const [isInitialSeekComplete, setIsInitialSeekComplete] = useState(false);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [resumePreference, setResumePreference] = useState<string | null>(null);
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
    const isMounted = useRef(true);

  const calculateVideoStyles = (videoWidth: number, videoHeight: number, screenWidth: number, screenHeight: number) => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      width: screenWidth,
      height: screenHeight,
      backgroundColor: '#000',
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
    // Animation logic here
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
          const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
          if (savedProgress) {
            const progressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
            if (progressPercent < 95) {
              setResumePosition(savedProgress.currentTime);
              const pref = await AsyncStorage.getItem(RESUME_PREF_KEY);
              if (pref === RESUME_PREF.ALWAYS_RESUME) {
                setInitialPosition(savedProgress.currentTime);
              } else if (pref === RESUME_PREF.ALWAYS_START_OVER) {
                setInitialPosition(0);
              } else {
                setShowResumeOverlay(true);
              }
            }
          }
        } catch (error) {
          logger.error('[VideoPlayer] Error loading watch progress:', error);
        }
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
      const interval = setInterval(() => {
        saveWatchProgress();
      }, 5000);
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
      }
    };
  }, [id, type, currentTime, duration]);
    
  const seekToTime = (timeInSeconds: number) => {
    if (!isPlayerReady || duration <= 0 || !vlcRef.current) return;
    const normalizedPosition = Math.max(0, Math.min(timeInSeconds / duration, 1));
    try {
      if (typeof vlcRef.current.setPosition === 'function') {
        vlcRef.current.setPosition(normalizedPosition);
      } else if (typeof vlcRef.current.seek === 'function') {
        vlcRef.current.seek(normalizedPosition);
      } else {
        logger.error('[VideoPlayer] No seek method available on VLC player');
      }
    } catch (error) {
      logger.error('[VideoPlayer] Error during seek operation:', error);
    }
  };

  const handleProgressBarTouch = (event: any) => {
    if (!duration || duration <= 0) return;
    const { locationX } = event.nativeEvent;
    processProgressTouch(locationX);
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
      const percentage = Math.max(0, Math.min(locationX / width, 1));
      const seekTime = percentage * duration;
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
    if (isDragging) return;
    const currentTimeInSeconds = event.currentTime / 1000;
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
    setDuration(data.duration / 1000);
    if (data.videoSize && data.videoSize.width && data.videoSize.height) {
      const aspectRatio = data.videoSize.width / data.videoSize.height;
      setVideoAspectRatio(aspectRatio);
      const is16x9 = Math.abs(aspectRatio - (16/9)) < 0.1;
      setIs16by9Content(is16x9);
      if (is16x9) {
        setZoomScale(1.1);
        setLastZoomScale(1.1);
      } else {
        setZoomScale(1);
        setLastZoomScale(1);
      }
      const styles = calculateVideoStyles(
        data.videoSize.width,
        data.videoSize.height,
        screenDimensions.width,
        screenDimensions.height
      );
      setCustomVideoStyles(styles);
    } else {
      setIs16by9Content(true);
      setZoomScale(1.1);
      setLastZoomScale(1.1);
      const defaultStyles = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: screenDimensions.width,
        height: screenDimensions.height,
      };
      setCustomVideoStyles(defaultStyles);
    }
    setIsPlayerReady(true);
    const audioTracksFromLoad = data.audioTracks || [];
    const textTracksFromLoad = data.textTracks || [];
    setVlcAudioTracks(audioTracksFromLoad);
    setVlcTextTracks(textTracksFromLoad);
    if (audioTracksFromLoad.length > 1) {
        const firstEnabledAudio = audioTracksFromLoad.find((t: any) => t.id !== -1);
        if(firstEnabledAudio) {
            setSelectedAudioTrack(firstEnabledAudio.id);
        }
    } else if (audioTracksFromLoad.length > 0) {
        setSelectedAudioTrack(audioTracksFromLoad[0].id);
    }
    if (imdbId && !customSubtitles.length) {
      setTimeout(() => {
        fetchAvailableSubtitles(imdbId, true);
      }, 2000);
    }
    if (initialPosition !== null && !isInitialSeekComplete) {
      setTimeout(() => {
        if (vlcRef.current && duration > 0 && isMounted.current) {
          seekToTime(initialPosition);
          setIsInitialSeekComplete(true);
        }
      }, 1000);
    }
    setIsVideoLoaded(true);
    completeOpeningAnimation();
  };

  const skip = (seconds: number) => {
    if (vlcRef.current) {
      const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
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

  const handleClose = () => {
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

    // Small delay to allow animation to start, then unlock orientation and navigate
    setTimeout(() => {
      ScreenOrientation.unlockAsync().then(() => {
        disableImmersiveMode();
        navigation.goBack();
      }).catch(() => {
        // Fallback: navigate even if orientation unlock fails
        disableImmersiveMode();
        navigation.goBack();
      });
    }, 100);
  };
    
  useEffect(() => {
    const loadResumePreference = async () => {
      try {
        const pref = await AsyncStorage.getItem(RESUME_PREF_KEY);
        if (pref) {
          setResumePreference(pref);
          if (pref === RESUME_PREF.ALWAYS_RESUME && resumePosition !== null) {
            setShowResumeOverlay(false);
            setInitialPosition(resumePosition);
          } else if (pref === RESUME_PREF.ALWAYS_START_OVER) {
            setShowResumeOverlay(false);
            setInitialPosition(0);
          }
        }
      } catch (error) {
        logger.error('[VideoPlayer] Error loading resume preference:', error);
      }
    };
    loadResumePreference();
  }, [resumePosition]);

  const resetResumePreference = async () => {
    try {
      await AsyncStorage.removeItem(RESUME_PREF_KEY);
      setResumePreference(null);
    } catch (error) {
      logger.error('[VideoPlayer] Error resetting resume preference:', error);
    }
  };

  const handleResume = async () => {
    if (resumePosition !== null && vlcRef.current) {
      if (rememberChoice) {
        try {
          await AsyncStorage.setItem(RESUME_PREF_KEY, RESUME_PREF.ALWAYS_RESUME);
        } catch (error) {
          logger.error('[VideoPlayer] Error saving resume preference:', error);
        }
      }
      setInitialPosition(resumePosition);
      setShowResumeOverlay(false);
      setTimeout(() => {
        if (vlcRef.current) {
          seekToTime(resumePosition);
        }
      }, 500);
    }
  };

  const handleStartFromBeginning = async () => {
    if (rememberChoice) {
      try {
        await AsyncStorage.setItem(RESUME_PREF_KEY, RESUME_PREF.ALWAYS_START_OVER);
      } catch (error) {
        logger.error('[VideoPlayer] Error saving resume preference:', error);
      }
    }
    setShowResumeOverlay(false);
    setInitialPosition(0);
    if (vlcRef.current) {
      seekToTime(0);
      setCurrentTime(0);
    }
  };

  const toggleControls = () => {
    setShowControls(previousState => !previousState);
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: showControls ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showControls]);

  const handleError = (error: any) => {
    logger.error('[VideoPlayer] Playback Error:', error);
  };

  const onBuffering = (event: any) => {
    setIsBuffering(event.isBuffering);
  };

  const onEnd = () => {
    // End logic here
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
        <TouchableOpacity 
          style={styles.loadingCloseButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <MaterialIcons name="close" size={24} color="#ffffff" />
        </TouchableOpacity>
        
        <View style={styles.openingContent}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.openingText}>Loading video...</Text>
        </View>
      </Animated.View>

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
              backgroundColor: '#000',
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
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: screenDimensions.width,
                    height: screenDimensions.height,
                    transform: [
                      { scale: zoomScale },
                    ],
                  }}
                  source={{
                    uri: uri,
                    initOptions: [
                      '--rtsp-tcp',
                      '--network-caching=150',
                      '--rtsp-caching=150',
                      '--no-audio-time-stretch',
                      '--clock-jitter=0',
                      '--clock-synchro=0',
                      '--drop-late-frames',
                      '--skip-frames',
                    ],
                  }}
                  paused={paused}
                  autoplay={true}
                  autoAspectRatio={false}
                  resizeMode={'stretch' as any}
                  audioTrack={selectedAudioTrack || undefined}
                  textTrack={selectedTextTrack === -1 ? undefined : selectedTextTrack}
                  onLoad={onLoad}
                  onProgress={handleProgress}
                  onEnd={onEnd}
                  onError={handleError}
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
            quality={quality}
            year={year}
            streamProvider={streamProvider}
            currentTime={currentTime}
            duration={duration}
            playbackSpeed={playbackSpeed}
            zoomScale={zoomScale}
            vlcAudioTracks={vlcAudioTracks}
            selectedAudioTrack={selectedAudioTrack}
            togglePlayback={togglePlayback}
            skip={skip}
            handleClose={handleClose}
            cycleAspectRatio={cycleAspectRatio}
            setShowAudioModal={setShowAudioModal}
            setShowSubtitleModal={setShowSubtitleModal}
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
          />

          <ResumeOverlay
            showResumeOverlay={showResumeOverlay}
            resumePosition={resumePosition}
            duration={duration}
            title={title}
            season={season}
            episode={episode}
            rememberChoice={rememberChoice}
            setRememberChoice={setRememberChoice}
            resumePreference={resumePreference}
            resetResumePreference={resetResumePreference}
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
    </View> 
  );
};

export default VideoPlayer; 