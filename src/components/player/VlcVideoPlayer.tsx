import React, { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, Dimensions } from 'react-native';
import { logger } from '../../utils/logger';

// Dynamic import to avoid iOS loading Android native module
let LibVlcPlayerViewComponent: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-libvlc-player');
  LibVlcPlayerViewComponent = mod?.LibVlcPlayerView || null;
} catch {
  LibVlcPlayerViewComponent = null;
}

interface VlcVideoPlayerProps {
  source: string;
  volume: number;
  zoomScale: number;
  resizeMode: 'contain' | 'cover' | 'none';
  onLoad: (data: any) => void;
  onProgress: (data: any) => void;
  onSeek: (data: any) => void;
  onEnd: () => void;
  onError: (error: any) => void;
  onTracksUpdate: (tracks: { audio: any[], subtitle: any[] }) => void;
  selectedAudioTrack?: number | null;
  selectedSubtitleTrack?: number | null;
  restoreTime?: number | null;
  forceRemount?: boolean;
  key?: string;
}

interface VlcTrack {
  id: number;
  name: string;
  language?: string;
}

export interface VlcPlayerRef {
  seek: (timeInSeconds: number) => void;
  pause: () => void;
  play: () => void;
}

const VlcVideoPlayer = forwardRef<VlcPlayerRef, VlcVideoPlayerProps>(({
  source,
  volume,
  zoomScale,
  resizeMode,
  onLoad,
  onProgress,
  onSeek,
  onEnd,
  onError,
  onTracksUpdate,
  selectedAudioTrack,
  selectedSubtitleTrack,
  restoreTime,
  forceRemount,
  key,
}, ref) => {
  const vlcRef = useRef<any>(null);
  const [vlcActive, setVlcActive] = useState(true);
  const [duration, setDuration] = useState<number>(0);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);

  // Expose imperative methods to parent component
  useImperativeHandle(ref, () => ({
    seek: (timeInSeconds: number) => {
      if (vlcRef.current && typeof vlcRef.current.seek === 'function') {
        const fraction = Math.min(Math.max(timeInSeconds / (duration || 1), 0), 0.999);
        vlcRef.current.seek(fraction);
        logger.log(`[VLC] Seeked to ${timeInSeconds}s (${fraction.toFixed(3)})`);
      }
    },
    pause: () => {
      if (vlcRef.current && typeof vlcRef.current.pause === 'function') {
        vlcRef.current.pause();
        logger.log('[VLC] Paused');
      }
    },
    play: () => {
      if (vlcRef.current && typeof vlcRef.current.play === 'function') {
        vlcRef.current.play();
        logger.log('[VLC] Played');
      }
    }
  }), [duration]);

  // Compute aspect ratio string for VLC
  const toVlcRatio = useCallback((w: number, h: number): string => {
    const a = Math.max(1, Math.round(w));
    const b = Math.max(1, Math.round(h));
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    const g = gcd(a, b);
    return `${Math.floor(a / g)}:${Math.floor(b / g)}`;
  }, []);

  const screenDimensions = Dimensions.get('screen');

  const vlcAspectRatio = useMemo(() => {
    // For VLC, no forced aspect ratio - let it preserve natural aspect
    return undefined;
  }, [resizeMode, screenDimensions.width, screenDimensions.height, toVlcRatio]);

  const clientScale = useMemo(() => {
    if (!videoAspectRatio || screenDimensions.width <= 0 || screenDimensions.height <= 0) {
      return 1;
    }
    if (resizeMode === 'cover') {
      const screenAR = screenDimensions.width / screenDimensions.height;
      return Math.max(screenAR / videoAspectRatio, videoAspectRatio / screenAR);
    }
    return 1;
  }, [resizeMode, videoAspectRatio, screenDimensions.width, screenDimensions.height]);

  // VLC options for better playback
  const vlcOptions = useMemo(() => {
    return [
      '--network-caching=2000',
      '--clock-jitter=0',
      '--http-reconnect',
      '--sout-mux-caching=2000'
    ];
  }, []);

  // VLC tracks prop
  const vlcTracks = useMemo(() => ({
    audio: selectedAudioTrack,
    video: 0, // Use first video track
    subtitle: selectedSubtitleTrack
  }), [selectedAudioTrack, selectedSubtitleTrack]);

  const handleFirstPlay = useCallback((info: any) => {
    try {
      logger.log('[VLC] Video loaded, extracting tracks...');
      logger.log('[AndroidVideoPlayer][VLC] Video loaded successfully');

      // Process VLC tracks using optimized function
      if (info?.tracks) {
        processVlcTracks(info.tracks);
      }

      const lenSec = (info?.length ?? 0) / 1000;
      const width = info?.width || 0;
      const height = info?.height || 0;
      setDuration(lenSec);
      onLoad({ duration: lenSec, naturalSize: width && height ? { width, height } : undefined });

      if (width > 0 && height > 0) {
        setVideoAspectRatio(width / height);
      }

      // Restore playback position after remount (workaround for surface detach)
      if (restoreTime !== undefined && restoreTime !== null && restoreTime > 0) {
        setTimeout(() => {
          if (vlcRef.current && typeof vlcRef.current.seek === 'function') {
            const seekPosition = Math.min(restoreTime / lenSec, 0.999); // Convert to fraction
            vlcRef.current.seek(seekPosition);
            logger.log('[VLC] Seeked to restore position');
          }
        }, 500); // Small delay to ensure player is ready
      }
    } catch (e) {
      logger.error('[VLC] onFirstPlay error:', e);
      logger.warn('[AndroidVideoPlayer][VLC] onFirstPlay parse error', e);
    }
  }, [onLoad, restoreTime]);

  const handlePositionChanged = useCallback((ev: any) => {
    const pos = typeof ev?.position === 'number' ? ev.position : 0;
    // We need duration to calculate current time, but it's not available here
    // The parent component should handle this calculation
    onProgress({ position: pos });
  }, [onProgress]);

  const handlePlaying = useCallback(() => {
    setVlcActive(true);
  }, []);

  const handlePaused = useCallback(() => {
    setVlcActive(false);
  }, []);

  const handleEndReached = useCallback(() => {
    onEnd();
  }, [onEnd]);

  const handleEncounteredError = useCallback((e: any) => {
    logger.error('[AndroidVideoPlayer][VLC] Encountered error:', e);
    onError(e);
  }, [onError]);

  const handleBackground = useCallback(() => {
    logger.log('[VLC] App went to background');
  }, []);

  const handleESAdded = useCallback((tracks: any) => {
    try {
      logger.log('[VLC] ES Added - processing tracks...');
      processVlcTracks(tracks);
    } catch (e) {
      logger.error('[VLC] onESAdded error:', e);
      logger.warn('[AndroidVideoPlayer][VLC] onESAdded parse error', e);
    }
  }, []);

  // Format VLC tracks to match RN Video format - raw version
  const formatVlcTracks = useCallback((vlcTracks: Array<{id: number, name: string}>): VlcTrack[] => {
    if (!Array.isArray(vlcTracks)) return [];
    return vlcTracks.map(track => {
      // Just extract basic language info if available, but keep the full name
      let language = undefined;
      let displayName = track.name || `Track ${track.id + 1}`;

      // Log the raw track data for debugging
      if (__DEV__) {
        logger.log(`[VLC] Raw track data:`, { id: track.id, name: track.name });
      }

      // Only extract language from brackets if present, but keep full name
      const languageMatch = track.name?.match(/\[([^\]]+)\]/);
      if (languageMatch && languageMatch[1]) {
        language = languageMatch[1].trim();
      }

      return {
        id: track.id,
        name: displayName, // Show exactly what VLC provides
        language: language
      };
    });
  }, []);

  // Optimized VLC track processing function with reduced JSON operations
  const processVlcTracks = useCallback((tracks: any) => {
    if (!tracks) return;

    // Log raw VLC tracks data for debugging
    if (__DEV__) {
      logger.log(`[VLC] Raw tracks data:`, tracks);
    }

    const { audio = [], subtitle = [] } = tracks;

    // Process audio tracks
    if (Array.isArray(audio) && audio.length > 0) {
      const formattedAudio = formatVlcTracks(audio);
      if (__DEV__) {
        logger.log(`[VLC] Audio tracks updated:`, formattedAudio.length);
      }
    }

    // Process subtitle tracks
    if (Array.isArray(subtitle) && subtitle.length > 0) {
      const formattedSubs = formatVlcTracks(subtitle);
      if (__DEV__) {
        logger.log(`[VLC] Subtitle tracks updated:`, formattedSubs.length);
      }
    }

    // Notify parent of track updates
    onTracksUpdate({ audio, subtitle });
  }, [formatVlcTracks, onTracksUpdate]);

  // Process URL for VLC compatibility
  const processUrlForVLC = useCallback((url: string): string => {
    if (!url || typeof url !== 'string') {
      logger.warn('[AndroidVideoPlayer][VLC] Invalid URL provided:', url);
      return url || '';
    }

    try {
      // Check if URL is already properly formatted
      const urlObj = new URL(url);

      // Handle special characters in the pathname that might cause issues
      const pathname = urlObj.pathname;
      const search = urlObj.search;
      const hash = urlObj.hash;

      // Decode and re-encode the pathname to handle double-encoding
      const decodedPathname = decodeURIComponent(pathname);
      const encodedPathname = encodeURI(decodedPathname);

      // Reconstruct the URL
      const processedUrl = `${urlObj.protocol}//${urlObj.host}${encodedPathname}${search}${hash}`;

      logger.log(`[AndroidVideoPlayer][VLC] URL processed: ${url} -> ${processedUrl}`);
      return processedUrl;
    } catch (error) {
      logger.warn(`[AndroidVideoPlayer][VLC] URL processing failed, using original: ${error}`);
      return url;
    }
  }, []);

  const processedSource = useMemo(() => processUrlForVLC(source), [source, processUrlForVLC]);

  if (!LibVlcPlayerViewComponent) {
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000'
      }}>
        {/* VLC not available fallback */}
      </View>
    );
  }

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: screenDimensions.width,
        height: screenDimensions.height,
        overflow: 'hidden'
      }}
    >
      <LibVlcPlayerViewComponent
        ref={vlcRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: screenDimensions.width,
          height: screenDimensions.height,
          transform: [{ scale: clientScale }]
        }}
        // Force remount when surfaces are recreated
        key={key || 'vlc-default'}
        source={processedSource}
        aspectRatio={vlcAspectRatio}
        // Let VLC auto-fit the video to the view to prevent flicker on mode changes
        scale={0}
        options={vlcOptions}
        tracks={vlcTracks}
        volume={Math.round(Math.max(0, Math.min(1, volume)) * 100)}
        mute={false}
        repeat={false}
        rate={1}
        autoplay={false}
        onFirstPlay={handleFirstPlay}
        onPositionChanged={handlePositionChanged}
        onPlaying={handlePlaying}
        onPaused={handlePaused}
        onEndReached={handleEndReached}
        onEncounteredError={handleEncounteredError}
        onBackground={handleBackground}
        onESAdded={handleESAdded}
      />
    </View>
  );
});

VlcVideoPlayer.displayName = 'VlcVideoPlayer';

export default VlcVideoPlayer;
