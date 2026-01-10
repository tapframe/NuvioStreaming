import React, { useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { PinchGestureHandler } from 'react-native-gesture-handler';
import Video, { VideoRef, SelectedTrack, SelectedVideoTrack, ResizeMode } from 'react-native-video';
import MpvPlayer, { MpvPlayerRef } from '../MpvPlayer';
import { styles } from '../../utils/playerStyles';
import { ResizeModeType } from '../../utils/playerTypes';
import { logger } from '../../../../utils/logger';

// Codec error patterns that indicate we should fallback to MPV
const CODEC_ERROR_PATTERNS = [
    'exceeds_capabilities',
    'no_exceeds_capabilities',
    'decoder_exception',
    'decoder.*error',
    'codec.*error',
    'unsupported.*codec',
    'mediacodec.*exception',
    'omx.*error',
    'dolby.*vision',
    'hevc.*error',
    'no suitable decoder',
    'decoder initialization failed',
    'format.no_decoder',
    'no_decoder',
    'decoding_failed',
    'error_code_decoding',
    'exoplaybackexception',
    'mediacodecvideodecoder',
    'mediacodecvideodecoderexception',
    'decoder failed',
];

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
    exoPlayerRef?: React.RefObject<VideoRef>;
    pinchRef: any;

    // Handlers
    onPinchGestureEvent: any;
    onPinchHandlerStateChange: any;
    screenDimensions: { width: number, height: number };
    onTracksChanged?: (data: { audioTracks: any[]; subtitleTracks: any[] }) => void;
    selectedAudioTrack?: SelectedTrack;
    selectedTextTrack?: SelectedTrack;
    decoderMode?: 'auto' | 'sw' | 'hw' | 'hw+';
    gpuMode?: 'gpu' | 'gpu-next';

    // Dual Engine Props
    useExoPlayer?: boolean;
    onCodecError?: () => void;
    onEngineChange?: (engine: 'exoplayer' | 'mpv') => void;

    // Subtitle Styling
    subtitleSize?: number;
    subtitleColor?: string;
    subtitleBackgroundOpacity?: number;
    subtitleBorderSize?: number;
    subtitleBorderColor?: string;
    subtitleShadowEnabled?: boolean;
    subtitlePosition?: number;
    // Raw bottom offset from UI (pixels). ExoPlayer positioning works best when driven directly from px.
    subtitleBottomOffsetPx?: number;
    subtitleDelay?: number;
    subtitleAlignment?: 'left' | 'center' | 'right';
}

