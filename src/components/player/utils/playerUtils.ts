import { logger } from '../../../utils/logger';
import { useEffect } from 'react';
import { SubtitleCue } from './playerTypes';
import { parseSRT as parseSRTEnhanced, parseSubtitle } from './subtitleParser';

// Debug flag - set back to false to disable verbose logging
// WARNING: Setting this to true currently causes infinite render loops
// Use selective logging instead if debugging is needed
export const DEBUG_MODE = true;

// Safer debug function that won't cause render loops
// Call this with any debugging info you need instead of using inline DEBUG_MODE checks
export const safeDebugLog = (message: string, data?: any) => {
  // This function only runs once per call site, avoiding render loops
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (DEBUG_MODE) {
      if (data) {
        logger.log(`[VideoPlayer] ${message}`, data);
      } else {
        logger.log(`[VideoPlayer] ${message}`);
      }
    }
  }, []); // Empty dependency array means this only runs once per mount
};

// Add language code to name mapping
export const languageMap: {[key: string]: string} = {
  'en': 'English',
  'eng': 'English',
  'es': 'Spanish',
  'spa': 'Spanish',
  'fr': 'French',
  'fre': 'French',
  'de': 'German',
  'ger': 'German',
  'it': 'Italian',
  'ita': 'Italian',
  'ja': 'Japanese',
  'jpn': 'Japanese',
  'ko': 'Korean',
  'kor': 'Korean',
  'zh': 'Chinese',
  'chi': 'Chinese',
  'ru': 'Russian',
  'rus': 'Russian',
  'pt': 'Portuguese',
  'por': 'Portuguese',
  'hi': 'Hindi',
  'hin': 'Hindi',
  'ar': 'Arabic',
  'ara': 'Arabic',
  'nl': 'Dutch',
  'dut': 'Dutch',
  'sv': 'Swedish',
  'swe': 'Swedish',
  'no': 'Norwegian',
  'nor': 'Norwegian',
  'fi': 'Finnish',
  'fin': 'Finnish',
  'da': 'Danish',
  'dan': 'Danish',
  'pl': 'Polish',
  'pol': 'Polish',
  'tr': 'Turkish',
  'tur': 'Turkish',
  'cs': 'Czech',
  'cze': 'Czech',
  'hu': 'Hungarian',
  'hun': 'Hungarian',
  'el': 'Greek',
  'gre': 'Greek',
  'th': 'Thai',
  'tha': 'Thai',
  'vi': 'Vietnamese',
  'vie': 'Vietnamese',
};

// Function to format language code to readable name
export const formatLanguage = (code?: string): string => {
  if (!code) return 'Unknown';
  const normalized = code.toLowerCase();
  const languageName = languageMap[normalized] || code.toUpperCase();
  
  // If the result is still the uppercased code, it means we couldn't find it in our map.
  if (languageName === code.toUpperCase()) {
      return `Unknown (${code})`;
  }

  return languageName;
};

// Helper function to extract a display name from the track's name property
export const getTrackDisplayName = (track: { name?: string, id: number, language?: string }): string => {
  if (!track) return 'Unknown Track';

  // If no name, use track number
  if (!track.name) return `Track ${track.id}`;

  // If the name is already well-formatted (contains • separators), use it as-is
  if (track.name.includes('•')) {
    return track.name;
  }

  // If the track name contains detailed information (like codec, bitrate, etc.), use it as-is
  if (track.name && (track.name.includes('DDP') || track.name.includes('DTS') || track.name.includes('AAC') || 
                     track.name.includes('Kbps') || track.name.includes('Atmos') || track.name.includes('~'))) {
    return track.name;
  }

  // If we have a language field, use that for better display (only for simple track names)
  if (track.language && track.language !== 'Unknown') {
    const formattedLanguage = formatLanguage(track.language);
    if (formattedLanguage !== 'Unknown' && !formattedLanguage.includes('Unknown')) {
      return formattedLanguage;
    }
  }

  // Try to extract language from name like "Some Info - [English]"
  const languageMatch = track.name.match(/\[(.*?)\]/);
  if (languageMatch && languageMatch[1]) {
    return languageMatch[1];
  }

  // Handle generic VLC track names like "Audio 1", "Track 1"
  const genericTrackMatch = track.name.match(/^(Audio|Track)\s+(\d+)$/i);
  if (genericTrackMatch) {
    return `Audio ${genericTrackMatch[2]}`;
  }

  // Check for common language patterns in the name
  const languagePatterns = [
    /\b(english|spanish|french|german|italian|japanese|korean|chinese|russian|portuguese|hindi|arabic|dutch|swedish|norwegian|finnish|danish|polish|turkish|czech|hungarian|greek|thai|vietnamese)\b/i,
    /\b(en|es|fr|de|it|ja|ko|zh|ru|pt|hi|ar|nl|sv|no|fi|da|pl|tr|cs|hu|el|th|vi)\b/i
  ];

  for (const pattern of languagePatterns) {
    const match = track.name.match(pattern);
    if (match) {
      const detectedLang = match[1];
      const formatted = formatLanguage(detectedLang);
      if (formatted !== 'Unknown' && !formatted.includes('Unknown')) {
        return formatted;
      }
    }
  }

  // If name contains only numbers or is very short, it's probably not meaningful
  if (/^\d+$/.test(track.name.trim()) || track.name.trim().length <= 2) {
    return `Audio ${track.id}`;
  }

  // Use the name as-is if it seems meaningful
  return track.name;
};

// Format time function for the player
export const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  } else {
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
};

// Enhanced SRT parser function - delegates to new parser with formatting support
export const parseSRT = (srtContent: string): SubtitleCue[] => {
  // Use the new enhanced parser from subtitleParser.ts
  return parseSRTEnhanced(srtContent);
}; 