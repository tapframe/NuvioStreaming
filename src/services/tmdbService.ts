import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TMDB API configuration
const DEFAULT_API_KEY = '439c478a771f35c05022f9feabcca01c';
const BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY_STORAGE_KEY = 'tmdb_api_key';
const USE_CUSTOM_TMDB_API_KEY = 'use_custom_tmdb_api_key';

// Types for TMDB responses
export interface TMDBEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  air_date: string;
  vote_average: number;
  imdb_id?: string;
  imdb_rating?: number;
  season_poster_path?: string | null;
  runtime?: number;
}

export interface TMDBSeason {
  id: number;
  name: string;
  overview: string;
  season_number: number;
  episodes: TMDBEpisode[];
  poster_path: string | null;
  air_date: string;
}

export interface TMDBShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  genres?: { id: number; name: string }[];
  seasons: {
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
    poster_path: string | null;
    air_date: string;
  }[];
}

export interface TMDBTrendingResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  external_ids?: {
    imdb_id: string | null;
    [key: string]: any;
  };
}

export class TMDBService {
  private static instance: TMDBService;
  private static ratingCache: Map<string, number | null> = new Map();
  private apiKey: string = DEFAULT_API_KEY;
  private useCustomKey: boolean = false;
  private apiKeyLoaded: boolean = false;

  private constructor() {
    this.loadApiKey();
  }

  static getInstance(): TMDBService {
    if (!TMDBService.instance) {
      TMDBService.instance = new TMDBService();
    }
    return TMDBService.instance;
  }

  private async loadApiKey() {
    try {
      const [savedKey, savedUseCustomKey] = await Promise.all([
        AsyncStorage.getItem(TMDB_API_KEY_STORAGE_KEY),
        AsyncStorage.getItem(USE_CUSTOM_TMDB_API_KEY)
      ]);
      
      this.useCustomKey = savedUseCustomKey === 'true';
      
      if (this.useCustomKey && savedKey) {
        this.apiKey = savedKey;
      } else {
        this.apiKey = DEFAULT_API_KEY;
      }
      
      this.apiKeyLoaded = true;
    } catch (error) {
      this.apiKey = DEFAULT_API_KEY;
      this.apiKeyLoaded = true;
    }
  }

  private async getHeaders() {
    // Ensure API key is loaded before returning headers
    if (!this.apiKeyLoaded) {
      await this.loadApiKey();
    }
    
    return {
      'Content-Type': 'application/json',
    };
  }

  private async getParams(additionalParams = {}) {
    // Ensure API key is loaded before returning params
    if (!this.apiKeyLoaded) {
      await this.loadApiKey();
    }
    
    return {
      api_key: this.apiKey,
      ...additionalParams
    };
  }

  private generateRatingCacheKey(showName: string, seasonNumber: number, episodeNumber: number): string {
    return `${showName.toLowerCase()}_s${seasonNumber}_e${episodeNumber}`;
  }

