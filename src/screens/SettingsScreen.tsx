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
  Linking,
  Clipboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';
import { stremioService } from '../services/stremioService';
import { useCatalogContext } from '../contexts/CatalogContext';
import { useTraktContext } from '../contexts/TraktContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAccount } from '../contexts/AccountContext';
import { catalogService } from '../services/catalogService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Settings categories for tablet sidebar
const SETTINGS_CATEGORIES = [
  { id: 'account', title: 'Account', icon: 'account-circle' as keyof typeof MaterialIcons.glyphMap },
  { id: 'content', title: 'Content & Discovery', icon: 'explore' as keyof typeof MaterialIcons.glyphMap },
  { id: 'appearance', title: 'Appearance', icon: 'palette' as keyof typeof MaterialIcons.glyphMap },
  { id: 'integrations', title: 'Integrations', icon: 'extension' as keyof typeof MaterialIcons.glyphMap },
  { id: 'ai', title: 'AI Assistant', icon: 'smart-toy' as keyof typeof MaterialIcons.glyphMap },
  { id: 'playback', title: 'Playback', icon: 'play-circle-outline' as keyof typeof MaterialIcons.glyphMap },
  { id: 'updates', title: 'Updates', icon: 'system-update' as keyof typeof MaterialIcons.glyphMap },
  { id: 'about', title: 'About', icon: 'info-outline' as keyof typeof MaterialIcons.glyphMap },
  { id: 'developer', title: 'Developer', icon: 'code' as keyof typeof MaterialIcons.glyphMap },
  { id: 'cache', title: 'Cache', icon: 'cached' as keyof typeof MaterialIcons.glyphMap },
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
        { backgroundColor: currentTheme.colors.elevation1 },
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
  icon: keyof typeof MaterialIcons.glyphMap;
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
        { backgroundColor: currentTheme.colors.elevation2 },
        isTablet && styles.tabletSettingIconContainer
      ]}>
        <MaterialIcons 
          name={icon} 
          size={isTablet ? 24 : 20} 
          color={currentTheme.colors.primary} 
        />
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
}

