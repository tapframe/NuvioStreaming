export interface AniListAiringSchedule {
  id: number;
  airingAt: number; // UNIX timestamp
  episode: number;
  media: {
    id: number;
    idMal: number | null;
    title: {
      romaji: string;
      english: string | null;
      native: string;
    };
    coverImage: {
      large: string;
      medium: string;
      color: string | null;
    };
    episodes: number | null;
    format: string; // TV, MOVIE, OVA, ONA, etc.
    status: string;
    season: string | null;
    seasonYear: number | null;
    nextAiringEpisode: {
      airingAt: number;
      timeUntilAiring: number;
      episode: number;
    } | null;
  };
}

export interface AniListResponse {
  data: {
    Page: {
      pageInfo: {
        total: number;
        perPage: number;
        currentPage: number;
        lastPage: number;
        hasNextPage: boolean;
      };
      airingSchedules: AniListAiringSchedule[];
    };
  };
}
