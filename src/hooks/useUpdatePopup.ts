import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import UpdateService, { UpdateInfo } from '../services/updateService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UseUpdatePopupReturn {
  showUpdatePopup: boolean;
  updateInfo: UpdateInfo;
  isInstalling: boolean;
  checkForUpdates: () => Promise<void>;
  handleUpdateNow: () => Promise<void>;
  handleUpdateLater: () => void;
  handleDismiss: () => void;
}

const UPDATE_POPUP_STORAGE_KEY = '@update_popup_dismissed';
const UPDATE_LATER_STORAGE_KEY = '@update_later_timestamp';
const UPDATE_LAST_CHECK_TS_KEY = '@update_last_check_ts';

export const useUpdatePopup = (): UseUpdatePopupReturn => {
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({ isAvailable: false });
  const [isInstalling, setIsInstalling] = useState(false);

  const checkForUpdates = useCallback(async () => {
    try {
      // Check if user has dismissed the popup for this version
      const dismissedVersion = await AsyncStorage.getItem(UPDATE_POPUP_STORAGE_KEY);
      const currentVersion = updateInfo.manifest?.id;
      
      if (dismissedVersion === currentVersion) {
        return; // User already dismissed this version
      }

      // Check if user chose "later" recently (within 24 hours)
      const updateLaterTimestamp = await AsyncStorage.getItem(UPDATE_LATER_STORAGE_KEY);
      if (updateLaterTimestamp) {
        const laterTime = parseInt(updateLaterTimestamp);
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        if (now - laterTime < twentyFourHours) {
          return; // User chose "later" recently
        }
      }

      const info = await UpdateService.checkForUpdates();
      setUpdateInfo(info);
      
      if (info.isAvailable) {
        setShowUpdatePopup(true);
      }
    } catch (error) {
      if (__DEV__) console.error('Error checking for updates:', error);
      // Don't show popup on error, just log it
    }
  }, [updateInfo.manifest?.id]);

  const handleUpdateNow = useCallback(async () => {
    try {
      setIsInstalling(true);
      setShowUpdatePopup(false);
      
      const success = await UpdateService.downloadAndInstallUpdate();
      
      if (success) {
        Alert.alert(
          'Update Installed',
          'The update has been installed successfully. Please restart the app to apply the changes.',
          [
            {
              text: 'Restart Later',
              style: 'cancel',
            },
            {
              text: 'Restart Now',
              onPress: () => {
                // On React Native, we can't programmatically restart the app
                // The user will need to manually restart
                Alert.alert(
                  'Restart Required',
                  'Please close and reopen the app to complete the update.'
                );
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Update Failed',
          'Unable to install the update. Please try again later or check your internet connection.'
        );
        // Show popup again after failed installation
        setShowUpdatePopup(true);
      }
    } catch (error) {
      if (__DEV__) console.error('Error installing update:', error);
      Alert.alert(
        'Update Error',
        'An error occurred while installing the update. Please try again later.'
      );
      // Show popup again after error
      setShowUpdatePopup(true);
    } finally {
      setIsInstalling(false);
    }
  }, []);

  const handleUpdateLater = useCallback(async () => {
    try {
      // Store timestamp when user chose "later"
      await AsyncStorage.setItem(UPDATE_LATER_STORAGE_KEY, Date.now().toString());
      setShowUpdatePopup(false);
    } catch (error) {
      if (__DEV__) console.error('Error storing update later preference:', error);
      setShowUpdatePopup(false);
    }
  }, []);

  const handleDismiss = useCallback(async () => {
    try {
      // Store the current version ID so we don't show popup again for this version
      const currentVersion = updateInfo.manifest?.id;
      if (currentVersion) {
        await AsyncStorage.setItem(UPDATE_POPUP_STORAGE_KEY, currentVersion);
      }
      setShowUpdatePopup(false);
    } catch (error) {
      if (__DEV__) console.error('Error storing dismiss preference:', error);
      setShowUpdatePopup(false);
    }
  }, [updateInfo.manifest?.id]);

  // Auto-check for updates when hook is first used
  useEffect(() => {
    // Add a small delay to ensure the app is fully loaded
    const timer = setTimeout(() => {
      (async () => {
        try {
          const lastCheckTs = await AsyncStorage.getItem(UPDATE_LAST_CHECK_TS_KEY);
          const last = lastCheckTs ? parseInt(lastCheckTs, 10) : 0;
          const now = Date.now();
          const twentyFourHours = 24 * 60 * 60 * 1000;
          if (now - last < twentyFourHours) {
            return; // Throttle: only auto-check once per 24h
          }
          await checkForUpdates();
          await AsyncStorage.setItem(UPDATE_LAST_CHECK_TS_KEY, String(now));
        } catch {
          // ignore
        }
      })();
    }, 2000); // 2 second delay

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  return {
    showUpdatePopup,
    updateInfo,
    isInstalling,
    checkForUpdates,
    handleUpdateNow,
    handleUpdateLater,
    handleDismiss,
  };
};