// Helper function to check if error is a codec error
const isCodecError = (errorString: string): boolean => {
    const lowerError = errorString.toLowerCase();
    return CODEC_ERROR_PATTERNS.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(lowerError);
    });
};

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
    exoPlayerRef,
    pinchRef,
    onPinchGestureEvent,
    onPinchHandlerStateChange,
    screenDimensions,
    onTracksChanged,
    selectedAudioTrack,
    selectedTextTrack,
    decoderMode,
    gpuMode,
    // Dual Engine
    useExoPlayer = true,
    onCodecError,
    onEngineChange,
    // Subtitle Styling
    subtitleSize,
    subtitleColor,
    subtitleBackgroundOpacity,
    subtitleBorderSize,
    subtitleBorderColor,
    subtitleShadowEnabled,
    subtitlePosition,
    subtitleBottomOffsetPx,
    subtitleDelay,
    subtitleAlignment,
}) => {
    // Use the actual stream URL
    const streamUrl = currentStreamUrl || processedStreamUrl;

    // ========== MPV Handlers ==========
    const handleMpvLoad = (data: { duration: number; width: number; height: number }) => {
        console.log('[VideoSurface] MPV onLoad received:', data);
        onLoad({
            duration: data.duration,
            naturalSize: {
                width: data.width,
                height: data.height,
            },
        });
    };

    const handleMpvProgress = (data: { currentTime: number; duration: number }) => {
        onProgress({
            currentTime: data.currentTime,
            playableDuration: data.currentTime,
        });
    };

    const handleMpvError = (error: { error: string }) => {
        console.log('[VideoSurface] MPV onError received:', error);
        onError({
            error: {
                errorString: error.error,
            },
        });
    };

    const handleMpvEnd = () => {
        console.log('[VideoSurface] MPV onEnd received');
        onEnd();
    };

    // ========== ExoPlayer Handlers ==========
    const handleExoLoad = (data: any) => {
        console.log('[VideoSurface] ExoPlayer onLoad received:', data);
        console.log('[VideoSurface] ExoPlayer textTracks raw:', JSON.stringify(data.textTracks, null, 2));

        // Extract track information
        // IMPORTANT:
        // react-native-video expects selected*Track with { type: 'index', value: <0-based array index> }.
        // Some RNVideo/Exo track objects expose `index`, but it is not guaranteed to be unique or
        // aligned with the list index. Using it can cause only the first item to render/select.
        const audioTracks = data.audioTracks?.map((t: any, i: number) => ({
            id: i,
            name: t.title || t.language || `Track ${i + 1}`,
            language: t.language,
        })) ?? [];

        const subtitleTracks = data.textTracks?.map((t: any, i: number) => {
            const track = {
                id: i,
                name: t.title || t.language || `Track ${i + 1}`,
                language: t.language,
            };
            console.log('[VideoSurface] Mapped subtitle track:', track, 'original:', t);
            return track;
        }) ?? [];

        if (onTracksChanged && (audioTracks.length > 0 || subtitleTracks.length > 0)) {
            onTracksChanged({ audioTracks, subtitleTracks });
        }

        onLoad({
            duration: data.duration,
            naturalSize: data.naturalSize || { width: 1920, height: 1080 },
            audioTracks: data.audioTracks,
            textTracks: data.textTracks,
        });
    };

    const handleExoProgress = (data: any) => {
        onProgress({
            currentTime: data.currentTime,
            playableDuration: data.playableDuration || data.currentTime,
        });
    };

    const handleExoError = (error: any) => {
        console.log('[VideoSurface] ExoPlayer onError received:', JSON.stringify(error, null, 2));

        // Extract error string - try multiple paths
        let errorString = 'Unknown error';
        const errorParts: string[] = [];

        if (typeof error?.error === 'string') {
            errorParts.push(error.error);
        }
        if (error?.error?.errorString) {
            errorParts.push(error.error.errorString);
        }
        if (error?.error?.errorCode) {
            errorParts.push(String(error.error.errorCode));
        }
        if (typeof error === 'string') {
            errorParts.push(error);
        }
        if (error?.nativeStackAndroid) {
            errorParts.push(error.nativeStackAndroid.join(' '));
        }
        if (error?.message) {
            errorParts.push(error.message);
        }

        // Combine all error parts for comprehensive checking
        errorString = errorParts.length > 0 ? errorParts.join(' ') : JSON.stringify(error);

        console.log('[VideoSurface] Extracted error string:', errorString);
        console.log('[VideoSurface] isCodecError result:', isCodecError(errorString));

        // Check if this is a codec error that should trigger fallback
        if (isCodecError(errorString)) {
            logger.warn('[VideoSurface] ExoPlayer codec error detected, triggering MPV fallback:', errorString);
            onCodecError?.();
            return; // Don't propagate codec errors - we're falling back silently
        }

        // Non-codec errors should be propagated
        onError({
            error: {
                errorString: errorString,
            },
        });
    };

    const handleExoBuffer = (data: any) => {
        onBuffer({ isBuffering: data.isBuffering });
    };

    const handleExoEnd = () => {
        console.log('[VideoSurface] ExoPlayer onEnd received');
        onEnd();
    };

    const handleExoSeek = (data: any) => {
        onSeek({ currentTime: data.currentTime });
    };

    // Map ResizeModeType to react-native-video ResizeMode
    const getExoResizeMode = (): ResizeMode => {
        switch (resizeMode) {
            case 'cover':
                return ResizeMode.COVER;
            case 'stretch':
                return ResizeMode.STRETCH;
            case 'contain':
            default:
                return ResizeMode.CONTAIN;
        }
    };

    const alphaHex = (opacity01: number) => {
        const a = Math.max(0, Math.min(1, opacity01));
        return Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
    };

    return (
        <View style={[styles.videoContainer, {
            width: screenDimensions.width,
            height: screenDimensions.height,
        }]}>
            {useExoPlayer ? (
                /* ExoPlayer via react-native-video */
                <Video
                    ref={exoPlayerRef}
                    source={{
                        uri: streamUrl,
                        headers: headers,
                    }}
                    paused={paused}
                    volume={volume}
                    rate={playbackSpeed}
                    resizeMode={getExoResizeMode()}
                    selectedAudioTrack={selectedAudioTrack}
                    selectedTextTrack={selectedTextTrack}
                    style={localStyles.player}
                    onLoad={handleExoLoad}
                    onProgress={handleExoProgress}
                    onEnd={handleExoEnd}
                    onError={handleExoError}
                    onBuffer={handleExoBuffer}
                    onSeek={handleExoSeek}
                    progressUpdateInterval={500}
                    playInBackground={false}
                    playWhenInactive={false}
                    ignoreSilentSwitch="ignore"
                    automaticallyWaitsToMinimizeStalling={true}
                    useTextureView={true}
                    // Subtitle Styling for ExoPlayer
                    // ExoPlayer (via our patched react-native-video) supports:
                    // - fontSize, paddingTop/Bottom/Left/Right, opacity, subtitlesFollowVideo
                    // - PLUS: textColor, backgroundColor, edgeType, edgeColor (outline/shadow)
                    subtitleStyle={{
                        // Convert MPV-scaled size back to ExoPlayer scale (~1.5x conversion was applied)
                        fontSize: subtitleSize ? Math.round(subtitleSize / 1.5) : 18,
                        paddingTop: 0,
                        // Drive ExoPlayer subtitle placement directly via px offset.
                        // Native will convert this into bottomPaddingFraction after layout.
                        paddingBottom: typeof subtitleBottomOffsetPx === 'number'
                            ? Math.max(0, Math.round(subtitleBottomOffsetPx))
                            : 0,
                        paddingLeft: 16,
                        paddingRight: 16,
                        // Opacity controls entire subtitle view visibility
                        // Always keep text visible (opacity 1), background control is limited in ExoPlayer
                        opacity: 1,
                        subtitlesFollowVideo: false,
                        // Extended styling (requires our patched RNVideo on Android)
                        textColor: subtitleColor || '#FFFFFFFF',
                        // Android Color.parseColor doesn't accept rgba(...). Use #AARRGGBB.
                        backgroundColor:
                            subtitleBackgroundOpacity && subtitleBackgroundOpacity > 0
                                ? `#${alphaHex(subtitleBackgroundOpacity)}000000`
                                : '#00000000',
                        edgeType:
                            subtitleBorderSize && subtitleBorderSize > 0
                                ? 'outline'
                                : (subtitleShadowEnabled ? 'shadow' : 'none'),
                        edgeColor:
                            (subtitleBorderSize && subtitleBorderSize > 0 && subtitleBorderColor)
                                ? subtitleBorderColor
                                : (subtitleShadowEnabled ? '#FF000000' : 'transparent'),
                    } as any}
                />
            ) : (
                /* MPV Player fallback */
                <MpvPlayer
                    ref={mpvPlayerRef}
                    source={streamUrl}
                    headers={headers}
                    paused={paused}
                    volume={volume}
                    rate={playbackSpeed}
                    resizeMode={resizeMode === 'none' ? 'contain' : resizeMode}
                    style={localStyles.player}
                    onLoad={handleMpvLoad}
                    onProgress={handleMpvProgress}
                    onEnd={handleMpvEnd}
                    onError={handleMpvError}
                    onTracksChanged={onTracksChanged}
                    decoderMode={decoderMode}
                    gpuMode={gpuMode}
                    // Subtitle Styling
                    subtitleSize={subtitleSize}
                    subtitleColor={subtitleColor}
                    subtitleBackgroundOpacity={subtitleBackgroundOpacity}
                    subtitleBorderSize={subtitleBorderSize}
                    subtitleBorderColor={subtitleBorderColor}
                    subtitleShadowEnabled={subtitleShadowEnabled}
                    subtitlePosition={subtitlePosition}
                    subtitleDelay={subtitleDelay}
                    subtitleAlignment={subtitleAlignment}
                />
            )}

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
