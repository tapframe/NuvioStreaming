import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Dimensions, Modal, Pressable, StatusBar, Platform, ScrollView, Animated } from 'react-native';
import Video from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';
import { Slider } from 'react-native-awesome-slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useSharedValue, runOnJS, withTiming } from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
// Remove Gesture Handler imports
// import { PinchGestureHandler, State, PinchGestureHandlerGestureEvent } from 'react-native-gesture-handler';
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

// Define the possible resize modes
type ResizeModeType = 'contain' | 'cover' | 'stretch' | 'none';
const resizeModes: ResizeModeType[] = ['contain', 'cover', 'stretch'];

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
  return languageMap[normalized] || code.toUpperCase();
};

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
    episodeId
  } = route.params;

  // Log received props for debugging
  logger.log("[VideoPlayer] Received props:", {
    uri,
    title,
    season,
    episode,
    episodeTitle,
    quality,
    year,
    streamProvider,
    id,
    type,
    episodeId
  });

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack | null>({ type: 'disabled' });
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('contain'); // State for resize mode
  const videoRef = useRef<any>(null);
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

  // Add buffered state
  const [buffered, setBuffered] = useState<number>(0);

  // Lock screen to landscape when component mounts
  useEffect(() => {
    const lockToLandscape = async () => {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    };

    // Lock to landscape
    lockToLandscape();

    // Enable immersive mode when component mounts
    enableImmersiveMode();

    // Restore screen orientation and disable immersive mode when component unmounts
    return () => {
      const unlockOrientation = async () => {
        await ScreenOrientation.unlockAsync();
      };
      unlockOrientation();
      disableImmersiveMode();
    };
  }, []);

  // Load saved watch progress on mount
  useEffect(() => {
    const loadWatchProgress = async () => {
      if (id && type) {
        try {
          logger.log(`[VideoPlayer] Checking for saved progress with id=${id}, type=${type}, episodeId=${episodeId || 'none'}`);
          const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
          
          if (savedProgress) {
            logger.log(`[VideoPlayer] Found saved progress:`, savedProgress);
            
            if (savedProgress.currentTime > 0) {
              // Only auto-resume if less than 95% watched (not effectively complete)
              const progressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
              logger.log(`[VideoPlayer] Progress percent: ${progressPercent.toFixed(2)}%`);
              
              if (progressPercent < 95) {
                logger.log(`[VideoPlayer] Setting initial position to ${savedProgress.currentTime}`);
                // Set resume position
                setResumePosition(savedProgress.currentTime);
                
                // Check for saved preference
                const pref = await AsyncStorage.getItem(RESUME_PREF_KEY);
                if (pref === RESUME_PREF.ALWAYS_RESUME) {
                  setInitialPosition(savedProgress.currentTime);
                  logger.log(`[VideoPlayer] Auto-resuming based on saved preference`);
                } else if (pref === RESUME_PREF.ALWAYS_START_OVER) {
                  setInitialPosition(0);
                  logger.log(`[VideoPlayer] Auto-starting from beginning based on saved preference`);
                } else {
                  // Only show resume overlay if no preference or ALWAYS_ASK
                  setShowResumeOverlay(true);
                }
              } else {
                logger.log(`[VideoPlayer] Progress >= 95%, starting from beginning`);
              }
            }
          } else {
            logger.log(`[VideoPlayer] No saved progress found`);
          }
        } catch (error) {
          logger.error('[VideoPlayer] Error loading watch progress:', error);
        }
      } else {
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
        logger.log(`[VideoPlayer] Saved progress: ${currentTime.toFixed(1)}/${duration.toFixed(1)} (${((currentTime/duration)*100).toFixed(1)}%)`);
      } catch (error) {
        logger.error('[VideoPlayer] Error saving watch progress:', error);
      }
    } else {
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

  const onSliderValueChange = (value: number) => {
    if (videoRef.current) {
      const newTime = Math.floor(value);
      videoRef.current.seek(newTime);
      setCurrentTime(newTime);
      progress.value = newTime;
    }
  };

  const togglePlayback = () => {
    setPaused(!paused);
  };

  const skip = (seconds: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
      videoRef.current.seek(newTime);
      setCurrentTime(newTime);
      progress.value = newTime;
    }
  };

  const onProgress = (data: { currentTime: number }) => {
    setCurrentTime(data.currentTime);
    progress.value = data.currentTime;
  };

  const onLoad = (data: { duration: number }) => {
    setDuration(data.duration);
    max.value = data.duration;
    
    logger.log(`[VideoPlayer] Video loaded with duration: ${data.duration}`);
    
    // If we have an initial position to seek to, do it now
    if (initialPosition !== null && !isInitialSeekComplete && videoRef.current) {
      logger.log(`[VideoPlayer] Will seek to saved position: ${initialPosition}`);
      
      // Seek immediately with a small delay
      setTimeout(() => {
        if (videoRef.current) {
          try {
            videoRef.current.seek(initialPosition);
            setCurrentTime(initialPosition);
            progress.value = initialPosition;
            setIsInitialSeekComplete(true);
            logger.log(`[VideoPlayer] Successfully seeked to saved position: ${initialPosition}`);
          } catch (error) {
            logger.error('[VideoPlayer] Error seeking to saved position:', error);
          }
        } else {
          logger.error('[VideoPlayer] videoRef is no longer valid when attempting to seek');
        }
      }, 1000); // Increase delay to ensure video is fully loaded
    } else {
      if (initialPosition === null) {
        logger.log(`[VideoPlayer] No initial position to seek to`);
      } else if (isInitialSeekComplete) {
        logger.log(`[VideoPlayer] Initial seek already completed`);
      } else {
        logger.log(`[VideoPlayer] videoRef not available for seeking`);
      }
    }
  };

  const onAudioTracks = (data: { audioTracks: AudioTrack[] }) => {
    const tracks = data.audioTracks || [];
    setAudioTracks(tracks);
    logger.log(`[VideoPlayer] Available audio tracks:`, tracks);
  };

  const onTextTracks = (e: Readonly<{ textTracks: TextTrack[] }>) => {
    const tracks = e.textTracks || [];
    setTextTracks(tracks);
    logger.log(`[VideoPlayer] Available subtitle tracks:`, tracks);
  };

  // Toggle through aspect ratio modes
  const cycleAspectRatio = () => {
    const currentIndex = resizeModes.indexOf(resizeMode);
    const nextIndex = (currentIndex + 1) % resizeModes.length;
    logger.log(`[VideoPlayer] Changing aspect ratio from ${resizeMode} to ${resizeModes[nextIndex]}`);
    setResizeMode(resizeModes[nextIndex]);
  };

  // Function to enable immersive mode
  const enableImmersiveMode = () => {
    StatusBar.setHidden(true);
    
    if (Platform.OS === 'android') {
      // Full immersive mode - hides both status and navigation bars
      // Use setBarMode with 'FullSticky' mode to hide all bars with sticky behavior
      RNImmersiveMode.setBarMode('FullSticky');
      
      // Alternative: if you want to use fullLayout method (which is in the TypeScript definition)
      RNImmersiveMode.fullLayout(true);
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
    if (showAudioModal) {
      logger.log("[VideoPlayer] Audio modal should be visible now");
      logger.log("[VideoPlayer] Available audio tracks:", audioTracks);
    }
  }, [showAudioModal, audioTracks]);

  useEffect(() => {
    if (showSubtitleModal) {
      logger.log("[VideoPlayer] Subtitle modal should be visible now");
      logger.log("[VideoPlayer] Available text tracks:", textTracks);
    }
  }, [showSubtitleModal, textTracks]);

  // Attempt to seek once videoRef is available
  useEffect(() => {
    if (initialPosition !== null && !isInitialSeekComplete && videoRef.current) {
      logger.log(`[VideoPlayer] videoRef is now available, attempting to seek to: ${initialPosition}`);
      try {
        videoRef.current.seek(initialPosition);
        setCurrentTime(initialPosition);
        progress.value = initialPosition;
        setIsInitialSeekComplete(true);
        logger.log(`[VideoPlayer] Successfully seeked to position: ${initialPosition}`);
      } catch (error) {
        logger.error('[VideoPlayer] Error seeking to position on ref available:', error);
      }
    }
  }, [videoRef.current, initialPosition, isInitialSeekComplete]);

  // Load resume preference on mount
  useEffect(() => {
    const loadResumePreference = async () => {
      try {
        const pref = await AsyncStorage.getItem(RESUME_PREF_KEY);
        if (pref) {
          setResumePreference(pref);
          logger.log(`[VideoPlayer] Loaded resume preference: ${pref}`);
          
          // If user has a preference, apply it automatically
          if (pref === RESUME_PREF.ALWAYS_RESUME && resumePosition !== null) {
            setShowResumeOverlay(false);
            setInitialPosition(resumePosition);
            logger.log(`[VideoPlayer] Auto-resuming based on saved preference`);
          } else if (pref === RESUME_PREF.ALWAYS_START_OVER) {
            setShowResumeOverlay(false);
            setInitialPosition(0);
            logger.log(`[VideoPlayer] Auto-starting from beginning based on saved preference`);
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
      logger.log(`[VideoPlayer] Reset resume preference`);
    } catch (error) {
      logger.error('[VideoPlayer] Error resetting resume preference:', error);
    }
  };

  // Handle resume from overlay - modified to save preference
  const handleResume = async () => {
    if (resumePosition !== null && videoRef.current) {
      logger.log(`[VideoPlayer] Resuming from ${resumePosition}`);
      
      // Save preference if remember choice is checked
      if (rememberChoice) {
        try {
          await AsyncStorage.setItem(RESUME_PREF_KEY, RESUME_PREF.ALWAYS_RESUME);
          logger.log(`[VideoPlayer] Saved resume preference: ${RESUME_PREF.ALWAYS_RESUME}`);
        } catch (error) {
          logger.error('[VideoPlayer] Error saving resume preference:', error);
        }
      }
      
      // Set initial position to trigger seek
      setInitialPosition(resumePosition);
      // Hide overlay
      setShowResumeOverlay(false);
    }
  };

  // Handle start from beginning - modified to save preference
  const handleStartFromBeginning = async () => {
    logger.log(`[VideoPlayer] Starting from beginning`);
    
    // Save preference if remember choice is checked
    if (rememberChoice) {
      try {
        await AsyncStorage.setItem(RESUME_PREF_KEY, RESUME_PREF.ALWAYS_START_OVER);
        logger.log(`[VideoPlayer] Saved resume preference: ${RESUME_PREF.ALWAYS_START_OVER}`);
      } catch (error) {
        logger.error('[VideoPlayer] Error saving resume preference:', error);
      }
    }
    
    // Hide overlay
    setShowResumeOverlay(false);
    // Set initial position to 0
    setInitialPosition(0);
    // Make sure we seek to beginning
    if (videoRef.current) {
      videoRef.current.seek(0);
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

  // Add onBuffer handler to Video component
  const onBuffer = ({ isBuffering }: { isBuffering: boolean }) => {
    // You can use this to show a loading indicator if needed
    logger.log(`[VideoPlayer] Buffering: ${isBuffering}`);
  };

  // Add onProgress handler to track buffered data
  const onLoadStart = () => {
    setBuffered(0);
  };

  const handleProgress = (data: { currentTime: number, playableDuration: number, seekableDuration?: number }) => {
    setCurrentTime(data.currentTime);
    progress.value = data.currentTime;
    
    // Ensure playableDuration is always at least equal to currentTime
    const effectivePlayableDuration = Math.max(data.currentTime, data.playableDuration);
    setBuffered(effectivePlayableDuration);

    // Calculate buffer ahead (cannot be negative)
    const bufferAhead = Math.max(0, effectivePlayableDuration - data.currentTime);
    const bufferPercentage = ((effectivePlayableDuration / (duration || 1)) * 100);

    // Add detailed buffer logging
    logger.log(`[VideoPlayer] Buffer Status:
      Current Time: ${data.currentTime.toFixed(2)}s
      Playable Duration: ${effectivePlayableDuration.toFixed(2)}s
      Buffered Ahead: ${bufferAhead.toFixed(2)}s
      Seekable Duration: ${data.seekableDuration?.toFixed(2) || 'N/A'}s
      Buffer Percentage: ${bufferPercentage.toFixed(1)}%
    `);
  };

  return (
    <View style={styles.container}> 
      <TouchableOpacity
        style={styles.videoContainer}
        onPress={toggleControls}
        activeOpacity={1}
      >
        <Video
          ref={videoRef}
          source={{ uri }}
          style={styles.video}
          paused={paused || showResumeOverlay}
          resizeMode={resizeMode}
          onLoad={onLoad}
          onProgress={handleProgress}
          rate={playbackSpeed}
          progressUpdateInterval={250}
          selectedAudioTrack={selectedAudioTrack !== null ? 
            { type: 'index', value: selectedAudioTrack } as any : 
            undefined
          }
          onAudioTracks={onAudioTracks}
          selectedTextTrack={selectedTextTrack as any}
          onTextTracks={onTextTracks}
          onBuffer={onBuffer}
          onLoadStart={onLoadStart}
        />

        {/* Slider Container with buffer indicator */}
        <Animated.View style={[styles.sliderContainer, { opacity: fadeAnim }]}>
          <View style={styles.sliderBackground}>
            {/* Buffered Progress */}
            <View style={[styles.bufferProgress, { 
              width: `${(buffered / (duration || 1)) * 100}%`
            }]} />
          </View>
          <Slider
            progress={progress}
            minimumValue={min}
            maximumValue={max}
            style={styles.slider}
            onValueChange={onSliderValueChange}
            theme={{
              minimumTrackTintColor: '#E50914',
              maximumTrackTintColor: 'transparent',
              bubbleBackgroundColor: '#E50914',
            }}
          />
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

                {/* Aspect Ratio Button - Added */}
                <TouchableOpacity style={styles.bottomButton} onPress={cycleAspectRatio}>
                  <Ionicons name="resize" size={20} color="white" />
                  <Text style={styles.bottomButtonText}>
                    Aspect ({resizeMode})
                  </Text>
                </TouchableOpacity>

                {/* Audio Button - Updated language display */}
                <TouchableOpacity 
                  style={styles.bottomButton} 
                  onPress={() => setShowAudioModal(true)}
                  disabled={audioTracks.length <= 1}
                >
                  <Ionicons name="volume-high" size={20} color={audioTracks.length <= 1 ? 'grey' : 'white'} />
                  <Text style={[styles.bottomButtonText, audioTracks.length <= 1 && {color: 'grey'}]}>
                    {audioTracks.length > 0 && selectedAudioTrack !== null
                      ? `Audio: ${formatLanguage(audioTracks.find(t => t.index === selectedAudioTrack)?.language)}`
                      : 'Audio: Default'}
                  </Text>
                </TouchableOpacity>
                
                {/* Subtitle Button - Updated language display */}
                <TouchableOpacity 
                  style={styles.bottomButton}
                  onPress={() => setShowSubtitleModal(true)}
                  disabled={textTracks.length === 0}
                >
                  <Ionicons name="text" size={20} color={textTracks.length === 0 ? 'grey' : 'white'} />
                  <Text style={[styles.bottomButtonText, textTracks.length === 0 && {color: 'grey'}]}>
                    {selectedTextTrack?.type === 'disabled' 
                      ? 'Subtitles: Off' 
                      : `Subtitles: ${formatLanguage(textTracks.find(t => t.index === selectedTextTrack?.value)?.language)}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

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

      {/* Audio Selection Modal - Updated language display */}
      {showAudioModal && (
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
                {audioTracks.length > 0 ? audioTracks.map(track => (
                  <TouchableOpacity
                    key={track.index}
                    style={styles.enhancedTrackItem}
                    onPress={() => {
                      setSelectedAudioTrack(track.index);
                      setShowAudioModal(false);
                    }}
                  >
                    <View style={styles.trackInfoContainer}>
                      <Text style={styles.trackPrimaryText}>
                        {formatLanguage(track.language) || track.title || `Track ${track.index + 1}`}
                      </Text>
                      {(track.title && track.language) && (
                        <Text style={styles.trackSecondaryText}>{track.title}</Text>
                      )}
                      {track.type && <Text style={styles.trackSecondaryText}>{track.type}</Text>}
                    </View>
                    {selectedAudioTrack === track.index && (
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
      )}
      
      {/* Subtitle Selection Modal - Updated language display */}
      {showSubtitleModal && (
        <View style={styles.fullscreenOverlay}>
          <View style={styles.enhancedModalContainer}>
            <View style={styles.enhancedModalHeader}>
              <Text style={styles.enhancedModalTitle}>Subtitles</Text>
              <TouchableOpacity 
                style={styles.enhancedCloseButton}
                onPress={() => setShowSubtitleModal(false)}
              >
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.trackListScrollContainer}>
              <View style={styles.trackListContainer}>
                {/* Off option with improved design */}
                <TouchableOpacity
                  style={styles.enhancedTrackItem}
                  onPress={() => {
                    setSelectedTextTrack({ type: 'disabled' });
                    setShowSubtitleModal(false);
                  }}
                >
                  <View style={styles.trackInfoContainer}>
                    <Text style={styles.trackPrimaryText}>Off</Text>
                  </View>
                  {selectedTextTrack?.type === 'disabled' && (
                    <View style={styles.selectedIndicatorContainer}>
                      <Ionicons name="checkmark" size={22} color="#E50914" />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Available subtitle tracks with improved design */}
                {textTracks.length > 0 ? textTracks.map(track => (
                  <TouchableOpacity
                    key={track.index}
                    style={styles.enhancedTrackItem}
                    onPress={() => {
                      setSelectedTextTrack({ type: 'index', value: track.index });
                      setShowSubtitleModal(false);
                    }}
                  >
                    <View style={styles.trackInfoContainer}>
                      <Text style={styles.trackPrimaryText}>
                        {formatLanguage(track.language) || track.title || `Subtitle ${track.index + 1}`}
                      </Text>
                      {(track.title && track.language) && (
                        <Text style={styles.trackSecondaryText}>{track.title}</Text>
                      )}
                      {track.type && <Text style={styles.trackSecondaryText}>{track.type}</Text>}
                    </View>
                    {selectedTextTrack?.type === 'index' && 
                     selectedTextTrack?.value === track.index && (
                      <View style={styles.selectedIndicatorContainer}>
                        <Ionicons name="checkmark" size={22} color="#E50914" />
                      </View>
                    )}
                  </TouchableOpacity>
                )) : (
                  <View style={styles.emptyStateContainer}>
                    <Ionicons name="alert-circle-outline" size={40} color="#888" />
                    <Text style={styles.emptyStateText}>No subtitle tracks available</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View> 
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
  },
  video: {
    flex: 1,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20, // Adjust top padding for safe area
    paddingHorizontal: 20,
    paddingBottom: 10, // Add some padding at the bottom of the gradient
  },
  bottomGradient: {
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start', // Align items to the top
  },
  // Styles for the title section and metadata
  titleSection: {
    flex: 1, // Allow title section to take available space
    marginRight: 10, // Add margin to avoid overlap with close button
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
    flexWrap: 'wrap', // Allow items to wrap if needed
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
    fontStyle: 'italic', // Italicize provider text
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
    transform: [{ translateY: -30 }], // Half the height of play button to center it perfectly
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
    bottom: 55, // Moved closer to bottom buttons
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 1000,
  },
  sliderBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginHorizontal: 20,
    top: 13.5, // Center with the slider thumb
  },
  bufferProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  slider: {
    width: '100%',
    height: 30,
    zIndex: 1,
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginTop: -4, // Reduced space between slider and time
    marginBottom: 8, // Added space between time and buttons
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
  // New simplified modal styles
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
  // Resume overlay styles
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
});

export default VideoPlayer; 