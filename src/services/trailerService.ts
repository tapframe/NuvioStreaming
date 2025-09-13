import { logger } from '../utils/logger';

export interface TrailerData {
  url: string;
  title: string;
  year: number;
}

export class TrailerService {
  private static readonly XPRIME_URL = 'https://db.xprime.tv/trailers';
  private static readonly LOCAL_SERVER_URL = 'http://192.168.1.11:3001/trailer';
  private static readonly AUTO_SEARCH_URL = 'http://192.168.1.11:3001/search-trailer';
  private static readonly TIMEOUT = 10000; // 10 seconds
  private static readonly USE_LOCAL_SERVER = true; // Toggle between local and XPrime

  /**
   * Fetches trailer URL for a given title and year
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<string | null> - The trailer URL or null if not found
   */
  static async getTrailerUrl(title: string, year: number): Promise<string | null> {
    if (this.USE_LOCAL_SERVER) {
      // Try local server first, fallback to XPrime if it fails
      const localResult = await this.getTrailerFromLocalServer(title, year);
      if (localResult) {
        return localResult;
      }
      
      logger.info('TrailerService', `Local server failed, falling back to XPrime for: ${title} (${year})`);
      return this.getTrailerFromXPrime(title, year);
    } else {
      return this.getTrailerFromXPrime(title, year);
    }
  }

  /**
   * Fetches trailer from local server using auto-search (no YouTube URL needed)
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<string | null> - The trailer URL or null if not found
   */
  private static async getTrailerFromLocalServer(title: string, year: number): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const url = `${this.AUTO_SEARCH_URL}?title=${encodeURIComponent(title)}&year=${year}`;
      
      logger.info('TrailerService', `Auto-searching trailer for: ${title} (${year})`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Nuvio/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn('TrailerService', `Auto-search failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      if (!data.url || !this.isValidTrailerUrl(data.url)) {
        logger.warn('TrailerService', `Invalid trailer URL from auto-search: ${data.url}`);
        return null;
      }

      logger.info('TrailerService', `Successfully found trailer: ${data.url.substring(0, 50)}...`);
      return data.url;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('TrailerService', 'Auto-search request timed out');
      } else {
        logger.error('TrailerService', 'Error in auto-search:', error);
      }
      return null; // Return null to trigger XPrime fallback
    }
  }

  /**
   * Fetches trailer from XPrime API (original method)
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<string | null> - The trailer URL or null if not found
   */
  private static async getTrailerFromXPrime(title: string, year: number): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const url = `${this.XPRIME_URL}?title=${encodeURIComponent(title)}&year=${year}`;
      
      logger.info('TrailerService', `Fetching trailer from XPrime for: ${title} (${year})`);
      
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
        logger.warn('TrailerService', `XPrime failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const trailerUrl = await response.text();
      
      if (!trailerUrl || !this.isValidTrailerUrl(trailerUrl.trim())) {
        logger.warn('TrailerService', `Invalid trailer URL from XPrime: ${trailerUrl}`);
        return null;
      }

      const cleanUrl = trailerUrl.trim();
      logger.info('TrailerService', `Successfully fetched trailer from XPrime: ${cleanUrl}`);
      
      return cleanUrl;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('TrailerService', 'XPrime request timed out');
      } else {
        logger.error('TrailerService', 'Error fetching from XPrime:', error);
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
        'cloudfront.net',
        'googlevideo.com', // Google's CDN for YouTube videos
        'sn-aigl6nzr.googlevideo.com', // Specific Google CDN servers
        'sn-aigl6nze.googlevideo.com',
        'sn-aigl6nsk.googlevideo.com',
        'sn-aigl6ns6.googlevideo.com'
      ];

      const hostname = urlObj.hostname.toLowerCase();
      const isValidDomain = validDomains.some(domain => 
        hostname.includes(domain) || hostname.endsWith(domain)
      );

      // Special check for Google Video CDN (YouTube direct streaming URLs)
      const isGoogleVideoCDN = hostname.includes('googlevideo.com') || 
                              hostname.includes('sn-') && hostname.includes('.googlevideo.com');

      // Check for video file extensions or streaming formats
      const hasVideoFormat = /\.(mp4|m3u8|mpd|webm|mov|avi|mkv)$/i.test(urlObj.pathname) ||
                            url.includes('formats=') ||
                            url.includes('manifest') ||
                            url.includes('playlist');

      return isValidDomain || hasVideoFormat || isGoogleVideoCDN;
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

  /**
   * Switch between local server and XPrime API
   * @param useLocal - true for local server, false for XPrime
   */
  static setUseLocalServer(useLocal: boolean): void {
    (this as any).USE_LOCAL_SERVER = useLocal;
    logger.info('TrailerService', `Switched to ${useLocal ? 'local server' : 'XPrime API'}`);
  }

  /**
   * Get current server status
   * @returns object with server information
   */
  static getServerStatus(): { usingLocal: boolean; localUrl: string; xprimeUrl: string; fallbackEnabled: boolean } {
    return {
      usingLocal: this.USE_LOCAL_SERVER,
      localUrl: this.LOCAL_SERVER_URL,
      xprimeUrl: this.XPRIME_URL,
      fallbackEnabled: true // Always enabled now
    };
  }

  /**
   * Test both servers and return their status
   * @returns Promise with server status information
   */
  static async testServers(): Promise<{
    localServer: { status: 'online' | 'offline'; responseTime?: number };
    xprimeServer: { status: 'online' | 'offline'; responseTime?: number };
  }> {
    const results = {
      localServer: { status: 'offline' as const },
      xprimeServer: { status: 'offline' as const }
    };

    // Test local server
    try {
      const startTime = Date.now();
      const response = await fetch(`${this.AUTO_SEARCH_URL}?title=test&year=2023`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      if (response.ok || response.status === 404) { // 404 is ok, means server is running
        results.localServer = { 
          status: 'online', 
          responseTime: Date.now() - startTime 
        };
      }
    } catch (error) {
      logger.warn('TrailerService', 'Local server test failed:', error);
    }

    // Test XPrime server
    try {
      const startTime = Date.now();
      const response = await fetch(`${this.XPRIME_URL}?title=test&year=2023`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      if (response.ok || response.status === 404) { // 404 is ok, means server is running
        results.xprimeServer = { 
          status: 'online', 
          responseTime: Date.now() - startTime 
        };
      }
    } catch (error) {
      logger.warn('TrailerService', 'XPrime server test failed:', error);
    }

    return results;
  }
}

export default TrailerService;