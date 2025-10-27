import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Switch,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Updates from 'expo-updates';
import { useNavigation } from '@react-navigation/native';
import { backupService } from '../services/backupService';
import { useTheme } from '../contexts/ThemeContext';
import { logger } from '../utils/logger';
import CustomAlert from '../components/CustomAlert';
import { useBackupOptions } from '../hooks/useBackupOptions';

const BackupScreen: React.FC = () => {
  const { currentTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const { preferences, updatePreference, getBackupOptions } = useBackupOptions();
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    coreData: false,
    addonsIntegrations: false,
    settingsPreferences: false,
  });
  
  // Animated values for each section
  const coreDataAnim = useRef(new Animated.Value(0)).current;
  const addonsAnim = useRef(new Animated.Value(0)).current;
  const settingsAnim = useRef(new Animated.Value(0)).current;
  
  // Chevron rotation animated values
  const coreDataChevron = useRef(new Animated.Value(0)).current;
  const addonsChevron = useRef(new Animated.Value(0)).current;
  const settingsChevron = useRef(new Animated.Value(0)).current;

  // Alert state
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
    setAlertActions(actions && actions.length > 0 ? actions : [{ label: 'OK', onPress: () => {} }]);
    setAlertVisible(true);
  };

  const restartApp = async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      logger.error('[BackupScreen] Failed to restart app:', error);
      // Fallback: show error message
      openAlert(
        'Restart Failed',
        'Failed to restart the app. Please manually close and reopen the app to see your restored data.',
        [{ label: 'OK', onPress: () => {} }]
      );
    }
  };

  // Toggle section collapse/expand
  const toggleSection = useCallback((section: 'coreData' | 'addonsIntegrations' | 'settingsPreferences') => {
    const isExpanded = expandedSections[section];
    
    let heightAnim: Animated.Value;
    let chevronAnim: Animated.Value;
    
    if (section === 'coreData') {
      heightAnim = coreDataAnim;
      chevronAnim = coreDataChevron;
    } else if (section === 'addonsIntegrations') {
      heightAnim = addonsAnim;
      chevronAnim = addonsChevron;
    } else {
      heightAnim = settingsAnim;
      chevronAnim = settingsChevron;
    }
    
    // Animate height and chevron rotation
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: isExpanded ? 0 : 1,
        duration: 300,
        useNativeDriver: false, // Required for height
        easing: Easing.inOut(Easing.ease),
      }),
      Animated.timing(chevronAnim, {
        toValue: isExpanded ? 0 : 1,
        duration: 300,
        useNativeDriver: true, // Transforms support native driver
        easing: Easing.inOut(Easing.ease),
      }),
    ]).start();
    
    setExpandedSections(prev => ({...prev, [section]: !isExpanded}));
  }, [expandedSections, coreDataAnim, addonsAnim, settingsAnim, coreDataChevron, addonsChevron, settingsChevron]);

  // Create backup
  const handleCreateBackup = useCallback(async () => {
    try {
      // First, get backup preview to show what will be backed up
      setIsLoading(true);
      const preview = await backupService.getBackupPreview();
      setIsLoading(false);

      // Filter based on preferences
      const items: string[] = [];
      let total = 0;

      if (preferences.includeLibrary) {
        items.push(`Library: ${preview.library} items`);
        total += preview.library;
      }

      if (preferences.includeWatchProgress) {
        items.push(`Watch Progress: ${preview.watchProgress} entries`);
        total += preview.watchProgress;
      }

      if (preferences.includeAddons) {
        items.push(`Addons: ${preview.addons} installed`);
        total += preview.addons;
      }

      if (preferences.includeLocalScrapers) {
        items.push(`Plugins: ${preview.scrapers} configurations`);
        total += preview.scrapers;
      }

      // Check if no items are selected
      const message = items.length > 0
        ? `Backup Contents:\n\n${items.join('\n')}\n\nTotal: ${total} items\n\nThis backup includes your selected app settings, themes, and integration data.`
        : `No content selected for backup.\n\nPlease enable at least one option in the Backup Options section above.`;

      openAlert(
        'Create Backup',
        message,
        items.length > 0
          ? [
              { label: 'Cancel', onPress: () => {} },
              {
                label: 'Create Backup',
                onPress: async () => {
                  try {
                    setIsLoading(true);

                    const backupOptions = getBackupOptions();

                    const fileUri = await backupService.createBackup(backupOptions);

                    // Share the backup file
                    if (await Sharing.isAvailableAsync()) {
                      await Sharing.shareAsync(fileUri, {
                        mimeType: 'application/json',
                        dialogTitle: 'Share Nuvio Backup',
                      });
                    }

                    openAlert(
                      'Backup Created',
                      'Your backup has been created and is ready to share.',
                      [{ label: 'OK', onPress: () => {} }]
                    );
                  } catch (error) {
                    logger.error('[BackupScreen] Failed to create backup:', error);
                    openAlert(
                      'Backup Failed',
                      `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`,
                      [{ label: 'OK', onPress: () => {} }]
                    );
                  } finally {
                    setIsLoading(false);
                  }
                }
              }
            ]
          : [{ label: 'OK', onPress: () => {} }]
      );
    } catch (error) {
      logger.error('[BackupScreen] Failed to get backup preview:', error);
      openAlert(
        'Error',
        'Failed to prepare backup information. Please try again.',
        [{ label: 'OK', onPress: () => {} }]
      );
      setIsLoading(false);
    }
  }, [openAlert, preferences, getBackupOptions]);

  // Restore backup
  const handleRestoreBackup = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const fileUri = result.assets[0].uri;

      // Validate backup file
      const backupInfo = await backupService.getBackupInfo(fileUri);

      openAlert(
        'Confirm Restore',
        `This will restore your data from a backup created on ${new Date(backupInfo.timestamp || 0).toLocaleDateString()}.\n\nThis action will overwrite your current data. Are you sure you want to continue?`,
        [
          { label: 'Cancel', onPress: () => {} },
          {
            label: 'Restore',
            onPress: async () => {
              try {
                setIsLoading(true);

                const restoreOptions = getBackupOptions();

                await backupService.restoreBackup(fileUri, restoreOptions);

                openAlert(
                  'Restore Complete',
                  'Your data has been successfully restored. Please restart the app to see all changes.',
                  [
                    { label: 'Cancel', onPress: () => {} },
                    { 
                      label: 'Restart App', 
                      onPress: restartApp,
                      style: { fontWeight: 'bold' }
                    }
                  ]
                );
              } catch (error) {
                logger.error('[BackupScreen] Failed to restore backup:', error);
                openAlert(
                  'Restore Failed',
                  `Failed to restore backup: ${error instanceof Error ? error.message : String(error)}`,
                  [{ label: 'OK', onPress: () => {} }]
                );
              } finally {
                setIsLoading(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      logger.error('[BackupScreen] Failed to pick backup file:', error);
      openAlert(
        'File Selection Failed',
        `Failed to select backup file: ${error instanceof Error ? error.message : String(error)}`,
        [{ label: 'OK', onPress: () => {} }]
      );
    }
  }, [openAlert]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="chevron-left" size={28} color={currentTheme.colors.white} />
          <Text style={[styles.backText, { color: currentTheme.colors.primary }]}>Settings</Text>
        </TouchableOpacity>
        
        <View style={styles.headerActions}>
          {/* Empty for now, but keeping structure consistent */}
        </View>
      </View>
      
      <Text style={[styles.headerTitle, { color: currentTheme.colors.white }]}>
        Backup & Restore
      </Text>

      {/* Content */}
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.content}>
          <CustomAlert
            visible={alertVisible}
            title={alertTitle}
            message={alertMessage}
            actions={alertActions}
            onClose={() => setAlertVisible(false)}
          />

          {/* Backup Options Section */}
          <View style={[styles.section, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
              Backup Options
            </Text>
            <Text style={[styles.sectionDescription, { color: currentTheme.colors.mediumEmphasis }]}>
              Choose what to include in your backups
            </Text>
            
            {/* Core Data Group */}
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('coreData')}
              activeOpacity={0.7}
            >
              <Text style={[styles.groupLabel, { color: currentTheme.colors.highEmphasis }]}>
                Core Data
              </Text>
              <Animated.View
                style={{
                  transform: [{
                    rotate: coreDataChevron.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['180deg', '0deg']
                    })
                  }]
                }}
              >
                <MaterialIcons name="expand-more" size={24} color={currentTheme.colors.highEmphasis} />
              </Animated.View>
            </TouchableOpacity>
            <Animated.View
              style={{
                maxHeight: coreDataAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2000]
                }),
                overflow: 'hidden',
                opacity: coreDataAnim,
              }}
            >
              <OptionToggle
                label="Library"
                description="Your saved movies and TV shows"
                value={preferences.includeLibrary}
                onValueChange={(v) => updatePreference('includeLibrary', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label="Watch Progress"
                description="Continue watching positions"
                value={preferences.includeWatchProgress}
                onValueChange={(v) => updatePreference('includeWatchProgress', v)}
                theme={currentTheme}
              />
            </Animated.View>
            
            {/* Addons & Integrations Group */}
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('addonsIntegrations')}
              activeOpacity={0.7}
            >
              <Text style={[styles.groupLabel, { color: currentTheme.colors.highEmphasis }]}>
                Addons & Integrations
              </Text>
              <Animated.View
                style={{
                  transform: [{
                    rotate: addonsChevron.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['180deg', '0deg']
                    })
                  }]
                }}
              >
                <MaterialIcons name="expand-more" size={24} color={currentTheme.colors.highEmphasis} />
              </Animated.View>
            </TouchableOpacity>
            <Animated.View
              style={{
                maxHeight: addonsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2000]
                }),
                overflow: 'hidden',
                opacity: addonsAnim,
              }}
            >
              <OptionToggle
                label="Addons"
                description="Installed Stremio addons"
                value={preferences.includeAddons}
                onValueChange={(v) => updatePreference('includeAddons', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label="Plugins"
                description="Custom scraper configurations"
                value={preferences.includeLocalScrapers}
                onValueChange={(v) => updatePreference('includeLocalScrapers', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label="Trakt Integration"
                description="Sync data and authentication tokens"
                value={preferences.includeTraktData}
                onValueChange={(v) => updatePreference('includeTraktData', v)}
                theme={currentTheme}
              />
            </Animated.View>
            
            {/* Settings & Preferences Group */}
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('settingsPreferences')}
              activeOpacity={0.7}
            >
              <Text style={[styles.groupLabel, { color: currentTheme.colors.highEmphasis }]}>
                Settings & Preferences
              </Text>
              <Animated.View
                style={{
                  transform: [{
                    rotate: settingsChevron.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['180deg', '0deg']
                    })
                  }]
                }}
              >
                <MaterialIcons name="expand-more" size={24} color={currentTheme.colors.highEmphasis} />
              </Animated.View>
            </TouchableOpacity>
            <Animated.View
              style={{
                maxHeight: settingsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 2000]
                }),
                overflow: 'hidden',
                opacity: settingsAnim,
              }}
            >
              <OptionToggle
                label="App Settings"
                description="Theme, preferences, and configurations"
                value={preferences.includeSettings}
                onValueChange={(v) => updatePreference('includeSettings', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label="User Preferences"
                description="Addon order and UI settings"
                value={preferences.includeUserPreferences}
                onValueChange={(v) => updatePreference('includeUserPreferences', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label="Catalog Settings"
                description="Catalog filters and preferences"
                value={preferences.includeCatalogSettings}
                onValueChange={(v) => updatePreference('includeCatalogSettings', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label="API Keys"
                description="MDBList and OpenRouter keys"
                value={preferences.includeApiKeys}
                onValueChange={(v) => updatePreference('includeApiKeys', v)}
                theme={currentTheme}
              />
            </Animated.View>
          </View>

          {/* Backup Actions */}
          <View style={[styles.section, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
              Backup & Restore
            </Text>

            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: currentTheme.colors.primary,
                  opacity: isLoading ? 0.6 : 1
                }
              ]}
              onPress={handleCreateBackup}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <MaterialIcons name="backup" size={20} color="white" />
                  <Text style={styles.actionButtonText}>Create Backup</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: currentTheme.colors.secondary,
                  opacity: isLoading ? 0.6 : 1
                }
              ]}
              onPress={handleRestoreBackup}
              disabled={isLoading}
            >
              <MaterialIcons name="restore" size={20} color="white" />
              <Text style={styles.actionButtonText}>Restore from Backup</Text>
            </TouchableOpacity>
          </View>

          {/* Info Section */}
          <View style={[styles.section, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
              About Backups
            </Text>
            <Text style={[styles.infoText, { color: currentTheme.colors.mediumEmphasis }]}>
              • Customize what gets backed up using the toggles above{'\n'}
              • Backup files are stored locally on your device{'\n'}
              • Share your backup to transfer data between devices{'\n'}
              • Restoring will overwrite your current data
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

interface OptionToggleProps {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: any;
}

const OptionToggle: React.FC<OptionToggleProps> = ({ label, description, value, onValueChange, theme }) => (
  <View style={[styles.optionRow, { borderBottomColor: theme.colors.outline }]}>
    <View style={styles.optionLeft}>
      <Text style={[styles.optionLabel, { color: theme.colors.highEmphasis }]}>
        {label}
      </Text>
      <Text style={[styles.optionDescription, { color: theme.colors.mediumEmphasis }]}>
        {description}
      </Text>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: theme.colors.outline, true: theme.colors.primary }}
      thumbColor={value ? '#fff' : '#f4f3f4'}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: {
    fontSize: 17,
    fontWeight: '400',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 8,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  optionLeft: {
    flex: 1,
    paddingRight: 16,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    lineHeight: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export default BackupScreen;
