import { logger } from '../utils/logger';
import { Stream } from '../types/metadata';
import { tmdbService } from './tmdbService';
import axios from 'axios';
import { settingsEmitter } from '../hooks/useSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use node-fetch if available, otherwise fallback to global fetch
let fetchImpl: typeof fetch;
try {
  // @ts-ignore
  fetchImpl = require('node-fetch');
} catch {
  fetchImpl = fetch;
}

// Constants
const REZKA_BASE = 'https://hdrezka.ag/';
const BASE_HEADERS = {
  'X-Hdrezka-Android-App': '1',
  'X-Hdrezka-Android-App-Version': '2.2.0',
};

class HDRezkaService {
  private MAX_RETRIES = 3;
  private RETRY_DELAY = 1000; // 1 second
  
  // No cookies/session logic needed for Android app API
  private getHeaders() {
    return {
      ...BASE_HEADERS,
      'User-Agent': 'okhttp/4.9.0',
    };
  }

  private generateRandomFavs(): string {
    const randomHex = () => Math.floor(Math.random() * 16).toString(16);
    const generateSegment = (length: number) => Array.from({ length }, () => randomHex()).join('');
    
    return `${generateSegment(8)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(12)}`;
  }
  
  private extractTitleAndYear(input: string): { title: string; year: number | null } | null {
    // Handle multiple formats
    
    // Format 1: "Title, YEAR, Additional info"
    const regex1 = /^(.*?),.*?(\d{4})/;
    const match1 = input.match(regex1);
    if (match1) {
      const title = match1[1];
      const year = match1[2];
      return { title: title.trim(), year: year ? parseInt(year, 10) : null };
    }
    
    // Format 2: "Title (YEAR)"
    const regex2 = /^(.*?)\s*\((\d{4})\)/;
    const match2 = input.match(regex2);
    if (match2) {
      const title = match2[1];
      const year = match2[2];
      return { title: title.trim(), year: year ? parseInt(year, 10) : null };
    }
    
    // Format 3: Look for any 4-digit year in the string
    const yearMatch = input.match(/(\d{4})/);
    if (yearMatch) {
      const year = yearMatch[1];
      // Remove the year and any surrounding brackets/parentheses from the title
      let title = input.replace(/\s*\(\d{4}\)|\s*\[\d{4}\]|\s*\d{4}/, '');
      return { title: title.trim(), year: year ? parseInt(year, 10) : null };
    }
    
    // If no year found but we have a title
    if (input.trim()) {
      return { title: input.trim(), year: null };
    }
    
    return null;
  }

  private parseVideoLinks(inputString: string | undefined): Record<string, { type: string; url: string }> {
    if (!inputString) {
      logger.log('[HDRezka] No video links found');
      return {};
    }
    
    logger.log(`[HDRezka] Parsing video links from stream URL data`);
    const linksArray = inputString.split(',');
    const result: Record<string, { type: string; url: string }> = {};

    linksArray.forEach((link) => {
      // Handle different quality formats:
      // 1. Simple format: [360p]https://example.com/video.mp4
      // 2. HTML format: [<span class="pjs-registered-quality">1080p<img...>]https://example.com/video.mp4
      
      // Try simple format first (non-HTML)
      let match = link.match(/\[([^<\]]+)\](https?:\/\/[^\s,]+\.mp4|null)/);
      
      // If not found, try HTML format with more flexible pattern
      if (!match) {
        // Extract quality text from HTML span
        const qualityMatch = link.match(/\[<span[^>]*>([^<]+)/);
        // Extract URL separately
        const urlMatch = link.match(/\][^[]*?(https?:\/\/[^\s,]+\.mp4|null)/);
        
        if (qualityMatch && urlMatch) {
          match = [link, qualityMatch[1].trim(), urlMatch[1]] as RegExpMatchArray;
        }
      }
      
      if (match) {
        const qualityText = match[1].trim();
        const mp4Url = match[2];
        
        // Skip null URLs (premium content that requires login)
        if (mp4Url !== 'null') {
          result[qualityText] = { type: 'mp4', url: mp4Url };
          logger.log(`[HDRezka] Found ${qualityText}: ${mp4Url}`);
        } else {
          logger.log(`[HDRezka] Premium quality ${qualityText} requires login (null URL)`);
        }
      } else {
        logger.log(`[HDRezka] Could not parse quality from: ${link}`);
      }
    });

    logger.log(`[HDRezka] Found ${Object.keys(result).length} valid qualities: ${Object.keys(result).join(', ')}`);
    return result;
  }

