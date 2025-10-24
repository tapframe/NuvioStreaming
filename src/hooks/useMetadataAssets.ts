import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';
import { TMDBService } from '../services/tmdbService';
import { isTmdbUrl } from '../utils/logoUtils';
import FastImage from '@d11/react-native-fast-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache for image availability checks
const imageAvailabilityCache: Record<string, boolean> = {};

// Helper function to check image availability with caching
const checkImageAvailability = async (url: string): Promise<boolean> => {
  // Check memory cache first
  if (imageAvailabilityCache[url] !== undefined) {
    return imageAvailabilityCache[url];
  }
  
  // Check AsyncStorage cache
  try {
    const cachedResult = await AsyncStorage.getItem(`image_available:${url}`);
    if (cachedResult !== null) {
      const isAvailable = cachedResult === 'true';
      imageAvailabilityCache[url] = isAvailable;
      return isAvailable;
    }
  } catch (error) {
    // Ignore AsyncStorage errors
  }

  // Perform actual check
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const isAvailable = response.ok;
    
    // Update caches
    imageAvailabilityCache[url] = isAvailable;
    try {
      await AsyncStorage.setItem(`image_available:${url}`, isAvailable ? 'true' : 'false');
    } catch (error) {
      // Ignore AsyncStorage errors
    }
    
    return isAvailable;
  } catch (error) {
    return false;
  }
};

export const useMetadataAssets = (
  metadata: any, 
  id: string, 
  type: string, 
  imdbId: string | null,
  settings: any,
  setMetadata: (metadata: any) => void
) => {
  // State for banner image
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [loadingBanner, setLoadingBanner] = useState<boolean>(false);
  const forcedBannerRefreshDone = useRef<boolean>(false);
  
  // Add source tracking to prevent mixing sources
  const [bannerSource, setBannerSource] = useState<'tmdb' | 'metahub' | 'default' | null>(null);
  
  // For TMDB ID tracking
  const [foundTmdbId, setFoundTmdbId] = useState<string | null>(null);
  
  // Force reset when preference changes
  useEffect(() => {
    // Reset all cached data when preference changes
    setBannerImage(null);
    setBannerSource(null);
    forcedBannerRefreshDone.current = false;
  }, [settings.logoSourcePreference]);

  // Optimized banner fetching
  const fetchBanner = useCallback(async () => {
    if (!metadata) return;
    
    setLoadingBanner(true);
    
    
    // If enrichment is disabled, use addon banner and don't fetch from external sources
    if (!settings.enrichMetadataWithTMDB) {
      const addonBanner = metadata?.banner || null;
      if (addonBanner && addonBanner !== bannerImage) {
        setBannerImage(addonBanner);
        setBannerSource('default');
      }
      setLoadingBanner(false);
      return;
    }
    
    try {
      const currentPreference = settings.logoSourcePreference || 'tmdb';
      const preferredLanguage = settings.tmdbLanguagePreference || 'en';
      const contentType = type === 'series' ? 'tv' : 'movie';
      
      // Try to get a banner from the preferred source
      let finalBanner: string | null = null;
      let bannerSourceType: 'tmdb' | 'default' = 'default';
      
      // TMDB path only
      if (currentPreference === 'tmdb') {
        let tmdbId = null;
        if (id.startsWith('tmdb:')) {
          tmdbId = id.split(':')[1];
        } else if (foundTmdbId) {
          tmdbId = foundTmdbId;
        } else if ((metadata as any).tmdbId) {
          tmdbId = (metadata as any).tmdbId;
        } else if (imdbId && settings.enrichMetadataWithTMDB) {
          try {
            const tmdbService = TMDBService.getInstance();
            const foundId = await tmdbService.findTMDBIdByIMDB(imdbId);
            if (foundId) {
              tmdbId = String(foundId);
            }
          } catch (error) {
            // Handle error silently
          }
        }
        
        if (tmdbId) {
          try {
            const tmdbService = TMDBService.getInstance();
            const endpoint = contentType === 'tv' ? 'tv' : 'movie';
            
            const details = endpoint === 'movie' 
              ? await tmdbService.getMovieDetails(tmdbId) 
              : await tmdbService.getTVShowDetails(Number(tmdbId));
            
            if (details?.backdrop_path) {
              finalBanner = tmdbService.getImageUrl(details.backdrop_path);
              bannerSourceType = 'tmdb';
              
              // Preload the image
              if (finalBanner) {
                FastImage.preload([{ uri: finalBanner }]);
              }
            }
          } catch (error) {
            // Handle error silently
          }
        }
      }
      
      // Final fallback to metadata banner only
      if (!finalBanner) {
        finalBanner = metadata?.banner || null;
        bannerSourceType = 'default';
      }
      
      // Update state if the banner changed
      if (finalBanner !== bannerImage || bannerSourceType !== bannerSource) {
        setBannerImage(finalBanner);
        setBannerSource(bannerSourceType);
      }
      
      forcedBannerRefreshDone.current = true;
    } catch (error) {
      // Use default banner on error (only addon banner)
      const defaultBanner = metadata?.banner || null;
      if (defaultBanner !== bannerImage) {
        setBannerImage(defaultBanner);
        setBannerSource('default');
      }
    } finally {
      setLoadingBanner(false);
    }
  }, [metadata, id, type, imdbId, settings.logoSourcePreference, settings.tmdbLanguagePreference, settings.enrichMetadataWithTMDB, foundTmdbId, bannerImage, bannerSource]);

  // Fetch banner when needed
  useEffect(() => {
    const currentPreference = settings.logoSourcePreference || 'tmdb';
    
    if (bannerSource !== currentPreference && !forcedBannerRefreshDone.current) {
      fetchBanner();
    }
  }, [fetchBanner, bannerSource, settings.logoSourcePreference]);

  return {
    bannerImage,
    loadingBanner,
    foundTmdbId,
    setBannerImage,
    bannerSource,
  };
}; 