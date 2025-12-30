/**
 * Track Selection Utilities
 * Logic for auto-selecting audio and subtitle tracks based on user preferences
 */

import { AppSettings } from '../../../hooks/useSettings';
import { languageMap } from './playerUtils';
import { WyzieSubtitle } from './playerTypes';

interface Track {
    id: number;
    name: string;
    language?: string;
}

/**
 * Normalizes a language code or name to a standard 2-letter ISO code
 */
export const normalizeLanguageCode = (langInput?: string): string => {
    if (!langInput) return '';

    const normalized = langInput.toLowerCase().trim();

    // If it's already a short code that we know, return it
    if (languageMap[normalized]) {
        // Convert 3-letter codes to 2-letter codes
        const twoLetterCodes: { [key: string]: string } = {
            'eng': 'en', 'spa': 'es', 'fre': 'fr', 'ger': 'de', 'ita': 'it',
            'jpn': 'ja', 'kor': 'ko', 'chi': 'zh', 'rus': 'ru', 'por': 'pt',
            'hin': 'hi', 'ara': 'ar', 'dut': 'nl', 'swe': 'sv', 'nor': 'no',
            'fin': 'fi', 'dan': 'da', 'pol': 'pl', 'tur': 'tr', 'cze': 'cs',
            'hun': 'hu', 'gre': 'el', 'tha': 'th', 'vie': 'vi'
        };
        return twoLetterCodes[normalized] || normalized;
    }

    // Check if it's a full language name
    for (const [code, name] of Object.entries(languageMap)) {
        if (name.toLowerCase() === normalized) {
            // Return the 2-letter code
            const twoLetterCodes: { [key: string]: string } = {
                'eng': 'en', 'spa': 'es', 'fre': 'fr', 'ger': 'de', 'ita': 'it',
                'jpn': 'ja', 'kor': 'ko', 'chi': 'zh', 'rus': 'ru', 'por': 'pt',
                'hin': 'hi', 'ara': 'ar', 'dut': 'nl', 'swe': 'sv', 'nor': 'no',
                'fin': 'fi', 'dan': 'da', 'pol': 'pl', 'tur': 'tr', 'cze': 'cs',
                'hun': 'hu', 'gre': 'el', 'tha': 'th', 'vie': 'vi'
            };
            return twoLetterCodes[code] || code;
        }
    }

    return normalized;
};

/**
 * Check if a track matches the preferred language
 */
export const trackMatchesLanguage = (track: Track, preferredLang: string): boolean => {
    const trackLang = normalizeLanguageCode(track.language);
    const trackNameLower = (track.name || '').toLowerCase();
    const prefLang = normalizeLanguageCode(preferredLang);

    if (!prefLang) return false;

    // Direct language code match
    if (trackLang === prefLang) return true;

    // Check if the track name contains the language
    const langName = languageMap[prefLang] || languageMap[prefLang + 'g']; // handle 'en' -> 'eng' mapping
    if (langName && trackNameLower.includes(langName.toLowerCase())) return true;

    // Check for common language indicators in track name
    const languagePatterns: { [key: string]: RegExp } = {
        'en': /\b(english|eng|en)\b/i,
        'es': /\b(spanish|spa|es|español|espanol)\b/i,
        'fr': /\b(french|fre|fr|français|francais)\b/i,
        'de': /\b(german|ger|de|deutsch)\b/i,
        'it': /\b(italian|ita|it|italiano)\b/i,
        'ja': /\b(japanese|jpn|ja|日本語)\b/i,
        'ko': /\b(korean|kor|ko|한국어)\b/i,
        'zh': /\b(chinese|chi|zh|中文)\b/i,
        'ru': /\b(russian|rus|ru|русский)\b/i,
        'pt': /\b(portuguese|por|pt|português)\b/i,
        'hi': /\b(hindi|hin|hi|हिन्दी)\b/i,
        'ar': /\b(arabic|ara|ar|العربية)\b/i,
    };

    const pattern = languagePatterns[prefLang];
    if (pattern && pattern.test(trackNameLower)) return true;

    return false;
};

/**
 * Find the best matching audio track based on user preferences
 * Returns the track ID to select, or null if no preference match found
 */
export const findBestAudioTrack = (
    tracks: Track[],
    preferredLanguage: string
): number | null => {
    if (!tracks || tracks.length === 0) return null;

    // Try to find a track matching the preferred language
    const matchingTrack = tracks.find(track => trackMatchesLanguage(track, preferredLanguage));

    if (matchingTrack) {
        return matchingTrack.id;
    }

    // No match found - return first track as fallback (or null to use system default)
    return null;
};

