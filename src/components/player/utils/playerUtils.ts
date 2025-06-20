import { logger } from '../../../utils/logger';
import { useEffect } from 'react';
import { SubtitleCue } from './playerTypes';

// Debug flag - set back to false to disable verbose logging
// WARNING: Setting this to true currently causes infinite render loops
// Use selective logging instead if debugging is needed
export const DEBUG_MODE = false;

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
export const getTrackDisplayName = (track: { name?: string, id: number }): string => {
  if (!track || !track.name) return `Track ${track.id}`;

  // Try to extract language from name like "Some Info - [English]"
  const languageMatch = track.name.match(/\[(.*?)\]/);
  if (languageMatch && languageMatch[1]) {
      return languageMatch[1];
  }
  
  // If no language in brackets, or if the name is simple, use the full name
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

// Enhanced SRT parser function - more robust
export const parseSRT = (srtContent: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = [];
  
  if (!srtContent || srtContent.trim().length === 0) {
    if (DEBUG_MODE) {
      logger.log(`[VideoPlayer] SRT Parser: Empty content provided`);
    }
    return cues;
  }

  // Normalize line endings and clean up the content
  const normalizedContent = srtContent
    .replace(/\r\n/g, '\n')  // Convert Windows line endings
    .replace(/\r/g, '\n')    // Convert Mac line endings
    .trim();

  // Split by double newlines, but also handle cases with multiple empty lines
  const blocks = normalizedContent.split(/\n\s*\n/).filter(block => block.trim().length > 0);

  if (DEBUG_MODE) {
    logger.log(`[VideoPlayer] SRT Parser: Found ${blocks.length} blocks after normalization`);
    logger.log(`[VideoPlayer] SRT Parser: First few characters: "${normalizedContent.substring(0, 300)}"`);
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length >= 3) {
      // Find the timestamp line (could be line 1 or 2, depending on numbering)
      let timeLineIndex = -1;
      let timeMatch = null;
      
      for (let j = 0; j < Math.min(3, lines.length); j++) {
        // More flexible time pattern matching
        timeMatch = lines[j].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (timeMatch) {
          timeLineIndex = j;
          break;
        }
      }
      
      if (timeMatch && timeLineIndex !== -1) {
        try {
          const startTime = 
            parseInt(timeMatch[1]) * 3600 + 
            parseInt(timeMatch[2]) * 60 + 
            parseInt(timeMatch[3]) + 
            parseInt(timeMatch[4]) / 1000;
          
          const endTime = 
            parseInt(timeMatch[5]) * 3600 + 
            parseInt(timeMatch[6]) * 60 + 
            parseInt(timeMatch[7]) + 
            parseInt(timeMatch[8]) / 1000;

          // Get text lines (everything after the timestamp line)
          const textLines = lines.slice(timeLineIndex + 1);
          if (textLines.length > 0) {
            const text = textLines
              .join('\n')
              .replace(/<[^>]*>/g, '') // Remove HTML tags
              .replace(/\{[^}]*\}/g, '') // Remove subtitle formatting tags like {italic}
              .replace(/\\N/g, '\n') // Handle \N newlines
              .trim();

            if (text.length > 0) {
              cues.push({
                start: startTime,
                end: endTime,
                text: text
              });
              
              if (DEBUG_MODE && (i < 5 || cues.length <= 10)) {
                logger.log(`[VideoPlayer] SRT Parser: Cue ${cues.length}: ${startTime.toFixed(3)}s-${endTime.toFixed(3)}s: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
              }
            }
          }
        } catch (error) {
          if (DEBUG_MODE) {
            logger.log(`[VideoPlayer] SRT Parser: Error parsing times for block ${i + 1}: ${error}`);
          }
        }
      } else if (DEBUG_MODE) {
        logger.log(`[VideoPlayer] SRT Parser: No valid timestamp found in block ${i + 1}. Lines: ${JSON.stringify(lines.slice(0, 3))}`);
      }
    } else if (DEBUG_MODE && block.length > 0) {
      logger.log(`[VideoPlayer] SRT Parser: Block ${i + 1} has insufficient lines (${lines.length}): "${block.substring(0, 100)}"`);
    }
  }

  if (DEBUG_MODE) {
    logger.log(`[VideoPlayer] SRT Parser: Successfully parsed ${cues.length} subtitle cues`);
    if (cues.length > 0) {
      logger.log(`[VideoPlayer] SRT Parser: Time range: ${cues[0].start.toFixed(1)}s to ${cues[cues.length-1].end.toFixed(1)}s`);
    }
  }

  return cues;
}; 