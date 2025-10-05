import { useState, useEffect, useCallback } from 'react';
import { TraktService, TraktContentComment } from '../services/traktService';
import { logger } from '../utils/logger';

interface UseTraktCommentsProps {
  imdbId: string;
  tmdbId?: number;
  type: 'movie' | 'show' | 'season' | 'episode';
  season?: number;
  episode?: number;
  enabled?: boolean;
}

export const useTraktComments = ({
  imdbId,
  tmdbId,
  type,
  season,
  episode,
  enabled = true
}: UseTraktCommentsProps) => {
  const [comments, setComments] = useState<TraktContentComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const COMMENTS_PER_PAGE = 10;

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const traktService = TraktService.getInstance();
        const authenticated = await traktService.isAuthenticated();
        setIsAuthenticated(authenticated);
      } catch (error) {
        logger.error('[useTraktComments] Failed to check authentication:', error);
        setIsAuthenticated(false);
      }
    };

    if (enabled) {
      checkAuth();
    }
  }, [enabled]);

  const loadComments = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!enabled || !imdbId || !isAuthenticated) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const traktService = TraktService.getInstance();
      let fetchedComments: TraktContentComment[] = [];

      console.log(`[useTraktComments] Loading comments for ${type} - IMDb: ${imdbId}, TMDB: ${tmdbId}, page: ${pageNum}`);

      switch (type) {
        case 'movie':
          fetchedComments = await traktService.getMovieComments(imdbId, tmdbId, pageNum, COMMENTS_PER_PAGE);
          break;
        case 'show':
          fetchedComments = await traktService.getShowComments(imdbId, tmdbId, pageNum, COMMENTS_PER_PAGE);
          break;
        case 'season':
          if (season !== undefined) {
            fetchedComments = await traktService.getSeasonComments(imdbId, season, pageNum, COMMENTS_PER_PAGE);
          }
          break;
        case 'episode':
          if (season !== undefined && episode !== undefined) {
            fetchedComments = await traktService.getEpisodeComments(imdbId, season, episode, pageNum, COMMENTS_PER_PAGE);
          }
          break;
      }

      // Check if there are more comments (basic heuristic: if we got the full page, there might be more)
      setHasMore(fetchedComments.length === COMMENTS_PER_PAGE);

      setComments(prevComments => {
        if (append) {
          const newComments = [...prevComments, ...fetchedComments];
          console.log(`[useTraktComments] Appended ${fetchedComments.length} comments, total: ${newComments.length}`);
          return newComments;
        } else {
          console.log(`[useTraktComments] Loaded ${fetchedComments.length} comments`);
          return fetchedComments;
        }
      });

      setPage(pageNum);
    } catch (error) {
      logger.error('[useTraktComments] Failed to load comments:', error);
      setError(error instanceof Error ? error.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [enabled, imdbId, tmdbId, type, season, episode, isAuthenticated]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore && isAuthenticated) {
      loadComments(page + 1, true);
    }
  }, [loading, hasMore, page, loadComments, isAuthenticated]);

  const refresh = useCallback(() => {
    loadComments(1, false);
  }, [loadComments]);

  // Initial load
  useEffect(() => {
    loadComments(1, false);
  }, [loadComments]);

  return {
    comments,
    loading,
    error,
    hasMore,
    isAuthenticated,
    loadMore,
    refresh
  };
};
