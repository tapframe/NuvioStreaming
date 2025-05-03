import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { TMDBService } from '../services/tmdbService';
import { isMetahubUrl, isTmdbUrl } from '../utils/logoUtils';

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
      const currentLogoIsMetahub = isMetahubUrl(metadata.logo);
      const currentLogoIsTmdb = isTmdbUrl(metadata.logo);
      const preferenceIsMetahub = settings.logoSourcePreference === 'metahub';

      // Always clear logo on preference change to force proper refresh
        setMetadata((prevMetadata: any) => ({
          ...prevMetadata!,
          logo: undefined
        }));
      
      logger.log(`[useMetadataAssets] Preference changed to ${settings.logoSourcePreference}, forcing refresh of all assets`);
    }
  }, [settings.logoSourcePreference, setMetadata]);

  // Original reset logo load error effect
  useEffect(() => {
    setLogoLoadError(false);
  }, [metadata?.logo]);

  // Fetch logo immediately for TMDB content - with guard against recursive updates
  useEffect(() => {
    // Guard against infinite loops by checking if we're already fetching
    if (metadata && !metadata.logo && !logoFetchInProgress.current) {
      logoFetchInProgress.current = true;
      
      const fetchLogo = async () => {
        try {
          // Get logo source preference from settings
          const logoPreference = settings.logoSourcePreference || 'metahub';
          const preferredLanguage = settings.tmdbLanguagePreference || 'en';
          
          logger.log(`[useMetadataAssets] Fetching logo with strict preference: ${logoPreference}`);
          
          if (logoPreference === 'metahub' && imdbId) {
            // Metahub path - direct fetch without HEAD request for speed
            const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            
            try {
              // Verify Metahub image exists to prevent showing broken images
              const response = await fetch(metahubUrl, { method: 'HEAD' });
              if (response.ok) {
                // Update metadata with Metahub logo
                setMetadata((prevMetadata: any) => ({
                  ...prevMetadata!,
                  logo: metahubUrl
                }));
                logger.log(`[useMetadataAssets] Set Metahub logo: ${metahubUrl}`);
              } else {
                logger.warn(`[useMetadataAssets] Metahub logo not found for ${imdbId}`);
              }
            } catch (error) {
              logger.error(`[useMetadataAssets] Error checking Metahub logo:`, error);
            }
          } else if (logoPreference === 'tmdb') {
            // TMDB path - optimized flow
            let tmdbId: string | null = null;
            let contentType = type === 'series' ? 'tv' : 'movie';
            
            // Extract or find TMDB ID in one step
            if (id.startsWith('tmdb:')) {
              tmdbId = id.split(':')[1];
            } else if (imdbId) {
              // Only look up TMDB ID if we don't already have it
              try {
                const tmdbService = TMDBService.getInstance();
                const foundId = await tmdbService.findTMDBIdByIMDB(imdbId);
                if (foundId) {
                  tmdbId = String(foundId);
                  setFoundTmdbId(tmdbId); // Save for banner fetching
                }
              } catch (error) {
                logger.error(`[useMetadataAssets] Error finding TMDB ID:`, error);
              }
            }
            
            if (tmdbId) {
              try {
                // Direct fetch - avoid multiple service calls
                const tmdbService = TMDBService.getInstance();
                const logoUrl = await tmdbService.getContentLogo(contentType as 'tv' | 'movie', tmdbId, preferredLanguage);
                  
                if (logoUrl) {
                  setMetadata((prevMetadata: any) => ({
                    ...prevMetadata!,
                    logo: logoUrl
                  }));
                  logger.log(`[useMetadataAssets] Set TMDB logo: ${logoUrl}`);
                }
              } catch (error) {
                logger.error(`[useMetadataAssets] Error fetching TMDB logo:`, error);
              }
            }
          }
        } catch (error) {
          logger.error(`[useMetadataAssets] Error in fetchLogo:`, error);
        } finally {
          logoFetchInProgress.current = false;
        }
      };
      
      // Execute fetch without awaiting
      fetchLogo();
    }
  }, [id, type, metadata, setMetadata, imdbId, settings.logoSourcePreference]);

  // Fetch banner image based on logo source preference - optimized version
  useEffect(() => {
    // Skip if no metadata or already completed with the correct source
    if (!metadata) return;
    
    // Check if we need to refresh the banner based on source
    const currentPreference = settings.logoSourcePreference || 'metahub';
    if (bannerSource === currentPreference && forcedBannerRefreshDone.current) {
      return; // Already have the correct source, no need to refresh
    }
    
    const fetchBanner = async () => {
        setLoadingBanner(true);
      setBannerImage(null); // Clear existing banner to prevent mixed sources
      
      try {
        // Extract all possible IDs at once
        const preferredLanguage = settings.tmdbLanguagePreference || 'en';
        const contentType = type === 'series' ? 'tv' : 'movie';

        // Get TMDB ID once
        let tmdbId = null;
        if (id.startsWith('tmdb:')) {
          tmdbId = id.split(':')[1];
        } else if (foundTmdbId) {
          tmdbId = foundTmdbId;
        } else if ((metadata as any).tmdbId) {
          tmdbId = (metadata as any).tmdbId;
        }
        
        // Default fallback to use if nothing else works
        let finalBanner: string | null = null;
        let bannerSourceType: 'tmdb' | 'metahub' | 'default' = 'default';
        
        if (currentPreference === 'tmdb' && tmdbId) {
          // TMDB direct path
                const endpoint = contentType === 'tv' ? 'tv' : 'movie';
          
          try {
            // Use TMDBService instead of direct fetch with hardcoded API key
            const tmdbService = TMDBService.getInstance();
            logger.log(`[useMetadataAssets] Fetching TMDB details for ${endpoint}/${tmdbId}`);
            
            try {
              // Get details with backdrop path using TMDBService
              let details;
              let images = null;
              
              // Step 1: Get basic details
              if (endpoint === 'movie') {
                details = await tmdbService.getMovieDetails(tmdbId);
                
                // Step 2: Get images separately if details succeeded
                if (details) {
                  try {
                    // Use getMovieImages to get image data - this returns a logo URL but we need more
                    await tmdbService.getMovieImages(tmdbId, preferredLanguage);
                    
                    // We'll use the backdrop from the details
                    logger.log(`[useMetadataAssets] Got movie details for ${tmdbId}`);
                  } catch (imageError) {
                    logger.warn(`[useMetadataAssets] Could not get movie images: ${imageError}`);
                  }
              }
            } else {
                details = await tmdbService.getTVShowDetails(Number(tmdbId));
                
                // Step 2: Get images separately if details succeeded
                if (details) {
                  try {
                    // Use getTvShowImages to get image data - this returns a logo URL but we need more
                    await tmdbService.getTvShowImages(tmdbId, preferredLanguage);
                    
                    // We'll use the backdrop from the details
                    logger.log(`[useMetadataAssets] Got TV details for ${tmdbId}`);
                  } catch (imageError) {
                    logger.warn(`[useMetadataAssets] Could not get TV images: ${imageError}`);
            }
                }
              }
              
              // Check if we have a backdrop path from details
              if (details && details.backdrop_path) {
                finalBanner = tmdbService.getImageUrl(details.backdrop_path);
                bannerSourceType = 'tmdb';
                logger.log(`[useMetadataAssets] Using TMDB backdrop from details: ${finalBanner}`);
              } 
              // If no backdrop, try poster as fallback
              else if (details && details.poster_path) {
                logger.warn(`[useMetadataAssets] No backdrop available, using poster as fallback`);
                finalBanner = tmdbService.getImageUrl(details.poster_path);
                bannerSourceType = 'tmdb';
              }
              else {
                logger.warn(`[useMetadataAssets] No backdrop or poster found for ${endpoint}/${tmdbId}`);
              }
            } catch (innerErr) {
              logger.error(`[useMetadataAssets] Error fetching TMDB details/images:`, innerErr);
                  }
                } catch (err) {
            logger.error(`[useMetadataAssets] TMDB service initialization error:`, err);
            }
        } else if (currentPreference === 'metahub' && imdbId) {
          // Metahub path - verify it exists to prevent broken images
          const metahubUrl = `https://images.metahub.space/background/medium/${imdbId}/img`;
          
              try {
            const response = await fetch(metahubUrl, { method: 'HEAD' });
            if (response.ok) {
              finalBanner = metahubUrl;
              bannerSourceType = 'metahub';
              logger.log(`[useMetadataAssets] Using Metahub banner: ${finalBanner}`);
            } else {
              logger.warn(`[useMetadataAssets] Metahub banner not found, using default`);
            }
          } catch (error) {
            logger.error(`[useMetadataAssets] Error checking Metahub banner:`, error);
          }
        }
        
        // If no source-specific banner was found, use default
        if (!finalBanner) {
          finalBanner = metadata.banner || metadata.poster;
          bannerSourceType = 'default';
          logger.log(`[useMetadataAssets] Using default banner: ${finalBanner}`);
                  }
        
        // Set banner image once at the end
          setBannerImage(finalBanner);
        setBannerSource(bannerSourceType);
          
        } catch (error) {
        logger.error(`[useMetadataAssets] Banner fetch error:`, error);
        // Use default banner if error occurred
          setBannerImage(metadata.banner || metadata.poster);
        setBannerSource('default');
        } finally {
          setLoadingBanner(false);
        forcedBannerRefreshDone.current = true;
      }
    };
    
    fetchBanner();
  }, [metadata, id, type, imdbId, settings.logoSourcePreference, foundTmdbId, bannerSource]);
    
  // Original reset forced refresh effect
  useEffect(() => {
    if (forcedBannerRefreshDone.current) {
      logger.log(`[useMetadataAssets] Logo preference changed, resetting banner refresh flag`);
      forcedBannerRefreshDone.current = false;
      // Clear the banner image immediately to prevent showing the wrong source briefly
      setBannerImage(null);
      setBannerSource(null);
      // This will trigger the banner fetch effect to run again
    }
  }, [settings.logoSourcePreference]);

  return {
    bannerImage,
    loadingBanner,
    logoLoadError,
    foundTmdbId,
    setLogoLoadError,
    setBannerImage,
    bannerSource, // Export banner source for debugging
  };
}; 