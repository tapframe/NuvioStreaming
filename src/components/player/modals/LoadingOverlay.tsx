import React from 'react';
import { View, TouchableOpacity, Animated, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import FastImage from '@d11/react-native-fast-image';
import { styles } from '../utils/playerStyles';

interface LoadingOverlayProps {
  visible: boolean;
  backdrop: string | null | undefined;
  hasLogo: boolean;
  logo: string | null | undefined;
  backgroundFadeAnim: Animated.Value;
  backdropImageOpacityAnim: Animated.Value;
  logoScaleAnim: Animated.Value;
  logoOpacityAnim: Animated.Value;
  pulseAnim: Animated.Value;
  onClose: () => void;
  width: number | string;
  height: number | string;
  useFastImage?: boolean; // Platform-specific: iOS uses FastImage, Android uses Image
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  backdrop,
  hasLogo,
  logo,
  backgroundFadeAnim,
  backdropImageOpacityAnim,
  logoScaleAnim,
  logoOpacityAnim,
  pulseAnim,
  onClose,
  width,
  height,
  useFastImage = false,
}) => {
  if (!visible) return null;

  return (
    <Animated.View 
      style={[
        styles.openingOverlay,
        {
          opacity: backgroundFadeAnim,
          zIndex: 3000,
        },
        // Cast to any to support both number and string dimensions
        { width, height } as any,
      ]}
    >
      {backdrop && (
        <Animated.View style={[
            StyleSheet.absoluteFill,
            {
              opacity: backdropImageOpacityAnim
            }
          ]}>
          {useFastImage ? (
            <FastImage
              source={{ uri: backdrop }}
              style={StyleSheet.absoluteFillObject}
              resizeMode={FastImage.resizeMode.cover}
            />
          ) : (
            <Image
              source={{ uri: backdrop }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          )}
        </Animated.View>
      )}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.3)',
          'rgba(0,0,0,0.6)',
          'rgba(0,0,0,0.8)',
          'rgba(0,0,0,0.9)'
        ]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      
      <TouchableOpacity 
        style={styles.loadingCloseButton}
        onPress={onClose}
        activeOpacity={0.7}
      >
        <MaterialIcons name="close" size={24} color="#ffffff" />
      </TouchableOpacity>
      
      <View style={styles.openingContent}>
        {hasLogo && logo ? (
          <Animated.View style={{
            transform: [
              { scale: Animated.multiply(logoScaleAnim, pulseAnim) }
            ],
            opacity: logoOpacityAnim,
            alignItems: 'center',
          }}>
            <FastImage
              source={{ uri: logo }}
              style={{
                width: 300,
                height: 180,
              }}
              resizeMode={FastImage.resizeMode.contain}
            />
          </Animated.View>
        ) : (
          <ActivityIndicator size="large" color="#E50914" />
        )}
      </View>
    </Animated.View>
  );
};

export default LoadingOverlay;
