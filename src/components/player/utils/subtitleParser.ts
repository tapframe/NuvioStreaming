import { logger } from '../../../utils/logger';
import { SubtitleCue, SubtitleSegment } from './playerTypes';

const DEBUG_MODE = false;

/**
 * Detect subtitle format from content
 */
export function detectSubtitleFormat(content: string, url?: string): 'srt' | 'vtt' | 'unknown' {
  // Check URL extension first
  if (url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.srt')) return 'srt';
    if (urlLower.includes('.vtt')) return 'vtt';
  }

  // Check content patterns
  const first100Chars = content.trim().substring(0, 100);
  
  // WebVTT typically starts with "WEBVTT" and has " --> " separator
  if (first100Chars.includes('WEBVTT') || first100Chars.match(/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/)) {
    return 'vtt';
  }
  
  // SRT typically has " --> " separator and uses different timestamp format
  if (first100Chars.match(/\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/)) {
    return 'srt';
  }

  // Default to SRT for backward compatibility
  return 'srt';
}

/**
 * Parse SRT timestamp
 */
function parseSRTTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  
  return parseInt(match[1]) * 3600 + 
         parseInt(match[2]) * 60 + 
         parseInt(match[3]) + 
         parseInt(match[4]) / 1000;
}

/**
 * Parse SRT position tags {\an1}-{\an9}
 * Positions based on numpad layout:
 * 7=top-left, 8=top, 9=top-right
 * 4=left, 5=center, 6=right
 * 1=bottom-left, 2=bottom, 3=bottom-right
 */
function parseSRTPositionTag(text: string): { x?: number; y?: number; align?: string } | undefined {
  const match = text.match(/\\{\\an([1-9])\\}/);
  if (!match) return undefined;

  const pos = parseInt(match[1]);
  
  // Map numpad to alignment
  const alignments: Record<number, string> = {
    1: 'left',     // bottom-left
    2: 'center',   // bottom-center
    3: 'right',    // bottom-right
    4: 'left',     // left
    5: 'center',   // center (default)
    6: 'right',    // right
    7: 'left',     // top-left
    8: 'center',   // top-center
    9: 'right',    // top-right
  };

  const verticalPos = pos <= 3 ? 'bottom' : pos <= 6 ? 'middle' : 'top';
  
  return {
    align: alignments[pos] || 'center',
    // Could add x/y positioning here if needed
  };
}

/**
 * Parse HTML-style formatting tags and convert to segments
 */
function parseSubtitleFormatting(text: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  let currentIndex = 0;
  let tagStack: Array<{ tag: string; attrs?: Record<string, string>; position: number }> = [];
  let segmentText = '';
  
  // Process text character by character or in chunks
  const regex = /<(i|b|u|font)(\s+[^>]*)?>|<\/(i|b|u|font)>|{\\an[1-9]}/gi;
  let match;
  let lastIndex = 0;

  // First, extract and save position tags
  const anMatches: Array<{ match: string; position: number }> = [];
  text.replace(/\{\\an([1-9])\}/gi, (match, offset) => {
    anMatches.push({ match, position: offset });
    return '';
  });

  // Remove position tags from text before processing
  let cleanText = text.replace(/\{\\an[1-9]\}/gi, '');

  // Parse HTML tags
  while ((match = regex.exec(cleanText)) !== null) {
    // Add text before tag
    if (match.index > lastIndex) {
      const textBetween = cleanText.substring(lastIndex, match.index);
      if (textBetween) {
        if (!segmentText && segments.length > 0) {
          segments[segments.length - 1].text += textBetween;
        } else {
          segmentText += textBetween;
        }
      }
    }

    if (match[0].startsWith('</')) {
      // Closing tag
      const tagName = match[3].toLowerCase();
      tagStack = tagStack.filter(t => t.tag !== tagName);
      
      // If this closes the last tag, create a segment
      if (tagStack.length === 0 && segmentText) {
        segments.push({
          text: segmentText,
          italic: tagName === 'i',
          bold: tagName === 'b',
          underline: tagName === 'u',
        });
        segmentText = '';
      }
    } else {
      // Opening tag
      const tagName = match[1].toLowerCase();
      const attrs = match[2] ? parseAttributes(match[2]) : {};
      
      // Create segment if we have text and this is first tag
      if (segmentText && tagStack.length === 0) {
        segments.push({
          text: segmentText,
          ...getSegmentProps(tagStack),
        });
        segmentText = '';
      }
      
      tagStack.push({ tag: tagName, attrs, position: match.index });
      
      // Handle font color
      if (tagName === 'font' && attrs.color) {
        const lastSegment = segments[segments.length - 1];
        if (lastSegment) {
          lastSegment.color = attrs.color;
        }
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < cleanText.length) {
    const remainingText = cleanText.substring(lastIndex);
    if (remainingText) {
      if (tagStack.length === 0) {
        segmentText += remainingText;
        if (segmentText) {
          segments.push({ text: segmentText, ...getSegmentProps(tagStack) });
        }
      } else {
        // Add to existing segment
        if (segments.length > 0) {
          segments[segments.length - 1].text += remainingText;
        }
      }
    }
  }

  // If no segments were created but we have text, add as plain text
  if (segments.length === 0 && cleanText.trim()) {
    segments.push({ text: cleanText });
  }

  return segments;
}

/**
 * Parse HTML attributes like: color="#FF0000"
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const colorMatch = attrString.match(/color=["']([^"']+)["']/i);
  if (colorMatch) {
    attrs.color = colorMatch[1];
  }
  return attrs;
}

/**
 * Get segment properties from tag stack
 */
function getSegmentProps(tagStack: Array<{ tag: string }>): Partial<SubtitleSegment> {
  const props: Partial<SubtitleSegment> = {};
  
  tagStack.forEach(tag => {
    if (tag.tag === 'i') props.italic = true;
    if (tag.tag === 'b') props.bold = true;
    if (tag.tag === 'u') props.underline = true;
  });
  
  return props;
}

/**
 * Parse SRT format with formatting support
 */
export function parseSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  
  if (!content || content.trim().length === 0) {
    if (DEBUG_MODE) logger.log('[SubtitleParser] Empty content provided');
    return cues;
  }

  // Normalize line endings
  const normalizedContent = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // Split by double newlines
  const blocks = normalizedContent.split(/\n\s*\n/).filter(block => block.trim().length > 0);

  if (DEBUG_MODE) {
    logger.log(`[SubtitleParser] Found ${blocks.length} blocks`);
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length < 3) continue;

    // Find timestamp line
    let timeLineIndex = -1;
    let timeMatch = null;
    
    for (let j = 0; j < Math.min(3, lines.length); j++) {
      timeMatch = lines[j].match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
      if (timeMatch) {
        timeLineIndex = j;
        break;
      }
    }
    
    if (!timeMatch || timeLineIndex === -1) continue;

    try {
      const startTime = parseSRTTimestamp(lines[timeLineIndex]);
      const endTime = parseSRTTimestamp(lines[timeLineIndex].split(' --> ')[1]);
      
      // Get text lines
      const textLines = lines.slice(timeLineIndex + 1);
      if (textLines.length === 0) continue;

      const rawText = textLines.join('\n');
      
      // Parse position tags
      const position = parseSRTPositionTag(rawText);
      
      // Parse formatting
      const formattedSegments = parseSubtitleFormatting(rawText);
      
      // Get plain text for backward compatibility
      const plainText = formattedSegments.map(s => s.text).join('') || rawText;
      
      cues.push({
        start: startTime,
        end: endTime,
        text: plainText,
        rawText,
        formattedSegments: formattedSegments.length > 0 ? formattedSegments : undefined,
        position,
      });
      
      if (DEBUG_MODE && (i < 5 || cues.length <= 10)) {
        logger.log(`[SubtitleParser] Cue ${cues.length}: ${startTime.toFixed(3)}s-${endTime.toFixed(3)}s: "${plainText.substring(0, 50)}"`);
      }
    } catch (error) {
      if (DEBUG_MODE) {
        logger.log(`[SubtitleParser] Error parsing block ${i + 1}: ${error}`);
      }
    }
  }

  if (DEBUG_MODE) {
    logger.log(`[SubtitleParser] Successfully parsed ${cues.length} cues`);
    if (cues.length > 0) {
      logger.log(`[SubtitleParser] Time range: ${cues[0].start.toFixed(1)}s to ${cues[cues.length-1].end.toFixed(1)}s`);
    }
  }

  return cues;
}

