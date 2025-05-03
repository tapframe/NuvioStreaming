import { NativeModules, NativeEventEmitter, EmitterSubscription, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// Mock implementation for Expo environment
const MockTorrentStreamModule = {
  TORRENT_PROGRESS_EVENT: 'torrentProgress',
  startStream: async (magnetUri: string): Promise<string> => {
    logger.log('[MockTorrentService] Starting mock stream for:', magnetUri);
    // Return a fake URL that would look like a file path
    return `https://mock-torrent-stream.com/${magnetUri.substring(0, 10)}.mp4`;
  },
  stopStream: () => {
    logger.log('[MockTorrentService] Stopping mock stream');
  },
  fileExists: async (path: string): Promise<boolean> => {
    logger.log('[MockTorrentService] Checking if file exists:', path);
    return false;
  },
  // Add these methods to satisfy NativeModule interface
  addListener: () => {},
  removeListeners: () => {}
};

// Create an EventEmitter that doesn't rely on native modules
class MockEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  addListener(eventName: string, callback: Function): { remove: () => void } {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)?.push(callback);
    
    return {
      remove: () => {
        const eventListeners = this.listeners.get(eventName);
        if (eventListeners) {
          const index = eventListeners.indexOf(callback);
          if (index !== -1) {
            eventListeners.splice(index, 1);
          }
        }
      }
    };
  }
  
  emit(eventName: string, ...args: any[]) {
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
    }
  }
  
  removeAllListeners(eventName: string) {
    this.listeners.delete(eventName);
  }
}

// Use the mock module and event emitter since we're in Expo
const TorrentStreamModule = Platform.OS === 'web' ? null : MockTorrentStreamModule;
const mockEmitter = new MockEventEmitter();

const CACHE_KEY = '@torrent_cache_mapping';

export interface TorrentProgress {
  bufferProgress: number;
  downloadSpeed: number;
  progress: number;
  seeds: number;
}

export interface TorrentStreamEvents {
  onProgress?: (progress: TorrentProgress) => void;
}

