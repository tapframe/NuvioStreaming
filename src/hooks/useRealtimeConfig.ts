import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { configService, SettingsConfig } from '../services/configService';

export const useRealtimeConfig = () => {
    const [config, setConfig] = useState<SettingsConfig | null>(null);

    const loadConfig = useCallback(async () => {
        try {
            const fetchedConfig = await configService.getSettingsConfig();

            // Deep compare to avoid unnecessary re-renders
            setConfig(prev => {
                const prevStr = JSON.stringify(prev);
                const newStr = JSON.stringify(fetchedConfig);
                return prevStr === newStr ? prev : fetchedConfig;
            });
        } catch (error) {
            if (__DEV__) console.warn('Config fetch failed', error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadConfig(); // Fetch on focus (will use memory cache if available)
        }, [loadConfig])
    );

    return config;
};
