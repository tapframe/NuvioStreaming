import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { logger } from '../utils/logger';

interface VideoPlayerOptions {
  useExternalPlayer: boolean;
  title?: string;
  poster?: string;
  subtitleUrl?: string;
  subtitleLanguage?: string;
  headers?: Record<string, string>;
  episodeTitle?: string;
  episodeNumber?: string;
  releaseDate?: string;
}

export const VideoPlayerService = {
  playVideo: async (url: string, options?: Partial<VideoPlayerOptions>): Promise<boolean> => {
    if (!options?.useExternalPlayer || Platform.OS !== 'android') {
      return false;
    }

    try {
      // Create a title that includes all relevant metadata
      const fullTitle = [
        options.title,
        options.episodeNumber,
        options.episodeTitle,
        options.releaseDate
      ].filter(Boolean).join(' - ');

      // Launch the intent to play the video
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: url,
        flags: 1, // FLAG_ACTIVITY_NEW_TASK
        type: 'video/*',
        extra: {
          'android.intent.extra.TITLE': fullTitle,
          'position': 0, // Start from beginning
        },
      });

      return true;
    } catch (error) {
      logger.error('Failed to launch external player:', error);
      return false;
    }
  }
};