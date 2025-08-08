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
  episodeLayoutStyle: 'vertical' | 'horizontal'; // Layout style for episode cards
  autoplayBestStream: boolean; // Automatically play the best available stream
  // Local scraper settings
  scraperRepositoryUrl: string; // URL to the scraper repository
  enableLocalScrapers: boolean; // Enable/disable local scraper functionality
  scraperTimeout: number; // Timeout for scraper execution in seconds
  enableScraperUrlValidation: boolean; // Enable/disable URL validation for scrapers
  streamDisplayMode: 'separate' | 'grouped'; // How to display streaming links - separately by provider or grouped under one name
  streamSortMode: 'scraper-then-quality' | 'quality-then-scraper'; // How to sort streams - by scraper first or quality first
  showScraperLogos: boolean; // Show scraper logos next to streaming links
  // Quality filtering settings
  excludedQualities: string[]; // Array of quality strings to exclude (e.g., ['2160p', '4K', '1080p', '720p'])
  // Playback behavior
  alwaysResume: boolean; // If true, resume automatically without prompt when progress < 85%
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
  featuredContentSource: 'catalogs',
  selectedHeroCatalogs: [], // Empty array means all catalogs are selected
  logoSourcePreference: 'metahub', // Default to Metahub as first source
  tmdbLanguagePreference: 'en', // Default to English
  episodeLayoutStyle: 'horizontal', // Default to the new horizontal layout
  autoplayBestStream: false, // Disabled by default for user choice
  // Local scraper defaults
  scraperRepositoryUrl: '',
  enableLocalScrapers: true,
  scraperTimeout: 60, // 60 seconds timeout
  enableScraperUrlValidation: true, // Enable URL validation by default
  streamDisplayMode: 'separate', // Default to separate display by provider
  streamSortMode: 'scraper-then-quality', // Default to current behavior (scraper first, then quality)
  showScraperLogos: true, // Show scraper logos by default
  // Quality filtering defaults
  excludedQualities: [], // No qualities excluded by default
  // Playback behavior defaults
  alwaysResume: false,
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
        const parsedSettings = JSON.parse(storedSettings);
        // Merge with defaults to ensure all properties exist
        setSettings({ ...DEFAULT_SETTINGS, ...parsedSettings });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Fallback to default settings on error
      setSettings(DEFAULT_SETTINGS);
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