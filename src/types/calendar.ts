export interface CalendarEpisode {
  id: string;
  seriesId: string;
  title: string;
  seriesName: string;
  poster: string;
  releaseDate: string | null;
  season: number;
  episode: number;
  overview: string;
  vote_average: number;
  still_path: string | null;
  season_poster_path: string | null;
  // MAL specific
  day?: string;
  time?: string;
  genres?: string[];
}

export interface CalendarSection {
  title: string;
  data: CalendarEpisode[];
}