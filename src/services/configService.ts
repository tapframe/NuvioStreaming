import { Platform } from 'react-native';

// Reuse the same base URL as campaign service
const CAMPAIGN_API_URL = process.env.EXPO_PUBLIC_CAMPAIGN_API_URL || 'http://localhost:3000';

export interface SettingsConfig {
    categories?: {
        [key: string]: {
            visible?: boolean;
            order?: number;
            title?: string;
        }
    };
    items?: {
        [key: string]: {
            visible?: boolean;
            [key: string]: any;
        }
    };
}

class ConfigService {
    private configCache: Record<string, any> = {};

    async getConfig<T>(key: string): Promise<T | null> {
        // Return memory cache if available (fetch once per session)
        if (this.configCache[key]) {
            return this.configCache[key] as T;
        }

        try {
            console.log(`[ConfigService] Fetching config for key: ${key}`);
            const response = await fetch(`${CAMPAIGN_API_URL}/api/config?key=${key}`);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            // If data is empty object, return null
            if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
                return null;
            }

            this.configCache[key] = data;
            return data as T;
        } catch (error) {
            console.warn('[ConfigService] Error fetching config:', error);
            return null;
        }
    }

    async getSettingsConfig(): Promise<SettingsConfig | null> {
        return this.getConfig<SettingsConfig>('settings_screen');
    }
}

export const configService = new ConfigService();
