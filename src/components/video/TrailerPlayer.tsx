import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Video, { VideoRef, OnLoadData, OnProgressData } from 'react-native-video';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

interface TrailerPlayerProps {
  trailerUrl: string;
  autoPlay?: boolean;
  muted?: boolean;
  onLoadStart?: () => void;
  onLoad?: () => void;
  onError?: (error: string) => void;
  onProgress?: (data: OnProgressData) => void;
  onPlaybackStatusUpdate?: (status: { isLoaded: boolean; didJustFinish: boolean }) => void;
  style?: any;
}

const TrailerPlayer: React.FC<TrailerPlayerProps> = memo(({
  trailerUrl,
  autoPlay = true,
  muted = true,
  onLoadStart,
  onLoad,
  onError,
  onProgress,
  onPlaybackStatusUpdate,
  style,
}) => {
  const { currentTheme } = useTheme();
  const videoRef = useRef<VideoRef>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(muted);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  // Animated values
  const controlsOpacity = useSharedValue(0);
  const loadingOpacity = useSharedValue(1);
  const playButtonScale = useSharedValue(1);

  // Auto-hide controls after 3 seconds
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const showControlsWithTimeout = useCallback(() => {
    setShowControls(true);
    controlsOpacity.value = withTiming(1, { duration: 200 });
    
    // Clear existing timeout
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    
    // Set new timeout to hide controls
    hideControlsTimeout.current = setTimeout(() => {
      setShowControls(false);
      controlsOpacity.value = withTiming(0, { duration: 200 });
    }, 3000);
  }, [controlsOpacity]);

  const handleVideoPress = useCallback(() => {
    if (showControls) {
      // If controls are visible, toggle play/pause
      handlePlayPause();
    } else {
      // If controls are hidden, show them
      showControlsWithTimeout();
    }
  }, [showControls, showControlsWithTimeout]);

  const handlePlayPause = useCallback(async () => {
    try {
      if (!videoRef.current) return;
      
      playButtonScale.value = withTiming(0.8, { duration: 100 }, () => {
        playButtonScale.value = withTiming(1, { duration: 100 });
      });

      setIsPlaying(!isPlaying);
      
      showControlsWithTimeout();
    } catch (error) {
      logger.error('TrailerPlayer', 'Error toggling playback:', error);
    }
  }, [isPlaying, playButtonScale, showControlsWithTimeout]);

  const handleMuteToggle = useCallback(async () => {
    try {
      if (!videoRef.current) return;
      
      setIsMuted(!isMuted);
      showControlsWithTimeout();
    } catch (error) {
      logger.error('TrailerPlayer', 'Error toggling mute:', error);
    }
  }, [isMuted, showControlsWithTimeout]);

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    loadingOpacity.value = 1;
    onLoadStart?.();
    logger.info('TrailerPlayer', 'Video load started');
  }, [loadingOpacity, onLoadStart]);

  const handleLoad = useCallback((data: OnLoadData) => {
    setIsLoading(false);
    loadingOpacity.value = withTiming(0, { duration: 300 });
    setDuration(data.duration * 1000); // Convert to milliseconds
    onLoad?.();
    logger.info('TrailerPlayer', 'Video loaded successfully');
  }, [loadingOpacity, onLoad]);

  const handleError = useCallback((error: string) => {
    setIsLoading(false);
    setHasError(true);
    loadingOpacity.value = withTiming(0, { duration: 300 });
    onError?.(error);
    logger.error('TrailerPlayer', 'Video error:', error);
  }, [loadingOpacity, onError]);

  const handleProgress = useCallback((data: OnProgressData) => {
    setPosition(data.currentTime * 1000); // Convert to milliseconds
    onProgress?.(data);
    
    if (onPlaybackStatusUpdate) {
      onPlaybackStatusUpdate({
        isLoaded: data.currentTime > 0,
        didJustFinish: false
      });
    }
  }, [onProgress, onPlaybackStatusUpdate]);

  // Sync internal muted state with prop
  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, []);

  // Animated styles
  const controlsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const loadingAnimatedStyle = useAnimatedStyle(() => ({
    opacity: loadingOpacity.value,
  }));

  const playButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }],
  }));

  const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;

  if (hasError) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color={currentTheme.colors.error} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Video
        ref={videoRef}
        source={{ uri: trailerUrl }}
        style={styles.video}
        resizeMode="cover"
        paused={!isPlaying}
        repeat={true}
        muted={isMuted}
        volume={isMuted ? 0 : 1}
        mixWithOthers="duck"
        ignoreSilentSwitch="ignore"
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onError={(error: any) => handleError(error?.error?.message || 'Unknown error')}
        onProgress={handleProgress}
        controls={false}
        onEnd={() => {
          // Auto-restart when video ends
          videoRef.current?.seek(0);
          setIsPlaying(true);
        }}
      />

      {/* Loading indicator */}
      <Animated.View style={[styles.loadingContainer, loadingAnimatedStyle]}>
        <ActivityIndicator size="large" color={currentTheme.colors.primary} />
      </Animated.View>

      {/* Video controls overlay */}
      <TouchableOpacity 
        style={styles.videoOverlay} 
        onPress={handleVideoPress}
        activeOpacity={1}
      >
        <Animated.View style={[styles.controlsContainer, controlsAnimatedStyle]}>
          {/* Top gradient */}
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent']}
            style={styles.topGradient}
            pointerEvents="none"
          />

          {/* Center play/pause button */}
          <View style={styles.centerControls}>
            <Animated.View style={playButtonAnimatedStyle}>
              <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
                <MaterialIcons 
                  name={isPlaying ? 'pause' : 'play-arrow'} 
                  size={isTablet ? 64 : 48} 
                  color="white" 
                />
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Bottom controls */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.bottomGradient}
          >
            <View style={styles.bottomControls}>
              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[styles.progressFill, { width: `${progressPercentage}%` }]} 
                  />
                </View>
              </View>

              {/* Control buttons */}
              <View style={styles.controlButtons}>
                <TouchableOpacity style={styles.controlButton} onPress={handlePlayPause}>
                  <MaterialIcons 
                    name={isPlaying ? 'pause' : 'play-arrow'} 
                    size={isTablet ? 32 : 24} 
                    color="white" 
                  />
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.controlButton} onPress={handleMuteToggle}>
                  <MaterialIcons 
                    name={isMuted ? 'volume-off' : 'volume-up'} 
                    size={isTablet ? 32 : 24} 
                    color="white" 
                  />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  controlsContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topGradient: {
    height: 100,
    width: '100%',
  },
  centerControls: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: isTablet ? 100 : 80,
    height: isTablet ? 100 : 80,
    borderRadius: isTablet ? 50 : 40,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  bottomGradient: {
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    paddingTop: 20,
  },
  bottomControls: {
    paddingHorizontal: isTablet ? 32 : 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 1.5,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});

export default TrailerPlayer;