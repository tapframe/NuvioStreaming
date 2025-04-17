import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo } from 'react';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';

// Define the shape of the genre map and context value
export type GenreMap = { [key: number]: string };

interface GenreContextType {
  genreMap: GenreMap;
  loadingGenres: boolean;
}

// Create the context with a default value
const GenreContext = createContext<GenreContextType>({
  genreMap: {},
  loadingGenres: true,
});

// Custom hook to use the GenreContext
export const useGenres = () => useContext(GenreContext);

// Define props for the provider
interface GenreProviderProps {
  children: ReactNode;
}

// Create the provider component
export const GenreProvider: React.FC<GenreProviderProps> = ({ children }) => {
  const [genreMap, setGenreMap] = useState<GenreMap>({});
  const [loadingGenres, setLoadingGenres] = useState(true);

  useEffect(() => {
    const fetchAndSetGenres = async () => {
      setLoadingGenres(true);
      try {
        // Fetch both movie and TV genres in parallel
        const [movieGenres, tvGenres] = await Promise.all([
          tmdbService.getMovieGenres(),
          tmdbService.getTvGenres(),
        ]);

        // Combine genres into a single map, TV genres overwrite movie genres in case of ID collision (unlikely but possible)
        const combinedMap: GenreMap = {};
        movieGenres.forEach(genre => {
          combinedMap[genre.id] = genre.name;
        });
        tvGenres.forEach(genre => {
          combinedMap[genre.id] = genre.name;
        });

        setGenreMap(combinedMap);
        logger.info('Successfully fetched and combined genres.');
      } catch (error) {
        logger.error('Failed to fetch genres for GenreProvider:', error);
        // Keep the genreMap empty or potentially set some default?
        setGenreMap({}); 
      } finally {
        setLoadingGenres(false);
      }
    };

    fetchAndSetGenres();
    
    // Add logic here for periodic refetching or caching if needed
    // For now, it fetches only once on mount

  }, []); // Empty dependency array ensures this runs only once on mount

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    genreMap,
    loadingGenres,
  }), [genreMap, loadingGenres]);

  return (
    <GenreContext.Provider value={value}>
      {children}
    </GenreContext.Provider>
  );
}; 