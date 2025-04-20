import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

const CATALOG_CUSTOM_NAMES_KEY = 'catalog_custom_names';

// Initialize cache as an empty object
let customNamesCache: { [key: string]: string } = {};
let cacheTimestamp: number = 0; // 0 indicates cache is invalid/empty initially
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function loadCustomNamesIfNeeded(): Promise<{ [key: string]: string }> {
    const now = Date.now();
    // Check if cache is valid based on timestamp
    if (cacheTimestamp > 0 && (now - cacheTimestamp < CACHE_DURATION)) {
        return customNamesCache; // Cache is valid and guaranteed to be an object
    }

    try {
        logger.info('Loading custom catalog names from storage...');
        const savedCustomNamesJson = await AsyncStorage.getItem(CATALOG_CUSTOM_NAMES_KEY);
        // Assign parsed object or empty object if null/error
        customNamesCache = savedCustomNamesJson ? JSON.parse(savedCustomNamesJson) : {};
        cacheTimestamp = now; // Set timestamp only on successful load
        return customNamesCache;
    } catch (error) {
        logger.error('Failed to load custom catalog names in utility:', error);
        // Invalidate cache timestamp on error
        cacheTimestamp = 0;
        // Return the last known cache (which might be empty {}), or a fresh empty object
        return customNamesCache || {}; // Return cache (could be outdated but non-null) or empty {}
    }
}

export async function getCatalogDisplayName(addonId: string, type: string, catalogId: string, originalName: string): Promise<string> {
    // Ensure cache is loaded/refreshed before getting name
    const customNames = await loadCustomNamesIfNeeded(); 
    const key = `${addonId}:${type}:${catalogId}`;
    return customNames[key] || originalName;
}

// Function to clear the cache if settings are updated elsewhere
export function clearCustomNameCache() {
    customNamesCache = {}; // Reset to empty object
    cacheTimestamp = 0; // Invalidate timestamp
    logger.info('Custom catalog name cache cleared.');
} 