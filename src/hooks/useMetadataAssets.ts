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
  
  // State for logo loading
  const [logoLoadError, setLogoLoadError] = useState(false);
  const logoFetchInProgress = useRef<boolean>(false);
  const logoRefreshCounter = useRef<number>(0);
  const MAX_LOGO_REFRESHES = 2;
  const forcedLogoRefreshDone = useRef<boolean>(false);
  
  // For TMDB ID tracking
  const [foundTmdbId, setFoundTmdbId] = useState<string | null>(null);
  
  // Force reset when preference changes
  useEffect(() => {
    // Reset all cached data when preference changes
    setBannerImage(null);
    setBannerSource(null);
    forcedBannerRefreshDone.current = false;
    forcedLogoRefreshDone.current = false;
    logoRefreshCounter.current = 0;
    
    // Force logo refresh on preference change
    if (metadata?.logo) {
      const currentLogoIsExternal = isTmdbUrl(metadata.logo);
      const currentLogoIsTmdb = isTmdbUrl(metadata.logo);
      const preferenceIsMetahub = settings.logoSourcePreference === 'metahub';

      // Always clear logo on preference change to force proper refresh
      setMetadata((prevMetadata: any) => ({
        ...prevMetadata!,
        logo: undefined
      }));
    }
  }, [settings.logoSourcePreference, setMetadata]);

  // Original reset logo load error effect
  useEffect(() => {
    setLogoLoadError(false);
  }, [metadata?.logo]);

  // Optimized logo fetching
  useEffect(() => {
    const logoPreference = settings.logoSourcePreference || 'tmdb';
    const currentLogoUrl = metadata?.logo;
    let shouldFetchLogo = false;

    // If enrichment is disabled, use addon logo and don't fetch from external sources
    if (!settings.enrichMetadataWithTMDB) {
      // If we have an addon logo, use it and don't fetch external logos
      if (metadata?.logo && !isTmdbUrl(metadata.logo)) {
        // This is an addon logo, keep it
        return;
      }
      // If no addon logo, don't fetch external logos when enrichment is disabled
      return;
    }

    // Determine if we need to fetch a new logo (only when enrichment is enabled)
    if (!currentLogoUrl) {
      shouldFetchLogo = true;
    } else {
      const isCurrentLogoExternal = isTmdbUrl(currentLogoUrl);
      const isCurrentLogoTmdb = isTmdbUrl(currentLogoUrl);
      
      if (logoPreference === 'tmdb' && !isCurrentLogoTmdb) {
        shouldFetchLogo = true;
      }
    }
    
    // Guard against infinite loops by checking if we're already fetching
    if (shouldFetchLogo && !logoFetchInProgress.current) {
      logoFetchInProgress.current = true;
      
      const fetchLogo = async () => {
        // Clear existing logo before fetching new one to avoid briefly showing wrong logo
        if (shouldFetchLogo) {
          setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: undefined }));
        }
        
        try {
          const preferredLanguage = settings.tmdbLanguagePreference || 'en';
          
          if (logoPreference === 'tmdb') {
            // TMDB path - optimized flow
            let tmdbId: string | null = null;
            let contentType = type === 'series' ? 'tv' : 'movie';
            
            // Extract or find TMDB ID in one step
            if (id.startsWith('tmdb:')) {
              tmdbId = id.split(':')[1];
            } else if (imdbId && settings.enrichMetadataWithTMDB) {
              try {
                const tmdbService = TMDBService.getInstance();
                const foundId = await tmdbService.findTMDBIdByIMDB(imdbId);
                if (foundId) {
                  tmdbId = String(foundId);
                  setFoundTmdbId(tmdbId); // Save for banner fetching
                }
              } catch (error) {
                // Handle error silently
              }
            } else {
              const parsedId = parseInt(id, 10);
              if (!isNaN(parsedId)) {
                tmdbId = String(parsedId);
              }
            }
            
            if (tmdbId) {
              try {
                // Direct fetch - avoid multiple service calls
                const tmdbService = TMDBService.getInstance();
                const logoUrl = await tmdbService.getContentLogo(contentType as 'tv' | 'movie', tmdbId, preferredLanguage);
                  
                if (logoUrl) {
                  // Preload the image
                  FastImage.preload([{ uri: logoUrl }]);
                  
                  setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: logoUrl }));
                }
              } catch (error) {
                // Handle error silently
              }
            }
          }
        } catch (error) {
          // Handle error silently
        } finally {
          logoFetchInProgress.current = false;
        }
      };
      
      // Execute fetch without awaiting
      fetchLogo();
    }
  }, [
    id, 
    type, 
    imdbId, 
    metadata?.logo,
    settings.logoSourcePreference, 
    settings.tmdbLanguagePreference,
    settings.enrichMetadataWithTMDB,
    setMetadata
  ]);

  // Optimized banner fetching
  const fetchBanner = useCallback(async () => {
    if (!metadata) return;
    
    setLoadingBanner(true);
    
    // Show fallback banner immediately to prevent blank state
    const fallbackBanner = metadata?.banner || metadata?.poster || null;
    if (fallbackBanner && !bannerImage) {
      setBannerImage(fallbackBanner);
      setBannerSource('default');
    }
    
    // If enrichment is disabled, use addon banner and don't fetch from external sources
    if (!settings.enrichMetadataWithTMDB) {
      const addonBanner = metadata?.banner || metadata?.poster || null;
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
            else if (details?.poster_path) {
              finalBanner = tmdbService.getImageUrl(details.poster_path);
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
      
      // Final fallback to metadata
      if (!finalBanner) {
        finalBanner = metadata?.banner || metadata?.poster || null;
        bannerSourceType = 'default';
      }
      
      // Update state if the banner changed
      if (finalBanner !== bannerImage || bannerSourceType !== bannerSource) {
        setBannerImage(finalBanner);
        setBannerSource(bannerSourceType);
      }
      
      forcedBannerRefreshDone.current = true;
    } catch (error) {
      // Use default banner on error
      const defaultBanner = metadata?.banner || metadata?.poster || null;
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
    logoLoadError,
    foundTmdbId,
    setLogoLoadError,
    setBannerImage,
    bannerSource,
  };
}; 