import React, { useEffect, useCallback } from 'react';
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
import { Portal, Dialog, Button } from 'react-native-paper';

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
    const duration = Platform.OS === 'android' ? 200 : 150;
    if (visible) {
      opacity.value = withTiming(1, { duration });
      scale.value = withTiming(1, { duration });
    } else {
      opacity.value = withTiming(0, { duration });
      scale.value = withTiming(0.95, { duration });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const alertStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // Safe action handler to prevent crashes
  const handleActionPress = useCallback((action: { label: string; onPress: () => void; style?: object }) => {
    try {
      action.onPress();
      onClose();
    } catch (error) {
      console.warn('[CustomAlert] Error in action handler:', error);
      // Still close the alert even if action fails
      onClose();
    }
  }, [onClose]);

  // Use Portal with Modal for proper rendering and animations
  return (
    <Portal>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
        statusBarTranslucent={true}
        hardwareAccelerated={true}
      >
        <Animated.View 
          style={[
            styles.overlay, 
            { backgroundColor: 'rgba(0,0,0,0.6)' },
            overlayStyle
          ]}
        >
          <Pressable style={styles.overlayPressable} onPress={onClose} />
          <View style={styles.centered}>
            <Animated.View style={[
              styles.alertContainer,
              alertStyle,
              {
                backgroundColor: themeColors.darkBackground,
                borderColor: themeColors.primary,
              }
            ]}>
              {/* Title */}
              <Text style={[styles.title, { color: themeColors.highEmphasis }]}>
                {title}
              </Text>

              {/* Message */}
              <Text style={[styles.message, { color: themeColors.mediumEmphasis }]}>
                {message}
              </Text>

              {/* Actions */}
              <View style={styles.actionsRow}>
                {actions.map((action, idx) => {
                  const isPrimary = idx === actions.length - 1;
                  return (
                    <TouchableOpacity
                      key={action.label}
                      style={[
                        styles.actionButton,
                        isPrimary
                          ? { ...styles.primaryButton, backgroundColor: themeColors.primary }
                          : styles.secondaryButton,
                        action.style
                      ]}
                      onPress={() => handleActionPress(action)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.actionText,
                        isPrimary
                          ? { color: themeColors.white }
                          : { color: themeColors.primary }
                      ]}>
                        {action.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
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
    paddingHorizontal: 24,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#007AFF', // iOS blue - will be overridden by theme
    overflow: 'hidden', // Ensure background fills entire card
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 15,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    // Background color set dynamically via theme
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default CustomAlert;
