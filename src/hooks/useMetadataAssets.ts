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
    const logoPreference = settings.logoSourcePreference || 'metahub';
    const currentLogoUrl = metadata?.logo;
    let shouldFetchLogo = false;

    // Determine if we need to fetch a new logo
    if (!currentLogoUrl) {
      logger.log(`[useMetadataAssets:Logo] Condition check: No current logo exists. Proceeding with fetch.`);
      shouldFetchLogo = true;
    } else {
      const isCurrentLogoMetahub = isMetahubUrl(currentLogoUrl);
      const isCurrentLogoTmdb = isTmdbUrl(currentLogoUrl);
      
      if (logoPreference === 'tmdb' && !isCurrentLogoTmdb) {
        logger.log(`[useMetadataAssets:Logo] Condition check: Preference is TMDB, but current logo is not TMDB (${currentLogoUrl}). Proceeding with fetch.`);
        shouldFetchLogo = true;
      } else if (logoPreference === 'metahub' && !isCurrentLogoMetahub) {
        logger.log(`[useMetadataAssets:Logo] Condition check: Preference is Metahub, but current logo is not Metahub (${currentLogoUrl}). Proceeding with fetch.`);
        shouldFetchLogo = true;
      } else {
         logger.log(`[useMetadataAssets:Logo] Condition check: Skipping fetch. Preference (${logoPreference}) matches existing logo source. Current logo: ${currentLogoUrl}`);
      }
    }
    
    // Guard against infinite loops by checking if we're already fetching
    if (shouldFetchLogo && !logoFetchInProgress.current) {
      logger.log(`[useMetadataAssets:Logo] Starting logo fetch. Current metadata logo: ${currentLogoUrl}`);
      logoFetchInProgress.current = true;
      
      const fetchLogo = async () => {
        // Clear existing logo before fetching new one to avoid briefly showing wrong logo
        // Only do this if we decided to fetch because of a mismatch or non-existence
        if (shouldFetchLogo) {
             logger.log(`[useMetadataAssets:Logo] Clearing existing logo in metadata state before fetch.`);
             setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: undefined }));
        }
        
        try {
          // Get logo source preference from settings
          // const logoPreference = settings.logoSourcePreference || 'metahub'; // Already defined above
          const preferredLanguage = settings.tmdbLanguagePreference || 'en';
          
          logger.log(`[useMetadataAssets:Logo] Fetching logo. Preference: ${logoPreference}, Language: ${preferredLanguage}, IMDB ID: ${imdbId}`);
          
          if (logoPreference === 'metahub' && imdbId) {
            // Metahub path - direct fetch without HEAD request for speed
            logger.log(`[useMetadataAssets:Logo] Preference is Metahub. Attempting Metahub fetch for ${imdbId}.`);
            const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            
            try {
              // Verify Metahub image exists to prevent showing broken images
              logger.log(`[useMetadataAssets:Logo] Checking Metahub logo existence: ${metahubUrl}`);
              const response = await fetch(metahubUrl, { method: 'HEAD' });
              if (response.ok) {
                // Update metadata with Metahub logo
                logger.log(`[useMetadataAssets:Logo] Metahub logo found. Updating metadata state.`);
                setMetadata((prevMetadata: any) => {
                  logger.log(`[useMetadataAssets:Logo] setMetadata called with Metahub logo: ${metahubUrl}`);
                  return { ...prevMetadata!, logo: metahubUrl };
                });
              } else {
                logger.warn(`[useMetadataAssets:Logo] Metahub logo HEAD request failed with status ${response.status} for ${imdbId}`);
              }
            } catch (error) {
              logger.error(`[useMetadataAssets:Logo] Error checking Metahub logo:`, error);
            }
          } else if (logoPreference === 'tmdb') {
            // TMDB path - optimized flow
            logger.log(`[useMetadataAssets:Logo] Preference is TMDB. Attempting TMDB fetch.`);
            let tmdbId: string | null = null;
            let contentType = type === 'series' ? 'tv' : 'movie';
            
            // Extract or find TMDB ID in one step
            if (id.startsWith('tmdb:')) {
              tmdbId = id.split(':')[1];
              logger.log(`[useMetadataAssets:Logo] Extracted TMDB ID from route ID: ${tmdbId}`);
            } else if (imdbId) {
              logger.log(`[useMetadataAssets:Logo] Attempting to find TMDB ID from IMDB ID: ${imdbId}`);
              // Only look up TMDB ID if we don't already have it
              try {
                const tmdbService = TMDBService.getInstance();
                const foundId = await tmdbService.findTMDBIdByIMDB(imdbId);
                if (foundId) {
                  tmdbId = String(foundId);
                  setFoundTmdbId(tmdbId); // Save for banner fetching
                  logger.log(`[useMetadataAssets:Logo] Found TMDB ID: ${tmdbId}`);
                } else {
                   logger.warn(`[useMetadataAssets:Logo] Could not find TMDB ID for IMDB ID: ${imdbId}`);
                }
              } catch (error) {
                logger.error(`[useMetadataAssets:Logo] Error finding TMDB ID:`, error);
              }
            } else {
              logger.warn(`[useMetadataAssets:Logo] Cannot attempt TMDB fetch: No TMDB ID in route and no IMDB ID provided.`);
            }
            
            if (tmdbId) {
              try {
                // Direct fetch - avoid multiple service calls
                logger.log(`[useMetadataAssets:Logo] Fetching TMDB logo for ${contentType} ID: ${tmdbId}, Language: ${preferredLanguage}`);
                const tmdbService = TMDBService.getInstance();
                const logoUrl = await tmdbService.getContentLogo(contentType as 'tv' | 'movie', tmdbId, preferredLanguage);
                  
                if (logoUrl) {
                  logger.log(`[useMetadataAssets:Logo] TMDB logo found. Updating metadata state.`);
                  setMetadata((prevMetadata: any) => {
                     logger.log(`[useMetadataAssets:Logo] setMetadata called with TMDB logo: ${logoUrl}`);
                     return { ...prevMetadata!, logo: logoUrl };
                  });
                } else {
                   logger.warn(`[useMetadataAssets:Logo] No TMDB logo found for ${contentType}/${tmdbId}.`);
                }
              } catch (error) {
                logger.error(`[useMetadataAssets:Logo] Error fetching TMDB logo:`, error);
              }
            } else {
               logger.warn(`[useMetadataAssets:Logo] Skipping TMDB logo fetch as no TMDB ID was determined.`);
            }
          } else {
             logger.log(`[useMetadataAssets:Logo] Preference not Metahub and no IMDB ID, or preference not TMDB. No logo fetched.`);
          }
        } catch (error) {
          logger.error(`[useMetadataAssets:Logo] Error in outer fetchLogo try block:`, error);
        } finally {
          logger.log(`[useMetadataAssets:Logo] Finished logo fetch attempt.`);
          logoFetchInProgress.current = false;
        }
      };
      
      // Execute fetch without awaiting
      fetchLogo();
    }
    // Add logging for when fetch is skipped due to already fetching
    else if (shouldFetchLogo && logoFetchInProgress.current) {
         logger.log(`[useMetadataAssets:Logo] Skipping logo fetch because logoFetchInProgress is true.`);
    }
  }, [
    id, 
    type, 
    imdbId, 
    metadata?.logo, // Depend on the logo value itself, not the whole object
    settings.logoSourcePreference, 
    settings.tmdbLanguagePreference,
    setMetadata // Keep setMetadata, but ensure it's memoized in parent
  ]);

  // Fetch banner image based on logo source preference - optimized version
  useEffect(() => {
    // Skip if no metadata or already completed with the correct source
    if (!metadata) {
      logger.log(`[useMetadataAssets:Banner] Skipping banner fetch: No metadata.`);
      return;
    }
    
    // Check if we need to refresh the banner based on source
    const currentPreference = settings.logoSourcePreference || 'metahub';
    logger.log(`[useMetadataAssets:Banner] Checking banner fetch. Preference: ${currentPreference}, Current Banner Source: ${bannerSource}, Forced Refresh Done: ${forcedBannerRefreshDone.current}`);
    
    if (bannerSource === currentPreference && forcedBannerRefreshDone.current) {
      logger.log(`[useMetadataAssets:Banner] Skipping fetch: Banner already loaded with correct source (${currentPreference}).`);
      return; // Already have the correct source, no need to refresh
    }
    
    const fetchBanner = async () => {
      logger.log(`[useMetadataAssets:Banner] Starting banner fetch.`);
        setLoadingBanner(true);
      setBannerImage(null); // Clear existing banner to prevent mixed sources
      setBannerSource(null); // Clear source tracking
      
      let finalBanner: string | null = null;
      let bannerSourceType: 'tmdb' | 'metahub' | 'default' = 'default';

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
        } else if (imdbId) {
          // Last attempt: Look up TMDB ID if we haven't yet
          logger.log(`[useMetadataAssets:Banner] Attempting TMDB ID lookup from IMDB ID: ${imdbId} for banner fetch.`);
          try {
            const tmdbService = TMDBService.getInstance();
            const foundId = await tmdbService.findTMDBIdByIMDB(imdbId);
            if (foundId) {
               tmdbId = String(foundId);
               logger.log(`[useMetadataAssets:Banner] Found TMDB ID: ${tmdbId}`);
            } else {
               logger.warn(`[useMetadataAssets:Banner] Could not find TMDB ID for IMDB ID: ${imdbId}`);
            }
          } catch (lookupError) {
             logger.error(`[useMetadataAssets:Banner] Error looking up TMDB ID:`, lookupError);
          }
        }
        
        logger.log(`[useMetadataAssets:Banner] Determined TMDB ID for banner fetch: ${tmdbId}`);
        
        // Default fallback to use if nothing else works
        
        if (currentPreference === 'tmdb' && tmdbId) {
          // TMDB direct path
          logger.log(`[useMetadataAssets:Banner] Preference is TMDB. Attempting TMDB banner fetch for ${contentType}/${tmdbId}.`);
          const endpoint = contentType === 'tv' ? 'tv' : 'movie';
          
          try {
            // Use TMDBService instead of direct fetch with hardcoded API key
            const tmdbService = TMDBService.getInstance();
            logger.log(`[useMetadataAssets:Banner] Fetching TMDB details for ${endpoint}/${tmdbId}`);
            
            try {
              // Get details with backdrop path using TMDBService
              let details;
              let images = null;
              
              // Step 1: Get basic details
              if (endpoint === 'movie') {
                details = await tmdbService.getMovieDetails(tmdbId);
                logger.log(`[useMetadataAssets:Banner] TMDB getMovieDetails result:`, details ? `Found backdrop: ${!!details.backdrop_path}, Found poster: ${!!details.poster_path}` : 'null');
                
                // Step 2: Get images separately if details succeeded (This call might not be needed for banner)
                // if (details) {
                //   try {
                //     await tmdbService.getMovieImages(tmdbId, preferredLanguage);
                //     logger.log(`[useMetadataAssets:Banner] Got movie images for ${tmdbId}`);
                //   } catch (imageError) {
                //     logger.warn(`[useMetadataAssets:Banner] Could not get movie images: ${imageError}`);
                //   }
              //}
            } else { // TV Show
                details = await tmdbService.getTVShowDetails(Number(tmdbId));
                 logger.log(`[useMetadataAssets:Banner] TMDB getTVShowDetails result:`, details ? `Found backdrop: ${!!details.backdrop_path}, Found poster: ${!!details.poster_path}` : 'null');

                // Step 2: Get images separately if details succeeded (This call might not be needed for banner)
                // if (details) {
                //   try {
                //     await tmdbService.getTvShowImages(tmdbId, preferredLanguage);
                //     logger.log(`[useMetadataAssets:Banner] Got TV images for ${tmdbId}`);
                //   } catch (imageError) {
                //     logger.warn(`[useMetadataAssets:Banner] Could not get TV images: ${imageError}`);
                //   }
                // }
              }
              
              // Check if we have a backdrop path from details
              if (details && details.backdrop_path) {
                finalBanner = tmdbService.getImageUrl(details.backdrop_path);
                bannerSourceType = 'tmdb';
                logger.log(`[useMetadataAssets:Banner] Using TMDB backdrop from details: ${finalBanner}`);
              } 
              // If no backdrop, try poster as fallback
              else if (details && details.poster_path) {
                logger.warn(`[useMetadataAssets:Banner] No TMDB backdrop available, using poster as fallback.`);
                finalBanner = tmdbService.getImageUrl(details.poster_path);
                bannerSourceType = 'tmdb';
              }
              else {
                logger.warn(`[useMetadataAssets:Banner] No TMDB backdrop or poster found for ${endpoint}/${tmdbId}. TMDB path failed.`);
                // Explicitly set finalBanner to null if TMDB fails
                finalBanner = null; 
              }
            } catch (innerErr) {
              logger.error(`[useMetadataAssets:Banner] Error fetching TMDB details/images:`, innerErr);
              finalBanner = null; // Ensure failure case nullifies banner
            }
          } catch (err) {
            logger.error(`[useMetadataAssets:Banner] TMDB service initialization error:`, err);
            finalBanner = null; // Ensure failure case nullifies banner
          }
        } else if (currentPreference === 'metahub' && imdbId) {
          // Metahub path - verify it exists to prevent broken images
           logger.log(`[useMetadataAssets:Banner] Preference is Metahub. Attempting Metahub banner fetch for ${imdbId}.`);
          const metahubUrl = `https://images.metahub.space/background/medium/${imdbId}/img`;
          
          try {
            logger.log(`[useMetadataAssets:Banner] Checking Metahub banner existence: ${metahubUrl}`);
            const response = await fetch(metahubUrl, { method: 'HEAD' });
            if (response.ok) {
              finalBanner = metahubUrl;
              bannerSourceType = 'metahub';
              logger.log(`[useMetadataAssets:Banner] Metahub banner found: ${finalBanner}`);
            } else {
              logger.warn(`[useMetadataAssets:Banner] Metahub banner HEAD request failed with status ${response.status}, using default.`);
              finalBanner = null; // Ensure fallback if Metahub fails
            }
          } catch (error) {
            logger.error(`[useMetadataAssets:Banner] Error checking Metahub banner:`, error);
            finalBanner = null; // Ensure fallback if Metahub errors
          }
        } else {
           // This case handles: 
           // 1. Preference is TMDB but no tmdbId could be found.
           // 2. Preference is Metahub but no imdbId was provided.
           logger.log(`[useMetadataAssets:Banner] Skipping direct fetch: Preference=${currentPreference}, tmdbId=${tmdbId}, imdbId=${imdbId}. Will rely on default/fallback.`);
           finalBanner = null; // Explicitly nullify banner if preference conditions aren't met
        }

        // Fallback logic if preferred source failed or wasn't attempted
        if (!finalBanner) {
           logger.log(`[useMetadataAssets:Banner] Preferred source (${currentPreference}) did not yield a banner. Checking fallbacks.`);
           // Fallback 1: Try the *other* source if the preferred one failed
           if (currentPreference === 'tmdb' && imdbId) { // If preferred was TMDB, try Metahub
             logger.log(`[useMetadataAssets:Banner] Fallback: Trying Metahub for ${imdbId}.`);
             const metahubUrl = `https://images.metahub.space/background/medium/${imdbId}/img`;
             try {
               const response = await fetch(metahubUrl, { method: 'HEAD' });
               if (response.ok) {
                 finalBanner = metahubUrl;
                 bannerSourceType = 'metahub';
                 logger.log(`[useMetadataAssets:Banner] Fallback Metahub banner found: ${finalBanner}`);
               } else {
                 logger.warn(`[useMetadataAssets:Banner] Fallback Metahub HEAD failed: ${response.status}`);
               }
             } catch (fallbackError) {
                logger.error(`[useMetadataAssets:Banner] Fallback Metahub check error:`, fallbackError);
             }
           } else if (currentPreference === 'metahub' && tmdbId) { // If preferred was Metahub, try TMDB
             logger.log(`[useMetadataAssets:Banner] Fallback: Trying TMDB for ${contentType}/${tmdbId}.`);
             const endpoint = contentType === 'tv' ? 'tv' : 'movie';
             try {
               const tmdbService = TMDBService.getInstance();
               let details = endpoint === 'movie' ? await tmdbService.getMovieDetails(tmdbId) : await tmdbService.getTVShowDetails(Number(tmdbId));
               if (details?.backdrop_path) {
                 finalBanner = tmdbService.getImageUrl(details.backdrop_path);
                 bannerSourceType = 'tmdb';
                 logger.log(`[useMetadataAssets:Banner] Fallback TMDB banner found (backdrop): ${finalBanner}`);
               } else if (details?.poster_path) {
                 finalBanner = tmdbService.getImageUrl(details.poster_path);
                 bannerSourceType = 'tmdb';
                 logger.log(`[useMetadataAssets:Banner] Fallback TMDB banner found (poster): ${finalBanner}`);
               } else {
                 logger.warn(`[useMetadataAssets:Banner] Fallback TMDB fetch found no backdrop or poster.`);
               }
             } catch (fallbackError) {
                logger.error(`[useMetadataAssets:Banner] Fallback TMDB check error:`, fallbackError);
             }
           }
           
           // Fallback 2: Use metadata banner/poster if other source also failed
           if (!finalBanner) {
             logger.log(`[useMetadataAssets:Banner] Fallback source also failed or not applicable. Using metadata.banner or metadata.poster.`);
             finalBanner = metadata?.banner || metadata?.poster || null;
             bannerSourceType = 'default';
             if (finalBanner) {
                logger.log(`[useMetadataAssets:Banner] Using default banner from metadata: ${finalBanner}`);
             } else {
                logger.warn(`[useMetadataAssets:Banner] No default banner found in metadata either.`);
             }
           }
        }
        
        // Set the final state
        logger.log(`[useMetadataAssets:Banner] Final decision: Setting banner to ${finalBanner} (Source: ${bannerSourceType})`);
        setBannerImage(finalBanner);
        setBannerSource(bannerSourceType); // Track the source of the final image
        forcedBannerRefreshDone.current = true; // Mark this cycle as complete

      } catch (error) {
        logger.error(`[useMetadataAssets:Banner] Error in outer fetchBanner try block:`, error);
        // Ensure fallback to default even on outer error
        const defaultBanner = metadata?.banner || metadata?.poster || null;
        setBannerImage(defaultBanner);
        setBannerSource('default');
        logger.log(`[useMetadataAssets:Banner] Setting default banner due to outer error: ${defaultBanner}`);
      } finally {
         logger.log(`[useMetadataAssets:Banner] Finished banner fetch attempt.`);
        setLoadingBanner(false);
      }
    };
    
    fetchBanner();

  }, [metadata, id, type, imdbId, settings.logoSourcePreference, settings.tmdbLanguagePreference, setMetadata, foundTmdbId, bannerSource]); // Added bannerSource dependency to re-evaluate if it changes unexpectedly

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