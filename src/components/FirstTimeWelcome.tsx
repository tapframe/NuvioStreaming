import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';

const { height } = Dimensions.get('window');

const FirstTimeWelcome = () => {
  const { currentTheme } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={styles.wrapper}
    >
      <Text style={[styles.title, { color: currentTheme.colors.highEmphasis }]}>
        Welcome to Nuvio
      </Text>

      <Text style={[styles.description, { color: currentTheme.colors.mediumEmphasis }]}>
        Install addons to start browsing content
      </Text>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: currentTheme.colors.primary }]}
        onPress={() => navigation.navigate('Addons')}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Install Addons</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default FirstTimeWelcome;
