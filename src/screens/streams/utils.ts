import { Stream } from '../../types/metadata';
import { MKV_HEAD_TIMEOUT_MS } from './constants';

/**
 * Language variations for filtering
 */
const LANGUAGE_VARIATIONS: Record<string, string[]> = {
  latin: ['latino', 'latina', 'lat'],
  spanish: ['español', 'espanol', 'spa'],
  german: ['deutsch', 'ger'],
  french: ['français', 'francais', 'fre'],
  portuguese: ['português', 'portugues', 'por'],
  italian: ['ita'],
  english: ['eng'],
  japanese: ['jap'],
  korean: ['kor'],
  chinese: ['chi', 'cn'],
  arabic: ['ara'],
  russian: ['rus'],
  turkish: ['tur'],
  hindi: ['hin'],
};

/**
 * Get all variations of a language name
 */
const getLanguageVariations = (language: string): string[] => {
  const langLower = language.toLowerCase();
  const variations = [langLower];
  
  if (LANGUAGE_VARIATIONS[langLower]) {
    variations.push(...LANGUAGE_VARIATIONS[langLower]);
  }
  
  return variations;
};

/**
 * Filter streams by excluded quality settings
 */
export const filterStreamsByQuality = (
  streams: Stream[],
  excludedQualities: string[]
): Stream[] => {
  if (!excludedQualities || excludedQualities.length === 0) {
    return streams;
  }

  return streams.filter(stream => {
    const streamTitle = stream.title || stream.name || '';

    const hasExcludedQuality = excludedQualities.some(excludedQuality => {
      if (excludedQuality === 'Auto') {
        return /\b(auto|adaptive)\b/i.test(streamTitle);
      } else {
        const pattern = new RegExp(excludedQuality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return pattern.test(streamTitle);
      }
    });

    return !hasExcludedQuality;
  });
};

/**
 * Filter streams by excluded language settings
 */
export const filterStreamsByLanguage = (
  streams: Stream[],
  excludedLanguages: string[]
): Stream[] => {
  if (!excludedLanguages || excludedLanguages.length === 0) {
    return streams;
  }

  return streams.filter(stream => {
    const streamName = stream.name || '';
    const streamTitle = stream.title || '';
    const streamDescription = stream.description || '';
    const searchText = `${streamName} ${streamTitle} ${streamDescription}`.toLowerCase();

    const hasExcludedLanguage = excludedLanguages.some(excludedLanguage => {
      const variations = getLanguageVariations(excludedLanguage);
      return variations.some(variant => searchText.includes(variant));
    });

    return !hasExcludedLanguage;
  });
};

/**
 * Extract numeric quality from stream title
 */
export const getQualityNumeric = (title: string | undefined): number => {
  if (!title) return 0;

  // Check for 4K first (treat as 2160p)
  if (/\b4k\b/i.test(title)) {
    return 2160;
  }

  const matchWithP = title.match(/(\d+)p/i);
  if (matchWithP) return parseInt(matchWithP[1], 10);

  const qualityPatterns = [/\b(240|360|480|720|1080|1440|2160|4320|8000)\b/i];

  for (const pattern of qualityPatterns) {
    const match = title.match(pattern);
    if (match) {
      const quality = parseInt(match[1], 10);
      if (quality >= 240 && quality <= 8000) return quality;
    }
  }
  return 0;
};

/**
 * Sort streams by quality (highest first)
 */
export const sortStreamsByQuality = (streams: Stream[]): Stream[] => {
  return [...streams].sort((a, b) => {
    const titleA = (a.name || a.title || '').toLowerCase();
    const titleB = (b.name || b.title || '').toLowerCase();

    // Check for "Auto" quality - always prioritize it
    const isAutoA = /\b(auto|adaptive)\b/i.test(titleA);
    const isAutoB = /\b(auto|adaptive)\b/i.test(titleB);

    if (isAutoA && !isAutoB) return -1;
    if (!isAutoA && isAutoB) return 1;

    const qualityA = getQualityNumeric(a.name || a.title);
    const qualityB = getQualityNumeric(b.name || b.title);

    if (qualityA !== qualityB) {
      return qualityB - qualityA;
    }

    // If quality is the same, sort by provider name, then stream name
    const providerA = a.addonId || a.addonName || '';
    const providerB = b.addonId || b.addonName || '';

    if (providerA !== providerB) {
      return providerA.localeCompare(providerB);
    }

    const nameA = (a.name || a.title || '').toLowerCase();
    const nameB = (b.name || b.title || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
};

/**
 * Detect MKV format via HEAD request
 */
export const detectMkvViaHead = async (
  url: string,
  headers?: Record<string, string>
): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MKV_HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers,
      signal: controller.signal as any,
    } as any);
    const contentType = res.headers.get('content-type') || '';
    return /matroska|x-matroska/i.test(contentType);
  } catch (_e) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Infer video type from URL
 */
export const inferVideoTypeFromUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const lower = url.toLowerCase();
  if (/(\.|ext=)(m3u8)(\b|$)/i.test(lower)) return 'm3u8';
  if (/(\.|ext=)(mpd)(\b|$)/i.test(lower)) return 'mpd';
  if (/(\.|ext=)(mp4)(\b|$)/i.test(lower)) return 'mp4';
  return undefined;
};

/**
 * Filter headers for Vidrock compatibility
 */
export const filterHeadersForVidrock = (
  headers: Record<string, string> | undefined
): Record<string, string> | undefined => {
  if (!headers) return undefined;

  const essentialHeaders: Record<string, string> = {};
  if (headers['User-Agent']) essentialHeaders['User-Agent'] = headers['User-Agent'];
  if (headers['Referer']) essentialHeaders['Referer'] = headers['Referer'];
  if (headers['Origin']) essentialHeaders['Origin'] = headers['Origin'];

  return Object.keys(essentialHeaders).length > 0 ? essentialHeaders : undefined;
};
