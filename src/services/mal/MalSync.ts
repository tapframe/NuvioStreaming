import { mmkvStorage } from '../mmkvStorage';
import { MalApiService } from './MalApi';
import { MalListStatus } from '../../types/mal';
import { catalogService } from '../catalogService';
import axios from 'axios';

const MAPPING_PREFIX = 'mal_map_';

export const MalSync = {
  /**
   * Tries to find a MAL ID using IMDb ID via MAL-Sync API.
   */
  getMalIdFromImdb: async (imdbId: string): Promise<number | null> => {
    if (!imdbId) return null;
    
    // 1. Check Cache
    const cacheKey = `${MAPPING_PREFIX}imdb_${imdbId}`;
    const cachedId = mmkvStorage.getNumber(cacheKey);
    if (cachedId) return cachedId;

    // 2. Fetch from MAL-Sync API
    try {
      // Ensure ID format
      const cleanId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
      const response = await axios.get(`https://api.malsync.moe/mal/anime/imdb/${cleanId}`);
      
      if (response.data && response.data.id) {
        const malId = response.data.id;
        // Save to cache
        mmkvStorage.setNumber(cacheKey, malId);
        return malId;
      }
    } catch (e) {
      // Ignore errors (404, etc.)
    }
    return null;
  },

  /**
   * Tries to find a MAL ID for a given anime title or IMDb ID.
   * Caches the result to avoid repeated API calls.
   */
  getMalId: async (title: string, type: 'movie' | 'series' = 'series', year?: number, season?: number, imdbId?: string): Promise<number | null> => {
    // 1. Try IMDb ID first (Most accurate) - BUT only for Season 1 or Movies.
    // For Season 2+, IMDb usually points to the main series (S1), while MAL has separate entries.
    // So we force a search for S2+ to find the specific "Season X" entry.
    if (imdbId && (type === 'movie' || !season || season === 1)) {
        const idFromImdb = await MalSync.getMalIdFromImdb(imdbId);
        if (idFromImdb) return idFromImdb;
    }

    // 2. Check Cache for Title
    const cleanTitle = title.trim();
    const cacheKey = `${MAPPING_PREFIX}${cleanTitle}_${type}_${season || 1}`;
    const cachedId = mmkvStorage.getNumber(cacheKey);
    if (cachedId) return cachedId;

    // 3. Search MAL
    try {
      let searchQuery = cleanTitle;
      // For Season 2+, explicitly search for that season
      if (type === 'series' && season && season > 1) {
          // Improve search query: "Attack on Titan Season 2" usually works better than just appending
          searchQuery = `${cleanTitle} Season ${season}`;
      }

      const result = await MalApiService.searchAnime(searchQuery, 10);
      if (result.data.length > 0) {
        let candidates = result.data;

        // Filter by type first
        if (type === 'movie') {
            candidates = candidates.filter(r => r.node.media_type === 'movie');
        } else {
            candidates = candidates.filter(r => r.node.media_type === 'tv' || r.node.media_type === 'ona' || r.node.media_type === 'special' || r.node.media_type === 'ova');
        }

        if (candidates.length === 0) candidates = result.data; // Fallback to all if type filtering removes everything

        let bestMatch = candidates[0].node;

        // If year is provided, try to find an exact start year match
        if (year) {
            const yearMatch = candidates.find(r => r.node.start_season?.year === year);
            if (yearMatch) {
                bestMatch = yearMatch.node;
            } else {
                // Fuzzy year match (+/- 1 year)
                const fuzzyMatch = candidates.find(r => r.node.start_season?.year && Math.abs(r.node.start_season.year - year) <= 1);
                if (fuzzyMatch) bestMatch = fuzzyMatch.node;
            }
        }

        // Save to cache
        mmkvStorage.setNumber(cacheKey, bestMatch.id);
        return bestMatch.id;
      }
    } catch (e) {
      console.warn('MAL Search failed for', title);
    }
    return null;
  },

  /**
   * Main function to track progress
   */
  scrobbleEpisode: async (
    animeTitle: string,
    episodeNumber: number,
    totalEpisodes: number = 0,
    type: 'movie' | 'series' = 'series',
    season?: number,
    imdbId?: string
  ) => {
    try {
      const malId = await MalSync.getMalId(animeTitle, type, undefined, season, imdbId);
      if (!malId) return;

      let finalTotalEpisodes = totalEpisodes;

      // If totalEpisodes not provided, try to fetch it from MAL details
      if (finalTotalEpisodes <= 0) {
        try {
          const details = await MalApiService.getAnimeDetails(malId);
          if (details && details.num_episodes) {
            finalTotalEpisodes = details.num_episodes;
          }
        } catch (e) {
          // Fallback to 0 if details fetch fails
        }
      }

      // Determine Status
      let status: MalListStatus = 'watching';
      if (finalTotalEpisodes > 0 && episodeNumber >= finalTotalEpisodes) {
        status = 'completed';
      }

      await MalApiService.updateStatus(malId, status, episodeNumber);
      console.log(`[MalSync] Synced ${animeTitle} Ep ${episodeNumber}/${finalTotalEpisodes || '?'} -> MAL ID ${malId} (${status})`);
    } catch (e) {
      console.error('[MalSync] Scrobble failed:', e);
    }
  },

  /**
   * Import MAL list items into local library
   */
  syncMalToLibrary: async () => {
      try {
          const list = await MalApiService.getUserList();
          const watching = list.data.filter(item => item.list_status.status === 'watching' || item.list_status.status === 'plan_to_watch');
          
          for (const item of watching) {
              // Try to find in local catalogs to get a proper StreamingContent object
              // This is complex because we need to map MAL -> Stremio/TMDB.
              // For now, we'll just cache the mapping for future use.
              const type = item.node.media_type === 'movie' ? 'movie' : 'series';
              const cacheKey = `${MAPPING_PREFIX}${item.node.title.trim()}_${type}`;
              mmkvStorage.setNumber(cacheKey, item.node.id);
          }
          return true;
      } catch (e) {
          console.error('syncMalToLibrary failed', e);
          return false;
      }
  },

  /**
   * Manually map an ID if auto-detection fails
   */
  setMapping: (title: string, malId: number, type: 'movie' | 'series' = 'series') => {
      const cacheKey = `${MAPPING_PREFIX}${title.trim()}_${type}`;
      mmkvStorage.setNumber(cacheKey, malId);
  },

  /**
   * Get external IDs (IMDb, etc.) and season info from a MAL ID using MalSync API
   */
  getIdsFromMalId: async (malId: number): Promise<{ imdbId: string | null; season: number }> => {
      const cacheKey = `mal_ext_ids_v2_${malId}`;
      const cached = mmkvStorage.getString(cacheKey);
      if (cached) {
          return JSON.parse(cached);
      }

      try {
          const response = await axios.get(`https://api.malsync.moe/mal/anime/${malId}`);
          const data = response.data;
          
          let imdbId = null;
          let season = data.season || 1;

          // Try to find IMDb ID in Sites
          if (data.Sites && data.Sites.IMDB) {
              const imdbKeys = Object.keys(data.Sites.IMDB);
              if (imdbKeys.length > 0) {
                  imdbId = imdbKeys[0];
              }
          }

          const result = { imdbId, season };
          mmkvStorage.setString(cacheKey, JSON.stringify(result));
          return result;
      } catch (e) {
          console.error('[MalSync] Failed to fetch external IDs:', e);
      }
      return { imdbId: null, season: 1 };
  },

  /**
   * Get weekly anime schedule from Jikan API (Adjusted to Local Timezone)
   */
  getWeeklySchedule: async (): Promise<any[]> => {
      const cacheKey = 'mal_weekly_schedule_local_v2'; // Bump version for new format
      const cached = mmkvStorage.getString(cacheKey);
      const cacheTime = mmkvStorage.getNumber(`${cacheKey}_time`);
      
      // Cache for 24 hours
      if (cached && cacheTime && (Date.now() - cacheTime < 24 * 60 * 60 * 1000)) {
          return JSON.parse(cached);
      }

      try {
          // Jikan API rate limit mitigation
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const response = await axios.get('https://api.jikan.moe/v4/schedules');
          const data = response.data.data;

          const daysOrder = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
          const dayMap: Record<string, number> = { 'Mondays': 0, 'Tuesdays': 1, 'Wednesdays': 2, 'Thursdays': 3, 'Fridays': 4, 'Saturdays': 5, 'Sundays': 6 };
          const daysReverse = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
          
          const grouped: Record<string, any[]> = {};

          // Calculate time difference in minutes: Local - JST (UTC+9)
          // getTimezoneOffset() returns minutes BEHIND UTC (positive for US, negative for Asia)
          // We want Local - UTC+9. 
          // Local = UTC - offset.
          // Diff = (UTC - localOffset) - (UTC + 540) = -localOffset - 540.
          const jstOffset = 540; // UTC+9 in minutes
          const localOffset = new Date().getTimezoneOffset(); // e.g. 300 for EST (UTC-5)
          const offsetMinutes = -localOffset - jstOffset; // e.g. -300 - 540 = -840 minutes (-14h)

          data.forEach((anime: any) => {
              let day = anime.broadcast?.day; // "Mondays"
              let time = anime.broadcast?.time; // "23:00"
              let originalDay = day;

              // Adjust to local time
              if (day && time && dayMap[day] !== undefined) {
                  const [hours, mins] = time.split(':').map(Number);
                  let totalMinutes = hours * 60 + mins + offsetMinutes;
                  
                  let dayShift = 0;
                  // Handle day rollovers
                  if (totalMinutes < 0) {
                      totalMinutes += 24 * 60;
                      dayShift = -1;
                  } else if (totalMinutes >= 24 * 60) {
                      totalMinutes -= 24 * 60;
                      dayShift = 1;
                  }

                  const newHour = Math.floor(totalMinutes / 60);
                  const newMin = totalMinutes % 60;
                  time = `${String(newHour).padStart(2,'0')}:${String(newMin).padStart(2,'0')}`;
                  
                  let dayIndex = dayMap[day] + dayShift;
                  if (dayIndex < 0) dayIndex = 6;
                  if (dayIndex > 6) dayIndex = 0;
                  day = daysReverse[dayIndex];
              } else {
                  day = 'Other'; // No specific time/day
              }
              
              if (!grouped[day]) grouped[day] = [];
              
              grouped[day].push({
                  id: `mal:${anime.mal_id}`,
                  seriesId: `mal:${anime.mal_id}`,
                  title: anime.title,
                  seriesName: anime.title_english || anime.title,
                  poster: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
                  releaseDate: null, 
                  season: 1, 
                  episode: 1, 
                  overview: anime.synopsis,
                  vote_average: anime.score,
                  day: day,
                  time: time,
                  genres: anime.genres?.map((g: any) => g.name) || [],
                  originalDay: originalDay // Keep for debug if needed
              });
          });

          // Sort by day (starting Monday or Today?) -> Standard is Monday start for anime
          // Sort items by time within day
          const result = [...daysOrder, 'Other']
              .filter(day => grouped[day] && grouped[day].length > 0)
              .map(day => ({
                  title: day,
                  data: grouped[day].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
              }));

          mmkvStorage.setString(cacheKey, JSON.stringify(result));
          mmkvStorage.setNumber(`${cacheKey}_time`, Date.now());
          
          return result;
      } catch (e) {
          console.error('[MalSync] Failed to fetch schedule:', e);
          return [];
      }
  }
};

