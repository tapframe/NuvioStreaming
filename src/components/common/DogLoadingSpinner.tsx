import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface DogLoadingSpinnerProps {
  text?: string;
  size?: 'small' | 'medium' | 'large';
  style?: any;
  source?: any; // optional override for Lottie source
  offsetY?: number; // optional vertical offset
}

const DogLoadingSpinner: React.FC<DogLoadingSpinnerProps> = ({
  text,
  size = 'large',
  style,
  source,
  offsetY = 0,
}) => {
  const { currentTheme } = useTheme();
  
  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { width: 60, height: 60 };
      case 'medium':
        return { width: 100, height: 100 };
      case 'large':
      default:
        return { width: 150, height: 150 };
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
        source={source || require('../../../assets/dog-running.lottie')}
        autoPlay
        loop
        style={[styles.animation, getSizeStyles()]}
        resizeMode="contain"
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

export default DogLoadingSpinner;
