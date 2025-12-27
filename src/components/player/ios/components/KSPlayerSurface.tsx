import React, { useRef } from 'react';
import { Animated } from 'react-native';
import { PinchGestureHandler, State, PinchGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import KSPlayerComponent, { KSPlayerRef, KSPlayerSource } from '../../KSPlayerComponent';

interface KSPlayerSurfaceProps {
    ksPlayerRef: React.RefObject<KSPlayerRef>;
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

    // Tracks - use number directly
    audioTrack?: number;
    textTrack?: number;
    onAudioTracks: (data: any) => void;
    onTextTracks: (data: any) => void;

    // Handlers
    onLoad: (data: any) => void;
    onProgress: (data: any) => void;
    onEnd: () => void;
    onError: (error: any) => void;
    onBuffer: (isBuffering: boolean) => void;
    onReadyForDisplay: () => void;
    onPlaybackStalled: () => void;
    onPlaybackResume: () => void;

    // Dimensions
    screenWidth: number;
    screenHeight: number;
    customVideoStyles: any;

    // Subtitle styling
    subtitleTextColor?: string;
    subtitleBackgroundColor?: string;
    subtitleFontSize?: number;
    subtitleBottomOffset?: number;
}

export const KSPlayerSurface: React.FC<KSPlayerSurfaceProps> = ({
    ksPlayerRef,
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
    audioTrack,
    textTrack,
    onAudioTracks,
    onTextTracks,
    onLoad,
    onProgress,
    onEnd,
    onError,
    onBuffer,
    onReadyForDisplay,
    onPlaybackStalled,
    onPlaybackResume,
    screenWidth,
    screenHeight,
    customVideoStyles,
    subtitleTextColor,
    subtitleBackgroundColor,
    subtitleFontSize,
    subtitleBottomOffset
}) => {
    const pinchRef = useRef<PinchGestureHandler>(null);

    const onPinchGestureEvent = (event: PinchGestureHandlerGestureEvent) => {
        const { scale } = event.nativeEvent;
        // Limit max zoom to 1.1x as per original logic, min 1
        const newScale = Math.max(1, Math.min(lastZoomScale * scale, 1.1));
        setZoomScale(newScale);
    };

    const onPinchHandlerStateChange = (event: PinchGestureHandlerGestureEvent) => {
        if (event.nativeEvent.state === State.END) {
            setLastZoomScale(zoomScale);
        }
    };

    // Create source object for KSPlayerComponent
    const source: KSPlayerSource = {
        uri,
        headers
    };

    // Debug: log textTrack prop changes
    React.useEffect(() => {
        console.log('[KSPlayerSurface] textTrack prop changed to:', textTrack);
    }, [textTrack]);

    // Handle buffering - KSPlayerComponent uses onBuffering callback
    const handleBuffering = (data: any) => {
        onBuffer(data?.isBuffering ?? false);
    };

    // Handle load - also extract tracks if available
    const handleLoad = (data: any) => {
        onLoad(data);
        // Extract tracks if present in load data
        if (data?.audioTracks) {
            onAudioTracks({ audioTracks: data.audioTracks });
        }
        if (data?.textTracks) {
            onTextTracks({ textTracks: data.textTracks });
        }
        // Notify ready for display
        onReadyForDisplay();
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
                <KSPlayerComponent
                    ref={ksPlayerRef}
                    source={source}
                    paused={paused}
                    volume={volume}
                    rate={playbackSpeed}
                    resizeMode={resizeMode}
                    audioTrack={audioTrack}
                    textTrack={textTrack}
                    subtitleTextColor={subtitleTextColor}
                    subtitleBackgroundColor={subtitleBackgroundColor}
                    subtitleFontSize={subtitleFontSize}
                    subtitleBottomOffset={subtitleBottomOffset}
                    onLoad={handleLoad}
                    onProgress={onProgress}
                    onBuffering={handleBuffering}
                    onEnd={onEnd}
                    onError={onError}
                    style={customVideoStyles.width ? customVideoStyles : { width: screenWidth, height: screenHeight }}
                />
            </Animated.View>
        </PinchGestureHandler>
    );
};
