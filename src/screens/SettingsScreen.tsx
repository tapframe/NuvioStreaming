import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  Dimensions,
  Image,
  Button,
  Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';
import { stremioService } from '../services/stremioService';
import { useCatalogContext } from '../contexts/CatalogContext';
import { useTraktContext } from '../contexts/TraktContext';
import { useTheme } from '../contexts/ThemeContext';
import { catalogService } from '../services/catalogService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';

const { width } = Dimensions.get('window');

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Card component with minimalistic style
interface SettingsCardProps {
  children: React.ReactNode;
  title?: string;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, title }) => {
  const { currentTheme } = useTheme();
  
  return (
    <View 
      style={[styles.cardContainer]}
    >
      {title && (
        <Text style={[
          styles.cardTitle,
          { color: currentTheme.colors.mediumEmphasis }
        ]}>
          {title}
        </Text>
      )}
      <View style={[
        styles.card,
        { backgroundColor: currentTheme.colors.elevation1 }
      ]}>
        {children}
      </View>
    </View>
  );
};

interface SettingItemProps {
  title: string;
  description?: string;
  icon: string;
  renderControl?: () => React.ReactNode;
  isLast?: boolean;
  onPress?: () => void;
  badge?: string | number;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  renderControl,
  isLast = false,
  onPress,
  badge
}) => {
  const { currentTheme } = useTheme();
  
  return (
    <TouchableOpacity 
      activeOpacity={0.6}
      onPress={onPress}
      style={[
        styles.settingItem, 
        !isLast && styles.settingItemBorder,
        { borderBottomColor: currentTheme.colors.elevation2 }
      ]}
    >
      <View style={[
        styles.settingIconContainer,
        { backgroundColor: currentTheme.colors.elevation2 }
      ]}>
        <MaterialIcons name={icon} size={20} color={currentTheme.colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: currentTheme.colors.highEmphasis }]}>
            {title}
          </Text>
          {description && (
            <Text style={[styles.settingDescription, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={1}>
              {description}
            </Text>
          )}
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: `${currentTheme.colors.primary}20` }]}>
            <Text style={[styles.badgeText, { color: currentTheme.colors.primary }]}>{String(badge)}</Text>
          </View>
        )}
      </View>
      {renderControl && (
        <View style={styles.settingControl}>
          {renderControl()}
        </View>
      )}
    </TouchableOpacity>
  );
};

