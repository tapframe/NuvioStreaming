import React from 'react';
import { View, TouchableOpacity, Platform, StyleSheet, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const NuvioHeader = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { currentTheme } = useTheme();

  // Only render the header if the current route is 'Home'
  if (route.name !== 'Home') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={[
        styles.headerContainer,
        Platform.OS === 'android' && { backgroundColor: currentTheme.colors.darkBackground }
      ]}>
        {Platform.OS === 'ios' ? (
          <ExpoBlurView intensity={60} style={styles.blurOverlay} tint="dark" />
        ) : (
          // Android: solid themed background instead of blur/transparent overlay
          <View style={[styles.androidBlurContainer, { backgroundColor: currentTheme.colors.darkBackground }]} />
        )}
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
            <View style={[
              styles.iconWrapper,
              { 
                backgroundColor: currentTheme.colors.transparentLight,
                borderColor: currentTheme.colors.border
              }
            ]}>
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
    paddingTop: Platform.OS === 'ios' ? 35 : 35,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  androidBlurContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
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