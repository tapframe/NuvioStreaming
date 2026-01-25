import { logger } from '../utils/logger';

export interface TrailerData {
  url: string;
  title: string;
  year: number;
}

export class TrailerService {
  // Environment-configurable values (Expo public env)
  private static readonly ENV_LOCAL_BASE = process.env.EXPO_PUBLIC_TRAILER_LOCAL_BASE || 'http://46.62.173.157:3001';
  private static readonly ENV_LOCAL_TRAILER_PATH = process.env.EXPO_PUBLIC_TRAILER_LOCAL_TRAILER_PATH || '/trailer';
  private static readonly ENV_LOCAL_SEARCH_PATH = process.env.EXPO_PUBLIC_TRAILER_LOCAL_SEARCH_PATH || '/search-trailer';

  private static readonly LOCAL_SERVER_URL = `${TrailerService.ENV_LOCAL_BASE}${TrailerService.ENV_LOCAL_TRAILER_PATH}`;
  private static readonly AUTO_SEARCH_URL = `${TrailerService.ENV_LOCAL_BASE}${TrailerService.ENV_LOCAL_SEARCH_PATH}`;
  private static readonly TIMEOUT = 20000; // 20 seconds

  /**
   * Fetches trailer URL for a given title and year
   * @param title - The movie/series title
   * @param year - The release year
   * @param tmdbId - Optional TMDB ID for more accurate results
   * @param type - Optional content type ('movie' or 'tv')
   * @returns Promise<string | null> - The trailer URL or null if not found
   */
  static async getTrailerUrl(title: string, year: number, tmdbId?: string, type?: 'movie' | 'tv'): Promise<string | null> {
    logger.info('TrailerService', `getTrailerUrl requested: title="${title}", year=${year}, tmdbId=${tmdbId || 'n/a'}, type=${type || 'n/a'}`);
    return this.getTrailerFromLocalServer(title, year, tmdbId, type);
  }

  /**
   * Fetches trailer from local server using TMDB API or auto-search
   * @param title - The movie/series title
   * @param year - The release year
   * @param tmdbId - Optional TMDB ID for more accurate results
   * @param type - Optional content type ('movie' or 'tv')
   * @returns Promise<string | null> - The trailer URL or null if not found
   */
  private static async getTrailerFromLocalServer(title: string, year: number, tmdbId?: string, type?: 'movie' | 'tv'): Promise<string | null> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    // Build URL with parameters
    const params = new URLSearchParams();

    // Always send title and year for logging and fallback
    params.append('title', title);
    params.append('year', year.toString());

    if (tmdbId) {
      params.append('tmdbId', tmdbId);
      params.append('type', type || 'movie');
      logger.info('TrailerService', `Using TMDB API for: ${title} (TMDB ID: ${tmdbId})`);
    } else {
      logger.info('TrailerService', `Auto-searching trailer for: ${title} (${year})`);
    }

    const url = `${this.AUTO_SEARCH_URL}?${params.toString()}`;
    logger.info('TrailerService', `Local server request URL: ${url}`);
    logger.info('TrailerService', `Local server timeout set to ${this.TIMEOUT}ms`);
    logger.info('TrailerService', `Making fetch request to: ${url}`);

