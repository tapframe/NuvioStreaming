import React, { useEffect } from 'react';
import { View, TouchableOpacity, Animated, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  withDelay
} from 'react-native-reanimated';
import { styles } from '../utils/playerStyles';

interface LoadingOverlayProps {
  visible: boolean;
  backdrop: string | null | undefined;
  hasLogo: boolean;
  logo: string | null | undefined;
  backgroundFadeAnim: Animated.Value;
  backdropImageOpacityAnim: Animated.Value;
  onClose: () => void;
  width: number | string;
  height: number | string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  backdrop,
  hasLogo,
  logo,
  backgroundFadeAnim,
  backdropImageOpacityAnim,
  onClose,
  width,
  height,
}) => {
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(1);

  useEffect(() => {
    if (visible && hasLogo && logo) {
      // Reset
      logoOpacity.value = 0;
      logoScale.value = 1;

      // Start animations after 1 second delay
      logoOpacity.value = withDelay(
        1000,
        withTiming(1, {
          duration: 800,
          easing: Easing.out(Easing.cubic),
        })
      );

      logoScale.value = withDelay(
        1000,
        withRepeat(
          withSequence(
            withTiming(1.04, {
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
            }),
            withTiming(1, {
              duration: 2000,
              easing: Easing.inOut(Easing.ease),
            })
          ),
          -1,
          false
        )
      );
    }
  }, [visible, hasLogo, logo]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.openingOverlay,
        {
          opacity: backgroundFadeAnim,
          zIndex: 3000,
        },
        { width: '100%', height: '100%' },
      ]}
    >
      {backdrop && (
        <Animated.View style={[
          StyleSheet.absoluteFill,
          {
            opacity: backdropImageOpacityAnim
          }
        ]}>
          <Image
            source={{ uri: backdrop }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
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
          <Reanimated.View style={[
            {
              alignItems: 'center',
            },
            logoAnimatedStyle
          ]}>
            <Image
              source={{ uri: logo }}
              style={{
                width: 300,
                height: 180,
              }}
              resizeMode="contain"
            />
          </Reanimated.View>
        ) : (
          <ActivityIndicator size="large" color="#E50914" />
        )}
      </View>
    </Animated.View>
  );
};

export default LoadingOverlay;
