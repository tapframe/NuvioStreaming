import React, { useCallback, memo } from 'react';
import { View, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { PinchGestureHandler } from 'react-native-gesture-handler';
import MpvPlayer, { MpvPlayerRef } from '../MpvPlayer';
import { styles } from '../../utils/playerStyles';
import { ResizeModeType } from '../../utils/playerTypes';

interface VideoSurfaceProps {
    processedStreamUrl: string;
    headers?: { [key: string]: string };
    volume: number;
    playbackSpeed: number;
    resizeMode: ResizeModeType;
    paused: boolean;
    currentStreamUrl: string;

    // Callbacks
    toggleControls: () => void;
    onLoad: (data: any) => void;
    onProgress: (data: any) => void;
    onSeek: (data: any) => void;
    onEnd: () => void;
    onError: (err: any) => void;
    onBuffer: (buf: any) => void;

    // Refs
    mpvPlayerRef?: React.RefObject<MpvPlayerRef>;
    pinchRef: any;

    // Handlers
    onPinchGestureEvent: any;
    onPinchHandlerStateChange: any;
    screenDimensions: { width: number, height: number };
    onTracksChanged?: (data: { audioTracks: any[]; subtitleTracks: any[] }) => void;
}

export const VideoSurface: React.FC<VideoSurfaceProps> = ({
    processedStreamUrl,
    headers,
    volume,
    playbackSpeed,
    resizeMode,
    paused,
    currentStreamUrl,
    toggleControls,
    onLoad,
    onProgress,
    onSeek,
    onEnd,
    onError,
    onBuffer,
    mpvPlayerRef,
    pinchRef,
    onPinchGestureEvent,
    onPinchHandlerStateChange,
    screenDimensions,
    onTracksChanged,
}) => {
    // Use the actual stream URL
    const streamUrl = currentStreamUrl || processedStreamUrl;

    // Debug logging removed to prevent console spam

    const handleLoad = (data: { duration: number; width: number; height: number }) => {
        console.log('[VideoSurface] onLoad received:', data);
        onLoad({
            duration: data.duration,
            naturalSize: {
                width: data.width,
                height: data.height,
            },
        });
    };

    const handleProgress = (data: { currentTime: number; duration: number }) => {
        onProgress({
            currentTime: data.currentTime,
            playableDuration: data.currentTime,
        });
    };

    const handleError = (error: { error: string }) => {
        console.log('[VideoSurface] onError received:', error);
        onError({
            error: {
                errorString: error.error,
            },
        });
    };

    const handleEnd = () => {
        console.log('[VideoSurface] onEnd received');
        onEnd();
    };

    return (
        <View style={[styles.videoContainer, {
            width: screenDimensions.width,
            height: screenDimensions.height,
        }]}>
            {/* MPV Player - rendered at the bottom of the z-order */}
            <MpvPlayer
                ref={mpvPlayerRef}
                source={streamUrl}
                headers={headers}
                paused={paused}
                volume={volume}
                rate={playbackSpeed}
                resizeMode={resizeMode === 'none' ? 'contain' : resizeMode}
                style={localStyles.player}
                onLoad={handleLoad}
                onProgress={handleProgress}
                onEnd={handleEnd}
                onError={handleError}
                onTracksChanged={onTracksChanged}
            />

            {/* Gesture overlay - transparent, on top of the player */}
            <PinchGestureHandler
                ref={pinchRef}
                onGestureEvent={onPinchGestureEvent}
                onHandlerStateChange={onPinchHandlerStateChange}
            >
                <View style={localStyles.gestureOverlay} pointerEvents="box-only">
                    <TouchableWithoutFeedback onPress={toggleControls}>
                        <View style={localStyles.touchArea} />
                    </TouchableWithoutFeedback>
                </View>
            </PinchGestureHandler>
        </View>
    );
};

const localStyles = StyleSheet.create({
    player: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    gestureOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    touchArea: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
