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

    setLoading(true);
    cleanup();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let formattedContent: StreamingContent[] = [];

      {
        // Load from installed catalogs
        const tCats = Date.now();
        const catalogs = await catalogService.getHomeCatalogs();
        
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

          // Flatten all catalog items into a single array, filter out items without posters
          const tFlat = Date.now();
          const allItems = filteredCatalogs.flatMap(catalog => catalog.items)
            .filter(item => item.poster)
            .filter((item, index, self) =>
              // Remove duplicates based on ID
              index === self.findIndex(t => t.id === item.id)
            );

          // Sort by popular, newest, etc. (possibly enhanced later) and take first 10
          const topItems = allItems.sort(() => Math.random() - 0.5).slice(0, 10);

          // Optionally enrich with logos (TMDB only) for tmdb/imdb sourced IDs
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
              if (!settings.enrichMetadataWithTMDB) {
                // When enrichment is OFF, keep addon logo or undefined
                return { ...base, logo: base.logo || undefined };
              }

              // When enrichment is ON, fetch from TMDB with language preference
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
                return { ...base, logo: logoUrl || undefined }; // TMDB logo or undefined (no addon fallback)
              }
              
              return { ...base, logo: undefined }; // No TMDB ID means no logo
            } catch (error) {
              return { ...base, logo: undefined }; // Error means no logo
            }
          };

          // Only enrich with logos if enrichment is enabled
          if (settings.enrichMetadataWithTMDB) {
            formattedContent = await Promise.all(topItems.map(enrichLogo));
            try {
              const details = formattedContent.slice(0, 20).map((c) => ({
                id: c.id,
                name: c.name,
                hasLogo: Boolean(c.logo),
                logoSource: c.logo ? (isTmdbUrl(String(c.logo)) ? 'tmdb' : 'addon') : 'none',
                logo: c.logo || undefined,
              }));
            } catch {}
          } else {
            // When enrichment is disabled, prefer addon-provided logos; if missing, fetch basic meta to pull logo (like HeroSection)
            const baseItems = topItems.map((item: any) => {
              const base: StreamingContent = {
                id: item.id,
                type: item.type,
                name: item.name,
                poster: item.poster,
                banner: (item as any).banner,
                logo: (item as any).logo || undefined,
                description: (item as any).description,
                year: (item as any).year,
                genres: (item as any).genres,
                inLibrary: Boolean((item as any).inLibrary),
              };
              return base;
            });

            // Attempt to fill missing logos from addon meta details for a limited subset
            const candidates = baseItems.filter(i => !i.logo).slice(0, 10);

            try {
              const filled = await Promise.allSettled(candidates.map(async (item) => {
                try {
                  const meta = await catalogService.getBasicContentDetails(item.type, item.id);
                  if (meta?.logo) {
                    return { id: item.id, logo: meta.logo } as { id: string; logo: string };
                  }
                } catch (e) {
                }
                return { id: item.id, logo: undefined as any };
              }));

              const idToLogo = new Map<string, string>();
              filled.forEach(res => {
                if (res.status === 'fulfilled' && res.value && res.value.logo) {
                  idToLogo.set(res.value.id, res.value.logo);
                }
              });

              formattedContent = baseItems.map(i => (
                idToLogo.has(i.id) ? { ...i, logo: idToLogo.get(i.id)! } : i
              ));
            } catch {
              formattedContent = baseItems;
            }

            try {
              const details = formattedContent.slice(0, 20).map((c) => ({
                id: c.id,
                name: c.name,
                hasLogo: Boolean(c.logo),
                logoSource: c.logo ? (isTmdbUrl(String(c.logo)) ? 'tmdb' : 'addon') : 'none',
                logo: c.logo || undefined,
              }));
            } catch {}
          }
        }
      }

      if (signal.aborted) return;

      // Safety guard: if nothing came back within a reasonable time, stop loading
      if (!formattedContent || formattedContent.length === 0) {
        // Fall back to any cached featured item so UI can render something
        const cachedJson = await mmkvStorage.getItem(STORAGE_KEY).catch(() => null);
        if (cachedJson) {
          try {
            const parsed = JSON.parse(cachedJson);
            if (parsed?.featuredContent) {
              formattedContent = Array.isArray(parsed.allFeaturedContent) && parsed.allFeaturedContent.length > 0
                ? parsed.allFeaturedContent
                : [parsed.featuredContent];
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
            await mmkvStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                ts: now,
                featuredContent: formattedContent[0],
                allFeaturedContent: formattedContent,
              })
            );
          } catch {}
        }
      } else {
        persistentStore.featuredContent = null;
        setFeaturedContent(null);
        // Clear persisted cache on empty (skipped when cache disabled)
        if (!DISABLE_CACHE) {
          try { await mmkvStorage.removeItem(STORAGE_KEY); } catch {}
        }
      }
    } catch (error) {
      if (signal.aborted) {
      } else {
      }
      setFeaturedContent(null);
      setAllFeaturedContent([]);
    } finally {
      if (!signal.aborted) {
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
      } catch {}
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

  // Load featured content initially and when catalogs selection changes
  useEffect(() => {
    // Always use catalogs
    setAllFeaturedContent([]);
    setFeaturedContent(null);
    persistentStore.allFeaturedContent = [];
    persistentStore.featuredContent = null;
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