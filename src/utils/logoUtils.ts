import { logger } from './logger';
import { TMDBService } from '../services/tmdbService';


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
 * Checks if a URL is from TMDB 
 * @param url The URL to check
 * @returns True if the URL is from TMDB
 */
export const isTmdbUrl = (url: string | null): boolean => {
  if (!url) return false;
  return url.includes('themoviedb.org') || url.includes('tmdb.org') || url.includes('image.tmdb.org');
};

/**
 * Fetches a banner image from TMDB
 * @param tmdbId The TMDB ID of the content
 * @param type The content type ('movie' or 'series')
 * @returns The URL of the banner image, or null if none found
 */
export const fetchBannerFromTMDB = async (
  tmdbId: number | string | null, 
  type: 'movie' | 'series'
): Promise<string | null> => {
  logger.log(`[logoUtils] Fetching banner from TMDB for ${type} (ID: ${tmdbId})`);
  
  if (!tmdbId) {
    logger.warn(`[logoUtils] Cannot fetch from TMDB - no TMDB ID provided`);
    return null;
  }
  
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
  
  logger.warn(`[logoUtils] No banner found from TMDB for ${type} (ID: ${tmdbId})`);
  return null;
}; 