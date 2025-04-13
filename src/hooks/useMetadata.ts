import { useState, useEffect, useCallback } from 'react';
import { StreamingContent } from '../services/catalogService';
import { catalogService } from '../services/catalogService';
import { stremioService } from '../services/stremioService';
import { tmdbService } from '../services/tmdbService';
import { cacheService } from '../services/cacheService';
import { Cast, Episode, GroupedEpisodes, GroupedStreams } from '../types/metadata';
import { TMDBService } from '../services/tmdbService';
import { logger } from '../utils/logger';

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

  const processStreamSource = async (sourceType: string, promise: Promise<any>, isEpisode = false) => {
    const sourceStartTime = Date.now();
    const logPrefix = isEpisode ? 'loadEpisodeStreams' : 'loadStreams';
    
    try {
      logger.log(`🔍 [${logPrefix}:${sourceType}] Starting fetch`);
      const result = await promise;
      logger.log(`✅ [${logPrefix}:${sourceType}] Completed in ${Date.now() - sourceStartTime}ms`);
      
      // If we have results, update immediately
      if (Object.keys(result).length > 0) {
        // Calculate total streams for logging
        const totalStreams = Object.values(result).reduce((acc, group: any) => {
          return acc + (group.streams?.length || 0);
        }, 0);
        
        logger.log(`📦 [${logPrefix}:${sourceType}] Found ${totalStreams} streams`);
        
        // Update state for this source
        if (isEpisode) {
          setEpisodeStreams(prev => {
            const newState = {...prev, ...result};
            console.log(`🔄 [${logPrefix}:${sourceType}] Updating state with ${Object.keys(result).length} providers`);
            return newState;
          });
        } else {
          setGroupedStreams(prev => {
            const newState = {...prev, ...result};
            console.log(`🔄 [${logPrefix}:${sourceType}] Updating state with ${Object.keys(result).length} providers`);
            return newState;
          });
        }
      } else {
        console.log(`⚠️ [${logPrefix}:${sourceType}] No streams found`);
      }
      return result;
    } catch (error) {
      console.error(`❌ [${logPrefix}:${sourceType}] Error:`, error);
      return {};
    }
  };

  const loadCast = async () => {
    try {
      setLoadingCast(true);
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

      // Load all data in parallel
      const [content, castData] = await Promise.allSettled([
        // Load content with timeout and retry
        withRetry(async () => {
          const result = await withTimeout(
            catalogService.getContentDetails(type, id),
            API_TIMEOUT
          );
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
        
        const firstSeason = Math.min(...Object.keys(allEpisodes).map(Number));
        const initialEpisodes = transformedEpisodes[firstSeason] || [];
        setSelectedSeason(firstSeason);
        setEpisodes(initialEpisodes);
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
      console.log('🚀 [loadStreams] START - Loading movie streams for:', id);
      updateLoadingState();

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

      console.log('🔄 [loadStreams] Starting parallel stream requests');
      
      // Create an array to store all fetching promises
      const fetchPromises = [];

      // Start Stremio request
      const stremioPromise = processStreamSource('stremio', (async () => {
        const newGroupedStreams: GroupedStreams = {};
        try {
          const responses = await stremioService.getStreams(type, id);
          responses.forEach(response => {
            const addonId = response.addon;
            if (addonId && response.streams.length > 0) {
              const streamsWithAddon = response.streams.map(stream => ({
                ...stream,
                name: stream.name || stream.title || 'Unnamed Stream',
                addonId: response.addon,
                addonName: response.addonName
              }));
              
              newGroupedStreams[addonId] = {
                addonName: response.addonName,
                streams: streamsWithAddon
              };
            }
          });
          return newGroupedStreams;
        } catch (error) {
          console.error('❌ [loadStreams:stremio] Error fetching Stremio streams:', error);
          return {};
        }
      })(), false);
      fetchPromises.push(stremioPromise);

      // Start Source 1 request if we have a TMDB ID
      if (tmdbId) {
        const source1Promise = processStreamSource('source1', (async () => {
          try {
            const streams = await fetchExternalStreams(
              `https://nice-month-production.up.railway.app/embedsu/${tmdbId}`,
              'Source 1'
            );
            
            if (streams.length > 0) {
              return {
                'source_1': {
                  addonName: 'Source 1',
                  streams
                }
              };
            }
            return {};
          } catch (error) {
            console.error('❌ [loadStreams:source1] Error fetching Source 1 streams:', error);
            return {};
          }
        })(), false);
        fetchPromises.push(source1Promise);
      }

      // Start Source 2 request if we have a TMDB ID
      if (tmdbId) {
        const source2Promise = processStreamSource('source2', (async () => {
          try {
            const streams = await fetchExternalStreams(
              `https://vidsrc-api-js-phz6.onrender.com/embedsu/${tmdbId}`,
              'Source 2'
            );
            
            if (streams.length > 0) {
              return {
                'source_2': {
                  addonName: 'Source 2',
                  streams
                }
              };
            }
            return {};
          } catch (error) {
            console.error('❌ [loadStreams:source2] Error fetching Source 2 streams:', error);
            return {};
          }
        })(), false);
        fetchPromises.push(source2Promise);
      }

      // Wait for all promises to complete - but we already showed results as they arrived
      const results = await Promise.allSettled(fetchPromises);
      const totalTime = Date.now() - startTime;
      console.log(`✅ [loadStreams] All requests completed in ${totalTime}ms`);
      
      const sourceTypes = ['stremio', 'source1', 'source2'];
      results.forEach((result, index) => {
        const source = sourceTypes[Math.min(index, sourceTypes.length - 1)];
        console.log(`📊 [loadStreams:${source}] Status: ${result.status}`);
        if (result.status === 'rejected') {
          console.error(`❌ [loadStreams:${source}] Error:`, result.reason);
        }
      });

      console.log('🧮 [loadStreams] Summary:');
      console.log('  Total time:', totalTime + 'ms');
      
      // Log the final states
      console.log('📦 [loadStreams] Final streams count:', 
        Object.keys(groupedStreams).length > 0 ? 
        Object.values(groupedStreams).reduce((acc, group: any) => acc + group.streams.length, 0) :
        0
      );

      // Cache the final streams state
      setGroupedStreams(prev => {
        cacheService.setStreams(id, type, prev);
        setPreloadedStreams(prev);
        return prev;
      });

    } catch (error) {
      console.error('❌ [loadStreams] Failed to load streams:', error);
      setError('Failed to load streams');
    } finally {
      const endTime = Date.now() - startTime;
      console.log(`🏁 [loadStreams] FINISHED in ${endTime}ms`);
      setLoadingStreams(false);
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

      console.log('🔄 [loadEpisodeStreams] Starting parallel stream requests');
      
      // Create an array to store all fetching promises
      const fetchPromises = [];
      
      // Start Stremio request
      const stremioPromise = processStreamSource('stremio', (async () => {
        const newGroupedStreams: GroupedStreams = {};
        try {
          const responses = await stremioService.getStreams('series', episodeId);
          responses.forEach(response => {
            const addonId = response.addon;
            if (addonId && response.streams.length > 0) {
              const streamsWithAddon = response.streams.map(stream => ({
                ...stream,
                name: stream.name || stream.title || 'Unnamed Stream',
                addonId: response.addon,
                addonName: response.addonName
              }));
              
              newGroupedStreams[addonId] = {
                addonName: response.addonName,
                streams: streamsWithAddon
              };
            }
          });
          return newGroupedStreams;
        } catch (error) {
          console.error('❌ [loadEpisodeStreams:stremio] Error fetching Stremio streams:', error);
          return {};
        }
      })(), true);
      fetchPromises.push(stremioPromise);

      // Start Source 1 request if we have a TMDB ID
      if (tmdbId) {
        const source1Promise = processStreamSource('source1', (async () => {
          try {
            const streams = await fetchExternalStreams(
              `https://nice-month-production.up.railway.app/embedsu/${tmdbId}${episodeQuery}`,
              'Source 1',
              true
            );
            
            if (streams.length > 0) {
              return {
                'source_1': {
                  addonName: 'Source 1',
                  streams
                }
              };
            }
            return {};
          } catch (error) {
            console.error('❌ [loadEpisodeStreams:source1] Error fetching Source 1 streams:', error);
            return {};
          }
        })(), true);
        fetchPromises.push(source1Promise);
      }

      // Start Source 2 request if we have a TMDB ID
      if (tmdbId) {
        const source2Promise = processStreamSource('source2', (async () => {
          try {
            const streams = await fetchExternalStreams(
              `https://vidsrc-api-js-phz6.onrender.com/embedsu/${tmdbId}${episodeQuery}`,
              'Source 2',
              true
            );
            
            if (streams.length > 0) {
              return {
                'source_2': {
                  addonName: 'Source 2',
                  streams
                }
              };
            }
            return {};
          } catch (error) {
            console.error('❌ [loadEpisodeStreams:source2] Error fetching Source 2 streams:', error);
            return {};
          }
        })(), true);
        fetchPromises.push(source2Promise);
      }

      // Wait for all promises to complete - but we already showed results as they arrived
      const results = await Promise.allSettled(fetchPromises);
      const totalTime = Date.now() - startTime;
      console.log(`✅ [loadEpisodeStreams] All requests completed in ${totalTime}ms`);
      
      const sourceTypes = ['stremio', 'source1', 'source2'];
      results.forEach((result, index) => {
        const source = sourceTypes[Math.min(index, sourceTypes.length - 1)];
        console.log(`📊 [loadEpisodeStreams:${source}] Status: ${result.status}`);
        if (result.status === 'rejected') {
          console.error(`❌ [loadEpisodeStreams:${source}] Error:`, result.reason);
        }
      });

      console.log('🧮 [loadEpisodeStreams] Summary:');
      console.log('  Total time:', totalTime + 'ms');
      
      // Log the final states
      console.log('📦 [loadEpisodeStreams] Final streams count:', 
        Object.keys(episodeStreams).length > 0 ? 
        Object.values(episodeStreams).reduce((acc, group: any) => acc + group.streams.length, 0) :
        0
      );

      // Cache the final streams state
      setEpisodeStreams(prev => {
        // Cache episode streams
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
      const totalTime = Date.now() - startTime;
      console.log(`🏁 [loadEpisodeStreams] FINISHED in ${totalTime}ms`);
      setLoadingEpisodeStreams(false);
    }
  };

  const fetchExternalStreams = async (url: string, sourceName: string, isEpisode = false) => {
    try {
      console.log(`\n🌐 [${sourceName}] Starting fetch request...`);
      console.log(`📍 URL: ${url}`);
      
      // Add proper headers to ensure we get JSON response
      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      };
      console.log('📋 Request Headers:', headers);

      // Make the fetch request
      console.log(`⏳ [${sourceName}] Making fetch request...`);
      const response = await fetch(url, { headers });
      console.log(`✅ [${sourceName}] Response received`);
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log(`🔤 Content-Type:`, response.headers.get('content-type'));

      // Check if response is ok
      if (!response.ok) {
        console.error(`❌ [${sourceName}] HTTP error: ${response.status}`);
        console.error(`📝 Status Text: ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Try to parse JSON
      console.log(`📑 [${sourceName}] Reading response body...`);
      const text = await response.text();
      console.log(`📄 [${sourceName}] Response body (first 300 chars):`, text.substring(0, 300));
      
      let data;
      try {
        console.log(`🔄 [${sourceName}] Parsing JSON...`);
        data = JSON.parse(text);
        console.log(`✅ [${sourceName}] JSON parsed successfully`);
      } catch (e) {
        console.error(`❌ [${sourceName}] JSON parse error:`, e);
        console.error(`📝 [${sourceName}] Raw response:`, text.substring(0, 200));
        throw new Error('Invalid JSON response');
      }
      
      // Transform the response
      console.log(`🔄 [${sourceName}] Processing sources...`);
      if (data && data.sources && Array.isArray(data.sources)) {
        console.log(`📦 [${sourceName}] Found ${data.sources.length} source(s)`);
        
        const transformedStreams = [];
        for (const source of data.sources) {
          console.log(`\n📂 [${sourceName}] Processing source:`, source);
          
          if (source.files && Array.isArray(source.files)) {
            console.log(`📁 [${sourceName}] Found ${source.files.length} file(s) in source`);
            
            for (const file of source.files) {
              console.log(`🎥 [${sourceName}] Processing file:`, file);
              const stream = {
                url: file.file,
                title: `${sourceName} - ${file.quality || 'Unknown'}`,
                name: `${sourceName} - ${file.quality || 'Unknown'}`,
                behaviorHints: {
                  notWebReady: false,
                  headers: source.headers || {}
                }
              };
              console.log(`✨ [${sourceName}] Created stream:`, stream);
              transformedStreams.push(stream);
            }
          } else {
            console.log(`⚠️ [${sourceName}] No files array found in source or invalid format`);
          }
        }
        
        console.log(`\n🎉 [${sourceName}] Successfully processed ${transformedStreams.length} stream(s)`);
        return transformedStreams;
      }
      
      console.log(`⚠️ [${sourceName}] No valid sources found in response`);
      return [];
    } catch (error) {
      console.error(`\n❌ [${sourceName}] Error fetching streams:`, error);
      console.error(`📍 URL: ${url}`);
      if (error instanceof Error) {
        console.error(`💥 Error name: ${error.name}`);
        console.error(`💥 Error message: ${error.message}`);
        console.error(`💥 Stack trace: ${error.stack}`);
      }
      return [];
    }
  };

  const handleSeasonChange = useCallback((seasonNumber: number) => {
    if (selectedSeason === seasonNumber) return;
    setSelectedSeason(seasonNumber);
    setEpisodes(groupedEpisodes[seasonNumber] || []);
  }, [selectedSeason, groupedEpisodes]);

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
  };
}; 