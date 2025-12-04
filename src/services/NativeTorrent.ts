import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { TorrentStreamer } = NativeModules;
const eventEmitter = new NativeEventEmitter(TorrentStreamer);

interface StreamStats {
  bufferProgress: number;
  downloadSpeed: number;
  seeds: number;
}

class NativeTorrentController {
  
  constructor() {
    if (Platform.OS === 'android') {
        // Initialize the native engine settings
        TorrentStreamer.setup();
    }
  }

  start(magnetLink: string, onReady: (url: string) => void, onProgress: (stats: StreamStats) => void) {
    if (Platform.OS !== 'android') {
        console.warn("Native Torrenting is only supported on Android");
        return () => {};
    }

    console.log("Initializing Native Stream...");
    
    // 1. Listen for when the video file is ready to play
    const readySub = eventEmitter.addListener('TORRENT_READY', (event) => {
      console.log("Native Engine Ready:", event.url);
      onReady(event.url); 
    });

    // 2. Listen for download speed and buffering
    const progressSub = eventEmitter.addListener('TORRENT_PROGRESS', (event) => {
      onProgress({
        bufferProgress: event.bufferProgress,
        downloadSpeed: event.downloadSpeed,
        seeds: event.seeds
      });
    });

    // 3. Listen for errors
    const errorSub = eventEmitter.addListener('TORRENT_ERROR', (event) => {
        console.error("Torrent Error:", event.error);
    });

    // 4. Start the engine
    TorrentStreamer.start(magnetLink);

    // Return a cleanup function
    return () => {
      readySub.remove();
      progressSub.remove();
      errorSub.remove();
      TorrentStreamer.stop();
    };
  }
}

export const nativeTorrent = new NativeTorrentController();
