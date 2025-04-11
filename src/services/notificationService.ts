import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseISO, differenceInHours, isToday, addDays } from 'date-fns';
import { stremioService } from './stremioService';

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
  
  private constructor() {
    // Initialize notifications
    this.configureNotifications();
    this.loadSettings();
    this.loadScheduledNotifications();
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
      console.error('Error loading notification settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  }

  private async loadScheduledNotifications(): Promise<void> {
    try {
      const storedNotifications = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
      
      if (storedNotifications) {
        this.scheduledNotifications = JSON.parse(storedNotifications);
      }
    } catch (error) {
      console.error('Error loading scheduled notifications:', error);
    }
  }

  private async saveScheduledNotifications(): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(this.scheduledNotifications));
    } catch (error) {
      console.error('Error saving scheduled notifications:', error);
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
      
      // If notification time has already passed, set to now + 1 minute
      if (notificationTime < now) {
        notificationTime.setTime(now.getTime() + 60000);
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
      console.error('Error scheduling notification:', error);
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
      console.error('Error canceling notification:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      this.scheduledNotifications = [];
      await this.saveScheduledNotifications();
    } catch (error) {
      console.error('Error canceling all notifications:', error);
    }
  }

  getScheduledNotifications(): NotificationItem[] {
    return [...this.scheduledNotifications];
  }

  // Update notifications for a library item
  async updateNotificationsForSeries(seriesId: string): Promise<void> {
    try {
      // Get metadata for the series
      const metadata = await stremioService.getMetaDetails('series', seriesId);
      
      if (!metadata || !metadata.videos) {
        return;
      }
      
      // Get upcoming episodes
      const now = new Date();
      const fourWeeksLater = addDays(now, 28);
      
      const upcomingEpisodes = metadata.videos.filter(video => {
        if (!video.released) return false;
        const releaseDate = parseISO(video.released);
        return releaseDate > now && releaseDate < fourWeeksLater;
      });
      
      // Cancel existing notifications for this series
      this.scheduledNotifications = this.scheduledNotifications.filter(
        notification => notification.seriesId !== seriesId
      );
      
      // Schedule new notifications
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
      
      await this.scheduleMultipleEpisodeNotifications(notificationItems);
    } catch (error) {
      console.error(`Error updating notifications for series ${seriesId}:`, error);
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance(); 