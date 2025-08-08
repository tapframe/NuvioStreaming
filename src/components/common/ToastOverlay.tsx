import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ToastType = 'success' | 'error' | 'info';

type Props = {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number; // ms
  onHide?: () => void;
  bottomOffset?: number; // extra offset above safe area / tab bar
  containerStyle?: ViewStyle;
};

const colorsByType: Record<ToastType, string> = {
  success: 'rgba(46,160,67,0.95)',
  error: 'rgba(229, 62, 62, 0.95)',
  info: 'rgba(99, 102, 241, 0.95)',
};

export const ToastOverlay: React.FC<Props> = ({
  visible,
  message,
  type = 'info',
  duration = 1800,
  onHide,
  bottomOffset = 90,
  containerStyle,
}) => {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible) {
      // clear any existing timer
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      opacity.setValue(0);
      translateY.setValue(12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        hideTimer.current = setTimeout(() => {
          Animated.parallel([
            Animated.timing(opacity, { toValue: 0, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 12, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          ]).start(() => {
            if (onHide) onHide();
          });
        }, Math.max(800, duration));
      });
    } else {
      // If toggled off externally, hide instantly
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 12, duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [visible, duration, onHide, opacity, translateY]);

  const bg = useMemo(() => colorsByType[type], [type]);
  const bottom = (insets?.bottom || 0) + bottomOffset;

  if (!visible && opacity.__getValue() === 0) {
    // Avoid mounting when fully hidden to minimize layout cost
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { bottom }, containerStyle, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={[styles.text, { backgroundColor: bg }]} numberOfLines={3}>
        {message}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
    fontSize: 12,
  },
});

export default ToastOverlay;


