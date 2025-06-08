import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Dimensions, Modal, Pressable, StatusBar, Platform, ScrollView, Animated, ActivityIndicator, Image } from 'react-native';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSharedValue, runOnJS, withTiming } from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
// Add Gesture Handler imports for pinch zoom
import { PinchGestureHandler, State, PinchGestureHandlerGestureEvent } from 'react-native-gesture-handler';
// Import for navigation bar hiding
import { NativeModules } from 'react-native';
// Import immersive mode package
import RNImmersiveMode from 'react-native-immersive-mode';
// Import screen orientation lock
import * as ScreenOrientation from 'expo-screen-orientation';
// Import storage service for progress tracking
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Debug flag - set back to false to disable verbose logging
// WARNING: Setting this to true currently causes infinite render loops
// Use selective logging instead if debugging is needed
const DEBUG_MODE = true;

// Safer debug function that won't cause render loops
// Call this with any debugging info you need instead of using inline DEBUG_MODE checks
const safeDebugLog = (message: string, data?: any) => {
  // This function only runs once per call site, avoiding render loops
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (DEBUG_MODE) {
      if (data) {
        logger.log(`[VideoPlayer] ${message}`, data);
      } else {
        logger.log(`[VideoPlayer] ${message}`);
      }
    }
  }, []); // Empty dependency array means this only runs once per mount
};

// Constants for resume preferences - add after type definitions
const RESUME_PREF_KEY = '@video_resume_preference';
const RESUME_PREF = {
  ALWAYS_ASK: 'always_ask',
  ALWAYS_RESUME: 'always_resume',
  ALWAYS_START_OVER: 'always_start_over'
};

// Define the TrackPreferenceType for audio/text tracks
type TrackPreferenceType = 'system' | 'disabled' | 'title' | 'language' | 'index';

// Define the SelectedTrack type for audio/text tracks
interface SelectedTrack {
  type: TrackPreferenceType;
  value?: string | number; // value is optional for 'system' and 'disabled'
}

interface VideoPlayerProps {
  uri: string;
  title?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  quality?: string;
  year?: number;
  streamProvider?: string;
  id?: string;
  type?: string;
  episodeId?: string;
  imdbId?: string; // Add IMDb ID for subtitle fetching
}

// Match the react-native-video AudioTrack type
interface AudioTrack {
  index: number;
  title?: string;
  language?: string;
  bitrate?: number;
  type?: string;
  selected?: boolean;
}

// Define TextTrack interface based on react-native-video expected structure
interface TextTrack {
  index: number;
  title?: string;
  language?: string;
  type?: string | null; // Adjusting type based on linter error
}

// Define the possible resize modes - force to stretch for absolute full screen
type ResizeModeType = 'contain' | 'cover' | 'fill' | 'none' | 'stretch';
const resizeModes: ResizeModeType[] = ['stretch']; // Force stretch mode for absolute full screen

// Add language code to name mapping
const languageMap: {[key: string]: string} = {
  'en': 'English',
  'eng': 'English',
  'es': 'Spanish',
  'spa': 'Spanish',
  'fr': 'French',
  'fre': 'French',
  'de': 'German',
  'ger': 'German',
  'it': 'Italian',
  'ita': 'Italian',
  'ja': 'Japanese',
  'jpn': 'Japanese',
  'ko': 'Korean',
  'kor': 'Korean',
  'zh': 'Chinese',
  'chi': 'Chinese',
  'ru': 'Russian',
  'rus': 'Russian',
  'pt': 'Portuguese',
  'por': 'Portuguese',
  'hi': 'Hindi',
  'hin': 'Hindi',
  'ar': 'Arabic',
  'ara': 'Arabic',
  'nl': 'Dutch',
  'dut': 'Dutch',
  'sv': 'Swedish',
  'swe': 'Swedish',
  'no': 'Norwegian',
  'nor': 'Norwegian',
  'fi': 'Finnish',
  'fin': 'Finnish',
  'da': 'Danish',
  'dan': 'Danish',
  'pl': 'Polish',
  'pol': 'Polish',
  'tr': 'Turkish',
  'tur': 'Turkish',
  'cs': 'Czech',
  'cze': 'Czech',
  'hu': 'Hungarian',
  'hun': 'Hungarian',
  'el': 'Greek',
  'gre': 'Greek',
  'th': 'Thai',
  'tha': 'Thai',
  'vi': 'Vietnamese',
  'vie': 'Vietnamese',
};

// Function to format language code to readable name
const formatLanguage = (code?: string): string => {
  if (!code) return 'Unknown';
  const normalized = code.toLowerCase();
  const languageName = languageMap[normalized] || code.toUpperCase();
  
  // Debug logs removed to prevent render loops
  
  // If the result is still the uppercased code, it means we couldn't find it in our map.
  if (languageName === code.toUpperCase()) {
      return `Unknown (${code})`;
  }

  return languageName;
};

// Add VLC specific interface for their event structure
interface VlcMediaEvent {
  currentTime: number;
  duration: number;
  bufferTime?: number;
  isBuffering?: boolean;
  audioTracks?: Array<{id: number, name: string, language?: string}>;
  textTracks?: Array<{id: number, name: string, language?: string}>;
  selectedAudioTrack?: number;
  selectedTextTrack?: number;
}

// Helper function to extract a display name from the track's name property
const getTrackDisplayName = (track: { name?: string, id: number }): string => {
  if (!track || !track.name) return `Track ${track.id}`;

  // Try to extract language from name like "Some Info - [English]"
  const languageMatch = track.name.match(/\[(.*?)\]/);
  if (languageMatch && languageMatch[1]) {
      return languageMatch[1];
  }
  
  // If no language in brackets, or if the name is simple, use the full name
  return track.name;
};

// Add subtitle-related constants and types
const SUBTITLE_SIZE_KEY = '@subtitle_size_preference';
const DEFAULT_SUBTITLE_SIZE = 16;

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

// Add interface for Wyzie subtitle API response
interface WyzieSubtitle {
  id: string;
  url: string;
  flagUrl: string;
  format: string;
  encoding: string;
  media: string;
  display: string;
  language: string;
  isHearingImpaired: boolean;
  source: string;
}

