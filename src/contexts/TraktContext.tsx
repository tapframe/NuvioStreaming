import React, { createContext, useContext, ReactNode } from 'react';
import { useTraktIntegration } from '../hooks/useTraktIntegration';
import { TraktUser, TraktWatchedItem } from '../services/traktService';

interface TraktContextProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  userProfile: TraktUser | null;
  watchedMovies: TraktWatchedItem[];
  watchedShows: TraktWatchedItem[];
  checkAuthStatus: () => Promise<void>;
  refreshAuthStatus: () => Promise<void>;
  loadWatchedItems: () => Promise<void>;
  isMovieWatched: (imdbId: string) => Promise<boolean>;
  isEpisodeWatched: (imdbId: string, season: number, episode: number) => Promise<boolean>;
  markMovieAsWatched: (imdbId: string, watchedAt?: Date) => Promise<boolean>;
  markEpisodeAsWatched: (imdbId: string, season: number, episode: number, watchedAt?: Date) => Promise<boolean>;
  forceSyncTraktProgress?: () => Promise<boolean>;
}

const TraktContext = createContext<TraktContextProps | undefined>(undefined);

export function TraktProvider({ children }: { children: ReactNode }) {
  const traktIntegration = useTraktIntegration();
  
  return (
    <TraktContext.Provider value={traktIntegration}>
      {children}
    </TraktContext.Provider>
  );
}

export function useTraktContext() {
  const context = useContext(TraktContext);
  if (context === undefined) {
    throw new Error('useTraktContext must be used within a TraktProvider');
  }
  return context;
} 