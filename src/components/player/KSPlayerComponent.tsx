import React, { useRef, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import { View, requireNativeComponent, UIManager, findNodeHandle, NativeModules } from 'react-native';

export interface KSPlayerSource {
  uri: string;
  headers?: Record<string, string>;
}

interface KSPlayerViewProps {
  source?: KSPlayerSource;
  paused?: boolean;
  volume?: number;
  audioTrack?: number;
  textTrack?: number;
  allowsExternalPlayback?: boolean;
  usesExternalPlaybackWhileExternalScreenIsActive?: boolean;
  onLoad?: (data: any) => void;
  onProgress?: (data: any) => void;
  onBuffering?: (data: any) => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
  onBufferingProgress?: (data: any) => void;
  style?: any;
}

const KSPlayerViewManager = requireNativeComponent<KSPlayerViewProps>('KSPlayerView');
const KSPlayerModule = NativeModules.KSPlayerModule;

export interface KSPlayerRef {
  seek: (time: number) => void;
  setSource: (source: KSPlayerSource) => void;
  setPaused: (paused: boolean) => void;
  setVolume: (volume: number) => void;
  setAudioTrack: (trackId: number) => void;
  setTextTrack: (trackId: number) => void;
  getTracks: () => Promise<{ audioTracks: any[]; textTracks: any[] }>;
  setAllowsExternalPlayback: (allows: boolean) => void;
  setUsesExternalPlaybackWhileExternalScreenIsActive: (uses: boolean) => void;
  getAirPlayState: () => Promise<{ allowsExternalPlayback: boolean; usesExternalPlaybackWhileExternalScreenIsActive: boolean; isExternalPlaybackActive: boolean }>;
  showAirPlayPicker: () => void;
}

export interface KSPlayerProps {
  source?: KSPlayerSource;
  paused?: boolean;
  volume?: number;
  audioTrack?: number;
  textTrack?: number;
  allowsExternalPlayback?: boolean;
  usesExternalPlaybackWhileExternalScreenIsActive?: boolean;
  onLoad?: (data: any) => void;
  onProgress?: (data: any) => void;
  onBuffering?: (data: any) => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
  onBufferingProgress?: (data: any) => void;
  style?: any;
}

const KSPlayer = forwardRef<KSPlayerRef, KSPlayerProps>((props, ref) => {
  const nativeRef = useRef<any>(null);
  const [key, setKey] = useState(0); // Force re-render when source changes

  useImperativeHandle(ref, () => ({
    seek: (time: number) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.seek;
        UIManager.dispatchViewManagerCommand(node, commandId, [time]);
      }
    },
    setSource: (source: KSPlayerSource) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.setSource;
        UIManager.dispatchViewManagerCommand(node, commandId, [source]);
      }
    },
    setPaused: (paused: boolean) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.setPaused;
        UIManager.dispatchViewManagerCommand(node, commandId, [paused]);
      }
    },
    setVolume: (volume: number) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.setVolume;
        UIManager.dispatchViewManagerCommand(node, commandId, [volume]);
      }
    },
    setAudioTrack: (trackId: number) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.setAudioTrack;
        UIManager.dispatchViewManagerCommand(node, commandId, [trackId]);
      }
    },
    setTextTrack: (trackId: number) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.setTextTrack;
        UIManager.dispatchViewManagerCommand(node, commandId, [trackId]);
      }
    },
    getTracks: async () => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        return await KSPlayerModule.getTracks(node);
      }
      return { audioTracks: [], textTracks: [] };
    },
    setAllowsExternalPlayback: (allows: boolean) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.setAllowsExternalPlayback;
        UIManager.dispatchViewManagerCommand(node, commandId, [allows]);
      }
    },
    setUsesExternalPlaybackWhileExternalScreenIsActive: (uses: boolean) => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        // @ts-ignore legacy UIManager commands path for Paper
        const commandId = UIManager.getViewManagerConfig('KSPlayerView').Commands.setUsesExternalPlaybackWhileExternalScreenIsActive;
        UIManager.dispatchViewManagerCommand(node, commandId, [uses]);
      }
    },
    getAirPlayState: async () => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        return await KSPlayerModule.getAirPlayState(node);
      }
      return { allowsExternalPlayback: false, usesExternalPlaybackWhileExternalScreenIsActive: false, isExternalPlaybackActive: false };
    },
    showAirPlayPicker: () => {
      if (nativeRef.current) {
        const node = findNodeHandle(nativeRef.current);
        console.log('[KSPlayerComponent] Calling showAirPlayPicker with node:', node);
        KSPlayerModule.showAirPlayPicker(node);
      } else {
        console.log('[KSPlayerComponent] nativeRef.current is null');
      }
    },
  }));

  // No need for event listeners - events are handled through props

  // Force re-render when source changes to ensure proper reloading
  useEffect(() => {
    if (props.source) {
      setKey(prev => prev + 1);
    }
  }, [props.source?.uri]);

  return (
    <KSPlayerViewManager
      key={key}
      ref={nativeRef}
      source={props.source}
      paused={props.paused}
      volume={props.volume}
      audioTrack={props.audioTrack}
      textTrack={props.textTrack}
      allowsExternalPlayback={props.allowsExternalPlayback}
      usesExternalPlaybackWhileExternalScreenIsActive={props.usesExternalPlaybackWhileExternalScreenIsActive}
      onLoad={(e: any) => props.onLoad?.(e?.nativeEvent ?? e)}
      onProgress={(e: any) => props.onProgress?.(e?.nativeEvent ?? e)}
      onBuffering={(e: any) => props.onBuffering?.(e?.nativeEvent ?? e)}
      onEnd={() => props.onEnd?.()}
      onError={(e: any) => props.onError?.(e?.nativeEvent ?? e)}
      onBufferingProgress={(e: any) => props.onBufferingProgress?.(e?.nativeEvent ?? e)}
      style={props.style}
    />
  );
});

KSPlayer.displayName = 'KSPlayer';

export default KSPlayer;