  /**
   * Search for a TV show by name
   */
  async searchTVShow(query: string): Promise<TMDBShow[]> {
    try {
      const response = await axios.get(`${BASE_URL}/search/tv`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          query,
          include_adult: false,
          language: 'en-US',
          page: 1,
        }),
      });
      return response.data.results;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get TV show details by TMDB ID
   */
  async getTVShowDetails(tmdbId: number): Promise<TMDBShow | null> {
    try {
      const response = await axios.get(`${BASE_URL}/tv/${tmdbId}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
        }),
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get external IDs for an episode (including IMDb ID)
   */
  async getEpisodeExternalIds(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<{ imdb_id: string | null } | null> {
    try {
      const response = await axios.get(
        `${BASE_URL}/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`,
        {
          headers: await this.getHeaders(),
          params: await this.getParams(),
        }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get IMDb rating for an episode using OMDB API with caching
   */
  async getIMDbRating(showName: string, seasonNumber: number, episodeNumber: number): Promise<number | null> {
    const cacheKey = this.generateRatingCacheKey(showName, seasonNumber, episodeNumber);
    
    // Check cache first
    if (TMDBService.ratingCache.has(cacheKey)) {
      return TMDBService.ratingCache.get(cacheKey) ?? null;
    }

    try {
      const OMDB_API_KEY = '20e793df';
      const response = await axios.get(`http://www.omdbapi.com/`, {
        params: {
          apikey: OMDB_API_KEY,
          t: showName,
          Season: seasonNumber,
          Episode: episodeNumber
        }
      });
      
      let rating: number | null = null;
      if (response.data && response.data.imdbRating && response.data.imdbRating !== 'N/A') {
        rating = parseFloat(response.data.imdbRating);
      }

      // Store in cache
      TMDBService.ratingCache.set(cacheKey, rating);
      return rating;
    } catch (error) {
      // Cache the failed result too to prevent repeated failed requests
      TMDBService.ratingCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Get season details including all episodes with IMDb ratings
   */
  async getSeasonDetails(tmdbId: number, seasonNumber: number, showName?: string): Promise<TMDBSeason | null> {
    try {
      const response = await axios.get(`${BASE_URL}/tv/${tmdbId}/season/${seasonNumber}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
        }),
      });

      const season = response.data;

      // If show name is provided, fetch IMDb ratings for each episode in batches
      if (showName) {
        // Process episodes in batches of 5 to avoid rate limiting
        const batchSize = 5;
        const episodes = [...season.episodes];
        const episodesWithRatings = [];

        for (let i = 0; i < episodes.length; i += batchSize) {
          const batch = episodes.slice(i, i + batchSize);
          const batchPromises = batch.map(async (episode: TMDBEpisode) => {
            const imdbRating = await this.getIMDbRating(
              showName,
              episode.season_number,
              episode.episode_number
            );

            return {
              ...episode,
              imdb_rating: imdbRating
            };
          });

          const batchResults = await Promise.all(batchPromises);
          episodesWithRatings.push(...batchResults);
        }

        return {
          ...season,
          episodes: episodesWithRatings,
        };
      }

      return season;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get episode details
   */
  async getEpisodeDetails(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<TMDBEpisode | null> {
    try {
      const response = await axios.get(
        `${BASE_URL}/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`,
        {
          headers: await this.getHeaders(),
          params: await this.getParams({
            language: 'en-US',
          }),
        }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract TMDB ID from Stremio ID
   * Stremio IDs for series are typically in the format: tt1234567:1:1 (imdbId:season:episode)
   * or just tt1234567 for the series itself
   */
  async extractTMDBIdFromStremioId(stremioId: string): Promise<number | null> {
    try {
      // Extract the base IMDB ID (remove season/episode info if present)
      const imdbId = stremioId.split(':')[0];
      
      // Use the existing findTMDBIdByIMDB function to get the TMDB ID
      const tmdbId = await this.findTMDBIdByIMDB(imdbId);
      return tmdbId;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find TMDB ID by IMDB ID
   */
  async findTMDBIdByIMDB(imdbId: string): Promise<number | null> {
    try {
      // Extract the IMDB ID without season/episode info
      const baseImdbId = imdbId.split(':')[0];
      
      const response = await axios.get(`${BASE_URL}/find/${baseImdbId}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          external_source: 'imdb_id',
          language: 'en-US',
        }),
      });
      
      // Check TV results first
      if (response.data.tv_results && response.data.tv_results.length > 0) {
        return response.data.tv_results[0].id;
      }
      
      // Check movie results as fallback
      if (response.data.movie_results && response.data.movie_results.length > 0) {
        return response.data.movie_results[0].id;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get image URL for TMDB images
   */
  getImageUrl(path: string | null, size: 'original' | 'w500' | 'w300' | 'w185' | 'profile' = 'original'): string | null {
    if (!path) {
      return null;
    }
    
    const baseImageUrl = 'https://image.tmdb.org/t/p/';
    const fullUrl = `${baseImageUrl}${size}${path}`;
    
    return fullUrl;
  }

  /**
   * Get all episodes for a TV show
   */
  async getAllEpisodes(tmdbId: number): Promise<{ [seasonNumber: number]: TMDBEpisode[] }> {
    try {
      // First get the show details to know how many seasons there are
      const showDetails = await this.getTVShowDetails(tmdbId);
      if (!showDetails) return {};

      const allEpisodes: { [seasonNumber: number]: TMDBEpisode[] } = {};
      
      // Get episodes for each season (in parallel)
      const seasonPromises = showDetails.seasons
        .filter(season => season.season_number > 0) // Filter out specials (season 0)
        .map(async season => {
          const seasonDetails = await this.getSeasonDetails(tmdbId, season.season_number);
          if (seasonDetails && seasonDetails.episodes) {
            allEpisodes[season.season_number] = seasonDetails.episodes;
          }
        });
      
      await Promise.all(seasonPromises);
      return allEpisodes;
    } catch (error) {
      return {};
    }
  }

  /**
   * Get episode image URL with fallbacks
   */
  getEpisodeImageUrl(episode: TMDBEpisode, show: TMDBShow | null = null, size: 'original' | 'w500' | 'w300' | 'w185' = 'w300'): string | null {
    // Try episode still image first
    if (episode.still_path) {
      return this.getImageUrl(episode.still_path, size);
    }
    
    // Try season poster as fallback
    if (show && show.seasons) {
      const season = show.seasons.find(s => s.season_number === episode.season_number);
      if (season && season.poster_path) {
        return this.getImageUrl(season.poster_path, size);
      }
    }
    
    // Use show poster as last resort
    if (show && show.poster_path) {
      return this.getImageUrl(show.poster_path, size);
    }
    
    return null;
  }

  /**
   * Convert TMDB air date to a more readable format
   */
  formatAirDate(airDate: string | null): string {
    if (!airDate) return 'Unknown';
    
    try {
      const date = new Date(airDate);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return airDate;
    }
  }

  async getCredits(tmdbId: number, type: string) {
    try {
      const response = await axios.get(`${BASE_URL}/${type === 'series' ? 'tv' : 'movie'}/${tmdbId}/credits`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
        }),
      });
      return {
        cast: response.data.cast || [],
        crew: response.data.crew || []
      };
    } catch (error) {
      return { cast: [], crew: [] };
    }
  }

  async getPersonDetails(personId: number) {
    try {
      const response = await axios.get(`${BASE_URL}/person/${personId}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
        }),
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get external IDs for a TV show (including IMDb ID)
   */
  async getShowExternalIds(tmdbId: number): Promise<{ imdb_id: string | null } | null> {
    try {
      const response = await axios.get(
        `${BASE_URL}/tv/${tmdbId}/external_ids`,
        {
          headers: await this.getHeaders(),
          params: await this.getParams(),
        }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async getRecommendations(type: 'movie' | 'tv', tmdbId: string): Promise<any[]> {
    if (!this.apiKey) {
      return [];
    }
    try {
      const response = await axios.get(`${BASE_URL}/${type}/${tmdbId}/recommendations`, {
        headers: await this.getHeaders(),
        params: await this.getParams({ language: 'en-US' })
      });
      return response.data.results || [];
    } catch (error) {
      return [];
    }
  }

  async searchMulti(query: string): Promise<any[]> {
    try {
      const response = await axios.get(`${BASE_URL}/search/multi`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          query,
          include_adult: false,
          language: 'en-US',
          page: 1,
        }),
      });
      return response.data.results;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get movie details by TMDB ID
   */
  async getMovieDetails(movieId: string): Promise<any> {
    try {
      const response = await axios.get(`${BASE_URL}/movie/${movieId}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
          append_to_response: 'external_ids' // Append external IDs
        }),
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get movie images (logos, posters, backdrops) by TMDB ID
   */
  async getMovieImages(movieId: number | string, preferredLanguage: string = 'en'): Promise<string | null> {
    try {
      const response = await axios.get(`${BASE_URL}/movie/${movieId}/images`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          include_image_language: `${preferredLanguage},en,null`
        }),
      });

      const images = response.data;
      
      if (images && images.logos && images.logos.length > 0) {
        // First prioritize preferred language SVG logos if not English
        if (preferredLanguage !== 'en') {
          const preferredSvgLogo = images.logos.find((logo: any) => 
            logo.file_path && 
            logo.file_path.endsWith('.svg') && 
            logo.iso_639_1 === preferredLanguage
          );
          if (preferredSvgLogo) {
            return this.getImageUrl(preferredSvgLogo.file_path);
          }

          // Then preferred language PNG logos
          const preferredPngLogo = images.logos.find((logo: any) => 
            logo.file_path && 
            logo.file_path.endsWith('.png') && 
            logo.iso_639_1 === preferredLanguage
          );
          if (preferredPngLogo) {
            return this.getImageUrl(preferredPngLogo.file_path);
          }
          
          // Then any preferred language logo
          const preferredLogo = images.logos.find((logo: any) => 
            logo.iso_639_1 === preferredLanguage
          );
          if (preferredLogo) {
            return this.getImageUrl(preferredLogo.file_path);
          }
        }

        // Then prioritize English SVG logos
        const enSvgLogo = images.logos.find((logo: any) => 
          logo.file_path && 
          logo.file_path.endsWith('.svg') && 
          logo.iso_639_1 === 'en'
        );
        if (enSvgLogo) {
          return this.getImageUrl(enSvgLogo.file_path);
        }

        // Then English PNG logos
        const enPngLogo = images.logos.find((logo: any) => 
          logo.file_path && 
          logo.file_path.endsWith('.png') && 
          logo.iso_639_1 === 'en'
        );
        if (enPngLogo) {
          return this.getImageUrl(enPngLogo.file_path);
        }
        
        // Then any English logo
        const enLogo = images.logos.find((logo: any) => 
          logo.iso_639_1 === 'en'
        );
        if (enLogo) {
          return this.getImageUrl(enLogo.file_path);
        }

        // Fallback to any SVG logo
        const svgLogo = images.logos.find((logo: any) => 
          logo.file_path && logo.file_path.endsWith('.svg')
        );
        if (svgLogo) {
          return this.getImageUrl(svgLogo.file_path);
        }

        // Then any PNG logo
        const pngLogo = images.logos.find((logo: any) => 
          logo.file_path && logo.file_path.endsWith('.png')
        );
        if (pngLogo) {
          return this.getImageUrl(pngLogo.file_path);
        }
         
        // Last resort: any logo
        return this.getImageUrl(images.logos[0].file_path);
      }

      return null; // No logos found
    } catch (error) {
      return null;
    }
  }

  /**
   * Get TV show images (logos, posters, backdrops) by TMDB ID
   */
  async getTvShowImages(showId: number | string, preferredLanguage: string = 'en'): Promise<string | null> {
    try {
      const response = await axios.get(`${BASE_URL}/tv/${showId}/images`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          include_image_language: `${preferredLanguage},en,null`
        }),
      });

      const images = response.data;
      
      if (images && images.logos && images.logos.length > 0) {
        // First prioritize preferred language SVG logos if not English
        if (preferredLanguage !== 'en') {
          const preferredSvgLogo = images.logos.find((logo: any) => 
            logo.file_path && 
            logo.file_path.endsWith('.svg') && 
            logo.iso_639_1 === preferredLanguage
          );
          if (preferredSvgLogo) {
            return this.getImageUrl(preferredSvgLogo.file_path);
          }

          // Then preferred language PNG logos
          const preferredPngLogo = images.logos.find((logo: any) => 
            logo.file_path && 
            logo.file_path.endsWith('.png') && 
            logo.iso_639_1 === preferredLanguage
          );
          if (preferredPngLogo) {
            return this.getImageUrl(preferredPngLogo.file_path);
          }
          
          // Then any preferred language logo
          const preferredLogo = images.logos.find((logo: any) => 
            logo.iso_639_1 === preferredLanguage
          );
          if (preferredLogo) {
            return this.getImageUrl(preferredLogo.file_path);
          }
        }

        // First prioritize English SVG logos
        const enSvgLogo = images.logos.find((logo: any) => 
          logo.file_path && 
          logo.file_path.endsWith('.svg') && 
          logo.iso_639_1 === 'en'
        );
        if (enSvgLogo) {
          return this.getImageUrl(enSvgLogo.file_path);
        }

        // Then English PNG logos
        const enPngLogo = images.logos.find((logo: any) => 
          logo.file_path && 
          logo.file_path.endsWith('.png') && 
          logo.iso_639_1 === 'en'
        );
        if (enPngLogo) {
          return this.getImageUrl(enPngLogo.file_path);
        }
        
        // Then any English logo
        const enLogo = images.logos.find((logo: any) => 
          logo.iso_639_1 === 'en'
        );
        if (enLogo) {
          return this.getImageUrl(enLogo.file_path);
        }

        // Fallback to any SVG logo
        const svgLogo = images.logos.find((logo: any) => 
          logo.file_path && logo.file_path.endsWith('.svg')
        );
        if (svgLogo) {
          return this.getImageUrl(svgLogo.file_path);
        }

        // Then any PNG logo
        const pngLogo = images.logos.find((logo: any) => 
          logo.file_path && logo.file_path.endsWith('.png')
        );
        if (pngLogo) {
          return this.getImageUrl(pngLogo.file_path);
        }
         
        // Last resort: any logo
        return this.getImageUrl(images.logos[0].file_path);
      }

      return null; // No logos found
    } catch (error) {
      return null;
    }
  }

  /**
   * Get content logo based on type (movie or TV show)
   */
  async getContentLogo(type: 'movie' | 'tv', id: number | string, preferredLanguage: string = 'en'): Promise<string | null> {
    try {
      const result = type === 'movie' 
        ? await this.getMovieImages(id, preferredLanguage)
        : await this.getTvShowImages(id, preferredLanguage);
        
      if (result) {
      } else {
      }
      
      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get content certification rating
   */
  async getCertification(type: string, id: number): Promise<string | null> {
    try {
      // Different endpoints for movies and TV shows
      const endpoint = type === 'movie' ? 'movie' : 'tv';
      const response = await axios.get(`${BASE_URL}/${endpoint}/${id}/release_dates`, {
        headers: await this.getHeaders(),
        params: await this.getParams()
      });

      if (response.data && response.data.results) {
        // Try to find US certification first
        const usRelease = response.data.results.find((r: any) => r.iso_3166_1 === 'US');
        if (usRelease && usRelease.release_dates && usRelease.release_dates.length > 0) {
          const certification = usRelease.release_dates.find((rd: any) => rd.certification)?.certification;
          if (certification) return certification;
        }

        // Fallback to any certification if US is not available
        for (const country of response.data.results) {
          if (country.release_dates && country.release_dates.length > 0) {
            const certification = country.release_dates.find((rd: any) => rd.certification)?.certification;
            if (certification) return certification;
          }
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get trending movies or TV shows
   * @param type 'movie' or 'tv'
   * @param timeWindow 'day' or 'week'
   */
  async getTrending(type: 'movie' | 'tv', timeWindow: 'day' | 'week'): Promise<TMDBTrendingResult[]> {
    try {
      const response = await axios.get(`${BASE_URL}/trending/${type}/${timeWindow}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
        }),
      });

      // Get external IDs for each trending item
      const results = response.data.results || [];
      const resultsWithExternalIds = await Promise.all(
        results.map(async (item: TMDBTrendingResult) => {
          try {
            const externalIdsResponse = await axios.get(
              `${BASE_URL}/${type}/${item.id}/external_ids`,
              {
                headers: await this.getHeaders(),
                params: await this.getParams(),
              }
            );
            return {
              ...item,
              external_ids: externalIdsResponse.data
            };
          } catch (error) {
            return item;
          }
        })
      );

      return resultsWithExternalIds;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get popular movies or TV shows
   * @param type 'movie' or 'tv'
   * @param page Page number for pagination
   */
  async getPopular(type: 'movie' | 'tv', page: number = 1): Promise<TMDBTrendingResult[]> {
    try {
      const response = await axios.get(`${BASE_URL}/${type}/popular`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
          page,
        }),
      });

      // Get external IDs for each popular item
      const results = response.data.results || [];
      const resultsWithExternalIds = await Promise.all(
        results.map(async (item: TMDBTrendingResult) => {
          try {
            const externalIdsResponse = await axios.get(
              `${BASE_URL}/${type}/${item.id}/external_ids`,
              {
                headers: await this.getHeaders(),
                params: await this.getParams(),
              }
            );
            return {
              ...item,
              external_ids: externalIdsResponse.data
            };
          } catch (error) {
            return item;
          }
        })
      );

      return resultsWithExternalIds;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get upcoming/now playing content
   * @param type 'movie' or 'tv'
   * @param page Page number for pagination
   */
  async getUpcoming(type: 'movie' | 'tv', page: number = 1): Promise<TMDBTrendingResult[]> {
    try {
      // For movies use upcoming, for TV use on_the_air
      const endpoint = type === 'movie' ? 'upcoming' : 'on_the_air';
      
      const response = await axios.get(`${BASE_URL}/${type}/${endpoint}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
          page,
        }),
      });

      // Get external IDs for each upcoming item
      const results = response.data.results || [];
      const resultsWithExternalIds = await Promise.all(
        results.map(async (item: TMDBTrendingResult) => {
          try {
            const externalIdsResponse = await axios.get(
              `${BASE_URL}/${type}/${item.id}/external_ids`,
              {
                headers: await this.getHeaders(),
                params: await this.getParams(),
              }
            );
            return {
              ...item,
              external_ids: externalIdsResponse.data
            };
          } catch (error) {
            return item;
          }
        })
      );

      return resultsWithExternalIds;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get the list of official movie genres from TMDB
   */
  async getMovieGenres(): Promise<{ id: number; name: string }[]> {
    try {
      const response = await axios.get(`${BASE_URL}/genre/movie/list`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
        }),
      });
      return response.data.genres || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get the list of official TV genres from TMDB
   */
  async getTvGenres(): Promise<{ id: number; name: string }[]> {
    try {
      const response = await axios.get(`${BASE_URL}/genre/tv/list`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
        }),
      });
      return response.data.genres || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Discover movies or TV shows by genre
   * @param type 'movie' or 'tv'
   * @param genreName The genre name to filter by
   * @param page Page number for pagination
   */
  async discoverByGenre(type: 'movie' | 'tv', genreName: string, page: number = 1): Promise<TMDBTrendingResult[]> {
    try {
      // First get the genre ID from the name
      const genreList = type === 'movie' 
        ? await this.getMovieGenres() 
        : await this.getTvGenres();
      
      const genre = genreList.find(g => g.name.toLowerCase() === genreName.toLowerCase());
      
      if (!genre) {
        return [];
      }
      
      const response = await axios.get(`${BASE_URL}/discover/${type}`, {
        headers: await this.getHeaders(),
        params: await this.getParams({
          language: 'en-US',
          sort_by: 'popularity.desc',
          include_adult: false,
          include_video: false,
          page,
          with_genres: genre.id.toString(),
          with_original_language: 'en',
        }),
      });

      // Get external IDs for each item
      const results = response.data.results || [];
      const resultsWithExternalIds = await Promise.all(
        results.map(async (item: TMDBTrendingResult) => {
          try {
            const externalIdsResponse = await axios.get(
              `${BASE_URL}/${type}/${item.id}/external_ids`,
              {
                headers: await this.getHeaders(),
                params: await this.getParams(),
              }
            );
            return {
              ...item,
              external_ids: externalIdsResponse.data
            };
          } catch (error) {
            return item;
          }
        })
      );

      return resultsWithExternalIds;
    } catch (error) {
      return [];
    }
  }
}

export const tmdbService = TMDBService.getInstance();
export default tmdbService; 