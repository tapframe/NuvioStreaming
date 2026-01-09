import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { requireNativeComponent, UIManager, findNodeHandle, ViewStyle } from 'react-native';

interface MPVPlayerProps {
    source?: {
        uri: string;
        headers?: Record<string, string>;
    };
    paused?: boolean;
    volume?: number;
    rate?: number;
    style?: ViewStyle;
    onLoad?: (event: any) => void;
    onProgress?: (event: any) => void;
    onEnd?: (event: any) => void;
    onError?: (event: any) => void;
}

export interface MPVPlayerRef {
    seek: (time: number) => void;
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
    }));

    return (
        <MPVPlayerView
            ref={nativeRef}
            {...props}
            onLoad={(e: any) => props.onLoad?.(e.nativeEvent)}
            onProgress={(e: any) => props.onProgress?.(e.nativeEvent)}
            onEnd={(e: any) => props.onEnd?.(e.nativeEvent)}
            onError={(e: any) => props.onError?.(e.nativeEvent)}
        />
    );
});

export default MPVPlayerComponent;
