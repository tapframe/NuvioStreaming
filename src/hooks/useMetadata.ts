import { useState, useEffect, useCallback } from 'react';
import { StreamingContent } from '../services/catalogService';
import { catalogService } from '../services/catalogService';
import { stremioService } from '../services/stremioService';
import { tmdbService } from '../services/tmdbService';
import { cacheService } from '../services/cacheService';
import { Cast, Episode, GroupedEpisodes, GroupedStreams } from '../types/metadata';
import { TMDBService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import { usePersistentSeasons } from './usePersistentSeasons';

// Constants for timeouts and retries
const API_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

// Utility function to add timeout to promises
const withTimeout = <T>(promise: Promise<T>, timeout: number, fallback?: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve, reject) => 
      setTimeout(() => fallback ? resolve(fallback) : reject(new Error('Request timed out')), timeout)
    )
  ]);
};

// Utility function for parallel loading with fallback
const loadWithFallback = async <T>(
  loadFn: () => Promise<T>,
  fallback: T,
  timeout: number = API_TIMEOUT
): Promise<T> => {
  try {
    return await withTimeout(loadFn(), timeout, fallback);
  } catch (error) {
    logger.error('Loading failed, using fallback:', error);
    return fallback;
  }
};

// Utility function to retry failed requests
const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay);
  }
};

interface UseMetadataProps {
  id: string;
  type: string;
}

interface UseMetadataReturn {
  metadata: StreamingContent | null;
  loading: boolean;
  error: string | null;
  cast: Cast[];
  loadingCast: boolean;
  episodes: Episode[];
  groupedEpisodes: GroupedEpisodes;
  selectedSeason: number;
  tmdbId: number | null;
  loadingSeasons: boolean;
  groupedStreams: GroupedStreams;
  loadingStreams: boolean;
  episodeStreams: GroupedStreams;
  loadingEpisodeStreams: boolean;
  preloadedStreams: GroupedStreams;
  preloadedEpisodeStreams: { [episodeId: string]: GroupedStreams };
  selectedEpisode: string | null;
  inLibrary: boolean;
  loadMetadata: () => Promise<void>;
  loadStreams: () => Promise<void>;
  loadEpisodeStreams: (episodeId: string) => Promise<void>;
  handleSeasonChange: (seasonNumber: number) => void;
  toggleLibrary: () => void;
  setSelectedEpisode: (episodeId: string | null) => void;
  setEpisodeStreams: (streams: GroupedStreams) => void;
  recommendations: StreamingContent[];
  loadingRecommendations: boolean;
  setMetadata: React.Dispatch<React.SetStateAction<StreamingContent | null>>;
  imdbId: string | null;
}

