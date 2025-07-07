import { TMDBEpisode } from '../services/tmdbService';
import { StreamingContent } from '../services/catalogService';

// Types for route params
export type RouteParams = {
  id: string;
  type: string;
  episodeId?: string;
};

// Stream related types
export interface Stream {
  name?: string;
  title?: string;
  url: string;
  addonId?: string;
  addonName?: string;
  behaviorHints?: {
    cached?: boolean;
    [key: string]: any;
  };
  quality?: string;
  type?: string;
  lang?: string;
  headers?: {
    Referer?: string;
    'User-Agent'?: string;
    Origin?: string;
  };
  files?: {
    file: string;
    type: string;
    quality: string;
    lang: string;
  }[];
  subtitles?: {
    url: string;
    lang: string;
  }[];
  addon?: string;
  description?: string;
  infoHash?: string;
  fileIdx?: number;
  size?: number;
  isFree?: boolean;
  isDebrid?: boolean;
}

export interface GroupedStreams {
  [addonId: string]: {
    addonName: string;
    streams: Stream[];
  };
}

// Episode related types
export interface Episode extends TMDBEpisode {
  stremioId?: string;
  episodeString: string;
}

export interface GroupedEpisodes {
  [seasonNumber: number]: Episode[];
}

// Cast related types
export interface Cast {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  biography?: string;
  birthday?: string;
  place_of_birth?: string;
  known_for_department?: string;
}

// Streaming content type - REMOVED AND IMPORTED FROM catalogService.ts

// Navigation types
export type RootStackParamList = {
  Player: {
    id: string;
    type: string;
    title?: string;
    poster?: string;
    stream: string;
    headers?: {
      Referer?: string;
      'User-Agent'?: string;
      Origin?: string;
    };
    subtitles?: {
      url: string;
      lang: string;
    }[];
  };
  ShowRatings: { showId: number };
  // ... other screens
}; 