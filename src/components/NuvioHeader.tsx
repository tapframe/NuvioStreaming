import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NuvioHeaderProps {
  routeName: string;
}

export const NuvioHeader: React.FC<NuvioHeaderProps> = ({ routeName }) => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>NUVIO</Text>
        {routeName === 'Home' && (
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
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.darkBackground,
    height: Platform.OS === 'ios' ? 96 : 80,
    paddingTop: Platform.OS === 'ios' ? 48 : 32,
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