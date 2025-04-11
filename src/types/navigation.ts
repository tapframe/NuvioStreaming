import { ParamListBase } from '@react-navigation/native';

export interface RootStackParamList extends ParamListBase {
  Home: undefined;
  Details: {
    id: string;
    type: 'movie' | 'series';
  };
  Episodes: {
    id: string;
    type: 'series';
  };
  Streams: {
    id: string;
    type: 'movie' | 'series';
    episodeId?: string;
  };
  Player: {
    id: string;
    type: 'movie' | 'series';
    title?: string;
    poster?: string;
    stream?: string;
  };
  [key: string]: undefined | object;
} 