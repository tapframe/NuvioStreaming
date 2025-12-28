/**
 * Video compatibility wrapper
 * Handles both Web and Native platforms
 */
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Platform, View, StyleSheet, ImageProps, ViewStyle } from 'react-native';
// Use require for the native module to prevent web bundlers from choking on it if it's not web-compatible
let VideoOriginal: any;
let VideoRefType: any = Object;

if (Platform.OS !== 'web') {
    try {
        const VideoModule = require('react-native-video');
        VideoOriginal = VideoModule.default;
        VideoRefType = VideoModule.VideoRef;
    } catch (e) {
        VideoOriginal = View;
    }
} else {
    VideoOriginal = View;
}

// Define types locally or assume any to avoid import errors
export type VideoRef = any;
export type OnLoadData = any;
export type OnProgressData = any;

const isWeb = Platform.OS === 'web';

// Web Video Implementation
const WebVideo = forwardRef<any, any>(({
    source,
    style,
    resizeMode,
    paused,
    muted,
    volume,
    onLoad,
    onProgress,
    onEnd,
    onError,
    repeat,
    controls,
    ...props
}, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => ({
        seek: (time: number) => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
            }
        },
        presentFullscreenPlayer: () => {
            if (videoRef.current?.requestFullscreen) {
                videoRef.current.requestFullscreen();
            } else if ((videoRef.current as any)?.webkitEnterFullscreen) {
                (videoRef.current as any).webkitEnterFullscreen();
            }
        },
        dismissFullscreenPlayer: () => {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        },
    }));

    useEffect(() => {
        if (videoRef.current) {
            if (paused) {
                videoRef.current.pause();
            } else {
                const playPromise = videoRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // Auto-play was prevented
                        // console.log('Auto-play prevent', error);
                    });
                }
            }
        }
    }, [paused]);

    useEffect(() => {
        if (videoRef.current && volume !== undefined) {
            videoRef.current.volume = volume;
        }
    }, [volume]);

    useEffect(() => {
        if (videoRef.current && muted !== undefined) {
            videoRef.current.muted = muted;
        }
    }, [muted]);

    const uri = source?.uri || '';

    // Map resizeMode to object-fit
    const objectFit = resizeMode === 'contain' ? 'contain' : 'cover';

    return (
        <video
            ref={videoRef}
            src={uri}
            style={{
                width: '100%',
                height: '100%',
                objectFit,
                ...(StyleSheet.flatten(style) as any),
            }}
            loop={repeat}
            controls={controls}
            onLoadedMetadata={(e) => {
                if (onLoad) {
                    onLoad({
                        duration: (e.target as HTMLVideoElement).duration,
                        currentTime: (e.target as HTMLVideoElement).currentTime,
                        naturalSize: {
                            width: (e.target as HTMLVideoElement).videoWidth,
                            height: (e.target as HTMLVideoElement).videoHeight,
                            orientation: 'landscape',
                        },
                        canPlayFastForward: true,
                        canPlaySlowForward: true,
                        canPlaySlowReverse: true,
                        canPlayReverse: true,
                        canStepBackward: true,
                        canStepForward: true,
                    });
                }
            }}
            onTimeUpdate={(e) => {
                if (onProgress) {
                    onProgress({
                        currentTime: (e.target as HTMLVideoElement).currentTime,
                        playableDuration: (e.target as HTMLVideoElement).duration,
                        seekableDuration: (e.target as HTMLVideoElement).duration,
                    });
                }
            }}
            onEnded={onEnd}
            onError={onError}
            muted={muted} // attribute for initial render
            {...props}
        />
    );
});

WebVideo.displayName = 'WebVideo';

// Component Implementation
const VideoCompat = forwardRef<any, any>((props, ref) => {
    if (isWeb) {
        return <WebVideo {...props} ref={ref} />;
    }

    // Native implementation
    const NativeVideo = VideoOriginal || View;
    return <NativeVideo {...props} ref={ref} />;
});

VideoCompat.displayName = 'VideoCompat';

export default VideoCompat;
