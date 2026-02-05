export interface MalToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // Seconds
  createdAt: number; // Timestamp
}

export interface MalUser {
  id: number;
  name: string;
  picture?: string;
  location?: string;
  joined_at?: string;
}

export interface MalAnime {
  id: number;
  title: string;
  main_picture?: {
    medium: string;
    large: string;
  };
  num_episodes: number;
  media_type?: 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music';
  start_season?: {
    year: number;
    season: string;
  };
}

export type MalListStatus = 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

export interface MalMyListStatus {
  status: MalListStatus;
  score: number;
  num_episodes_watched: number;
  is_rewatching: boolean;
  updated_at: string;
}

export interface MalAnimeNode {
  node: MalAnime;
  list_status: MalMyListStatus;
}

export interface MalUserListResponse {
  data: MalAnimeNode[];
  paging: {
    next?: string;
    previous?: string;
  };
}

export interface MalSearchResult {
  data: MalAnimeNode[];
  paging: {
    next?: string;
    previous?: string;
  };
}
