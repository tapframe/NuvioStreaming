import React, { memo, useEffect } from 'react';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming,
  withDelay 
} from 'react-native-reanimated';

interface AnimatedViewProps {
  children: React.ReactNode;
  style?: any;
  delay?: number;
}

const AnimatedView = memo(({
  children,
  style,
  delay = 0
}: AnimatedViewProps) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 250 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 250 }));
  }, [delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      opacity.value = 0;
      translateY.value = 20;
    };
  }, []);

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
});

export default AnimatedView;
