import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import LottieView from 'lottie-react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface LoadingSpinnerProps {
  text?: string;
  size?: 'small' | 'medium' | 'large';
  style?: any;
  source?: any; // optional override for Lottie source
  offsetY?: number; // optional vertical offset
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  text,
  size = 'large',
  style,
  source,
  offsetY = 0,
}) => {
  const { currentTheme } = useTheme();

  // Android-specific Lottie configuration
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Enable merge paths for Android KitKat and above
      try {
        const Lottie = require('lottie-react-native');
        if (Lottie.enableMergePathsForKitKatAndAbove) {
          Lottie.enableMergePathsForKitKatAndAbove(true);
        }
      } catch (error) {
        console.warn('Failed to enable merge paths for Android:', error);
      }
    }
  }, []);
  
  const getSizeStyles = () => {
    // Ensure dimensions are whole numbers for Android compatibility
    const getWholeNumber = (num: number) => Math.round(num);
    
    switch (size) {
      case 'small':
        return { width: getWholeNumber(60), height: getWholeNumber(60) };
      case 'medium':
        return { width: getWholeNumber(100), height: getWholeNumber(100) };
      case 'large':
      default:
        return { width: getWholeNumber(150), height: getWholeNumber(150) };
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'small':
        return 12;
      case 'medium':
        return 14;
      case 'large':
      default:
        return 16;
    }
  };

  return (
    <View style={[styles.container, { transform: [{ translateY: offsetY }] }, style]}>
      <LottieView
        source={source || require('../../../assets/Ripple loading animation.zip')}
        autoPlay
        loop
        style={[styles.animation, getSizeStyles()]}
        resizeMode="contain"
        // Android-specific props
        {...(Platform.OS === 'android' && {
          hardwareAccelerationAndroid: true,
          renderMode: 'SOFTWARE' as any, // Fallback to software rendering if hardware fails
        })}
        // Error handling
        onAnimationFinish={() => {
          if (__DEV__) console.log('Lottie animation finished');
        }}
        onAnimationFailure={(error) => {
          if (__DEV__) console.warn('Lottie animation failed:', error);
        }}
      />
      {text && (
        <Text style={[
          styles.text, 
          { 
            color: currentTheme.colors.textMuted,
            fontSize: getTextSize()
          }
        ]}>
          {text}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    // Size will be set by getSizeStyles()
  },
  text: {
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default LoadingSpinner;
