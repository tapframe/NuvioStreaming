// Player constants
export const RESUME_PREF_KEY = '@video_resume_preference';
export const RESUME_PREF = {
  ALWAYS_ASK: 'always_ask',
  ALWAYS_RESUME: 'always_resume',
  ALWAYS_START_OVER: 'always_start_over'
};

export const SUBTITLE_SIZE_KEY = '@subtitle_size_preference';
export const DEFAULT_SUBTITLE_SIZE = 16;

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

// Define the possible resize modes - force to stretch for absolute full screen
export type ResizeModeType = 'contain' | 'cover' | 'fill' | 'none' | 'stretch';
export const resizeModes: ResizeModeType[] = ['stretch']; // Force stretch mode for absolute full screen

// Add VLC specific interface for their event structure
export interface VlcMediaEvent {
  currentTime: number;
  duration: number;
  bufferTime?: number;
  isBuffering?: boolean;
  audioTracks?: Array<{id: number, name: string, language?: string}>;
  textTracks?: Array<{id: number, name: string, language?: string}>;
  selectedAudioTrack?: number;
  selectedTextTrack?: number;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}