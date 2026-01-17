import axios from 'axios';
import { AniListResponse, AniListAiringSchedule } from './types';
import { logger } from '../../utils/logger';

const ANILIST_API_URL = 'https://graphql.anilist.co';

const AIRING_SCHEDULE_QUERY = `
query ($start: Int, $end: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
      total
    }
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      id
      airingAt
      episode
      media {
        id
        idMal
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          medium
          color
        }
        episodes
        format
        status
        season
        seasonYear
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
      }
    }
  }
}
`;

export const AniListService = {
  getWeeklySchedule: async (): Promise<AniListAiringSchedule[]> => {
    try {
      const start = Math.floor(Date.now() / 1000);
      const end = start + 7 * 24 * 60 * 60; // Next 7 days

      let allSchedules: AniListAiringSchedule[] = [];
      let page = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await axios.post<AniListResponse>(ANILIST_API_URL, {
          query: AIRING_SCHEDULE_QUERY,
          variables: {
            start,
            end,
            page,
          },
        });

        const data = response.data.data.Page;
        allSchedules = [...allSchedules, ...data.airingSchedules];
        
        hasNextPage = data.pageInfo.hasNextPage;
        page++;

        // Safety break to prevent infinite loops if something goes wrong
        if (page > 10) break;
      }

      return allSchedules;
    } catch (error) {
      logger.error('[AniListService] Failed to fetch weekly schedule:', error);
      throw error;
    }
  },
};
