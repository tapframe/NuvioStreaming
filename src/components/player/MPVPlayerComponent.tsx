import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { requireNativeComponent, UIManager, findNodeHandle, ViewStyle } from 'react-native';

interface MPVPlayerProps {
    source?: {
        uri: string;
        headers?: Record<string, string>;
    };
    paused?: boolean;
    volume?: number;
    rate?: number;
    audioTrack?: number;
    textTrack?: number;
    resizeMode?: 'contain' | 'cover' | 'stretch';
    subtitleTextColor?: string;
    subtitleBackgroundColor?: string;
    subtitleFontSize?: number;
    subtitleBottomOffset?: number;
    style?: ViewStyle;
    onLoad?: (event: any) => void;
    onProgress?: (event: any) => void;
    onEnd?: (event: any) => void;
    onError?: (event: any) => void;
    onAudioTracks?: (event: any) => void;
    onTextTracks?: (event: any) => void;
}

export interface MPVPlayerRef {
    seek: (time: number) => void;
    setAudioTrack: (trackId: number) => void;
    setTextTrack: (trackId: number) => void;
}

const ComponentName = 'MPVPlayerView';
const MPVPlayerView = requireNativeComponent<MPVPlayerProps>(ComponentName);

const MPVPlayerComponent = forwardRef<MPVPlayerRef, MPVPlayerProps>((props, ref) => {
    const nativeRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
        seek: (time: number) => {
            if (nativeRef.current) {
                const node = findNodeHandle(nativeRef.current);
                UIManager.dispatchViewManagerCommand(
                    node,
                    // @ts-ignore
                    UIManager.getViewManagerConfig(ComponentName).Commands.seek,
                    [time]
                );
            }
        },
        setAudioTrack: (trackId: number) => {
            if (nativeRef.current) {
                const node = findNodeHandle(nativeRef.current);
                UIManager.dispatchViewManagerCommand(
                    node,
                    // @ts-ignore
                    UIManager.getViewManagerConfig(ComponentName).Commands.setAudioTrack,
                    [trackId]
                );
            }
        },
        setTextTrack: (trackId: number) => {
            if (nativeRef.current) {
                const node = findNodeHandle(nativeRef.current);
                UIManager.dispatchViewManagerCommand(
                    node,
                    // @ts-ignore
                    UIManager.getViewManagerConfig(ComponentName).Commands.setTextTrack,
                    [trackId]
                );
            }
        },
    }));

    return (
        <MPVPlayerView
            ref={nativeRef}
            {...props}
            onLoad={(e: any) => props.onLoad?.(e.nativeEvent)}
            onProgress={(e: any) => props.onProgress?.(e.nativeEvent)}
            onEnd={(e: any) => props.onEnd?.(e.nativeEvent)}
            onError={(e: any) => props.onError?.(e.nativeEvent)}
            onAudioTracks={(e: any) => props.onAudioTracks?.(e.nativeEvent)}
            onTextTracks={(e: any) => props.onTextTracks?.(e.nativeEvent)}
        />
    );
});

export default MPVPlayerComponent;
