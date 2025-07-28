import * as Notifications from 'expo-notifications';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseISO, differenceInHours, isToday, addDays, isAfter, startOfToday } from 'date-fns';
import { stremioService } from './stremioService';
import { catalogService } from './catalogService';
import { traktService } from './traktService';
import { tmdbService } from './tmdbService';
import { logger } from '../utils/logger';

// Define notification storage keys
const NOTIFICATION_STORAGE_KEY = 'stremio-notifications';
const NOTIFICATION_SETTINGS_KEY = 'stremio-notification-settings';

// Import the correct type from Notifications
const { SchedulableTriggerInputTypes } = Notifications;

// Notification settings interface
export interface NotificationSettings {
  enabled: boolean;
  newEpisodeNotifications: boolean;
  reminderNotifications: boolean;
  upcomingShowsNotifications: boolean;
  timeBeforeAiring: number; // in hours
}

// Default notification settings
const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  newEpisodeNotifications: true,
  reminderNotifications: true,
  upcomingShowsNotifications: true,
  timeBeforeAiring: 24, // 24 hours before airing
};

// Episode notification item
export interface NotificationItem {
  id: string;
  seriesId: string;
  seriesName: string;
  episodeTitle: string;
  season: number;
  episode: number;
  releaseDate: string;
  notified: boolean;
  poster?: string;
}

class NotificationService {
  private static instance: NotificationService;
  private settings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS;
  private scheduledNotifications: NotificationItem[] = [];
  private backgroundSyncInterval: NodeJS.Timeout | null = null;
  private librarySubscription: (() => void) | null = null;
  private appStateSubscription: any = null;
  private lastSyncTime: number = 0;
  private readonly MIN_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes minimum between syncs
  
