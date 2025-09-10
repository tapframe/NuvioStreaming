import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StreamingContent, catalogService } from '../services/catalogService';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import * as Haptics from 'expo-haptics';
import { useGenres } from '../contexts/GenreContext';
import { useSettings, settingsEmitter } from './useSettings';

// Create a persistent store outside of the hook to maintain state between navigation
const persistentStore = {
  featuredContent: null as StreamingContent | null,
  allFeaturedContent: [] as StreamingContent[],
  lastFetchTime: 0,
  isFirstLoad: true,
  // Track last used settings to detect changes on app restart
  lastSettings: {
    showHeroSection: true,
    featuredContentSource: 'tmdb' as 'tmdb' | 'catalogs',
    selectedHeroCatalogs: [] as string[],
    logoSourcePreference: 'metahub' as 'metahub' | 'tmdb',
    tmdbLanguagePreference: 'en'
  }
};

// Cache timeout in milliseconds (e.g., 5 minutes)
const CACHE_TIMEOUT = 5 * 60 * 1000;
const STORAGE_KEY = 'featured_content_cache_v1';
const DISABLE_CACHE = true;

export function useFeaturedContent() {
  const [featuredContent, setFeaturedContent] = useState<StreamingContent | null>(persistentStore.featuredContent);
  const [allFeaturedContent, setAllFeaturedContent] = useState<StreamingContent[]>(persistentStore.allFeaturedContent);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(persistentStore.isFirstLoad);
  const currentIndexRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { settings } = useSettings();
  const [contentSource, setContentSource] = useState<'tmdb' | 'catalogs'>(settings.featuredContentSource);
  const [selectedCatalogs, setSelectedCatalogs] = useState<string[]>(settings.selectedHeroCatalogs || []);

  const { genreMap, loadingGenres } = useGenres();

  // Simple update for state variables
  useEffect(() => {
    setContentSource(settings.featuredContentSource);
    setSelectedCatalogs(settings.selectedHeroCatalogs || []);
  }, [settings]);

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const loadFeaturedContent = useCallback(async (forceRefresh = false) => {
    const t0 = Date.now();
    logger.info('[useFeaturedContent] load:start', { forceRefresh, contentSource, selectedCatalogsCount: (selectedCatalogs || []).length });
    // First, ensure contentSource matches current settings (could be outdated due to async updates)
    if (contentSource !== settings.featuredContentSource) {
      logger.debug('[useFeaturedContent] load:source-mismatch', { from: contentSource, to: settings.featuredContentSource });
      setContentSource(settings.featuredContentSource);
      // We return here and let the effect triggered by contentSource change handle the loading
      return;
    }
    
    // Check if we should use cached data (disabled if DISABLE_CACHE)
    const now = Date.now();
    const cacheAge = now - persistentStore.lastFetchTime;
    logger.debug('[useFeaturedContent] cache:status', {
      disabled: DISABLE_CACHE,
      hasFeatured: Boolean(persistentStore.featuredContent),
      allCount: persistentStore.allFeaturedContent?.length || 0,
      cacheAgeMs: cacheAge,
      timeoutMs: CACHE_TIMEOUT,
    });
    if (!DISABLE_CACHE) {
      if (!forceRefresh && 
          persistentStore.featuredContent && 
          persistentStore.allFeaturedContent.length > 0 && 
          cacheAge < CACHE_TIMEOUT) {
        // Use cached data
        logger.info('[useFeaturedContent] cache:use', { duration: `${Date.now() - t0}ms` });
        setFeaturedContent(persistentStore.featuredContent);
        setAllFeaturedContent(persistentStore.allFeaturedContent);
        setLoading(false);
        persistentStore.isFirstLoad = false;
        return;
      }
    }

    logger.info('[useFeaturedContent] fetch:start', { source: contentSource });
    setLoading(true);
    cleanup();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let formattedContent: StreamingContent[] = [];

      if (contentSource === 'tmdb') {
        // Load from TMDB trending
        const tTmdb = Date.now();
        const trendingResults = await tmdbService.getTrending('movie', 'day');
        logger.info('[useFeaturedContent] tmdb:trending', { count: trendingResults?.length || 0, duration: `${Date.now() - tTmdb}ms` });
        
        if (signal.aborted) return;

        if (trendingResults.length > 0) {
          // First convert items to StreamingContent objects
          const preFormattedContent = trendingResults
            .filter(item => item.title || item.name) 
            .map(item => {
              const yearString = (item.release_date || item.first_air_date)?.substring(0, 4);
              return {
                id: `tmdb:${item.id}`,
                type: 'movie',
                name: item.title || item.name || 'Unknown Title',
                poster: tmdbService.getImageUrl(item.poster_path) || '',
                banner: tmdbService.getImageUrl(item.backdrop_path) || '',
                logo: undefined, // Will be populated below
                description: item.overview || '',
                year: yearString ? parseInt(yearString, 10) : undefined,
                genres: item.genre_ids.map(id => 
                  loadingGenres ? '...' : (genreMap[id] || `ID:${id}`)
                ),
                inLibrary: false,
              };
            });
            
          // Then fetch logos for each item based on preference
          const tLogos = Date.now();
          const preference = settings.logoSourcePreference || 'metahub';
          const preferredLanguage = settings.tmdbLanguagePreference || 'en';

          const fetchLogoForItem = async (item: StreamingContent): Promise<StreamingContent> => {
            try {
              // Support both TMDB-prefixed and IMDb-prefixed IDs
              const isTmdb = item.id.startsWith('tmdb:');
              const isImdb = item.id.startsWith('tt');
              let tmdbId: string | null = null;
              let imdbId: string | null = null;

              if (isTmdb) {
                tmdbId = item.id.split(':')[1];
              } else if (isImdb) {
                imdbId = item.id.split(':')[0];
              } else {
                return item;
              }

              if (preference === 'tmdb') {
                logger.debug('[useFeaturedContent] logo:try:tmdb', { name: item.name, id: item.id, tmdbId, lang: preferredLanguage });
                // Resolve TMDB id if we only have IMDb
                if (!tmdbId && imdbId) {
                  const found = await tmdbService.findTMDBIdByIMDB(imdbId);
                  tmdbId = found ? String(found) : null;
                }
                if (!tmdbId) return item;
                const logoUrl = tmdbId ? await tmdbService.getContentLogo('movie', tmdbId as string, preferredLanguage) : null;
                if (logoUrl) {
                  logger.debug('[useFeaturedContent] logo:tmdb:ok', { name: item.name, id: item.id, url: logoUrl, lang: preferredLanguage });
                  return { ...item, logo: logoUrl };
                }
                // Fallback to Metahub via IMDb ID
                if (!imdbId && tmdbId) {
                  const movieDetails: any = await tmdbService.getMovieDetails(tmdbId);
                  imdbId = movieDetails?.imdb_id;
                }
                if (imdbId) {
                  const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
                  logger.debug('[useFeaturedContent] logo:fallback:metahub', { name: item.name, id: item.id, url: metahubUrl });
                  return { ...item, logo: metahubUrl };
                }
                logger.debug('[useFeaturedContent] logo:none', { name: item.name, id: item.id });
                return item;
              } else {
                // preference === 'metahub'
                // If have IMDb, use directly
                if (!imdbId && tmdbId) {
                  const movieDetails: any = await tmdbService.getMovieDetails(tmdbId);
                  imdbId = movieDetails?.imdb_id;
                }
                if (imdbId) {
                  const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
                  logger.debug('[useFeaturedContent] logo:metahub:ok', { name: item.name, id: item.id, url: metahubUrl });
                  return { ...item, logo: metahubUrl };
                }
                // Fallback to TMDB logo
                logger.debug('[useFeaturedContent] logo:metahub:miss → fallback:tmdb', { name: item.name, id: item.id, lang: preferredLanguage });
                if (!tmdbId && imdbId) {
                  const found = await tmdbService.findTMDBIdByIMDB(imdbId);
                  tmdbId = found ? String(found) : null;
                }
                if (!tmdbId) return item;
                const logoUrl = tmdbId ? await tmdbService.getContentLogo('movie', tmdbId as string, preferredLanguage) : null;
                if (logoUrl) {
                  logger.debug('[useFeaturedContent] logo:tmdb:fallback:ok', { name: item.name, id: item.id, url: logoUrl, lang: preferredLanguage });
                  return { ...item, logo: logoUrl };
                }
                logger.debug('[useFeaturedContent] logo:none', { name: item.name, id: item.id });
                return item;
              }
            } catch (error) {
              logger.error('[useFeaturedContent] logo:error', { name: item.name, id: item.id, error: String(error) });
              return item;
            }
          };

          formattedContent = await Promise.all(preFormattedContent.map(fetchLogoForItem));
          logger.info('[useFeaturedContent] logos:resolved', { count: formattedContent.length, duration: `${Date.now() - tLogos}ms`, preference });
        }
      } else {
        // Load from installed catalogs
        const tCats = Date.now();
        const catalogs = await catalogService.getHomeCatalogs();
        logger.info('[useFeaturedContent] catalogs:list', { count: catalogs?.length || 0, duration: `${Date.now() - tCats}ms` });
        
        if (signal.aborted) return;

        // If no catalogs are installed, stop loading and return.
        if (catalogs.length === 0) {
          formattedContent = [];
        } else {
          // Filter catalogs based on user selection if any catalogs are selected
          const filteredCatalogs = selectedCatalogs && selectedCatalogs.length > 0
            ? catalogs.filter(catalog => {
                const catalogId = `${catalog.addon}:${catalog.type}:${catalog.id}`;
                return selectedCatalogs.includes(catalogId);
              })
            : catalogs; // Use all catalogs if none specifically selected
          logger.debug('[useFeaturedContent] catalogs:filtered', { filteredCount: filteredCatalogs.length, selectedCount: selectedCatalogs?.length || 0 });

          // Flatten all catalog items into a single array, filter out items without posters
          const tFlat = Date.now();
          const allItems = filteredCatalogs.flatMap(catalog => catalog.items)
            .filter(item => item.poster)
            .filter((item, index, self) =>
              // Remove duplicates based on ID
              index === self.findIndex(t => t.id === item.id)
            );
          logger.info('[useFeaturedContent] catalogs:items', { total: allItems.length, duration: `${Date.now() - tFlat}ms` });

          // Sort by popular, newest, etc. (possibly enhanced later) and take first 10
          const topItems = allItems.sort(() => Math.random() - 0.5).slice(0, 10);

          // Optionally enrich with logos based on preference for tmdb-sourced IDs
          const preference = settings.logoSourcePreference || 'metahub';
          const preferredLanguage = settings.tmdbLanguagePreference || 'en';

          const enrichLogo = async (item: any): Promise<StreamingContent> => {
            const base: StreamingContent = {
              id: item.id,
              type: item.type,
              name: item.name,
              poster: item.poster,
              banner: (item as any).banner,
              logo: (item as any).logo,
              description: (item as any).description,
              year: (item as any).year,
              genres: (item as any).genres,
              inLibrary: Boolean((item as any).inLibrary),
            };
            try {
              const rawId = String(item.id);
              const isTmdb = rawId.startsWith('tmdb:');
              const isImdb = rawId.startsWith('tt');
              let tmdbId: string | null = null;
              let imdbId: string | null = null;

              if (isTmdb) tmdbId = rawId.split(':')[1];
              if (isImdb) imdbId = rawId.split(':')[0];
              if (!tmdbId && imdbId) {
                const found = await tmdbService.findTMDBIdByIMDB(imdbId);
                tmdbId = found ? String(found) : null;
              }
              if (!tmdbId && !imdbId) return base;
              if (preference === 'tmdb') {
                logger.debug('[useFeaturedContent] logo:try:tmdb', { name: item.name, id: item.id, tmdbId, lang: preferredLanguage });
                if (!tmdbId) return base;
                const logoUrl = await tmdbService.getContentLogo(item.type === 'series' ? 'tv' : 'movie', tmdbId as string, preferredLanguage);
                if (logoUrl) {
                  logger.debug('[useFeaturedContent] logo:tmdb:ok', { name: item.name, id: item.id, url: logoUrl, lang: preferredLanguage });
                  return { ...base, logo: logoUrl };
                }
                // fallback metahub
                if (!imdbId && tmdbId) {
                  const details: any = item.type === 'series' ? await tmdbService.getShowExternalIds(parseInt(tmdbId)) : await tmdbService.getMovieDetails(tmdbId);
                  imdbId = details?.imdb_id;
                }
                if (imdbId) {
                  const url = `https://images.metahub.space/logo/medium/${imdbId}/img`;
                  logger.debug('[useFeaturedContent] logo:fallback:metahub', { name: item.name, id: item.id, url });
                  return { ...base, logo: url };
                }
                return base;
              } else {
                // metahub first
                if (!imdbId && tmdbId) {
                  const details: any = item.type === 'series' ? await tmdbService.getShowExternalIds(parseInt(tmdbId)) : await tmdbService.getMovieDetails(tmdbId);
                  imdbId = details?.imdb_id;
                }
                if (imdbId) {
                  const url = `https://images.metahub.space/logo/medium/${imdbId}/img`;
                  logger.debug('[useFeaturedContent] logo:metahub:ok', { name: item.name, id: item.id, url });
                  return { ...base, logo: url };
                }
                logger.debug('[useFeaturedContent] logo:metahub:miss → fallback:tmdb', { name: item.name, id: item.id, lang: preferredLanguage });
                if (!tmdbId) return base;
                const logoUrl = await tmdbService.getContentLogo(item.type === 'series' ? 'tv' : 'movie', tmdbId as string, preferredLanguage);
                if (logoUrl) {
                  logger.debug('[useFeaturedContent] logo:tmdb:fallback:ok', { name: item.name, id: item.id, url: logoUrl, lang: preferredLanguage });
                  return { ...base, logo: logoUrl };
                }
                return base;
              }
            } catch (error) {
              logger.error('[useFeaturedContent] logo:error', { name: item.name, id: item.id, error: String(error) });
              return base;
            }
          };

          formattedContent = await Promise.all(topItems.map(enrichLogo));
        }
      }

      if (signal.aborted) return;

      // Safety guard: if nothing came back within a reasonable time, stop loading
      if (!formattedContent || formattedContent.length === 0) {
        logger.warn('[useFeaturedContent] results:empty');
        // Fall back to any cached featured item so UI can render something
        const cachedJson = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (cachedJson) {
          try {
            const parsed = JSON.parse(cachedJson);
            if (parsed?.featuredContent) {
              formattedContent = Array.isArray(parsed.allFeaturedContent) && parsed.allFeaturedContent.length > 0
                ? parsed.allFeaturedContent
                : [parsed.featuredContent];
              logger.info('[useFeaturedContent] fallback:storage', { count: formattedContent.length });
            }
          } catch {}
        }
      }

      // Update persistent store with the new data (no lastFetchTime when cache disabled)
      persistentStore.allFeaturedContent = formattedContent;
      if (!DISABLE_CACHE) {
        persistentStore.lastFetchTime = now;
      }
      persistentStore.isFirstLoad = false;
      
      setAllFeaturedContent(formattedContent);
      
      if (formattedContent.length > 0) {
        persistentStore.featuredContent = formattedContent[0];
        setFeaturedContent(formattedContent[0]); 
        currentIndexRef.current = 0;
        // Persist cache for fast startup (skipped when cache disabled)
        if (!DISABLE_CACHE) {
          try {
            await AsyncStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                ts: now,
                featuredContent: formattedContent[0],
                allFeaturedContent: formattedContent,
              })
            );
            logger.debug('[useFeaturedContent] cache:written', { firstId: formattedContent[0]?.id });
          } catch {}
        }
      } else {
        persistentStore.featuredContent = null;
        setFeaturedContent(null);
        // Clear persisted cache on empty (skipped when cache disabled)
        if (!DISABLE_CACHE) {
          try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
        }
      }
    } catch (error) {
      if (signal.aborted) {
        logger.info('[useFeaturedContent] fetch:aborted');
      } else {
        logger.error('[useFeaturedContent] fetch:error', { error: String(error) });
      }
      setFeaturedContent(null);
      setAllFeaturedContent([]);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        logger.info('[useFeaturedContent] load:done', { duration: `${Date.now() - t0}ms` });
      }
    }
  }, [cleanup, genreMap, loadingGenres, contentSource, selectedCatalogs]);

  // Hydrate from persisted cache immediately for instant render
  useEffect(() => {
    if (DISABLE_CACHE) {
      // Skip hydration entirely
      logger.debug('[useFeaturedContent] hydrate:skipped');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (!json) return;
        const parsed = JSON.parse(json);
        if (cancelled) return;
        if (parsed?.featuredContent) {
          persistentStore.featuredContent = parsed.featuredContent;
          persistentStore.allFeaturedContent = Array.isArray(parsed.allFeaturedContent) ? parsed.allFeaturedContent : [];
          persistentStore.lastFetchTime = typeof parsed.ts === 'number' ? parsed.ts : Date.now();
          persistentStore.isFirstLoad = false;
          setFeaturedContent(parsed.featuredContent);
          setAllFeaturedContent(persistentStore.allFeaturedContent);
          setLoading(false);
          logger.info('[useFeaturedContent] hydrate:storage', { allCount: persistentStore.allFeaturedContent.length });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Check for settings changes, including during app restart
  useEffect(() => {
    // Check if settings changed while app was closed
    const settingsChanged = 
      persistentStore.lastSettings.showHeroSection !== settings.showHeroSection ||
      persistentStore.lastSettings.featuredContentSource !== settings.featuredContentSource ||
      JSON.stringify(persistentStore.lastSettings.selectedHeroCatalogs) !== JSON.stringify(settings.selectedHeroCatalogs) ||
      persistentStore.lastSettings.logoSourcePreference !== settings.logoSourcePreference ||
      persistentStore.lastSettings.tmdbLanguagePreference !== settings.tmdbLanguagePreference;
    
    // Update our tracking of last used settings
    persistentStore.lastSettings = {
      showHeroSection: settings.showHeroSection,
      featuredContentSource: settings.featuredContentSource,
      selectedHeroCatalogs: [...settings.selectedHeroCatalogs],
      logoSourcePreference: settings.logoSourcePreference,
      tmdbLanguagePreference: settings.tmdbLanguagePreference
    };
    
    // Force refresh if settings changed during app restart
    if (settingsChanged) {
      logger.info('[useFeaturedContent] settings:changed', { source: settings.featuredContentSource, selectedCount: settings.selectedHeroCatalogs?.length || 0 });
      loadFeaturedContent(true);
    }
  }, [settings, loadFeaturedContent]);

  // Subscribe directly to settings emitter for immediate updates
  useEffect(() => {
    const handleSettingsChange = () => {
      // Always reflect settings immediately in this hook
      const nextSource = settings.featuredContentSource;
      const nextSelected = settings.selectedHeroCatalogs || [];
      const nextLogoPref = settings.logoSourcePreference;
      const nextTmdbLang = settings.tmdbLanguagePreference;

      const sourceChanged = contentSource !== nextSource;
      const catalogsChanged = JSON.stringify(selectedCatalogs) !== JSON.stringify(nextSelected);
      const logoPrefChanged = persistentStore.lastSettings.logoSourcePreference !== nextLogoPref;
      const tmdbLangChanged = persistentStore.lastSettings.tmdbLanguagePreference !== nextTmdbLang;

      if (sourceChanged || (nextSource === 'catalogs' && catalogsChanged) || logoPrefChanged || tmdbLangChanged) {
        logger.info('[useFeaturedContent] event:settings-changed:immediate-refresh', {
          fromSource: contentSource,
          toSource: nextSource,
          catalogsChanged,
          logoPrefChanged,
          tmdbLangChanged
        });

        // Update internal state immediately so dependent effects are in sync
        setContentSource(nextSource);
        setSelectedCatalogs(nextSelected);
        // Update tracked last settings for subsequent comparisons
        persistentStore.lastSettings.logoSourcePreference = nextLogoPref;
        persistentStore.lastSettings.tmdbLanguagePreference = nextTmdbLang;

        // Clear current data to reflect change instantly in UI
        setAllFeaturedContent([]);
        setFeaturedContent(null);
        persistentStore.allFeaturedContent = [];
        persistentStore.featuredContent = null;

        // Force a fresh load
        loadFeaturedContent(true);
      }
    };
    
    // Subscribe to settings changes
    const unsubscribe = settingsEmitter.addListener(handleSettingsChange);
    
    return unsubscribe;
  }, [loadFeaturedContent, settings, contentSource, selectedCatalogs]);

  // Load featured content initially and when content source changes
  useEffect(() => {
    // Force refresh when switching to catalogs or when catalog selection changes
    if (contentSource === 'catalogs') {
      // Clear cache when switching to catalogs mode
      setAllFeaturedContent([]);
      setFeaturedContent(null);
      persistentStore.allFeaturedContent = [];
      persistentStore.featuredContent = null;
      loadFeaturedContent(true);
    } else if (contentSource === 'tmdb' && contentSource !== persistentStore.featuredContent?.type) {
      // Clear cache when switching to TMDB mode from catalogs
      setAllFeaturedContent([]);
      setFeaturedContent(null);
      persistentStore.allFeaturedContent = [];
      persistentStore.featuredContent = null;
      loadFeaturedContent(true);
    } else {
      // Normal load (might use cache if available)
      loadFeaturedContent(false);
    }
  }, [loadFeaturedContent, contentSource, selectedCatalogs]);

  useEffect(() => {
    if (featuredContent) {
      let isMounted = true;
      const checkLibrary = async () => {
        const items = await catalogService.getLibraryItems();
        if (isMounted) {
          setIsSaved(items.some(item => item.id === featuredContent.id));
        }
      };
      checkLibrary();
      return () => { isMounted = false; };
    }
  }, [featuredContent]);

  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
      if (featuredContent) {
        setIsSaved(items.some(item => item.id === featuredContent.id));
      }
    });
    return () => unsubscribe();
  }, [featuredContent]);

  useEffect(() => {
    if (allFeaturedContent.length <= 1) return;

    let intervalId: NodeJS.Timeout | null = null;
    let appState = AppState.currentState;

    const rotateContent = () => {
      currentIndexRef.current = (currentIndexRef.current + 1) % allFeaturedContent.length;
      if (allFeaturedContent[currentIndexRef.current]) {
        const newContent = allFeaturedContent[currentIndexRef.current];
        setFeaturedContent(newContent);
        persistentStore.featuredContent = newContent;
      }
    };

    const start = () => {
      if (!intervalId) intervalId = setInterval(rotateContent, 90000);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleAppStateChange = (nextState: any) => {
      if (appState.match(/inactive|background/) && nextState === 'active') {
        start();
      } else if (nextState.match(/inactive|background/)) {
        stop();
      }
      appState = nextState;
    };

    // Start when mounted and app is active
    if (!appState.match(/inactive|background/)) start();
    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stop();
      sub.remove();
    };
  }, [allFeaturedContent]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const handleSaveToLibrary = useCallback(async () => {
    if (!featuredContent) return;
    
    try {
      const currentSavedStatus = isSaved;
      setIsSaved(!currentSavedStatus);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (currentSavedStatus) {
        await catalogService.removeFromLibrary(featuredContent.type, featuredContent.id);
      } else {
        const itemToAdd = { ...featuredContent, inLibrary: true }; 
        await catalogService.addToLibrary(itemToAdd);
      }
    } catch (error) {
      logger.error('Error updating library:', error);
      setIsSaved(prev => !prev); 
    }
  }, [featuredContent, isSaved]);

  // Function to force a refresh if needed
  const refreshFeatured = useCallback(() => loadFeaturedContent(true), [loadFeaturedContent]);

  return { 
    featuredContent, 
    allFeaturedContent,
    loading, 
    isSaved, 
    handleSaveToLibrary, 
    refreshFeatured
  };
} 