import { useState, useEffect, useCallback, useRef } from 'react';
import { StreamingContent, catalogService } from '../services/catalogService';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import * as Haptics from 'expo-haptics';
import { useGenres } from '../contexts/GenreContext';
import { useSettings, settingsEmitter } from './useSettings';

export function useFeaturedContent() {
  const [featuredContent, setFeaturedContent] = useState<StreamingContent | null>(null);
  const [allFeaturedContent, setAllFeaturedContent] = useState<StreamingContent[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const currentIndexRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { settings } = useSettings();
  const [contentSource, setContentSource] = useState<'tmdb' | 'catalogs'>(settings.featuredContentSource);
  const [selectedCatalogs, setSelectedCatalogs] = useState<string[]>(settings.selectedHeroCatalogs || []);

  const { genreMap, loadingGenres } = useGenres();

  // Update local state when settings change
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

  const loadFeaturedContent = useCallback(async () => {
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
              console.log(`Checking catalog: ${catalogId}, selected: ${selectedCatalogs.includes(catalogId)}`);
              return selectedCatalogs.includes(catalogId);
            })
          : catalogs; // Use all catalogs if none specifically selected

        console.log(`Original catalogs: ${catalogs.length}, Filtered catalogs: ${filteredCatalogs.length}`);

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

      setAllFeaturedContent(formattedContent);
      
      if (formattedContent.length > 0) {
        setFeaturedContent(formattedContent[0]); 
        currentIndexRef.current = 0;
      } else {
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

  // Load featured content initially and when content source changes
  useEffect(() => {
    // Force a full refresh to get updated logos
    if (contentSource === 'tmdb') {
      setAllFeaturedContent([]);
      setFeaturedContent(null);
    }
    loadFeaturedContent();
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

    const rotateContent = () => {
      currentIndexRef.current = (currentIndexRef.current + 1) % allFeaturedContent.length;
      if (allFeaturedContent[currentIndexRef.current]) {
        setFeaturedContent(allFeaturedContent[currentIndexRef.current]);
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

  return { 
    featuredContent, 
    loading, 
    isSaved, 
    handleSaveToLibrary, 
    refreshFeatured: loadFeaturedContent 
  };
} 