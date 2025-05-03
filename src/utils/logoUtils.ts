import { logger } from './logger';

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