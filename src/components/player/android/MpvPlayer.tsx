import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, requireNativeComponent, Platform, UIManager, findNodeHandle } from 'react-native';

// Only available on Android
const MpvPlayerNative = Platform.OS === 'android'
    ? requireNativeComponent<any>('MpvPlayer')
    : null;

export interface MpvPlayerRef {
    seek: (positionSeconds: number) => void;
    setAudioTrack: (trackId: number) => void;
    setSubtitleTrack: (trackId: number) => void;
}

export interface MpvPlayerProps {
    source: string;
    paused?: boolean;
    volume?: number;
    rate?: number;
    style?: any;
    onLoad?: (data: { duration: number; width: number; height: number }) => void;
    onProgress?: (data: { currentTime: number; duration: number }) => void;
    onEnd?: () => void;
    onError?: (error: { error: string }) => void;
}

const MpvPlayer = forwardRef<MpvPlayerRef, MpvPlayerProps>((props, ref) => {
    const nativeRef = useRef<any>(null);

    const dispatchCommand = useCallback((commandName: string, args: any[] = []) => {
        if (nativeRef.current && Platform.OS === 'android') {
            const handle = findNodeHandle(nativeRef.current);
            if (handle) {
                UIManager.dispatchViewManagerCommand(
                    handle,
                    commandName,
                    args
                );
            }
        }
    }, []);

    useImperativeHandle(ref, () => ({
        seek: (positionSeconds: number) => {
            dispatchCommand('seek', [positionSeconds]);
        },
        setAudioTrack: (trackId: number) => {
            dispatchCommand('setAudioTrack', [trackId]);
        },
        setSubtitleTrack: (trackId: number) => {
            dispatchCommand('setSubtitleTrack', [trackId]);
        },
    }), [dispatchCommand]);

    if (Platform.OS !== 'android' || !MpvPlayerNative) {
        // Fallback for iOS or if native component is not available
        return (
            <View style={[styles.container, props.style, { backgroundColor: 'black' }]} />
        );
    }

    // Debug logging removed to prevent console spam

    const handleLoad = (event: any) => {
        console.log('[MpvPlayer] Native onLoad event:', event?.nativeEvent);
        props.onLoad?.(event?.nativeEvent);
    };

    const handleProgress = (event: any) => {
        props.onProgress?.(event?.nativeEvent);
    };

    const handleEnd = (event: any) => {
        console.log('[MpvPlayer] Native onEnd event');
        props.onEnd?.();
    };

    const handleError = (event: any) => {
        console.log('[MpvPlayer] Native onError event:', event?.nativeEvent);
        props.onError?.(event?.nativeEvent);
    };

    return (
        <MpvPlayerNative
            ref={nativeRef}
            style={[styles.container, props.style]}
            source={props.source}
            paused={props.paused ?? true}
            volume={props.volume ?? 1.0}
            rate={props.rate ?? 1.0}
            onLoad={handleLoad}
            onProgress={handleProgress}
            onEnd={handleEnd}
            onError={handleError}
        />
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
});

MpvPlayer.displayName = 'MpvPlayer';

export default MpvPlayer;
