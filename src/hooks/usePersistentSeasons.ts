import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const SEASONS_STORAGE_KEY = 'selected_seasons';

interface SeasonsCache {
  seasons: { [seriesId: string]: number };
  lastUpdate: number;
}

// Simple in-memory cache to avoid repeated AsyncStorage reads within the same session
let cache: SeasonsCache | null = null;

export function usePersistentSeasons() {
  const [selectedSeasons, setSelectedSeasons] = useState<{ [seriesId: string]: number } | null>(cache?.seasons || null);
  const [isLoading, setIsLoading] = useState(!cache); // Only loading if cache is empty

  const loadSelectedSeasons = useCallback(async () => {
    // Check if cache is recent enough (within last 5 minutes)
    const now = Date.now();
    if (cache && (now - cache.lastUpdate < 5 * 60 * 1000)) {
      if (!selectedSeasons) setSelectedSeasons(cache.seasons); // Ensure state is updated if cache existed
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const savedSeasonsJson = await AsyncStorage.getItem(SEASONS_STORAGE_KEY);
      const loadedSeasons = savedSeasonsJson ? JSON.parse(savedSeasonsJson) : {};
      setSelectedSeasons(loadedSeasons);
      // Update cache
      cache = { seasons: loadedSeasons, lastUpdate: now };
    } catch (error) {
      logger.error('Failed to load persistent seasons:', error);
      setSelectedSeasons({}); // Set to empty object on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSelectedSeasons();
  }, [loadSelectedSeasons]);

  const saveSeason = useCallback(async (seriesId: string, seasonNumber: number) => {
    if (!selectedSeasons) return;
    
    try {
      const updatedSeasons = {
        ...selectedSeasons,
        [seriesId]: seasonNumber
      };
      
      // Update the cache
      cache = {
        seasons: updatedSeasons,
        lastUpdate: Date.now()
      };
      
      // Update state
      setSelectedSeasons(updatedSeasons);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(SEASONS_STORAGE_KEY, JSON.stringify(updatedSeasons));
    } catch (error) {
      logger.error('Failed to save selected season:', error);
    }
  }, [selectedSeasons]);

  const getSeason = useCallback((seriesId: string, defaultSeason: number = 1): number => {
    if (isLoading || !selectedSeasons) {
      return defaultSeason;
    }
    return selectedSeasons[seriesId] || defaultSeason;
  }, [selectedSeasons, isLoading]);

  return { 
    getSeason, 
    saveSeason, 
    isLoadingSeasons: isLoading, 
    refreshSeasons: loadSelectedSeasons 
  };
} 