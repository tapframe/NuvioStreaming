import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

export interface ToastConfig {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  position?: 'top' | 'bottom';
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ToastProps extends ToastConfig {
  onRemove: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 4000,
  position = 'top',
  action,
  onRemove,
}) => {
  const { currentTheme } = useTheme();
  const translateY = useRef(new Animated.Value(position === 'top' ? -100 : 100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto remove
    const timer = setTimeout(() => {
      removeToast();
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const removeToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: position === 'top' ? -100 : 100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.8,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onRemove(id);
    });
  };

  const getToastConfig = () => {
    // Use the app's theme colors directly
    const isDarkTheme = true; // App uses dark theme by default
    
    switch (type) {
      case 'success':
        return {
          icon: 'check-circle' as const,
          color: currentTheme.colors.success,
          backgroundColor: currentTheme.colors.darkBackground,
          borderColor: currentTheme.colors.success,
          textColor: currentTheme.colors.highEmphasis,
          messageColor: currentTheme.colors.mediumEmphasis,
        };
      case 'error':
        return {
          icon: 'error' as const,
          color: currentTheme.colors.error,
          backgroundColor: currentTheme.colors.darkBackground,
          borderColor: currentTheme.colors.error,
          textColor: currentTheme.colors.highEmphasis,
          messageColor: currentTheme.colors.mediumEmphasis,
        };
      case 'warning':
        return {
          icon: 'warning' as const,
          color: currentTheme.colors.warning,
          backgroundColor: currentTheme.colors.darkBackground,
          borderColor: currentTheme.colors.warning,
          textColor: currentTheme.colors.highEmphasis,
          messageColor: currentTheme.colors.mediumEmphasis,
        };
      case 'info':
        return {
          icon: 'info' as const,
          color: currentTheme.colors.info,
          backgroundColor: currentTheme.colors.darkBackground,
          borderColor: currentTheme.colors.info,
          textColor: currentTheme.colors.highEmphasis,
          messageColor: currentTheme.colors.mediumEmphasis,
        };
      default:
        return {
          icon: 'info' as const,
          color: currentTheme.colors.mediumEmphasis,
          backgroundColor: currentTheme.colors.darkBackground,
          borderColor: currentTheme.colors.border,
          textColor: currentTheme.colors.highEmphasis,
          messageColor: currentTheme.colors.mediumEmphasis,
        };
    }
  };

  const config = getToastConfig();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }, { scale }],
          opacity,
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          top: position === 'top' ? 60 : undefined,
          bottom: position === 'bottom' ? 60 : undefined,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={removeToast}
        activeOpacity={0.8}
      >
        <View style={styles.leftSection}>
          <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
            <MaterialIcons name={config.icon} size={20} color="white" />
          </View>
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: config.textColor }]}>
              {title}
            </Text>
            {message && (
              <Text style={[styles.message, { color: config.messageColor }]}>
                {message}
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.rightSection}>
          {action && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: config.color }]}
              onPress={() => {
                action.onPress();
                removeToast();
              }}
            >
              <Text style={styles.actionText}>{action.label}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={removeToast}
          >
            <MaterialIcons name="close" size={18} color={currentTheme.colors.disabled} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 60,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 2,
  },
  message: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  actionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
});

export default Toast;
