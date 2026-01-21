import { useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { PanGestureHandlerGestureEvent, State } from 'react-native-gesture-handler';
import * as Brightness from 'expo-brightness';

interface GestureControlConfig {
  volume: number;
  setVolume: (value: number) => void;
  brightness: number;
  setBrightness: (value: number) => void;
  volumeRange?: { min: number; max: number }; // Default: { min: 0, max: 1 }
  volumeSensitivity?: number; // Default: 0.006 (iOS), 0.0084 (Android with 1.4x multiplier)
  brightnessSensitivity?: number; // Default: 0.004 (iOS), 0.0056 (Android with 1.4x multiplier)
  overlayTimeout?: number; // Default: 1500ms
  debugMode?: boolean;
}

export const usePlayerGestureControls = (config: GestureControlConfig) => {
  // State for overlays
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const [showBrightnessOverlay, setShowBrightnessOverlay] = useState(false);
  const [showResizeModeOverlay, setShowResizeModeOverlay] = useState(false);
  
  // Animated values
  const volumeGestureTranslateY = useRef(new Animated.Value(0)).current;
  const brightnessGestureTranslateY = useRef(new Animated.Value(0)).current;
  const volumeOverlayOpacity = useRef(new Animated.Value(0)).current;
  const brightnessOverlayOpacity = useRef(new Animated.Value(0)).current;
  const resizeModeOverlayOpacity = useRef(new Animated.Value(0)).current;
  
  // Tracking refs
  const lastVolumeGestureY = useRef(0);
  const lastBrightnessGestureY = useRef(0);
  const volumeOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const brightnessOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  const resizeModeOverlayTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Extract config with defaults and platform adjustments
  const volumeRange = config.volumeRange || { min: 0, max: 1 };
  const baseVolumeSensitivity = config.volumeSensitivity || 0.006;
  const baseBrightnessSensitivity = config.brightnessSensitivity || 0.004;
  const overlayTimeout = config.overlayTimeout || 1500;
  
  // Platform-specific sensitivity adjustments
  // Android needs higher sensitivity due to different touch handling
  const platformMultiplier = Platform.OS === 'android' ? 1.6 : 1.0;
  const volumeSensitivity = baseVolumeSensitivity * platformMultiplier;
  const brightnessSensitivity = baseBrightnessSensitivity * platformMultiplier;
  
  // Volume gesture handler
  const onVolumeGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: volumeGestureTranslateY } }],
    { 
      useNativeDriver: false,
      listener: (event: PanGestureHandlerGestureEvent) => {
        const { translationY, state } = event.nativeEvent;
        
        if (state === State.ACTIVE) {
          // Auto-initialize on first active frame
          if (Math.abs(translationY) < 5 && Math.abs(lastVolumeGestureY.current - translationY) > 20) {
            lastVolumeGestureY.current = translationY;
            return;
          }
          
          // Calculate delta from last position
          const deltaY = -(translationY - lastVolumeGestureY.current);
          lastVolumeGestureY.current = translationY;
          
          // Normalize sensitivity based on volume range
          const rangeMultiplier = volumeRange.max - volumeRange.min;
          const volumeChange = deltaY * volumeSensitivity * rangeMultiplier;
          const newVolume = Math.max(volumeRange.min, Math.min(volumeRange.max, config.volume + volumeChange));
          
          config.setVolume(newVolume);
          
          if (config.debugMode) {
            console.log(`[GestureControls] Volume set to: ${newVolume} (Platform: ${Platform.OS}, Sensitivity: ${volumeSensitivity})`);
          }
          
          // Show overlay
          if (!showVolumeOverlay) {
            setShowVolumeOverlay(true);
            volumeOverlayOpacity.setValue(1);
          }
          
          // Reset hide timer
          if (volumeOverlayTimeout.current) {
            clearTimeout(volumeOverlayTimeout.current);
          }
          volumeOverlayTimeout.current = setTimeout(() => {
            Animated.timing(volumeOverlayOpacity, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }).start(() => setShowVolumeOverlay(false));
          }, overlayTimeout);
        }
      }
    }
  );
  
  // Brightness gesture handler
  const onBrightnessGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: brightnessGestureTranslateY } }],
    { 
      useNativeDriver: false,
      listener: (event: PanGestureHandlerGestureEvent) => {
        const { translationY, state } = event.nativeEvent;
        
        if (state === State.ACTIVE) {
          // Auto-initialize
          if (Math.abs(translationY) < 5 && Math.abs(lastBrightnessGestureY.current - translationY) > 20) {
            lastBrightnessGestureY.current = translationY;
            return;
          }
          
          const deltaY = -(translationY - lastBrightnessGestureY.current);
          lastBrightnessGestureY.current = translationY;
          
          const brightnessChange = deltaY * brightnessSensitivity;
          const newBrightness = Math.max(0, Math.min(1, config.brightness + brightnessChange));
          
          config.setBrightness(newBrightness);
          Brightness.setBrightnessAsync(newBrightness).catch(() => {});
          
          if (config.debugMode) {
            console.log(`[GestureControls] Device brightness set to: ${newBrightness} (Platform: ${Platform.OS}, Sensitivity: ${brightnessSensitivity})`);
          }
          
          if (!showBrightnessOverlay) {
            setShowBrightnessOverlay(true);
            brightnessOverlayOpacity.setValue(1);
          }
          
          if (brightnessOverlayTimeout.current) {
            clearTimeout(brightnessOverlayTimeout.current);
          }
          brightnessOverlayTimeout.current = setTimeout(() => {
            Animated.timing(brightnessOverlayOpacity, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }).start(() => setShowBrightnessOverlay(false));
          }, overlayTimeout);
        }
      }
    }
  );
  
  // Cleanup function
  const cleanup = () => {
    if (volumeOverlayTimeout.current) {
      clearTimeout(volumeOverlayTimeout.current);
    }
    if (brightnessOverlayTimeout.current) {
      clearTimeout(brightnessOverlayTimeout.current);
    }
    if (resizeModeOverlayTimeout.current) {
      clearTimeout(resizeModeOverlayTimeout.current);
    }
  };

  const showResizeModeOverlayFn = (callback?: () => void) => {
    if (resizeModeOverlayTimeout.current) {
      clearTimeout(resizeModeOverlayTimeout.current);
    }
    setShowResizeModeOverlay(true);
    Animated.timing(resizeModeOverlayOpacity, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      if (callback) callback();
      resizeModeOverlayTimeout.current = setTimeout(() => {
        Animated.timing(resizeModeOverlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowResizeModeOverlay(false));
      }, overlayTimeout);
    });
  };
  
  return {
    // Gesture handlers
    onVolumeGestureEvent,
    onBrightnessGestureEvent,
    
    // Overlay state
    showVolumeOverlay,
    showBrightnessOverlay,
    showResizeModeOverlay,
    volumeOverlayOpacity,
    brightnessOverlayOpacity,
    resizeModeOverlayOpacity,
    
    // Overlay functions
    showResizeModeOverlayFn,
    
    // Cleanup
    cleanup,
  };
};