/**
 * Parse WebVTT format
 */
function parseVTTTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;
  
  return parseInt(match[1]) * 3600 + 
         parseInt(match[2]) * 60 + 
         parseInt(match[3]) + 
         parseInt(match[4]) / 1000;
}

/**
 * Parse WebVTT alignment from cue settings
 */
function parseVTTAlignment(settings: string): string {
  if (settings.includes('align:start')) return 'left';
  if (settings.includes('align:end')) return 'right';
  return 'center';
}

export function parseWebVTT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  
  if (!content || content.trim().length === 0) {
    return cues;
  }

  // Normalize line endings
  const normalizedContent = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Skip WEBVTT header and any note/comment blocks
  let lines = normalizedContent.split('\n');
  let skipHeader = true;
  let inNote = false;

  const blocks: string[] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (skipHeader) {
      if (line.startsWith('WEBVTT')) {
        skipHeader = false;
        continue;
      }
      continue;
    }

    if (line.startsWith('NOTE') || line === '') {
      if (line.startsWith('NOTE')) inNote = true;
      if (inNote && line === '') inNote = false;
      continue;
    }

    if (inNote) continue;

    if (line === '') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
    } else {
      currentBlock.push(line);
    }
  }

  // Add last block
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;

    // Parse timestamp
    const timeMatch = lines[0].match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})(\s+.*)?/);
    if (!timeMatch) continue;

    const startTime = parseVTTTimestamp(timeMatch[0].split(' --> ')[0]);
    const endTime = parseVTTTimestamp(timeMatch[0].split(' --> ')[1].split(' ')[0]);
    const settings = timeMatch[0].includes(' --> ') ? timeMatch[0].split(' --> ')[1].split(' ').slice(1).join(' ') : '';

    // Get text
    const textLines = lines.slice(1);
    if (textLines.length === 0) continue;

    const rawText = textLines.join('\n');
    const alignment = parseVTTAlignment(settings);
    const formattedSegments = parseSubtitleFormatting(rawText);
    const plainText = formattedSegments.map(s => s.text).join('') || rawText;

    cues.push({
      start: startTime,
      end: endTime,
      text: plainText,
      rawText,
      formattedSegments: formattedSegments.length > 0 ? formattedSegments : undefined,
      position: alignment !== 'center' ? { align: alignment } : undefined,
    });
  }

  return cues;
}

/**
 * Auto-detect format and parse subtitle content
 */
export function parseSubtitle(content: string, url?: string): SubtitleCue[] {
  const format = detectSubtitleFormat(content, url);
  
  if (DEBUG_MODE) {
    logger.log(`[SubtitleParser] Detected format: ${format}`);
  }

  switch (format) {
    case 'vtt':
      return parseWebVTT(content);
    case 'srt':
    default:
      return parseSRT(content);
  }
}

