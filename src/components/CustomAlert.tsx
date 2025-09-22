import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  useColorScheme,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  actions?: Array<{
    label: string;
    onPress: () => void;
    style?: object;
  }>;
}

export const CustomAlert = ({
  visible,
  title,
  message,
  onClose,
  actions = [
    { label: 'OK', onPress: onClose }
  ],
}: CustomAlertProps) => {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);
  const isDarkMode = useColorScheme() === 'dark';
  const { currentTheme } = useTheme();
  const themeColors = currentTheme.colors;

  useEffect(() => {
    const animDuration = 120;
    if (visible) {
      opacity.value = withTiming(1, { duration: animDuration });
      scale.value = withTiming(1, { duration: animDuration });
    } else {
      opacity.value = withTiming(0, { duration: animDuration });
      scale.value = withTiming(0.95, { duration: animDuration });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const alertStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const backgroundColor = isDarkMode ? themeColors.darkBackground : themeColors.elevation2 || '#FFFFFF';
  const textColor = isDarkMode ? themeColors.white : themeColors.black || '#000000';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { backgroundColor: themeColors.transparentDark }, overlayStyle]}>
        <Pressable style={styles.overlayPressable} onPress={onClose} />
        <View style={styles.centered}>
          <Animated.View style={[styles.alertContainer, alertStyle, { backgroundColor, borderColor }]}> 
            <Text style={[styles.title, { color: textColor }]}>{title}</Text>
            <Text style={[styles.message, { color: textColor }]}>{message}</Text>
            <View style={styles.actionsRow}>
              {actions.map((action, idx) => (
                <TouchableOpacity
                  key={action.label}
                  style={[styles.actionButton, idx === actions.length - 1 && styles.lastActionButton, action.style]}
                  onPress={() => {
                    action.onPress();
                    onClose();
                  }}
                >
                  <Text style={[styles.actionText, { color: themeColors.primary }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    minWidth: 280,
    maxWidth: '85%',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  lastActionButton: {
    // Optionally style the last button differently
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomAlert;
