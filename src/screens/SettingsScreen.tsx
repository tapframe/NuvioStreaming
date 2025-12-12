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
  Platform,
  Dimensions,
  Button,
  Linking,
  Clipboard
} from 'react-native';
import { mmkvStorage } from '../services/mmkvStorage';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import FastImage from '@d11/react-native-fast-image';
import { Feather } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';
import { stremioService } from '../services/stremioService';
import { useCatalogContext } from '../contexts/CatalogContext';
import { useTraktContext } from '../contexts/TraktContext';
import { useTheme } from '../contexts/ThemeContext';
import { catalogService } from '../services/catalogService';
import { fetchTotalDownloads } from '../services/githubReleaseService';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import { getDisplayedAppVersion } from '../utils/version';
import CustomAlert from '../components/CustomAlert';
import ScreenHeader from '../components/common/ScreenHeader';
import PluginIcon from '../components/icons/PluginIcon';
import TraktIcon from '../components/icons/TraktIcon';
import TMDBIcon from '../components/icons/TMDBIcon';
import MDBListIcon from '../components/icons/MDBListIcon';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Settings categories for tablet sidebar
const SETTINGS_CATEGORIES = [
  { id: 'account', title: 'Account', icon: 'user' as string },
  { id: 'content', title: 'Content & Discovery', icon: 'compass' as string },
  { id: 'appearance', title: 'Appearance', icon: 'sliders' as string },
  { id: 'integrations', title: 'Integrations', icon: 'layers' as string },
  { id: 'ai', title: 'AI Assistant', icon: 'cpu' as string },
  { id: 'playback', title: 'Playback', icon: 'play-circle' as string },
  { id: 'backup', title: 'Backup & Restore', icon: 'archive' as string },
  { id: 'updates', title: 'Updates', icon: 'refresh-ccw' as string },
  { id: 'about', title: 'About', icon: 'info' as string },
  { id: 'developer', title: 'Developer', icon: 'code' as string },
  { id: 'cache', title: 'Cache', icon: 'database' as string },
];

// Card component with minimalistic style
interface SettingsCardProps {
  children: React.ReactNode;
  title?: string;
  isTablet?: boolean;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, title, isTablet = false }) => {
  const { currentTheme } = useTheme();

  return (
    <View
      style={[
        styles.cardContainer,
        isTablet && styles.tabletCardContainer
      ]}
    >
      {title && (
        <Text style={[
          styles.cardTitle,
          { color: currentTheme.colors.mediumEmphasis },
          isTablet && styles.tabletCardTitle
        ]}>
          {title}
        </Text>
      )}
      <View style={[
        styles.card,
        {
          backgroundColor: currentTheme.colors.elevation1,
          borderWidth: 1,
          borderColor: currentTheme.colors.elevation2,
        },
        isTablet && styles.tabletCard
      ]}>
        {children}
      </View>
    </View>
  );
};

