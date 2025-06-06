import React, { useEffect } from 'react';
import { View, TouchableOpacity, Platform, StyleSheet, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { BlurView as CommunityBlurView } from '@react-native-community/blur';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useTheme } from '../contexts/ThemeContext';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  interpolate, 
  Extrapolate,
  withTiming,
  useDerivedValue
} from 'react-native-reanimated';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NuvioHeaderProps {
  scrollY?: Animated.SharedValue<number>;
}

export const NuvioHeader = ({ scrollY }: NuvioHeaderProps) => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { currentTheme } = useTheme();
  
  // Create a local shared value if none is provided
  const localScrollY = useSharedValue(0);
  const activeScrollY = scrollY || localScrollY;
  
  // Derived value for header opacity based on scroll position
  const headerOpacity = useDerivedValue(() => {
    // Start showing background after 10px of scroll
    return interpolate(
      activeScrollY.value,
      [0, 40],
      [0, 1],
      Extrapolate.CLAMP
    );
  });

  // Only render the header if the current route is 'Home'
  if (route.name !== 'Home') {
    return null;
  }
  
  // Determine if running in Expo Go
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  
  const animatedBackgroundStyle = useAnimatedStyle(() => {
    return {
      opacity: headerOpacity.value,
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Animated.View style={[styles.blurContainer, animatedBackgroundStyle]}>
          {Platform.OS === 'ios' ? (
            <ExpoBlurView intensity={60} style={styles.blurOverlay} tint="dark" />
          ) : (
            isExpoGo ? (
              <View style={[styles.androidBlurContainer, styles.androidFallbackBlur]} />
            ) : (
              <View style={styles.androidBlurContainer}>
                <CommunityBlurView
                  style={styles.androidBlur}
                  blurType="dark"
                  blurAmount={8}
                  overlayColor="rgba(0,0,0,0.4)"
                  reducedTransparencyFallbackColor="black"
                />
              </View>
            )
          )}
        </Animated.View>
        <View style={styles.contentContainer}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/IMG_0762.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => navigation.navigate('Search')}
          >
            <View style={styles.iconWrapper}>
              <MaterialCommunityIcons 
                name="magnify" 
                size={24} 
                color={currentTheme.colors.white} 
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerContainer: {
    height: Platform.OS === 'ios' ? 100 : 90,
    paddingTop: Platform.OS === 'ios' ? 35 : 20,
  },
  blurContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  androidBlurContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  androidBlur: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  androidFallbackBlur: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    height: '100%',
  },
  logoContainer: {
    height: 70,
    width: 70,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  logo: {
    height: '100%',
    width: '100%',
  },
  searchButton: {
    padding: 8,
    marginLeft: 'auto',
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
}); 