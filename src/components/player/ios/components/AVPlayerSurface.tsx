import React, { useRef } from 'react';
import { Animated } from 'react-native';
import { PinchGestureHandler, PinchGestureHandlerGestureEvent, State } from 'react-native-gesture-handler';
import Video, { VideoRef, SelectedTrack } from 'react-native-video';

interface AVPlayerSurfaceProps {
  videoRef: React.RefObject<VideoRef>;
  uri: string;
  headers?: Record<string, string>;
  paused: boolean;
  volume: number;
  playbackSpeed: number;
  resizeMode: 'contain' | 'cover' | 'stretch';
  zoomScale: number;
  setZoomScale: (scale: number) => void;
  lastZoomScale: number;
  setLastZoomScale: (scale: number) => void;

  // Tracks (react-native-video style)
  selectedAudioTrack?: SelectedTrack;
  selectedTextTrack?: SelectedTrack;

  // Events
  onLoad: (data: any) => void;
  onProgress: (data: any) => void;
  onEnd: () => void;
  onError: (error: any) => void;
  onBuffer: (isBuffering: boolean) => void;

  // Dimensions
  screenWidth: number;
  screenHeight: number;
  customVideoStyles: any;
}

export const AVPlayerSurface: React.FC<AVPlayerSurfaceProps> = ({
  videoRef,
  uri,
  headers,
  paused,
  volume,
  playbackSpeed,
  resizeMode,
  zoomScale,
  setZoomScale,
  lastZoomScale,
  setLastZoomScale,
  selectedAudioTrack,
  selectedTextTrack,
  onLoad,
  onProgress,
  onEnd,
  onError,
  onBuffer,
  screenWidth,
  screenHeight,
  customVideoStyles,
}) => {
  const pinchRef = useRef<PinchGestureHandler>(null);

  const onPinchGestureEvent = (event: PinchGestureHandlerGestureEvent) => {
    const { scale } = event.nativeEvent;
    const newScale = Math.max(1, Math.min(lastZoomScale * scale, 1.1));
    setZoomScale(newScale);
  };

  const onPinchHandlerStateChange = (event: PinchGestureHandlerGestureEvent) => {
    if (event.nativeEvent.state === State.END) {
      setLastZoomScale(zoomScale);
    }
  };

  const handleLoad = (data: any) => {
    onLoad(data);
  };

  const handleProgress = (data: any) => {
    // Match iOS player expected shape (KSPlayerCore reads currentTime + buffered)
    onProgress({
      currentTime: data?.currentTime ?? 0,
      buffered: data?.playableDuration ?? 0,
    });
  };

  return (
    <PinchGestureHandler
      ref={pinchRef}
      onGestureEvent={onPinchGestureEvent}
      onHandlerStateChange={onPinchHandlerStateChange}
    >
      <Animated.View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: zoomScale }]
      }}>
        <Video
          ref={videoRef}
          source={{ uri, headers: headers || {} }}
          style={customVideoStyles.width ? customVideoStyles : { width: screenWidth, height: screenHeight }}
          paused={paused}
          volume={volume}
          rate={playbackSpeed}
          resizeMode={resizeMode as any}
          allowsExternalPlayback={true}
          // iOS PiP: enter PiP automatically when user leaves the app (home/app switcher)
          // Docs: https://docs.thewidlarzgroup.com/react-native-video/docs/v6/component/props/#enterpictureinpictureonleave
          enterPictureInPictureOnLeave={true}
          selectedAudioTrack={selectedAudioTrack}
          selectedTextTrack={selectedTextTrack}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onEnd={onEnd}
          onError={onError}
          onBuffer={(b: any) => onBuffer(!!b?.isBuffering)}
          // 250ms progress updates can cause excessive JS work and device heating.
          // We throttle UI updates in JS anyway; a slightly higher interval reduces event pressure.
          progressUpdateInterval={500}
          // Keep background behavior consistent with the rest of the player logic
          playInBackground={false}
          playWhenInactive={true}
          ignoreSilentSwitch="ignore"
        />
      </Animated.View>
    </PinchGestureHandler>
  );
};

export default AVPlayerSurface;

