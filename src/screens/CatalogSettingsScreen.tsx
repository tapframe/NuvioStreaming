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
  Modal,
  TextInput,
  Pressable,
  Button,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../styles';
import { stremioService } from '../services/stremioService';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useCatalogContext } from '../contexts/CatalogContext';
import { logger } from '../utils/logger';
import { BlurView } from 'expo-blur';

interface CatalogSetting {
  addonId: string;
  catalogId: string;
  type: string;
  name: string;
  enabled: boolean;
  customName?: string;
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
const CATALOG_CUSTOM_NAMES_KEY = 'catalog_custom_names';
const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

const CatalogSettingsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CatalogSetting[]>([]);
  const [groupedSettings, setGroupedSettings] = useState<GroupedCatalogs>({});
  const navigation = useNavigation();
  const { refreshCatalogs } = useCatalogContext();
  const isDarkMode = true; // Force dark mode

  // Modal State
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [catalogToRename, setCatalogToRename] = useState<CatalogSetting | null>(null);
  const [currentRenameValue, setCurrentRenameValue] = useState('');

  // Load saved settings and available catalogs
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get installed addons and their catalogs
      const addons = await stremioService.getInstalledAddonsAsync();
      const availableCatalogs: CatalogSetting[] = [];
      
      // Get saved enable/disable settings
      const savedSettingsJson = await AsyncStorage.getItem(CATALOG_SETTINGS_KEY);
      const savedEnabledSettings: { [key: string]: boolean } = savedSettingsJson ? JSON.parse(savedSettingsJson) : {};

      // Get saved custom names
      const savedCustomNamesJson = await AsyncStorage.getItem(CATALOG_CUSTOM_NAMES_KEY);
      const savedCustomNames: { [key: string]: string } = savedCustomNamesJson ? JSON.parse(savedCustomNamesJson) : {};
      
