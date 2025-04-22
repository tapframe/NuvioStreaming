import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  useColorScheme,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  Dimensions,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../styles/colors';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';
import { stremioService } from '../services/stremioService';
import { useCatalogContext } from '../contexts/CatalogContext';
import { useTraktContext } from '../contexts/TraktContext';
import { catalogService, DataSource } from '../services/catalogService';

const { width } = Dimensions.get('window');

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Card component with modern style
interface SettingsCardProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  title?: string;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, isDarkMode, title }) => (
  <View style={[styles.cardContainer]}>
    {title && (
      <Text style={[
        styles.cardTitle,
        { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
      ]}>
        {title.toUpperCase()}
      </Text>
    )}
    <View style={[
      styles.card,
      { backgroundColor: isDarkMode ? colors.elevation2 : colors.white }
    ]}>
      {children}
    </View>
  </View>
);

interface SettingItemProps {
  title: string;
  description?: string;
  icon: string;
  renderControl: () => React.ReactNode;
  isLast?: boolean;
  onPress?: () => void;
  isDarkMode: boolean;
  badge?: string | number;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  renderControl,
  isLast = false,
  onPress,
  isDarkMode,
  badge
}) => {
  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.settingItem, 
        !isLast && styles.settingItemBorder,
        { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }
      ]}
    >
      <View style={[
        styles.settingIconContainer,
        { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
      ]}>
        <MaterialIcons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>
            {title}
          </Text>
          {description && (
            <Text style={[styles.settingDescription, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>
              {description}
            </Text>
          )}
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={styles.settingControl}>
        {renderControl()}
      </View>
    </TouchableOpacity>
  );
};

const SettingsScreen: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const systemColorScheme = useColorScheme();
  const isDarkMode = systemColorScheme === 'dark' || settings.enableDarkMode;
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { lastUpdate } = useCatalogContext();
  const { isAuthenticated, userProfile } = useTraktContext();
  
  // States for dynamic content
  const [addonCount, setAddonCount] = useState<number>(0);
  const [catalogCount, setCatalogCount] = useState<number>(0);
  const [mdblistKeySet, setMdblistKeySet] = useState<boolean>(false);
  const [discoverDataSource, setDiscoverDataSource] = useState<DataSource>(DataSource.STREMIO_ADDONS);

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
      
      // Get discover data source preference
      const dataSource = await catalogService.getDataSourcePreference();
      setDiscoverDataSource(dataSource);
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

  const CustomSwitch = ({ value, onValueChange }: { value: boolean, onValueChange: (value: boolean) => void }) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: colors.primary }}
      thumbColor={Platform.OS === 'android' ? (value ? colors.white : colors.white) : ''}
      ios_backgroundColor={isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
    />
  );

  const ChevronRight = () => (
    <MaterialIcons 
      name="chevron-right" 
      size={22} 
      color={isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
    />
  );

  // Handle data source change
  const handleDiscoverDataSourceChange = useCallback(async (value: string) => {
    const dataSource = value as DataSource;
    setDiscoverDataSource(dataSource);
    await catalogService.setDataSourcePreference(dataSource);
  }, []);

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: isDarkMode ? colors.darkBackground : '#F2F2F7' }
    ]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>
          Settings
        </Text>
        <TouchableOpacity onPress={handleResetSettings} style={styles.resetButton}>
          <Text style={[styles.resetButtonText, {color: colors.primary}]}>Reset</Text>
        </TouchableOpacity>
      </View>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <SettingsCard isDarkMode={isDarkMode} title="User & Account">
          <SettingItem
            title="Trakt"
            description={isAuthenticated ? `Connected as ${userProfile?.username || 'User'}` : "Not Connected"}
            icon="person"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('TraktSettings')}
            isLast={true}
          />
        </SettingsCard>

        <SettingsCard isDarkMode={isDarkMode} title="Features">
          <SettingItem
            title="Calendar"
            description="Manage your show calendar settings"
            icon="calendar-today"
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('Calendar')}
            isDarkMode={isDarkMode}
          />
          <SettingItem
            title="Notifications"
            description="Configure episode notifications and reminders"
            icon="notifications"
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('NotificationSettings')}
            isDarkMode={isDarkMode}
            isLast={true}
          />
        </SettingsCard>

        <SettingsCard isDarkMode={isDarkMode} title="Content">
          <SettingItem
            title="Addons"
            description="Manage your installed addons"
            icon="extension"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('Addons')}
            badge={addonCount}
          />
          <SettingItem
            title="Catalogs"
            description="Configure content sources"
            icon="view-list"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('CatalogSettings')}
            badge={catalogCount}
          />
          <SettingItem
            title="Home Screen"
            description="Customize layout and content"
            icon="home"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('HomeScreenSettings')}
          />
          <SettingItem
            title="Ratings Source"
            description={mdblistKeySet ? "MDBList API Configured" : "Configure MDBList API"}
            icon="info-outline"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('MDBListSettings')}
          />
          <SettingItem
            title="TMDB"
            description="API & Metadata Settings"
            icon="movie-filter"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('TMDBSettings')}
            isLast={true}
          />
        </SettingsCard>

        <SettingsCard isDarkMode={isDarkMode} title="Playback">
          <SettingItem
            title="Video Player"
            description={Platform.OS === 'ios' 
              ? (settings.preferredPlayer === 'internal' 
                ? 'Built-in Player' 
                : settings.preferredPlayer 
                  ? settings.preferredPlayer.toUpperCase()
                  : 'Built-in Player')
              : (settings.useExternalPlayer ? 'External Player' : 'Built-in Player')
            }
            icon="play-arrow"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('PlayerSettings')}
            isLast={true}
          />
        </SettingsCard>

        <SettingsCard isDarkMode={isDarkMode} title="Discover">
          <SettingItem
            title="Content Source"
            description="Choose where to get content for the Discover screen"
            icon="explore"
            isDarkMode={isDarkMode}
            renderControl={() => (
              <View style={styles.selectorContainer}>
                <TouchableOpacity
                  style={[
                    styles.selectorButton,
                    discoverDataSource === DataSource.STREMIO_ADDONS && styles.selectorButtonActive
                  ]}
                  onPress={() => handleDiscoverDataSourceChange(DataSource.STREMIO_ADDONS)}
                >
                  <Text style={[
                    styles.selectorText,
                    discoverDataSource === DataSource.STREMIO_ADDONS && styles.selectorTextActive
                  ]}>Addons</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectorButton,
                    discoverDataSource === DataSource.TMDB && styles.selectorButtonActive
                  ]}
                  onPress={() => handleDiscoverDataSourceChange(DataSource.TMDB)}
                >
                  <Text style={[
                    styles.selectorText,
                    discoverDataSource === DataSource.TMDB && styles.selectorTextActive
                  ]}>TMDB</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </SettingsCard>

        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, {color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark}]}>
            Version 1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 12 : 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resetButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  cardContainer: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginLeft: 16,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    minHeight: 58,
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
  settingTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 14,
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
  versionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  versionText: {
    fontSize: 14,
  },
  pickerContainer: {
    flex: 1,
  },
  picker: {
    flex: 1,
  },
  selectorContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    height: 36,
    width: 160,
    marginRight: 8,
  },
  selectorButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  selectorButtonActive: {
    backgroundColor: colors.primary,
  },
  selectorText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.mediumEmphasis,
  },
  selectorTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
});

export default SettingsScreen;