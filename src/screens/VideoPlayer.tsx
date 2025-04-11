import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Dimensions, Modal, Pressable, StatusBar, Platform, ScrollView, Animated, StyleProp, ViewStyle } from 'react-native';
import Video from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
// Remove reanimated import since we're not using shared values anymore
import { NativeModules } from 'react-native';
// Import immersive mode package
import RNImmersiveMode from 'react-native-immersive-mode';
// Import screen orientation
import * as ScreenOrientation from 'expo-screen-orientation';
// Import navigation hooks
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { storageService } from '../services/storageService';
// Add throttle/debounce imports
import { debounce } from 'lodash';

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
  id?: string;  // Add id for the content
  type?: string; // Add type (movie/series)
  episodeId?: string; // Add episodeId for series episodes
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

const VideoPlayer = () => {
  // Get route params from navigation
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const navigation = useNavigation();
  
  // Extract parameters from route
  const { 
    uri: routeUri,
    title = 'Episode Name',
    season,
    episode,
    episodeTitle,
    quality,
    year,
    streamProvider,
    id,  // Extract id
    type, // Extract type
    episodeId // Extract episodeId
  } = route.params;

  // Provide a fallback test URL in development mode if URI is empty or invalid
  const developmentTestUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
  const uri = __DEV__ && (!routeUri || routeUri.trim() === '') ? developmentTestUrl : routeUri;

  // Log received props for debugging
  console.log("VideoPlayer received route params:", {
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

  // Validate URI
  useEffect(() => {
    if (!uri) {
      console.error("Empty or null URI received in VideoPlayer");
      alert("Error: No video URL provided");
    } else {
      console.log("Video URI:", uri);
    }
  }, [uri]);

  // Animation values for sliding panels
  const audioSlideAnim = useRef(new Animated.Value(400)).current;
  const subtitleSlideAnim = useRef(new Animated.Value(400)).current;
  // Add new fade animation value for controls
  const controlsFadeAnim = useRef(new Animated.Value(1)).current;

  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
  const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack | null>({ type: 'disabled' }); // Default subtitles off
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [resizeMode, setResizeMode] = useState<ResizeModeType>('contain'); // State for resize mode
  const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false); // New state for aspect ratio menu
  const videoRef = useRef<any>(null);
  const [sliderValue, setSliderValue] = useState(0);

  // Add state for the direct UI menus
  const [showAudioOptions, setShowAudioOptions] = useState(false);
  const [showSubtitleOptions, setShowSubtitleOptions] = useState(false);

  // Add timer ref for auto-hiding controls
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Add a new state variable to track buffering progress
  const [bufferedProgress, setBufferedProgress] = useState(0);

  // Add state for tracking if initial seek is done
  const [initialSeekDone, setInitialSeekDone] = useState(false);
  const lastProgressUpdate = useRef<number>(0);
  const PROGRESS_UPDATE_INTERVAL = 5000; // Update every 5 seconds

  // Add ref for tracking if slider is being dragged
  const isSliderDragging = useRef(false);
  // Add last onProgress update time to throttle updates
  const lastProgressUpdateTime = useRef(0);

  // Load initial progress when component mounts
  useEffect(() => {
    const loadProgress = async () => {
      if (id && type) {
        const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
        if (savedProgress && savedProgress.currentTime > 0) {
          // Only seek if we're not too close to the end
          const threshold = savedProgress.duration * 0.9; // 90% threshold
          if (savedProgress.currentTime < threshold) {
            setCurrentTime(savedProgress.currentTime);
            if (videoRef.current) {
              videoRef.current.seek(savedProgress.currentTime);
            }
          }
        }
      }
    };

    loadProgress();
  }, [id, type, episodeId]);

  // Save progress periodically and when component unmounts
  useEffect(() => {
    const saveProgress = async () => {
      if (id && type && duration > 0) {
        const now = Date.now();
        // Only update if enough time has passed since last update
        if (now - lastProgressUpdate.current >= PROGRESS_UPDATE_INTERVAL) {
          const progressPercent = (currentTime / duration) * 100;
          
          // If progress is >= 95%, consider it complete and remove progress
          if (progressPercent >= 95) {
            await storageService.removeWatchProgress(id, type, episodeId);
          } else {
            await storageService.setWatchProgress(id, type, {
              currentTime,
              duration,
              lastUpdated: now
            }, episodeId);
          }
          
          lastProgressUpdate.current = now;
        }
      }
    };

    // Save progress periodically
    const progressInterval = setInterval(saveProgress, PROGRESS_UPDATE_INTERVAL);

    // Save progress when component unmounts
    return () => {
      clearInterval(progressInterval);
      saveProgress();
    };
  }, [id, type, episodeId, currentTime, duration]);

  // Handle video completion
  const onEnd = async () => {
    if (id && type) {
      // Remove progress when video is finished
      await storageService.removeWatchProgress(id, type, episodeId);
    }
  };

  // Update the component mount effect to start auto-hide timer
  useEffect(() => {
    // Enable immersive mode when component mounts
    enableImmersiveMode();
    
    // Set landscape orientation when component mounts
    setLandscapeOrientation();

    // Start auto-hide timer when component mounts (after a short delay)
    const initialTimer = setTimeout(() => {
      startHideControlsTimer();
    }, 1500);

    // Disable immersive mode when component unmounts
    return () => {
      clearTimeout(initialTimer);
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
      disableImmersiveMode();
      // Reset orientation when component unmounts
      resetOrientation();
    };
  }, []);

  // Function to set landscape orientation
  const setLandscapeOrientation = async () => {
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
    } catch (error) {
      console.error("Failed to lock orientation:", error);
    }
  };

  // Function to reset orientation
  const resetOrientation = async () => {
    try {
      await ScreenOrientation.unlockAsync();
    } catch (error) {
      console.error("Failed to unlock orientation:", error);
    }
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

  useEffect(() => {
    if (duration > 0 && currentTime > 0) {
      setSliderValue(currentTime);
    }
  }, [duration, currentTime]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    // For videos longer than an hour, show HH:MM:SS
    if (hours > 0) {
      return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    
    // For shorter videos, show MM:SS
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Add function to start the auto-hide timer
  const startHideControlsTimer = () => {
    // Clear any existing timer first
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    
    // Set new timer to hide controls after 3 seconds (faster)
    hideControlsTimerRef.current = setTimeout(() => {
      fadeOutControls();
    }, 3000);
  };

  // Function to fade in controls
  const fadeInControls = () => {
    // Cancel any running fade out animation
    Animated.timing(controlsFadeAnim, { 
      toValue: 0, 
      duration: 0, 
      useNativeDriver: true 
    }).stop();
    
    // Start fade in animation - make it faster
    Animated.timing(controlsFadeAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true
    }).start();
    
    setShowControls(true);
    
    // Start timer to auto-hide controls
    startHideControlsTimer();
  };

  // Function to fade out controls
  const fadeOutControls = () => {
    Animated.timing(controlsFadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true
    }).start(() => {
      setShowControls(false);
    });
    
    // Clear the timer
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  };

  // Update the useEffect for playback progress to reset timer
  useEffect(() => {
    if (showControls) {
      startHideControlsTimer();
    }
    
    // Cleanup timer on unmount
    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  // Add dependencies that should reset the timer
  }, [currentTime]);

  // Create a debounced version of the seek function to prevent excessive seeking
  const debouncedSeek = useRef(
    debounce((time: number) => {
      if (videoRef.current) {
        videoRef.current.seek(time);
      }
    }, 50)
  ).current;

  // Modify slider value change handler for community slider
  const onSliderValueChange = (value: number) => {
    setSliderValue(value);
    setCurrentTime(value);
  };

  const onSlidingComplete = (value: number) => {
    if (!videoRef.current) return;
    
    const newTime = Math.floor(value);
    
    // Update UI immediately for responsive feel
    setCurrentTime(newTime);
    setSliderValue(newTime);
    
    // Seek to the new position
    videoRef.current.seek(newTime);
    
    // Reset buffered progress indicator if seeking forward
    const isFastForward = newTime > currentTime;
    if (isFastForward) {
      setBufferedProgress(newTime);
    }
    
    // Reset timer for auto-hiding controls
    startHideControlsTimer();
    
    // Reset slider dragging state
    isSliderDragging.current = false;
  };

  // Set slider being touched
  const onSlidingStart = () => {
    isSliderDragging.current = true;
  };

  const togglePlayback = () => {
    setPaused(!paused);
    startHideControlsTimer();
  };

  const skip = (seconds: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
      videoRef.current.seek(newTime);
      setCurrentTime(newTime);
      setSliderValue(newTime);
      startHideControlsTimer();
    }
  };

  // Optimize the onProgress handler to throttle updates
  const onProgress = (data: { currentTime: number, playableDuration?: number, seekableDuration?: number }) => {
    // Skip updates during dragging for smoother UX
    if (isSliderDragging.current) return;
    
    // Throttle updates to reduce render cycles (process at most every 250ms)
    const now = Date.now();
    if (now - lastProgressUpdateTime.current < 250) {
      return;
    }
    
    lastProgressUpdateTime.current = now;
    
    const newTime = data.currentTime;
    
    // Only update when there's a meaningful change (at least 0.5 second difference)
    if (Math.abs(currentTime - newTime) >= 0.5) {
      setCurrentTime(newTime);
      setSliderValue(newTime);
    }
    
    // Update buffered progress more efficiently
    if (data.playableDuration) {
      // Use a functional update to ensure we're working with the latest state
      setBufferedProgress(prev => Math.max(prev, data.playableDuration || 0));
    }
  };

  const onLoad = (data: { duration: number }) => {
    setDuration(data.duration);
  };

  const onAudioTracks = (data: { audioTracks: AudioTrack[] }) => {
    setAudioTracks(data.audioTracks || []);
    if (selectedAudioTrack === null && data.audioTracks && data.audioTracks.length > 0) {
      setSelectedAudioTrack(data.audioTracks[0].index);
    }
  };

  const onTextTracks = (e: Readonly<{ textTracks: TextTrack[] }>) => {
    console.log("Detected Text Tracks:", e.textTracks);
    setTextTracks(e.textTracks || []);
  };

  // Toggle through aspect ratio modes
  const cycleAspectRatio = () => {
    const currentIndex = resizeModes.indexOf(resizeMode);
    const nextIndex = (currentIndex + 1) % resizeModes.length;
    console.log(`Changing aspect ratio from ${resizeMode} to ${resizeModes[nextIndex]}`);
    setResizeMode(resizeModes[nextIndex]);
  };

  // Function for Back button
  const handleBackPress = () => {
    console.log("Close button pressed");
    
    // Pause video before leaving
    setPaused(true);
    
    // Clear any potentially lingering timers
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
    
    // Explicitly disable immersive mode before navigation
    disableImmersiveMode();
    
    // Reset orientation first
    resetOrientation()
      .then(() => {
        // Then navigate back - with a guaranteed callback
        setTimeout(() => {
          navigation.goBack();
        }, 350); // Increase delay to ensure orientation reset completes
      })
      .catch(error => {
        console.error("Error resetting orientation:", error);
        // Navigate back anyway after a short delay
        disableImmersiveMode(); // Try disabling again
        setTimeout(() => {
          navigation.goBack();
        }, 150);
      });
      
    // Safety fallback - if navigation doesn't happen for some reason
    setTimeout(() => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    }, 1000);
  };

  // Toggle menus
  const toggleAudioOptions = (e?: any) => {
    if (e) e.stopPropagation();
    
    if (showAudioOptions) {
      // Hide the audio menu with animation
      Animated.timing(audioSlideAnim, {
        toValue: 400,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setShowAudioOptions(false);
      });
    } else {
      // Show the audio menu with animation
      setShowAudioOptions(true);
      setShowSubtitleOptions(false);
      subtitleSlideAnim.setValue(400); // Reset subtitle animation
      Animated.timing(audioSlideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  };

  const toggleSubtitleOptions = (e?: any) => {
    if (e) e.stopPropagation();
    
    if (showSubtitleOptions) {
      // Hide the subtitle menu with animation
      Animated.timing(subtitleSlideAnim, {
        toValue: 400,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setShowSubtitleOptions(false);
      });
    } else {
      // Show the subtitle menu with animation
      setShowSubtitleOptions(true);
      setShowAudioOptions(false);
      audioSlideAnim.setValue(400); // Reset audio animation
      Animated.timing(subtitleSlideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  };

  // When user taps on video container, close menus
  const handleVideoContainerPress = () => {
    if (showAudioOptions) {
      // Hide the audio menu with animation
      Animated.timing(audioSlideAnim, {
        toValue: 400,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setShowAudioOptions(false);
      });
    } else if (showSubtitleOptions) {
      // Hide the subtitle menu with animation
      Animated.timing(subtitleSlideAnim, {
        toValue: 400,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setShowSubtitleOptions(false);
      });
    } else {
      // Toggle controls with fade animation
      if (showControls) {
        fadeOutControls();
      } else {
        fadeInControls();
      }
    }
  };

  // Handle selection
  const selectAudioTrack = (index: number) => {
    setSelectedAudioTrack(index);
    // Hide the audio menu with animation
    Animated.timing(audioSlideAnim, {
      toValue: 400,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      setShowAudioOptions(false);
    });
  };

  const selectSubtitleTrack = (track: SelectedTrack | null) => {
    setSelectedTextTrack(track);
    // Hide the subtitle menu with animation
    Animated.timing(subtitleSlideAnim, {
      toValue: 400,
      duration: 300,
      useNativeDriver: true
    }).start(() => {
      setShowSubtitleOptions(false);
    });
  };

  return (
    <View style={styles.container}> 
      <TouchableOpacity
        style={styles.videoContainer}
        onPress={handleVideoContainerPress}
        activeOpacity={0.98} // Make touch feedback even more subtle
        delayPressIn={0} // Remove delay for immediate response
      >
        <Video
          ref={videoRef}
          source={{ uri }}
          style={styles.video}
          paused={paused}
          resizeMode={resizeMode}
          onLoad={onLoad}
          onProgress={onProgress}
          onEnd={onEnd}
          rate={playbackSpeed}
          progressUpdateInterval={500}  // Less frequent updates (500ms vs 100ms)
          selectedAudioTrack={selectedAudioTrack !== null ? 
            { type: 'index', value: selectedAudioTrack } as any : 
            undefined
          }
          onAudioTracks={onAudioTracks}
          selectedTextTrack={selectedTextTrack as any}
          onTextTracks={onTextTracks}
          
          // Optimize buffer configuration for smoother playback
          bufferConfig={{
            minBufferMs: 15000,         // 15 seconds minimum buffer
            maxBufferMs: 50000,         // 50 seconds maximum buffer
            bufferForPlaybackMs: 2500,  // Start playback after 2.5 seconds buffered
            bufferForPlaybackAfterRebufferMs: 5000  // Resume after rebuffering when we have 5 seconds
          }}
          repeat={false}                // Don't loop the video
          
          // Performance optimization settings
          ignoreSilentSwitch="ignore"   // Keep playing when the app is in the background
          playInBackground={false}      // Don't play when app is in background
          reportBandwidth={false}       // Disable bandwidth reporting to reduce overhead
          disableFocus={false}          // Stay focused
          
          // Only render when actively used to save resources
          renderToHardwareTextureAndroid={true}
          
          onBuffer={(buffer) => {
            console.log('Buffering:', buffer.isBuffering);
          }}
          
          onError={(error) => {
            console.error('Video playback error:', error);
            alert(`Video Error: ${error.error.errorString} (Code: ${error.error.errorCode})`);
          }}
        />

        {/* Controls Overlay - with fade animation */}
        {showControls && (
          <Animated.View 
            style={[
              styles.controlsContainer,
              { opacity: controlsFadeAnim }
            ]}
          >
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
                <TouchableOpacity 
                  style={styles.closeButton} 
                  onPress={handleBackPress}
                  activeOpacity={0.7}
                  hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                  <Ionicons name="close" size={28} color="white" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* Center Controls (Play/Pause, Skip) */}
            <View style={styles.controls}>
              <TouchableOpacity onPress={() => skip(-10)}>
                <Ionicons name="play-back" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
                <Ionicons name={paused ? "play" : "pause"} size={30} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => skip(10)}>
                <Ionicons name="play-forward" size={24} color="white" />
              </TouchableOpacity>
            </View>

            {/* Bottom Gradient & Controls */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.bottomGradient}
            >
              <View style={styles.bottomControls}>
                {/* Slider - replaced with community slider */}
                <View style={styles.sliderContainer}>
                  {/* Buffer indicator - only render if needed */}
                  {bufferedProgress > 0 && (
                    <View style={[
                      styles.bufferIndicator, 
                      { 
                        width: `${Math.min((bufferedProgress / (duration || 1)) * 100, 100)}%`
                      }
                    ]} 
                    />
                  )}
                  
                  <View style={styles.sliderRow}>
                    <Text style={styles.currentTime}>
                      {formatTime(currentTime)}
                    </Text>
                    
                    <Slider
                      style={styles.slider}
                      value={sliderValue}
                      minimumValue={0}
                      maximumValue={duration > 0 ? duration : 1}
                      step={0.1}
                      minimumTrackTintColor="#E50914"
                      maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
                      thumbTintColor="#E50914"
                      onValueChange={onSliderValueChange}
                      onSlidingStart={onSlidingStart}
                      onSlidingComplete={onSlidingComplete}
                    />
                    
                    <Text style={styles.durationText}>
                      {formatTime(duration)}
                    </Text>
                  </View>
                </View>

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

                  {/* Audio Button */}
                  <TouchableOpacity 
                    style={styles.bottomButton} 
                    onPress={toggleAudioOptions}
                    disabled={audioTracks.length <= 1}
                  >
                    <Ionicons name="volume-high" size={20} color={audioTracks.length <= 1 ? 'grey' : 'white'} />
                    <Text style={[styles.bottomButtonText, audioTracks.length <= 1 && {color: 'grey'}]}>
                      Audio {audioTracks.length > 0 ? 
                        `(${audioTracks.find(t => t.index === selectedAudioTrack)?.language || 'Default'})` : 
                        ''}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Subtitle Button */}
                  <TouchableOpacity 
                    style={styles.bottomButton}
                    onPress={toggleSubtitleOptions}
                    disabled={textTracks.length === 0}
                  >
                    <Ionicons name="text" size={20} color={textTracks.length === 0 ? 'grey' : 'white'} />
                    <Text style={[styles.bottomButtonText, textTracks.length === 0 && {color: 'grey'}]}>
                      {selectedTextTrack?.type === 'disabled' 
                        ? 'Subtitles (Off)' 
                        : `Subtitles (${textTracks.find(t => t.index === selectedTextTrack?.value)?.language?.toUpperCase() || 'On'})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>

            {/* Audio Options Panel - Slide from Right with Gradient */}
            {showAudioOptions && (
              <Animated.View 
                style={[
                  styles.slidePanel,
                  { transform: [{ translateX: audioSlideAnim }] }
                ]}
              >
                <LinearGradient
                  colors={['rgba(30, 30, 30, 0.9)', 'rgba(20, 20, 20, 0.98)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientPanel}
                >
                  <Text style={styles.optionsPanelTitle}>Audio Track</Text>
                  <ScrollView style={styles.optionsList}>
                    {audioTracks.map((track) => (
                      <TouchableOpacity
                        key={track.index}
                        style={[
                          styles.optionItem,
                          selectedAudioTrack === track.index && styles.selectedOption
                        ]}
                        onPress={() => selectAudioTrack(track.index)}
                      >
                        <Ionicons 
                          name={selectedAudioTrack === track.index ? "radio-button-on" : "radio-button-off"}
                          size={18}
                          color={selectedAudioTrack === track.index ? "#E50914" : "white"}
                          style={{ marginRight: 10 }}
                        />
                        <Text style={[
                          styles.optionItemText,
                          selectedAudioTrack === track.index && styles.selectedOptionText
                        ]}>
                          {track.language ? track.language.toUpperCase() : (track.title || `Track ${track.index + 1}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => toggleAudioOptions()}
                  >
                    <Text style={styles.cancelButtonText}>Close</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            )}

            {/* Subtitle Options Panel - Slide from Right with Gradient */}
            {showSubtitleOptions && (
              <Animated.View 
                style={[
                  styles.slidePanel,
                  { transform: [{ translateX: subtitleSlideAnim }] }
                ]}
              >
                <LinearGradient
                  colors={['rgba(30, 30, 30, 0.9)', 'rgba(20, 20, 20, 0.98)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gradientPanel}
                >
                  <Text style={styles.optionsPanelTitle}>Subtitles</Text>
                  <ScrollView style={styles.optionsList}>
                    <TouchableOpacity
                      style={[
                        styles.optionItem,
                        selectedTextTrack?.type === 'disabled' && styles.selectedOption
                      ]}
                      onPress={() => selectSubtitleTrack({ type: 'disabled' })}
                    >
                      <Ionicons 
                        name={selectedTextTrack?.type === 'disabled' ? "radio-button-on" : "radio-button-off"}
                        size={18}
                        color={selectedTextTrack?.type === 'disabled' ? "#E50914" : "white"}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[
                        styles.optionItemText,
                        selectedTextTrack?.type === 'disabled' && styles.selectedOptionText
                      ]}>Off</Text>
                    </TouchableOpacity>
                    
                    {textTracks.map((track) => (
                      <TouchableOpacity
                        key={track.index}
                        style={[
                          styles.optionItem,
                          selectedTextTrack?.type === 'index' && selectedTextTrack?.value === track.index && styles.selectedOption
                        ]}
                        onPress={() => selectSubtitleTrack({ type: 'index', value: track.index })}
                      >
                        <Ionicons 
                          name={selectedTextTrack?.type === 'index' && selectedTextTrack?.value === track.index ? "radio-button-on" : "radio-button-off"}
                          size={18}
                          color={selectedTextTrack?.type === 'index' && selectedTextTrack?.value === track.index ? "#E50914" : "white"}
                          style={{ marginRight: 10 }}
                        />
                        <Text style={[
                          styles.optionItemText,
                          selectedTextTrack?.type === 'index' && selectedTextTrack?.value === track.index && styles.selectedOptionText
                        ]}>
                          {track.language ? track.language.toUpperCase() : (track.title || `Track ${track.index + 1}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => toggleSubtitleOptions()}
                  >
                    <Text style={styles.cancelButtonText}>Close</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            )}
          </Animated.View>
        )}
      </TouchableOpacity> 
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
    paddingBottom: Platform.OS === 'ios' ? 30 : 20, // Adjust bottom padding for safe area
    paddingHorizontal: 20,
    paddingTop: 10, // Add some padding at the top of the gradient
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
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 20,
    marginRight: -5,
    marginTop: -5,
    zIndex: 100,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    gap: 20,
  },
  sliderContainer: {
    width: '100%',
    marginBottom: 8,
    position: 'relative',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  bufferIndicator: {
    position: 'absolute',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    top: 14, // Position to align with the slider track
    left: 24, // Account for the currentTime text
    right: 24, // Account for the duration text  
    zIndex: 1,
    borderRadius: 2,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
  },
  currentTime: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.9,
    width: 40, // Fix width to prevent layout shifts
    textAlign: 'right',
  },
  durationText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.9,
    width: 40, // Fix width to prevent layout shifts
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)', 
    zIndex: 1000,
  },
  audioMenuContainer: { 
    position: 'absolute',
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    borderRadius: 10,
    padding: 20,
    width: 300,
    maxWidth: '80%',
    alignSelf: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1001,
  },
  audioMenuTitle: { 
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  audioMenuItem: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  audioMenuItemText: { 
    color: 'white',
    fontSize: 14,
  },
  subtitleMenuContainer: { 
    position: 'absolute',
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    borderRadius: 10,
    padding: 20,
    width: 300,
    maxWidth: '80%',
    alignSelf: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1001,
  },
  subtitleMenuTitle: { 
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  subtitleMenuItem: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  subtitleMenuItemText: { 
    color: 'white',
    fontSize: 14,
  },
  cancelButton: {
    marginTop: 15,
    padding: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.8)',
    borderRadius: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  // New styles for the inline option panels
  optionsPanel: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    marginLeft: -150, // Half of width
    width: 300,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 10,
    padding: 15,
    maxHeight: 300,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 1001,
  },
  optionsPanelTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 10,
  },
  optionsList: {
    flex: 1,
    marginBottom: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 5,
    marginVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  optionItemText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  slidePanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 300,
    right: 0,
    backgroundColor: 'transparent',
    zIndex: 1000,
  },
  gradientPanel: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  selectedOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedOptionText: {
    fontWeight: 'bold',
  },
});

export default VideoPlayer; 