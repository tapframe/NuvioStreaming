import axios from 'axios';
import { MalAuth } from './MalAuth';
import { MalAnimeNode, MalListStatus, MalUserListResponse, MalSearchResult, MalUser } from '../../types/mal';

const CLIENT_ID = '4631b11b52008b79c9a05d63996fc5f8';

const api = axios.create({
  baseURL: 'https://api.myanimelist.net/v2',
  headers: {
    'X-MAL-CLIENT-ID': CLIENT_ID,
  },
});

api.interceptors.request.use(async (config) => {
  const token = MalAuth.getToken();
  if (token) {
    if (MalAuth.isTokenExpired(token)) {
      const refreshed = await MalAuth.refreshToken();
      if (refreshed) {
        const newToken = MalAuth.getToken();
        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken.accessToken}`;
        }
      }
    } else {
      config.headers.Authorization = `Bearer ${token.accessToken}`;
    }
  }
  return config;
});

export const MalApiService = {
  getUserList: async (status?: MalListStatus, offset = 0, limit = 100): Promise<MalUserListResponse> => {
    try {
      const response = await api.get('/users/@me/animelist', {
        params: {
          status,
          fields: 'list_status{score,num_episodes_watched,status},num_episodes,media_type,start_season',
          limit,
          offset,
          sort: 'list_updated_at',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch MAL user list', error);
      throw error;
    }
  },

  searchAnime: async (query: string, limit = 5): Promise<MalSearchResult> => {
    try {
      const response = await api.get('/anime', {
        params: { q: query, limit },
      });
      return response.data;
    } catch (error) {
      console.error('Failed to search MAL anime', error);
      throw error;
    }
  },

  updateStatus: async (
    malId: number, 
    status: MalListStatus, 
    episode: number,
    score?: number
  ) => {
    const data: any = {
      status,
      num_watched_episodes: episode,
    };
    if (score && score > 0) data.score = score;

    return api.put(`/anime/${malId}/my_list_status`, new URLSearchParams(data).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  },

  getAnimeDetails: async (malId: number) => {
     try {
        const response = await api.get(`/anime/${malId}`, {
            params: { fields: 'id,title,main_picture,num_episodes,start_season,media_type' }
        });
        return response.data;
     } catch (error) {
         console.error('Failed to get anime details', error);
         throw error;
     }
  },

  getUserInfo: async (): Promise<MalUser> => {
      try {
          const response = await api.get('/users/@me');
          return response.data;
      } catch (error) {
          console.error('Failed to get user info', error);
          throw error;
      }
  },

  getMyListStatus: async (malId: number): Promise<{ list_status?: any; num_episodes: number }> => {
      try {
          const response = await api.get(`/anime/${malId}`, {
              params: { fields: 'my_list_status,num_episodes' }
          });
          return response.data;
      } catch (error) {
          console.error('Failed to get my list status', error);
          return { num_episodes: 0 };
      }
  }
};
