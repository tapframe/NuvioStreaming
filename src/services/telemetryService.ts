/**
 * Telemetry Service
 * 
 * Manages user preferences for telemetry, analytics, and error reporting.
 * Provides a central opt-out mechanism for privacy-conscious users.
 * 
 * Data Collection Overview:
 * - Analytics (PostHog): Page views, interactions, session data, device metadata
 * - Error Reporting (Sentry): Crash reports, errors, breadcrumbs, device info
 * - Session Replay: Screen recordings on errors (disabled by default)
 * 
 * Privacy-First Defaults:
 * - Analytics: Disabled by default
 * - Error Reporting: Enabled (no PII) by default for stability
 * - Session Replay: Disabled by default
 * - PII Collection: Disabled by default
 */

import { mmkvStorage } from './mmkvStorage';
import { DeviceEventEmitter } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

// Direct MMKV access for synchronous reads (needed for Sentry beforeSend)
const directMMKV = createMMKV();

// Storage keys for telemetry preferences
const TELEMETRY_KEYS = {
  ANALYTICS_ENABLED: 'telemetry_analytics_enabled',
  ERROR_REPORTING_ENABLED: 'telemetry_error_reporting_enabled',
  SESSION_REPLAY_ENABLED: 'telemetry_session_replay_enabled',
  PII_ENABLED: 'telemetry_pii_enabled',
  TELEMETRY_INITIALIZED: 'telemetry_initialized',
} as const;

// Event names for telemetry changes
export const TELEMETRY_EVENTS = {
  SETTINGS_CHANGED: 'telemetry_settings_changed',
} as const;

export interface TelemetrySettings {
  analyticsEnabled: boolean;
  errorReportingEnabled: boolean;
  sessionReplayEnabled: boolean;
  piiEnabled: boolean;
}

// Default settings - Privacy-first approach
const DEFAULT_SETTINGS: TelemetrySettings = {
  analyticsEnabled: false, // Disabled by default - user must opt-in
  errorReportingEnabled: true, // Enabled for app stability, but without PII
  sessionReplayEnabled: false, // Disabled by default - high privacy impact
  piiEnabled: false, // Never send PII by default
};

/**
 * Synchronously read a setting directly from MMKV
 * Used by Sentry's beforeSend hook which runs synchronously
 */
function readSettingSync(key: string): string | undefined {
  try {
    return directMMKV.getString(key);
  } catch {
    return undefined;
  }
}

/**
 * Check if error reporting is enabled (synchronous version for Sentry)
 * This is called from Sentry's beforeSend hook
 */
export function isErrorReportingEnabledSync(): boolean {
  const value = readSettingSync(TELEMETRY_KEYS.ERROR_REPORTING_ENABLED);
  // Default to true if not set (privacy-safe default for stability)
  return value !== 'false';
}

class TelemetryService {
  private static instance: TelemetryService;
  private settings: TelemetrySettings = { ...DEFAULT_SETTINGS };
  private initialized = false;

