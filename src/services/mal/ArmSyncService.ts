import axios from 'axios';
import { logger } from '../../utils/logger';

interface ArmEntry {
  anidb?: number;
  anilist?: number;
  'anime-planet'?: string;
  anisearch?: number;
  imdb?: string;
  kitsu?: number;
  livechart?: number;
  'notify-moe'?: string;
  themoviedb?: number;
  thetvdb?: number;
  myanimelist?: number;
}

interface DateSyncResult {
  malId: number;
  episode: number;
  title?: string;
}

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const ARM_BASE = 'https://arm.haglund.dev/api/v2';

export const ArmSyncService = {
  /**
   * Resolves the correct MyAnimeList ID and Episode Number using ARM (for ID mapping)
   * and Jikan (for Air Date matching).
   * 
   * @param imdbId The IMDb ID of the show
   * @param releaseDateStr The air date of the episode (YYYY-MM-DD)
   * @returns {Promise<DateSyncResult | null>} The resolved MAL ID and Episode number
   */
  resolveByDate: async (imdbId: string, releaseDateStr: string): Promise<DateSyncResult | null> => {
    try {
      // Basic validation: ensure date is in YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}/.test(releaseDateStr)) {
        logger.warn(`[ArmSync] Invalid date format provided: ${releaseDateStr}`);
        return null;
      }

      logger.log(`[ArmSync] Resolving ${imdbId} for date ${releaseDateStr}...`);

      // 1. Fetch Candidates from ARM
      const armRes = await axios.get<ArmEntry[]>(`${ARM_BASE}/imdb`, {
        params: { id: imdbId }
      });
      
      const malIds = armRes.data
        .map(entry => entry.myanimelist)
        .filter((id): id is number => !!id);

      if (malIds.length === 0) {
        logger.warn(`[ArmSync] No MAL IDs found in ARM for ${imdbId}`);
        return null;
      }

      logger.log(`[ArmSync] Found candidates: ${malIds.join(', ')}`);

      // 2. Validate Candidates via Jikan Dates
      // Helper to delay (Jikan Rate Limit: 3 req/sec)
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      for (const malId of malIds) {
        await delay(500); // Respect rate limits
        try {
          const detailsRes = await axios.get(`${JIKAN_BASE}/anime/${malId}`);
          const anime = detailsRes.data.data;
          
          const startDateStr = anime.aired?.from ? new Date(anime.aired.from).toISOString().split('T')[0] : null;
          const endDateStr = anime.aired?.to ? new Date(anime.aired.to).toISOString().split('T')[0] : null;

          // Date Matching Logic with Timezone Tolerance (2 days)
          let isMatch = false;
          if (startDateStr) {
            const startLimit = new Date(startDateStr);
            startLimit.setDate(startLimit.getDate() - 2); // Allow release date to be up to 2 days before official start
            const startLimitStr = startLimit.toISOString().split('T')[0];

            // Check if our episode date is >= Season Start Date (with tolerance)
            if (releaseDateStr >= startLimitStr) {
              // If season has ended, our episode must be <= Season End Date
              if (!endDateStr || releaseDateStr <= endDateStr) {
                isMatch = true;
              }
            }
          }

          if (isMatch) {
            logger.log(`[ArmSync] Match found! ID ${malId} covers ${releaseDateStr}`);
            
            // 3. Find Exact Episode (with tolerance)
            await delay(500);
            const epsRes = await axios.get(`${JIKAN_BASE}/anime/${malId}/episodes`);
            const episodes = epsRes.data.data;
            
            const matchEp = episodes.find((ep: any) => {
              if (!ep.aired) return false;
              try {
                const epDate = new Date(ep.aired);
                const targetDate = new Date(releaseDateStr);
                
                // Calculate difference in days
                const diffTime = Math.abs(targetDate.getTime() - epDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                // Match if within 2 days (48 hours)
                return diffDays <= 2;
              } catch (e) {
                return false;
              }
            });

            if (matchEp) {
              logger.log(`[ArmSync] Episode resolved: #${matchEp.mal_id} (${matchEp.title})`);
              return {
                malId,
                episode: matchEp.mal_id,
                title: matchEp.title
              };
            }
          }
        } catch (e) {
          logger.warn(`[ArmSync] Failed to check candidate ${malId}:`, e);
        }
      }

    } catch (e) {
      logger.error('[ArmSync] Resolution failed:', e);
    }
    return null;
  }
};
