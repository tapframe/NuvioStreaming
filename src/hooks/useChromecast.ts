import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { 
  useRemoteMediaClient, 
  useCastSession, 
  CastContext,
  PlayServicesState,
  MediaPlayerState,
} from 'react-native-google-cast';
import { logger } from '../utils/logger';

export interface CastDevice {
  id: string;
  name: string;
  isConnected: boolean;
}

export interface CastMediaInfo {
  contentUrl: string;
  contentType: string;
  metadata?: {
    title?: string;
    subtitle?: string;
    images?: Array<{ url: string }>;
    studio?: string;
    type?: 'movie' | 'series';
  };
  streamDuration?: number;
  startTime?: number;
  customData?: any;
}

export interface UseChromecastReturn {
  // Connection state
  isCastConnected: boolean;
  castDevice: CastDevice | null;
  isCastAvailable: boolean;
  
  // Media control
  loadMedia: (mediaInfo: CastMediaInfo) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  
  // Playback state from Cast device
  currentPosition: number;
  duration: number;
  isPlaying: boolean;
  
  // Device management
  showCastPicker: () => void;
  disconnect: () => Promise<void>;
  
  // Error handling
  error: string | null;
  clearError: () => void;
}

export const useChromecast = (): UseChromecastReturn => {
  // Cast SDK hooks
  const client = useRemoteMediaClient();
  const session = useCastSession();
  
  // State
  const [isCastConnected, setIsCastConnected] = useState(false);
  const [castDevice, setCastDevice] = useState<CastDevice | null>(null);
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for cleanup
  const positionUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef(0);
  
  // Check Cast availability
  useEffect(() => {
    // Cast is available on both iOS and Android
    // The actual availability will be determined by the Cast SDK
    setIsCastAvailable(true);
  }, []);
  
  // Monitor Cast session changes
  useEffect(() => {
    if (!session) {
      setIsCastConnected(false);
      setCastDevice(null);
      return;
    }
    
    const updateDeviceInfo = async () => {
      try {
        const device = await session.getCastDevice();
        if (device) {
          const deviceInfo: CastDevice = {
            id: device.deviceId,
            name: device.friendlyName || device.deviceId,
            isConnected: true
          };
          
          setIsCastConnected(true);
          setCastDevice(deviceInfo);
          
          logger.log('[useChromecast] Connected to Cast device:', deviceInfo.name);
        }
      } catch (error) {
        logger.error('[useChromecast] Error getting device info:', error);
      }
    };
    
    updateDeviceInfo();
    
        return () => {
          setIsCastConnected(false);
          setCastDevice(null);
          logger.log('[useChromecast] Disconnected from Cast device');
        };
      }, [session]);
  
  // Monitor media status updates
  useEffect(() => {
    if (!client || !isCastConnected) {
      setCurrentPosition(0);
      setDuration(0);
      setIsPlaying(false);
      return;
    }
    
    const updateMediaStatus = async () => {
      try {
        const mediaStatus = await client.getMediaStatus();
        if (mediaStatus) {
          const playerState = mediaStatus.playerState;
          const isPlaying = playerState === MediaPlayerState.PLAYING;
          const isPaused = playerState === MediaPlayerState.PAUSED;
          const position = (isPlaying || isPaused) 
            ? (mediaStatus.streamPosition || 0) 
            : 0;
          
          setCurrentPosition(position);
          setDuration(mediaStatus.mediaInfo?.streamDuration || 0);
          setIsPlaying(isPlaying);
          
          // Update last position for comparison
          lastPositionRef.current = position;
        }
      } catch (error) {
        // Silently handle errors - media status might not be available yet
      }
    };
    
    // Initial update
    updateMediaStatus();
    
    // Set up periodic updates (every 1 second)
    positionUpdateInterval.current = setInterval(updateMediaStatus, 1000);
    
    return () => {
      if (positionUpdateInterval.current) {
        clearInterval(positionUpdateInterval.current);
        positionUpdateInterval.current = null;
      }
    };
  }, [client, isCastConnected]);
  
  // Load media to Cast device
  const loadMedia = useCallback(async (mediaInfo: CastMediaInfo) => {
    if (!client || !isCastConnected) {
      setError('No Cast device connected');
      return;
    }
    
    try {
      setError(null);
      
      const mediaLoadRequest = {
        mediaInfo: {
          contentUrl: mediaInfo.contentUrl,
          contentType: mediaInfo.contentType,
          streamDuration: mediaInfo.streamDuration,
          customData: mediaInfo.customData
        },
        startTime: mediaInfo.startTime || 0,
        autoplay: true
      };
      
      logger.log('[useChromecast] Loading media:', {
        url: mediaInfo.contentUrl,
        type: mediaInfo.contentType,
        duration: mediaInfo.streamDuration,
        startTime: mediaInfo.startTime
      });
      
      await client.loadMedia(mediaLoadRequest);
      
      logger.log('[useChromecast] Media loaded successfully');
    } catch (err) {
      const errorMessage = `Failed to load media: ${err}`;
      logger.error('[useChromecast] Error loading media:', err);
      setError(errorMessage);
      throw err;
    }
  }, [client, isCastConnected]);
  
  // Play media
  const play = useCallback(async () => {
    if (!client || !isCastConnected) {
      setError('No Cast device connected');
      return;
    }
    
    try {
      setError(null);
      await client.play();
      logger.log('[useChromecast] Play command sent');
    } catch (err) {
      const errorMessage = `Failed to play: ${err}`;
      logger.error('[useChromecast] Error playing:', err);
      setError(errorMessage);
      throw err;
    }
  }, [client, isCastConnected]);
  
  // Pause media
  const pause = useCallback(async () => {
    if (!client || !isCastConnected) {
      setError('No Cast device connected');
      return;
    }
    
    try {
      setError(null);
      await client.pause();
      logger.log('[useChromecast] Pause command sent');
    } catch (err) {
      const errorMessage = `Failed to pause: ${err}`;
      logger.error('[useChromecast] Error pausing:', err);
      setError(errorMessage);
      throw err;
    }
  }, [client, isCastConnected]);
  
  // Seek to position
  const seek = useCallback(async (position: number) => {
    if (!client || !isCastConnected) {
      setError('No Cast device connected');
      return;
    }
    
    try {
      setError(null);
      await client.seek({ position });
      logger.log('[useChromecast] Seek command sent to position:', position);
    } catch (err) {
      const errorMessage = `Failed to seek: ${err}`;
      logger.error('[useChromecast] Error seeking:', err);
      setError(errorMessage);
      throw err;
    }
  }, [client, isCastConnected]);
  
  // Show Cast device picker
  const showCastPicker = useCallback(() => {
    if (!isCastAvailable) {
      setError('Chromecast not available');
      return;
    }
    
    try {
      setError(null);
      // Use the CastContext directly - the library should handle this
      CastContext.showCastDialog();
      logger.log('[useChromecast] Cast dialog shown');
    } catch (err) {
      const errorMessage = `Failed to show Cast dialog: ${err}`;
      logger.error('[useChromecast] Error showing Cast dialog:', err);
      setError(errorMessage);
    }
  }, [isCastAvailable]);
  
  // Disconnect from Cast device
  const disconnect = useCallback(async () => {
    if (!session) {
      return;
    }
    
    try {
      setError(null);
      // For now, just log the disconnect attempt
      // The actual disconnection will be handled by the Cast SDK
      logger.log('[useChromecast] Disconnect requested');
    } catch (err) {
      const errorMessage = `Failed to disconnect: ${err}`;
      logger.error('[useChromecast] Error disconnecting:', err);
      setError(errorMessage);
      throw err;
    }
  }, [session]);
  
  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (positionUpdateInterval.current) {
        clearInterval(positionUpdateInterval.current);
      }
    };
  }, []);
  
  return {
    // Connection state
    isCastConnected,
    castDevice,
    isCastAvailable,
    
    // Media control
    loadMedia,
    play,
    pause,
    seek,
    
    // Playback state
    currentPosition,
    duration,
    isPlaying,
    
    // Device management
    showCastPicker,
    disconnect,
    
    // Error handling
    error,
    clearError
  };
};
