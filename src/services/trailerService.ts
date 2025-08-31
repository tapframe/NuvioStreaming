import { logger } from '../utils/logger';

export interface TrailerData {
  url: string;
  title: string;
  year: number;
}

export class TrailerService {
  private static readonly BASE_URL = 'https://db.xprime.tv/trailers';
  private static readonly TIMEOUT = 10000; // 10 seconds

  /**
   * Fetches trailer URL for a given title and year
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<string | null> - The trailer URL or null if not found
   */
  static async getTrailerUrl(title: string, year: number): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const url = `${this.BASE_URL}?title=${encodeURIComponent(title)}&year=${year}`;
      
      logger.info('TrailerService', `Fetching trailer for: ${title} (${year})`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'Nuvio/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn('TrailerService', `Failed to fetch trailer: ${response.status} ${response.statusText}`);
        return null;
      }

      const trailerUrl = await response.text();
      
      // Validate the response is a valid URL
      if (!trailerUrl || !this.isValidTrailerUrl(trailerUrl.trim())) {
        logger.warn('TrailerService', `Invalid trailer URL received: ${trailerUrl}`);
        return null;
      }

      const cleanUrl = trailerUrl.trim();
      logger.info('TrailerService', `Successfully fetched trailer URL: ${cleanUrl}`);
      
      return cleanUrl;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('TrailerService', 'Trailer fetch request timed out');
      } else {
        logger.error('TrailerService', 'Error fetching trailer:', error);
      }
      return null;
    }
  }

  /**
   * Validates if the provided string is a valid trailer URL
   * @param url - The URL to validate
   * @returns boolean - True if valid, false otherwise
   */
  private static isValidTrailerUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Check if it's a valid HTTP/HTTPS URL
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Check for common video streaming domains/patterns
      const validDomains = [
        'theplatform.com',
        'youtube.com',
        'youtu.be',
        'vimeo.com',
        'dailymotion.com',
        'twitch.tv',
        'amazonaws.com',
        'cloudfront.net'
      ];

      const hostname = urlObj.hostname.toLowerCase();
      const isValidDomain = validDomains.some(domain => 
        hostname.includes(domain) || hostname.endsWith(domain)
      );

      // Check for video file extensions or streaming formats
      const hasVideoFormat = /\.(mp4|m3u8|mpd|webm|mov|avi|mkv)$/i.test(urlObj.pathname) ||
                            url.includes('formats=') ||
                            url.includes('manifest') ||
                            url.includes('playlist');

      return isValidDomain || hasVideoFormat;
    } catch {
      return false;
    }
  }

  /**
   * Extracts the best video format URL from a multi-format URL
   * @param url - The trailer URL that may contain multiple formats
   * @returns string - The best format URL for mobile playback
   */
  static getBestFormatUrl(url: string): string {
    // If the URL contains format parameters, try to get the best one for mobile
    if (url.includes('formats=')) {
      // Prefer M3U (HLS) for better mobile compatibility
      if (url.includes('M3U')) {
        // Try to get M3U without encryption first, then with encryption
        const baseUrl = url.split('?')[0];
        return `${baseUrl}?formats=M3U+none,M3U+appleHlsEncryption`;
      }
      // Fallback to MP4 if available
      if (url.includes('MPEG4')) {
        const baseUrl = url.split('?')[0];
        return `${baseUrl}?formats=MPEG4`;
      }
    }
    
    // Return the original URL if no format optimization is needed
    return url;
  }

  /**
   * Checks if a trailer is available for the given title and year
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<boolean> - True if trailer is available
   */
  static async isTrailerAvailable(title: string, year: number): Promise<boolean> {
    const trailerUrl = await this.getTrailerUrl(title, year);
    return trailerUrl !== null;
  }

  /**
   * Gets trailer data with additional metadata
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<TrailerData | null> - Trailer data or null if not found
   */
  static async getTrailerData(title: string, year: number): Promise<TrailerData | null> {
    const url = await this.getTrailerUrl(title, year);
    
    if (!url) {
      return null;
    }

    return {
      url: this.getBestFormatUrl(url),
      title,
      year
    };
  }
}

export default TrailerService;