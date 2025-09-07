/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  I18nManager
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
import { TrailerProvider } from './src/contexts/TrailerContext';
import SplashScreen from './src/components/SplashScreen';
import UpdatePopup from './src/components/UpdatePopup';
import { useUpdatePopup } from './src/hooks/useUpdatePopup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import UpdateService from './src/services/updateService';

Sentry.init({
  dsn: 'https://1a58bf436454d346e5852b7bfd3c95e8@o4509536317276160.ingest.de.sentry.io/4509536317734992',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Configure Session Replay (disabled for performance)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  integrations: [Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Force LTR layout to prevent RTL issues when Arabic is set as system language
// This ensures posters and UI elements remain visible and properly positioned
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

// This fixes many navigation layout issues by using native screen containers
enableScreens(true);

// Inner app component that uses the theme context
const ThemedApp = () => {
  const { currentTheme } = useTheme();
  const [isAppReady, setIsAppReady] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  
  // Update popup functionality
  const {
    showUpdatePopup,
    updateInfo,
    isInstalling,
    handleUpdateNow,
    handleUpdateLater,
    handleDismiss,
  } = useUpdatePopup();
  
  // Check onboarding status and initialize update service
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Check onboarding status
        const onboardingCompleted = await AsyncStorage.getItem('hasCompletedOnboarding');
        setHasCompletedOnboarding(onboardingCompleted === 'true');
        
        // Initialize update service
        await UpdateService.initialize();
      } catch (error) {
        console.error('Error initializing app:', error);
        // Default to showing onboarding if we can't check
        setHasCompletedOnboarding(false);
      }
    };
    
    initializeApp();
  }, []);
  
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
  
  // Don't render anything until we know the onboarding status
  const shouldShowApp = isAppReady && hasCompletedOnboarding !== null;
  const initialRouteName = hasCompletedOnboarding ? 'MainTabs' : 'Onboarding';
  
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
          {shouldShowApp && <AppNavigator initialRouteName={initialRouteName} />}
          
          {/* Update Popup */}
          <UpdatePopup
            visible={showUpdatePopup}
            updateInfo={updateInfo}
            onUpdateNow={handleUpdateNow}
            onUpdateLater={handleUpdateLater}
            onDismiss={handleDismiss}
            isInstalling={isInstalling}
          />
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
              <TrailerProvider>
                <ThemedApp />
              </TrailerProvider>
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

export default Sentry.wrap(App);