import { TMDBEpisode } from '../services/tmdbService';
import { StreamingContent } from '../services/catalogService';

// Re-export StreamingContent for convenience
export { StreamingContent };

// Types for route params
export type RouteParams = {
  id: string;
  type: string;
  episodeId?: string;
};

// Stream related types - aligned with Stremio protocol
export interface Subtitle {
  id: string;           // Required per protocol
  url: string;
  lang: string;
  fps?: number;
  addon?: string;
  addonName?: string;
  format?: 'srt' | 'vtt' | 'ass' | 'ssa';
}

export interface Stream {
  // Primary stream source - one of these must be provided per protocol
  url?: string;                    // Direct HTTP URL (now optional)
  ytId?: string;                   // YouTube video ID
  infoHash?: string;               // BitTorrent info hash
  externalUrl?: string;            // External URL to open in browser

  // Display information
  name?: string;
  title?: string;
  description?: string;

  // Addon identification  
  addon?: string;
  addonId?: string;
  addonName?: string;

  // Stream properties
  size?: number;
  isFree?: boolean;
  isDebrid?: boolean;
  quality?: string;
  type?: string;
  lang?: string;
  fileIdx?: number;

  headers?: {
    Referer?: string;
    'User-Agent'?: string;
    Origin?: string;
    [key: string]: string | undefined;
  };

  files?: {
    file: string;
    type: string;
    quality: string;
    lang: string;
  }[];

  subtitles?: Subtitle[];
  sources?: string[];

  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    countryWhitelist?: string[];
    cached?: boolean;
    proxyHeaders?: {
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
    videoHash?: string;
    videoSize?: number;
    filename?: string;
    [key: string]: any;
  };
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