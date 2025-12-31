// Player constants
export const RESUME_PREF_KEY = '@video_resume_preference';
export const RESUME_PREF = {
  ALWAYS_ASK: 'always_ask',
  ALWAYS_RESUME: 'always_resume',
  ALWAYS_START_OVER: 'always_start_over'
};

export const SUBTITLE_SIZE_KEY = '@subtitle_size_preference';

// Helper function to get responsive subtitle size based on screen width
export const getDefaultSubtitleSize = (screenWidth: number): number => {
  if (screenWidth >= 1440) return 65; // TV
  if (screenWidth >= 1024) return 55; // Large tablet
  if (screenWidth >= 768) return 45;  // Tablet
  return 30; // Phone
};

// Keep the constant for backward compatibility, using phone size as base
export const DEFAULT_SUBTITLE_SIZE = 30;

// Define the TrackPreferenceType for audio/text tracks
export type TrackPreferenceType = 'system' | 'disabled' | 'title' | 'language' | 'index';

// Define the SelectedTrack type for audio/text tracks
export interface SelectedTrack {
  type: TrackPreferenceType;
  value?: string | number; // value is optional for 'system' and 'disabled'
}

export interface VideoPlayerProps {
  uri: string;
  title?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  quality?: string;
  year?: number;
  streamProvider?: string;
  id?: string;
  type?: string;
  episodeId?: string;
  imdbId?: string; // Add IMDb ID for subtitle fetching
}

// Match the react-native-video AudioTrack type
export interface AudioTrack {
  index: number;
  title?: string;
  language?: string;
  bitrate?: number;
  type?: string;
  selected?: boolean;
}

// Define TextTrack interface based on react-native-video expected structure
export interface TextTrack {
  index: number;
  title?: string;
  language?: string;
  type?: string | null; // Adjusting type based on linter error
}

// Define the possible resize modes
export type ResizeModeType = 'contain' | 'cover' | 'stretch' | 'none';
export const resizeModes: ResizeModeType[] = ['cover', 'contain', 'stretch'];

// Add VLC specific interface for their event structure
export interface VlcMediaEvent {
  currentTime: number;
  duration: number;
  bufferTime?: number;
  isBuffering?: boolean;
  audioTracks?: Array<{ id: number, name: string, language?: string }>;
  textTracks?: Array<{ id: number, name: string, language?: string }>;
  selectedAudioTrack?: number;
  selectedTextTrack?: number;
}

export interface SubtitleSegment {
  text: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
  color?: string;
  fontName?: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
  // New fields for advanced features
  formattedSegments?: SubtitleSegment[]; // Rich text with formatting
  position?: { x?: number; y?: number; align?: string }; // Position tags
  rawText?: string; // Original text before processing
}

// Add interface for Wyzie subtitle API response
export interface WyzieSubtitle {
  id: string;
  url: string;
  flagUrl: string;
  format: string;
  encoding: string;
  media: string;
  display: string;
  language: string;
  isHearingImpaired: boolean;
  source: string;
  headers?: Record<string, string>;
} 