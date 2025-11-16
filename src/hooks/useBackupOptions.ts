import { useState, useEffect, useCallback } from 'react';
import { mmkvStorage } from '../services/mmkvStorage';
import { BackupOptions } from '../services/backupService';
import { logger } from '../utils/logger';

interface BackupPreferences {
  includeLibrary: boolean;
  includeWatchProgress: boolean;
  includeAddons: boolean;
  includeSettings: boolean;
  includeTraktData: boolean;
  includeLocalScrapers: boolean;
  includeApiKeys: boolean;
  includeCatalogSettings: boolean;
  includeUserPreferences: boolean;
}

const DEFAULT_PREFERENCES: BackupPreferences = {
  includeLibrary: true,
  includeWatchProgress: true,
  includeAddons: true,
  includeSettings: true,
  includeTraktData: true,
  includeLocalScrapers: true,
  includeApiKeys: true,
  includeCatalogSettings: true,
  includeUserPreferences: true,
};

const STORAGE_KEY = 'backup_preferences';

export const useBackupOptions = () => {
  const [preferences, setPreferences] = useState<BackupPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences from storage
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const stored = await mmkvStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Merge with defaults to handle any missing keys
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
        }
      } catch (error) {
        logger.error('[useBackupOptions] Failed to load preferences:', error);
        setPreferences(DEFAULT_PREFERENCES);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Save preferences to storage
  const savePreferences = useCallback(async (newPreferences: BackupPreferences) => {
    try {
      await mmkvStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
    } catch (error) {
      logger.error('[useBackupOptions] Failed to save preferences:', error);
    }
  }, []);

  // Update a single preference
  const updatePreference = useCallback(
    async (key: keyof BackupPreferences, value: boolean) => {
      const newPreferences = { ...preferences, [key]: value };
      setPreferences(newPreferences);
      await savePreferences(newPreferences);
    },
    [preferences, savePreferences]
  );

  // Get backup options in the format expected by backupService
  const getBackupOptions = useCallback((): BackupOptions => {
    return {
      includeLibrary: preferences.includeLibrary,
      includeWatchProgress: preferences.includeWatchProgress,
      includeDownloads: false, // Downloads are never backed up
      includeAddons: preferences.includeAddons,
      includeSettings: preferences.includeSettings,
      includeTraktData: preferences.includeTraktData,
      includeLocalScrapers: preferences.includeLocalScrapers,
      includeApiKeys: preferences.includeApiKeys,
      includeCatalogSettings: preferences.includeCatalogSettings,
      includeUserPreferences: preferences.includeUserPreferences,
    };
  }, [preferences]);

  return {
    preferences,
    isLoading,
    updatePreference,
    getBackupOptions,
  };
};

