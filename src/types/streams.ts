// Source object for archive streams per protocol
export interface SourceObject {
  url: string;
  bytes?: number;
}

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
  // Primary stream source - one of these must be provided
  url?: string;                    // Direct HTTP(S)/FTP(S)/RTMP URL
  ytId?: string;                   // YouTube video ID
  infoHash?: string;               // BitTorrent info hash
  externalUrl?: string;            // External URL to open in browser
  nzbUrl?: string;                 // Usenet NZB file URL
  rarUrls?: SourceObject[];        // RAR archive files
  zipUrls?: SourceObject[];        // ZIP archive files
  '7zipUrls'?: SourceObject[];     // 7z archive files
  tgzUrls?: SourceObject[];        // TGZ archive files
  tarUrls?: SourceObject[];        // TAR archive files

  // Stream selection within archives/torrents
  fileIdx?: number;                // File index in archive/torrent
  fileMustInclude?: string;        // Regex for file matching in archives
  servers?: string[];              // NNTP servers for nzbUrl

  // Display information
  name?: string;                   // Stream name (usually quality)
  title?: string;                  // Stream title/description (deprecated for description)
  description?: string;            // Stream description

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
  headers?: Record<string, string>;

  // Legacy files array (for compatibility)
  files?: {
    file: string;
    type: string;
    quality: string;
    lang: string;
  }[];

  // Embedded subtitles per protocol
  subtitles?: Subtitle[];

  // Additional tracker/DHT sources
  sources?: string[];

  // Complete behavior hints per protocol
  behaviorHints?: {
    bingeGroup?: string;           // Group for binge watching
    notWebReady?: boolean;         // True if not HTTPS MP4
    countryWhitelist?: string[];   // ISO 3166-1 alpha-3 codes (lowercase)
    cached?: boolean;              // Debrid cached status
    proxyHeaders?: {               // Custom headers for stream
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
    videoHash?: string;            // OpenSubtitles hash
    videoSize?: number;            // Video file size in bytes
    filename?: string;             // Video filename
    [key: string]: any;
  };
}

export interface GroupedStreams {
  [addonId: string]: {
    addonName: string;
    streams: Stream[];
  };
}