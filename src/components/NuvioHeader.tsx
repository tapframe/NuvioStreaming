import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const NuvioHeader = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[
          '#000000',
          'rgba(0, 0, 0, 0.95)',
          'rgba(0, 0, 0, 0.8)',
          'rgba(0, 0, 0, 0.2)',
          'transparent'
        ]}
        locations={[0, 0.3, 0.6, 0.8, 1]}
        style={styles.gradient}
      >
        <View style={styles.contentContainer}>
          <Text style={styles.title}>NUVIO</Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => navigation.navigate('Search')}
          >
            <MaterialCommunityIcons 
              name="magnify" 
              size={28} 
              color={colors.white} 
            />
          </TouchableOpacity>
        </View>
      </LinearGradient>
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
  },
  gradient: {
    height: Platform.OS === 'ios' ? 100 : 90,
    paddingTop: Platform.OS === 'ios' ? 40 : 24,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-black',
    textTransform: 'uppercase',
    marginLeft: Platform.OS === 'ios' ? -4 : -8,
  },
  searchButton: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },
}); 