    try {

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Nuvio/1.0',
        },
        signal: controller.signal,
      });

      // logger.info('TrailerService', `Fetch request completed. Response status: ${response.status}`);

      clearTimeout(timeoutId);

      const elapsed = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || 'unknown';
      // logger.info('TrailerService', `Local server response: status=${response.status} ok=${response.ok} content-type=${contentType} elapsedMs=${elapsed}`);

      // Read body as text first so we can log it even on non-200s
      let rawText = '';
      try {
        rawText = await response.text();
        if (rawText) {
          /*
          const preview = rawText.length > 200 ? `${rawText.slice(0, 200)}...` : rawText;
          logger.info('TrailerService', `Local server body preview: ${preview}`);
          */
        } else {
          // logger.info('TrailerService', 'Local server body is empty');
        }
      } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        logger.warn('TrailerService', `Failed reading local server body text: ${msg}`);
      }

      if (!response.ok) {
        logger.warn('TrailerService', `Auto-search failed: ${response.status} ${response.statusText}`);
        return null;
      }

      // Attempt to parse JSON from the raw text
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
        // const keys = typeof data === 'object' && data !== null ? Object.keys(data).join(',') : typeof data;
        // logger.info('TrailerService', `Local server JSON parsed. Keys/Type: ${keys}`);
      } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        logger.warn('TrailerService', `Failed to parse local server JSON: ${msg}`);
        return null;
      }

      if (!data.url || !this.isValidTrailerUrl(data.url)) {
        logger.warn('TrailerService', `Invalid trailer URL from auto-search: ${data.url}`);
        return null;
      }

      // logger.info('TrailerService', `Successfully found trailer: ${String(data.url).substring(0, 80)}...`);
      return data.url;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('TrailerService', `Auto-search request timed out after ${this.TIMEOUT}ms`);
      } else {
        const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        logger.error('TrailerService', `Error in auto-search: ${msg}`);
        logger.error('TrailerService', `Error details:`, {
          name: (error as any)?.name,
          message: (error as any)?.message,
          stack: (error as any)?.stack,
          url: url
        });
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
        const best = `${baseUrl}?formats=M3U+none,M3U+appleHlsEncryption`;
        logger.info('TrailerService', `Optimized format URL from M3U: ${best.substring(0, 80)}...`);
        return best;
      }
      // Fallback to MP4 if available
      if (url.includes('MPEG4')) {
        const baseUrl = url.split('?')[0];
        const best = `${baseUrl}?formats=MPEG4`;
        logger.info('TrailerService', `Optimized format URL from MPEG4: ${best.substring(0, 80)}...`);
        return best;
      }
    }

    // Return the original URL if no format optimization is needed
    // logger.info('TrailerService', 'No format optimization applied');
    return url;
  }

  /**
   * Checks if a trailer is available for the given title and year
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<boolean> - True if trailer is available
   */
  static async isTrailerAvailable(title: string, year: number): Promise<boolean> {
    logger.info('TrailerService', `Checking trailer availability for: ${title} (${year})`);
    const trailerUrl = await this.getTrailerUrl(title, year);
    logger.info('TrailerService', `Trailer availability for ${title} (${year}): ${trailerUrl ? 'available' : 'not available'}`);
    return trailerUrl !== null;
  }

  /**
   * Gets trailer data with additional metadata
   * @param title - The movie/series title
   * @param year - The release year
   * @returns Promise<TrailerData | null> - Trailer data or null if not found
   */
  static async getTrailerData(title: string, year: number): Promise<TrailerData | null> {
    logger.info('TrailerService', `getTrailerData for: ${title} (${year})`);
    const url = await this.getTrailerUrl(title, year);

    if (!url) {
      logger.info('TrailerService', 'No trailer URL found for getTrailerData');
      return null;
    }

    return {
      url: this.getBestFormatUrl(url),
      title,
      year
    };
  }

  /**
   * Fetches trailer directly from a known YouTube URL
   * @param youtubeUrl - The YouTube URL to process
   * @param title - Optional title for logging/caching
   * @param year - Optional year for logging/caching
   * @returns Promise<string | null> - The direct streaming URL or null if failed
   */
  static async getTrailerFromYouTubeUrl(youtubeUrl: string, title?: string, year?: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const params = new URLSearchParams();
      params.append('youtube_url', youtubeUrl);
      if (title) params.append('title', title);
      if (year) params.append('year', year.toString());

      const url = `${this.ENV_LOCAL_BASE}${this.ENV_LOCAL_TRAILER_PATH}?${params.toString()}`;
      logger.info('TrailerService', `Fetching trailer directly from YouTube URL: ${youtubeUrl}`);
      logger.info('TrailerService', `Direct trailer request URL: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Nuvio/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      logger.info('TrailerService', `Direct trailer response: status=${response.status} ok=${response.ok}`);

      if (!response.ok) {
        logger.warn('TrailerService', `Direct trailer failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      if (!data.url || !this.isValidTrailerUrl(data.url)) {
        logger.warn('TrailerService', `Invalid trailer URL from direct fetch: ${data.url}`);
        return null;
      }

      logger.info('TrailerService', `Successfully got direct trailer: ${String(data.url).substring(0, 80)}...`);
      return data.url;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('TrailerService', `Direct trailer request timed out after ${this.TIMEOUT}ms`);
      } else {
        const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        logger.error('TrailerService', `Error in direct trailer fetch: ${msg}`);
      }
      return null;
    }
  }

  /**
   * Switch between local server (deprecated - always uses local server now)
   * @param useLocal - true for local server (always true now)
   */
  static setUseLocalServer(useLocal: boolean): void {
    if (!useLocal) {
      logger.warn('TrailerService', 'XPrime API is no longer supported. Always using local server.');
    }
    logger.info('TrailerService', 'Using local server');
  }

  /**
   * Get current server status
   * @returns object with server information
   */
  static getServerStatus(): { usingLocal: boolean; localUrl: string } {
    return {
      usingLocal: true,
      localUrl: this.LOCAL_SERVER_URL,
    };
  }

  /**
   * Test local server and return its status
   * @returns Promise with server status information
   */
  static async testServers(): Promise<{
    localServer: { status: 'online' | 'offline'; responseTime?: number };
  }> {
    logger.info('TrailerService', 'Testing local server');
    const results: {
      localServer: { status: 'online' | 'offline'; responseTime?: number };
    } = {
      localServer: { status: 'offline' }
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
        logger.info('TrailerService', `Local server online. Response time: ${results.localServer.responseTime}ms`);
      }
    } catch (error) {
      const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      logger.warn('TrailerService', `Local server test failed: ${msg}`);
    }

    logger.info('TrailerService', `Server test results -> local: ${results.localServer.status}`);
    return results;
  }
}

export default TrailerService;