const SettingsScreen: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { lastUpdate } = useCatalogContext();
  const { isAuthenticated, userProfile, refreshAuthStatus } = useTraktContext();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  // Add a useEffect to check authentication status on focus
  useEffect(() => {
    // This will reload the Trakt auth status whenever the settings screen is focused
    const unsubscribe = navigation.addListener('focus', () => {
      // Force a re-render when returning to this screen
      // This will reflect the updated isAuthenticated state from the TraktContext
      // Refresh auth status
      if (isAuthenticated || userProfile) {
        // Just to be cautious, log the current state
        console.log('SettingsScreen focused, refreshing auth status. Current state:', { isAuthenticated, userProfile: userProfile?.username });
      }
      refreshAuthStatus();
    });
    
    return unsubscribe;
  }, [navigation, isAuthenticated, userProfile, refreshAuthStatus]);

  // States for dynamic content
  const [addonCount, setAddonCount] = useState<number>(0);
  const [catalogCount, setCatalogCount] = useState<number>(0);
  const [mdblistKeySet, setMdblistKeySet] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      // Load addon count and get their catalogs
      const addons = await stremioService.getInstalledAddonsAsync();
      setAddonCount(addons.length);
      
      // Count total available catalogs
      let totalCatalogs = 0;
      addons.forEach(addon => {
        if (addon.catalogs && addon.catalogs.length > 0) {
          totalCatalogs += addon.catalogs.length;
        }
      });
      
      // Load saved catalog settings
      const catalogSettingsJson = await AsyncStorage.getItem('catalog_settings');
      if (catalogSettingsJson) {
        const catalogSettings = JSON.parse(catalogSettingsJson);
        // Filter out _lastUpdate key and count only explicitly disabled catalogs
        const disabledCount = Object.entries(catalogSettings)
          .filter(([key, value]) => key !== '_lastUpdate' && value === false)
          .length;
        // Since catalogs are enabled by default, subtract disabled ones from total
        setCatalogCount(totalCatalogs - disabledCount);
      } else {
        // If no settings saved, all catalogs are enabled by default
        setCatalogCount(totalCatalogs);
      }

      // Check MDBList API key status
      const mdblistKey = await AsyncStorage.getItem('mdblist_api_key');
      setMdblistKeySet(!!mdblistKey);
      
    } catch (error) {
      console.error('Error loading settings data:', error);
    }
  }, []);

  // Load data initially and when catalogs are updated
  useEffect(() => {
    loadData();
  }, [loadData, lastUpdate]);

  // Add focus listener to reload data when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });

    return unsubscribe;
  }, [navigation, loadData]);

  const handleResetSettings = useCallback(() => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to reset all settings to default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            (Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>).forEach(key => {
              updateSetting(key, DEFAULT_SETTINGS[key]);
            });
          }
        }
      ]
    );
  }, [updateSetting]);

  const handleClearMDBListCache = () => {
    Alert.alert(
      "Clear MDBList Cache",
      "Are you sure you want to clear all cached MDBList data? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('mdblist_cache');
              Alert.alert("Success", "MDBList cache has been cleared.");
            } catch (error) {
              Alert.alert("Error", "Could not clear MDBList cache.");
              console.error('Error clearing MDBList cache:', error);
            }
          }
        }
      ]
    );
  };

  const CustomSwitch = ({ value, onValueChange }: { value: boolean, onValueChange: (value: boolean) => void }) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: currentTheme.colors.elevation2, true: currentTheme.colors.primary }}
      thumbColor={value ? currentTheme.colors.white : currentTheme.colors.mediumEmphasis}
      ios_backgroundColor={currentTheme.colors.elevation2}
    />
  );

  const ChevronRight = () => (
    <MaterialIcons 
      name="chevron-right" 
      size={20} 
      color={currentTheme.colors.mediumEmphasis}
    />
  );

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const headerHeight = headerBaseHeight + topSpacing;

  return (
    <View style={[
      styles.container,
      { backgroundColor: currentTheme.colors.darkBackground }
    ]}>
      <StatusBar barStyle={'light-content'} />
      <View style={{ flex: 1 }}>
        <View style={[styles.header, { height: headerHeight, paddingTop: topSpacing }]}>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
            Settings
          </Text>
        </View>

        <View style={styles.contentContainer}>
          <ScrollView 
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Account Section */}
            <SettingsCard title="ACCOUNT">
              <SettingItem
                title="Trakt"
                description={isAuthenticated ? `@${userProfile?.username || 'User'}` : "Sign in to sync"}
                icon="person"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('TraktSettings')}
              />
              {isAuthenticated && (
                <SettingItem
                  title="Profiles"
                  description="Manage multiple users"
                  icon="people"
                  renderControl={ChevronRight}
                  onPress={() => navigation.navigate('ProfilesSettings')}
                  isLast={true}
                />
              )}
            </SettingsCard>

            {/* Content & Discovery */}
            <SettingsCard title="CONTENT & DISCOVERY">
              <SettingItem
                title="Addons"
                description={`${addonCount} installed`}
                icon="extension"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('Addons')}
              />
              <SettingItem
                title="Catalogs"
                description={`${catalogCount} active`}
                icon="view-list"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('CatalogSettings')}
              />
              <SettingItem
                title="Home Screen"
                description="Layout and content"
                icon="home"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('HomeScreenSettings')}
                isLast={true}
              />
            </SettingsCard>

            {/* Appearance & Interface */}
            <SettingsCard title="APPEARANCE">
              <SettingItem
                title="Theme"
                description={currentTheme.name}
                icon="palette"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('ThemeSettings')}
              />
              <SettingItem
                title="Episode Layout"
                description={settings?.episodeLayoutStyle === 'horizontal' ? 'Horizontal' : 'Vertical'}
                icon="view-module"
                renderControl={() => (
                  <CustomSwitch
                    value={settings?.episodeLayoutStyle === 'horizontal'}
                    onValueChange={(value) => updateSetting('episodeLayoutStyle', value ? 'horizontal' : 'vertical')}
                  />
                )}
                isLast={true}
              />
            </SettingsCard>

            {/* Integrations */}
            <SettingsCard title="INTEGRATIONS">
              <SettingItem
                title="MDBList"
                description={mdblistKeySet ? "Connected" : "Enable to add ratings & reviews"}
                icon="star"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('MDBListSettings')}
              />
              <SettingItem
                title="TMDB"
                description="Metadata provider"
                icon="movie"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('TMDBSettings')}
              />
              <SettingItem
                title="Media Sources"
                description="Logo & image preferences"
                icon="image"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('LogoSourceSettings')}
                isLast={true}
              />
            </SettingsCard>

            {/* Playback & Experience */}
            <SettingsCard title="PLAYBACK">
              <SettingItem
                title="Video Player"
                description={Platform.OS === 'ios' 
                  ? (settings?.preferredPlayer === 'internal' ? 'Built-in' : settings?.preferredPlayer?.toUpperCase() || 'Built-in')
                  : (settings?.useExternalPlayer ? 'External' : 'Built-in')
                }
                icon="play-circle-outline"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('PlayerSettings')}
              />
              <SettingItem
                title="Calendar"
                description="Episode tracking"
                icon="event"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('Calendar')}
              />
              <SettingItem
                title="Notifications"
                description="Episode reminders"
                icon="notifications-none"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('NotificationSettings')}
                isLast={true}
              />
            </SettingsCard>

            {/* About & Support */}
            <SettingsCard title="ABOUT">
              <SettingItem
                title="Privacy Policy"
                icon="lock"
                onPress={() => Linking.openURL('https://github.com/Stremio/stremio-expo/blob/main/PRIVACY_POLICY.md')}
                renderControl={ChevronRight}
              />
              <SettingItem
                title="Report Issue"
                icon="bug-report"
                onPress={() => Sentry.showFeedbackWidget()}
                renderControl={ChevronRight}
              />
              <SettingItem
                title="Version"
                description="1.0.0"
                icon="info-outline"
                isLast={true}
              />
            </SettingsCard>

            {/* Developer Options - Only show in development */}
            {__DEV__ && (
              <SettingsCard title="DEVELOPER">
                <SettingItem
                  title="Test Onboarding"
                  icon="play-circle-outline"
                  onPress={() => navigation.navigate('Onboarding')}
                  renderControl={ChevronRight}
                />
                <SettingItem
                  title="Reset Onboarding"
                  icon="refresh"
                  onPress={async () => {
                    try {
                      await AsyncStorage.removeItem('hasCompletedOnboarding');
                      Alert.alert('Success', 'Onboarding has been reset. Restart the app to see the onboarding flow.');
                    } catch (error) {
                      Alert.alert('Error', 'Failed to reset onboarding.');
                    }
                  }}
                  renderControl={ChevronRight}
                />
                <SettingItem
                  title="Clear All Data"
                  icon="delete-forever"
                  onPress={() => {
                    Alert.alert(
                      'Clear All Data',
                      'This will reset all settings and clear all cached data. Are you sure?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Clear',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await AsyncStorage.clear();
                              Alert.alert('Success', 'All data cleared. Please restart the app.');
                            } catch (error) {
                              Alert.alert('Error', 'Failed to clear data.');
                            }
                          }
                        }
                      ]
                    );
                  }}
                  isLast={true}
                />
              </SettingsCard>
            )}

            {/* Cache Management - Only show if MDBList is connected */}
            {mdblistKeySet && (
              <SettingsCard title="CACHE MANAGEMENT">
                <SettingItem
                  title="Clear MDBList Cache"
                  icon="cached"
                  onPress={handleClearMDBListCache}
                  isLast={true}
                />
              </SettingsCard>
            )}

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: currentTheme.colors.mediumEmphasis }]}>
                Made with ❤️ by the Nuvio team
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Math.max(1, width * 0.05),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  headerTitle: {
    fontSize: Math.min(32, width * 0.08),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  contentContainer: {
    flex: 1,
    zIndex: 1,
    width: '100%',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    paddingBottom: 90,
  },
  cardContainer: {
    width: '100%',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginLeft: Math.max(12, width * 0.04),
    marginBottom: 8,
  },
  card: {
    marginHorizontal: Math.max(12, width * 0.04),
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: undefined, // Let it fill the container width
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Math.max(12, width * 0.04),
    borderBottomWidth: 0.5,
    minHeight: Math.max(54, width * 0.14),
    width: '100%',
  },
  settingItemBorder: {
    // Border styling handled directly in the component with borderBottomWidth
  },
  settingIconContainer: {
    marginRight: 16,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: Math.min(16, width * 0.042),
    fontWeight: '500',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: Math.min(14, width * 0.037),
    opacity: 0.8,
  },
  settingControl: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 12,
  },
  badge: {
    height: 22,
    minWidth: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 14,
    opacity: 0.5,
  },
});

export default SettingsScreen;