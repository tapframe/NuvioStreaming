import { logger } from '../utils/logger';
import { Stream } from '../types/metadata';
import { tmdbService } from './tmdbService';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

// Use node-fetch if available, otherwise fallback to global fetch
let fetchImpl: typeof fetch;
try {
  // @ts-ignore
  fetchImpl = require('node-fetch');
} catch {
  fetchImpl = fetch;
}

// Constants
const MAX_RETRIES_XPRIME = 3;
const RETRY_DELAY_MS_XPRIME = 1000;

// Use app's cache directory for React Native
const CACHE_DIR = `${FileSystem.cacheDirectory}xprime/`;

const BROWSER_HEADERS_XPRIME = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Connection': 'keep-alive'
};

interface XprimeStream {
  url: string;
  quality: string;
  title: string;
  provider: string;
  codecs: string[];
  size: string;
}

class XprimeService {
  private MAX_RETRIES = 3;
  private RETRY_DELAY = 1000; // 1 second

  // Ensure cache directories exist
  private async ensureCacheDir(dirPath: string) {
    try {
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }
    } catch (error) {
      logger.error(`[XPRIME] Warning: Could not create cache directory ${dirPath}:`, error);
    }
  }

  // Cache helpers
  private async getFromCache(cacheKey: string, subDir: string = ''): Promise<any> {
    try {
      const fullPath = `${CACHE_DIR}${subDir}/${cacheKey}`;
      const fileInfo = await FileSystem.getInfoAsync(fullPath);
      
      if (fileInfo.exists) {
        const data = await FileSystem.readAsStringAsync(fullPath);
        logger.log(`[XPRIME] CACHE HIT for: ${subDir}/${cacheKey}`);
        try {
          return JSON.parse(data);
        } catch (e) {
          return data;
        }
      }
      return null;
    } catch (error) {
      logger.error(`[XPRIME] CACHE READ ERROR for ${cacheKey}:`, error);
      return null;
    }
  }

  private async saveToCache(cacheKey: string, content: any, subDir: string = '') {
    try {
      const fullSubDir = `${CACHE_DIR}${subDir}/`;
      await this.ensureCacheDir(fullSubDir);
      
      const fullPath = `${fullSubDir}${cacheKey}`;
      const dataToSave = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      
      await FileSystem.writeAsStringAsync(fullPath, dataToSave);
      logger.log(`[XPRIME] SAVED TO CACHE: ${subDir}/${cacheKey}`);
    } catch (error) {
      logger.error(`[XPRIME] CACHE WRITE ERROR for ${cacheKey}:`, error);
    }
  }

  // Helper function to fetch stream size using a HEAD request
  private async fetchStreamSize(url: string): Promise<string> {
    const cacheSubDir = 'xprime_stream_sizes';
    
    // Create a hash of the URL to use as the cache key
    const urlHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.MD5,
      url,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    const urlCacheKey = `${urlHash}.txt`;

    const cachedSize = await this.getFromCache(urlCacheKey, cacheSubDir);
    if (cachedSize !== null) {
      return cachedSize;
    }

    try {
      // For m3u8, Content-Length is for the playlist file, not the stream segments
      if (url.toLowerCase().includes('.m3u8')) {
        await this.saveToCache(urlCacheKey, 'Playlist (size N/A)', cacheSubDir);
        return 'Playlist (size N/A)';
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout
      
      try {
        const response = await fetchImpl(url, { 
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const sizeInBytes = parseInt(contentLength, 10);
          if (!isNaN(sizeInBytes)) {
            let formattedSize;
            if (sizeInBytes < 1024) formattedSize = `${sizeInBytes} B`;
            else if (sizeInBytes < 1024 * 1024) formattedSize = `${(sizeInBytes / 1024).toFixed(2)} KB`;
            else if (sizeInBytes < 1024 * 1024 * 1024) formattedSize = `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
            else formattedSize = `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            
            await this.saveToCache(urlCacheKey, formattedSize, cacheSubDir);
            return formattedSize;
          }
        }
        await this.saveToCache(urlCacheKey, 'Unknown size', cacheSubDir);
        return 'Unknown size';
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      logger.error(`[XPRIME] Could not fetch size for ${url.substring(0, 50)}...`, error);
      await this.saveToCache(urlCacheKey, 'Unknown size', cacheSubDir);
      return 'Unknown size';
    }
  }

  private async fetchWithRetry(url: string, options: any, maxRetries: number = MAX_RETRIES_XPRIME) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchImpl(url, options);
        if (!response.ok) {
          let errorBody = '';
          try { 
            errorBody = await response.text(); 
          } catch (e) { 
            // ignore 
          }
          
          const httpError = new Error(`HTTP error! Status: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 200)}`);
          (httpError as any).status = response.status;
          throw httpError;
        }
        return response;
      } catch (error: any) {
        lastError = error;
        logger.error(`[XPRIME] Fetch attempt ${attempt}/${maxRetries} failed for ${url}:`, error);
        
        // If it's a 403 error, stop retrying immediately
        if (error.status === 403) {
          logger.log(`[XPRIME] Encountered 403 Forbidden for ${url}. Halting retries.`);
          throw lastError;
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS_XPRIME * Math.pow(2, attempt - 1)));
        }
      }
    }
    
    logger.error(`[XPRIME] All fetch attempts failed for ${url}. Last error:`, lastError);
    if (lastError) throw lastError;
    else throw new Error(`[XPRIME] All fetch attempts failed for ${url} without a specific error captured.`);
  }

  async getStreams(mediaId: string, mediaType: string, season?: number, episode?: number): Promise<Stream[]> {
    // XPRIME service has been removed from internal providers
    logger.log('[XPRIME] Service has been removed from internal providers');
    return [];
  }

  private async getXprimeStreams(title: string, year: number, type: string, seasonNum?: number, episodeNum?: number): Promise<XprimeStream[]> {
    let rawXprimeStreams: XprimeStream[] = [];
    
    try {
      logger.log(`[XPRIME] Fetch attempt for '${title}' (${year}). Type: ${type}, S: ${seasonNum}, E: ${episodeNum}`);
      
      const xprimeName = encodeURIComponent(title);
      let xprimeApiUrl: string;

      // type here is tmdbTypeFromId which is 'movie' or 'tv'/'series'
      if (type === 'movie') {
        xprimeApiUrl = `https://backend.xprime.tv/primebox?name=${xprimeName}&year=${year}&fallback_year=${year}`;
      } else if (type === 'tv' || type === 'series') { // Accept both 'tv' and 'series' for compatibility
        if (seasonNum !== null && seasonNum !== undefined && episodeNum !== null && episodeNum !== undefined) {
          xprimeApiUrl = `https://backend.xprime.tv/primebox?name=${xprimeName}&year=${year}&fallback_year=${year}&season=${seasonNum}&episode=${episodeNum}`;
        } else {
          logger.log('[XPRIME] Skipping series request: missing season/episode numbers.');
          return [];
        }
      } else {
        logger.log(`[XPRIME] Skipping request: unknown type '${type}'.`);
        return [];
      }

      let xprimeResult: any;

      // Direct fetch only
      logger.log(`[XPRIME] Fetching directly: ${xprimeApiUrl}`);
      const xprimeResponse = await this.fetchWithRetry(xprimeApiUrl, {
        headers: {
          ...BROWSER_HEADERS_XPRIME,
          'Origin': 'https://pstream.org',
          'Referer': 'https://pstream.org/',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Dest': 'empty'
        }
      });
      xprimeResult = await xprimeResponse.json();
      
      // Process the result
      this.processXprimeResult(xprimeResult, rawXprimeStreams, title, type, seasonNum, episodeNum);
      
      // Fetch stream sizes concurrently for all Xprime streams
      if (rawXprimeStreams.length > 0) {
        logger.log('[XPRIME] Fetching stream sizes...');
        const sizePromises = rawXprimeStreams.map(async (stream) => {
          stream.size = await this.fetchStreamSize(stream.url);
          return stream;
        });
        await Promise.all(sizePromises);
        logger.log(`[XPRIME] Found ${rawXprimeStreams.length} streams with sizes.`);
      }
      
      return rawXprimeStreams;

    } catch (xprimeError) {
      logger.error('[XPRIME] Error fetching or processing streams:', xprimeError);
      return [];
    }
  }

  // Helper function to process Xprime API response
  private processXprimeResult(xprimeResult: any, rawXprimeStreams: XprimeStream[], title: string, type: string, seasonNum?: number, episodeNum?: number) {
    const processXprimeItem = (item: any) => {
      if (item && typeof item === 'object' && !item.error && item.streams && typeof item.streams === 'object') {
        Object.entries(item.streams).forEach(([quality, fileUrl]) => {
          if (fileUrl && typeof fileUrl === 'string') {
            rawXprimeStreams.push({
              url: fileUrl,
              quality: quality || 'Unknown',
              title: `${title} - ${(type === 'tv' || type === 'series') ? `S${String(seasonNum).padStart(2,'0')}E${String(episodeNum).padStart(2,'0')} ` : ''}${quality}`,
              provider: 'XPRIME',
              codecs: [],
              size: 'Unknown size'
            });
          }
        });
      } else {
        logger.log('[XPRIME] Skipping item due to missing/invalid streams or an error was reported by Xprime API:', item && item.error);
      }
    };

    if (Array.isArray(xprimeResult)) {
      xprimeResult.forEach(processXprimeItem);
    } else if (xprimeResult) {
      processXprimeItem(xprimeResult);
    } else {
      logger.log('[XPRIME] No result from Xprime API to process.');
    }
  }
}

export const xprimeService = new XprimeService(); 