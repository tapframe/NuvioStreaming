import { logger } from './logger';
import { TMDBService } from '../services/tmdbService';

/**
 * Checks if a URL is a valid Metahub logo by performing a HEAD request
 * @param url The Metahub logo URL to check
 * @returns True if the logo is valid, false otherwise
 */
export const isValidMetahubLogo = async (url: string): Promise<boolean> => {
  if (!url || !url.includes('metahub.space')) {
    return false;
  }

  try {
    const response = await fetch(url, { method: 'HEAD' });
    
    // Check if request was successful
    if (!response.ok) {
      logger.warn(`[logoUtils] Logo URL returned status ${response.status}: ${url}`);
      return false;
    }
    
    // Check file size to detect "Missing Image" placeholders
    const contentLength = response.headers.get('content-length');
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
    
    // If content-length header is missing, we can't check file size, so assume it's valid
    if (!contentLength) {
      logger.warn(`[logoUtils] No content-length header for URL: ${url}`);
      return true; // Give it the benefit of the doubt
    }
    
    // If file size is suspiciously small, it might be a "Missing Image" placeholder
    // Check for extremely small files (less than 100 bytes) which are definitely placeholders
    if (fileSize < 100) {
      logger.warn(`[logoUtils] Logo URL returned extremely small file (${fileSize} bytes), likely a placeholder: ${url}`);
      return false;
    }
    
    // For file sizes between 100-500 bytes, they might be small legitimate SVG files
    // So we'll allow them through
    return true;
  } catch (error) {
    logger.error(`[logoUtils] Error checking logo URL: ${url}`, error);
    // Don't fail hard on network errors, let the image component try to load it
    return true;
  }
};

/**
 * Utility to determine if a URL is likely to be a valid logo
 * @param url The logo URL to check
 * @returns True if the URL pattern suggests a valid logo
 */
export const hasValidLogoFormat = (url: string | null): boolean => {
  if (!url) return false;
  
  // Only reject explicit placeholders, otherwise be permissive
  if (url.includes('missing') || url.includes('placeholder.') || url.includes('not-found')) {
    return false;
  }
  
  return true; // Allow most URLs to pass through
};

/**
 * Checks if a URL is from Metahub
 * @param url The URL to check
 * @returns True if the URL is from Metahub
 */
export const isMetahubUrl = (url: string | null): boolean => {
  if (!url) return false;
  return url.includes('metahub.space');
};

/**
 * Checks if a URL is from TMDB 
 * @param url The URL to check
 * @returns True if the URL is from TMDB
 */
export const isTmdbUrl = (url: string | null): boolean => {
  if (!url) return false;
  return url.includes('themoviedb.org') || url.includes('tmdb.org') || url.includes('image.tmdb.org');
};

/**
 * Fetches a banner image based on logo source preference
 * @param imdbId The IMDB ID of the content
 * @param tmdbId The TMDB ID of the content (if available)
 * @param type The content type ('movie' or 'series')
 * @param preference The logo source preference ('metahub' or 'tmdb')
 * @returns The URL of the banner image, or null if none found
 */
export const fetchBannerWithPreference = async (
  imdbId: string | null, 
  tmdbId: number | string | null, 
  type: 'movie' | 'series',
  preference: 'metahub' | 'tmdb'
): Promise<string | null> => {
  logger.log(`[logoUtils] Fetching banner with preference ${preference} for ${type} (IMDB: ${imdbId}, TMDB: ${tmdbId})`);
  
  // Determine which source to try first based on preference
  if (preference === 'tmdb') {
    // Try TMDB first if it's the preferred source
    if (tmdbId) {
      try {
        const tmdbService = TMDBService.getInstance();
        
        // Get backdrop from TMDB
        const tmdbType = type === 'series' ? 'tv' : 'movie';
        logger.log(`[logoUtils] Attempting to fetch banner from TMDB for ${tmdbType} (ID: ${tmdbId})`);
        
        let bannerUrl = null;
        if (tmdbType === 'movie') {
          const movieDetails = await tmdbService.getMovieDetails(tmdbId.toString());
          if (movieDetails && movieDetails.backdrop_path) {
            bannerUrl = tmdbService.getImageUrl(movieDetails.backdrop_path, 'original');
            logger.log(`[logoUtils] Found backdrop_path: ${movieDetails.backdrop_path}`);
          } else {
            logger.warn(`[logoUtils] No backdrop_path found in movie details for ID ${tmdbId}`);
          }
        } else {
          const showDetails = await tmdbService.getTVShowDetails(Number(tmdbId));
          if (showDetails && showDetails.backdrop_path) {
            bannerUrl = tmdbService.getImageUrl(showDetails.backdrop_path, 'original');
            logger.log(`[logoUtils] Found backdrop_path: ${showDetails.backdrop_path}`);
          } else {
            logger.warn(`[logoUtils] No backdrop_path found in TV show details for ID ${tmdbId}`);
          }
        }
        
        if (bannerUrl) {
          logger.log(`[logoUtils] Successfully fetched ${tmdbType} banner from TMDB: ${bannerUrl}`);
          return bannerUrl;
        }
      } catch (error) {
        logger.error(`[logoUtils] Error fetching banner from TMDB for ID ${tmdbId}:`, error);
      }
      
      logger.warn(`[logoUtils] No banner found from TMDB for ${type} (ID: ${tmdbId}), falling back to Metahub`);
    } else {
      logger.warn(`[logoUtils] Cannot fetch from TMDB - no TMDB ID provided, falling back to Metahub`);
    }
  }
  
  // Try Metahub if it's preferred or TMDB failed
  if (imdbId) {
    const metahubUrl = `https://images.metahub.space/background/large/${imdbId}/img`;
    
    logger.log(`[logoUtils] Attempting to fetch banner from Metahub for ${imdbId}`);
    
    try {
      const response = await fetch(metahubUrl, { method: 'HEAD' });
      if (response.ok) {
        logger.log(`[logoUtils] Successfully fetched banner from Metahub: ${metahubUrl}`);
        return metahubUrl;
      } else {
        logger.warn(`[logoUtils] Metahub banner request failed with status ${response.status}`);
      }
    } catch (error) {
      logger.warn(`[logoUtils] Failed to fetch banner from Metahub:`, error);
    }
  } else {
    logger.warn(`[logoUtils] Cannot fetch from Metahub - no IMDB ID provided`);
  }
  
  // If both sources fail or aren't available, return null
  logger.warn(`[logoUtils] No banner found from any source for ${type} (IMDB: ${imdbId}, TMDB: ${tmdbId})`);
  return null;
}; 