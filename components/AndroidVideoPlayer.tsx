import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Video, { VideoRef, SelectedTrack, BufferingStrategyType, ResizeMode } from 'react-native-video';

interface VideoPlayerProps {
  src: string;
  paused: boolean;
  volume: number;
  currentTime: number;
  selectedAudioTrack?: SelectedTrack;
  selectedTextTrack?: SelectedTrack;
  resizeMode?: ResizeMode;
  onProgress?: (data: { currentTime: number; playableDuration: number }) => void;
  onLoad?: (data: { duration: number }) => void;
  onError?: (error: any) => void;
  onBuffer?: (data: { isBuffering: boolean }) => void;
  onSeek?: (data: { currentTime: number; seekTime: number }) => void;
  onEnd?: () => void;
}

export const AndroidVideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  paused,
  volume,
  currentTime,
  selectedAudioTrack,
  selectedTextTrack,
  resizeMode = 'contain' as ResizeMode,
  onProgress,
  onLoad,
  onError,
  onBuffer,
  onSeek,
  onEnd,
}) => {
  const videoRef = useRef<VideoRef>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [lastSeekTime, setLastSeekTime] = useState<number>(0);

  // Only render on Android
  if (Platform.OS !== 'android') {
    return null;
  }

  useEffect(() => {
    if (isLoaded && !isSeeking && Math.abs(currentTime - lastSeekTime) > 1) {
      setIsSeeking(true);
      videoRef.current?.seek(currentTime);
      setLastSeekTime(currentTime);
    }
  }, [currentTime, isLoaded, isSeeking, lastSeekTime]);

  const handleLoad = (data: any) => {
    setIsLoaded(true);
    onLoad?.(data);
  };

  const handleProgress = (data: any) => {
    if (!isSeeking) {
      onProgress?.(data);
    }
  };

  const handleSeek = (data: any) => {
    setIsSeeking(false);
    onSeek?.(data);
  };

  const handleBuffer = (data: any) => {
    onBuffer?.(data);
  };

  const handleError = (error: any) => {
    console.error('Video playback error:', error);
    onError?.(error);
  };

  const handleEnd = () => {
    onEnd?.();
  };

  return (
    <Video
      ref={videoRef}
      source={{ uri: src }}
      style={{ flex: 1 }}
      paused={paused}
      volume={volume}
      selectedAudioTrack={selectedAudioTrack}
      selectedTextTrack={selectedTextTrack}
      onLoad={handleLoad}
      onProgress={handleProgress}
      onSeek={handleSeek}
      onBuffer={handleBuffer}
      onError={handleError}
      onEnd={handleEnd}
      resizeMode={resizeMode}
      controls={false}
      playInBackground={false}
      playWhenInactive={false}
      progressUpdateInterval={250}
      allowsExternalPlayback={false}
      bufferingStrategy={BufferingStrategyType.DEFAULT}
      ignoreSilentSwitch="ignore"
      mixWithOthers="inherit"
      rate={1.0}
      repeat={false}
      reportBandwidth={true}
      textTracks={[]}
      useTextureView={false}
      disableFocus={false}
      minLoadRetryCount={3}
      automaticallyWaitsToMinimizeStalling={true}
      hideShutterView={false}
      shutterColor="#000000"
    />
  );
};

export default AndroidVideoPlayer; 