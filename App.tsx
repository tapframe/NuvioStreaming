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
  I18nManager,
  Platform,
  LogBox,
  Linking
} from 'react-native';
import './src/i18n'; // Initialize i18n
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens, enableFreeze } from 'react-native-screens';
import AppNavigator, {
  CustomNavigationDarkTheme,
  CustomDarkTheme
} from './src/navigation/AppNavigator';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import 'react-native-reanimated';
import { CatalogProvider } from './src/contexts/CatalogContext';
import { GenreProvider } from './src/contexts/GenreContext';
import { TraktProvider } from './src/contexts/TraktContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { TrailerProvider } from './src/contexts/TrailerContext';
import { DownloadsProvider } from './src/contexts/DownloadsContext';
import SplashScreen from './src/components/SplashScreen';
import UpdatePopup from './src/components/UpdatePopup';
import MajorUpdateOverlay from './src/components/MajorUpdateOverlay';
import { useGithubMajorUpdate } from './src/hooks/useGithubMajorUpdate';
import { useUpdatePopup } from './src/hooks/useUpdatePopup';
import * as Sentry from '@sentry/react-native';
import UpdateService from './src/services/updateService';
import { memoryMonitorService } from './src/services/memoryMonitorService';
import { aiService } from './src/services/aiService';
import { AccountProvider, useAccount } from './src/contexts/AccountContext';
import { ToastProvider } from './src/contexts/ToastContext';
import { mmkvStorage } from './src/services/mmkvStorage';
import { CampaignManager } from './src/components/promotions/CampaignManager';

Sentry.init({
  dsn: 'https://1a58bf436454d346e5852b7bfd3c95e8@o4509536317276160.ingest.de.sentry.io/4509536317734992',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Configure Session Replay conservatively to avoid startup overhead in production
  replaysSessionSampleRate: __DEV__ ? 0.1 : 0,
  replaysOnErrorSampleRate: __DEV__ ? 1 : 0,
  integrations: [Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Force LTR layout to prevent RTL issues when Arabic is set as system language
// This ensures posters and UI elements remain visible and properly positioned
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

// Suppress duplicate key warnings app-wide
LogBox.ignoreLogs([
  'Warning: Encountered two children with the same key',
  'Keys should be unique so that components maintain their identity across updates'
]);

// This fixes many navigation layout issues by using native screen containers
enableScreens(true);
// Freeze non-focused screens to stop background re-renders
enableFreeze(true);

// Inner app component that uses the theme context
const ThemedApp = () => {
  // Log JS engine once at startup
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const engine = (global as any).HermesInternal ? 'Hermes' : 'JSC';
      console.log('JS Engine:', engine);
    } catch { }
  }, []);
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

  // GitHub major/minor release overlay
  const githubUpdate = useGithubMajorUpdate();
  const [isDownloadingGitHub, setIsDownloadingGitHub] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleGithubUpdateAction = async () => {
    console.log('handleGithubUpdateAction triggered. Release data exists:', !!githubUpdate.releaseData);
    if (Platform.OS === 'android') {
      setIsDownloadingGitHub(true);
      setDownloadProgress(0);
      try {
        const { default: AndroidUpdateService } = await import('./src/services/androidUpdateService');
        if (githubUpdate.releaseData) {
          console.log('Calling AndroidUpdateService with:', githubUpdate.releaseData.tag_name);
          const success = await AndroidUpdateService.downloadAndInstallUpdate(
            githubUpdate.releaseData,
            (progress) => {
              setDownloadProgress(progress);
            }
          );
          console.log('AndroidUpdateService result:', success);
          if (!success) {
            console.log('Update failed, falling back to browser');
            // If download fails or no APK found, fallback to browser
            if (githubUpdate.releaseUrl) Linking.openURL(githubUpdate.releaseUrl);
          }
        } else if (githubUpdate.releaseUrl) {
          console.log('No release data, falling back to browser');
          Linking.openURL(githubUpdate.releaseUrl);
        }
      } catch (error) {
        console.error('Failed to update via Android service', error);
        if (githubUpdate.releaseUrl) Linking.openURL(githubUpdate.releaseUrl);
      } finally {
        setIsDownloadingGitHub(false);
        setDownloadProgress(0);
      }
    } else {
      if (githubUpdate.releaseUrl) Linking.openURL(githubUpdate.releaseUrl);
    }
  };

  // Check onboarding status and initialize services
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Check onboarding status
        const onboardingCompleted = await mmkvStorage.getItem('hasCompletedOnboarding');
        setHasCompletedOnboarding(onboardingCompleted === 'true');

        // Initialize update service
        await UpdateService.initialize();

        // Initialize memory monitoring service to prevent OutOfMemoryError
        memoryMonitorService; // Just accessing it starts the monitoring
        console.log('Memory monitoring service initialized');

        // Initialize AI service
        await aiService.initialize();
        console.log('AI service initialized');

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

  // Navigation reference
  const navigationRef = React.useRef<any>(null);

  // Don't render anything until we know the onboarding status
  const shouldShowApp = isAppReady && hasCompletedOnboarding !== null;
  const initialRouteName = hasCompletedOnboarding ? 'MainTabs' : 'Onboarding';

  return (
    <AccountProvider>
      <PaperProvider theme={customDarkTheme}>
        <NavigationContainer
          ref={navigationRef}
          theme={customNavigationTheme}
          linking={{
            prefixes: ['nuvio://'],
            config: {
              screens: {
                ScraperSettings: {
                  path: 'repo',
                },
              },
            },
          }}
        >
          <DownloadsProvider>
            <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
              <StatusBar style="light" />
              {!isAppReady && <SplashScreen onFinish={handleSplashComplete} />}
              {shouldShowApp && <AppNavigator initialRouteName={initialRouteName} />}
              <UpdatePopup
                visible={showUpdatePopup}
                updateInfo={updateInfo}
                onUpdateNow={handleUpdateNow}
                onUpdateLater={handleUpdateLater}
                onDismiss={handleDismiss}
                isInstalling={isInstalling}
              />
              <MajorUpdateOverlay
                visible={githubUpdate.visible}
                latestTag={githubUpdate.latestTag}
                releaseNotes={githubUpdate.releaseNotes}
                releaseUrl={githubUpdate.releaseUrl}
                onDismiss={githubUpdate.onDismiss}
                onLater={githubUpdate.onLater}
                onUpdateAction={handleGithubUpdateAction}
                isDownloading={isDownloadingGitHub}
                downloadProgress={downloadProgress}
              />
              <CampaignManager />
            </View>
          </DownloadsProvider>
        </NavigationContainer>
      </PaperProvider>
    </AccountProvider>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <GenreProvider>
            <CatalogProvider>
              <TraktProvider>
                <ThemeProvider>
                  <TrailerProvider>
                    <ToastProvider>
                      <ThemedApp />
                    </ToastProvider>
                  </TrailerProvider>
                </ThemeProvider>
              </TraktProvider>
            </CatalogProvider>
          </GenreProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default Sentry.wrap(App);