interface SettingItemProps {
  title: string;
  description?: string;
  icon?: string;
  customIcon?: React.ReactNode;
  renderControl?: () => React.ReactNode;
  isLast?: boolean;
  onPress?: () => void;
  badge?: string | number;
  isTablet?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  customIcon,
  renderControl,
  isLast = false,
  onPress,
  badge,
  isTablet = false
}) => {
  const { currentTheme } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={[
        styles.settingItem,
        !isLast && styles.settingItemBorder,
        { borderBottomColor: currentTheme.colors.elevation2 },
        isTablet && styles.tabletSettingItem
      ]}
    >
      <View style={[
        styles.settingIconContainer,
        {
          backgroundColor: currentTheme.colors.primary + '12',
        },
        isTablet && styles.tabletSettingIconContainer
      ]}>
        {customIcon ? (
          customIcon
        ) : (
          <Feather
            name={icon! as any}
            size={isTablet ? 22 : 18}
            color={currentTheme.colors.primary}
          />
        )}
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={[
            styles.settingTitle,
            { color: currentTheme.colors.highEmphasis },
            isTablet && styles.tabletSettingTitle
          ]}>
            {title}
          </Text>
          {description && (
            <Text style={[
              styles.settingDescription,
              { color: currentTheme.colors.mediumEmphasis },
              isTablet && styles.tabletSettingDescription
            ]} numberOfLines={1}>
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

// Tablet Sidebar Component
interface SidebarProps {
  selectedCategory: string;
  onCategorySelect: (category: string) => void;
  currentTheme: any;
  categories: typeof SETTINGS_CATEGORIES;
  extraTopPadding?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ selectedCategory, onCategorySelect, currentTheme, categories, extraTopPadding = 0 }) => {
  return (
    <View style={[
      styles.sidebar,
      {
        backgroundColor: currentTheme.colors.elevation1,
        borderRightColor: currentTheme.colors.elevation2,
      }
    ]}>
      <View style={[
        styles.sidebarHeader,
        {
          paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 24 : 48) + extraTopPadding,
          borderBottomColor: currentTheme.colors.elevation2,
        }
      ]}>
        <Text style={[styles.sidebarTitle, { color: currentTheme.colors.highEmphasis }]}>
          Settings
        </Text>
      </View>

      <ScrollView style={styles.sidebarContent} showsVerticalScrollIndicator={false}>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.sidebarItem,
              selectedCategory === category.id && [
                styles.sidebarItemActive,
                { backgroundColor: currentTheme.colors.primary + '10' }
              ]
            ]}
            onPress={() => onCategorySelect(category.id)}
            activeOpacity={0.6}
          >
            <View style={[
              styles.sidebarItemIconContainer,
              {
                backgroundColor: selectedCategory === category.id
                  ? currentTheme.colors.primary + '15'
                  : 'transparent',
              }
            ]}>
              <Feather
                name={category.icon as any}
                size={20}
                color={
                  selectedCategory === category.id
                    ? currentTheme.colors.primary
                    : currentTheme.colors.mediumEmphasis
                }
              />
            </View>
            <Text style={[
              styles.sidebarItemText,
              {
                color: selectedCategory === category.id
                  ? currentTheme.colors.highEmphasis
                  : currentTheme.colors.mediumEmphasis,
                fontWeight: selectedCategory === category.id ? '600' : '500',
              }
            ]}>
              {category.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};


const SettingsScreen: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const [hasUpdateBadge, setHasUpdateBadge] = useState(false);
  // CustomAlert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertActions, setAlertActions] = useState<Array<{ label: string; onPress: () => void; style?: object }>>([]);

  const openAlert = (
    title: string,
    message: string,
    actions?: Array<{ label: string; onPress: () => void; style?: object }>
  ) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertActions(actions && actions.length > 0 ? actions : [{ label: 'OK', onPress: () => { } }]);
    setAlertVisible(true);
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let mounted = true;
    (async () => {
      try {
        const flag = await mmkvStorage.getItem('@update_badge_pending');
        if (mounted) setHasUpdateBadge(flag === 'true');
      } catch { }
    })();
    return () => { mounted = false; };
  }, []);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { lastUpdate } = useCatalogContext();
  const { isAuthenticated, userProfile, refreshAuthStatus } = useTraktContext();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Tablet-specific state
  const [selectedCategory, setSelectedCategory] = useState('account');

  // States for dynamic content
  const [addonCount, setAddonCount] = useState<number>(0);
  const [catalogCount, setCatalogCount] = useState<number>(0);
  const [mdblistKeySet, setMdblistKeySet] = useState<boolean>(false);
  const [openRouterKeySet, setOpenRouterKeySet] = useState<boolean>(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  const [totalDownloads, setTotalDownloads] = useState<number | null>(null);
  const [displayDownloads, setDisplayDownloads] = useState<number | null>(null);
  const [isCountingUp, setIsCountingUp] = useState<boolean>(false);

  // Add a useEffect to check Trakt authentication status on focus
  useEffect(() => {
    // This will reload the Trakt auth status whenever the settings screen is focused
    const unsubscribe = navigation.addListener('focus', () => {
      // Force a re-render when returning to this screen
      // This will reflect the updated isAuthenticated state from the TraktContext
      // Refresh auth status
      if (isAuthenticated || userProfile) {
        // Just to be cautious, log the current state
        if (__DEV__) console.log('SettingsScreen focused, refreshing auth status. Current state:', { isAuthenticated, userProfile: userProfile?.username });
      }
      refreshAuthStatus();
    });

    return unsubscribe;
  }, [navigation, isAuthenticated, userProfile, refreshAuthStatus]);

  const loadData = useCallback(async () => {
    try {
      // Load addon count and get their catalogs
      const addons = await stremioService.getInstalledAddonsAsync();
      setAddonCount(addons.length);
      setInitialLoadComplete(true);

      // Count total available catalogs
      let totalCatalogs = 0;
      addons.forEach(addon => {
        if (addon.catalogs && addon.catalogs.length > 0) {
          totalCatalogs += addon.catalogs.length;
        }
      });

      // Load saved catalog settings
      const catalogSettingsJson = await mmkvStorage.getItem('catalog_settings');
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
      const mdblistKey = await mmkvStorage.getItem('mdblist_api_key');
      setMdblistKeySet(!!mdblistKey);

      // Check OpenRouter API key status
      const openRouterKey = await mmkvStorage.getItem('openrouter_api_key');
      setOpenRouterKeySet(!!openRouterKey);

      // Load GitHub total downloads (initial load only, polling happens in useEffect)
      const downloads = await fetchTotalDownloads();
      if (downloads !== null) {
        setTotalDownloads(downloads);
        setDisplayDownloads(downloads);
      }

    } catch (error) {
      if (__DEV__) console.error('Error loading settings data:', error);
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

  // Poll GitHub downloads every 10 seconds when on the About section
  useEffect(() => {
    // Only poll when viewing the About section (where downloads counter is shown)
    const shouldPoll = isTablet ? selectedCategory === 'about' : true;

    if (!shouldPoll) return;

    const pollInterval = setInterval(async () => {
      try {
        const downloads = await fetchTotalDownloads();
        if (downloads !== null && downloads !== totalDownloads) {
          setTotalDownloads(downloads);
        }
      } catch (error) {
        if (__DEV__) console.error('Error polling downloads:', error);
      }
    }, 3600000); // 3600000 milliseconds (1 hour)

    return () => clearInterval(pollInterval);
  }, [selectedCategory, isTablet, totalDownloads]);

  // Animate counting up when totalDownloads changes
  useEffect(() => {
    if (totalDownloads === null || displayDownloads === null) return;
    if (totalDownloads === displayDownloads) return;

    setIsCountingUp(true);
    const start = displayDownloads;
    const end = totalDownloads;
    const duration = 2000; // 2 seconds animation
    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out quad for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 2);
      const current = Math.floor(start + (end - start) * easeProgress);

      setDisplayDownloads(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayDownloads(end);
        setIsCountingUp(false);
      }
    };

    requestAnimationFrame(animate);
  }, [totalDownloads]);

  const handleResetSettings = useCallback(() => {
    openAlert(
      'Reset Settings',
      'Are you sure you want to reset all settings to default values?',
      [
        { label: 'Cancel', onPress: () => { } },
        {
          label: 'Reset',
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
    openAlert(
      'Clear MDBList Cache',
      'Are you sure you want to clear all cached MDBList data? This cannot be undone.',
      [
        { label: 'Cancel', onPress: () => { } },
        {
          label: 'Clear',
          onPress: async () => {
            try {
              await mmkvStorage.removeItem('mdblist_cache');
              openAlert('Success', 'MDBList cache has been cleared.');
            } catch (error) {
              openAlert('Error', 'Could not clear MDBList cache.');
              if (__DEV__) console.error('Error clearing MDBList cache:', error);
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
    <Feather
      name="chevron-right"
      size={isTablet ? 24 : 20}
      color={currentTheme.colors.mediumEmphasis}
    />
  );

  // Filter categories based on conditions
  const visibleCategories = SETTINGS_CATEGORIES.filter(category => {
    if (category.id === 'developer' && !__DEV__) return false;
    if (category.id === 'cache' && !mdblistKeySet) return false;
    return true;
  });



  const renderCategoryContent = (categoryId: string) => {
    switch (categoryId) {
      case 'account':
        return (
          <SettingsCard title="ACCOUNT" isTablet={isTablet}>
            <SettingItem
              title="Trakt"
              description={isAuthenticated ? `@${userProfile?.username || 'User'}` : "Sign in to sync"}
              customIcon={<TraktIcon size={isTablet ? 24 : 20} color={currentTheme.colors.primary} />}
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('TraktSettings')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'content':
        return (
          <SettingsCard title="CONTENT & DISCOVERY" isTablet={isTablet}>
            <SettingItem
              title="Addons"
              description={`${addonCount} installed`}
              icon="layers"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('Addons')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Debrid Integration"
              description="Connect Torbox for premium streams"
              icon="link"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('DebridIntegration')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Plugins"
              description="Manage plugins and repositories"
              customIcon={<PluginIcon size={isTablet ? 24 : 20} color={currentTheme.colors.primary} />}
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('PluginSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Catalogs"
              description={`${catalogCount} active`}
              icon="list"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('CatalogSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Home Screen"
              description="Layout and content"
              icon="home"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('HomeScreenSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Continue Watching"
              description="Cache and playback behavior"
              icon="play-circle"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('ContinueWatchingSettings')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'appearance':
        return (
          <SettingsCard title="APPEARANCE" isTablet={isTablet}>
            <SettingItem
              title="Theme"
              description={currentTheme.name}
              icon="sliders"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('ThemeSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Episode Layout"
              description={settings?.episodeLayoutStyle === 'horizontal' ? 'Horizontal' : 'Vertical'}
              icon="grid"
              renderControl={() => (
                <CustomSwitch
                  value={settings?.episodeLayoutStyle === 'horizontal'}
                  onValueChange={(value) => updateSetting('episodeLayoutStyle', value ? 'horizontal' : 'vertical')}
                />
              )}
              isLast={isTablet}
              isTablet={isTablet}
            />
            {!isTablet && (
              <SettingItem
                title="Streams Backdrop"
                description="Show blurred backdrop on mobile streams"
                icon="image"
                renderControl={() => (
                  <CustomSwitch
                    value={settings?.enableStreamsBackdrop ?? true}
                    onValueChange={(value) => updateSetting('enableStreamsBackdrop', value)}
                  />
                )}
                isLast={true}
                isTablet={isTablet}
              />
            )}
          </SettingsCard>
        );

      case 'integrations':
        return (
          <SettingsCard title="INTEGRATIONS" isTablet={isTablet}>
            <SettingItem
              title="MDBList"
              description={mdblistKeySet ? "Connected" : "Enable to add ratings & reviews"}
              customIcon={<MDBListIcon size={isTablet ? 24 : 20} colorPrimary={currentTheme.colors.primary} colorSecondary={currentTheme.colors.white} />}
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('MDBListSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="TMDB"
              description="Metadata & logo source provider"
              customIcon={<TMDBIcon size={isTablet ? 24 : 20} color={currentTheme.colors.primary} />}
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('TMDBSettings')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'ai':
        return (
          <SettingsCard title="AI ASSISTANT" isTablet={isTablet}>
            <SettingItem
              title="OpenRouter API"
              description={openRouterKeySet ? "Connected" : "Add your API key to enable AI chat"}
              icon="cpu"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('AISettings')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'playback':
        return (
          <SettingsCard title="PLAYBACK" isTablet={isTablet}>
            <SettingItem
              title="Video Player"
              description={Platform.OS === 'ios'
                ? (settings?.preferredPlayer === 'internal' ? 'Built-in' : settings?.preferredPlayer?.toUpperCase() || 'Built-in')
                : (settings?.useExternalPlayer ? 'External' : 'Built-in')
              }
              icon="play-circle"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('PlayerSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Show Trailers"
              description="Display trailers in hero section"
              icon="film"
              renderControl={() => (
                <Switch
                  value={settings?.showTrailers ?? true}
                  onValueChange={(value) => updateSetting('showTrailers', value)}
                  trackColor={{ false: 'rgba(255,255,255,0.2)', true: currentTheme.colors.primary }}
                  thumbColor={settings?.showTrailers ? '#fff' : '#f4f3f4'}
                />
              )}
              isTablet={isTablet}
            />
            <SettingItem
              title="Enable Downloads (Beta)"
              description="Show Downloads tab and enable saving streams"
              icon="download"
              renderControl={() => (
                <Switch
                  value={settings?.enableDownloads ?? false}
                  onValueChange={(value) => updateSetting('enableDownloads', value)}
                  trackColor={{ false: 'rgba(255,255,255,0.2)', true: currentTheme.colors.primary }}
                  thumbColor={settings?.enableDownloads ? '#fff' : '#f4f3f4'}
                />
              )}
              isTablet={isTablet}
            />
            <SettingItem
              title="Notifications"
              description="Episode reminders"
              icon="bell"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('NotificationSettings')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'about':
        return (
          <SettingsCard title="ABOUT" isTablet={isTablet}>
            <SettingItem
              title="Privacy Policy"
              icon="lock"
              onPress={() => Linking.openURL('https://tapframe.github.io/NuvioStreaming/#privacy-policy')}
              renderControl={ChevronRight}
              isTablet={isTablet}
            />
            <SettingItem
              title="Report Issue"
              icon="alert-triangle"
              onPress={() => Sentry.showFeedbackWidget()}
              renderControl={ChevronRight}
              isTablet={isTablet}
            />
            <SettingItem
              title="Version"
              description={getDisplayedAppVersion()}
              icon="info"
              isTablet={isTablet}
            />
            <SettingItem
              title="Contributors"
              description="View all contributors"
              icon="users"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('Contributors')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'developer':
        return __DEV__ ? (
          <SettingsCard title="DEVELOPER" isTablet={isTablet}>
            <SettingItem
              title="Test Onboarding"
              icon="play-circle"
              onPress={() => navigation.navigate('Onboarding')}
              renderControl={ChevronRight}
              isTablet={isTablet}
            />
            <SettingItem
              title="Reset Onboarding"
              icon="refresh-ccw"
              onPress={async () => {
                try {
                  await mmkvStorage.removeItem('hasCompletedOnboarding');
                  openAlert('Success', 'Onboarding has been reset. Restart the app to see the onboarding flow.');
                } catch (error) {
                  openAlert('Error', 'Failed to reset onboarding.');
                }
              }}
              renderControl={ChevronRight}
              isTablet={isTablet}
            />
            <SettingItem
              title="Test Announcement"
              icon="bell"
              description="Show what's new overlay"
              onPress={async () => {
                try {
                  await mmkvStorage.removeItem('announcement_v1.0.0_shown');
                  openAlert('Success', 'Announcement reset. Restart the app to see the announcement overlay.');
                } catch (error) {
                  openAlert('Error', 'Failed to reset announcement.');
                }
              }}
              renderControl={ChevronRight}
              isTablet={isTablet}
            />
            <SettingItem
              title="Clear All Data"
              icon="trash-2"
              onPress={() => {
                openAlert(
                  'Clear All Data',
                  'This will reset all settings and clear all cached data. Are you sure?',
                  [
                    { label: 'Cancel', onPress: () => { } },
                    {
                      label: 'Clear',
                      onPress: async () => {
                        try {
                          await mmkvStorage.clear();
                          openAlert('Success', 'All data cleared. Please restart the app.');
                        } catch (error) {
                          openAlert('Error', 'Failed to clear data.');
                        }
                      }
                    }
                  ]
                );
              }}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        ) : null;

      case 'cache':
        return mdblistKeySet ? (
          <SettingsCard title="CACHE MANAGEMENT" isTablet={isTablet}>
            <SettingItem
              title="Clear MDBList Cache"
              icon="database"
              onPress={handleClearMDBListCache}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        ) : null;

      case 'backup':
        return (
          <SettingsCard title="BACKUP & RESTORE" isTablet={isTablet}>
            <SettingItem
              title="Backup & Restore"
              description="Create and restore app backups"
              icon="archive"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('Backup')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'updates':
        return (
          <SettingsCard title="UPDATES" isTablet={isTablet}>
            <SettingItem
              title="App Updates"
              description="Check for updates and manage app version"
              icon="refresh-ccw"
              renderControl={ChevronRight}
              badge={Platform.OS === 'android' && hasUpdateBadge ? 1 : undefined}
              onPress={async () => {
                if (Platform.OS === 'android') {
                  try { await mmkvStorage.removeItem('@update_badge_pending'); } catch { }
                  setHasUpdateBadge(false);
                }
                navigation.navigate('Update');
              }}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      default:
        return null;
    }
  };

  // Keep headers below floating top navigator on tablets by adding extra offset
  const tabletNavOffset = isTablet ? 64 : 0;

  if (isTablet) {
    return (
      <View style={[
        styles.container,
        { backgroundColor: currentTheme.colors.darkBackground }
      ]}>
        <StatusBar barStyle={'light-content'} />
        <View style={styles.tabletContainer}>
          <Sidebar
            selectedCategory={selectedCategory}
            onCategorySelect={setSelectedCategory}
            currentTheme={currentTheme}
            categories={visibleCategories}
            extraTopPadding={tabletNavOffset}
          />

          <View style={[
            styles.tabletContent,
            {
              paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 24 : 48) + tabletNavOffset,
            }
          ]}>
            <ScrollView
              style={styles.tabletScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.tabletScrollContent}
            >
              {renderCategoryContent(selectedCategory)}

              {selectedCategory === 'about' && (
                <>
                  {displayDownloads !== null && (
                    <View style={styles.downloadsContainer}>
                      <Text style={[styles.downloadsNumber, { color: currentTheme.colors.primary }]}>
                        {displayDownloads.toLocaleString()}
                      </Text>
                      <Text style={[styles.downloadsLabel, { color: currentTheme.colors.mediumEmphasis }]}>
                        downloads and counting
                      </Text>
                    </View>
                  )}

                  <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: currentTheme.colors.mediumEmphasis }]}>
                      Made with ❤️ by Tapframe and Friends
                    </Text>
                  </View>
                  <View style={styles.discordContainer}>
                    <TouchableOpacity
                      style={[styles.discordButton, { backgroundColor: 'transparent', paddingVertical: 0, paddingHorizontal: 0, marginBottom: 8 }]}
                      onPress={() => WebBrowser.openBrowserAsync('https://ko-fi.com/tapframe', {
                        presentationStyle: Platform.OS === 'ios' ? WebBrowser.WebBrowserPresentationStyle.FORM_SHEET : WebBrowser.WebBrowserPresentationStyle.FORM_SHEET
                      })}
                      activeOpacity={0.7}
                    >
                      <FastImage
                        source={require('../../assets/support_me_on_kofi_red.png')}
                        style={styles.kofiImage}
                        resizeMode={FastImage.resizeMode.contain}
                      />
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <TouchableOpacity
                        style={[styles.discordButton, { backgroundColor: currentTheme.colors.elevation1 }]}
                        onPress={() => Linking.openURL('https://discord.gg/6w8dr3TSDN')}
                        activeOpacity={0.7}
                      >
                        <View style={styles.discordButtonContent}>
                          <FastImage
                            source={{ uri: 'https://pngimg.com/uploads/discord/discord_PNG3.png' }}
                            style={styles.discordLogo}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                          <Text style={[styles.discordButtonText, { color: currentTheme.colors.highEmphasis }]}>
                            Discord
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.discordButton, { backgroundColor: '#FF4500' + '15' }]}
                        onPress={() => Linking.openURL('https://www.reddit.com/r/Nuvio/')}
                        activeOpacity={0.7}
                      >
                        <View style={styles.discordButtonContent}>
                          <FastImage
                            source={{ uri: 'https://www.iconpacks.net/icons/2/free-reddit-logo-icon-2436-thumb.png' }}
                            style={styles.discordLogo}
                            resizeMode={FastImage.resizeMode.contain}
                          />
                          <Text style={[styles.discordButtonText, { color: '#FF4500' }]}>
                            Reddit
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
        <CustomAlert
          visible={alertVisible}
          title={alertTitle}
          message={alertMessage}
          actions={alertActions}
          onClose={() => setAlertVisible(false)}
        />
      </View>
    );
  }

  // Mobile Layout (original)
  return (
    <View style={[
      styles.container,
      { backgroundColor: currentTheme.colors.darkBackground }
    ]}>
      <StatusBar barStyle={'light-content'} />
      <ScreenHeader
        title="Settings"
      />
      <View style={{ flex: 1 }}>

        <View style={styles.contentContainer}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {renderCategoryContent('account')}
            {renderCategoryContent('content')}
            {renderCategoryContent('appearance')}
            {renderCategoryContent('integrations')}
            {renderCategoryContent('ai')}
            {renderCategoryContent('playback')}
            {renderCategoryContent('backup')}
            {renderCategoryContent('updates')}
            {renderCategoryContent('about')}
            {renderCategoryContent('developer')}
            {renderCategoryContent('cache')}

            {displayDownloads !== null && (
              <View style={styles.downloadsContainer}>
                <Text style={[styles.downloadsNumber, { color: currentTheme.colors.primary }]}>
                  {displayDownloads.toLocaleString()}
                </Text>
                <Text style={[styles.downloadsLabel, { color: currentTheme.colors.mediumEmphasis }]}>
                  downloads and counting
                </Text>
              </View>
            )}

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: currentTheme.colors.mediumEmphasis }]}>
                Made with ❤️ by Tapframe and friends
              </Text>
            </View>

            {/* Support & Community Buttons */}
            <View style={styles.discordContainer}>
              <TouchableOpacity
                style={[styles.discordButton, { backgroundColor: 'transparent', paddingVertical: 0, paddingHorizontal: 0, marginBottom: 8 }]}
                onPress={() => WebBrowser.openBrowserAsync('https://ko-fi.com/tapframe', {
                  presentationStyle: Platform.OS === 'ios' ? WebBrowser.WebBrowserPresentationStyle.FORM_SHEET : WebBrowser.WebBrowserPresentationStyle.FORM_SHEET
                })}
                activeOpacity={0.7}
              >
                <FastImage
                  source={require('../../assets/support_me_on_kofi_red.png')}
                  style={styles.kofiImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <TouchableOpacity
                  style={[styles.discordButton, { backgroundColor: currentTheme.colors.elevation1 }]}
                  onPress={() => Linking.openURL('https://discord.gg/6w8dr3TSDN')}
                  activeOpacity={0.7}
                >
                  <View style={styles.discordButtonContent}>
                    <FastImage
                      source={{ uri: 'https://pngimg.com/uploads/discord/discord_PNG3.png' }}
                      style={styles.discordLogo}
                      resizeMode={FastImage.resizeMode.contain}
                    />
                    <Text style={[styles.discordButtonText, { color: currentTheme.colors.highEmphasis }]}>
                      Discord
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.discordButton, { backgroundColor: '#FF4500' + '15' }]}
                  onPress={() => Linking.openURL('https://www.reddit.com/r/Nuvio/')}
                  activeOpacity={0.7}
                >
                  <View style={styles.discordButtonContent}>
                    <FastImage
                      source={{ uri: 'https://www.iconpacks.net/icons/2/free-reddit-logo-icon-2436-thumb.png' }}
                      style={styles.discordLogo}
                      resizeMode={FastImage.resizeMode.contain}
                    />
                    <Text style={[styles.discordButtonText, { color: '#FF4500' }]}>
                      Reddit
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        actions={alertActions}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Mobile styles
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
    paddingTop: 8,
    paddingBottom: 100,
  },

  // Tablet-specific styles
  tabletContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 280,
    borderRightWidth: 1,
  },
  sidebarHeader: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 24 : 48,
    borderBottomWidth: 1,
  },
  sidebarTitle: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 10,
  },
  sidebarItemActive: {
    borderRadius: 10,
  },
  sidebarItemIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarItemText: {
    fontSize: 15,
    marginLeft: 12,
  },
  tabletContent: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 24 : 48,
  },
  tabletScrollView: {
    flex: 1,
    paddingHorizontal: 40,
  },
  tabletScrollContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Common card styles
  cardContainer: {
    width: '100%',
    marginBottom: 24,
  },
  tabletCardContainer: {
    marginBottom: 28,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginLeft: Math.max(16, width * 0.045),
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  tabletCardTitle: {
    fontSize: 12,
    marginLeft: 4,
    marginBottom: 12,
  },
  card: {
    marginHorizontal: Math.max(16, width * 0.04),
    borderRadius: 14,
    overflow: 'hidden',
    width: undefined,
  },
  tabletCard: {
    marginHorizontal: 0,
    borderRadius: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Math.max(14, width * 0.04),
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Math.max(60, width * 0.15),
    width: '100%',
  },
  tabletSettingItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    minHeight: 68,
  },
  settingItemBorder: {
    // Border styling handled directly in the component with borderBottomWidth
  },
  settingIconContainer: {
    marginRight: 14,
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabletSettingIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 11,
    marginRight: 16,
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
    fontSize: Math.min(16, width * 0.04),
    fontWeight: '500',
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  tabletSettingTitle: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: Math.min(13, width * 0.034),
    opacity: 0.7,
  },
  tabletSettingDescription: {
    fontSize: 14,
    opacity: 0.6,
  },
  settingControl: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 10,
  },
  badge: {
    height: 20,
    minWidth: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
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
    marginTop: 24,
    marginBottom: 12,
  },
  footerText: {
    fontSize: 13,
    opacity: 0.5,
    letterSpacing: 0.2,
  },
  // Support buttons
  discordContainer: {
    marginTop: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  discordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    maxWidth: 200,
  },
  discordButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discordLogo: {
    width: 18,
    height: 18,
    marginRight: 10,
  },
  discordButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  kofiImage: {
    height: 34,
    width: 155,
  },
  downloadsContainer: {
    marginTop: 32,
    marginBottom: 16,
    alignItems: 'center',
  },
  downloadsNumber: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  downloadsLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  loadingSpinner: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderRadius: 8,
    borderTopColor: 'transparent',
    marginRight: 8,
  },
});

export default SettingsScreen;