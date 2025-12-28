/**
 * Centralized player selection logic
 * Used by both StreamsScreen and KSPlayer routing
 */

import { Platform } from 'react-native';
import { isMkvStream } from './mkvDetection';

export interface PlayerSelectionOptions {
  uri: string;
  headers?: Record<string, string>;
  platform?: typeof Platform.OS;
}

// Player component types based on platform
export type PlayerComponentName =
  | 'AndroidVideoPlayer'
  | 'KSPlayerCore'
  | 'WindowsVideoPlayer'
  | 'WebVideoPlayer';

/**
 * Check if current platform is a desktop platform
 */
export const isDesktopPlatform = (platform = Platform.OS): boolean => {
  return platform === 'windows' || platform === 'macos';
};

/**
 * Determines which player should be used for a given stream
 */
export const shouldUseKSPlayer = ({
  uri,
  headers,
  platform = Platform.OS
}: PlayerSelectionOptions): boolean => {
  // Android always uses AndroidVideoPlayer (MPV)
  if (platform === 'android') {
    return false;
  }

  // iOS: Always use KSPlayer for all formats
  // KSPlayer handles automatic fallback (AVPlayer → FFmpeg)
  if (platform === 'ios') {
    return true;
  }

  // Windows uses WindowsVideoPlayer (placeholder for now)
  if (platform === 'windows') {
    return false;
  }

  // Default fallback
  return false;
};

/**
 * Get the appropriate player component name
 */
export const getPlayerComponent = (options: PlayerSelectionOptions): PlayerComponentName => {
  const platform = options.platform ?? Platform.OS;

  if (platform === 'windows') {
    return 'WindowsVideoPlayer';
  }

  if (platform === 'web') {
    return 'WebVideoPlayer';
  }

  return shouldUseKSPlayer(options) ? 'KSPlayerCore' : 'AndroidVideoPlayer';
};
