import { useState, useEffect } from 'react';
import { nativeTorrent } from '../services/NativeTorrent'; // The service we created earlier

export function useTorrentStream(originalSource: any) {
  const [videoSource, setVideoSource] = useState(originalSource);
  const [isBuffering, setIsBuffering] = useState(false);
  const [stats, setStats] = useState({ speed: 0, progress: 0, seeds: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check if the input is a Magnet Link
    const uri = originalSource?.uri;
    
    if (typeof uri === 'string' && uri.startsWith('magnet:')) {
      console.log('🧲 Magnet Link Detected! Starting Native Engine...');
      setIsBuffering(true);

      // 2. Start the Engine
      const stopTorrent = nativeTorrent.start(
        uri,
        (localFilePath) => {
          // SUCCESS: The first chunk is ready!
          console.log('✅ Stream Ready:', localFilePath);
          setVideoSource({ uri: localFilePath });
          setIsBuffering(false);
        },
        (newStats) => {
          setStats(newStats);
        }
      );

      // Cleanup when user closes player or switches video
      return () => {
        stopTorrent();
      };
    } else {
      // It's a normal HTTP link (RealDebrid/Server), just play it.
      setVideoSource(originalSource);
      setIsBuffering(false);
    }
  }, [originalSource]);

  return { videoSource, isBuffering, stats, error };
}
