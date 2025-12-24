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

  // Default fallback
  return false;
};

/**
 * Get the appropriate player component name
 */
export const getPlayerComponent = (options: PlayerSelectionOptions): 'AndroidVideoPlayer' | 'KSPlayerCore' => {
  return shouldUseKSPlayer(options) ? 'KSPlayerCore' : 'AndroidVideoPlayer';
};
