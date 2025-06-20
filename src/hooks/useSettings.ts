import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simple event emitter for settings changes
class SettingsEventEmitter {
  private listeners: Array<() => void> = [];

  addListener(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit() {
    this.listeners.forEach(listener => listener());
  }
}

// Singleton instance for app-wide access
export const settingsEmitter = new SettingsEventEmitter();

export interface AppSettings {
  enableDarkMode: boolean;
  enableNotifications: boolean;
  streamQuality: 'auto' | 'low' | 'medium' | 'high';
  enableSubtitles: boolean;
  enableBackgroundPlayback: boolean;
  cacheLimit: number;
  useExternalPlayer: boolean;
  preferredPlayer: 'internal' | 'vlc' | 'infuse' | 'outplayer' | 'vidhub' | 'external';
  showHeroSection: boolean;
  featuredContentSource: 'tmdb' | 'catalogs';
  selectedHeroCatalogs: string[]; // Array of catalog IDs to display in hero section
  logoSourcePreference: 'metahub' | 'tmdb'; // Preferred source for title logos
  tmdbLanguagePreference: string; // Preferred language for TMDB logos (ISO 639-1 code)
  enableInternalProviders: boolean; // Toggle for internal providers like HDRezka
  episodeLayoutStyle: 'vertical' | 'horizontal'; // Layout style for episode cards
  autoplayBestStream: boolean; // Automatically play the best available stream
}

export const DEFAULT_SETTINGS: AppSettings = {
  enableDarkMode: true,
  enableNotifications: true,
  streamQuality: 'auto',
  enableSubtitles: true,
  enableBackgroundPlayback: false,
  cacheLimit: 1024,
  useExternalPlayer: false,
  preferredPlayer: 'internal',
  showHeroSection: true,
  featuredContentSource: 'tmdb',
  selectedHeroCatalogs: [], // Empty array means all catalogs are selected
  logoSourcePreference: 'metahub', // Default to Metahub as first source
  tmdbLanguagePreference: 'en', // Default to English
  enableInternalProviders: true, // Enable internal providers by default
  episodeLayoutStyle: 'horizontal', // Default to the new horizontal layout
  autoplayBestStream: false, // Disabled by default for user choice
};

const SETTINGS_STORAGE_KEY = 'app_settings';

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadSettings();
    
    // Subscribe to settings changes
    const unsubscribe = settingsEmitter.addListener(() => {
      loadSettings();
    });
    
    return unsubscribe;
  }, []);

  const loadSettings = async () => {
    try {
      const storedSettings = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (storedSettings) {
        setSettings(JSON.parse(storedSettings));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const updateSetting = useCallback(async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
    emitEvent: boolean = true
  ) => {
    const newSettings = { ...settings, [key]: value };
    try {
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
      console.log(`Setting updated: ${key}`, value);
      
      // Notify all subscribers that settings have changed (if requested)
      if (emitEvent) {
        console.log('Emitting settings change event');
        settingsEmitter.emit();
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [settings]);

  return {
    settings,
    updateSetting,
  };
};

export default useSettings;