import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { 
  MDBLIST_API_KEY_STORAGE_KEY,
  MDBLIST_ENABLED_STORAGE_KEY,
  isMDBListEnabled
} from '../screens/MDBListSettingsScreen';

export interface MDBListRatings {
  trakt?: number;
  imdb?: number;
  tmdb?: number;
  letterboxd?: number;
  tomatoes?: number;
  audience?: number;
  metacritic?: number;
}

export class MDBListService {
  private static instance: MDBListService;
  private apiKey: string | null = null;
  private enabled: boolean = true;

  private constructor() {
    logger.log('[MDBListService] Service initialized');
  }

  static getInstance(): MDBListService {
    if (!MDBListService.instance) {
      MDBListService.instance = new MDBListService();
    }
    return MDBListService.instance;
  }

  async initialize(): Promise<void> {
    try {
      // First check if MDBList is enabled
      const enabledSetting = await AsyncStorage.getItem(MDBLIST_ENABLED_STORAGE_KEY);
      this.enabled = enabledSetting === null || enabledSetting === 'true';
      logger.log('[MDBListService] MDBList enabled:', this.enabled);
      
      if (!this.enabled) {
        logger.log('[MDBListService] MDBList is disabled, skipping API key loading');
        this.apiKey = null;
        return;
      }

      this.apiKey = await AsyncStorage.getItem(MDBLIST_API_KEY_STORAGE_KEY);
      logger.log('[MDBListService] Initialized with API key:', this.apiKey ? 'Present' : 'Not found');
    } catch (error) {
      logger.error('[MDBListService] Failed to load settings:', error);
      this.apiKey = null;
      this.enabled = true; // Default to enabled on error
    }
  }

  async getRatings(imdbId: string, mediaType: 'movie' | 'show'): Promise<MDBListRatings | null> {
    logger.log(`[MDBListService] Fetching ratings for ${mediaType} with IMDB ID:`, imdbId);
    
    // Check if MDBList is enabled before doing anything else
    if (!this.enabled) {
      // Try to refresh enabled status in case it was changed
      try {
        const enabledSetting = await AsyncStorage.getItem(MDBLIST_ENABLED_STORAGE_KEY);
        this.enabled = enabledSetting === null || enabledSetting === 'true';
      } catch (error) {
        // Ignore error and keep current state
      }
      
      if (!this.enabled) {
        logger.log('[MDBListService] MDBList is disabled, not fetching ratings');
        return null;
      }
    }
    
    if (!this.apiKey) {
      logger.log('[MDBListService] No API key found, attempting to initialize');
      await this.initialize();
      if (!this.apiKey || !this.enabled) {
        const reason = !this.enabled ? 'MDBList is disabled' : 'No API key found';
        logger.warn(`[MDBListService] ${reason}`);
        return null;
      }
    }

    try {
      const ratings: MDBListRatings = {};
      const ratingTypes = ['trakt', 'imdb', 'tmdb', 'letterboxd', 'tomatoes', 'audience', 'metacritic'];
      logger.log(`[MDBListService] Starting to fetch ${ratingTypes.length} different rating types in parallel`);

      const formattedImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
      if (!/^tt\d+$/.test(formattedImdbId)) {
        logger.error('[MDBListService] Invalid IMDB ID format:', formattedImdbId);
        return null;
      }
      logger.log(`[MDBListService] Using formatted IMDB ID:`, formattedImdbId);

      // Create an array of fetch promises
      const fetchPromises = ratingTypes.map(async (ratingType) => {
        try {
          // API Key in URL query parameter
          const url = `https://api.mdblist.com/rating/${mediaType}/${ratingType}?apikey=${this.apiKey}`;
          logger.log(`[MDBListService] Fetching ${ratingType} rating from:`, url);
          
          // Body contains only ids and provider
          const body = {
            ids: [formattedImdbId],
            provider: 'imdb'
          };
          
          logger.log(`[MDBListService] Request body:`, body);

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
          });

          logger.log(`[MDBListService] ${ratingType} response status:`, response.status);

          if (response.ok) {
            const data = await response.json();
            logger.log(`[MDBListService] ${ratingType} response data:`, data);
            
            if (data.ratings?.[0]?.rating) {
              ratings[ratingType as keyof MDBListRatings] = data.ratings[0].rating;
              logger.log(`[MDBListService] Added ${ratingType} rating:`, data.ratings[0].rating);
              return { type: ratingType, rating: data.ratings[0].rating };
            } else {
              logger.warn(`[MDBListService] No ${ratingType} rating found in response`);
              return null;
            }
          } else {
            // Log specific error for invalid API key
            if (response.status === 403) {
               const errorText = await response.text();
               try {
                 const errorJson = JSON.parse(errorText);
                 if (errorJson.error === "Invalid API key") {
                    logger.error('[MDBListService] API Key rejected by server:', this.apiKey);
                 } else {
                   logger.warn(`[MDBListService] 403 Forbidden, but not invalid key error:`, errorJson);
                 }
               } catch (parseError) {
                  logger.warn(`[MDBListService] 403 Forbidden, non-JSON response:`, errorText);
               }
            } else {
              logger.warn(`[MDBListService] Failed to fetch ${ratingType} rating. Status:`, response.status);
              const errorText = await response.text();
              logger.warn(`[MDBListService] Error response:`, errorText);
            }
            return null;
          }
        } catch (error) {
          logger.error(`[MDBListService] Error fetching ${ratingType} rating:`, error);
          return null;
        }
      });

      // Execute all fetch promises in parallel
      const results = await Promise.all(fetchPromises);
      
      // Process results
      results.forEach(result => {
        if (result) {
          ratings[result.type as keyof MDBListRatings] = result.rating;
        }
      });

      const ratingCount = Object.keys(ratings).length;
      logger.log(`[MDBListService] Fetched ${ratingCount} ratings successfully:`, ratings);
      return ratingCount > 0 ? ratings : null;
    } catch (error) {
      logger.error('[MDBListService] Error fetching MDBList ratings:', error);
      return null;
    }
  }
}

export const mdblistService = MDBListService.getInstance();
