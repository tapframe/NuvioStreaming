import React, { forwardRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Video, { ViewType, VideoRef, ResizeMode } from 'react-native-video';
import VlcVideoPlayer, { VlcPlayerRef } from '../../VlcVideoPlayer';
import { PinchGestureHandler } from 'react-native-gesture-handler';
import { styles } from '../../utils/playerStyles';
import { logger } from '../../../../utils/logger';
import { ResizeModeType, SelectedTrack } from '../../utils/playerTypes';

const getVideoResizeMode = (resizeMode: ResizeModeType) => {
    switch (resizeMode) {
        case 'contain': return 'contain';
        case 'cover': return 'cover';
        case 'none': return 'contain';
        default: return 'contain';
    }
};

interface VideoSurfaceProps {
    useVLC: boolean;
    forceVlcRemount: boolean;
    processedStreamUrl: string;
    volume: number;
    playbackSpeed: number;
    zoomScale: number;
    resizeMode: ResizeModeType;
    paused: boolean;
    currentStreamUrl: string;
    headers: any;
    videoType: any;
    vlcSelectedAudioTrack?: number;
    vlcSelectedSubtitleTrack?: number;
    vlcRestoreTime?: number;
    vlcKey: string;
    selectedAudioTrack: any;
    selectedTextTrack: any;
    useCustomSubtitles: boolean;

    // Callbacks
    toggleControls: () => void;
    onLoad: (data: any) => void;
    onProgress: (data: any) => void;
    onSeek: (data: any) => void;
    onEnd: () => void;
    onError: (err: any) => void;
    onBuffer: (buf: any) => void;
    onTracksUpdate: (tracks: any) => void;

    // Refs
    vlcPlayerRef: React.RefObject<VlcPlayerRef>;
    videoRef: React.RefObject<VideoRef>;
    pinchRef: any;

    // Handlers
    onPinchGestureEvent: any;
    onPinchHandlerStateChange: any;
    vlcLoadedRef: React.MutableRefObject<boolean>;
    screenDimensions: { width: number, height: number };
    customVideoStyles: any;

    // Debugging
    loadStartAtRef: React.MutableRefObject<number | null>;
    firstFrameAtRef: React.MutableRefObject<number | null>;
}

export const VideoSurface: React.FC<VideoSurfaceProps> = ({
    useVLC,
    forceVlcRemount,
    processedStreamUrl,
    volume,
    playbackSpeed,
    zoomScale,
    resizeMode,
    paused,
    currentStreamUrl,
    headers,
    videoType,
    vlcSelectedAudioTrack,
    vlcSelectedSubtitleTrack,
    vlcRestoreTime,
    vlcKey,
    selectedAudioTrack,
    selectedTextTrack,
    useCustomSubtitles,
    toggleControls,
    onLoad,
    onProgress,
    onSeek,
    onEnd,
    onError,
    onBuffer,
    onTracksUpdate,
    vlcPlayerRef,
    videoRef,
    pinchRef,
    onPinchGestureEvent,
    onPinchHandlerStateChange,
    vlcLoadedRef,
    screenDimensions,
    customVideoStyles,
    loadStartAtRef,
    firstFrameAtRef
}) => {

    const isHlsStream = (url: string) => {
        return url.includes('.m3u8') || url.includes('m3u8') ||
            url.includes('hls') || url.includes('playlist') ||
            (videoType && videoType.toLowerCase() === 'm3u8');
    };

    return (
        <View style={[styles.videoContainer, {
            width: screenDimensions.width,
            height: screenDimensions.height,
        }]}>
            <PinchGestureHandler
                ref={pinchRef}
                onGestureEvent={onPinchGestureEvent}
                onHandlerStateChange={onPinchHandlerStateChange}
            >
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: screenDimensions.width,
                    height: screenDimensions.height,
                }}>
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={1}
                        onPress={toggleControls}
                    >
                        {useVLC && !forceVlcRemount ? (
                            <VlcVideoPlayer
                                ref={vlcPlayerRef}
                                source={processedStreamUrl}
                                volume={volume}
                                playbackSpeed={playbackSpeed}
                                zoomScale={zoomScale}
                                resizeMode={resizeMode}
                                onLoad={(data) => {
                                    vlcLoadedRef.current = true;
                                    onLoad(data);
                                    if (!paused && vlcPlayerRef.current) {
                                        setTimeout(() => {
                                            if (vlcPlayerRef.current) {
                                                vlcPlayerRef.current.play();
                                            }
                                        }, 100);
                                    }
                                }}
                                onProgress={onProgress}
                                onSeek={onSeek}
                                onEnd={onEnd}
                                onError={onError}
                                onTracksUpdate={onTracksUpdate}
                                selectedAudioTrack={vlcSelectedAudioTrack}
                                selectedSubtitleTrack={vlcSelectedSubtitleTrack}
                                restoreTime={vlcRestoreTime}
                                forceRemount={forceVlcRemount}
                                key={vlcKey}
                            />
                        ) : (
                            <Video
                                ref={videoRef}
                                style={[styles.video, customVideoStyles]}
                                source={{
                                    uri: currentStreamUrl,
                                    headers: headers,
                                    type: isHlsStream(currentStreamUrl) ? 'm3u8' : videoType
                                }}
                                paused={paused}
                                onLoadStart={() => {
                                    loadStartAtRef.current = Date.now();
                                }}
                                onProgress={onProgress}
                                onLoad={onLoad}
                                onReadyForDisplay={() => {
                                    firstFrameAtRef.current = Date.now();
                                }}
                                onSeek={onSeek}
                                onEnd={onEnd}
                                onError={onError}
                                onBuffer={onBuffer}
                                resizeMode={getVideoResizeMode(resizeMode)}
                                selectedAudioTrack={selectedAudioTrack || undefined}
                                selectedTextTrack={useCustomSubtitles ? { type: 'disabled' } as any : (selectedTextTrack >= 0 ? { type: 'index', value: selectedTextTrack } as any : undefined)}
                                rate={playbackSpeed}
                                volume={volume}
                                muted={false}
                                repeat={false}
                                playInBackground={false}
                                playWhenInactive={false}
                                ignoreSilentSwitch="ignore"
                                mixWithOthers="inherit"
                                progressUpdateInterval={500}
                                disableFocus={true}
                                allowsExternalPlayback={false}
                                preventsDisplaySleepDuringVideoPlayback={true}
                                viewType={Platform.OS === 'android' ? ViewType.SURFACE : undefined}
                            />
                        )}
                    </TouchableOpacity>
                </View>
            </PinchGestureHandler>
        </View>
    );
};