/**
 * Find the best matching subtitle track based on user preferences
 * Implements the priority: internal first → external fallback → first available
 * 
 * @param internalTracks - Embedded subtitle tracks from the video
 * @param externalSubtitles - Available external/addon subtitles
 * @param settings - User's subtitle preferences
 * @returns Object with selected track info
 */
export const findBestSubtitleTrack = (
    internalTracks: Track[],
    externalSubtitles: WyzieSubtitle[],
    settings: {
        preferredSubtitleLanguage: string;
        subtitleSourcePreference: 'internal' | 'external' | 'any';
        enableSubtitleAutoSelect: boolean;
    }
): {
    type: 'internal' | 'external' | 'none';
    internalTrackId?: number;
    externalSubtitle?: WyzieSubtitle;
} => {
    // If auto-select is disabled, don't select anything
    if (!settings.enableSubtitleAutoSelect) {
        return { type: 'none' };
    }

    const preferredLang = settings.preferredSubtitleLanguage || 'en';
    const sourcePreference = settings.subtitleSourcePreference || 'internal';

    // Find matching internal track
    const matchingInternalTrack = internalTracks.find(track =>
        trackMatchesLanguage(track, preferredLang)
    );

    // Find matching external subtitle
    const matchingExternalSub = externalSubtitles.find(sub => {
        const subLang = normalizeLanguageCode(sub.language);
        const prefLang = normalizeLanguageCode(preferredLang);
        return subLang === prefLang ||
            sub.language.toLowerCase().includes(preferredLang.toLowerCase()) ||
            sub.display.toLowerCase().includes(languageMap[preferredLang]?.toLowerCase() || preferredLang);
    });

    // Apply source preference priority
    if (sourcePreference === 'internal') {
        // 1. Try internal track matching preferred language
        if (matchingInternalTrack) {
            return { type: 'internal', internalTrackId: matchingInternalTrack.id };
        }
        // 2. Fallback to external subtitle matching preferred language
        if (matchingExternalSub) {
            return { type: 'external', externalSubtitle: matchingExternalSub };
        }
        // 3. Fallback to first internal track if any available
        if (internalTracks.length > 0) {
            return { type: 'internal', internalTrackId: internalTracks[0].id };
        }
        // 4. Fallback to first external subtitle if any available
        if (externalSubtitles.length > 0) {
            return { type: 'external', externalSubtitle: externalSubtitles[0] };
        }
    } else if (sourcePreference === 'external') {
        // 1. Try external subtitle matching preferred language
        if (matchingExternalSub) {
            return { type: 'external', externalSubtitle: matchingExternalSub };
        }
        // 2. Fallback to internal track matching preferred language
        if (matchingInternalTrack) {
            return { type: 'internal', internalTrackId: matchingInternalTrack.id };
        }
        // 3. Fallback to first external subtitle if any available
        if (externalSubtitles.length > 0) {
            return { type: 'external', externalSubtitle: externalSubtitles[0] };
        }
        // 4. Fallback to first internal track if any available
        if (internalTracks.length > 0) {
            return { type: 'internal', internalTrackId: internalTracks[0].id };
        }
    } else {
        // 'any' - prefer matching language regardless of source, internal first
        if (matchingInternalTrack) {
            return { type: 'internal', internalTrackId: matchingInternalTrack.id };
        }
        if (matchingExternalSub) {
            return { type: 'external', externalSubtitle: matchingExternalSub };
        }
        // Fallback to first available
        if (internalTracks.length > 0) {
            return { type: 'internal', internalTrackId: internalTracks[0].id };
        }
        if (externalSubtitles.length > 0) {
            return { type: 'external', externalSubtitle: externalSubtitles[0] };
        }
    }

    return { type: 'none' };
};

/**
 * Find best audio track from available tracks
 */
export const autoSelectAudioTrack = (
    tracks: Track[],
    preferredLanguage: string
): number | null => {
    if (!tracks || tracks.length === 0) return null;

    // Try to find a track matching the preferred language
    const matchingTrack = tracks.find(track => trackMatchesLanguage(track, preferredLanguage));

    if (matchingTrack) {
        return matchingTrack.id;
    }

    // Return null to let the player use its default
    return null;
};
