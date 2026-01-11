import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';
import { colors } from '../styles/colors';

interface SplashScreenProps {
  onFinish: () => void;
}

const SplashScreen = ({ onFinish }: SplashScreenProps) => {
  // TEMPORARILY DISABLED
  useEffect(() => {
    // Immediately call onFinish to skip splash screen
    onFinish();
  }, [onFinish]);

  return null;

  // Animation value for opacity
  // const fadeAnim = new Animated.Value(1);

  // useEffect(() => {
  //   // Wait for a short period then start fade out animation
  //   const timer = setTimeout(() => {
  //     Animated.timing(fadeAnim, {
  //       toValue: 0,
  //       duration: 400,
  //       useNativeDriver: true,
  //     }).start(() => {
  //       // Call onFinish when animation completes
  //       onFinish();
  //     });
  //   }, 300); // Show splash for 0.8 seconds

  //   return () => clearTimeout(timer);
  // }, [fadeAnim, onFinish]);

  // return (
  //   <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
  //     <Image
  //       source={require('../assets/splash-icon-new.png')}
  //       style={styles.image}
  //       resizeMode="contain"
  //     />
  //   </Animated.View>
  // );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.darkBackground,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  image: {
    width: '70%',
    height: '70%',
  },
});

export default SplashScreen;