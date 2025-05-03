import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { notificationService, NotificationSettings } from '../services/notificationService';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { logger } from '../utils/logger';

const NotificationSettingsScreen = () => {
  const navigation = useNavigation();
  const { currentTheme } = useTheme();
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    newEpisodeNotifications: true,
    reminderNotifications: true,
    upcomingShowsNotifications: true,
    timeBeforeAiring: 24,
  });
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [testNotificationId, setTestNotificationId] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await notificationService.getSettings();
        setSettings(savedSettings);
      } catch (error) {
        logger.error('Error loading notification settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Add countdown effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (countdown !== null && countdown > 0) {
      intervalId = setInterval(() => {
        setCountdown(prev => prev !== null ? prev - 1 : null);
      }, 1000);
    } else if (countdown === 0) {
      setCountdown(null);
      setTestNotificationId(null);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [countdown]);

  // Update a setting
  const updateSetting = async (key: keyof NotificationSettings, value: boolean | number) => {
    try {
      const updatedSettings = {
        ...settings,
        [key]: value,
      };
      
      // Special case: if enabling notifications, make sure permissions are granted
      if (key === 'enabled' && value === true) {
        // Permissions are handled in the service
      }
      
      // Update settings in the service
      await notificationService.updateSettings({ [key]: value });
      
      // Update local state
      setSettings(updatedSettings);
    } catch (error) {
      logger.error('Error updating notification settings:', error);
      Alert.alert('Error', 'Failed to update notification settings');
    }
  };

  // Set time before airing
  const setTimeBeforeAiring = (hours: number) => {
    updateSetting('timeBeforeAiring', hours);
  };

  const resetAllNotifications = async () => {
    Alert.alert(
      'Reset Notifications',
      'This will cancel all scheduled notifications. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await notificationService.cancelAllNotifications();
              Alert.alert('Success', 'All notifications have been reset');
            } catch (error) {
              logger.error('Error resetting notifications:', error);
              Alert.alert('Error', 'Failed to reset notifications');
            }
          },
        },
      ]
    );
  };

  const handleTestNotification = async () => {
    try {
      // Cancel previous test notification if exists
      if (testNotificationId) {
        await notificationService.cancelNotification(testNotificationId);
      }

      const testNotification = {
        id: 'test-notification-' + Date.now(),
        seriesId: 'test-series',
        seriesName: 'Test Show',
        episodeTitle: 'Test Episode',
        season: 1,
        episode: 1,
        releaseDate: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        notified: false
      };
      
      const notificationId = await notificationService.scheduleEpisodeNotification(testNotification);
      if (notificationId) {
        setTestNotificationId(notificationId);
        setCountdown(60); // Start 60 second countdown
        Alert.alert('Success', 'Test notification scheduled for 1 minute from now');
      } else {
        Alert.alert('Error', 'Failed to schedule test notification. Make sure notifications are enabled.');
      }
    } catch (error) {
      logger.error('Error scheduling test notification:', error);
      Alert.alert('Error', 'Failed to schedule test notification');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
        <View style={[styles.header, { borderBottomColor: currentTheme.colors.border }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>Notification Settings</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: currentTheme.colors.text }]}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      
      <View style={[styles.header, { borderBottomColor: currentTheme.colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>Notification Settings</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView style={styles.content}>
        <Animated.View 
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
        >
          <View style={[styles.section, { borderBottomColor: currentTheme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>General</Text>
            
            <View style={[styles.settingItem, { borderBottomColor: currentTheme.colors.border + '50' }]}>
              <View style={styles.settingInfo}>
                <MaterialIcons name="notifications" size={24} color={currentTheme.colors.text} />
                <Text style={[styles.settingText, { color: currentTheme.colors.text }]}>Enable Notifications</Text>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={(value) => updateSetting('enabled', value)}
                trackColor={{ false: currentTheme.colors.border, true: currentTheme.colors.primary + '80' }}
                thumbColor={settings.enabled ? currentTheme.colors.primary : currentTheme.colors.lightGray}
              />
            </View>
          </View>
          
          {settings.enabled && (
            <>
              <View style={[styles.section, { borderBottomColor: currentTheme.colors.border }]}>
                <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>Notification Types</Text>
                
                <View style={[styles.settingItem, { borderBottomColor: currentTheme.colors.border + '50' }]}>
                  <View style={styles.settingInfo}>
                    <MaterialIcons name="new-releases" size={24} color={currentTheme.colors.text} />
                    <Text style={[styles.settingText, { color: currentTheme.colors.text }]}>New Episodes</Text>
                  </View>
                  <Switch
                    value={settings.newEpisodeNotifications}
                    onValueChange={(value) => updateSetting('newEpisodeNotifications', value)}
                    trackColor={{ false: currentTheme.colors.border, true: currentTheme.colors.primary + '80' }}
                    thumbColor={settings.newEpisodeNotifications ? currentTheme.colors.primary : currentTheme.colors.lightGray}
                  />
                </View>
                
                <View style={[styles.settingItem, { borderBottomColor: currentTheme.colors.border + '50' }]}>
                  <View style={styles.settingInfo}>
                    <MaterialIcons name="event" size={24} color={currentTheme.colors.text} />
                    <Text style={[styles.settingText, { color: currentTheme.colors.text }]}>Upcoming Shows</Text>
                  </View>
                  <Switch
                    value={settings.upcomingShowsNotifications}
                    onValueChange={(value) => updateSetting('upcomingShowsNotifications', value)}
                    trackColor={{ false: currentTheme.colors.border, true: currentTheme.colors.primary + '80' }}
                    thumbColor={settings.upcomingShowsNotifications ? currentTheme.colors.primary : currentTheme.colors.lightGray}
                  />
                </View>
                
                <View style={[styles.settingItem, { borderBottomColor: currentTheme.colors.border + '50' }]}>
                  <View style={styles.settingInfo}>
                    <MaterialIcons name="alarm" size={24} color={currentTheme.colors.text} />
                    <Text style={[styles.settingText, { color: currentTheme.colors.text }]}>Reminders</Text>
                  </View>
                  <Switch
                    value={settings.reminderNotifications}
                    onValueChange={(value) => updateSetting('reminderNotifications', value)}
                    trackColor={{ false: currentTheme.colors.border, true: currentTheme.colors.primary + '80' }}
                    thumbColor={settings.reminderNotifications ? currentTheme.colors.primary : currentTheme.colors.lightGray}
                  />
                </View>
              </View>
              
              <View style={[styles.section, { borderBottomColor: currentTheme.colors.border }]}>
                <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>Notification Timing</Text>
                
                <Text style={[styles.settingDescription, { color: currentTheme.colors.lightGray }]}>
                  When should you be notified before an episode airs?
                </Text>
                
                <View style={styles.timingOptions}>
                  {[1, 6, 12, 24].map((hours) => (
                    <TouchableOpacity
                      key={hours}
                      style={[
                        styles.timingOption,
                        { 
                          backgroundColor: currentTheme.colors.elevation1,
                          borderColor: currentTheme.colors.border 
                        },
                        settings.timeBeforeAiring === hours && {
                          backgroundColor: currentTheme.colors.primary + '30',
                          borderColor: currentTheme.colors.primary,
                        }
                      ]}
                      onPress={() => setTimeBeforeAiring(hours)}
                    >
                      <Text style={[
                        styles.timingText,
                        { color: currentTheme.colors.text },
                        settings.timeBeforeAiring === hours && {
                          color: currentTheme.colors.primary,
                          fontWeight: 'bold',
                        }
                      ]}>
                        {hours === 1 ? '1 hour' : `${hours} hours`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <View style={[styles.section, { borderBottomColor: currentTheme.colors.border }]}>
                <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>Advanced</Text>
                
                <TouchableOpacity 
                  style={[
                    styles.resetButton,
                    { 
                      backgroundColor: currentTheme.colors.error + '20',
                      borderColor: currentTheme.colors.error + '50'
                    }
                  ]}
                  onPress={resetAllNotifications}
                >
                  <MaterialIcons name="refresh" size={24} color={currentTheme.colors.error} />
                  <Text style={[styles.resetButtonText, { color: currentTheme.colors.error }]}>Reset All Notifications</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[
                    styles.resetButton,
                    { 
                      marginTop: 12,
                      backgroundColor: currentTheme.colors.primary + '20',
                      borderColor: currentTheme.colors.primary + '50'
                    }
                  ]}
                  onPress={handleTestNotification}
                  disabled={countdown !== null}
                >
                  <MaterialIcons name="bug-report" size={24} color={currentTheme.colors.primary} />
                  <Text style={[styles.resetButtonText, { color: currentTheme.colors.primary }]}>
                    {countdown !== null 
                      ? `Notification in ${countdown}s...` 
                      : 'Test Notification (1min)'}
                  </Text>
                </TouchableOpacity>

                {countdown !== null && (
                  <View style={styles.countdownContainer}>
                    <MaterialIcons 
                      name="timer" 
                      size={16} 
                      color={currentTheme.colors.primary} 
                      style={styles.countdownIcon} 
                    />
                    <Text style={[styles.countdownText, { color: currentTheme.colors.primary }]}>
                      Notification will appear in {countdown} seconds
                    </Text>
                  </View>
                )}
                
                <Text style={[styles.resetDescription, { color: currentTheme.colors.lightGray }]}>
                  This will cancel all scheduled notifications. You'll need to re-enable them manually.
                </Text>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    fontSize: 16,
    marginLeft: 12,
  },
  settingDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  timingOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  timingOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    width: '48%',
    alignItems: 'center',
  },
  timingText: {
    fontSize: 14,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  resetDescription: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 4,
  },
  countdownIcon: {
    marginRight: 8,
  },
  countdownText: {
    fontSize: 14,
  },
});

export default NotificationSettingsScreen;