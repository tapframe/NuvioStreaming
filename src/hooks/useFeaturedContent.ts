import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { mmkvStorage } from '../services/mmkvStorage';
import { StreamingContent, catalogService } from '../services/catalogService';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import * as Haptics from 'expo-haptics';
import { useGenres } from '../contexts/GenreContext';
import { useSettings, settingsEmitter } from './useSettings';
import { isTmdbUrl } from '../utils/logoUtils';

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
    logoSourcePreference: 'tmdb' as 'metahub' | 'tmdb',
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
  const [contentSource, setContentSource] = useState<'tmdb' | 'catalogs'>('catalogs');
  const [selectedCatalogs, setSelectedCatalogs] = useState<string[]>(settings.selectedHeroCatalogs || []);

  const { genreMap, loadingGenres } = useGenres();

  // Simple update for state variables
  useEffect(() => {
    // Always use catalogs as the featured source
    setContentSource('catalogs');
    setSelectedCatalogs(settings.selectedHeroCatalogs || []);
  }, [settings.selectedHeroCatalogs]);

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const loadFeaturedContent = useCallback(async (forceRefresh = false) => {
    const t0 = Date.now();

    // Check if we should use cached data (disabled if DISABLE_CACHE)
    const now = Date.now();
    const cacheAge = now - persistentStore.lastFetchTime;
    if (!DISABLE_CACHE) {
      if (!forceRefresh &&
        persistentStore.featuredContent &&
        persistentStore.allFeaturedContent.length > 0 &&
        cacheAge < CACHE_TIMEOUT) {
        // Use cached data
        setFeaturedContent(persistentStore.featuredContent);
        setAllFeaturedContent(persistentStore.allFeaturedContent);
        setLoading(false);
        persistentStore.isFirstLoad = false;
        return;
      }
    }

    // Only show loading if we don't have any content
    if (!featuredContent && !persistentStore.featuredContent) {
      setLoading(true);
    }
    cleanup();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // Load list of catalogs to fetch
      const configs = await catalogService.resolveHomeCatalogsToFetch(selectedCatalogs);

      if (signal.aborted) return;

      // Prepare for incremental loading
      const seenIds = new Set<string>();
      let accumulatedContent: StreamingContent[] = [];
      const TARGET_COUNT = 10;
      let hasSetInitialContent = false;

      // Helper function to enrich items
      const enrichItems = async (items: any[]): Promise<StreamingContent[]> => {
        const preferredLanguage = settings.tmdbLanguagePreference || 'en';

        const enrichLogo = async (item: any): Promise<StreamingContent> => {
          const base: StreamingContent = {
            id: item.id,
            type: item.type,
            name: item.name,
            addonId: item.addonId,
            poster: item.poster,
            banner: (item as any).banner,
            logo: (item as any).logo,
            description: (item as any).description,
            year: (item as any).year,
            genres: (item as any).genres,
            inLibrary: Boolean((item as any).inLibrary),
          };

          try {
            if (base.logo && !isTmdbUrl(base.logo)) {
              return base;
            }

            if (!settings.enrichMetadataWithTMDB) {
              return { ...base, logo: base.logo || undefined };
            }

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

            if (tmdbId) {
              const logoUrl = await tmdbService.getContentLogo(item.type === 'series' ? 'tv' : 'movie', tmdbId as string, preferredLanguage);
              return { ...base, logo: logoUrl || undefined };
            }

            return { ...base, logo: undefined };
          } catch (error) {
            return { ...base, logo: undefined };
          }
        };

        if (settings.enrichMetadataWithTMDB) {
          return Promise.all(items.map(enrichLogo));
        } else {
          // Fallback logic for when enrichment is disabled
          const baseItems = items.map((item: any) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            addonId: item.addonId,
            poster: item.poster,
            banner: (item as any).banner,
            logo: (item as any).logo || undefined,
            description: (item as any).description,
            year: (item as any).year,
            genres: (item as any).genres,
            inLibrary: Boolean((item as any).inLibrary),
          }));

          // Try to get logos for items missing them
          const missingLogoCandidates = baseItems.filter((i: any) => !i.logo);
          if (missingLogoCandidates.length > 0) {
            try {
              const filled = await Promise.allSettled(missingLogoCandidates.map(async (item: any) => {
                try {
                  const meta = await catalogService.getBasicContentDetails(item.type, item.id);
                  if (meta?.logo) return { id: item.id, logo: meta.logo };
                } catch { }
                return { id: item.id, logo: undefined };
              }));

              const idToLogo = new Map();
              filled.forEach((res: any) => {
                if (res.status === 'fulfilled' && res.value?.logo) {
                  idToLogo.set(res.value.id, res.value.logo);
                }
              });

              return baseItems.map((i: any) => idToLogo.has(i.id) ? { ...i, logo: idToLogo.get(i.id) } : i);
            } catch {
              return baseItems;
            }
          }
          return baseItems;
        }
      };

      // Process each catalog independently
      const processCatalog = async (config: { addon: any, catalog: any }) => {
        if (signal.aborted) return;
        // Optimization: Stop fetching if we have enough items
        // Note: We check length here but parallel requests might race. This is acceptable.
        if (accumulatedContent.length >= TARGET_COUNT) return;

        try {
          const cat = await catalogService.fetchHomeCatalog(config.addon, config.catalog);
          if (signal.aborted) return;
          if (!cat || !cat.items || cat.items.length === 0) return;

          // Deduplicate
          const newItems = cat.items.filter(item => {
            if (!item.poster) return false;
            if (seenIds.has(item.id)) return false;
            return true;
          });

          if (newItems.length === 0) return;

          // Take only what we need (or a small batch)
          const needed = TARGET_COUNT - accumulatedContent.length;
          // Shuffle this batch locally just to mix it up a bit if the catalog returns strict order
          const shuffledBatch = newItems.sort(() => Math.random() - 0.5).slice(0, needed);

          if (shuffledBatch.length === 0) return;

          shuffledBatch.forEach(item => seenIds.add(item.id));

          // Enrich this batch
          const enrichedBatch = await enrichItems(shuffledBatch);
          if (signal.aborted) return;

          // Update accumulated content
          accumulatedContent = [...accumulatedContent, ...enrichedBatch];

          // Update State
          // Always update allFeaturedContent to show progress
          setAllFeaturedContent([...accumulatedContent]);

          // If this is the first batch, set initial state and UNBLOCK LOADING
          if (!hasSetInitialContent && accumulatedContent.length > 0) {
            hasSetInitialContent = true;
            setFeaturedContent(accumulatedContent[0]);
            persistentStore.featuredContent = accumulatedContent[0];
            persistentStore.allFeaturedContent = accumulatedContent;
            currentIndexRef.current = 0;
            setLoading(false); // <--- Key improvement: Display content immediately
          } else {
            // Just update store for subsequent batches
            persistentStore.allFeaturedContent = accumulatedContent;
          }

        } catch (e) {
          logger.error('Error processing catalog in parallel', e);
        }
      };

      // If no catalogs to fetch, fallback immediately
      if (configs.length === 0) {
        // Fallback logic
      } else {
        // Run fetches in parallel
        await Promise.all(configs.map(processCatalog));
      }

      if (signal.aborted) return;

      // Handle case where we finished all fetches but found NOTHING
      if (accumulatedContent.length === 0) {
        // Fall back to any cached featured item so UI can render something
        const cachedJson = await mmkvStorage.getItem(STORAGE_KEY).catch(() => null);
        if (cachedJson) {
          try {
            const parsed = JSON.parse(cachedJson);
            if (parsed?.featuredContent) {
              const fallback = Array.isArray(parsed.allFeaturedContent) && parsed.allFeaturedContent.length > 0
                ? parsed.allFeaturedContent
                : [parsed.featuredContent];

              setAllFeaturedContent(fallback);
              setFeaturedContent(fallback[0]);
              setLoading(false);
              return; // Done
            }
          } catch { }
        }

        // If still nothing
        setFeaturedContent(null);
        setAllFeaturedContent([]);
        setLoading(false); // Ensure we don't hang in loading state
      }

      // Final persistence
      persistentStore.allFeaturedContent = accumulatedContent;
      if (!DISABLE_CACHE && accumulatedContent.length > 0) {
        persistentStore.lastFetchTime = now;
        try {
          await mmkvStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              ts: now,
              featuredContent: accumulatedContent[0],
              allFeaturedContent: accumulatedContent,
            })
          );
        } catch { }
      }

    } catch (error) {
      if (!signal.aborted) {
        // Even on error, ensure we stop loading
        setFeaturedContent(null);
        setAllFeaturedContent([]);
        setLoading(false);
      }
    }
  }, [cleanup, genreMap, loadingGenres, selectedCatalogs]);

  // Hydrate from persisted cache immediately for instant render
  useEffect(() => {
    if (DISABLE_CACHE) {
      // Skip hydration entirely
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const json = await mmkvStorage.getItem(STORAGE_KEY);
        if (!json) return;
        const parsed = JSON.parse(json);
        if (cancelled) return;
        if (parsed?.featuredContent) {
          // Only hydrate if we don't already have content to prevent flash
          if (!persistentStore.featuredContent) {
            persistentStore.featuredContent = parsed.featuredContent;
            persistentStore.allFeaturedContent = Array.isArray(parsed.allFeaturedContent) ? parsed.allFeaturedContent : [];
            persistentStore.lastFetchTime = typeof parsed.ts === 'number' ? parsed.ts : Date.now();
            persistentStore.isFirstLoad = false;
            setFeaturedContent(parsed.featuredContent);
            setAllFeaturedContent(persistentStore.allFeaturedContent);
            setLoading(false);
          }
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, []);

  // Check for settings changes, including during app restart
  useEffect(() => {
    // Check if settings changed while app was closed
    const settingsChanged =
      persistentStore.lastSettings.showHeroSection !== settings.showHeroSection ||
      JSON.stringify(persistentStore.lastSettings.selectedHeroCatalogs) !== JSON.stringify(settings.selectedHeroCatalogs) ||
      persistentStore.lastSettings.logoSourcePreference !== settings.logoSourcePreference ||
      persistentStore.lastSettings.tmdbLanguagePreference !== settings.tmdbLanguagePreference;

    // Update our tracking of last used settings
    persistentStore.lastSettings = {
      showHeroSection: settings.showHeroSection,
      featuredContentSource: 'catalogs',
      selectedHeroCatalogs: [...settings.selectedHeroCatalogs],
      logoSourcePreference: settings.logoSourcePreference,
      tmdbLanguagePreference: settings.tmdbLanguagePreference
    };

    // Force refresh if settings changed during app restart, but only if we have content
    if (settingsChanged && persistentStore.featuredContent) {
      loadFeaturedContent(true);
    }
  }, [settings, loadFeaturedContent]);

  // Subscribe directly to settings emitter for immediate updates
  useEffect(() => {
    const handleSettingsChange = () => {
      // Always reflect settings immediately in this hook
      const nextSelected = settings.selectedHeroCatalogs || [];
      const nextLogoPref = settings.logoSourcePreference;
      const nextTmdbLang = settings.tmdbLanguagePreference;

      const catalogsChanged = JSON.stringify(selectedCatalogs) !== JSON.stringify(nextSelected);
      const logoPrefChanged = persistentStore.lastSettings.logoSourcePreference !== nextLogoPref;
      const tmdbLangChanged = persistentStore.lastSettings.tmdbLanguagePreference !== nextTmdbLang;

      if (catalogsChanged || logoPrefChanged || tmdbLangChanged) {

        // Update internal state immediately so dependent effects are in sync
        setSelectedCatalogs(nextSelected);
        // Update tracked last settings for subsequent comparisons
        persistentStore.lastSettings.logoSourcePreference = nextLogoPref;
        persistentStore.lastSettings.tmdbLanguagePreference = nextTmdbLang;

        // Only clear current data if it's a significant change (source or catalogs)
        if (catalogsChanged) {
          setAllFeaturedContent([]);
          setFeaturedContent(null);
          persistentStore.allFeaturedContent = [];
          persistentStore.featuredContent = null;
        }

        // Force a fresh load
        loadFeaturedContent(true);
      }
    };

    // Subscribe to settings changes
    const unsubscribe = settingsEmitter.addListener(handleSettingsChange);

    return unsubscribe;
  }, [loadFeaturedContent, settings, contentSource, selectedCatalogs]);

  useEffect(() => {
    // Always use catalogs
    // Don't clear content here to prevent flashing
    loadFeaturedContent(true);
  }, [loadFeaturedContent, selectedCatalogs]);

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

  const handleSaveToLibrary = useCallback(async (item?: StreamingContent) => {
    const contentToUse = item || featuredContent;
    if (!contentToUse) return;

    try {
      // For the legacy single item behavior
      if (!item) {
        const currentSavedStatus = isSaved;
        setIsSaved(!currentSavedStatus);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (currentSavedStatus) {
          await catalogService.removeFromLibrary(contentToUse.type, contentToUse.id);
        } else {
          const itemToAdd = { ...contentToUse, inLibrary: true };
          await catalogService.addToLibrary(itemToAdd);
        }
      } else {
        // For carousel items - check if saved and toggle
        const libraryItems = await catalogService.getLibraryItems();
        const isItemSaved = libraryItems.some(libItem => libItem.id === contentToUse.id && libItem.type === contentToUse.type);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (isItemSaved) {
          await catalogService.removeFromLibrary(contentToUse.type, contentToUse.id);
        } else {
          const itemToAdd = { ...contentToUse, inLibrary: true };
          await catalogService.addToLibrary(itemToAdd);
        }
      }
    } catch (error) {
      logger.error('Error updating library:', error);
      if (!item) {
        setIsSaved(prev => !prev);
      }
    }
  }, [featuredContent, isSaved]);

  const isItemSaved = useCallback(async (item: StreamingContent) => {
    try {
      const items = await catalogService.getLibraryItems();
      return items.some(libItem => libItem.id === item.id && libItem.type === item.type);
    } catch (error) {
      logger.error('Error checking if item is saved:', error);
      return false;
    }
  }, []);

  // Function to force a refresh if needed
  const refreshFeatured = useCallback(() => loadFeaturedContent(true), [loadFeaturedContent]);

  return {
    featuredContent,
    allFeaturedContent,
    loading,
    isSaved,
    handleSaveToLibrary,
    isItemSaved,
    refreshFeatured
  };
} 