  private constructor() {
    // Synchronously load settings on construction for immediate availability
    this.loadSettingsSync();
  }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Synchronously load settings from MMKV (for immediate availability)
   */
  private loadSettingsSync(): void {
    try {
      const analytics = readSettingSync(TELEMETRY_KEYS.ANALYTICS_ENABLED);
      const errorReporting = readSettingSync(TELEMETRY_KEYS.ERROR_REPORTING_ENABLED);
      const sessionReplay = readSettingSync(TELEMETRY_KEYS.SESSION_REPLAY_ENABLED);
      const pii = readSettingSync(TELEMETRY_KEYS.PII_ENABLED);

      this.settings = {
        analyticsEnabled: analytics === 'true',
        errorReportingEnabled: errorReporting !== 'false', // Default true
        sessionReplayEnabled: sessionReplay === 'true',
        piiEnabled: pii === 'true',
      };
    } catch (error) {
      console.error('[TelemetryService] Error loading settings sync:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Initialize telemetry service and load saved preferences
   */
  async initialize(): Promise<TelemetrySettings> {
    if (this.initialized) {
      return this.settings;
    }

    try {
      // Check if this is first run (no telemetry preferences saved yet)
      const telemetryInitialized = await mmkvStorage.getItem(TELEMETRY_KEYS.TELEMETRY_INITIALIZED);
      
      if (telemetryInitialized !== 'true') {
        // First run - use defaults and mark as initialized
        await this.saveSettings(DEFAULT_SETTINGS);
        await mmkvStorage.setItem(TELEMETRY_KEYS.TELEMETRY_INITIALIZED, 'true');
        this.settings = { ...DEFAULT_SETTINGS };
      } else {
        // Load saved preferences
        const [analytics, errorReporting, sessionReplay, pii] = await Promise.all([
          mmkvStorage.getItem(TELEMETRY_KEYS.ANALYTICS_ENABLED),
          mmkvStorage.getItem(TELEMETRY_KEYS.ERROR_REPORTING_ENABLED),
          mmkvStorage.getItem(TELEMETRY_KEYS.SESSION_REPLAY_ENABLED),
          mmkvStorage.getItem(TELEMETRY_KEYS.PII_ENABLED),
        ]);

        this.settings = {
          analyticsEnabled: analytics === 'true',
          errorReportingEnabled: errorReporting !== 'false', // Default true if not explicitly disabled
          sessionReplayEnabled: sessionReplay === 'true',
          piiEnabled: pii === 'true',
        };
      }

      this.initialized = true;
      console.log('[TelemetryService] Initialized with settings:', this.settings);
    } catch (error) {
      console.error('[TelemetryService] Error initializing:', error);
      // Use defaults on error
      this.settings = { ...DEFAULT_SETTINGS };
      this.initialized = true;
    }

    return this.settings;
  }

  /**
   * Get current telemetry settings
   */
  getSettings(): TelemetrySettings {
    return { ...this.settings };
  }

  /**
   * Check if analytics is enabled
   */
  isAnalyticsEnabled(): boolean {
    return this.settings.analyticsEnabled;
  }

  /**
   * Check if error reporting is enabled
   */
  isErrorReportingEnabled(): boolean {
    return this.settings.errorReportingEnabled;
  }

  /**
   * Check if session replay is enabled
   */
  isSessionReplayEnabled(): boolean {
    return this.settings.sessionReplayEnabled;
  }

  /**
   * Check if PII collection is enabled
   */
  isPiiEnabled(): boolean {
    return this.settings.piiEnabled;
  }

  /**
   * Update analytics setting
   */
  async setAnalyticsEnabled(enabled: boolean): Promise<void> {
    this.settings.analyticsEnabled = enabled;
    await mmkvStorage.setItem(TELEMETRY_KEYS.ANALYTICS_ENABLED, enabled.toString());
    this.emitSettingsChanged();
    console.log('[TelemetryService] Analytics enabled:', enabled);
  }

  /**
   * Update error reporting setting
   */
  async setErrorReportingEnabled(enabled: boolean): Promise<void> {
    this.settings.errorReportingEnabled = enabled;
    await mmkvStorage.setItem(TELEMETRY_KEYS.ERROR_REPORTING_ENABLED, enabled.toString());
    this.emitSettingsChanged();
    console.log('[TelemetryService] Error reporting enabled:', enabled);
  }

  /**
   * Update session replay setting
   */
  async setSessionReplayEnabled(enabled: boolean): Promise<void> {
    this.settings.sessionReplayEnabled = enabled;
    await mmkvStorage.setItem(TELEMETRY_KEYS.SESSION_REPLAY_ENABLED, enabled.toString());
    this.emitSettingsChanged();
    console.log('[TelemetryService] Session replay enabled:', enabled);
  }

  /**
   * Update PII collection setting
   */
  async setPiiEnabled(enabled: boolean): Promise<void> {
    this.settings.piiEnabled = enabled;
    await mmkvStorage.setItem(TELEMETRY_KEYS.PII_ENABLED, enabled.toString());
    this.emitSettingsChanged();
    console.log('[TelemetryService] PII enabled:', enabled);
  }

  /**
   * Disable all telemetry (global opt-out)
   */
  async disableAllTelemetry(): Promise<void> {
    this.settings = {
      analyticsEnabled: false,
      errorReportingEnabled: false,
      sessionReplayEnabled: false,
      piiEnabled: false,
    };
    await this.saveSettings(this.settings);
    this.emitSettingsChanged();
    console.log('[TelemetryService] All telemetry disabled');
  }

  /**
   * Enable recommended telemetry (error reporting only, no PII)
   */
  async enableRecommendedTelemetry(): Promise<void> {
    this.settings = {
      analyticsEnabled: false,
      errorReportingEnabled: true,
      sessionReplayEnabled: false,
      piiEnabled: false,
    };
    await this.saveSettings(this.settings);
    this.emitSettingsChanged();
    console.log('[TelemetryService] Recommended telemetry enabled');
  }

  /**
   * Reset to default settings
   */
  async resetToDefaults(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.saveSettings(this.settings);
    this.emitSettingsChanged();
    console.log('[TelemetryService] Reset to defaults');
  }

  /**
   * Save all settings to storage
   */
  private async saveSettings(settings: TelemetrySettings): Promise<void> {
    await Promise.all([
      mmkvStorage.setItem(TELEMETRY_KEYS.ANALYTICS_ENABLED, settings.analyticsEnabled.toString()),
      mmkvStorage.setItem(TELEMETRY_KEYS.ERROR_REPORTING_ENABLED, settings.errorReportingEnabled.toString()),
      mmkvStorage.setItem(TELEMETRY_KEYS.SESSION_REPLAY_ENABLED, settings.sessionReplayEnabled.toString()),
      mmkvStorage.setItem(TELEMETRY_KEYS.PII_ENABLED, settings.piiEnabled.toString()),
    ]);
  }

  /**
   * Emit event when settings change
   */
  private emitSettingsChanged(): void {
    DeviceEventEmitter.emit(TELEMETRY_EVENTS.SETTINGS_CHANGED, this.settings);
  }

  /**
   * Get Sentry configuration based on current settings
   */
  getSentryConfig(): {
    enabled: boolean;
    sendDefaultPii: boolean;
    replaysSessionSampleRate: number;
    replaysOnErrorSampleRate: number;
  } {
    return {
      enabled: this.settings.errorReportingEnabled,
      sendDefaultPii: this.settings.piiEnabled,
      replaysSessionSampleRate: this.settings.sessionReplayEnabled ? 0.1 : 0,
      replaysOnErrorSampleRate: this.settings.sessionReplayEnabled ? 1.0 : 0,
    };
  }

  /**
   * Get PostHog configuration based on current settings
   */
  getPostHogConfig(): {
    enabled: boolean;
  } {
    return {
      enabled: this.settings.analyticsEnabled,
    };
  }
}

export const telemetryService = TelemetryService.getInstance();
export default telemetryService;
