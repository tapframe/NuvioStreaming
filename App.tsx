/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
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
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import SplashScreen from './src/components/SplashScreen';

// This fixes many navigation layout issues by using native screen containers
enableScreens(true);

// Inner app component that uses the theme context
const ThemedApp = () => {
  const { currentTheme } = useTheme();
  const [isAppReady, setIsAppReady] = useState(false);
  
  // Create custom themes based on current theme
  const customDarkTheme = {
    ...CustomDarkTheme,
    colors: {
      ...CustomDarkTheme.colors,
      primary: currentTheme.colors.primary,
    }
  };
  
  const customNavigationTheme = {
    ...CustomNavigationDarkTheme,
    colors: {
      ...CustomNavigationDarkTheme.colors,
      primary: currentTheme.colors.primary,
      card: currentTheme.colors.darkBackground,
      background: currentTheme.colors.darkBackground,
    }
  };

  // Handler for splash screen completion  
  const handleSplashComplete = () => {
    setIsAppReady(true);
  };
  
  return (
    <PaperProvider theme={customDarkTheme}>
      <NavigationContainer 
        theme={customNavigationTheme}
        // Disable automatic linking which can cause layout issues
        linking={undefined}
      >
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
          <StatusBar
            style="light"
          />
          {!isAppReady && <SplashScreen onFinish={handleSplashComplete} />}
          {isAppReady && <AppNavigator />}
        </View>
      </NavigationContainer>
    </PaperProvider>
  );
}

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GenreProvider>
        <CatalogProvider>
          <TraktProvider>
            <ThemeProvider>
              <ThemedApp />
            </ThemeProvider>
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
