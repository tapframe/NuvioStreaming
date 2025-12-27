import { Stream } from '../../types/metadata';

export interface StreamProviderData {
  addonName: string;
  streams: Stream[];
}

export interface GroupedStreams {
  [addonId: string]: StreamProviderData;
}

export interface StreamSection {
  title: string;
  addonId: string;
  data: Stream[];
  isEmptyDueToQualityFilter?: boolean;
}

export interface FilterItem {
  id: string;
  name: string;
}

export interface ProviderStatus {
  loading: boolean;
  success: boolean;
  error: boolean;
  message: string;
  timeStarted: number;
  timeCompleted: number;
}

export interface LoadingProviders {
  [key: string]: boolean;
}

export interface ProviderStatusMap {
  [key: string]: ProviderStatus;
}

export interface ProviderLoadTimes {
  [key: string]: number;
}

export interface ScraperLogos {
  [key: string]: string;
}

export interface IMDbRatingsMap {
  [key: string]: number;
}

export interface TMDBEpisodeOverride {
  vote_average?: number;
  runtime?: number;
  still_path?: string;
}

export interface AlertAction {
  label: string;
  onPress: () => void;
  style?: object;
}

export interface StreamsScreenParams {
  id: string;
  type: 'movie' | 'series' | 'tv' | 'other';
  episodeId?: string;
  episodeThumbnail?: string;
  fromPlayer?: boolean;
}
