import { useState, useEffect, useCallback, useRef } from 'react';
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
    selectedHeroCatalogs: [] as string[]
  }
};

// Cache timeout in milliseconds (e.g., 5 minutes)
const CACHE_TIMEOUT = 5 * 60 * 1000;

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
    // First, ensure contentSource matches current settings (could be outdated due to async updates)
    if (contentSource !== settings.featuredContentSource) {
      console.log(`Updating content source from ${contentSource} to ${settings.featuredContentSource}`);
      setContentSource(settings.featuredContentSource);
      // We return here and let the effect triggered by contentSource change handle the loading
      return;
    }
    
    // Check if we should use cached data
    const now = Date.now();
    const cacheAge = now - persistentStore.lastFetchTime;
    
    if (!forceRefresh && 
        persistentStore.featuredContent && 
        persistentStore.allFeaturedContent.length > 0 && 
        cacheAge < CACHE_TIMEOUT) {
      // Use cached data
      console.log('Using cached featured content data');
      setFeaturedContent(persistentStore.featuredContent);
      setAllFeaturedContent(persistentStore.allFeaturedContent);
      setLoading(false);
      persistentStore.isFirstLoad = false;
      return;
    }

    console.log(`Loading featured content from ${contentSource}`);
    setLoading(true);
    cleanup();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let formattedContent: StreamingContent[] = [];

      if (contentSource === 'tmdb') {
        // Load from TMDB trending
        const trendingResults = await tmdbService.getTrending('movie', 'day');
        
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
            
          // Then fetch logos for each item
          formattedContent = await Promise.all(
            preFormattedContent.map(async (item) => {
              try {
                if (item.id.startsWith('tmdb:')) {
                  const tmdbId = item.id.split(':')[1];
                  const logoUrl = await tmdbService.getContentLogo('movie', tmdbId);
                  if (logoUrl) {
                    return {
                      ...item,
                      logo: logoUrl
                    };
                  }
                }
                return item;
              } catch (error) {
                logger.error(`Failed to fetch logo for ${item.name}:`, error);
                return item;
              }
            })
          );
        }
      } else {
        // Load from installed catalogs
        const catalogs = await catalogService.getHomeCatalogs();
        
        if (signal.aborted) return;

        // Filter catalogs based on user selection if any catalogs are selected
        const filteredCatalogs = selectedCatalogs && selectedCatalogs.length > 0 
          ? catalogs.filter(catalog => {
              const catalogId = `${catalog.addon}:${catalog.type}:${catalog.id}`;
              return selectedCatalogs.includes(catalogId);
            })
          : catalogs; // Use all catalogs if none specifically selected

        // Flatten all catalog items into a single array, filter out items without posters
        const allItems = filteredCatalogs.flatMap(catalog => catalog.items)
          .filter(item => item.poster)
          .filter((item, index, self) => 
            // Remove duplicates based on ID
            index === self.findIndex(t => t.id === item.id)
          );

        // Sort by popular, newest, etc. (possibly enhanced later)
        formattedContent = allItems.sort(() => Math.random() - 0.5).slice(0, 10);
      }

      if (signal.aborted) return;

      // Update persistent store with the new data
      persistentStore.allFeaturedContent = formattedContent;
      persistentStore.lastFetchTime = now;
      persistentStore.isFirstLoad = false;
      
      setAllFeaturedContent(formattedContent);
      
      if (formattedContent.length > 0) {
        persistentStore.featuredContent = formattedContent[0];
        setFeaturedContent(formattedContent[0]); 
        currentIndexRef.current = 0;
      } else {
        persistentStore.featuredContent = null;
        setFeaturedContent(null);
      }
    } catch (error) {
      if (signal.aborted) {
        logger.info('Featured content fetch aborted');
      } else {
        logger.error('Failed to load featured content:', error);
      }
      setFeaturedContent(null);
      setAllFeaturedContent([]);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [cleanup, genreMap, loadingGenres, contentSource, selectedCatalogs]);

  // Check for settings changes, including during app restart
  useEffect(() => {
    // Check if settings changed while app was closed
    const settingsChanged = 
      persistentStore.lastSettings.showHeroSection !== settings.showHeroSection ||
      persistentStore.lastSettings.featuredContentSource !== settings.featuredContentSource ||
      JSON.stringify(persistentStore.lastSettings.selectedHeroCatalogs) !== JSON.stringify(settings.selectedHeroCatalogs);
    
    // Update our tracking of last used settings
    persistentStore.lastSettings = {
      showHeroSection: settings.showHeroSection,
      featuredContentSource: settings.featuredContentSource,
      selectedHeroCatalogs: [...settings.selectedHeroCatalogs]
    };
    
    // Force refresh if settings changed during app restart
    if (settingsChanged) {
      loadFeaturedContent(true);
    }
  }, [settings, loadFeaturedContent]);

  // Subscribe directly to settings emitter for immediate updates
  useEffect(() => {
    const handleSettingsChange = () => {
      // Only refresh if current content source is different from settings
      // This prevents duplicate refreshes when HomeScreen also handles this event
      if (contentSource !== settings.featuredContentSource) {
        console.log('Content source changed, refreshing featured content');
        console.log('Current content source:', contentSource);
        console.log('New settings source:', settings.featuredContentSource);
        // Content source will be updated in the next render cycle due to state updates
        // No need to call loadFeaturedContent here as it will be triggered by contentSource change
      } else if (
        contentSource === 'catalogs' && 
        JSON.stringify(selectedCatalogs) !== JSON.stringify(settings.selectedHeroCatalogs)
      ) {
        // Only refresh if using catalogs and selected catalogs changed
        console.log('Selected catalogs changed, refreshing featured content');
        loadFeaturedContent(true);
      }
    };
    
    // Subscribe to settings changes
    const unsubscribe = settingsEmitter.addListener(handleSettingsChange);
    
    return unsubscribe;
  }, [loadFeaturedContent, settings, contentSource, selectedCatalogs]);

  // Load featured content initially and when content source changes
  useEffect(() => {
    if (!settings.showHeroSection) {
      setFeaturedContent(null);
      setAllFeaturedContent([]);
      setLoading(false);
      return;
    }

    // Only load if we don't have cached data or if settings actually changed
    const now = Date.now();
    const cacheAge = now - persistentStore.lastFetchTime;
    const hasValidCache = persistentStore.featuredContent && 
                         persistentStore.allFeaturedContent.length > 0 && 
                         cacheAge < CACHE_TIMEOUT;

    // Check if this is truly a settings change or just a re-render
    const sourceChanged = persistentStore.lastSettings.featuredContentSource !== contentSource;
    const catalogsChanged = JSON.stringify(persistentStore.lastSettings.selectedHeroCatalogs) !== JSON.stringify(selectedCatalogs);

    if (hasValidCache && !sourceChanged && !catalogsChanged) {
      // Use existing cache without reloading
      console.log('Using existing cached featured content, no reload needed');
      setFeaturedContent(persistentStore.featuredContent);
      setAllFeaturedContent(persistentStore.allFeaturedContent);
      setLoading(false);
      return;
    }

    // Force refresh when switching modes or when selection changes
    if (sourceChanged || catalogsChanged) {
      console.log('Settings changed, refreshing featured content');
      // Clear cache when switching modes
      setAllFeaturedContent([]);
      setFeaturedContent(null);
      persistentStore.allFeaturedContent = [];
      persistentStore.featuredContent = null;
      loadFeaturedContent(true);
    } else {
      // Normal load (might use cache if available)
      loadFeaturedContent(false);
    }
  }, [loadFeaturedContent, contentSource, selectedCatalogs, settings.showHeroSection]);

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

    const rotateContent = () => {
      currentIndexRef.current = (currentIndexRef.current + 1) % allFeaturedContent.length;
      if (allFeaturedContent[currentIndexRef.current]) {
        const newContent = allFeaturedContent[currentIndexRef.current];
        setFeaturedContent(newContent);
        // Also update the persistent store
        persistentStore.featuredContent = newContent;
      }
    };

    const intervalId = setInterval(rotateContent, 15000);

    return () => clearInterval(intervalId);
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
    loading, 
    isSaved, 
    handleSaveToLibrary, 
    refreshFeatured
  };
} 