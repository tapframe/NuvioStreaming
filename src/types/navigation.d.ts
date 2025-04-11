import { NavigatorScreenParams } from '@react-navigation/native';

// Define the screens and their parameters
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Metadata: {
    id: string;
    type: string;
  };
  Streams: {
    id: string;
    type: string;
    episodeId?: string;
  };
  Player: {
    id: string;
    type: string;
    title?: string;
    poster?: string;
    stream: string;
    headers?: {
      Referer?: string;
      'User-Agent'?: string;
      Origin?: string;
    };
    subtitles?: Array<{
      url: string;
      lang: string;
    }>;
  };
  Catalog: {
    addonId?: string;
    type: string;
    id: string;
    name?: string;
    genreFilter?: string;
  };
  Addons: undefined;
  Search: undefined;
  CatalogSettings: undefined;
  ShowRatings: { showId: number };
};

export type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Library: undefined;
  Addons: undefined;
  Settings: undefined;
};

// Declare custom types for the navigation hook
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
} 