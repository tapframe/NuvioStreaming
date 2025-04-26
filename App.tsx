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
import { enableScreens } from 'react-native-screens';
import AppNavigator, { 
  CustomNavigationDarkTheme,
  CustomDarkTheme
} from './src/navigation/AppNavigator';
import 'react-native-reanimated';
import { CatalogProvider } from './src/contexts/CatalogContext';
import { GenreProvider } from './src/contexts/GenreContext';
import { TraktProvider } from './src/contexts/TraktContext';

// This fixes many navigation layout issues by using native screen containers
enableScreens(true);

function App(): React.JSX.Element {
  // Always use dark mode
  const isDarkMode = true;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GenreProvider>
        <CatalogProvider>
          <TraktProvider>
            <PaperProvider theme={CustomDarkTheme}>
              <NavigationContainer 
                theme={CustomNavigationDarkTheme}
                // Disable automatic linking which can cause layout issues
                linking={undefined}
              >
                <View style={[styles.container, { backgroundColor: '#000000' }]}>
                  <StatusBar
                    style="light"
                  />
                  <AppNavigator />
                </View>
              </NavigationContainer>
            </PaperProvider>
          </TraktProvider>
        </CatalogProvider>
      </GenreProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
