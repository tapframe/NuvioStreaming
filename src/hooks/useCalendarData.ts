import React, { useState, useEffect, useCallback } from 'react';
import { useLibrary } from './useLibrary';
import { useTraktContext } from '../contexts/TraktContext';
import { robustCalendarCache } from '../services/robustCalendarCache';
import { stremioService } from '../services/stremioService';
import { tmdbService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import { parseISO, isBefore, isAfter, startOfToday, addWeeks, isThisWeek } from 'date-fns';
import { StreamingContent } from '../services/catalogService';

interface CalendarEpisode {
    id: string;
    seriesId: string;
    title: string;
    seriesName: string;
    poster: string;
    releaseDate: string;
    season: number;
    episode: number;
    overview: string;
    vote_average: number;
    still_path: string | null;
    season_poster_path: string | null;
  }
  
  interface CalendarSection {
    title: string;
    data: CalendarEpisode[];
  }

interface UseCalendarDataReturn {
  calendarData: CalendarSection[];
  loading: boolean;
  refresh: (force?: boolean) => void;
}

export const useCalendarData = (): UseCalendarDataReturn => {
    const [calendarData, setCalendarData] = useState<CalendarSection[]>([]);
    const [loading, setLoading] = useState(true);

    const { libraryItems, loading: libraryLoading } = useLibrary();
    const {
        isAuthenticated: traktAuthenticated,
        isLoading: traktLoading,
        watchedShows,
        watchlistShows,
        continueWatching,
        loadAllCollections,
    } = useTraktContext();

    const fetchCalendarData = useCallback(async (forceRefresh = false) => {
        logger.log("[CalendarData] Starting to fetch calendar data");
        setLoading(true);
        
        try {
          if (!forceRefresh) {
            const cachedData = await robustCalendarCache.getCachedCalendarData(
              libraryItems,
              {
                watchlist: watchlistShows,
                continueWatching: continueWatching,
                watched: watchedShows,
              }
            );
    
            if (cachedData) {
              logger.log(`[CalendarData] Using cached data with ${cachedData.length} sections`);
              setCalendarData(cachedData);
              setLoading(false);
              return;
            }
          }
    
          logger.log("[CalendarData] Fetching fresh data from APIs");
    
          const librarySeries = libraryItems.filter(item => item.type === 'series');
          let allSeries: StreamingContent[] = [...librarySeries];
          
          if (traktAuthenticated) {
            const traktSeriesIds = new Set();
            
            if (watchlistShows) {
              for (const item of watchlistShows) {
                if (item.show && item.show.ids.imdb) {
                  const imdbId = item.show.ids.imdb;
                  if (!librarySeries.some(s => s.id === imdbId)) {
                    traktSeriesIds.add(imdbId);
                    allSeries.push({
                      id: imdbId,
                      name: item.show.title,
                      type: 'series',
                      poster: '',
                      year: item.show.year,
                      traktSource: 'watchlist'
                    });
                  }
                }
              }
            }
            
            if (continueWatching) {
              for (const item of continueWatching) {
                if (item.type === 'episode' && item.show && item.show.ids.imdb) {
                  const imdbId = item.show.ids.imdb;
                  if (!librarySeries.some(s => s.id === imdbId) && !traktSeriesIds.has(imdbId)) {
                    traktSeriesIds.add(imdbId);
                    allSeries.push({
                      id: imdbId,
                      name: item.show.title,
                      type: 'series',
                      poster: '',
                      year: item.show.year,
                      traktSource: 'continue-watching'
                    });
                  }
                }
              }
            }
            
            if (watchedShows) {
              const recentWatched = watchedShows.slice(0, 20);
              for (const item of recentWatched) {
                if (item.show && item.show.ids.imdb) {
                  const imdbId = item.show.ids.imdb;
                  if (!librarySeries.some(s => s.id === imdbId) && !traktSeriesIds.has(imdbId)) {
                    traktSeriesIds.add(imdbId);
                    allSeries.push({
                      id: imdbId,
                      name: item.show.title,
                      type: 'series',
                      poster: '',
                      year: item.show.year,
                      traktSource: 'watched'
                    });
                  }
                }
              }
            }
          }
          
          logger.log(`[CalendarData] Total series to check: ${allSeries.length} (Library: ${librarySeries.length}, Trakt: ${allSeries.length - librarySeries.length})`);
          
          let allEpisodes: CalendarEpisode[] = [];
          let seriesWithoutEpisodes: CalendarEpisode[] = [];
          
          for (const series of allSeries) {
            try {
              const metadata = await stremioService.getMetaDetails(series.type, series.id);
              
              if (metadata?.videos && metadata.videos.length > 0) {
                const today = startOfToday();
                const fourWeeksLater = addWeeks(today, 4);
                const twoWeeksAgo = addWeeks(today, -2);
                
                const tmdbId = await tmdbService.findTMDBIdByIMDB(series.id);
                let tmdbEpisodes: { [key: string]: any } = {};
                
                if (tmdbId) {
                  const allTMDBEpisodes = await tmdbService.getAllEpisodes(tmdbId);
                  Object.values(allTMDBEpisodes).forEach(seasonEpisodes => {
                    seasonEpisodes.forEach(episode => {
                      const key = `${episode.season_number}:${episode.episode_number}`;
                      tmdbEpisodes[key] = episode;
                    });
                  });
                }
                
                const upcomingEpisodes = metadata.videos
                  .filter(video => {
                    if (!video.released) return false;
                    const releaseDate = parseISO(video.released);
                    return isBefore(releaseDate, fourWeeksLater) && isAfter(releaseDate, twoWeeksAgo);
                  })
                  .map(video => {
                    const tmdbEpisode = tmdbEpisodes[`${video.season}:${video.episode}`] || {};
                    return {
                      id: video.id,
                      seriesId: series.id,
                      title: tmdbEpisode.name || video.title || `Episode ${video.episode}`,
                      seriesName: series.name || metadata.name,
                      poster: series.poster || metadata.poster || '',
                      releaseDate: video.released,
                      season: video.season || 0,
                      episode: video.episode || 0,
                      overview: tmdbEpisode.overview || '',
                      vote_average: tmdbEpisode.vote_average || 0,
                      still_path: tmdbEpisode.still_path || null,
                      season_poster_path: tmdbEpisode.season_poster_path || null
                    };
                  });
                
                if (upcomingEpisodes.length > 0) {
                  allEpisodes = [...allEpisodes, ...upcomingEpisodes];
                } else {
                  seriesWithoutEpisodes.push({ id: series.id, seriesId: series.id, title: 'No upcoming episodes', seriesName: series.name || (metadata?.name || ''), poster: series.poster || (metadata?.poster || ''), releaseDate: '', season: 0, episode: 0, overview: '', vote_average: 0, still_path: null, season_poster_path: null });
                }
              } else {
                seriesWithoutEpisodes.push({ id: series.id, seriesId: series.id, title: 'No upcoming episodes', seriesName: series.name || (metadata?.name || ''), poster: series.poster || (metadata?.poster || ''), releaseDate: '', season: 0, episode: 0, overview: '', vote_average: 0, still_path: null, season_poster_path: null });
              }
            } catch (error) {
              logger.error(`Error fetching episodes for ${series.name}:`, error);
            }
          }
          
          allEpisodes.sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());
          
          const thisWeekEpisodes = allEpisodes.filter(ep => isThisWeek(parseISO(ep.releaseDate)));
          const upcomingEpisodes = allEpisodes.filter(ep => isAfter(parseISO(ep.releaseDate), new Date()) && !isThisWeek(parseISO(ep.releaseDate)));
          const recentEpisodes = allEpisodes.filter(ep => isBefore(parseISO(ep.releaseDate), new Date()) && !isThisWeek(parseISO(ep.releaseDate)));
          
          const sections: CalendarSection[] = [];
          if (thisWeekEpisodes.length > 0) sections.push({ title: 'This Week', data: thisWeekEpisodes });
          if (upcomingEpisodes.length > 0) sections.push({ title: 'Upcoming', data: upcomingEpisodes });
          if (recentEpisodes.length > 0) sections.push({ title: 'Recently Released', data: recentEpisodes });
          if (seriesWithoutEpisodes.length > 0) sections.push({ title: 'Series with No Scheduled Episodes', data: seriesWithoutEpisodes });
          
          setCalendarData(sections);
          
          await robustCalendarCache.setCachedCalendarData(
            sections,
            libraryItems,
            { watchlist: watchlistShows, continueWatching: continueWatching, watched: watchedShows }
          );
    
        } catch (error) {
          logger.error('Error fetching calendar data:', error);
          await robustCalendarCache.setCachedCalendarData(
            [],
            libraryItems,
            { watchlist: watchlistShows, continueWatching: continueWatching, watched: watchedShows },
            true
          );
        } finally {
          setLoading(false);
        }
      }, [libraryItems, traktAuthenticated, watchlistShows, continueWatching, watchedShows]);

    useEffect(() => {
        if (!libraryLoading && !traktLoading) {
            if (traktAuthenticated && (!watchlistShows || !continueWatching || !watchedShows)) {
                loadAllCollections();
            } else {
                fetchCalendarData();
            }
        } else if (!libraryLoading && !traktAuthenticated) {
            fetchCalendarData();
        }
    }, [libraryItems, libraryLoading, traktLoading, traktAuthenticated, watchlistShows, continueWatching, watchedShows, fetchCalendarData, loadAllCollections]);

    const refresh = useCallback((force = false) => {
        fetchCalendarData(force);
    }, [fetchCalendarData]);

    return {
        calendarData,
        loading,
        refresh,
    };
};

 