  private constructor() {
    // Initialize notifications
    this.configureNotifications();
    this.loadSettings();
    this.loadScheduledNotifications();
    this.setupLibraryIntegration();
    this.setupBackgroundSync();
    this.setupAppStateHandling();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async configureNotifications() {
    // Configure notification behavior
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Request permissions if needed
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        // Handle permission denied
        this.settings.enabled = false;
        await this.saveSettings();
      }
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const storedSettings = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      
      if (storedSettings) {
        this.settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(storedSettings) };
      }
    } catch (error) {
      logger.error('Error loading notification settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      logger.error('Error saving notification settings:', error);
    }
  }

  private async loadScheduledNotifications(): Promise<void> {
    try {
      const storedNotifications = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
      
      if (storedNotifications) {
        this.scheduledNotifications = JSON.parse(storedNotifications);
      }
    } catch (error) {
      logger.error('Error loading scheduled notifications:', error);
    }
  }

  private async saveScheduledNotifications(): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(this.scheduledNotifications));
    } catch (error) {
      logger.error('Error saving scheduled notifications:', error);
    }
  }

  async updateSettings(settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
    this.settings = { ...this.settings, ...settings };
    await this.saveSettings();
    return this.settings;
  }

  async getSettings(): Promise<NotificationSettings> {
    return this.settings;
  }

  async scheduleEpisodeNotification(item: NotificationItem): Promise<string | null> {
    if (!this.settings.enabled || !this.settings.newEpisodeNotifications) {
      return null;
    }

    // Check if notification already exists for this episode
    const existingNotification = this.scheduledNotifications.find(
      notification => notification.seriesId === item.seriesId && 
                     notification.season === item.season && 
                     notification.episode === item.episode
    );
    if (existingNotification) {
      return null; // Don't schedule duplicate notifications
    }

    const releaseDate = parseISO(item.releaseDate);
    const now = new Date();
    
    // If release date has already passed, don't schedule
    if (releaseDate < now) {
      return null;
    }
    
    try {
      // Calculate notification time (default to 24h before air time)
      const notificationTime = new Date(releaseDate);
      notificationTime.setHours(notificationTime.getHours() - this.settings.timeBeforeAiring);
      
      // If notification time has already passed, don't schedule the notification
      if (notificationTime < now) {
        return null;
      }
      
      // Schedule the notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `New Episode: ${item.seriesName}`,
          body: `S${item.season}:E${item.episode} - ${item.episodeTitle} is airing soon!`,
          data: {
            seriesId: item.seriesId,
            episodeId: item.id,
          },
        },
        trigger: {
          date: notificationTime,
          type: SchedulableTriggerInputTypes.DATE,
        },
      });
      
      // Add to scheduled notifications
      this.scheduledNotifications.push({
        ...item,
        notified: false,
      });
      
      // Save to storage
      await this.saveScheduledNotifications();
      
      return notificationId;
    } catch (error) {
      logger.error('Error scheduling notification:', error);
      return null;
    }
  }

  async scheduleMultipleEpisodeNotifications(items: NotificationItem[]): Promise<number> {
    if (!this.settings.enabled) {
      return 0;
    }
    
    let scheduledCount = 0;
    
    for (const item of items) {
      const notificationId = await this.scheduleEpisodeNotification(item);
      if (notificationId) {
        scheduledCount++;
      }
    }
    
    return scheduledCount;
  }

  async cancelNotification(id: string): Promise<void> {
    try {
      // Cancel with Expo
      await Notifications.cancelScheduledNotificationAsync(id);
      
      // Remove from our tracked notifications
      this.scheduledNotifications = this.scheduledNotifications.filter(
        notification => notification.id !== id
      );
      
      // Save updated list
      await this.saveScheduledNotifications();
    } catch (error) {
      logger.error('Error canceling notification:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      this.scheduledNotifications = [];
      await this.saveScheduledNotifications();
    } catch (error) {
      logger.error('Error canceling all notifications:', error);
    }
  }

  getScheduledNotifications(): NotificationItem[] {
    return [...this.scheduledNotifications];
  }

  // Setup library integration - automatically sync notifications when library changes
  private setupLibraryIntegration(): void {
    try {
      // Subscribe to library updates from catalog service
      this.librarySubscription = catalogService.subscribeToLibraryUpdates(async (libraryItems) => {
        if (!this.settings.enabled) return;
        
        const now = Date.now();
        const timeSinceLastSync = now - this.lastSyncTime;
        
        // Only sync if enough time has passed since last sync
        if (timeSinceLastSync >= this.MIN_SYNC_INTERVAL) {
          // Reduced logging verbosity
          // logger.log('[NotificationService] Library updated, syncing notifications for', libraryItems.length, 'items');
          await this.syncNotificationsForLibrary(libraryItems);
        } else {
          // logger.log(`[NotificationService] Library updated, but skipping sync (last sync ${Math.round(timeSinceLastSync / 1000)}s ago)`);
        }
      });
    } catch (error) {
      logger.error('[NotificationService] Error setting up library integration:', error);
    }
  }

  // Setup background sync for notifications
  private setupBackgroundSync(): void {
    // Sync notifications every 6 hours
    this.backgroundSyncInterval = setInterval(async () => {
      if (this.settings.enabled) {
        // Reduced logging verbosity
        // logger.log('[NotificationService] Running background notification sync');
        await this.performBackgroundSync();
      }
    }, 6 * 60 * 60 * 1000); // 6 hours
  }

  // Setup app state handling for foreground sync
  private setupAppStateHandling(): void {
    const subscription = AppState.addEventListener('change', this.handleAppStateChange);
    // Store subscription for cleanup
    this.appStateSubscription = subscription;
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active' && this.settings.enabled) {
      const now = Date.now();
      const timeSinceLastSync = now - this.lastSyncTime;
      
      // Only sync if enough time has passed since last sync
      if (timeSinceLastSync >= this.MIN_SYNC_INTERVAL) {
        // App came to foreground, sync notifications
        // Reduced logging verbosity
        // logger.log('[NotificationService] App became active, syncing notifications');
        await this.performBackgroundSync();
      } else {
        // logger.log(`[NotificationService] App became active, but skipping sync (last sync ${Math.round(timeSinceLastSync / 1000)}s ago)`);
      }
    }
  };

  // Sync notifications for all library items
  private async syncNotificationsForLibrary(libraryItems: any[]): Promise<void> {
    try {
      const seriesItems = libraryItems.filter(item => item.type === 'series');
      
      for (const series of seriesItems) {
        await this.updateNotificationsForSeries(series.id);
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Reduced logging verbosity
      // logger.log(`[NotificationService] Synced notifications for ${seriesItems.length} series from library`);
    } catch (error) {
      logger.error('[NotificationService] Error syncing library notifications:', error);
    }
  }

  // Perform comprehensive background sync including Trakt integration
  private async performBackgroundSync(): Promise<void> {
    try {
      // Update last sync time at the start
      this.lastSyncTime = Date.now();
      
      // Reduced logging verbosity
      // logger.log('[NotificationService] Starting comprehensive background sync');
      
      // Get library items
      const libraryItems = catalogService.getLibraryItems();
      await this.syncNotificationsForLibrary(libraryItems);
      
      // Sync Trakt items if authenticated
      await this.syncTraktNotifications();
      
      // Clean up old notifications
      await this.cleanupOldNotifications();
      
      // Reduced logging verbosity
      // logger.log('[NotificationService] Background sync completed');
    } catch (error) {
      logger.error('[NotificationService] Error in background sync:', error);
    }
  }

  // Sync notifications for comprehensive Trakt data (same as calendar screen)
  private async syncTraktNotifications(): Promise<void> {
    try {
      const isAuthenticated = await traktService.isAuthenticated();
      if (!traktService.isAuthenticated()) {
        // Reduced logging verbosity
        // logger.log('[NotificationService] Trakt not authenticated, skipping Trakt sync');
        return;
      }

      // Reduced logging verbosity
      // logger.log('[NotificationService] Syncing comprehensive Trakt notifications');
      
      // Get all Trakt data sources (same as calendar screen uses)
      const [watchlistShows, continueWatching, watchedShows, collectionShows] = await Promise.all([
        traktService.getWatchlistShows(),
        traktService.getPlaybackProgress('shows'), // This is the continue watching data
        traktService.getWatchedShows(),
        traktService.getCollectionShows()
      ]);

      // Combine and deduplicate shows using the same logic as calendar screen
      const allTraktShows = new Map();
      
      // Add watchlist shows
      if (watchlistShows) {
        watchlistShows.forEach((item: any) => {
          if (item.show && item.show.ids.imdb) {
            allTraktShows.set(item.show.ids.imdb, {
              id: item.show.ids.imdb,
              name: item.show.title,
              type: 'series',
              year: item.show.year,
              source: 'trakt-watchlist'
            });
          }
        });
      }

      // Add continue watching shows (in-progress shows)
      if (continueWatching) {
        continueWatching.forEach((item: any) => {
          if (item.type === 'episode' && item.show && item.show.ids.imdb) {
            const imdbId = item.show.ids.imdb;
            if (!allTraktShows.has(imdbId)) {
              allTraktShows.set(imdbId, {
                id: imdbId,
                name: item.show.title,
                type: 'series',
                year: item.show.year,
                source: 'trakt-continue-watching'
              });
            }
          }
        });
      }

      // Add recently watched shows (top 20, same as calendar)
      if (watchedShows) {
        const recentWatched = watchedShows.slice(0, 20);
        recentWatched.forEach((item: any) => {
          if (item.show && item.show.ids.imdb) {
            const imdbId = item.show.ids.imdb;
            if (!allTraktShows.has(imdbId)) {
              allTraktShows.set(imdbId, {
                id: imdbId,
                name: item.show.title,
                type: 'series',
                year: item.show.year,
                source: 'trakt-watched'
              });
            }
          }
        });
      }

      // Add collection shows
      if (collectionShows) {
        collectionShows.forEach((item: any) => {
          if (item.show && item.show.ids.imdb) {
            const imdbId = item.show.ids.imdb;
            if (!allTraktShows.has(imdbId)) {
              allTraktShows.set(imdbId, {
                id: imdbId,
                name: item.show.title,
                type: 'series',
                year: item.show.year,
                source: 'trakt-collection'
              });
            }
          }
        });
      }

      // Reduced logging verbosity
      // logger.log(`[NotificationService] Found ${allTraktShows.size} unique Trakt shows from all sources`);

      // Sync notifications for each Trakt show
      let syncedCount = 0;
      for (const show of allTraktShows.values()) {
        try {
          await this.updateNotificationsForSeries(show.id);
          syncedCount++;
          // Small delay to prevent API rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          logger.error(`[NotificationService] Failed to sync notifications for ${show.name}:`, error);
        }
      }

      // Reduced logging verbosity
      // logger.log(`[NotificationService] Successfully synced notifications for ${syncedCount}/${allTraktShows.size} Trakt shows`);
    } catch (error) {
      logger.error('[NotificationService] Error syncing Trakt notifications:', error);
    }
  }

  // Enhanced series notification update with TMDB fallback
  async updateNotificationsForSeries(seriesId: string): Promise<void> {
    try {
      // Reduced logging verbosity - only log for debug purposes
      // logger.log(`[NotificationService] Updating notifications for series: ${seriesId}`);
      
      // Try Stremio first
      let metadata = await stremioService.getMetaDetails('series', seriesId);
      let upcomingEpisodes: any[] = [];
      
      if (metadata && metadata.videos) {
        const now = new Date();
        const fourWeeksLater = addDays(now, 28);
        
        upcomingEpisodes = metadata.videos.filter(video => {
          if (!video.released) return false;
          const releaseDate = parseISO(video.released);
          return releaseDate > now && releaseDate < fourWeeksLater;
        }).map(video => ({
          id: video.id,
          title: (video as any).title || (video as any).name || `Episode ${video.episode}`,
          season: video.season || 0,
          episode: video.episode || 0,
          released: video.released,
        }));
      }

      // If no upcoming episodes from Stremio, try TMDB
      if (upcomingEpisodes.length === 0) {
        try {
          // Extract TMDB ID if it's a TMDB format ID
          let tmdbId = seriesId;
          if (seriesId.startsWith('tmdb:')) {
            tmdbId = seriesId.split(':')[1];
          }

          const tmdbDetails = await tmdbService.getTVShowDetails(parseInt(tmdbId));
          if (tmdbDetails) {
            metadata = {
              id: seriesId,
              type: 'series' as const,
              name: tmdbDetails.name,
              poster: tmdbService.getImageUrl(tmdbDetails.poster_path) || '',
            };

            // Get upcoming episodes from TMDB
            const now = new Date();
            const fourWeeksLater = addDays(now, 28);
            
            // Check current and next seasons for upcoming episodes
            for (let seasonNum = tmdbDetails.number_of_seasons; seasonNum >= Math.max(1, tmdbDetails.number_of_seasons - 2); seasonNum--) {
              try {
                const seasonDetails = await tmdbService.getSeasonDetails(parseInt(tmdbId), seasonNum);
                if (seasonDetails && seasonDetails.episodes) {
                  const seasonUpcoming = seasonDetails.episodes.filter((episode: any) => {
                    if (!episode.air_date) return false;
                    const airDate = parseISO(episode.air_date);
                    return airDate > now && airDate < fourWeeksLater;
                  });

                  upcomingEpisodes.push(...seasonUpcoming.map((episode: any) => ({
                    id: `${tmdbId}-s${seasonNum}e${episode.episode_number}`,
                    title: episode.name,
                    season: seasonNum,
                    episode: episode.episode_number,
                    released: episode.air_date,
                  })));
                }
              } catch (seasonError) {
                // Continue with other seasons if one fails
              }
            }
          }
        } catch (tmdbError) {
          logger.warn(`[NotificationService] TMDB fallback failed for ${seriesId}:`, tmdbError);
        }
      }
      
      if (!metadata) {
        logger.warn(`[NotificationService] No metadata found for series: ${seriesId}`);
        return;
      }
      
      // Cancel existing notifications for this series
      const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of existingNotifications) {
        if (notification.content.data?.seriesId === seriesId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        }
      }
      
      // Remove from our tracked notifications
      this.scheduledNotifications = this.scheduledNotifications.filter(
        notification => notification.seriesId !== seriesId
      );
      
      // Schedule new notifications for upcoming episodes
      if (upcomingEpisodes.length > 0) {
        const notificationItems: NotificationItem[] = upcomingEpisodes.map(episode => ({
          id: episode.id,
          seriesId,
          seriesName: metadata.name,
          episodeTitle: episode.title,
          season: episode.season || 0,
          episode: episode.episode || 0,
          releaseDate: episode.released,
          notified: false,
          poster: metadata.poster,
        }));
        
        const scheduledCount = await this.scheduleMultipleEpisodeNotifications(notificationItems);
        // Reduced logging verbosity
        // logger.log(`[NotificationService] Scheduled ${scheduledCount} notifications for ${metadata.name}`);
      } else {
        // logger.log(`[NotificationService] No upcoming episodes found for ${metadata.name}`);
      }
    } catch (error) {
      logger.error(`[NotificationService] Error updating notifications for series ${seriesId}:`, error);
    }
  }

  // Clean up old and expired notifications
  private async cleanupOldNotifications(): Promise<void> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Remove notifications for episodes that have already aired
      const validNotifications = this.scheduledNotifications.filter(notification => {
        const releaseDate = parseISO(notification.releaseDate);
        return releaseDate > oneDayAgo;
      });
      
      if (validNotifications.length !== this.scheduledNotifications.length) {
        this.scheduledNotifications = validNotifications;
        await this.saveScheduledNotifications();
        // Reduced logging verbosity
         // logger.log(`[NotificationService] Cleaned up ${this.scheduledNotifications.length - validNotifications.length} old notifications`);
      }
    } catch (error) {
      logger.error('[NotificationService] Error cleaning up notifications:', error);
    }
  }

  // Public method to manually trigger sync for all library items
  public async syncAllNotifications(): Promise<void> {
    // Reduced logging verbosity
    // logger.log('[NotificationService] Manual sync triggered');
    await this.performBackgroundSync();
  }

  // Public method to get notification stats
  public getNotificationStats(): { total: number; upcoming: number; thisWeek: number } {
    const now = new Date();
    const oneWeekLater = addDays(now, 7);
    
    const upcoming = this.scheduledNotifications.filter(notification => {
      const releaseDate = parseISO(notification.releaseDate);
      return releaseDate > now;
    });
    
    const thisWeek = upcoming.filter(notification => {
      const releaseDate = parseISO(notification.releaseDate);
      return releaseDate < oneWeekLater;
    });
    
    return {
      total: this.scheduledNotifications.length,
      upcoming: upcoming.length,
      thisWeek: thisWeek.length
    };
  }

  // Cleanup method for proper disposal
  public destroy(): void {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = null;
    }
    
    if (this.librarySubscription) {
      this.librarySubscription();
      this.librarySubscription = null;
    }
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();