      // Process each addon's catalogs
      addons.forEach(addon => {
        if (addon.catalogs && addon.catalogs.length > 0) {
          const uniqueCatalogs = new Map<string, CatalogSetting>();
          
          addon.catalogs.forEach(catalog => {
            const settingKey = `${addon.id}:${catalog.type}:${catalog.id}`;
            let displayName = catalog.name || catalog.id;
            const catalogType = catalog.type === 'movie' ? 'Movies' : catalog.type === 'series' ? 'TV Shows' : catalog.type.charAt(0).toUpperCase() + catalog.type.slice(1);
            
            uniqueCatalogs.set(settingKey, {
              addonId: addon.id,
              catalogId: catalog.id,
              type: catalog.type,
              name: displayName,
              enabled: savedEnabledSettings[settingKey] !== undefined ? savedEnabledSettings[settingKey] : true,
              customName: savedCustomNames[settingKey]
            });
          });
          
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
            expanded: true, 
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

  // Save settings when they change (ENABLE/DISABLE ONLY)
  const saveEnabledSettings = async (newSettings: CatalogSetting[]) => {
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
      logger.error('Failed to save catalog enabled settings:', error);
    }
  };

  // Toggle individual catalog enabled state
  const toggleCatalog = (addonId: string, index: number) => {
    const newSettings = [...settings];
    const catalogsForAddon = groupedSettings[addonId].catalogs;
    const setting = catalogsForAddon[index];
    
    const updatedSetting = {
      ...setting,
      enabled: !setting.enabled
    };
    
    const flatIndex = newSettings.findIndex(s => 
      s.addonId === setting.addonId && 
      s.type === setting.type && 
      s.catalogId === setting.catalogId
    );
    
    if (flatIndex !== -1) {
      newSettings[flatIndex] = updatedSetting;
    }
    
    const newGroupedSettings = { ...groupedSettings };
    newGroupedSettings[addonId].catalogs[index] = updatedSetting;
    newGroupedSettings[addonId].enabledCount += updatedSetting.enabled ? 1 : -1;
    
    setSettings(newSettings);
    setGroupedSettings(newGroupedSettings);
    saveEnabledSettings(newSettings); // Use specific save function
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

  // Handle long press on catalog item
  const handleLongPress = (setting: CatalogSetting) => {
    setCatalogToRename(setting);
    setCurrentRenameValue(setting.customName || setting.name);
    setIsRenameModalVisible(true);
  };

  // Handle saving the renamed catalog
  const handleSaveRename = async () => {
    if (!catalogToRename || !currentRenameValue) return;

    const settingKey = `${catalogToRename.addonId}:${catalogToRename.type}:${catalogToRename.catalogId}`;
    
    try {
      const savedCustomNamesJson = await AsyncStorage.getItem(CATALOG_CUSTOM_NAMES_KEY);
      const customNames: { [key: string]: string } = savedCustomNamesJson ? JSON.parse(savedCustomNamesJson) : {};
      
      const trimmedNewName = currentRenameValue.trim();

      if (trimmedNewName === catalogToRename.name || trimmedNewName === '') {
        delete customNames[settingKey];
      } else {
        customNames[settingKey] = trimmedNewName;
      }
      
      await AsyncStorage.setItem(CATALOG_CUSTOM_NAMES_KEY, JSON.stringify(customNames));

      // --- Reload settings to reflect the change --- 
      await loadSettings(); 
      // --- No need to manually update local state anymore --- 

    } catch (error) {
      logger.error('Failed to save custom catalog name:', error);
      Alert.alert('Error', 'Could not save the custom name.'); // Inform user
    } finally {
      setIsRenameModalVisible(false);
      setCatalogToRename(null);
      setCurrentRenameValue('');
    }
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
                <Pressable 
                  key={`${setting.addonId}:${setting.type}:${setting.catalogId}`}
                  onLongPress={() => handleLongPress(setting)} // Added long press handler
                  style={({ pressed }) => [
                    styles.catalogItem,
                    pressed && styles.catalogItemPressed, // Optional pressed style
                  ]}
                >
                  <View style={styles.catalogInfo}>
                    <Text style={styles.catalogName}>
                      {setting.customName || setting.name} {/* Display custom or default name */}
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
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Rename Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isRenameModalVisible}
        onRequestClose={() => {
          setIsRenameModalVisible(false);
          setCatalogToRename(null);
        }}
      >
        {Platform.OS === 'ios' ? (
          <Pressable style={styles.modalOverlay} onPress={() => setIsRenameModalVisible(false)}>
            <BlurView 
              style={styles.modalContent}
              intensity={90}
              tint="default"
            >
              <Pressable onPress={(e) => e.stopPropagation()}> 
                <Text style={styles.modalTitle}>Rename Catalog</Text>
                <TextInput
                  style={styles.modalInput}
                  value={currentRenameValue}
                  onChangeText={setCurrentRenameValue}
                  placeholder="Enter new catalog name"
                  placeholderTextColor={colors.mediumGray}
                  autoFocus={true}
                />
                <View style={styles.modalButtons}>
                  <Button title="Cancel" onPress={() => setIsRenameModalVisible(false)} color={colors.mediumGray} />
                  <Button title="Save" onPress={handleSaveRename} color={colors.primary} />
                </View>
              </Pressable>
            </BlurView>
          </Pressable>
        ) : (
          <Pressable style={styles.modalOverlay} onPress={() => setIsRenameModalVisible(false)}> 
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}> 
              <Text style={styles.modalTitle}>Rename Catalog</Text>
              <TextInput
                style={styles.modalInput}
                value={currentRenameValue}
                onChangeText={setCurrentRenameValue}
                placeholder="Enter new catalog name"
                placeholderTextColor={colors.mediumGray}
                autoFocus={true}
              />
              <View style={styles.modalButtons}>
                <Button title="Cancel" onPress={() => setIsRenameModalVisible(false)} color={colors.mediumGray} />
                <Button title="Save" onPress={handleSaveRename} color={colors.primary} />
              </View>
            </Pressable>
          </Pressable>
        )}
      </Modal>

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
    // Ensure last item doesn't have border if needed (check logic)
  },
  catalogItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Subtle feedback for press
  },
  catalogInfo: {
    flex: 1,
    marginRight: 8, // Add space before switch
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

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: Platform.OS === 'ios' ? undefined : colors.elevation3,
    borderRadius: 14,
    padding: 20,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: colors.elevation1, // Darker input background
    color: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Adjust as needed (e.g., 'flex-end')
  },
});

export default CatalogSettingsScreen; 