export const useMetadata = ({ id, type }: UseMetadataProps): UseMetadataReturn => {
  const [metadata, setMetadata] = useState<StreamingContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cast, setCast] = useState<Cast[]>([]);
  const [loadingCast, setLoadingCast] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [groupedEpisodes, setGroupedEpisodes] = useState<GroupedEpisodes>({});
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [tmdbId, setTmdbId] = useState<number | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [groupedStreams, setGroupedStreams] = useState<GroupedStreams>({});
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [episodeStreams, setEpisodeStreams] = useState<GroupedStreams>({});
  const [loadingEpisodeStreams, setLoadingEpisodeStreams] = useState(false);
  const [preloadedStreams, setPreloadedStreams] = useState<GroupedStreams>({});
  const [preloadedEpisodeStreams, setPreloadedEpisodeStreams] = useState<{ [episodeId: string]: GroupedStreams }>({});
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);
  const [inLibrary, setInLibrary] = useState(false);
  const [loadAttempts, setLoadAttempts] = useState(0);
  const [recommendations, setRecommendations] = useState<StreamingContent[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [imdbId, setImdbId] = useState<string | null>(null);

  // Add hook for persistent seasons
  const { getSeason, saveSeason } = usePersistentSeasons();

  const processStremioSource = async (type: string, id: string, isEpisode = false) => {
    const sourceStartTime = Date.now();
    const logPrefix = isEpisode ? 'loadEpisodeStreams' : 'loadStreams';
    const sourceName = 'stremio';
    
    logger.log(`🔍 [${logPrefix}:${sourceName}] Starting fetch`);

    try {
      await stremioService.getStreams(type, id, 
        (streams, addonId, addonName, error) => {
          const processTime = Date.now() - sourceStartTime;
          if (error) {
            logger.error(`❌ [${logPrefix}:${sourceName}] Error for addon ${addonName} (${addonId}):`, error);
            // Optionally update state to show error for this specific addon?
            // For now, just log the error.
          } else if (streams && addonId && addonName) {
            logger.log(`✅ [${logPrefix}:${sourceName}] Received ${streams.length} streams from ${addonName} (${addonId}) after ${processTime}ms`);
            
            if (streams.length > 0) {
              // Use the streams directly as they are already processed by stremioService
              const updateState = (prevState: GroupedStreams): GroupedStreams => {
                 logger.log(`🔄 [${logPrefix}:${sourceName}] Updating state for addon ${addonName} (${addonId})`);
                 return {
                   ...prevState,
                   [addonId]: {
                     addonName: addonName,
                     streams: streams // Use the received streams directly
                   }
                 };
              };
              
              if (isEpisode) {
                setEpisodeStreams(updateState);
              } else {
                setGroupedStreams(updateState);
              }
            } else {
               logger.log(`🤷 [${logPrefix}:${sourceName}] No streams found for addon ${addonName} (${addonId})`);
            }
          } else {
            // Handle case where callback provides null streams without error (e.g., empty results)
            logger.log(`🏁 [${logPrefix}:${sourceName}] Finished fetching for addon ${addonName} (${addonId}) with no streams after ${processTime}ms`);
          }
        }
      );
      // The function now returns void, just await to let callbacks fire
      logger.log(`🏁 [${logPrefix}:${sourceName}] Stremio fetching process initiated`);
    } catch (error) {
       // Catch errors from the initial call to getStreams (e.g., initialization errors)
       logger.error(`❌ [${logPrefix}:${sourceName}] Initial call failed:`, error);
       // Maybe update state to show a general Stremio error?
    }
    // Note: This function completes when getStreams returns, not when all callbacks have fired.
    // Loading indicators should probably be managed based on callbacks completing.
  };

  const processExternalSource = async (sourceType: string, promise: Promise<any>, isEpisode = false) => {
    const sourceStartTime = Date.now();
    const logPrefix = isEpisode ? 'loadEpisodeStreams' : 'loadStreams';
    
    try {
      logger.log(`🔍 [${logPrefix}:${sourceType}] Starting fetch`);
      const result = await promise;
      logger.log(`✅ [${logPrefix}:${sourceType}] Completed in ${Date.now() - sourceStartTime}ms`);
      
      if (Object.keys(result).length > 0) {
        const totalStreams = Object.values(result).reduce((acc, group: any) => acc + (group.streams?.length || 0), 0);
        logger.log(`📦 [${logPrefix}:${sourceType}] Found ${totalStreams} streams`);
        
        const updateState = (prevState: GroupedStreams) => {
          logger.log(`🔄 [${logPrefix}:${sourceType}] Updating state with ${Object.keys(result).length} providers`);
          return { ...prevState, ...result };
        };

        if (isEpisode) {
          setEpisodeStreams(updateState);
        } else {
          setGroupedStreams(updateState);
        }
      } else {
        logger.log(`⚠️ [${logPrefix}:${sourceType}] No streams found`);
      }
      return result;
    } catch (error) {
      logger.error(`❌ [${logPrefix}:${sourceType}] Error:`, error);
      return {};
    }
  };

  const loadCast = async () => {
    setLoadingCast(true);
    try {
      // Handle TMDB IDs
      let metadataId = id;
      let metadataType = type;
      
      if (id.startsWith('tmdb:')) {
        const extractedTmdbId = id.split(':')[1];
        logger.log('[loadCast] Using extracted TMDB ID:', extractedTmdbId);
        
        // For TMDB IDs, we'll use the TMDB API directly
        const castData = await tmdbService.getCredits(parseInt(extractedTmdbId), type);
        if (castData && castData.cast) {
          const formattedCast = castData.cast.map((actor: any) => ({
            id: actor.id,
            name: actor.name,
            character: actor.character,
            profile_path: actor.profile_path
          }));
          setCast(formattedCast);
          setLoadingCast(false);
          return formattedCast;
        }
        setLoadingCast(false);
        return [];
      }
      
      // Continue with the existing logic for non-TMDB IDs
      const cachedCast = cacheService.getCast(id, type);
      if (cachedCast) {
        setCast(cachedCast);
        setLoadingCast(false);
        return;
      }

      // Load cast in parallel with a fallback to empty array
      const castLoadingPromise = loadWithFallback(async () => {
        const tmdbId = await withTimeout(
          tmdbService.findTMDBIdByIMDB(id),
          API_TIMEOUT
        );
        
        if (tmdbId) {
          const castData = await withTimeout(
            tmdbService.getCredits(tmdbId, type),
            API_TIMEOUT,
            { cast: [], crew: [] }
          );
          
          if (castData.cast && castData.cast.length > 0) {
            setCast(castData.cast);
            cacheService.setCast(id, type, castData.cast);
            return castData.cast;
          }
        }
        return [];
      }, []);

      await castLoadingPromise;
    } catch (error) {
      console.error('Failed to load cast:', error);
      setCast([]);
    } finally {
      setLoadingCast(false);
    }
  };

  const loadMetadata = async () => {
    try {
      if (loadAttempts >= MAX_RETRIES) {
        setError('Failed to load content after multiple attempts');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setLoadAttempts(prev => prev + 1);

      // Check metadata screen cache
      const cachedScreen = cacheService.getMetadataScreen(id, type);
      if (cachedScreen) {
        setMetadata(cachedScreen.metadata);
        setCast(cachedScreen.cast);
        if (type === 'series' && cachedScreen.episodes) {
          setGroupedEpisodes(cachedScreen.episodes.groupedEpisodes);
          setEpisodes(cachedScreen.episodes.currentEpisodes);
          setSelectedSeason(cachedScreen.episodes.selectedSeason);
          setTmdbId(cachedScreen.tmdbId);
        }
        // Check if item is in library
        const isInLib = catalogService.getLibraryItems().some(item => item.id === id);
        setInLibrary(isInLib);
        setLoading(false);
        return;
      }

      // Handle TMDB-specific IDs
      let actualId = id;
      if (id.startsWith('tmdb:')) {
        const tmdbId = id.split(':')[1];
        // For TMDB IDs, we need to handle metadata differently
        if (type === 'movie') {
          logger.log('Fetching movie details from TMDB for:', tmdbId);
          const movieDetails = await tmdbService.getMovieDetails(tmdbId);
          if (movieDetails) {
            const imdbId = movieDetails.imdb_id || movieDetails.external_ids?.imdb_id;
            if (imdbId) {
              // Use the imdbId for compatibility with the rest of the app
              actualId = imdbId;
              setImdbId(imdbId);
              // Also store the TMDB ID for later use
              setTmdbId(parseInt(tmdbId));
            } else {
              // If no IMDb ID, directly call loadTMDBMovie (create this function if needed)
              const formattedMovie: StreamingContent = {
                id: `tmdb:${tmdbId}`,
                type: 'movie',
                name: movieDetails.title,
                poster: tmdbService.getImageUrl(movieDetails.poster_path) || '',
                banner: tmdbService.getImageUrl(movieDetails.backdrop_path) || '',
                description: movieDetails.overview || '',
                year: movieDetails.release_date ? parseInt(movieDetails.release_date.substring(0, 4)) : undefined,
                genres: movieDetails.genres?.map((g: { name: string }) => g.name) || [],
                inLibrary: false,
              };
              
              // Fetch credits to get director and crew information
              try {
                const credits = await tmdbService.getCredits(parseInt(tmdbId), 'movie');
                if (credits && credits.crew) {
                  // Extract directors
                  const directors = credits.crew
                    .filter((person: any) => person.job === 'Director')
                    .map((person: any) => person.name);
                    
                  // Extract creators/writers
                  const writers = credits.crew
                    .filter((person: any) => ['Writer', 'Screenplay'].includes(person.job))
                    .map((person: any) => person.name);
                  
                  // Add to formatted movie
                  if (directors.length > 0) {
                    (formattedMovie as any).directors = directors;
                    (formattedMovie as StreamingContent & { director: string }).director = directors.join(', ');
                  }
                  
                  if (writers.length > 0) {
                    (formattedMovie as any).creators = writers;
                    (formattedMovie as StreamingContent & { writer: string }).writer = writers.join(', ');
                  }
                }
              } catch (error) {
                logger.error('Failed to fetch credits for movie:', error);
              }
              
              setMetadata(formattedMovie);
              cacheService.setMetadata(id, type, formattedMovie);
              const isInLib = catalogService.getLibraryItems().some(item => item.id === id);
              setInLibrary(isInLib);
              setLoading(false);
              return; 
            }
          }
        } else if (type === 'series') {
          // Handle TV shows with TMDB IDs
          logger.log('Fetching TV show details from TMDB for:', tmdbId);
          try {
            const showDetails = await tmdbService.getTVShowDetails(parseInt(tmdbId));
            if (showDetails) {
              // Get external IDs to check for IMDb ID
              const externalIds = await tmdbService.getShowExternalIds(parseInt(tmdbId));
              const imdbId = externalIds?.imdb_id;
              
              if (imdbId) {
                // Use the imdbId for compatibility with the rest of the app
                actualId = imdbId;
                setImdbId(imdbId);
                // Also store the TMDB ID for later use
                setTmdbId(parseInt(tmdbId));
              } else {
                // If no IMDb ID, create formatted show from TMDB data
                const formattedShow: StreamingContent = {
                  id: `tmdb:${tmdbId}`,
                  type: 'series',
                  name: showDetails.name,
                  poster: tmdbService.getImageUrl(showDetails.poster_path) || '',
                  banner: tmdbService.getImageUrl(showDetails.backdrop_path) || '',
                  description: showDetails.overview || '',
                  year: showDetails.first_air_date ? parseInt(showDetails.first_air_date.substring(0, 4)) : undefined,
                  genres: showDetails.genres?.map((g: { name: string }) => g.name) || [],
                  inLibrary: false,
                };
                
                // Fetch credits to get creators
                try {
                  const credits = await tmdbService.getCredits(parseInt(tmdbId), 'series');
                  if (credits && credits.crew) {
                    // Extract creators
                    const creators = credits.crew
                      .filter((person: any) => 
                        person.job === 'Creator' || 
                        person.job === 'Series Creator' ||
                        person.department === 'Production' || 
                        person.job === 'Executive Producer'
                      )
                      .map((person: any) => person.name);
                    
                    if (creators.length > 0) {
                      (formattedShow as any).creators = creators.slice(0, 3);
                    }
                  }
                } catch (error) {
                  logger.error('Failed to fetch credits for TV show:', error);
                }
                
                // Fetch TV show logo from TMDB
                try {
                  const logoUrl = await tmdbService.getTvShowImages(tmdbId);
                  if (logoUrl) {
                    formattedShow.logo = logoUrl;
                    logger.log(`Successfully fetched logo for TV show ${tmdbId} from TMDB`);
                  }
                } catch (error) {
                  logger.error('Failed to fetch logo from TMDB:', error);
                  // Continue with execution, logo is optional
                }
                
                setMetadata(formattedShow);
                cacheService.setMetadata(id, type, formattedShow);
                
                // Load series data (episodes)
                setTmdbId(parseInt(tmdbId));
                loadSeriesData().catch(console.error);
                
                const isInLib = catalogService.getLibraryItems().some(item => item.id === id);
                setInLibrary(isInLib);
                setLoading(false);
                return;
              }
            }
          } catch (error) {
            logger.error('Failed to fetch TV show details from TMDB:', error);
          }
        }
      }

      // Load all data in parallel
      const [content, castData] = await Promise.allSettled([
        // Load content with timeout and retry
        withRetry(async () => {
          const result = await withTimeout(
            catalogService.getContentDetails(type, actualId),
            API_TIMEOUT
          );
          // Store the actual ID used (could be IMDB)
          if (actualId.startsWith('tt')) {
            setImdbId(actualId);
          }
          return result;
        }),
        // Start loading cast immediately in parallel
        loadCast()
      ]);

      if (content.status === 'fulfilled' && content.value) {
        setMetadata(content.value);
        // Check if item is in library
        const isInLib = catalogService.getLibraryItems().some(item => item.id === id);
        setInLibrary(isInLib);
        cacheService.setMetadata(id, type, content.value);

        // Set the final metadata state without fetching logo (this will be handled by MetadataScreen)
        setMetadata(content.value);
        // Update cache
        cacheService.setMetadata(id, type, content.value);

        if (type === 'series') {
          // Load series data in parallel with other data
          loadSeriesData().catch(console.error);
        }
      } else {
        throw new Error('Content not found');
      }
    } catch (error) {
      console.error('Failed to load metadata:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load content';
      setError(errorMessage);
      
      // Clear any stale data
      setMetadata(null);
      setCast([]);
      setGroupedEpisodes({});
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSeriesData = async () => {
    setLoadingSeasons(true);
    try {
      const tmdbIdResult = await tmdbService.findTMDBIdByIMDB(id);
      if (tmdbIdResult) {
        setTmdbId(tmdbIdResult);
        
        const [allEpisodes, showDetails] = await Promise.all([
          tmdbService.getAllEpisodes(tmdbIdResult),
          tmdbService.getTVShowDetails(tmdbIdResult)
        ]);
        
        const transformedEpisodes: GroupedEpisodes = {};
        Object.entries(allEpisodes).forEach(([season, episodes]) => {
          const seasonInfo = showDetails?.seasons?.find(s => s.season_number === parseInt(season));
          const seasonPosterPath = seasonInfo?.poster_path;
          
          transformedEpisodes[parseInt(season)] = episodes.map(episode => ({
            ...episode,
            episodeString: `S${episode.season_number.toString().padStart(2, '0')}E${episode.episode_number.toString().padStart(2, '0')}`,
            season_poster_path: seasonPosterPath || null
          }));
        });
        
        setGroupedEpisodes(transformedEpisodes);
        
        // Get the first available season as fallback
        const firstSeason = Math.min(...Object.keys(allEpisodes).map(Number));
        
        // Get saved season from persistence, fallback to first season if not found
        const persistedSeason = getSeason(id, firstSeason);
        
        // Set the selected season from persistence
        setSelectedSeason(persistedSeason);
        
        // Set episodes for the selected season
        setEpisodes(transformedEpisodes[persistedSeason] || []);
      }
    } catch (error) {
      console.error('Failed to load episodes:', error);
    } finally {
      setLoadingSeasons(false);
    }
  };

  // Function to indicate that streams are loading without blocking UI
  const updateLoadingState = () => {
    // We set this to true initially, but we'll show results as they come in
    setLoadingStreams(true);
    // Also clear previous streams
    setGroupedStreams({});
    setError(null);
  };

  // Function to indicate that episode streams are loading without blocking UI
  const updateEpisodeLoadingState = () => {
    // We set this to true initially, but we'll show results as they come in
    setLoadingEpisodeStreams(true);
    // Also clear previous streams
    setEpisodeStreams({});
    setError(null);
  };

  const loadStreams = async () => {
    const startTime = Date.now();
    try {
      console.log('🚀 [loadStreams] START - Loading streams for:', id);
      updateLoadingState();

      // Always clear streams first to ensure we don't show stale data
      setGroupedStreams({});

      // Get TMDB ID for external sources first before starting parallel requests
      console.log('🔍 [loadStreams] Getting TMDB ID for:', id);
      let tmdbId;
      if (id.startsWith('tmdb:')) {
        tmdbId = id.split(':')[1];
        console.log('✅ [loadStreams] Using TMDB ID from ID:', tmdbId);
      } else if (id.startsWith('tt')) {
        // This is an IMDB ID
        console.log('📝 [loadStreams] Converting IMDB ID to TMDB ID...');
        tmdbId = await withTimeout(tmdbService.findTMDBIdByIMDB(id), API_TIMEOUT);
        console.log('✅ [loadStreams] Converted to TMDB ID:', tmdbId);
      } else {
        tmdbId = id;
        console.log('ℹ️ [loadStreams] Using ID as TMDB ID:', tmdbId);
      }

      console.log('🔄 [loadStreams] Starting stream requests');
      
      // Start Stremio request using the callback method
      processStremioSource(type, id, false);

      // No external sources are used anymore
      const fetchPromises: Promise<any>[] = [];

      // Wait only for external promises now (none in this case)
      const results = await Promise.allSettled(fetchPromises);
      const totalTime = Date.now() - startTime;
      console.log(`✅ [loadStreams] External source requests completed in ${totalTime}ms (Stremio continues in background)`);
      
      const sourceTypes: string[] = []; // No external sources
      results.forEach((result, index) => {
        const source = sourceTypes[Math.min(index, sourceTypes.length - 1)];
        console.log(`📊 [loadStreams:${source}] Status: ${result.status}`);
        if (result.status === 'rejected') {
          console.error(`❌ [loadStreams:${source}] Error:`, result.reason);
        }
      });

      console.log('🧮 [loadStreams] Summary:');
      console.log('  Total time for external sources:', totalTime + 'ms');
      
      // Log the final states - this might not include all Stremio addons yet
      console.log('📦 [loadStreams] Current combined streams count:', 
        Object.keys(groupedStreams).length > 0 ? 
        Object.values(groupedStreams).reduce((acc, group: any) => acc + group.streams.length, 0) :
        0
      );

      // Cache the final streams state - Note: This might be incomplete if Stremio addons are slow
      setGroupedStreams(prev => {
        // We might want to reconsider when exactly to cache or mark loading as fully complete
        // cacheService.setStreams(id, type, prev); // Maybe cache incrementally in callback?
        setPreloadedStreams(prev);
        return prev;
      });

    } catch (error) {
      console.error('❌ [loadStreams] Failed to load streams:', error);
      setError('Failed to load streams');
    } finally {
      // Loading is now complete when external sources finish, Stremio updates happen independently.
      // We need a better way to track overall completion if we want a final 'FINISHED' log.
      const endTime = Date.now() - startTime;
      console.log(`🏁 [loadStreams] External sources FINISHED in ${endTime}ms`);
      setLoadingStreams(false); // Mark loading=false, but Stremio might still be working
    }
  };

  const loadEpisodeStreams = async (episodeId: string) => {
    const startTime = Date.now();
    try {
      console.log('🚀 [loadEpisodeStreams] START - Loading episode streams for:', episodeId);
      updateEpisodeLoadingState();

      // Get TMDB ID for external sources first before starting parallel requests
      console.log('🔍 [loadEpisodeStreams] Getting TMDB ID for:', id);
      let tmdbId;
      if (id.startsWith('tmdb:')) {
        tmdbId = id.split(':')[1];
        console.log('✅ [loadEpisodeStreams] Using TMDB ID from ID:', tmdbId);
      } else if (id.startsWith('tt')) {
        // This is an IMDB ID
        console.log('📝 [loadEpisodeStreams] Converting IMDB ID to TMDB ID...');
        tmdbId = await withTimeout(tmdbService.findTMDBIdByIMDB(id), API_TIMEOUT);
        console.log('✅ [loadEpisodeStreams] Converted to TMDB ID:', tmdbId);
      } else {
        tmdbId = id;
        console.log('ℹ️ [loadEpisodeStreams] Using ID as TMDB ID:', tmdbId);
      }

      // Extract episode info from the episodeId
      const [, season, episode] = episodeId.split(':');
      const episodeQuery = `?s=${season}&e=${episode}`;
      console.log(`ℹ️ [loadEpisodeStreams] Episode query: ${episodeQuery}`);

      console.log('🔄 [loadEpisodeStreams] Starting stream requests');
      
      const fetchPromises: Promise<any>[] = [];
      
      // Start Stremio request using the callback method
      processStremioSource('series', episodeId, true);

      // No external sources are used anymore

      // Wait only for external promises now (none in this case)
      const results = await Promise.allSettled(fetchPromises);
      const totalTime = Date.now() - startTime;
      console.log(`✅ [loadEpisodeStreams] External source requests completed in ${totalTime}ms (Stremio continues in background)`);
      
      const sourceTypes: string[] = []; // No external sources
      results.forEach((result, index) => {
        const source = sourceTypes[Math.min(index, sourceTypes.length - 1)];
        console.log(`📊 [loadEpisodeStreams:${source}] Status: ${result.status}`);
        if (result.status === 'rejected') {
          console.error(`❌ [loadEpisodeStreams:${source}] Error:`, result.reason);
        }
      });

      console.log('🧮 [loadEpisodeStreams] Summary:');
      console.log('  Total time for external sources:', totalTime + 'ms');
      
      // Log the final states - might not include all Stremio addons yet
      console.log('📦 [loadEpisodeStreams] Current combined streams count:', 
        Object.keys(episodeStreams).length > 0 ? 
        Object.values(episodeStreams).reduce((acc, group: any) => acc + group.streams.length, 0) : 
        0
      );

      // Cache the final streams state - Might be incomplete
      setEpisodeStreams(prev => {
        // Cache episode streams - maybe incrementally?
        setPreloadedEpisodeStreams(currentPreloaded => ({ 
          ...currentPreloaded, 
          [episodeId]: prev 
        }));
        return prev;
      });

    } catch (error) {
      console.error('❌ [loadEpisodeStreams] Failed to load episode streams:', error);
      setError('Failed to load episode streams');
    } finally {
      // Loading is now complete when external sources finish
      const endTime = Date.now() - startTime;
      console.log(`🏁 [loadEpisodeStreams] External sources FINISHED in ${endTime}ms`);
      setLoadingEpisodeStreams(false); // Mark loading=false, but Stremio might still be working
    }
  };

  const handleSeasonChange = useCallback((seasonNumber: number) => {
    if (selectedSeason === seasonNumber) return;
    
    // Update local state
    setSelectedSeason(seasonNumber);
    setEpisodes(groupedEpisodes[seasonNumber] || []);
    
    // Persist the selection
    saveSeason(id, seasonNumber);
  }, [selectedSeason, groupedEpisodes, saveSeason, id]);

  const toggleLibrary = useCallback(() => {
    if (!metadata) return;
    
    if (inLibrary) {
      catalogService.removeFromLibrary(type, id);
    } else {
      catalogService.addToLibrary(metadata);
    }
    
    setInLibrary(!inLibrary);
  }, [metadata, inLibrary, type, id]);

  // Reset load attempts when id or type changes
  useEffect(() => {
    setLoadAttempts(0);
  }, [id, type]);

  // Auto-retry on error with delay
  useEffect(() => {
    if (error && loadAttempts < MAX_RETRIES) {
      const timer = setTimeout(() => {
        loadMetadata();
      }, RETRY_DELAY * (loadAttempts + 1));
      
      return () => clearTimeout(timer);
    }
  }, [error, loadAttempts]);

  useEffect(() => {
    loadMetadata();
  }, [id, type]);

  const loadRecommendations = useCallback(async () => {
    if (!tmdbId) return;

    setLoadingRecommendations(true);
    try {
      const tmdbService = TMDBService.getInstance();
      const results = await tmdbService.getRecommendations(type === 'movie' ? 'movie' : 'tv', String(tmdbId));
      
      // Convert TMDB results to StreamingContent format (simplified)
      const formattedRecommendations: StreamingContent[] = results.map((item: any) => ({
        id: `tmdb:${item.id}`,
        type: type === 'movie' ? 'movie' : 'series',
        name: item.title || item.name || 'Untitled',
        poster: tmdbService.getImageUrl(item.poster_path) || 'https://via.placeholder.com/300x450', // Provide fallback
        year: (item.release_date || item.first_air_date)?.substring(0, 4) || 'N/A', // Ensure string and provide fallback
      }));
      
      setRecommendations(formattedRecommendations);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
      setRecommendations([]);
    } finally {
      setLoadingRecommendations(false);
    }
  }, [tmdbId, type]);

  // Fetch TMDB ID if needed and then recommendations
  useEffect(() => {
    const fetchTmdbIdAndRecommendations = async () => {
      if (metadata && !tmdbId) {
        try {
          const tmdbService = TMDBService.getInstance();
          const fetchedTmdbId = await tmdbService.extractTMDBIdFromStremioId(id);
          if (fetchedTmdbId) {
            setTmdbId(fetchedTmdbId);
            // Fetch certification
            const certification = await tmdbService.getCertification(type, fetchedTmdbId);
            if (certification) {
              setMetadata(prev => prev ? {
                ...prev,
                certification
              } : null);
            }
          } else {
            console.warn('Could not determine TMDB ID for recommendations.');
          }
        } catch (error) {
          console.error('Error fetching TMDB ID:', error);
        }
      }
    };

    fetchTmdbIdAndRecommendations();
  }, [metadata, id]);

  useEffect(() => {
    if (tmdbId) {
      loadRecommendations();
      // Reset recommendations when tmdbId changes
      return () => {
        setRecommendations([]);
        setLoadingRecommendations(true);
      };
    }
  }, [tmdbId, loadRecommendations]);

  // Reset tmdbId when id changes
  useEffect(() => {
    setTmdbId(null);
  }, [id]);

  // Subscribe to library updates
  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates((libraryItems) => {
      const isInLib = libraryItems.some(item => item.id === id);
      setInLibrary(isInLib);
    });

    return () => unsubscribe();
  }, [id]);

  return {
    metadata,
    loading,
    error,
    cast,
    loadingCast,
    episodes,
    groupedEpisodes,
    selectedSeason,
    tmdbId,
    loadingSeasons,
    groupedStreams,
    loadingStreams,
    episodeStreams,
    loadingEpisodeStreams,
    preloadedStreams,
    preloadedEpisodeStreams,
    selectedEpisode,
    inLibrary,
    loadMetadata,
    loadStreams,
    loadEpisodeStreams,
    handleSeasonChange,
    toggleLibrary,
    setSelectedEpisode,
    setEpisodeStreams,
    recommendations,
    loadingRecommendations,
    setMetadata,
    imdbId,
  };
}; 