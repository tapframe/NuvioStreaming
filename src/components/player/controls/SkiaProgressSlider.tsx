import React, { useMemo, useEffect } from 'react';
import { View, Dimensions } from 'react-native';
import {
  Canvas,
  RoundedRect,
  Circle,
  Group,
  Shadow,
} from '@shopify/react-native-skia';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';

interface SkiaProgressSliderProps {
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (time: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: (time: number) => void;
  onSeekPreview?: (time: number) => void; // New callback for preview time
  width: number;
  height?: number;
  thumbSize?: number;
  progressColor?: string;
  backgroundColor?: string;
  bufferedColor?: string;
}

export const SkiaProgressSlider: React.FC<SkiaProgressSliderProps> = ({
  currentTime,
  duration,
  buffered,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onSeekPreview,
  width,
  height = 4,
  thumbSize = 16,
  progressColor = '#E50914',
  backgroundColor = 'rgba(255, 255, 255, 0.2)',
  bufferedColor = 'rgba(255, 255, 255, 0.4)',
}) => {
  const progress = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const thumbScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const previewTimeValue = useSharedValue(0);
  
  // Add padding to account for thumb size
  const trackPadding = thumbSize / 2;
  const trackWidth = width - (trackPadding * 2);
  
  // Update progress when currentTime changes
  useEffect(() => {
    if (!isDragging.value && duration > 0) {
      const newProgress = (currentTime / duration);
      progress.value = newProgress;
      progressWidth.value = newProgress * trackWidth;
    }
  }, [currentTime, duration, trackWidth]);

  // Calculate buffered width
  const bufferedWidth = useMemo(() => {
    return duration > 0 ? (buffered / duration) * trackWidth : 0;
  }, [buffered, duration, trackWidth]);

  // Handle seeking with proper coordinate mapping
  const seekToPosition = (gestureX: number, isPreview: boolean = false) => {
    'worklet';
    // Map gesture coordinates to track coordinates
    const trackX = gestureX - trackPadding;
    const clampedX = Math.max(0, Math.min(trackX, trackWidth));
    
    const newProgress = clampedX / trackWidth;
    progress.value = newProgress;
    progressWidth.value = clampedX;
    
    const seekTime = newProgress * duration;
    previewTimeValue.value = seekTime;
    
    if (isPreview && onSeekPreview) {
      runOnJS(onSeekPreview)(seekTime);
    } else if (!isPreview) {
      runOnJS(onSeek)(seekTime);
    }
  };

  // Pan gesture for dragging
  const panGesture = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      isDragging.value = true;
      thumbScale.value = withSpring(1.2, { damping: 15, stiffness: 400 });
      // Process the initial touch position immediately
      seekToPosition(e.x, true);
      if (onSeekStart) {
        runOnJS(onSeekStart)();
      }
    })
    .onUpdate((e) => {
      'worklet';
      seekToPosition(e.x, true); // Use preview mode during dragging
    })
    .onFinalize((e) => {
      'worklet';
      isDragging.value = false;
      thumbScale.value = withSpring(1, { damping: 15, stiffness: 400 });
      
      // Use the exact same preview time for the final seek to ensure consistency
      if (onSeekEnd) {
        runOnJS(onSeekEnd)(previewTimeValue.value);
      }
      
      // Final seek when drag ends - use the same calculation as preview
      runOnJS(onSeek)(previewTimeValue.value);
    });

  // Tap gesture for seeking
  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      'worklet';
      seekToPosition(e.x, false); // Direct seek on tap
    });

  const composedGesture = Gesture.Simultaneous(tapGesture, panGesture);

  // Animated styles for thumb
  const animatedThumbStyle = useAnimatedStyle(() => {
    const thumbX = progress.value * trackWidth + trackPadding;
    
    return {
      transform: [
        { translateX: thumbX - thumbSize / 2 },
        { scale: thumbScale.value }
      ],
    };
  });

  // Animated style for progress width
  const animatedProgressStyle = useAnimatedStyle(() => {
    return {
      width: progressWidth.value,
    };
  });

  return (
    <View style={{ width, height: height + thumbSize + 8 }}>
      <GestureDetector gesture={composedGesture}>
        <View>
          <Canvas style={{ width, height: height + thumbSize + 8 }}>
            <Group transform={[{ translateY: (thumbSize / 2) + 4 }, { translateX: trackPadding }]}>
              {/* Background track */}
              <RoundedRect
                x={0}
                y={0}
                width={trackWidth}
                height={height}
                r={height / 2}
                color={backgroundColor}
              />

              {/* Buffered progress */}
              {bufferedWidth > 0 && (
                <RoundedRect
                  x={0}
                  y={0}
                  width={bufferedWidth}
                  height={height}
                  r={height / 2}
                  color={bufferedColor}
                />
              )}
            </Group>
          </Canvas>
          
          {/* Current progress - using regular view for animation */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: (thumbSize / 2) + 4,
                left: trackPadding,
                height: height,
                backgroundColor: progressColor,
                borderRadius: height / 2,
              },
              animatedProgressStyle,
            ]}
          />
          
          {/* Animated thumb */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 4,
                left: 0,
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbSize / 2,
                backgroundColor: progressColor,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 3,
                elevation: 4,
              },
              animatedThumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}; 