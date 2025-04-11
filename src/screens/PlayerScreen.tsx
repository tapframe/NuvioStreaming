import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
  SafeAreaView
} from 'react-native';
import Video from 'react-native-video';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

interface PlayerParams {
  id: string;
  type: string;
  title?: string;
  poster?: string;
  stream?: string;
}

const PlayerScreen = () => {
  const route = useRoute<RouteProp<Record<string, PlayerParams>, string>>();
  const navigation = useNavigation();
  const { id, type, title, poster, stream } = route.params;
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  
  // Use any for now to fix the type error
  const videoRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide controls after a delay
  useEffect(() => {
    if (controlsVisible) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
    
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [controlsVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => setIsPlaying(false);
  }, []);

  const toggleControls = () => {
    setControlsVisible(!controlsVisible);
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.seek(time);
    }
  };

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    let result = '';
    if (h > 0) {
      result += `${h}:${m < 10 ? '0' : ''}`;
    }
    result += `${m}:${s < 10 ? '0' : ''}${s}`;
    
    return result;
  };

  const handleLoad = (data: any) => {
    setDuration(data.duration);
    setIsLoading(false);
  };

  const handleProgress = (data: any) => {
    setCurrentTime(data.currentTime);
  };

  const handleEnd = () => {
    setIsPlaying(false);
    setCurrentTime(duration);
  };

  const handleError = (err: any) => {
    setError(err.error?.errorString || 'Failed to load video');
    setIsLoading(false);
  };

  const GoBackButton = () => (
    <TouchableOpacity 
      style={styles.backButton}
      onPress={() => navigation.goBack()}
    >
      <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
    </TouchableOpacity>
  );

  const Controls = () => (
    <View style={styles.controlsContainer}>
      <View style={styles.controlsHeader}>
        <GoBackButton />
        <Text style={styles.videoTitle}>{title || 'Video Player'}</Text>
      </View>
      
      <View style={styles.controlsCenter}>
        <TouchableOpacity 
          style={styles.playPauseButton}
          onPress={togglePlayPause}
        >
          <MaterialIcons 
            name={isPlaying ? 'pause' : 'play-arrow'} 
            size={48} 
            color="#FFFFFF" 
          />
        </TouchableOpacity>
      </View>
      
      <View style={styles.controlsBottom}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${(currentTime / duration) * 100}%` }
            ]} 
          />
          <View 
            style={[
              styles.progressKnob, 
              { left: `${(currentTime / duration) * 100}%` }
            ]} 
          />
        </View>
        
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );

  if (!stream) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <GoBackButton />
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#E50914" />
          <Text style={styles.errorText}>No stream URL provided</Text>
          <TouchableOpacity 
            style={styles.errorButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={toggleControls}
      >
        <Video
          ref={videoRef}
          source={{ uri: stream }}
          style={styles.video}
          resizeMode="contain"
          poster={poster}
          paused={!isPlaying}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onEnd={handleEnd}
          onError={handleError}
          repeat={false}
          playInBackground={false}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
          fullscreen={false}
          progressUpdateInterval={500}
        />
        
        {isLoading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#E50914" />
          </View>
        )}
        
        {error && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={64} color="#E50914" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity 
              style={styles.errorButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.errorButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {controlsVisible && !error && <Controls />}
      </TouchableOpacity>
    </View>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'space-between',
  },
  controlsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  controlsCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 16,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 14,
    width: 50,
  },
  progressBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 8,
    borderRadius: 2,
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  progressKnob: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E50914',
    position: 'absolute',
    top: -4,
    marginLeft: -6,
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 20,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  errorButton: {
    backgroundColor: '#E50914',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default PlayerScreen; 