import { useState, useEffect, useCallback } from 'react';
import { syncService } from '../services/SyncService';
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

export interface CustomThemeDef {
  id: string;
  name: string;
  colors: { primary: string; secondary: string; darkBackground: string };
  isEditable: boolean;
}

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
  heroStyle: 'legacy' | 'carousel';
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
  // Theme settings
  themeId: string;
  customThemes: CustomThemeDef[];
  useDominantBackgroundColor: boolean;
  // Home screen poster customization
  posterSize: 'small' | 'medium' | 'large'; // Predefined sizes
  posterBorderRadius: number; // 0-20 range for border radius
  postersPerRow: number; // 3-6 range for number of posters per row
  // Home screen content item
  showPosterTitles: boolean; // Show text titles under posters
  // Home screen background behavior
  enableHomeHeroBackground: boolean; // Enable dynamic hero background on Home
  // Trailer settings
  showTrailers: boolean; // Enable/disable trailer playback in hero section
  trailerMuted: boolean; // Default to muted for better user experience
  // AI
  aiChatEnabled: boolean; // Enable/disable Ask AI and AI features
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
  heroStyle: 'carousel',
  selectedHeroCatalogs: [], // Empty array means all catalogs are selected
  logoSourcePreference: 'metahub', // Default to Metahub as first source
  tmdbLanguagePreference: 'en', // Default to English
  episodeLayoutStyle: 'vertical', // Default to vertical layout for new installs
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
  alwaysResume: true,
  // Theme defaults
  themeId: 'default',
  customThemes: [],
  useDominantBackgroundColor: false,
  // Home screen poster customization
  posterSize: 'medium',
  posterBorderRadius: 12,
  postersPerRow: 4,
  showPosterTitles: true,
  enableHomeHeroBackground: true,
  // Trailer settings
  showTrailers: true, // Enable trailers by default
  trailerMuted: true, // Default to muted for better user experience
  // AI
  aiChatEnabled: false,
};

const SETTINGS_STORAGE_KEY = 'app_settings';

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

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
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const scopedKey = `@user:${scope}:${SETTINGS_STORAGE_KEY}`;
      const [scopedJson, legacyJson] = await Promise.all([
        AsyncStorage.getItem(scopedKey),
        AsyncStorage.getItem(SETTINGS_STORAGE_KEY),
      ]);
      const parsedScoped = scopedJson ? JSON.parse(scopedJson) : null;
      const parsedLegacy = legacyJson ? JSON.parse(legacyJson) : null;

      let merged = parsedScoped || parsedLegacy;

      // Fallback: scan any existing user-scoped settings if current scope not set yet
      if (!merged) {
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const candidateKeys = (allKeys || []).filter(k => k.endsWith(`:${SETTINGS_STORAGE_KEY}`));
          if (candidateKeys.length > 0) {
            const pairs = await AsyncStorage.multiGet(candidateKeys);
            for (const [, value] of pairs) {
              if (value) {
                try {
                  const candidate = JSON.parse(value);
                  if (candidate && typeof candidate === 'object') {
                    merged = candidate;
                    break;
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }

      if (merged) setSettings({ ...DEFAULT_SETTINGS, ...merged });
      else setSettings(DEFAULT_SETTINGS);
    } catch (error) {
      if (__DEV__) console.error('Failed to load settings:', error);
      // Fallback to default settings on error
      setSettings(DEFAULT_SETTINGS);
    }
    finally {
      // Mark settings as loaded so UI can render with correct values without flicker
      setIsLoaded(true);
    }
  };

  const updateSetting = useCallback(async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
    emitEvent: boolean = true
  ) => {
    const newSettings = { ...settings, [key]: value };
    try {
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const scopedKey = `@user:${scope}:${SETTINGS_STORAGE_KEY}`;
      // Write to both scoped key (multi-user aware) and legacy key for backward compatibility
      await Promise.all([
        AsyncStorage.setItem(scopedKey, JSON.stringify(newSettings)),
        AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings)),
      ]);
      // Ensure a current scope exists to avoid future loads missing the chosen scope
      await AsyncStorage.setItem('@user:current', scope);
      setSettings(newSettings);
      if (__DEV__) console.log(`Setting updated: ${key}`, value);
      
      // Notify all subscribers that settings have changed (if requested)
      if (emitEvent) {
        if (__DEV__) console.log('Emitting settings change event');
        settingsEmitter.emit();
      }

      // If authenticated, push settings to server to prevent overwrite on next pull
      try { syncService.pushSettings(); } catch {}
    } catch (error) {
      if (__DEV__) console.error('Failed to save settings:', error);
    }
  }, [settings]);

  return {
    settings,
    updateSetting,
    isLoaded,
  };
};

export default useSettings;