class TorrentService {
  private eventEmitter: NativeEventEmitter | MockEventEmitter;
  private progressListener: EmitterSubscription | { remove: () => void } | null = null;
  private static TORRENT_PROGRESS_EVENT = TorrentStreamModule?.TORRENT_PROGRESS_EVENT || 'torrentProgress';
  private cachedTorrents: Map<string, string> = new Map(); // Map of magnet URI to cached file path
  private initialized: boolean = false;
  private mockProgressInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Use mock event emitter since we're in Expo
    this.eventEmitter = mockEmitter;
    this.loadCache();
  }

  private async loadCache() {
    try {
      const cacheData = await AsyncStorage.getItem(CACHE_KEY);
      if (cacheData) {
        const cacheMap = JSON.parse(cacheData);
        this.cachedTorrents = new Map(Object.entries(cacheMap));
        logger.log('[TorrentService] Loaded cache mapping:', this.cachedTorrents);
      }
      this.initialized = true;
    } catch (error) {
      logger.error('[TorrentService] Error loading cache:', error);
      this.initialized = true;
    }
  }

  private async saveCache() {
    try {
      const cacheData = Object.fromEntries(this.cachedTorrents);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      logger.log('[TorrentService] Saved cache mapping');
    } catch (error) {
      logger.error('[TorrentService] Error saving cache:', error);
    }
  }

  public async startStream(magnetUri: string, events?: TorrentStreamEvents): Promise<string> {
    // Wait for cache to be loaded
    while (!this.initialized) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    try {
      // First check if we have this torrent cached
      const cachedPath = this.cachedTorrents.get(magnetUri);
      if (cachedPath) {
        logger.log('[TorrentService] Found cached torrent file:', cachedPath);
        
        // In mock mode, we'll always use the cached path if available
        if (!TorrentStreamModule) {
          // Still set up progress listeners for cached content
          this.setupProgressListener(events);
          
          // Simulate progress for cached content too
          if (events?.onProgress) {
            this.startMockProgressUpdates(events.onProgress);
          }
          
          return cachedPath;
        }
        
        // For native implementations, verify the file still exists
        try {
          const exists = await TorrentStreamModule.fileExists(cachedPath);
          if (exists) {
            logger.log('[TorrentService] Using cached torrent file');
            
            // Setup progress listener if callback provided
            this.setupProgressListener(events);
            
            // Start the stream in cached mode
            await TorrentStreamModule.startStream(magnetUri);
            return cachedPath;
          } else {
            logger.log('[TorrentService] Cached file not found, removing from cache');
            this.cachedTorrents.delete(magnetUri);
            await this.saveCache();
          }
        } catch (error) {
          logger.error('[TorrentService] Error checking cached file:', error);
          // Continue to download again if there's an error
        }
      }

      // First stop any existing stream
      await this.stopStreamAndWait();

      // Setup progress listener if callback provided
      this.setupProgressListener(events);

      // If we're in mock mode (Expo), simulate progress
      if (!TorrentStreamModule) {
        logger.log('[TorrentService] Using mock implementation');
        const mockUrl = `https://mock-torrent-stream.com/${magnetUri.substring(0, 10)}.mp4`;
        
        // Save to cache
        this.cachedTorrents.set(magnetUri, mockUrl);
        await this.saveCache();
        
        // Start mock progress updates if events callback provided
        if (events?.onProgress) {
          this.startMockProgressUpdates(events.onProgress);
        }
        
        // Return immediately with mock URL
        return mockUrl;
      }

      // Start the actual stream if native module is available
      logger.log('[TorrentService] Starting torrent stream');
      const filePath = await TorrentStreamModule.startStream(magnetUri);
      
      // Save to cache
      if (filePath) {
        logger.log('[TorrentService] Adding path to cache:', filePath);
        this.cachedTorrents.set(magnetUri, filePath);
        await this.saveCache();
      }
      
      return filePath;
    } catch (error) {
      logger.error('[TorrentService] Error starting torrent stream:', error);
      this.cleanup(); // Clean up on error
      throw error;
    }
  }
  
  private setupProgressListener(events?: TorrentStreamEvents) {
    if (events?.onProgress) {
      logger.log('[TorrentService] Setting up progress listener');
      this.progressListener = this.eventEmitter.addListener(
        TorrentService.TORRENT_PROGRESS_EVENT,
        (progress) => {
          logger.log('[TorrentService] Progress event received:', progress);
          if (events.onProgress) {
            events.onProgress(progress);
          }
        }
      );
    } else {
      logger.log('[TorrentService] No progress callback provided');
    }
  }
  
  private startMockProgressUpdates(onProgress: (progress: TorrentProgress) => void) {
    // Clear any existing interval
    if (this.mockProgressInterval) {
      clearInterval(this.mockProgressInterval);
    }
    
    // Start at 0% progress
    let mockProgress = 0;
    
    // Update every second
    this.mockProgressInterval = setInterval(() => {
      // Increase by 10% each time
      mockProgress += 10;
      
      // Create mock progress object
      const progress: TorrentProgress = {
        bufferProgress: mockProgress,
        downloadSpeed: 1024 * 1024 * (1 + Math.random()), // Random speed around 1MB/s
        progress: mockProgress,
        seeds: Math.floor(5 + Math.random() * 20), // Random seed count between 5-25
      };
      
      // Emit the event instead of directly calling callback
      if (this.eventEmitter instanceof MockEventEmitter) {
        (this.eventEmitter as MockEventEmitter).emit(TorrentService.TORRENT_PROGRESS_EVENT, progress);
      } else {
        // Fallback to direct callback if needed
        onProgress(progress);
      }
      
      // If we reach 100%, clear the interval
      if (mockProgress >= 100) {
        if (this.mockProgressInterval) {
          clearInterval(this.mockProgressInterval);
          this.mockProgressInterval = null;
        }
      }
    }, 1000);
  }

  public async stopStreamAndWait(): Promise<void> {
    logger.log('[TorrentService] Stopping stream and waiting for cleanup');
    this.cleanup();
    
    if (TorrentStreamModule) {
      try {
        TorrentStreamModule.stopStream();
        // Wait a moment to ensure native side has cleaned up
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error('[TorrentService] Error stopping torrent stream:', error);
      }
    }
  }

  public stopStream(): void {
    try {
      logger.log('[TorrentService] Stopping stream and cleaning up');
      this.cleanup();
      
      if (TorrentStreamModule) {
        TorrentStreamModule.stopStream();
      }
    } catch (error) {
      logger.error('[TorrentService] Error stopping torrent stream:', error);
      // Still attempt cleanup even if stop fails
      this.cleanup();
    }
  }

  private cleanup(): void {
    logger.log('[TorrentService] Cleaning up event listeners and intervals');
    
    // Clean up progress listener
    if (this.progressListener) {
      try {
        this.progressListener.remove();
      } catch (error) {
        logger.error('[TorrentService] Error removing progress listener:', error);
      } finally {
        this.progressListener = null;
      }
    }
    
    // Clean up mock progress interval
    if (this.mockProgressInterval) {
      clearInterval(this.mockProgressInterval);
      this.mockProgressInterval = null;
    }
  }
}

export const torrentService = new TorrentService(); 