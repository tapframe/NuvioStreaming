/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import {
  View,
  StyleSheet
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Provider as PaperProvider } from 'react-native-paper';
import AppNavigator, { 
  CustomNavigationDarkTheme,
  CustomDarkTheme
} from './src/navigation/AppNavigator';
import 'react-native-reanimated';
import { CatalogProvider } from './src/contexts/CatalogContext';

function App(): React.JSX.Element {
  // Always use dark mode
  const isDarkMode = true;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CatalogProvider>
        <PaperProvider theme={CustomDarkTheme}>
          <NavigationContainer theme={CustomNavigationDarkTheme}>
            <View style={[styles.container, { backgroundColor: '#000000' }]}>
              <StatusBar
                style="light"
              />
              <AppNavigator />
            </View>
          </NavigationContainer>
        </PaperProvider>
      </CatalogProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
