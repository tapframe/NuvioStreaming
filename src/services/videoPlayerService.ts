import { NativeModules } from 'react-native';
import { useSettings } from '../hooks/useSettings';

const { VideoPlayerModule } = NativeModules;

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
  playVideo: (url: string, options?: Partial<VideoPlayerOptions>): Promise<boolean> => {
    if (options) {
      return VideoPlayerModule.playVideo(url, options);
    } else {
      return VideoPlayerModule.playVideo(url);
    }
  }
};