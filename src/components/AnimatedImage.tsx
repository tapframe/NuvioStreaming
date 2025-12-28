import React, { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming
} from 'react-native-reanimated';
import FastImage, { resizeMode as FIResizeMode } from '../utils/FastImageCompat';

interface AnimatedImageProps {
  source: { uri: string } | undefined;
  style: any;
  contentFit: any;
  onLoad?: () => void;
}

const AnimatedImage = memo(({
  source,
  style,
  contentFit,
  onLoad
}: AnimatedImageProps) => {
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  useEffect(() => {
    if (source?.uri) {
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      opacity.value = 0;
    }
  }, [source?.uri]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      opacity.value = 0;
    };
  }, []);

  // Don't render FastImage if no source
  if (!source?.uri) {
    return <Animated.View style={[style, animatedStyle]} />;
  }

  return (
    <Animated.View style={[style, animatedStyle]}>
      <FastImage
        source={source}
        style={StyleSheet.absoluteFillObject}
        resizeMode={FIResizeMode.cover}
        onLoad={onLoad}
      />
    </Animated.View>
  );
});

export default AnimatedImage;
