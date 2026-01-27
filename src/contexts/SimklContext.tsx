import React, { createContext, useContext, ReactNode } from 'react';
import { useSimklIntegration } from '../hooks/useSimklIntegration';
import {
  SimklWatchlistItem,
  SimklPlaybackData,
  SimklRatingItem,
  SimklUserSettings,
  SimklStats,
  SimklStatus
} from '../services/simklService';

export interface SimklContextProps {
  // Authentication
  isAuthenticated: boolean;
  isLoading: boolean;
  userSettings: SimklUserSettings | null;
  userStats: SimklStats | null;

  // Collections - Shows
  watchingShows: SimklWatchlistItem[];
  planToWatchShows: SimklWatchlistItem[];
  completedShows: SimklWatchlistItem[];
  onHoldShows: SimklWatchlistItem[];
  droppedShows: SimklWatchlistItem[];

  // Collections - Movies
  watchingMovies: SimklWatchlistItem[];
  planToWatchMovies: SimklWatchlistItem[];
  completedMovies: SimklWatchlistItem[];
  onHoldMovies: SimklWatchlistItem[];
  droppedMovies: SimklWatchlistItem[];

  // Collections - Anime
  watchingAnime: SimklWatchlistItem[];
  planToWatchAnime: SimklWatchlistItem[];
  completedAnime: SimklWatchlistItem[];
  onHoldAnime: SimklWatchlistItem[];
  droppedAnime: SimklWatchlistItem[];

  // Special collections
  continueWatching: SimklPlaybackData[];
  ratedContent: SimklRatingItem[];

  // Lookup Sets (for O(1) status checks)
  watchingSet: Set<string>;
  planToWatchSet: Set<string>;
  completedSet: Set<string>;
  onHoldSet: Set<string>;
  droppedSet: Set<string>;

  // Methods
  checkAuthStatus: () => Promise<void>;
  refreshAuthStatus: () => Promise<void>;
  loadAllCollections: () => Promise<void>;
  addToStatus: (imdbId: string, type: 'movie' | 'show' | 'anime', status: SimklStatus) => Promise<boolean>;
  removeFromStatus: (imdbId: string, type: 'movie' | 'show' | 'anime', status: SimklStatus) => Promise<boolean>;
  isInStatus: (imdbId: string, type: 'movie' | 'show' | 'anime', status: SimklStatus) => boolean;

  // Scrobbling methods (from existing hook)
  startWatching?: (content: any, progress: number) => Promise<boolean>;
  updateProgress?: (content: any, progress: number) => Promise<boolean>;
  stopWatching?: (content: any, progress: number) => Promise<boolean>;
  syncAllProgress?: () => Promise<boolean>;
  fetchAndMergeSimklProgress?: () => Promise<boolean>;
}

const SimklContext = createContext<SimklContextProps | undefined>(undefined);

export function SimklProvider({ children }: { children: ReactNode }) {
  const simklIntegration = useSimklIntegration();

  return (
    <SimklContext.Provider value={simklIntegration}>
      {children}
    </SimklContext.Provider>
  );
}

export function useSimklContext() {
  const context = useContext(SimklContext);
  if (context === undefined) {
    throw new Error('useSimklContext must be used within a SimklProvider');
  }
  return context;
}
