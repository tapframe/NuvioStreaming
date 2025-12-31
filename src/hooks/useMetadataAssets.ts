import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';
import { TMDBService } from '../services/tmdbService';
import { isTmdbUrl } from '../utils/logoUtils';
import FastImage from '@d11/react-native-fast-image';
import { mmkvStorage } from '../services/mmkvStorage';

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
    const cachedResult = await mmkvStorage.getItem(`image_available:${url}`);
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
      await mmkvStorage.setItem(`image_available:${url}`, isAvailable ? 'true' : 'false');
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


  const isMountedRef = useRef(true);

  // CRITICAL: AbortController to cancel in-flight requests when component unmounts
  const abortControllerRef = useRef(new AbortController());

  // Track pending requests to prevent duplicate concurrent API calls
  const pendingFetchRef = useRef<Promise<void> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Cancel any in-flight requests
      abortControllerRef.current.abort();
    };
  }, []);


  useEffect(() => {
    abortControllerRef.current = new AbortController();
  }, [id, type]);

  // Force reset when preference changes
  useEffect(() => {
    // Reset all cached data when preference changes
    if (isMountedRef.current) {
      setBannerImage(null);
      setBannerSource(null);
      forcedBannerRefreshDone.current = false;
    }
  }, [settings.logoSourcePreference]);

  // Optimized banner fetching with race condition fixes
  const fetchBanner = useCallback(async () => {
    if (!metadata || !isMountedRef.current) return;

    // Prevent concurrent fetch requests for the same metadata
    if (pendingFetchRef.current) {
      try {
        await pendingFetchRef.current;
      } catch (error) {
        // Previous request failed, allow new attempt
      }
    }

    // Create a promise to track this fetch operation
    const fetchPromise = (async () => {
      try {
        if (!isMountedRef.current) return;

        if (isMountedRef.current) {
          setLoadingBanner(true);
        }

        // If enrichment or banner enrichment is disabled, use addon banner and don't fetch from external sources
        if (!settings.enrichMetadataWithTMDB || !settings.tmdbEnrichBanners) {
          const addonBanner = metadata?.banner || null;
          if (isMountedRef.current && addonBanner && addonBanner !== bannerImage) {
            setBannerImage(addonBanner);
            setBannerSource('default');
          }
          if (isMountedRef.current) {
            setLoadingBanner(false);
          }
          return;
        }

        try {
          const currentPreference = settings.logoSourcePreference || 'tmdb';
          const contentType = type === 'series' ? 'tv' : 'movie';

          // Collect final state before updating to prevent intermediate null states
          let finalBanner: string | null = bannerImage; // Start with current to prevent flicker
          let bannerSourceType: 'tmdb' | 'default' = (bannerSource === 'tmdb' || bannerSource === 'default') ? bannerSource : 'default';

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
                if (foundId && isMountedRef.current) {
                  tmdbId = String(foundId);
                }
              } catch (error) {
                // CRITICAL: Don't update state on error if unmounted
                if (!isMountedRef.current) return;
                logger.debug('[useMetadataAssets] TMDB ID lookup failed:', error);
              }
            }

            if (tmdbId && isMountedRef.current) {
              try {
                const tmdbService = TMDBService.getInstance();
                const endpoint = contentType === 'tv' ? 'tv' : 'movie';

                // Fetch details (AbortSignal will be used for future implementations)
                const details = endpoint === 'movie'
                  ? await tmdbService.getMovieDetails(tmdbId)
                  : await tmdbService.getTVShowDetails(Number(tmdbId));

                // Only update if request wasn't aborted and component is still mounted
                if (!isMountedRef.current) return;

                if (metadata?.banner) {
                  finalBanner = metadata.banner;
                  bannerSourceType = 'default';
                } else if (details?.backdrop_path) {
                  finalBanner = tmdbService.getImageUrl(details.backdrop_path);
                  bannerSourceType = 'tmdb';
                  if (finalBanner) {
                    FastImage.preload([{ uri: finalBanner }]);
                  }
                } else {
                  finalBanner = bannerImage || null;
                  bannerSourceType = 'default';
                }
              } catch (error) {
                // CRITICAL: Check if error is due to abort or actual network error
                if (error instanceof Error && error.name === 'AbortError') {
                  // Request was cancelled, don't update state
                  return;
                }

                // Only update state if still mounted after error
                if (!isMountedRef.current) return;

                logger.debug('[useMetadataAssets] TMDB details fetch failed:', error);
                // Keep current banner on error instead of setting to null
                finalBanner = bannerImage || metadata?.banner || null;
                bannerSourceType = 'default';
              }
            }
          }

          // Final fallback to metadata banner only
          if (!finalBanner) {
            finalBanner = metadata?.banner || null;
            bannerSourceType = 'default';
          }

          // CRITICAL: Batch all state updates into a single call to prevent race conditions
          // This ensures the native view hierarchy doesn't receive conflicting unmount/remount signals
          if (isMountedRef.current && (finalBanner !== bannerImage || bannerSourceType !== bannerSource)) {
            setBannerImage(finalBanner);
            setBannerSource(bannerSourceType);
          }

          if (isMountedRef.current) {
            forcedBannerRefreshDone.current = true;
          }
        } catch (error) {
          // Outer catch for any unexpected errors
          if (!isMountedRef.current) return;

          logger.error('[useMetadataAssets] Unexpected error in banner fetch:', error);
          // Use current banner on error, don't set to null
          const defaultBanner = bannerImage || metadata?.banner || null;
          if (defaultBanner !== bannerImage) {
            setBannerImage(defaultBanner);
            setBannerSource('default');
          }
        } finally {
          if (isMountedRef.current) {
            setLoadingBanner(false);
          }
        }
      } finally {
        pendingFetchRef.current = null;
      }
    })();

    pendingFetchRef.current = fetchPromise;
    return fetchPromise;
  }, [metadata, id, type, imdbId, settings.logoSourcePreference, settings.tmdbLanguagePreference, settings.enrichMetadataWithTMDB, settings.tmdbEnrichBanners, foundTmdbId, bannerImage, bannerSource]);

  // Fetch banner when needed
  useEffect(() => {
    if (!isMountedRef.current) return;

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
    logoLoadError: false,
    setLogoLoadError: () => { },
  };
}; 
