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
  Image
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
import { catalogService, DataSource } from '../services/catalogService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Card component with modern style
interface SettingsCardProps {
  children: React.ReactNode;
  title?: string;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, title }) => {
  const { currentTheme } = useTheme();
  
  return (
    <View style={[styles.cardContainer]}>
      {title && (
        <Text style={[
          styles.cardTitle,
          { color: currentTheme.colors.mediumEmphasis }
        ]}>
          {title.toUpperCase()}
        </Text>
      )}
      <View style={[
        styles.card,
        { backgroundColor: currentTheme.colors.elevation2 }
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
  renderControl: () => React.ReactNode;
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
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.settingItem, 
        !isLast && styles.settingItemBorder,
        { borderBottomColor: 'rgba(255,255,255,0.08)' }
      ]}
    >
      <View style={[
        styles.settingIconContainer,
        { backgroundColor: 'rgba(255,255,255,0.1)' }
      ]}>
        <MaterialIcons name={icon} size={20} color={currentTheme.colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: currentTheme.colors.highEmphasis }]}>
            {title}
          </Text>
          {description && (
            <Text style={[styles.settingDescription, { color: currentTheme.colors.mediumEmphasis }]}>
              {description}
            </Text>
          )}
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: currentTheme.colors.primary }]}>
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
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { lastUpdate } = useCatalogContext();
  const { isAuthenticated, userProfile } = useTraktContext();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
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
      trackColor={{ false: 'rgba(255,255,255,0.1)', true: currentTheme.colors.primary }}
      thumbColor={Platform.OS === 'android' ? (value ? currentTheme.colors.white : currentTheme.colors.white) : ''}
      ios_backgroundColor={'rgba(255,255,255,0.1)'}
    />
  );

  const ChevronRight = () => (
    <MaterialIcons 
      name="chevron-right" 
      size={22} 
      color={'rgba(255,255,255,0.3)'}
    />
  );

  // Handle data source change
  const handleDiscoverDataSourceChange = useCallback(async (value: string) => {
    const dataSource = value as DataSource;
    setDiscoverDataSource(dataSource);
    await catalogService.setDataSourcePreference(dataSource);
  }, []);

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
            <SettingsCard title="User & Account">
              <SettingItem
                title="Trakt"
                description={isAuthenticated ? `Connected as ${userProfile?.username || 'User'}` : "Not Connected"}
                icon="person"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('TraktSettings')}
                isLast={false}
              />
            </SettingsCard>

            <SettingsCard title="Appearance">
              <SettingItem
                title="Theme"
                description={currentTheme.name}
                icon="palette"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('ThemeSettings')}
                isLast={true}
              />
            </SettingsCard>

            <SettingsCard title="Features">
              <SettingItem
                title="Calendar"
                description="Manage your show calendar settings"
                icon="calendar-today"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('Calendar')}
              />
              <SettingItem
                title="Notifications"
                description="Configure episode notifications and reminders"
                icon="notifications"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('NotificationSettings')}
                isLast={true}
              />
            </SettingsCard>

            <SettingsCard title="Content">
              <SettingItem
                title="Addons"
                description="Manage your installed addons"
                icon="extension"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('Addons')}
                badge={addonCount}
              />
              <SettingItem
                title="Catalogs"
                description="Configure content sources"
                icon="view-list"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('CatalogSettings')}
                badge={catalogCount}
              />
              <SettingItem
                title="Home Screen"
                description="Customize layout and content"
                icon="home"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('HomeScreenSettings')}
              />
              <SettingItem
                title="MDBList Integration"
                description={mdblistKeySet ? "Ratings and reviews provided by MDBList" : "Connect MDBList for ratings and reviews"}
                icon="info-outline"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('MDBListSettings')}
              />
              <SettingItem
                title="Image Sources"
                description="Choose primary source for title logos and backgrounds"
                icon="image"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('LogoSourceSettings')}
              />
              <SettingItem
                title="TMDB"
                description="API & Metadata Settings"
                icon="movie-filter"
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('TMDBSettings')}
                isLast={true}
              />
            </SettingsCard>

            <SettingsCard title="Playback">
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
                renderControl={ChevronRight}
                onPress={() => navigation.navigate('PlayerSettings')}
                isLast={true}
              />
            </SettingsCard>

            <SettingsCard title="Discover">
              <SettingItem
                title="Content Source"
                description="Choose where to get content for the Discover screen"
                icon="explore"
                renderControl={() => (
                  <View style={styles.selectorContainer}>
                    <TouchableOpacity
                      style={[
                        styles.selectorButton,
                        discoverDataSource === DataSource.STREMIO_ADDONS && {
                          backgroundColor: currentTheme.colors.primary
                        }
                      ]}
                      onPress={() => handleDiscoverDataSourceChange(DataSource.STREMIO_ADDONS)}
                    >
                      <Text style={[
                        styles.selectorText,
                        { color: currentTheme.colors.mediumEmphasis },
                        discoverDataSource === DataSource.STREMIO_ADDONS && {
                          color: currentTheme.colors.white,
                          fontWeight: '600'
                        }
                      ]}>Addons</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.selectorButton,
                        discoverDataSource === DataSource.TMDB && {
                          backgroundColor: currentTheme.colors.primary
                        }
                      ]}
                      onPress={() => handleDiscoverDataSourceChange(DataSource.TMDB)}
                    >
                      <Text style={[
                        styles.selectorText,
                        { color: currentTheme.colors.mediumEmphasis },
                        discoverDataSource === DataSource.TMDB && {
                          color: currentTheme.colors.white,
                          fontWeight: '600'
                        }
                      ]}>TMDB</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            </SettingsCard>

            <View style={styles.versionContainer}>
              <Text style={[styles.versionText, {color: currentTheme.colors.mediumEmphasis}]}>
                Version 1.0.0
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
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  headerTitle: {
    fontSize: 32,
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
    paddingBottom: 32,
  },
  cardContainer: {
    width: '100%',
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
    width: undefined, // Let it fill the container width
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    minHeight: 58,
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
  selectorText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default SettingsScreen;