  private parseSubtitles(inputString: string | undefined): Array<{
    id: string;
    language: string;
    hasCorsRestrictions: boolean;
    type: string;
    url: string;
  }> {
    if (!inputString) {
      logger.log('[HDRezka] No subtitles found');
      return [];
    }
    
    logger.log(`[HDRezka] Parsing subtitles data`);
    const linksArray = inputString.split(',');
    const captions: Array<{
      id: string;
      language: string;
      hasCorsRestrictions: boolean;
      type: string;
      url: string;
    }> = [];

    linksArray.forEach((link) => {
      const match = link.match(/\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/);

      if (match) {
        const language = match[1];
        const url = match[2];
        
        captions.push({
          id: url,
          language,
          hasCorsRestrictions: false,
          type: 'vtt',
          url: url,
        });
        logger.log(`[HDRezka] Found subtitle ${language}: ${url}`);
      }
    });

    logger.log(`[HDRezka] Found ${captions.length} subtitles`);
    return captions;
  }

  async searchAndFindMediaId(media: { title: string; type: string; releaseYear?: number }): Promise<{
    id: string;
    year: number;
    type: string;
    url: string;
    title: string;
  } | null> {
    logger.log(`[HDRezka] Searching for title: ${media.title}, type: ${media.type}, year: ${media.releaseYear || 'any'}`);

    const itemRegexPattern = /<a href="([^"]+)"><span class="enty">([^<]+)<\/span> \(([^)]+)\)/g;
    const idRegexPattern = /\/(\d+)-[^/]+\.html$/;

    const fullUrl = new URL('/engine/ajax/search.php', REZKA_BASE);
    fullUrl.searchParams.append('q', media.title);

    logger.log(`[HDRezka] Making search request to: ${fullUrl.toString()}`);
    try {
      const response = await fetchImpl(fullUrl.toString(), {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const searchData = await response.text();
      logger.log(`[HDRezka] Search response length: ${searchData.length}`);

      const movieData: Array<{
        id: string;
        year: number;
        type: string;
        url: string;
        title: string;
      }> = [];

      let match;

      while ((match = itemRegexPattern.exec(searchData)) !== null) {
        const url = match[1];
        const titleAndYear = match[3];

        const result = this.extractTitleAndYear(titleAndYear);
        if (result !== null) {
          const id = url.match(idRegexPattern)?.[1] || null;
          const isMovie = url.includes('/films/');
          const isShow = url.includes('/series/');
          const type = isMovie ? 'movie' : isShow ? 'show' : 'unknown';

          movieData.push({
            id: id ?? '',
            year: result.year ?? 0,
            type,
            url,
            title: match[2]
          });
          logger.log(`[HDRezka] Found: id=${id}, title=${match[2]}, type=${type}, year=${result.year}`);
        }
      }

      // If year is provided, filter by year
      let filteredItems = movieData;
      if (media.releaseYear) {
        filteredItems = movieData.filter(item => item.year === media.releaseYear);
        logger.log(`[HDRezka] Items filtered by year ${media.releaseYear}: ${filteredItems.length}`);
      }

      // If type is provided, filter by type
      if (media.type) {
        filteredItems = filteredItems.filter(item => item.type === media.type);
        logger.log(`[HDRezka] Items filtered by type ${media.type}: ${filteredItems.length}`);
      }

      if (filteredItems.length > 0) {
        logger.log(`[HDRezka] Selected item: id=${filteredItems[0].id}, title=${filteredItems[0].title}`);
        return filteredItems[0];
      } else if (movieData.length > 0) {
        logger.log(`[HDRezka] No exact match, using first result: id=${movieData[0].id}, title=${movieData[0].title}`);
        return movieData[0];
      } else {
        logger.log(`[HDRezka] No matching items found`);
        return null;
      }
    } catch (error) {
      logger.error(`[HDRezka] Search request failed: ${error}`);
      return null;
    }
  }

  async getTranslatorId(url: string, id: string, mediaType: string): Promise<string | null> {
    logger.log(`[HDRezka] Getting translator ID for url=${url}, id=${id}`);

    // Make sure the URL is absolute
    const fullUrl = url.startsWith('http') ? url : `${REZKA_BASE}${url.startsWith('/') ? url.substring(1) : url}`;
    logger.log(`[HDRezka] Making request to: ${fullUrl}`);

    try {
      const response = await fetchImpl(fullUrl, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      logger.log(`[HDRezka] Translator page response length: ${responseText.length}`);

      // 1. Check for "Original + Subtitles" specific ID (often ID 238)
      if (responseText.includes(`data-translator_id="238"`)) {
        logger.log(`[HDRezka] Found specific translator ID 238 (Original + subtitles)`);
        return '238';
      }

      // 2. Try to extract from the main CDN init function (e.g., initCDNMoviesEvents, initCDNSeriesEvents)
      const functionName = mediaType === 'movie' ? 'initCDNMoviesEvents' : 'initCDNSeriesEvents';
      const cdnEventsRegex = new RegExp(`sof\.tv\.${functionName}\(${id}, ([^,]+)`, 'i');
      const cdnEventsMatch = responseText.match(cdnEventsRegex);

      if (cdnEventsMatch && cdnEventsMatch[1]) {
        const translatorIdFromCdn = cdnEventsMatch[1].trim().replace(/['"]/g, ''); // Remove potential quotes
        if (translatorIdFromCdn && translatorIdFromCdn !== 'false' && translatorIdFromCdn !== 'null') {
          logger.log(`[HDRezka] Extracted translator ID from CDN init: ${translatorIdFromCdn}`);
          return translatorIdFromCdn;
        }
      }
      logger.log(`[HDRezka] CDN init function did not yield a valid translator ID.`);

      // 3. Fallback: Try to find any other data-translator_id attribute in the HTML
      // This regex looks for data-translator_id="<digits>"
      const anyTranslatorRegex = /data-translator_id="(\d+)"/;
      const anyTranslatorMatch = responseText.match(anyTranslatorRegex);

      if (anyTranslatorMatch && anyTranslatorMatch[1]) {
        const fallbackTranslatorId = anyTranslatorMatch[1].trim();
        logger.log(`[HDRezka] Found fallback translator ID from data attribute: ${fallbackTranslatorId}`);
        return fallbackTranslatorId;
      }
      logger.log(`[HDRezka] No fallback data-translator_id found.`);

      // If all attempts fail
      logger.log(`[HDRezka] Could not find any translator ID for id ${id} on page ${fullUrl}`);
      return null;
    } catch (error) {
      logger.error(`[HDRezka] Failed to get translator ID: ${error}`);
      return null;
    }
  }

  async getStream(id: string, translatorId: string, media: {
    type: string;
    season?: { number: number };
    episode?: { number: number };
  }): Promise<any> {
    logger.log(`[HDRezka] Getting stream for id=${id}, translatorId=${translatorId}`);

    const searchParams = new URLSearchParams();
    searchParams.append('id', id);
    searchParams.append('translator_id', translatorId);

    if (media.type === 'show' && media.season && media.episode) {
      searchParams.append('season', media.season.number.toString());
      searchParams.append('episode', media.episode.number.toString());
      logger.log(`[HDRezka] Show params: season=${media.season.number}, episode=${media.episode.number}`);
    }

    const randomFavs = this.generateRandomFavs();
    searchParams.append('favs', randomFavs);
    searchParams.append('action', media.type === 'show' ? 'get_stream' : 'get_movie');

    const fullUrl = `${REZKA_BASE}ajax/get_cdn_series/`;
    logger.log(`[HDRezka] Making stream request to: ${fullUrl} with action=${media.type === 'show' ? 'get_stream' : 'get_movie'}`);

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        // Log the request details
        logger.log('[HDRezka][AXIOS DEBUG]', {
          url: fullUrl,
          method: 'POST',
          headers: this.getHeaders(),
          data: searchParams.toString()
        });
        const axiosResponse = await axios.post(fullUrl, searchParams.toString(), {
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          validateStatus: () => true,
        });
        logger.log('[HDRezka][AXIOS RESPONSE]', {
          status: axiosResponse.status,
          headers: axiosResponse.headers,
          data: axiosResponse.data
        });
        if (axiosResponse.status !== 200) {
          throw new Error(`HTTP error! status: ${axiosResponse.status}`);
        }
        const responseText = typeof axiosResponse.data === 'string' ? axiosResponse.data : JSON.stringify(axiosResponse.data);
        logger.log(`[HDRezka] Stream response length: ${responseText.length}`);
        try {
          const parsedResponse = typeof axiosResponse.data === 'object' ? axiosResponse.data : JSON.parse(responseText);
          logger.log(`[HDRezka] Parsed response successfully: ${JSON.stringify(parsedResponse)}`);
          if (!parsedResponse.success && parsedResponse.message) {
            logger.error(`[HDRezka] Server returned error: ${parsedResponse.message}`);
            if (attempts < maxAttempts) {
              logger.log(`[HDRezka] Retrying stream request (attempt ${attempts + 1}/${maxAttempts})...`);
              continue;
            }
            return null;
          }
          const qualities = this.parseVideoLinks(parsedResponse.url);
          const captions = this.parseSubtitles(parsedResponse.subtitle);
          return {
            qualities,
            captions
          };
        } catch (e: unknown) {
          const error = e instanceof Error ? e.message : String(e);
          logger.error(`[HDRezka] Failed to parse JSON response: ${error}`);
          if (attempts < maxAttempts) {
            logger.log(`[HDRezka] Retrying stream request (attempt ${attempts + 1}/${maxAttempts})...`);
            continue;
          }
          return null;
        }
      } catch (error) {
        logger.error(`[HDRezka] Stream request failed: ${error}`);
        if (attempts < maxAttempts) {
          logger.log(`[HDRezka] Retrying stream request (attempt ${attempts + 1}/${maxAttempts})...`);
          continue;
        }
        return null;
      }
    }
    logger.error(`[HDRezka] All stream request attempts failed`);
    return null;
  }

  async getStreams(mediaId: string, mediaType: string, season?: number, episode?: number): Promise<Stream[]> {
    try {
      logger.log(`[HDRezka] Getting streams for ${mediaType} with ID: ${mediaId}`);
      
      // Check if internal providers are enabled globally
      const appSettingsJson = await AsyncStorage.getItem('app_settings');
      if (appSettingsJson) {
        const appSettings = JSON.parse(appSettingsJson);
        if (appSettings.enableInternalProviders === false) {
          logger.log('[HDRezka] Internal providers are disabled in settings, skipping HDRezka');
          return [];
        }
      }

      // Check if HDRezka specifically is enabled
      const hdrezkaSettingsJson = await AsyncStorage.getItem('hdrezka_settings');
      if (hdrezkaSettingsJson) {
        const hdrezkaSettings = JSON.parse(hdrezkaSettingsJson);
        if (hdrezkaSettings.enabled === false) {
          logger.log('[HDRezka] HDRezka provider is disabled in settings, skipping HDRezka');
          return [];
        }
      }
      
      // First, extract the actual title from TMDB if this is an ID
      let title = mediaId;
      let year: number | undefined = undefined;
      
      if (mediaId.startsWith('tt') || mediaId.startsWith('tmdb:')) {
        let tmdbId: number | null = null;
        
        // Handle IMDB IDs
        if (mediaId.startsWith('tt')) {
          logger.log(`[HDRezka] Converting IMDB ID to TMDB ID: ${mediaId}`);
          tmdbId = await tmdbService.findTMDBIdByIMDB(mediaId);
        } 
        // Handle TMDB IDs
        else if (mediaId.startsWith('tmdb:')) {
          tmdbId = parseInt(mediaId.split(':')[1], 10);
        }
        
        if (tmdbId) {
          // Fetch metadata from TMDB API
          if (mediaType === 'movie') {
            logger.log(`[HDRezka] Fetching movie details from TMDB for ID: ${tmdbId}`);
            const movieDetails = await tmdbService.getMovieDetails(tmdbId.toString());
            if (movieDetails) {
              title = movieDetails.title;
              year = movieDetails.release_date ? parseInt(movieDetails.release_date.substring(0, 4), 10) : undefined;
              logger.log(`[HDRezka] Using movie title "${title}" (${year}) for search`);
            }
          } else {
            logger.log(`[HDRezka] Fetching TV show details from TMDB for ID: ${tmdbId}`);
            const showDetails = await tmdbService.getTVShowDetails(tmdbId);
            if (showDetails) {
              title = showDetails.name;
              year = showDetails.first_air_date ? parseInt(showDetails.first_air_date.substring(0, 4), 10) : undefined;
              logger.log(`[HDRezka] Using TV show title "${title}" (${year}) for search`);
            }
          }
        }
      }
      
      const media = {
        title,
        type: mediaType === 'movie' ? 'movie' : 'show',
        releaseYear: year
      };

      // Step 1: Search and find media ID
      const searchResult = await this.searchAndFindMediaId(media);
      if (!searchResult || !searchResult.id) {
        logger.log('[HDRezka] No search results found');
        return [];
      }

      // Step 2: Get translator ID
      const translatorId = await this.getTranslatorId(
        searchResult.url, 
        searchResult.id, 
        media.type
      );
      
      if (!translatorId) {
        logger.log('[HDRezka] No translator ID found');
        return [];
      }

      // Step 3: Get stream
      const streamParams = {
        type: media.type,
        season: season ? { number: season } : undefined,
        episode: episode ? { number: episode } : undefined
      };
      
      const streamData = await this.getStream(searchResult.id, translatorId, streamParams);
      if (!streamData) {
        logger.log('[HDRezka] No stream data found');
        return [];
      }
      
      // Convert to Stream format
      const streams: Stream[] = [];
      
      Object.entries(streamData.qualities).forEach(([quality, data]: [string, any]) => {
        streams.push({
          name: 'HDRezka',
          title: quality,
          url: data.url,
          behaviorHints: {
            notWebReady: false
          }
        });
      });
      
      logger.log(`[HDRezka] Found ${streams.length} streams`);
      return streams;
    } catch (error) {
      logger.error(`[HDRezka] Error getting streams: ${error}`);
      return [];
    }
  }
}

export const hdrezkaService = new HDRezkaService(); 