const Sidebar: React.FC<SidebarProps> = ({ selectedCategory, onCategorySelect, currentTheme, categories }) => {
  return (
    <View style={[styles.sidebar, { backgroundColor: currentTheme.colors.elevation1 }]}>
      <View style={styles.sidebarHeader}>
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
                { backgroundColor: `${currentTheme.colors.primary}15` }
              ]
            ]}
            onPress={() => onCategorySelect(category.id)}
          >
            <MaterialIcons
              name={category.icon}
              size={22}
              color={
                selectedCategory === category.id 
                  ? currentTheme.colors.primary 
                  : currentTheme.colors.mediumEmphasis
              }
            />
            <Text style={[
              styles.sidebarItemText,
              {
                color: selectedCategory === category.id 
                  ? currentTheme.colors.primary 
                  : currentTheme.colors.mediumEmphasis
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
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { lastUpdate } = useCatalogContext();
  const { isAuthenticated, userProfile, refreshAuthStatus } = useTraktContext();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut, loading: accountLoading } = useAccount();
  
  // Tablet-specific state
  const [selectedCategory, setSelectedCategory] = useState('account');
  
  // Add a useEffect to check authentication status on focus
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

  // States for dynamic content
  const [addonCount, setAddonCount] = useState<number>(0);
  const [catalogCount, setCatalogCount] = useState<number>(0);
  const [mdblistKeySet, setMdblistKeySet] = useState<boolean>(false);
  const [openRouterKeySet, setOpenRouterKeySet] = useState<boolean>(false);

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

      // Check OpenRouter API key status
      const openRouterKey = await AsyncStorage.getItem('openrouter_api_key');
      setOpenRouterKeySet(!!openRouterKey);
      
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
    <MaterialIcons 
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
            {!accountLoading && user ? (
              <>
                <SettingItem
                  title={user.displayName || user.email || user.id}
                  description="Manage account"
                  icon="account-circle"
                  onPress={() => navigation.navigate('AccountManage')}
                  isTablet={isTablet}
                />
              </>
            ) : !accountLoading && !user ? (
              <SettingItem
                title="Sign in / Create account"
                description="Sync across devices"
                icon="login"
                onPress={() => navigation.navigate('Account')}
                isTablet={isTablet}
              />
            ) : (
              <SettingItem
                title="Loading account..."
                description="Please wait"
                icon="hourglass-empty"
                isTablet={isTablet}
              />
            )}
            <SettingItem
              title="Trakt"
              description={isAuthenticated ? `@${userProfile?.username || 'User'}` : "Sign in to sync"}
              icon="person"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('TraktSettings')}
              isTablet={isTablet}
            />
            {isAuthenticated && (
              <SettingItem
                title="Profiles"
                description="Manage multiple users"
                icon="people"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('ProfilesSettings')}
                isLast={true}
                isTablet={isTablet}
              />
            )}
          </SettingsCard>
        );

      case 'content':
        return (
          <SettingsCard title="CONTENT & DISCOVERY" isTablet={isTablet}>
            <SettingItem
              title="Addons"
              description={`${addonCount} installed`}
              icon="extension"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('Addons')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Plugins"
              description="Manage plugins and repositories"
              icon="code"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('ScraperSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Catalogs"
              description={`${catalogCount} active`}
              icon="view-list"
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
              icon="palette"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('ThemeSettings')}
              isTablet={isTablet}
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
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      case 'integrations':
        return (
          <SettingsCard title="INTEGRATIONS" isTablet={isTablet}>
            <SettingItem
              title="MDBList"
              description={mdblistKeySet ? "Connected" : "Enable to add ratings & reviews"}
              icon="star"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('MDBListSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="TMDB"
              description="Metadata provider"
              icon="movie"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('TMDBSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Media Sources"
              description="Logo & image preferences"
              icon="image"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('LogoSourceSettings')}
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
              icon="smart-toy"
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
              icon="play-circle-outline"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('PlayerSettings')}
              isTablet={isTablet}
            />
            <SettingItem
              title="Show Trailers"
              description="Display trailers in hero section"
              icon="movie"
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
              title="Notifications"
              description="Episode reminders"
              icon="notifications-none"
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
              icon="bug-report"
              onPress={() => Sentry.showFeedbackWidget()}
              renderControl={ChevronRight}
              isTablet={isTablet}
            />
            <SettingItem
              title="Version"
              description="1.0.0"
              icon="info-outline"
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
              icon="play-circle-outline"
              onPress={() => navigation.navigate('Onboarding')}
              renderControl={ChevronRight}
              isTablet={isTablet}
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
              isTablet={isTablet}
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
              isTablet={isTablet}
            />
          </SettingsCard>
        ) : null;

      case 'cache':
        return mdblistKeySet ? (
          <SettingsCard title="CACHE MANAGEMENT" isTablet={isTablet}>
            <SettingItem
              title="Clear MDBList Cache"
              icon="cached"
              onPress={handleClearMDBListCache}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        ) : null;

      case 'updates':
        return (
          <SettingsCard title="UPDATES" isTablet={isTablet}>
            <SettingItem
              title="App Updates"
              description="Check for updates and manage app version"
              icon="system-update"
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('Update')}
              isLast={true}
              isTablet={isTablet}
            />
          </SettingsCard>
        );

      default:
        return null;
    }
  };

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const headerHeight = headerBaseHeight + topSpacing;

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
          />
          
          <View style={styles.tabletContent}>
            <ScrollView 
              style={styles.tabletScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.tabletScrollContent}
            >
              {renderCategoryContent(selectedCategory)}
              
              {selectedCategory === 'about' && (
                <View style={styles.footer}>
                  <Text style={[styles.footerText, { color: currentTheme.colors.mediumEmphasis }]}>
                    Made with ❤️ by the Nuvio team
                  </Text>
                </View>
              )}

              {/* Discord Join Button - Show on all categories for tablet */}
              <View style={styles.discordContainer}>
                <TouchableOpacity
                  style={[styles.discordButton, { backgroundColor: currentTheme.colors.elevation1 }]}
                  onPress={() => Linking.openURL('https://discord.gg/6w8dr3TSDN')}
                  activeOpacity={0.7}
                >
                  <View style={styles.discordButtonContent}>
                    <Image
                      source={{ uri: 'https://pngimg.com/uploads/discord/discord_PNG3.png' }}
                      style={styles.discordLogo}
                      resizeMode="contain"
                    />
                    <Text style={[styles.discordButtonText, { color: currentTheme.colors.highEmphasis }]}>
                      Join Discord
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
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
            {renderCategoryContent('account')}
            {renderCategoryContent('content')}
            {renderCategoryContent('appearance')}
            {renderCategoryContent('integrations')}
            {renderCategoryContent('ai')}
            {renderCategoryContent('playback')}
            {renderCategoryContent('updates')}
            {renderCategoryContent('about')}
            {renderCategoryContent('developer')}
            {renderCategoryContent('cache')}

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: currentTheme.colors.mediumEmphasis }]}>
                Made with ❤️ by the Nuvio team
              </Text>
            </View>

            {/* Discord Join Button */}
            <View style={styles.discordContainer}>
              <TouchableOpacity
                style={[styles.discordButton, { backgroundColor: currentTheme.colors.elevation1 }]}
                onPress={() => Linking.openURL('https://discord.gg/6w8dr3TSDN')}
                activeOpacity={0.7}
              >
                <View style={styles.discordButtonContent}>
                  <Image
                    source={{ uri: 'https://pngimg.com/uploads/discord/discord_PNG3.png' }}
                    style={styles.discordLogo}
                    resizeMode="contain"
                  />
                  <Text style={[styles.discordButtonText, { color: currentTheme.colors.highEmphasis }]}>
                    Join Discord
                  </Text>
                </View>
              </TouchableOpacity>
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
  // Mobile styles
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
  
  // Tablet-specific styles
  tabletContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 280,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
  },
  sidebarHeader: {
    padding: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 24 : 48,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  sidebarTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sidebarContent: {
    flex: 1,
    paddingTop: 16,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 12,
  },
  sidebarItemActive: {
    borderRadius: 12,
  },
  sidebarItemText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 16,
  },
  tabletContent: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 24 : 48,
  },
  tabletScrollView: {
    flex: 1,
    paddingHorizontal: 32,
  },
  tabletScrollContent: {
    paddingBottom: 32,
  },
  
  // Common card styles
  cardContainer: {
    width: '100%',
    marginBottom: 20,
  },
  tabletCardContainer: {
    marginBottom: 32,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginLeft: Math.max(12, width * 0.04),
    marginBottom: 8,
  },
  tabletCardTitle: {
    fontSize: 14,
    marginLeft: 0,
    marginBottom: 12,
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
    width: undefined,
  },
  tabletCard: {
    marginHorizontal: 0,
    borderRadius: 20,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
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
  tabletSettingItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 70,
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
  tabletSettingIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 20,
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
  tabletSettingTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: Math.min(14, width * 0.037),
    opacity: 0.8,
  },
  tabletSettingDescription: {
    fontSize: 16,
    opacity: 0.7,
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
  // New styles for Discord button
  discordContainer: {
    marginTop: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  discordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    maxWidth: 200,
  },
  discordButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discordLogo: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
  discordButtonText: {
    fontSize: 14,
    fontWeight: '500',
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