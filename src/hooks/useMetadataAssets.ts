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
  
  // State for logo loading
  const [logoLoadError, setLogoLoadError] = useState(false);
  const logoFetchInProgress = useRef<boolean>(false);
  const logoRefreshCounter = useRef<number>(0);
  const MAX_LOGO_REFRESHES = 2;
  const forcedLogoRefreshDone = useRef<boolean>(false);
  
  // For TMDB ID tracking
  const [foundTmdbId, setFoundTmdbId] = useState<string | null>(null);
  
  // Effect to force-refresh the logo when it doesn't match the preference
  useEffect(() => {
    if (metadata?.logo && !forcedLogoRefreshDone.current) {
      const currentLogoIsMetahub = isMetahubUrl(metadata.logo);
      const currentLogoIsTmdb = isTmdbUrl(metadata.logo);
      const preferenceIsMetahub = settings.logoSourcePreference === 'metahub';

      // Check if logo source doesn't match preference
      if ((preferenceIsMetahub && !currentLogoIsMetahub) || 
          (!preferenceIsMetahub && !currentLogoIsTmdb)) {
        logger.log(`[useMetadataAssets] Initial load: Logo source doesn't match preference. Forcing refresh.`);
        
        // Clear logo to force a new fetch according to preference
        setMetadata((prevMetadata: any) => ({
          ...prevMetadata!,
          logo: undefined
        }));
      }
      
      // Mark that we've checked this so we don't endlessly loop
      forcedLogoRefreshDone.current = true;
    }
  }, [metadata?.logo, settings.logoSourcePreference, setMetadata]);

  // Reset logo load error when metadata changes
  useEffect(() => {
    setLogoLoadError(false);
  }, [metadata?.logo]);

  // Force refresh logo when logo preference changes - only when preference actually changes
  useEffect(() => {
    // Reset the counter when preference actually changes
    if (logoRefreshCounter.current === 0) {
      logoRefreshCounter.current = 1; // Mark that we've started a refresh cycle
      
      // Only clear logo if we already have metadata with a logo
      if (metadata?.logo) {
        // Check if the current logo source doesn't match the preference
        const currentLogoIsMetahub = isMetahubUrl(metadata.logo);
        const currentLogoIsTmdb = isTmdbUrl(metadata.logo);
        const preferenceIsMetahub = settings.logoSourcePreference === 'metahub';
        const preferenceIsTmdb = settings.logoSourcePreference === 'tmdb';
        
        // Only refresh if the current logo source clearly doesn't match the preference
        const needsRefresh = (preferenceIsMetahub && currentLogoIsTmdb) || 
                           (preferenceIsTmdb && currentLogoIsMetahub);
        
        if (needsRefresh) {
          logger.log(`[useMetadataAssets] Logo preference (${settings.logoSourcePreference}) doesn't match current logo source, triggering one-time refresh`);
          
          // Prevent endless refreshes
          if (logoRefreshCounter.current < MAX_LOGO_REFRESHES) {
            logoRefreshCounter.current++;
            setMetadata((prevMetadata: any) => ({
              ...prevMetadata!,
              logo: undefined
            }));
          } else {
            logger.warn(`[useMetadataAssets] Maximum logo refreshes (${MAX_LOGO_REFRESHES}) reached, stopping to prevent loop`);
          }
        } else {
          logger.log(`[useMetadataAssets] Logo source already matches preference (${settings.logoSourcePreference}), no refresh needed`);
          logoRefreshCounter.current = 0; // Reset for future changes
        }
      }
    } else {
      logoRefreshCounter.current++; 
      logger.log(`[useMetadataAssets] Logo refresh already in progress (${logoRefreshCounter.current}/${MAX_LOGO_REFRESHES})`);
      
      // Reset counter after max refreshes to allow future preference changes to work
      if (logoRefreshCounter.current >= MAX_LOGO_REFRESHES) {
        logger.warn(`[useMetadataAssets] Maximum refreshes reached, resetting counter`);
        // After a timeout to avoid immediate re-triggering
        setTimeout(() => {
          logoRefreshCounter.current = 0;
        }, 1000);
      }
    }
  }, [settings.logoSourcePreference, metadata?.logo, setMetadata]);

  // Add effect to track when logo source matches preference
  useEffect(() => {
    if (metadata?.logo) {
      const currentLogoIsMetahub = isMetahubUrl(metadata.logo);
      const currentLogoIsTmdb = isTmdbUrl(metadata.logo);
      const preferenceIsMetahub = settings.logoSourcePreference === 'metahub';
      const preferenceIsTmdb = settings.logoSourcePreference === 'tmdb';
      
      // Check if current logo source matches preference
      const logoSourceMatches = (preferenceIsMetahub && currentLogoIsMetahub) || 
                               (preferenceIsTmdb && currentLogoIsTmdb);
      
      if (logoSourceMatches) {
        logger.log(`[useMetadataAssets] Logo source (${currentLogoIsMetahub ? 'Metahub' : 'TMDB'}) now matches preference (${settings.logoSourcePreference}), refresh complete`);
        logoRefreshCounter.current = 0; // Reset counter since we've achieved our goal
      }
    }
  }, [metadata?.logo, settings.logoSourcePreference]);

  // Fetch logo immediately for TMDB content - with guard against recursive updates
  useEffect(() => {
    // Guard against infinite loops by checking if we're already fetching
    if (metadata && !metadata.logo && !logoFetchInProgress.current) {
      console.log('[useMetadataAssets] Current settings:', JSON.stringify(settings));
      console.log('[useMetadataAssets] Current metadata:', JSON.stringify(metadata, null, 2));
      
      const fetchLogo = async () => {
        // Set fetch in progress flag
        logoFetchInProgress.current = true;
        
        try {
          // Get logo source preference from settings
          const logoPreference = settings.logoSourcePreference || 'metahub'; // Default to metahub if not set
          
          console.log(`[useMetadataAssets] Using logo preference: ${logoPreference}, TMDB first: ${logoPreference === 'tmdb'}`);
          logger.log(`[useMetadataAssets] Logo source preference: ${logoPreference}`);
          
          // First source based on preference
          if (logoPreference === 'metahub') {
            // Try to get logo from Metahub first
            const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            
            logger.log(`[useMetadataAssets] Attempting to fetch logo from Metahub for ${imdbId}`);
            
            try {
              const response = await fetch(metahubUrl, { method: 'HEAD' });
              if (response.ok) {
                logger.log(`[useMetadataAssets] Successfully fetched logo from Metahub:
                  - Content ID: ${id}
                  - Content Type: ${type}
                  - Logo URL: ${metahubUrl}
                `);
                
                // Update metadata with Metahub logo
                setMetadata((prevMetadata: any) => ({
                  ...prevMetadata!,
                  logo: metahubUrl
                }));
                
                // Clear fetch in progress flag when done
                logoFetchInProgress.current = false;
                return; // Exit if Metahub logo was found
              } else {
                logger.warn(`[useMetadataAssets] Metahub logo request failed with status ${response.status}`);
              }
            } catch (metahubError) {
              logger.warn(`[useMetadataAssets] Failed to fetch logo from Metahub:`, metahubError);
            }
            
            // If Metahub fails, try TMDB as fallback
            if (id.startsWith('tmdb:')) {
              const tmdbId = id.split(':')[1];
              const tmdbType = type === 'series' ? 'tv' : 'movie';
              
              logger.log(`[useMetadataAssets] Attempting to fetch logo from TMDB as fallback for ${tmdbType} (ID: ${tmdbId})`);
              
              const logoUrl = await TMDBService.getInstance().getContentLogo(tmdbType, tmdbId);
              
              if (logoUrl) {
                logger.log(`[useMetadataAssets] Successfully fetched logo from TMDB:
                  - Content Type: ${tmdbType}
                  - TMDB ID: ${tmdbId}
                  - Logo URL: ${logoUrl}
                `);
                
                // Update metadata with TMDB logo
                setMetadata((prevMetadata: any) => ({
                  ...prevMetadata!,
                  logo: logoUrl
                }));
                
                // Clear fetch in progress flag when done
                logoFetchInProgress.current = false;
                return; // Exit if TMDB logo was found
              } else {
                // If both Metahub and TMDB fail, use the title as text instead of a logo
                logger.warn(`[useMetadataAssets] No logo found from either Metahub or TMDB for ${type} (ID: ${id}), using title text instead`);
                
                // Leave logo as null/undefined to trigger fallback to text
              }
            }
          } else { // TMDB first
            let tmdbLogoUrl: string | null = null;
            
            // 1. Attempt to fetch TMDB logo
            if (id.startsWith('tmdb:')) {
              const tmdbId = id.split(':')[1];
              const tmdbType = type === 'series' ? 'tv' : 'movie';
              const preferredLanguage = settings.tmdbLanguagePreference || 'en';
              
              logger.log(`[useMetadataAssets] Attempting to fetch logo from TMDB for ${tmdbType} (ID: ${tmdbId}, preferred language: ${preferredLanguage})`);
              try {
                const tmdbService = TMDBService.getInstance();
                tmdbLogoUrl = await tmdbService.getContentLogo(tmdbType, tmdbId, preferredLanguage);
                
                if (tmdbLogoUrl) {
                  logger.log(`[useMetadataAssets] Successfully fetched logo from TMDB: ${tmdbLogoUrl}`);
                } else {
                  logger.warn(`[useMetadataAssets] No logo found from TMDB for ${type} (ID: ${tmdbId})`);
                }
              } catch (error) {
                logger.error(`[useMetadataAssets] Error fetching TMDB logo for ID ${tmdbId}:`, error);
              }
            } else if (imdbId) {
              // If we have IMDB ID but no direct TMDB ID, try to find TMDB ID
              const preferredLanguage = settings.tmdbLanguagePreference || 'en';
              logger.log(`[useMetadataAssets] Content has IMDB ID (${imdbId}), looking up TMDB ID for TMDB logo, preferred language: ${preferredLanguage}`);
              try {
                const tmdbService = TMDBService.getInstance();
                const foundTmdbId = await tmdbService.findTMDBIdByIMDB(imdbId);
                
                if (foundTmdbId) {
                  logger.log(`[useMetadataAssets] Found TMDB ID ${foundTmdbId} for IMDB ID ${imdbId}`);
                  setFoundTmdbId(String(foundTmdbId)); // Save for banner fetching
                  
                  tmdbLogoUrl = await tmdbService.getContentLogo(type === 'series' ? 'tv' : 'movie', foundTmdbId.toString(), preferredLanguage);
                  
                  if (tmdbLogoUrl) {
                    logger.log(`[useMetadataAssets] Successfully fetched logo from TMDB via IMDB lookup: ${tmdbLogoUrl}`);
                  } else {
                    logger.warn(`[useMetadataAssets] No logo found from TMDB via IMDB lookup for ${type} (IMDB: ${imdbId})`);
                  }
                } else {
                  logger.warn(`[useMetadataAssets] Could not find TMDB ID for IMDB ID ${imdbId}`);
                }
              } catch (error) {
                logger.error(`[useMetadataAssets] Error finding TMDB ID or fetching logo for IMDB ID ${imdbId}:`, error);
              }
            }
            
            // 2. If TMDB logo was fetched successfully, update and return
            if (tmdbLogoUrl) {
              setMetadata((prevMetadata: any) => ({
                ...prevMetadata!,
                logo: tmdbLogoUrl
              }));
              logoFetchInProgress.current = false;
              return;
            }
            
            // 3. If TMDB failed, try Metahub as fallback
            logger.log(`[useMetadataAssets] TMDB logo fetch failed or not applicable. Attempting Metahub fallback.`);
            if (imdbId) {
              const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
              logger.log(`[useMetadataAssets] Attempting to fetch logo from Metahub as fallback for ${imdbId}`);
              
              try {
                const response = await fetch(metahubUrl, { method: 'HEAD' });
                if (response.ok) {
                  logger.log(`[useMetadataAssets] Successfully fetched fallback logo from Metahub: ${metahubUrl}`);
                  setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: metahubUrl }));
                } else {
                  logger.warn(`[useMetadataAssets] Metahub fallback failed. Using title text.`);
                  setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: undefined }));
                }
              } catch (metahubError) {
                logger.warn(`[useMetadataAssets] Failed to fetch fallback logo from Metahub:`, metahubError);
                setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: undefined }));
              }
            } else {
              // No IMDB ID for Metahub fallback
              logger.warn(`[useMetadataAssets] No IMDB ID for Metahub fallback. Using title text.`);
              setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: undefined }));
            }
          }
        } catch (error) {
          logger.error('[useMetadataAssets] Failed to fetch logo from all sources:', {
            error,
            contentId: id,
            contentType: type
          });
          // Fallback to text on general error
          setMetadata((prevMetadata: any) => ({ ...prevMetadata!, logo: undefined }));
        } finally {
          // Clear fetch in progress flag when done
          logoFetchInProgress.current = false;
        }
      };
      
      fetchLogo();
    } else if (logoFetchInProgress.current) {
      console.log('[useMetadataAssets] Logo fetch already in progress, skipping');
    } else if (metadata?.logo) {
      logger.log(`[useMetadataAssets] Using existing logo from metadata:
        - Content ID: ${id}
        - Content Type: ${type}
        - Logo URL: ${metadata.logo}
        - Source: ${isMetahubUrl(metadata.logo) ? 'Metahub' : (isTmdbUrl(metadata.logo) ? 'TMDB' : 'Other')}
      `);
    }
  }, [id, type, metadata, setMetadata, imdbId, settings.logoSourcePreference]);

  // Fetch banner image based on logo source preference
  useEffect(() => {
    const fetchBanner = async () => {
      if (metadata) {
        setLoadingBanner(true);
        
        // Clear the banner initially when starting a preference-driven fetch
        setBannerImage(null); 
        
        let finalBanner: string | null = metadata.banner || metadata.poster; // Default fallback
        const preference = settings.logoSourcePreference || 'metahub';
        const preferredLanguage = settings.tmdbLanguagePreference || 'en';
        const apiKey = '439c478a771f35c05022f9feabcca01c'; // Re-using API key

        // Extract IDs
        let currentTmdbId = null;
        if (id.startsWith('tmdb:')) {
          currentTmdbId = id.split(':')[1];
        } else if (foundTmdbId) {
          currentTmdbId = foundTmdbId;
        } else if ((metadata as any).tmdbId) {
          currentTmdbId = (metadata as any).tmdbId;
        }
        
        const currentImdbId = imdbId;
        const contentType = type === 'series' ? 'tv' : 'movie';
        
        logger.log(`[useMetadataAssets] Fetching banner with preference: ${preference}, language: ${preferredLanguage}, TMDB ID: ${currentTmdbId}, IMDB ID: ${currentImdbId}`);
        
        try {
          if (preference === 'tmdb') {
            // 1. Try TMDB first
            let tmdbBannerUrl: string | null = null;
            if (currentTmdbId) {
              logger.log(`[useMetadataAssets] Attempting TMDB banner fetch with ID: ${currentTmdbId}`);
              try {
                const endpoint = contentType === 'tv' ? 'tv' : 'movie';
                const response = await fetch(`https://api.themoviedb.org/3/${endpoint}/${currentTmdbId}/images?api_key=${apiKey}&include_image_language=${preferredLanguage},en,null`);
                const imagesData = await response.json();
                
                if (imagesData.backdrops && imagesData.backdrops.length > 0) {
                  // Try to find backdrop in preferred language first
                  let backdropPath = null;
                  
                  if (preferredLanguage !== 'en') {
                    const preferredBackdrop = imagesData.backdrops.find((backdrop: any) => backdrop.iso_639_1 === preferredLanguage);
                    if (preferredBackdrop) {
                      backdropPath = preferredBackdrop.file_path;
                      logger.log(`[useMetadataAssets] Found ${preferredLanguage} backdrop for ID: ${currentTmdbId}`);
                    }
                  }
                  
                  // Fall back to English backdrop
                  if (!backdropPath) {
                    const englishBackdrop = imagesData.backdrops.find((backdrop: any) => backdrop.iso_639_1 === 'en');
                    if (englishBackdrop) {
                      backdropPath = englishBackdrop.file_path;
                      logger.log(`[useMetadataAssets] Found English backdrop for ID: ${currentTmdbId}`);
                    } else {
                      // Last resort: use the first backdrop
                      backdropPath = imagesData.backdrops[0].file_path;
                      logger.log(`[useMetadataAssets] Using first available backdrop for ID: ${currentTmdbId}`);
                    }
                  }
                  
                  tmdbBannerUrl = `https://image.tmdb.org/t/p/original${backdropPath}`;
                  logger.log(`[useMetadataAssets] Found TMDB banner via images endpoint: ${tmdbBannerUrl}`);
                } else {
                  // Add log for when no backdrops are found
                  logger.warn(`[useMetadataAssets] TMDB API successful, but no backdrops found for ID: ${currentTmdbId}`);
                }
              } catch (err) {
                logger.error(`[useMetadataAssets] Error fetching TMDB banner via images endpoint:`, err);
              }
            } else {
              // Add log for when no TMDB ID is available
              logger.warn(`[useMetadataAssets] No TMDB ID available to fetch TMDB banner.`);
            }
            
            if (tmdbBannerUrl) {
              // TMDB SUCCESS: Set banner and EXIT
              finalBanner = tmdbBannerUrl;
              logger.log(`[useMetadataAssets] Setting final banner to TMDB source: ${finalBanner}`);
              setBannerImage(finalBanner);
              setLoadingBanner(false);
              forcedBannerRefreshDone.current = true;
              return; // <-- Exit here, don't attempt fallback
            } else {
              // TMDB FAILED: Proceed to Metahub fallback
              logger.log(`[useMetadataAssets] TMDB banner failed, trying Metahub fallback.`);
              if (currentImdbId) {
                const metahubBannerUrl = `https://images.metahub.space/background/medium/${currentImdbId}/img`;
                try {
                  const metahubResponse = await fetch(metahubBannerUrl, { method: 'HEAD' });
                  if (metahubResponse.ok) {
                    finalBanner = metahubBannerUrl;
                    logger.log(`[useMetadataAssets] Found Metahub banner as fallback: ${finalBanner}`);
                  }
                } catch (err) {
                  logger.error(`[useMetadataAssets] Error fetching Metahub fallback banner:`, err);
                }
              }
            }
          } else { // Preference is Metahub
            // 1. Try Metahub first
            let metahubBannerUrl: string | null = null;
            if (currentImdbId) {
              const url = `https://images.metahub.space/background/medium/${currentImdbId}/img`;
              try {
                const metahubResponse = await fetch(url, { method: 'HEAD' });
                if (metahubResponse.ok) {
                  metahubBannerUrl = url;
                  logger.log(`[useMetadataAssets] Found Metahub banner: ${metahubBannerUrl}`);
                }
              } catch (err) {
                logger.error(`[useMetadataAssets] Error fetching Metahub banner:`, err);
              }
            }
            
            if (metahubBannerUrl) {
              // METAHUB SUCCESS: Set banner and EXIT
              finalBanner = metahubBannerUrl;
              logger.log(`[useMetadataAssets] Setting final banner to Metahub source: ${finalBanner}`);
              setBannerImage(finalBanner);
              setLoadingBanner(false);
              forcedBannerRefreshDone.current = true;
              return; // <-- Exit here, don't attempt fallback
            } else {
              // METAHUB FAILED: Proceed to TMDB fallback
              logger.log(`[useMetadataAssets] Metahub banner failed, trying TMDB fallback.`);
              if (currentTmdbId) {
                try {
                  const endpoint = contentType === 'tv' ? 'tv' : 'movie';
                  const response = await fetch(`https://api.themoviedb.org/3/${endpoint}/${currentTmdbId}/images?api_key=${apiKey}`);
                  const imagesData = await response.json();
                  
                  if (imagesData.backdrops && imagesData.backdrops.length > 0) {
                    const backdropPath = imagesData.backdrops[0].file_path;
                    finalBanner = `https://image.tmdb.org/t/p/original${backdropPath}`;
                    logger.log(`[useMetadataAssets] Found TMDB banner as fallback: ${finalBanner}`);
                  }
                } catch (err) {
                  logger.error(`[useMetadataAssets] Error fetching TMDB fallback banner:`, err);
                }
              }
            }
          }
          
          // Set the final determined banner (could be fallback or initial default)
          setBannerImage(finalBanner);
          logger.log(`[useMetadataAssets] Final banner set after fallbacks (if any): ${finalBanner}`);
          
        } catch (error) {
          logger.error(`[useMetadataAssets] General error fetching banner:`, error);
          // Fallback to initial banner on general error
          setBannerImage(metadata.banner || metadata.poster);
        } finally {
          // Only set loading to false here if we didn't exit early
          setLoadingBanner(false);
          forcedBannerRefreshDone.current = true; // Mark refresh as done
        }
      }
    };
    
    // Only run fetchBanner if metadata exists and preference/content might have changed
    // The dependencies array handles triggering this effect
    fetchBanner();
    
  }, [metadata, id, type, imdbId, settings.logoSourcePreference, foundTmdbId]);

  // Reset forced refresh when preference changes
  useEffect(() => {
    if (forcedBannerRefreshDone.current) {
      logger.log(`[useMetadataAssets] Logo preference changed, resetting banner refresh flag`);
      forcedBannerRefreshDone.current = false;
      // Clear the banner image immediately to prevent showing the wrong source briefly
      setBannerImage(null);
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
  };
}; 