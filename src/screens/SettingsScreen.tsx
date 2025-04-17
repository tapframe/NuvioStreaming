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
  Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { colors } from '../styles/colors';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';
import { stremioService } from '../services/stremioService';
import { useCatalogContext } from '../contexts/CatalogContext';

const { width } = Dimensions.get('window');

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Card component for iOS Fluent design style
interface SettingsCardProps {
  children: React.ReactNode;
  isDarkMode: boolean;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, isDarkMode }) => (
  <View style={[
    styles.card,
    { backgroundColor: isDarkMode ? colors.elevation2 : colors.white }
  ]}>
    {children}
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
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  renderControl,
  isLast = false,
  onPress,
  isDarkMode
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
      <View style={styles.settingIconContainer}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTitleRow}>
          <Text style={[styles.settingTitle, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>
            {title}
          </Text>
          {description && (
            <Text style={[styles.settingDescription, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>
              {description}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.settingControl}>
        {renderControl()}
      </View>
    </TouchableOpacity>
  );
};

const SectionHeader: React.FC<{ title: string; isDarkMode: boolean }> = ({ title, isDarkMode }) => (
  <View style={styles.sectionHeader}>
    <Text style={[
      styles.sectionHeaderText,
      { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
    ]}>
      {title}
    </Text>
  </View>
);

const SettingsScreen: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const systemColorScheme = useColorScheme();
  const isDarkMode = systemColorScheme === 'dark' || settings.enableDarkMode;
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { lastUpdate } = useCatalogContext();
  
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
      size={24} 
      color={isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
    />
  );

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
      </View>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <SectionHeader title="USER & ACCOUNT" isDarkMode={isDarkMode} />
        <SettingsCard isDarkMode={isDarkMode}>
          <SettingItem
            title="Trakt"
            description="Not Connected"
            icon="person"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => Alert.alert('Trakt', 'Trakt integration coming soon')}
          />
          <SettingItem
            title="iCloud Sync"
            description="Enabled"
            icon="cloud"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            isLast={true}
          />
        </SettingsCard>

        <SectionHeader title="CONTENT" isDarkMode={isDarkMode} />
        <SettingsCard isDarkMode={isDarkMode}>
          <SettingItem
            title="Addons"
            description={addonCount + " installed"}
            icon="extension"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('Addons')}
          />
          <SettingItem
            title="Catalogs"
            description={`${catalogCount} ${catalogCount === 1 ? 'catalog' : 'catalogs'} enabled`}
            icon="view-list"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('CatalogSettings')}
          />
          <SettingItem
            title="Home Screen"
            description="Customize home layout and content"
            icon="home"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            onPress={() => navigation.navigate('HomeScreenSettings')}
          />
          <SettingItem
            title="Folders"
            description="0 created"
            icon="folder"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
          />
          <SettingItem
            title="Ratings Source"
            description={mdblistKeySet ? "MDBList API Configured" : "MDBList API Not Set"}
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
          />
          <SettingItem
            title="Resource Filters"
            icon="tune"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
          />
          <SettingItem
            title="AI Features"
            description="Not Connected"
            icon="auto-awesome"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            isLast={true}
          />
        </SettingsCard>

        <SectionHeader title="PLAYBACK" isDarkMode={isDarkMode} />
        <SettingsCard isDarkMode={isDarkMode}>
          <SettingItem
            title="Video Player"
            description="Infuse"
            icon="play-arrow"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
          />
          <SettingItem
            title="Auto-Filtering"
            description="Disabled"
            icon="tune"
            isDarkMode={isDarkMode}
            renderControl={ChevronRight}
            isLast={true}
          />
        </SettingsCard>
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
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    minHeight: 44,
  },
  settingItemBorder: {
    // Border styling handled directly in the component with borderBottomWidth
  },
  settingIconContainer: {
    marginRight: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    marginRight: 8,
  },
  settingTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '400',
    flex: 1,
  },
  settingDescription: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '60%',
  },
  settingControl: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
  },
});

export default SettingsScreen;