const VideoPlayer: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  
  // Extract props from route.params
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

  // Use safer debug logging for props
  safeDebugLog("Component mounted with props", {
    uri, title, season, episode, episodeTitle, quality, year,
    streamProvider, id, type, episodeId, imdbId
  });

  // Get exact screen dimensions
  const screenData = Dimensions.get('screen'); // Use 'screen' instead of 'window' to include system UI areas
  const [screenDimensions, setScreenDimensions] = useState(screenData);

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1); // Use -1 for "disabled"
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('stretch'); // Force stretch mode for absolute full screen
  const [buffered, setBuffered] = useState(0); // Add buffered state
  const vlcRef = useRef<any>(null);
  const progress = useSharedValue(0);
  const min = useSharedValue(0);
  const max = useSharedValue(duration);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);

  // Add state for tracking initial position to seek to
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [progressSaveInterval, setProgressSaveInterval] = useState<NodeJS.Timeout | null>(null);
  const [isInitialSeekComplete, setIsInitialSeekComplete] = useState(false);

  // Add state for showing resume overlay
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  
  // Add state for remembering choice
  const [rememberChoice, setRememberChoice] = useState(false);
  const [resumePreference, setResumePreference] = useState<string | null>(null);

  // Add animated value for controls opacity
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Add opening animation states and values
  const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] = useState(false);
  const openingFadeAnim = useRef(new Animated.Value(0)).current;
  const openingScaleAnim = useRef(new Animated.Value(0.8)).current;
  const backgroundFadeAnim = useRef(new Animated.Value(1)).current;

  // Add VLC specific state and refs
  const [isBuffering, setIsBuffering] = useState(false);

  // Modify audio tracks handling for VLC
  const [vlcAudioTracks, setVlcAudioTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);
  const [vlcTextTracks, setVlcTextTracks] = useState<Array<{id: number, name: string, language?: string}>>([]);

  // Add a new state to track if the player is ready for seeking
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  // Animated value for smooth progress bar
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Add ref for progress bar container to measure its width
  const progressBarRef = useRef<View>(null);

  // Add state for progress bar touch tracking
  const [isDragging, setIsDragging] = useState(false);

  // Add a ref for debouncing seek operations
  const seekDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekValue = useRef<number | null>(null);
  const lastSeekTime = useRef<number>(0);

  // Add state for tracking if the video is loaded
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  // Add state for tracking video aspect ratio
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  const [is16by9Content, setIs16by9Content] = useState(false);
  const [customVideoStyles, setCustomVideoStyles] = useState<any>({});

  // Add zoom state for pinch gesture
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomTranslateX, setZoomTranslateX] = useState(0);
  const [zoomTranslateY, setZoomTranslateY] = useState(0);
  const [lastZoomScale, setLastZoomScale] = useState(1);
  const [lastTranslateX, setLastTranslateX] = useState(0);
  const [lastTranslateY, setLastTranslateY] = useState(0);
  const pinchRef = useRef<PinchGestureHandler>(null);

  // Add subtitle-related state
  const [customSubtitles, setCustomSubtitles] = useState<SubtitleCue[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [subtitleSize, setSubtitleSize] = useState<number>(DEFAULT_SUBTITLE_SIZE);
  const [useCustomSubtitles, setUseCustomSubtitles] = useState<boolean>(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState<boolean>(false);
  
  // Add Wyzie subtitle states
  const [availableSubtitles, setAvailableSubtitles] = useState<WyzieSubtitle[]>([]);
  const [showSubtitleLanguageModal, setShowSubtitleLanguageModal] = useState<boolean>(false);
  const [isLoadingSubtitleList, setIsLoadingSubtitleList] = useState<boolean>(false);

  // Calculate custom video styles based on aspect ratios - simplified approach
  const calculateVideoStyles = (videoWidth: number, videoHeight: number, screenWidth: number, screenHeight: number) => {
    // Always return full screen styles - let VLC resize modes handle the rest
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      width: screenWidth,
      height: screenHeight,
      backgroundColor: '#000',
    };
  };

  // Pinch gesture handler for zoom functionality - center zoom only, no panning
  const onPinchGestureEvent = (event: PinchGestureHandlerGestureEvent) => {
    const { scale } = event.nativeEvent;
    
    // Calculate new scale (limit between 1x and 1.1x)
    const newScale = Math.max(1, Math.min(lastZoomScale * scale, 1.1));
    
    // Only apply scale, no translation - always zoom from center
    setZoomScale(newScale);
    
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Center Zoom: ${newScale.toFixed(2)}x`);
    }
  };

  const onPinchHandlerStateChange = (event: PinchGestureHandlerGestureEvent) => {
    if (event.nativeEvent.state === State.END) {
      // Save the current scale as the new baseline, no translation
      setLastZoomScale(zoomScale);
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Pinch ended - saved scale: ${zoomScale.toFixed(2)}x`);
      }
    }
  };

  // Reset zoom to appropriate level (1.1x for 16:9, 1x for others)
  const resetZoom = () => {
    const targetZoom = is16by9Content ? 1.1 : 1;
    
    setZoomScale(targetZoom);
    setLastZoomScale(targetZoom);
    // No translation needed for center zoom
    
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Zoom reset to ${targetZoom}x (16:9: ${is16by9Content})`);
    }
  };

  // Recalculate video styles when screen dimensions change
  useEffect(() => {
    if (videoAspectRatio && screenDimensions.width > 0 && screenDimensions.height > 0) {
      const styles = calculateVideoStyles(
        videoAspectRatio * 1000, // Reconstruct width from aspect ratio
        1000, // Use 1000 as base height
        screenDimensions.width,
        screenDimensions.height
      );
      setCustomVideoStyles(styles);
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Screen dimensions changed, recalculated styles:`, styles);
      }
    }
  }, [screenDimensions, videoAspectRatio]);

  // Lock screen to landscape when component mounts
  useEffect(() => {
    // Update screen dimensions when they change (orientation changes)
    const subscription = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenDimensions(screen);
    });

    // Since orientation is now locked before navigation, we can start immediately
    const initializePlayer = () => {
      // Force StatusBar to be completely hidden
      StatusBar.setHidden(true, 'none');
      
      // Enable immersive mode with more aggressive settings
      enableImmersiveMode();
      
      // Start the opening animation immediately
      startOpeningAnimation();
    };

    initializePlayer();

    // Restore screen orientation and disable immersive mode when component unmounts
    return () => {
      subscription?.remove();
      const unlockOrientation = async () => {
        await ScreenOrientation.unlockAsync();
      };
      unlockOrientation();
      disableImmersiveMode();
    };
  }, []);

  // Opening animation sequence - modified to wait for video load
  const startOpeningAnimation = () => {
    // Keep everything black until video loads
    // Only show loading indicator, no video player fade-in yet
    // Note: All animations will be triggered by onLoad when video is ready
  };

  // Complete the opening animation when video loads
  const completeOpeningAnimation = () => {
    // Start all animations together when video is ready
    Animated.parallel([
      // Fade in the video player
      Animated.timing(openingFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // Scale up from 80% to 100% and ensure it stays at 100%
      Animated.timing(openingScaleAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      // Fade out the black background overlay
      Animated.timing(backgroundFadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Animation is complete - ensure scale is exactly 1
      openingScaleAnim.setValue(1);
      openingFadeAnim.setValue(1);
      setIsOpeningAnimationComplete(true);
      
      // Hide the background overlay completely after animation
      setTimeout(() => {
        backgroundFadeAnim.setValue(0);
      }, 100);
    });
  };

  // Load saved watch progress on mount
  useEffect(() => {
    const loadWatchProgress = async () => {
      if (id && type) {
        try {
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Checking for saved progress with id=${id}, type=${type}, episodeId=${episodeId || 'none'}`);
          }
          const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
          
          if (savedProgress) {
            if (DEBUG_MODE) {
              logger.log(`[VideoPlayer] Found saved progress:`, savedProgress);
            }
            
            if (savedProgress.currentTime > 0) {
              // Only auto-resume if less than 95% watched (not effectively complete)
              const progressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
              if (DEBUG_MODE) {
                logger.log(`[VideoPlayer] Progress percent: ${progressPercent.toFixed(2)}%`);
              }
              
              if (progressPercent < 95) {
                if (DEBUG_MODE) {
                  logger.log(`[VideoPlayer] Setting initial position to ${savedProgress.currentTime}`);
                }
                // Set resume position
                setResumePosition(savedProgress.currentTime);
                
                // Check for saved preference
                const pref = await AsyncStorage.getItem(RESUME_PREF_KEY);
                if (pref === RESUME_PREF.ALWAYS_RESUME) {
                  setInitialPosition(savedProgress.currentTime);
                  if (DEBUG_MODE) {
                    logger.log(`[VideoPlayer] Auto-resuming based on saved preference`);
                  }
                } else if (pref === RESUME_PREF.ALWAYS_START_OVER) {
                  setInitialPosition(0);
                  if (DEBUG_MODE) {
                    logger.log(`[VideoPlayer] Auto-starting from beginning based on saved preference`);
                  }
                } else {
                  // Only show resume overlay if no preference or ALWAYS_ASK
                  setShowResumeOverlay(true);
                }
              } else if (DEBUG_MODE) {
                logger.log(`[VideoPlayer] Progress >= 95%, starting from beginning`);
              }
            }
          } else if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] No saved progress found`);
          }
        } catch (error) {
          logger.error('[VideoPlayer] Error loading watch progress:', error);
        }
      } else if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Missing id or type, can't load progress. id=${id}, type=${type}`);
      }
    };

    loadWatchProgress();
  }, [id, type, episodeId]);

  // Set up interval to save watch progress periodically (every 5 seconds)
  useEffect(() => {
    if (id && type && !paused && duration > 0) {
      // Clear any existing interval
      if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
      }
      
      // Set up new interval to save progress
      const interval = setInterval(() => {
        saveWatchProgress();
      }, 5000);
      
      setProgressSaveInterval(interval);
      
      // Clean up interval on pause or unmount
      return () => {
        clearInterval(interval);
        setProgressSaveInterval(null);
      };
    }
  }, [id, type, paused, currentTime, duration]);

  // Save progress one more time when component unmounts
  useEffect(() => {
    return () => {
      if (id && type && duration > 0) {
        saveWatchProgress();
      }
    };
  }, [id, type, currentTime, duration]);

  // Function to save watch progress
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
    } else if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Cannot save progress: id=${id}, type=${type}, currentTime=${currentTime}, duration=${duration}`);
    }
  };

  useEffect(() => {
    max.value = duration;
  }, [duration]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    } else {
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  };

  // Simplify the seekToTime function to use VLC's direct methods
  const seekToTime = (timeInSeconds: number) => {
    if (!isPlayerReady || duration <= 0 || !vlcRef.current) return;
    
    // Calculate normalized position (0-1) for VLC
    const normalizedPosition = Math.max(0, Math.min(timeInSeconds / duration, 1));
    
    try {
      // Use VLC's direct setPosition method
      if (typeof vlcRef.current.setPosition === 'function') {
        vlcRef.current.setPosition(normalizedPosition);
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Called setPosition with ${normalizedPosition} for time: ${timeInSeconds}s`);
        }
      } else if (typeof vlcRef.current.seek === 'function') {
        // Fallback to seek method if available
        vlcRef.current.seek(normalizedPosition);
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Called seek with ${normalizedPosition} for time: ${timeInSeconds}s`);
        }
      } else {
        logger.error('[VideoPlayer] No seek method available on VLC player');
      }
    } catch (error) {
      logger.error('[VideoPlayer] Error during seek operation:', error);
    }
  };

  // Simplify handleProgress to always update state
  const handleProgress = (event: any) => {
    const currentTimeInSeconds = event.currentTime / 1000; // VLC gives time in milliseconds
    
    // Always update state - let VLC manage the timing
    if (Math.abs(currentTimeInSeconds - currentTime) > 0.5) {
      safeSetState(() => setCurrentTime(currentTimeInSeconds));
      progress.value = currentTimeInSeconds;
      
      // Animate the progress bar smoothly
      const progressPercent = duration > 0 ? currentTimeInSeconds / duration : 0;
      Animated.timing(progressAnim, {
        toValue: progressPercent,
        duration: 250,
        useNativeDriver: false,
      }).start();
      
      // Update buffered position
      const bufferedTime = event.bufferTime / 1000 || currentTimeInSeconds;
      safeSetState(() => setBuffered(bufferedTime));
    }
  };

  // Enhanced onLoad handler to detect aspect ratio and mark player as ready
  const onLoad = (data: any) => {
    setDuration(data.duration / 1000); // VLC returns duration in milliseconds
    max.value = data.duration / 1000;
    
    // Calculate and detect aspect ratio with custom styling
    if (data.videoSize && data.videoSize.width && data.videoSize.height) {
      const aspectRatio = data.videoSize.width / data.videoSize.height;
      setVideoAspectRatio(aspectRatio);
      
      // Check if it's 16:9 content (1.777... ≈ 16/9)
      const is16x9 = Math.abs(aspectRatio - (16/9)) < 0.1;
      setIs16by9Content(is16x9);
      
      // Auto-zoom 16:9 content to 1.1x to fill more screen
      if (is16x9) {
        setZoomScale(1.1);
        setLastZoomScale(1.1);
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Auto-zoomed 16:9 content to 1.1x`);
        }
      } else {
        // Reset zoom for non-16:9 content
        setZoomScale(1);
        setLastZoomScale(1);
      }
      
      // Calculate custom video styles for precise control
      const styles = calculateVideoStyles(
        data.videoSize.width,
        data.videoSize.height,
        screenDimensions.width,
        screenDimensions.height
      );
      setCustomVideoStyles(styles);
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Video aspect ratio: ${aspectRatio.toFixed(3)} (16:9: ${is16x9})`);
        logger.log(`[VideoPlayer] Applied custom styles:`, styles);
      }
    } else {
      // Fallback: assume 16:9 and apply default styles with auto-zoom
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
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Could not detect video size, using default 16:9 styles with 1.1x zoom`);
      }
    }
    
    // Mark player as ready for seeking
    setIsPlayerReady(true);

    // Get audio and subtitle tracks from onLoad data
    const audioTracksFromLoad = data.audioTracks || [];
    const textTracksFromLoad = data.textTracks || [];
    setVlcAudioTracks(audioTracksFromLoad);
    setVlcTextTracks(textTracksFromLoad);
    
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Video loaded with duration: ${data.duration / 1000}`);
      logger.log(`[VideoPlayer] Screen dimensions: ${screenDimensions.width}x${screenDimensions.height}`);
      logger.log(`[VideoPlayer] VLC Player custom styles applied`);
      const methods = Object.keys(vlcRef.current || {}).filter(
        key => typeof vlcRef.current[key] === 'function'
      );
      logger.log('[VideoPlayer] Available VLC methods:', methods);
      
      // Log track-related methods specifically
      const trackMethods = methods.filter(method => 
        method.toLowerCase().includes('track') || 
        method.toLowerCase().includes('audio') || 
        method.toLowerCase().includes('subtitle') ||
        method.toLowerCase().includes('text')
      );
      logger.log('[VideoPlayer] Track-related VLC methods:', trackMethods);
      
      logger.log('[VideoPlayer] Available audio tracks:', audioTracksFromLoad);
      logger.log('[VideoPlayer] Available subtitle tracks:', textTracksFromLoad);
    }

    // Set default selected tracks
    if (audioTracksFromLoad.length > 1) { // More than just "Disable"
        const firstEnabledAudio = audioTracksFromLoad.find((t: any) => t.id !== -1);
        if(firstEnabledAudio) {
            setSelectedAudioTrack(firstEnabledAudio.id);
        }
    } else if (audioTracksFromLoad.length > 0) {
        setSelectedAudioTrack(audioTracksFromLoad[0].id);
    }
    // Subtitles default to disabled (-1)
    
    // Prefer external subtitles: Auto-search for external subtitles if IMDb ID is available
    if (imdbId && !customSubtitles.length) {
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Auto-searching for external subtitles with IMDb ID: ${imdbId}`);
      }
      setTimeout(() => {
        fetchAvailableSubtitles(imdbId);
      }, 2000); // Delay to let video start playing first
    }
    
    // If we have an initial position to seek to, do it now
    if (initialPosition !== null && !isInitialSeekComplete) {
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Will seek to saved position: ${initialPosition}`);
      }
      
      // Seek with a short delay to ensure video is ready
      setTimeout(() => {
        if (vlcRef.current && duration > 0 && isMounted.current) {
          seekToTime(initialPosition);
          setIsInitialSeekComplete(true);
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Initial seek completed to position: ${initialPosition}s`);
          }
        }
      }, 1000);
    }

    // Mark video as loaded and complete opening animation
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
    const tracks = data.audioTracks || [];
    setAudioTracks(tracks);
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Available audio tracks:`, tracks);
    }
  };

  const onTextTracks = (e: Readonly<{ textTracks: TextTrack[] }>) => {
    const tracks = e.textTracks || [];
    setTextTracks(tracks);
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Available subtitle tracks:`, tracks);
    }
  };

  // Custom aspect ratio control - now toggles between 1x and 1.1x zoom
  const cycleAspectRatio = () => {
    const newZoom = zoomScale === 1.1 ? 1 : 1.1;
    
    setZoomScale(newZoom);
    setZoomTranslateX(0);
    setZoomTranslateY(0);
    setLastZoomScale(newZoom);
    setLastTranslateX(0);
    setLastTranslateY(0);
    
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Toggled zoom to ${newZoom}x`);
    }
  };

  // Enhanced immersive mode function
  const enableImmersiveMode = () => {
    // Force hide status bar immediately without animation
    StatusBar.setHidden(true, 'none');
    
    if (Platform.OS === 'android') {
      // Use multiple methods to ensure complete immersion
      try {
        // Method 1: RNImmersiveMode
        RNImmersiveMode.setBarMode('FullSticky');
        RNImmersiveMode.fullLayout(true);
        
        // Method 2: Additional native module call if available
        if (NativeModules.StatusBarManager) {
          NativeModules.StatusBarManager.setHidden(true);
        }
      } catch (error) {
        console.log('Immersive mode error:', error);
      }
    }
    
    // For iOS, ensure status bar is hidden
    if (Platform.OS === 'ios') {
      StatusBar.setHidden(true, 'none');
    }
  };

  // Function to disable immersive mode
  const disableImmersiveMode = () => {
    StatusBar.setHidden(false);
    
    if (Platform.OS === 'android') {
      // Restore normal mode using setBarMode
      RNImmersiveMode.setBarMode('Normal');
      
      // Alternative: disable fullLayout
      RNImmersiveMode.fullLayout(false);
    }
  };

  // Function to handle closing the video player
  const handleClose = () => {
    // First unlock the screen orientation
    const unlockOrientation = async () => {
      await ScreenOrientation.unlockAsync();
    };
    unlockOrientation();
    
    // Disable immersive mode
    disableImmersiveMode();
    
    // Navigate back
    navigation.goBack();
  };

  // Add debug logs for modal visibility
  useEffect(() => {
    if (showAudioModal && DEBUG_MODE) {
      logger.log("[VideoPlayer] Audio modal should be visible now");
      logger.log("[VideoPlayer] Available audio tracks:", audioTracks);
    }
  }, [showAudioModal, audioTracks]);

  useEffect(() => {
    if (showSubtitleModal && DEBUG_MODE) {
      logger.log("[VideoPlayer] Subtitle modal should be visible now");
      logger.log("[VideoPlayer] Available text tracks:", textTracks);
    }
  }, [showSubtitleModal, textTracks]);

  // Load resume preference on mount
  useEffect(() => {
    const loadResumePreference = async () => {
      try {
        const pref = await AsyncStorage.getItem(RESUME_PREF_KEY);
        if (pref) {
          setResumePreference(pref);
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Loaded resume preference: ${pref}`);
          }
          
          // If user has a preference, apply it automatically
          if (pref === RESUME_PREF.ALWAYS_RESUME && resumePosition !== null) {
            setShowResumeOverlay(false);
            setInitialPosition(resumePosition);
            if (DEBUG_MODE) {
              logger.log(`[VideoPlayer] Auto-resuming based on saved preference`);
            }
          } else if (pref === RESUME_PREF.ALWAYS_START_OVER) {
            setShowResumeOverlay(false);
            setInitialPosition(0);
            if (DEBUG_MODE) {
              logger.log(`[VideoPlayer] Auto-starting from beginning based on saved preference`);
            }
          }
        }
      } catch (error) {
        logger.error('[VideoPlayer] Error loading resume preference:', error);
      }
    };
    
    loadResumePreference();
  }, [resumePosition]);

  // Reset resume preference
  const resetResumePreference = async () => {
    try {
      await AsyncStorage.removeItem(RESUME_PREF_KEY);
      setResumePreference(null);
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Reset resume preference`);
      }
    } catch (error) {
      logger.error('[VideoPlayer] Error resetting resume preference:', error);
    }
  };

  // Handle resume from overlay - modified for VLC
  const handleResume = async () => {
    if (resumePosition !== null && vlcRef.current) {
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Resuming from ${resumePosition}`);
      }
      
      // Save preference if remember choice is checked
      if (rememberChoice) {
        try {
          await AsyncStorage.setItem(RESUME_PREF_KEY, RESUME_PREF.ALWAYS_RESUME);
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] Saved resume preference: ${RESUME_PREF.ALWAYS_RESUME}`);
          }
        } catch (error) {
          logger.error('[VideoPlayer] Error saving resume preference:', error);
        }
      }
      
      // Set initial position to trigger seek
      setInitialPosition(resumePosition);
      // Hide overlay
      setShowResumeOverlay(false);
      
      // Seek to position with VLC
      setTimeout(() => {
        if (vlcRef.current) {
          seekToTime(resumePosition);
        }
      }, 500);
    }
  };

  // Handle start from beginning - modified for VLC
  const handleStartFromBeginning = async () => {
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Starting from beginning`);
    }
    
    // Save preference if remember choice is checked
    if (rememberChoice) {
      try {
        await AsyncStorage.setItem(RESUME_PREF_KEY, RESUME_PREF.ALWAYS_START_OVER);
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Saved resume preference: ${RESUME_PREF.ALWAYS_START_OVER}`);
        }
      } catch (error) {
        logger.error('[VideoPlayer] Error saving resume preference:', error);
      }
    }
    
    // Hide overlay
    setShowResumeOverlay(false);
    // Set initial position to 0
    setInitialPosition(0);
    // Make sure we seek to beginning
    if (vlcRef.current) {
      seekToTime(0);
      setCurrentTime(0);
      progress.value = 0;
    }
  };

  // Update the showControls logic to include animation
  const toggleControls = () => {
    // Start fade animation
    Animated.timing(fadeAnim, {
      toValue: showControls ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // Update state
    setShowControls(!showControls);
  };

  // Handle VLC errors
  const handleError = (error: any) => {
    logger.error('[VideoPlayer] Playback Error:', error);
    // Optionally, you could show an error message to the user here
  };

  // Handle VLC buffering
  const onBuffering = (event: any) => {
    setIsBuffering(event.isBuffering);
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Buffering: ${event.isBuffering}`);
    }
  };

  // Handle VLC playback ended
  const onEnd = () => {
    // Your existing playback ended logic here
  };

  // Function to select audio track in VLC
  const selectAudioTrack = (trackId: number) => {
    setSelectedAudioTrack(trackId);
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Selected audio track ID: ${trackId}`);
    }
  };

  // Function to select subtitle track in VLC
  const selectTextTrack = (trackId: number) => {
    if (trackId === -999) { // Special ID for custom subtitles
      setUseCustomSubtitles(true);
      setSelectedTextTrack(-1); // Disable VLC subtitles
    } else {
      setUseCustomSubtitles(false);
      setSelectedTextTrack(trackId);
    }
    
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Selected subtitle track ID: ${trackId}, custom: ${trackId === -999}`);
    }
  };
  
  // Update subtitle modal to use VLC subtitle tracks
  const renderSubtitleModal = () => {
    if (!showSubtitleModal) return null;
    
    return (
      <View style={styles.fullscreenOverlay}>
        <View style={styles.modernModalContainer}>
          <View style={styles.modernModalHeader}>
            <Text style={styles.modernModalTitle}>Subtitle Settings</Text>
            <TouchableOpacity 
              style={styles.modernCloseButton}
              onPress={() => setShowSubtitleModal(false)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modernTrackListScrollContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.modernTrackListContainer}>
              
              {/* External Subtitles Section - Priority */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>External Subtitles</Text>
                <Text style={styles.sectionDescription}>High quality subtitles with size control</Text>
                
                {/* Custom subtitles option - show if loaded */}
                {customSubtitles.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.modernTrackItem, useCustomSubtitles && styles.modernSelectedTrackItem]}
                    onPress={() => {
                      selectTextTrack(-999);
                      setShowSubtitleModal(false);
                    }}
                  >
                    <View style={styles.trackIconContainer}>
                      <Ionicons name="document-text" size={20} color="#4CAF50" />
                    </View>
                    <View style={styles.modernTrackInfoContainer}>
                      <Text style={styles.modernTrackPrimaryText}>Custom Subtitles</Text>
                      <Text style={styles.modernTrackSecondaryText}>
                        {customSubtitles.length} cues • Size adjustable
                      </Text>
                    </View>
                    {useCustomSubtitles && (
                      <View style={styles.modernSelectedIndicator}>
                        <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                      </View>
                    )}
                  </TouchableOpacity>
                ) : null}

                {/* Search for external subtitles */}
                <TouchableOpacity
                  style={styles.searchSubtitlesButton}
                  onPress={() => {
                    setShowSubtitleModal(false);
                    fetchAvailableSubtitles();
                  }}
                  disabled={isLoadingSubtitleList}
                >
                  <View style={styles.searchButtonContent}>
                    {isLoadingSubtitleList ? (
                      <ActivityIndicator size="small" color="#2196F3" />
                    ) : (
                      <Ionicons name="search" size={20} color="#2196F3" />
                    )}
                    <Text style={styles.searchSubtitlesText}>
                      {isLoadingSubtitleList ? 'Searching...' : 'Search Online Subtitles'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Subtitle Size Controls - Only for custom subtitles */}
              {useCustomSubtitles && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Size Control</Text>
                  <View style={styles.modernSubtitleSizeContainer}>
                    <TouchableOpacity 
                      style={styles.modernSizeButton}
                      onPress={decreaseSubtitleSize}
                    >
                      <Ionicons name="remove" size={20} color="white" />
                    </TouchableOpacity>
                    <View style={styles.sizeDisplayContainer}>
                      <Text style={styles.modernSubtitleSizeText}>{subtitleSize}px</Text>
                      <Text style={styles.sizeLabel}>Font Size</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.modernSizeButton}
                      onPress={increaseSubtitleSize}
                    >
                      <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Built-in Subtitles Section */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Built-in Subtitles</Text>
                <Text style={styles.sectionDescription}>System default sizing • No customization</Text>
                
                {/* Off option */}
                <TouchableOpacity
                  style={[styles.modernTrackItem, (selectedTextTrack === -1 && !useCustomSubtitles) && styles.modernSelectedTrackItem]}
                  onPress={() => {
                    selectTextTrack(-1);
                    setShowSubtitleModal(false);
                  }}
                >
                  <View style={styles.trackIconContainer}>
                    <Ionicons name="close-circle" size={20} color="#9E9E9E" />
                  </View>
                  <View style={styles.modernTrackInfoContainer}>
                    <Text style={styles.modernTrackPrimaryText}>Disabled</Text>
                    <Text style={styles.modernTrackSecondaryText}>No subtitles</Text>
                  </View>
                  {(selectedTextTrack === -1 && !useCustomSubtitles) && (
                    <View style={styles.modernSelectedIndicator}>
                      <Ionicons name="checkmark-circle" size={24} color="#9E9E9E" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Available built-in subtitle tracks */}
                {vlcTextTracks.length > 0 ? vlcTextTracks.map(track => (
                  <TouchableOpacity
                    key={track.id}
                    style={[styles.modernTrackItem, (selectedTextTrack === track.id && !useCustomSubtitles) && styles.modernSelectedTrackItem]}
                    onPress={() => {
                      selectTextTrack(track.id);
                      setShowSubtitleModal(false);
                    }}
                  >
                    <View style={styles.trackIconContainer}>
                      <Ionicons name="text" size={20} color="#FF9800" />
                    </View>
                    <View style={styles.modernTrackInfoContainer}>
                      <Text style={styles.modernTrackPrimaryText}>
                        {getTrackDisplayName(track)}
                      </Text>
                      <Text style={styles.modernTrackSecondaryText}>
                        Built-in track • System font size
                      </Text>
                    </View>
                    {(selectedTextTrack === track.id && !useCustomSubtitles) && (
                      <View style={styles.modernSelectedIndicator}>
                        <Ionicons name="checkmark-circle" size={24} color="#FF9800" />
                      </View>
                    )}
                  </TouchableOpacity>
                )) : (
                  <View style={styles.modernEmptyStateContainer}>
                    <Ionicons name="information-circle-outline" size={24} color="#666" />
                    <Text style={styles.modernEmptyStateText}>No built-in subtitles available</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  // Render subtitle language selection modal
  const renderSubtitleLanguageModal = () => {
    if (!showSubtitleLanguageModal) return null;
    
    return (
      <View style={styles.fullscreenOverlay}>
        <View style={styles.enhancedModalContainer}>
          <View style={styles.enhancedModalHeader}>
            <Text style={styles.enhancedModalTitle}>Select Language</Text>
            <TouchableOpacity 
              style={styles.enhancedCloseButton}
              onPress={() => setShowSubtitleLanguageModal(false)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.trackListScrollContainer}>
            <View style={styles.trackListContainer}>
              {availableSubtitles.length > 0 ? availableSubtitles.map(subtitle => (
                <TouchableOpacity
                  key={subtitle.id}
                  style={styles.enhancedTrackItem}
                  onPress={() => loadWyzieSubtitle(subtitle)}
                  disabled={isLoadingSubtitles}
                >
                  <View style={styles.subtitleLanguageItem}>
                    <Image 
                      source={{ uri: subtitle.flagUrl }}
                      style={styles.flagIcon}
                      resizeMode="cover"
                    />
                    <View style={styles.trackInfoContainer}>
                      <Text style={styles.trackPrimaryText}>
                        {formatLanguage(subtitle.language)}
                      </Text>
                      <Text style={styles.trackSecondaryText}>
                        {subtitle.display}
                      </Text>
                    </View>
                  </View>
                  {isLoadingSubtitles && (
                    <ActivityIndicator size="small" color="#E50914" />
                  )}
                </TouchableOpacity>
              )) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="alert-circle-outline" size={40} color="#888" />
                  <Text style={styles.emptyStateText}>
                    No subtitles found for this content
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  // Update the getInfo method for VLC
  const getInfo = async () => {
    if (vlcRef.current) {
      try {
        const position = await vlcRef.current.getPosition();
        const lengthResult = await vlcRef.current.getLength();
        return {
          currentTime: position,
          duration: lengthResult / 1000 // Convert to seconds
        };
      } catch (e) {
        logger.error('[VideoPlayer] Error getting playback info:', e);
        return {
          currentTime: currentTime,
          duration: duration
        };
      }
    }
    return {
      currentTime: 0,
      duration: 0
    };
  };

  // VLC specific method to set playback speed
  const changePlaybackSpeed = (speed: number) => {
    if (vlcRef.current) {
      if (typeof vlcRef.current.setRate === 'function') {
        vlcRef.current.setRate(speed);
      } else if (typeof vlcRef.current.setPlaybackRate === 'function') {
        vlcRef.current.setPlaybackRate(speed);
      }
      setPlaybackSpeed(speed);
    }
  };

  // VLC specific method for volume control
  const setVolume = (volumeLevel: number) => {
    if (vlcRef.current) {
      // VLC volume is typically between 0-200
      if (typeof vlcRef.current.setVolume === 'function') {
        vlcRef.current.setVolume(volumeLevel * 200);
      }
    }
  };

  // Added back the togglePlayback function
  const togglePlayback = () => {
    if (vlcRef.current) {
      if (paused) {
        // Check if resume function exists
        if (typeof vlcRef.current.resume === 'function') {
          vlcRef.current.resume();
        } else if (typeof vlcRef.current.play === 'function') {
          vlcRef.current.play();
        } else {
          // Fallback - use setPaused method or property if available
          vlcRef.current.setPaused && vlcRef.current.setPaused(false);
        }
      } else {
        // Check if pause function exists
        if (typeof vlcRef.current.pause === 'function') {
          vlcRef.current.pause();
        } else {
          // Fallback - use setPaused method or property if available
          vlcRef.current.setPaused && vlcRef.current.setPaused(true);
        }
      }
      setPaused(!paused);
    }
  };

  // Re-add the renderAudioModal function
  const renderAudioModal = () => {
    if (!showAudioModal) return null;
    
    return (
      <View style={styles.fullscreenOverlay}>
        <View style={styles.enhancedModalContainer}>
          <View style={styles.enhancedModalHeader}>
            <Text style={styles.enhancedModalTitle}>Audio</Text>
            <TouchableOpacity 
              style={styles.enhancedCloseButton}
              onPress={() => setShowAudioModal(false)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.trackListScrollContainer}>
            <View style={styles.trackListContainer}>
              {vlcAudioTracks.length > 0 ? vlcAudioTracks.map(track => (
                <TouchableOpacity
                  key={track.id}
                  style={styles.enhancedTrackItem}
                  onPress={() => {
                    selectAudioTrack(track.id);
                    setShowAudioModal(false);
                  }}
                >
                  <View style={styles.trackInfoContainer}>
                    <Text style={styles.trackPrimaryText}>
                      {getTrackDisplayName(track)}
                    </Text>
                    {(track.name && track.language) && (
                      <Text style={styles.trackSecondaryText}>{track.name}</Text>
                    )}
                  </View>
                  {selectedAudioTrack === track.id && (
                    <View style={styles.selectedIndicatorContainer}>
                      <Ionicons name="checkmark" size={22} color="#E50914" />
                    </View>
                  )}
                </TouchableOpacity>
              )) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="alert-circle-outline" size={40} color="#888" />
                  <Text style={styles.emptyStateText}>No audio tracks available</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  // Use a ref to track if we're mounted to prevent state updates after unmount
  // This helps prevent potential memory leaks and strange behaviors with navigation
  const isMounted = useRef(true);
  
  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
      }
    };
  }, []);
  
  // Wrap all setState calls with this check
  const safeSetState = (setter: any) => {
    if (isMounted.current) {
      setter();
    }
  };

  // Enhanced progress bar touch handling with drag support
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
    processProgressTouch(locationX);
  };
  
  const handleProgressBarDragEnd = () => {
    setIsDragging(false);
  };
  
  // Helper function to process touch position and seek
  const processProgressTouch = (locationX: number) => {
    progressBarRef.current?.measure((x, y, width, height, pageX, pageY) => {
      // Calculate percentage of touch position relative to progress bar width
      const percentage = Math.max(0, Math.min(locationX / width, 1));
      // Calculate time to seek to
      const seekTime = percentage * duration;
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Seeking to: ${seekTime}s (${percentage * 100}%)`);
      }
      
      // Seek to the calculated time
      seekToTime(seekTime);
    });
  };

  // Add subtitle size management functions
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

  // Enhanced SRT parser function - more robust
  const parseSRT = (srtContent: string): SubtitleCue[] => {
    const cues: SubtitleCue[] = [];
    
    if (!srtContent || srtContent.trim().length === 0) {
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] SRT Parser: Empty content provided`);
      }
      return cues;
    }

    // Normalize line endings and clean up the content
    const normalizedContent = srtContent
      .replace(/\r\n/g, '\n')  // Convert Windows line endings
      .replace(/\r/g, '\n')    // Convert Mac line endings
      .trim();

    // Split by double newlines, but also handle cases with multiple empty lines
    const blocks = normalizedContent.split(/\n\s*\n/).filter(block => block.trim().length > 0);

    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] SRT Parser: Found ${blocks.length} blocks after normalization`);
      logger.log(`[VideoPlayer] SRT Parser: First few characters: "${normalizedContent.substring(0, 300)}"`);
    }

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      if (lines.length >= 3) {
        // Find the timestamp line (could be line 1 or 2, depending on numbering)
        let timeLineIndex = -1;
        let timeMatch = null;
        
        for (let j = 0; j < Math.min(3, lines.length); j++) {
          // More flexible time pattern matching
          timeMatch = lines[j].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
          if (timeMatch) {
            timeLineIndex = j;
            break;
          }
        }
        
        if (timeMatch && timeLineIndex !== -1) {
          try {
            const startTime = 
              parseInt(timeMatch[1]) * 3600 + 
              parseInt(timeMatch[2]) * 60 + 
              parseInt(timeMatch[3]) + 
              parseInt(timeMatch[4]) / 1000;
            
            const endTime = 
              parseInt(timeMatch[5]) * 3600 + 
              parseInt(timeMatch[6]) * 60 + 
              parseInt(timeMatch[7]) + 
              parseInt(timeMatch[8]) / 1000;

            // Get text lines (everything after the timestamp line)
            const textLines = lines.slice(timeLineIndex + 1);
            if (textLines.length > 0) {
              const text = textLines
                .join('\n')
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/\{[^}]*\}/g, '') // Remove subtitle formatting tags like {italic}
                .replace(/\\N/g, '\n') // Handle \N newlines
                .trim();

              if (text.length > 0) {
                cues.push({
                  start: startTime,
                  end: endTime,
                  text: text
                });
                
                if (DEBUG_MODE && (i < 5 || cues.length <= 10)) {
                  logger.log(`[VideoPlayer] SRT Parser: Cue ${cues.length}: ${startTime.toFixed(3)}s-${endTime.toFixed(3)}s: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
                }
              }
            }
          } catch (error) {
            if (DEBUG_MODE) {
              logger.log(`[VideoPlayer] SRT Parser: Error parsing times for block ${i + 1}: ${error}`);
            }
          }
        } else if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] SRT Parser: No valid timestamp found in block ${i + 1}. Lines: ${JSON.stringify(lines.slice(0, 3))}`);
        }
      } else if (DEBUG_MODE && block.length > 0) {
        logger.log(`[VideoPlayer] SRT Parser: Block ${i + 1} has insufficient lines (${lines.length}): "${block.substring(0, 100)}"`);
      }
    }

    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] SRT Parser: Successfully parsed ${cues.length} subtitle cues`);
      if (cues.length > 0) {
        logger.log(`[VideoPlayer] SRT Parser: Time range: ${cues[0].start.toFixed(1)}s to ${cues[cues.length-1].end.toFixed(1)}s`);
      }
    }

    return cues;
  };

  // Fetch available subtitles from Wyzie API
  const fetchAvailableSubtitles = async (imdbIdParam?: string) => {
    const targetImdbId = imdbIdParam || imdbId;
    if (!targetImdbId) {
      logger.error('[VideoPlayer] No IMDb ID available for subtitle search');
      return;
    }

    setIsLoadingSubtitleList(true);
    try {
      // Build search URL with season and episode parameters for TV shows
      let searchUrl = `https://sub.wyzie.ru/search?id=${targetImdbId}&encoding=utf-8&source=all`;
      
      // Add season and episode parameters if available (for TV shows)
      if (season && episode) {
        searchUrl += `&season=${season}&episode=${episode}`;
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Searching for subtitles with IMDb ID: ${targetImdbId}, Season: ${season}, Episode: ${episode}`);
        }
      } else {
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Searching for subtitles with IMDb ID: ${targetImdbId} (movie or no season/episode info)`);
        }
      }
      
      const response = await fetch(searchUrl);
      const subtitles: WyzieSubtitle[] = await response.json();
      
      // Filter out duplicates and sort by language
      const uniqueSubtitles = subtitles.reduce((acc, current) => {
        const exists = acc.find(item => item.language === current.language);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, [] as WyzieSubtitle[]);
      
      // Sort alphabetically by display name
      uniqueSubtitles.sort((a, b) => a.display.localeCompare(b.display));
      
      setAvailableSubtitles(uniqueSubtitles);
      setShowSubtitleLanguageModal(true);
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Found ${uniqueSubtitles.length} unique subtitle languages for search`);
      }
    } catch (error) {
      logger.error('[VideoPlayer] Error fetching subtitles from Wyzie API:', error);
    } finally {
      setIsLoadingSubtitleList(false);
    }
  };

  // Load subtitle from selected Wyzie entry
  const loadWyzieSubtitle = async (subtitle: WyzieSubtitle) => {
    setShowSubtitleLanguageModal(false);
    setIsLoadingSubtitles(true);
    
    try {
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Loading subtitle: ${subtitle.display} from ${subtitle.url}`);
      }
      
      const response = await fetch(subtitle.url);
      const srtContent = await response.text();
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Downloaded subtitle content length: ${srtContent.length} characters`);
        logger.log(`[VideoPlayer] First 200 characters of subtitle: ${srtContent.substring(0, 200)}`);
      }
      
      const parsedCues = parseSRT(srtContent);
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Parsed ${parsedCues.length} subtitle cues`);
        if (parsedCues.length > 0) {
          logger.log(`[VideoPlayer] First cue: ${parsedCues[0].start}s-${parsedCues[0].end}s: "${parsedCues[0].text}"`);
          logger.log(`[VideoPlayer] Last cue: ${parsedCues[parsedCues.length-1].start}s-${parsedCues[parsedCues.length-1].end}s: "${parsedCues[parsedCues.length-1].text}"`);
        }
      }
      
      setCustomSubtitles(parsedCues);
      setUseCustomSubtitles(true);
      
      // Disable VLC's built-in subtitles when using custom ones
      setSelectedTextTrack(-1);
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Successfully loaded subtitle: useCustomSubtitles=true, customSubtitles.length=${parsedCues.length}`);
      }
    } catch (error) {
      logger.error('[VideoPlayer] Error loading Wyzie subtitle:', error);
    } finally {
      setIsLoadingSubtitles(false);
    }
  };

  // Load external subtitle file (keep for backwards compatibility)
  const loadExternalSubtitles = async (subtitleUrl: string) => {
    if (!subtitleUrl) return;

    setIsLoadingSubtitles(true);
    try {
      const response = await fetch(subtitleUrl);
      const srtContent = await response.text();
      const parsedCues = parseSRT(srtContent);
      setCustomSubtitles(parsedCues);
      setUseCustomSubtitles(true);
      
      // Disable VLC's built-in subtitles when using custom ones
      setSelectedTextTrack(-1);
      
      if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] Loaded ${parsedCues.length} subtitle cues from external file`);
      }
    } catch (error) {
      logger.error('[VideoPlayer] Error loading external subtitles:', error);
    } finally {
      setIsLoadingSubtitles(false);
    }
  };

  // Update current subtitle based on playback time
  useEffect(() => {
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] Subtitle useEffect - useCustomSubtitles: ${useCustomSubtitles}, customSubtitles.length: ${customSubtitles.length}, currentTime: ${currentTime.toFixed(3)}`);
      
      // Show detailed info about subtitle cues for debugging
      if (useCustomSubtitles && customSubtitles.length > 0 && customSubtitles.length <= 5) {
        logger.log(`[VideoPlayer] All ${customSubtitles.length} subtitle cues:`);
        customSubtitles.forEach((cue, index) => {
          const isActive = currentTime >= cue.start && currentTime <= cue.end;
          logger.log(`[VideoPlayer] Cue ${index + 1}: ${cue.start.toFixed(3)}s-${cue.end.toFixed(3)}s ${isActive ? '(ACTIVE)' : ''}: "${cue.text.substring(0, 50)}${cue.text.length > 50 ? '...' : ''}"`);
        });
      } else if (useCustomSubtitles && customSubtitles.length > 5) {
        // For larger subtitle files, just show nearby cues
        const nearbyCues = customSubtitles.filter(cue => 
          Math.abs(cue.start - currentTime) <= 10 || Math.abs(cue.end - currentTime) <= 10
        );
        if (nearbyCues.length > 0) {
          logger.log(`[VideoPlayer] Nearby subtitle cues (within 10s):`);
          nearbyCues.slice(0, 3).forEach((cue, index) => {
            const isActive = currentTime >= cue.start && currentTime <= cue.end;
            logger.log(`[VideoPlayer] Nearby cue: ${cue.start.toFixed(3)}s-${cue.end.toFixed(3)}s ${isActive ? '(ACTIVE)' : ''}: "${cue.text.substring(0, 50)}${cue.text.length > 50 ? '...' : ''}"`);
          });
        }
      }
    }
    
    if (!useCustomSubtitles || customSubtitles.length === 0) {
      if (currentSubtitle !== '') {
        setCurrentSubtitle('');
        if (DEBUG_MODE) {
          logger.log(`[VideoPlayer] Cleared subtitle - useCustomSubtitles: ${useCustomSubtitles}, customSubtitles.length: ${customSubtitles.length}`);
        }
      }
      return;
    }

    const currentCue = customSubtitles.find(cue => 
      currentTime >= cue.start && currentTime <= cue.end
    );

    const newSubtitle = currentCue ? currentCue.text : '';
    
    if (DEBUG_MODE && newSubtitle !== currentSubtitle) {
      logger.log(`[VideoPlayer] Subtitle changed from "${currentSubtitle}" to "${newSubtitle}" at time ${currentTime.toFixed(3)}`);
      if (currentCue) {
        logger.log(`[VideoPlayer] Current cue: ${currentCue.start.toFixed(3)}s - ${currentCue.end.toFixed(3)}s: "${currentCue.text}"`);
      }
    }

    setCurrentSubtitle(newSubtitle);
  }, [currentTime, customSubtitles, useCustomSubtitles]);

  // Load subtitle size preference on mount
  useEffect(() => {
    loadSubtitleSize();
  }, []);

  // Add subtitle size adjustment functions
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
      {/* Opening Animation Overlay - covers the entire screen during transition */}
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
        <View style={styles.openingContent}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.openingText}>Loading video...</Text>
        </View>
      </Animated.View>

      {/* Animated Video Player Container - ensure no transform issues */}
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
                    backgroundColor: '#000',
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

          {/* Progress bar with enhanced touch handling */}
          <Animated.View style={[styles.sliderContainer, { opacity: fadeAnim }]}>
            <View
              style={styles.progressTouchArea}
              onTouchStart={handleProgressBarDragStart}
              onTouchMove={handleProgressBarDragMove}
              onTouchEnd={handleProgressBarDragEnd}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleProgressBarTouch}
                style={{width: '100%'}}
              >
                <View 
                  ref={progressBarRef}
                  style={styles.progressBarContainer}
                >
                  {/* Buffered Progress */}
                  <View style={[styles.bufferProgress, { 
                    width: `${(buffered / (duration || 1)) * 100}%`
                  }]} />
                  {/* Animated Progress */}
                  <Animated.View 
                    style={[
                      styles.progressBarFill, 
                      { 
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        })
                      }
                    ]} 
                  />
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.timeDisplay}>
              <Text style={styles.duration}>{formatTime(currentTime)}</Text>
              <Text style={styles.duration}>{formatTime(duration)}</Text>
            </View>
          </Animated.View>

          {/* Controls Overlay - Using Animated.View */}
          <Animated.View style={[styles.controlsContainer, { opacity: fadeAnim }]}>
            {/* Top Gradient & Header */}
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'transparent']}
              style={styles.topGradient}
            >
              <View style={styles.header}>
                {/* Title Section - Enhanced with metadata */}
                <View style={styles.titleSection}>
                  <Text style={styles.title}>{title}</Text>
                  {/* Show season and episode for series */}
                  {season && episode && (
                    <Text style={styles.episodeInfo}>
                      S{season}E{episode} {episodeTitle && `• ${episodeTitle}`}
                    </Text>
                  )}
                  {/* Show year, quality, and provider */}
                  <View style={styles.metadataRow}>
                    {year && <Text style={styles.metadataText}>{year}</Text>}
                    {quality && <View style={styles.qualityBadge}><Text style={styles.qualityText}>{quality}</Text></View>}
                    {streamProvider && <Text style={styles.providerText}>via {streamProvider}</Text>}
                  </View>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                  <Ionicons name="close" size={24} color="white" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* Center Controls (Play/Pause, Skip) */}
            <View style={styles.controls}>
              <TouchableOpacity onPress={() => skip(-10)} style={styles.skipButton}>
                <Ionicons name="play-back" size={24} color="white" />
                <Text style={styles.skipText}>10</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
                <Ionicons name={paused ? "play" : "pause"} size={40} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => skip(10)} style={styles.skipButton}>
                <Ionicons name="play-forward" size={24} color="white" />
                <Text style={styles.skipText}>10</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Gradient */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.bottomGradient}
            >
              <View style={styles.bottomControls}>
                {/* Bottom Buttons Row */}
                <View style={styles.bottomButtons}>
                  {/* Speed Button */}
                  <TouchableOpacity style={styles.bottomButton}>
                    <Ionicons name="speedometer" size={20} color="white" />
                    <Text style={styles.bottomButtonText}>Speed ({playbackSpeed}x)</Text>
                  </TouchableOpacity>

                  {/* Fill/Cover Button - Updated to show fill/cover modes */}
                  <TouchableOpacity style={styles.bottomButton} onPress={cycleAspectRatio}>
                    <Ionicons name="resize" size={20} color="white" />
                    <Text style={[styles.bottomButtonText, { fontSize: 14, textAlign: 'center' }]}>
                      {zoomScale === 1.1 ? 'Fill' : 'Cover'}
                    </Text>
                  </TouchableOpacity>

                  {/* Audio Button - Updated to use vlcAudioTracks */}
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={() => setShowAudioModal(true)}
                    disabled={vlcAudioTracks.length <= 1}
                  >
                    <Ionicons name="volume-high" size={20} color={vlcAudioTracks.length <= 1 ? 'grey' : 'white'} />
                    <Text style={[styles.bottomButtonText, vlcAudioTracks.length <= 1 && {color: 'grey'}]}>
                      {`Audio: ${getTrackDisplayName(vlcAudioTracks.find(t => t.id === selectedAudioTrack) || {id: -1, name: 'Default'})}`}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Subtitle Button - Always available for external subtitle search */}
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={() => setShowSubtitleModal(true)}
                  >
                    <Ionicons name="text" size={20} color="white" />
                    <Text style={styles.bottomButtonText}>
                      {useCustomSubtitles 
                        ? 'Subtitles: Custom'
                        : (selectedTextTrack === -1)
                        ? 'Subtitles'
                        : `Subtitles: ${getTrackDisplayName(vlcTextTracks.find(t => t.id === selectedTextTrack) || {id: -1, name: 'On'})}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Custom Subtitle Overlay - Enhanced visibility and debugging */}
          {(useCustomSubtitles && currentSubtitle) && (
            <View style={styles.customSubtitleContainer} pointerEvents="none">
              <View style={styles.customSubtitleWrapper}>
                <Text style={[styles.customSubtitleText, { fontSize: subtitleSize }]}>
                  {currentSubtitle}
                </Text>
              </View>
            </View>
          )}

          {/* Debug subtitle info when controls are visible */}
          {DEBUG_MODE && showControls && (
            <View style={styles.debugSubtitleInfo} pointerEvents="none">
              <Text style={styles.debugText}>
                Custom Subs: {useCustomSubtitles ? 'ON' : 'OFF'} | 
                Cues: {customSubtitles.length} | 
                Current: "{currentSubtitle}"
              </Text>
            </View>
          )}

          {/* Resume Overlay */}
          {showResumeOverlay && resumePosition !== null && (
            <View style={styles.resumeOverlay}>
              <LinearGradient
                colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.7)']}
                style={styles.resumeContainer}
              >
                <View style={styles.resumeContent}>
                  <View style={styles.resumeIconContainer}>
                    <Ionicons name="play-circle" size={40} color="#E50914" />
                  </View>
                  <View style={styles.resumeTextContainer}>
                    <Text style={styles.resumeTitle}>Continue Watching</Text>
                    <Text style={styles.resumeInfo}>
                      {title}
                      {season && episode && ` • S${season}E${episode}`}
                    </Text>
                    <View style={styles.resumeProgressContainer}>
                      <View style={styles.resumeProgressBar}>
                        <View 
                          style={[
                            styles.resumeProgressFill, 
                            { width: `${duration > 0 ? (resumePosition / duration) * 100 : 0}%` }
                          ]} 
                        />
                      </View>
                      <Text style={styles.resumeTimeText}>
                        {formatTime(resumePosition)} {duration > 0 ? `/ ${formatTime(duration)}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Remember choice checkbox */}
                <TouchableOpacity 
                  style={styles.rememberChoiceContainer}
                  onPress={() => setRememberChoice(!rememberChoice)}
                  activeOpacity={0.7}
                >
                  <View style={styles.checkboxContainer}>
                    <View style={[styles.checkbox, rememberChoice && styles.checkboxChecked]}>
                      {rememberChoice && <Ionicons name="checkmark" size={12} color="white" />}
                    </View>
                    <Text style={styles.rememberChoiceText}>Remember my choice</Text>
                  </View>
                  
                  {resumePreference && (
                    <TouchableOpacity 
                      onPress={resetResumePreference}
                      style={styles.resetPreferenceButton}
                    >
                      <Text style={styles.resetPreferenceText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                <View style={styles.resumeButtons}>
                  <TouchableOpacity 
                    style={styles.resumeButton} 
                    onPress={handleStartFromBeginning}
                  >
                    <Ionicons name="refresh" size={16} color="white" style={styles.buttonIcon} />
                    <Text style={styles.resumeButtonText}>Start Over</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.resumeButton, styles.resumeFromButton]} 
                    onPress={handleResume}
                  >
                    <Ionicons name="play" size={16} color="white" style={styles.buttonIcon} />
                    <Text style={styles.resumeButtonText}>Resume</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          )}
        </TouchableOpacity> 
      </Animated.View>

      {/* Use the new modal rendering functions */}
      {renderAudioModal()}
      {renderSubtitleModal()}
      {renderSubtitleLanguageModal()}
    </View> 
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    margin: 0,
    padding: 0,
  },
  topGradient: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  bottomGradient: {
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleSection: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  episodeInfo: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    marginTop: 3,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    flexWrap: 'wrap',
  },
  metadataText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginRight: 8,
  },
  qualityBadge: {
    backgroundColor: '#E50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  qualityText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  providerText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  closeButton: {
    padding: 8,
  },
  controls: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
    left: 0,
    right: 0,
    top: '50%',
    transform: [{ translateY: -30 }],
    zIndex: 1000,
  },
  playButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    color: 'white',
    fontSize: 12,
    marginTop: 2,
  },
  bottomControls: {
    gap: 12,
  },
  sliderContainer: {
    position: 'absolute',
    bottom: 55,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 1000,
  },
  progressTouchArea: {
    height: 30,
    justifyContent: 'center',
    width: '100%',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginHorizontal: 4,
    position: 'relative',
  },
  bufferProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#E50914',
    height: '100%',
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  duration: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bottomButtonText: {
    color: 'white',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: '#222',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  modalHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  trackList: {
    padding: 10,
  },
  trackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 5,
    marginVertical: 5,
  },
  selectedTrackItem: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
  trackLabel: {
    color: 'white',
    fontSize: 16,
  },
  noTracksText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  enhancedModalContainer: {
    width: 300,
    maxHeight: '70%',
    backgroundColor: '#181818',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  enhancedModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  enhancedModalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  enhancedCloseButton: {
    padding: 4,
  },
  trackListScrollContainer: {
    maxHeight: 350,
  },
  trackListContainer: {
    padding: 6,
  },
  enhancedTrackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    marginVertical: 2,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  trackInfoContainer: {
    flex: 1,
    marginRight: 8,
  },
  trackPrimaryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  trackSecondaryText: {
    color: '#aaa',
    fontSize: 11,
    marginTop: 2,
  },
  selectedIndicatorContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyStateText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  resumeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  resumeContainer: {
    width: '80%',
    maxWidth: 500,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  resumeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  resumeIconContainer: {
    marginRight: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumeTextContainer: {
    flex: 1,
  },
  resumeTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  resumeInfo: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
  resumeProgressContainer: {
    marginTop: 12,
  },
  resumeProgressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  resumeProgressFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },
  resumeTimeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  resumeButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    gap: 12,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    minWidth: 110,
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 6,
  },
  resumeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  resumeFromButton: {
    backgroundColor: '#E50914',
  },
  rememberChoiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  rememberChoiceText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  resetPreferenceButton: {
    padding: 4,
  },
  resetPreferenceText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: 'bold',
  },
  openingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
    margin: 0,
    padding: 0,
  },
  openingContent: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
  },
  videoPlayerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  subtitleSizeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
  },
  subtitleSizeLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  subtitleSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sizeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitleSizeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  customSubtitleContainer: {
    position: 'absolute',
    bottom: 40, // Position above controls and progress bar
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 1500, // Higher z-index to appear above other elements
  },
  customSubtitleText: {
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    lineHeight: undefined, // Let React Native calculate line height
    fontWeight: '500',
  },
  loadSubtitlesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderWidth: 1,
    borderColor: '#E50914',
  },
  loadSubtitlesText: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  disabledContainer: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#666',
  },
  disabledButton: {
    backgroundColor: '#666',
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  noteText: {
    color: '#aaa',
    fontSize: 12,
    marginLeft: 5,
  },
  subtitleLanguageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  flagIcon: {
    width: 24,
    height: 18,
    marginRight: 12,
    borderRadius: 2,
  },
  modernModalContainer: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#181818',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  modernModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modernModalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modernCloseButton: {
    padding: 4,
  },
  modernTrackListScrollContainer: {
    maxHeight: 350,
  },
  modernTrackListContainer: {
    padding: 6,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sectionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 12,
  },
  trackIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTrackInfoContainer: {
    flex: 1,
    marginLeft: 10,
  },
  modernTrackPrimaryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  modernTrackSecondaryText: {
    color: '#aaa',
    fontSize: 11,
    marginTop: 2,
  },
  modernSelectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernEmptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modernEmptyStateText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  searchSubtitlesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderWidth: 1,
    borderColor: '#E50914',
  },
  searchButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchSubtitlesText: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modernSubtitleSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modernSizeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTrackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  modernSelectedTrackItem: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  sizeDisplayContainer: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 20,
  },
  modernSubtitleSizeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sizeLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  customSubtitleWrapper: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 5,
  },
  debugSubtitleInfo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 5,
    borderRadius: 5,
    margin: 10,
    zIndex: 1000,
  },
  debugText: {
    color: 'white',
    fontSize: 12,
  },
});

export default VideoPlayer; 