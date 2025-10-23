import React, { useEffect, useRef } from 'react';
import { Animated, Easing, BackHandler } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import KSPlayerCore from './KSPlayerCore';

const KSPlayerWithTransition: React.FC = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1.15)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const blurRadiusAnim = useRef(new Animated.Value(20)).current;
  const rotateAnim = useRef(new Animated.Value(0.5)).current;
  const isExiting = useRef(false);
  const navigation = useNavigation();

  useEffect(() => {
    // Cinematic entrance animation with multiple stages
    // Stage 1: Quick fade in and scale down (zoom out effect)
    Animated.sequence([
      Animated.parallel([
        // Ultra-fast initial fade
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Zoom out from 1.15x to create depth
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Custom bezier for smooth deceleration
          useNativeDriver: true,
        }),
        // Subtle rotation for dynamic feel
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Handle back button press with exit animation
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isExiting.current) {
        isExiting.current = true;
        
        // Start exit animation
        Animated.parallel([
          // Fade out
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          // Scale down slightly
          Animated.timing(scaleAnim, {
            toValue: 0.95,
            duration: 300,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          // Slide down slightly
          Animated.timing(translateYAnim, {
            toValue: 15,
            duration: 300,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Navigate back after animation completes
          navigation.goBack();
        });
        
        return true; // Prevent default back behavior
      }
      return false;
    });

    return () => {
      backHandler.remove();
    };
  }, [navigation]);

  // Interpolate rotation (0.5 deg to 0 deg for subtle dynamic effect)
  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '0.5deg'],
  });

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: fadeAnim,
        transform: [
          { scale: scaleAnim },
          { translateY: translateYAnim },
          { rotateZ: rotation },
        ],
      }}
    >
      <KSPlayerCore />
    </Animated.View>
  );
};

export default KSPlayerWithTransition;
