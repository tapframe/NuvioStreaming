import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const CATALOG_CUSTOM_NAMES_KEY = 'catalog_custom_names';

interface CustomNamesCache {
  names: { [key: string]: string };
  lastUpdate: number;
}

// Simple in-memory cache to avoid repeated AsyncStorage reads within the same session
let cache: CustomNamesCache | null = null;

export function useCustomCatalogNames() {
  const [customNames, setCustomNames] = useState<{ [key: string]: string } | null>(cache?.names || null);
  const [isLoading, setIsLoading] = useState(!cache); // Only loading if cache is empty

  const loadCustomNames = useCallback(async () => {
    // Check if cache is recent enough (e.g., within last 5 minutes) - adjust as needed
    const now = Date.now();
    if (cache && (now - cache.lastUpdate < 5 * 60 * 1000)) {
      if (!customNames) setCustomNames(cache.names); // Ensure state is updated if cache existed
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const savedCustomNamesJson = await AsyncStorage.getItem(CATALOG_CUSTOM_NAMES_KEY);
      const loadedNames = savedCustomNamesJson ? JSON.parse(savedCustomNamesJson) : {};
      setCustomNames(loadedNames);
      // Update cache
      cache = { names: loadedNames, lastUpdate: now };
    } catch (error) {
      logger.error('Failed to load custom catalog names:', error);
      setCustomNames({}); // Set to empty object on error to avoid breaking lookups
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed customNames dependency to prevent re-running loop

  useEffect(() => {
    loadCustomNames();
  }, [loadCustomNames]); // Load on mount and if load function changes

  const getCustomName = useCallback((addonId: string, type: string, catalogId: string, originalName: string): string => {
    if (isLoading || !customNames) {
      // Return original name while loading or if loading failed
      return originalName;
    }
    const key = `${addonId}:${type}:${catalogId}`;
    return customNames[key] || originalName;
  }, [customNames, isLoading]);

  return { getCustomName, isLoadingCustomNames: isLoading, refreshCustomNames: loadCustomNames };
} 