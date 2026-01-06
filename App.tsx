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
  LogBox
} from 'react-native';
import './src/i18n'; // Initialize i18n
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Provider as PaperProvider } from 'react-native-paper';
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
import AnnouncementOverlay from './src/components/AnnouncementOverlay';
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
  const [showAnnouncement, setShowAnnouncement] = useState(false);

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

  // Announcement data
  const announcements = [
    {
      icon: 'zap',
      title: 'Debrid Integration',
      description: 'Unlock 4K high-quality streams with lightning-fast speeds. Connect your TorBox account to access cached premium content with zero buffering.',
      tag: 'NEW',
    },
  ];

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

        // Check if announcement should be shown (version 1.0.0)
        const announcementShown = await mmkvStorage.getItem('announcement_v1.0.0_shown');
        if (!announcementShown && onboardingCompleted === 'true') {
          // Show announcement only after app is ready
          setTimeout(() => {
            setShowAnnouncement(true);
          }, 1000);
        }

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

  // Handler for navigating to debrid integration
  const handleNavigateToDebrid = () => {
    if (navigationRef.current) {
      navigationRef.current.navigate('DebridIntegration');
    }
  };

  // Handler for announcement close
  const handleAnnouncementClose = async () => {
    setShowAnnouncement(false);
    // Mark announcement as shown
    await mmkvStorage.setItem('announcement_v1.0.0_shown', 'true');
  };

  // Don't render anything until we know the onboarding status
  const shouldShowApp = isAppReady && hasCompletedOnboarding !== null;
  const initialRouteName = hasCompletedOnboarding ? 'MainTabs' : 'Onboarding';

  return (
    <AccountProvider>
      <PaperProvider theme={customDarkTheme}>
        <NavigationContainer
          ref={navigationRef}
          theme={customNavigationTheme}
          linking={undefined}
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
              />
              <AnnouncementOverlay
                visible={showAnnouncement}
                announcements={announcements}
                onClose={handleAnnouncementClose}
                onActionPress={handleNavigateToDebrid}
                actionButtonText="Connect Now"
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default Sentry.wrap(App);