import { useState, useEffect } from 'react';
import { NativeModules, NativeEventEmitter } from 'react-native';

const { TorrentStreamer } = NativeModules;
const emitter = new NativeEventEmitter(TorrentStreamer);

export function useTorrentStream(originalSource: any) {
  const [videoSource, setVideoSource] = useState(originalSource);
  const [isBuffering, setIsBuffering] = useState(false);
  const [stats, setStats] = useState({
    downloadSpeed: 0,
    bufferProgress: 0,
    seeds: 0
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const uri = originalSource?.uri;

    // Not a magnet link → return original
    if (!uri || typeof uri !== 'string' || !uri.startsWith('magnet:')) {
      setVideoSource(originalSource);
      setIsBuffering(false);
      return;
    }

    console.log("🧲 Magnet detected, starting native torrent engine…");

    setIsBuffering(true);

    // Start torrent
    TorrentStreamer.setup();
    TorrentStreamer.start(uri);

    // Listen for events
    const subReady = emitter.addListener("TORRENT_READY", (e) => {
      console.log("Torrent Ready →", e.url);
      setVideoSource({ uri: e.url });
      setIsBuffering(false);
    });

    const subProgress = emitter.addListener("TORRENT_PROGRESS", (e) => {
      setStats({
        downloadSpeed: e.downloadSpeed,
        bufferProgress: e.bufferProgress,
        seeds: e.seeds
      });
      setIsBuffering(true);
    });

    const subError = emitter.addListener("TORRENT_ERROR", (e) => {
      console.log("Torrent Error:", e.error);
      setError(e.error);
      setIsBuffering(false);
    });

    return () => {
      console.log("Stopping torrent…");
      TorrentStreamer.stop();
      subReady.remove();
      subProgress.remove();
      subError.remove();
    };
  }, [originalSource]);

  return { videoSource, isBuffering, stats, error };
}
