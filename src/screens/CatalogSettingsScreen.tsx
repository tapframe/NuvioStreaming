import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles';
import { stremioService } from '../services/stremioService';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useCatalogContext } from '../contexts/CatalogContext';
import { logger } from '../utils/logger';

interface CatalogSetting {
  addonId: string;
  catalogId: string;
  type: string;
  name: string;
  enabled: boolean;
}

interface CatalogSettingsStorage {
  [key: string]: boolean | number;
  _lastUpdate: number;
}

interface GroupedCatalogs {
  [addonId: string]: {
    name: string;
    catalogs: CatalogSetting[];
    expanded: boolean;
    enabledCount: number;
  };
}

const CATALOG_SETTINGS_KEY = 'catalog_settings';
const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

const CatalogSettingsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CatalogSetting[]>([]);
  const [groupedSettings, setGroupedSettings] = useState<GroupedCatalogs>({});
  const navigation = useNavigation();
  const { refreshCatalogs } = useCatalogContext();
  const isDarkMode = true; // Force dark mode

  // Load saved settings and available catalogs
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get installed addons and their catalogs
      const addons = await stremioService.getInstalledAddonsAsync();
      const availableCatalogs: CatalogSetting[] = [];
      
      // Get saved settings
      const savedSettings = await AsyncStorage.getItem(CATALOG_SETTINGS_KEY);
      const savedCatalogs: { [key: string]: boolean } = savedSettings ? JSON.parse(savedSettings) : {};
      
      // Process each addon's catalogs
      addons.forEach(addon => {
        if (addon.catalogs && addon.catalogs.length > 0) {
          // Create a map to store unique catalogs by their type and id
          const uniqueCatalogs = new Map<string, CatalogSetting>();
          
          addon.catalogs.forEach(catalog => {
            // Create a unique key that includes addon id, type, and catalog id
            const settingKey = `${addon.id}:${catalog.type}:${catalog.id}`;
            
            // Format catalog name
            let displayName = catalog.name || catalog.id;
            
            // If catalog is a movie or series catalog, make that clear
            const catalogType = catalog.type === 'movie' ? 'Movies' : catalog.type === 'series' ? 'TV Shows' : catalog.type.charAt(0).toUpperCase() + catalog.type.slice(1);
            
            uniqueCatalogs.set(settingKey, {
              addonId: addon.id,
              catalogId: catalog.id,
              type: catalog.type,
              name: displayName,
              enabled: savedCatalogs[settingKey] !== undefined ? savedCatalogs[settingKey] : true // Enable by default
            });
          });
          
          // Add unique catalogs to the available catalogs array
          availableCatalogs.push(...uniqueCatalogs.values());
        }
      });
      
      // Group settings by addon name
      const grouped: GroupedCatalogs = {};
      
      availableCatalogs.forEach(setting => {
        const addon = addons.find(a => a.id === setting.addonId);
        if (!addon) return;
        
        if (!grouped[setting.addonId]) {
          grouped[setting.addonId] = {
            name: addon.name,
            catalogs: [],
            expanded: true, // Start expanded
            enabledCount: 0
          };
        }
        
        grouped[setting.addonId].catalogs.push(setting);
        if (setting.enabled) {
          grouped[setting.addonId].enabledCount++;
        }
      });
      
      setSettings(availableCatalogs);
      setGroupedSettings(grouped);
    } catch (error) {
      logger.error('Failed to load catalog settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save settings when they change
  const saveSettings = async (newSettings: CatalogSetting[]) => {
    try {
      const settingsObj: CatalogSettingsStorage = {
        _lastUpdate: Date.now()
      };
      newSettings.forEach(setting => {
        const key = `${setting.addonId}:${setting.type}:${setting.catalogId}`;
        settingsObj[key] = setting.enabled;
      });
      await AsyncStorage.setItem(CATALOG_SETTINGS_KEY, JSON.stringify(settingsObj));
      refreshCatalogs(); // Trigger catalog refresh after saving settings
    } catch (error) {
      logger.error('Failed to save catalog settings:', error);
    }
  };

  // Toggle individual catalog
  const toggleCatalog = (addonId: string, index: number) => {
    const newSettings = [...settings];
    const catalogsForAddon = groupedSettings[addonId].catalogs;
    const setting = catalogsForAddon[index];
    
    const updatedSetting = {
      ...setting,
      enabled: !setting.enabled
    };
    
    // Update the setting in the flat list
    const flatIndex = newSettings.findIndex(s => 
      s.addonId === setting.addonId && 
      s.type === setting.type && 
      s.catalogId === setting.catalogId
    );
    
    if (flatIndex !== -1) {
      newSettings[flatIndex] = updatedSetting;
    }
    
    // Update the grouped settings
    const newGroupedSettings = { ...groupedSettings };
    newGroupedSettings[addonId].catalogs[index] = updatedSetting;
    newGroupedSettings[addonId].enabledCount += updatedSetting.enabled ? 1 : -1;
    
    setSettings(newSettings);
    setGroupedSettings(newGroupedSettings);
    saveSettings(newSettings);
  };

  // Toggle expansion of a group
  const toggleExpansion = (addonId: string) => {
    setGroupedSettings(prev => ({
      ...prev,
      [addonId]: {
        ...prev[addonId],
        expanded: !prev[addonId].expanded
      }
    }));
  };

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="chevron-left" size={28} color={colors.primary} />
            <Text style={styles.backText}>Settings</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Catalogs</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="chevron-left" size={28} color={colors.primary} />
          <Text style={styles.backText}>Settings</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.headerTitle}>Catalogs</Text>
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {Object.entries(groupedSettings).map(([addonId, group]) => (
          <View key={addonId} style={styles.addonSection}>
            <Text style={styles.addonTitle}>
              {group.name.toUpperCase()}
            </Text>
            
            <View style={styles.card}>
              <TouchableOpacity 
                style={styles.groupHeader}
                onPress={() => toggleExpansion(addonId)}
                activeOpacity={0.7}
              >
                <Text style={styles.groupTitle}>Catalogs</Text>
                <View style={styles.groupHeaderRight}>
                  <Text style={styles.enabledCount}>
                    {group.enabledCount} of {group.catalogs.length} enabled
                  </Text>
                  <MaterialIcons 
                    name={group.expanded ? "keyboard-arrow-down" : "keyboard-arrow-right"} 
                    size={24} 
                    color={colors.mediumGray} 
                  />
                </View>
              </TouchableOpacity>
              
              {group.expanded && group.catalogs.map((setting, index) => (
                <View key={`${setting.addonId}:${setting.type}:${setting.catalogId}`} style={styles.catalogItem}>
                  <View style={styles.catalogInfo}>
                    <Text style={styles.catalogName}>
                      {setting.name}
                    </Text>
                    <Text style={styles.catalogType}>
                      {setting.type.charAt(0).toUpperCase() + setting.type.slice(1)}
                    </Text>
                  </View>
                  <Switch
                    value={setting.enabled}
                    onValueChange={() => toggleCatalog(addonId, index)}
                    trackColor={{ false: '#505050', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.white : undefined}
                    ios_backgroundColor="#505050"
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
        
        <View style={styles.addonSection}>
          <Text style={styles.addonTitle}>ORGANIZATION</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.organizationItem}>
              <Text style={styles.organizationItemText}>Reorder Sections</Text>
              <MaterialIcons name="chevron-right" size={24} color={colors.mediumGray} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.organizationItem}>
              <Text style={styles.organizationItemText}>Customize Names</Text>
              <MaterialIcons name="chevron-right" size={24} color={colors.mediumGray} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 8 : 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.primary,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.white,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  addonSection: {
    marginBottom: 24,
  },
  addonTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mediumGray,
    marginHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 0.8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.elevation2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  groupTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  enabledCount: {
    fontSize: 15,
    color: colors.mediumGray,
    marginRight: 8,
  },
  catalogItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  catalogInfo: {
    flex: 1,
  },
  catalogName: {
    fontSize: 15,
    color: colors.white,
    marginBottom: 2,
  },
  catalogType: {
    fontSize: 13,
    color: colors.mediumGray,
  },
  organizationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  organizationItemText: {
    fontSize: 17,
    color: colors.white,
  },
});

export default CatalogSettingsScreen; 