import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { BlurView as CommunityBlurView } from '@react-native-community/blur';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const NuvioHeader = () => {
  const navigation = useNavigation<NavigationProp>();
  
  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        {Platform.OS === 'ios' ? (
          <ExpoBlurView intensity={60} style={styles.blurOverlay} tint="dark" />
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
        )}
        <View style={styles.contentContainer}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>NUVIO</Text>
            <View style={styles.titleAccent} />
          </View>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => navigation.navigate('Search')}
          >
            <View style={styles.iconWrapper}>
              <MaterialCommunityIcons 
                name="magnify" 
                size={24} 
                color={colors.white} 
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
    height: Platform.OS === 'ios' ? 85 : 75,
    paddingTop: Platform.OS === 'ios' ? 35 : 20,
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
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  titleContainer: {
    position: 'relative',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-black',
    textTransform: 'uppercase',
    marginLeft: Platform.OS === 'ios' ? -4 : -8,
    textShadowColor: 'rgba(255, 255, 255, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  titleAccent: {
    position: 'absolute',
    bottom: -3,
    left: Platform.OS === 'ios' ? -2 : -6,
    width: 24,
    height: 2,
    backgroundColor: colors.primary || '#3D85C6',
    borderRadius: 1,
  },
  searchButton: {
    padding: 8,
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