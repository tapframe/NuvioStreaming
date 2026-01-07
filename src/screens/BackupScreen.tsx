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
import { useTranslation } from 'react-i18next';

const BackupScreen: React.FC = () => {
  const { currentTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const { preferences, updatePreference, getBackupOptions } = useBackupOptions();
  const { t } = useTranslation();

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
    setAlertActions(actions && actions.length > 0 ? actions : [{ label: t('common.ok'), onPress: () => { } }]);
    setAlertVisible(true);
  };

  const restartApp = async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      logger.error('[BackupScreen] Failed to restart app:', error);
      // Fallback: show error message
      openAlert(
        t('backup.alert_restart_failed_title'),
        t('backup.alert_restart_failed_msg'),
        [{ label: t('common.ok'), onPress: () => { } }]
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

    setExpandedSections(prev => ({ ...prev, [section]: !isExpanded }));
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
        items.push(`${t('backup.library_label')}: ${preview.library} items`);
        total += preview.library;
      }

      if (preferences.includeWatchProgress) {
        items.push(`${t('backup.watch_progress_label')}: ${preview.watchProgress} entries`);
        total += preview.watchProgress;
        // Include watched status with watch progress
        items.push(`Watched Status: ${preview.watchedStatus} items`);
        total += preview.watchedStatus;
      }

      if (preferences.includeAddons) {
        items.push(`${t('backup.addons_label')}: ${preview.addons} installed`);
        total += preview.addons;
      }

      if (preferences.includeLocalScrapers) {
        items.push(`${t('backup.plugins_label')}: ${preview.scrapers} configurations`);
        total += preview.scrapers;
      }

      // Check if no items are selected
      const message = items.length > 0
        ? `Backup Contents:\n\n${items.join('\n')}\n\nTotal: ${total} items\n\nThis backup includes your selected app settings, themes, watched markers, and integration data.`
        : t('backup.alert_no_content');

      openAlert(
        t('backup.alert_create_title'),
        message,
        items.length > 0
          ? [
            { label: t('common.cancel'), onPress: () => { } },
            {
              label: t('backup.action_create'),
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
                    t('backup.alert_backup_created_title'),
                    t('backup.alert_backup_created_msg'),
                    [{ label: t('common.ok'), onPress: () => { } }]
                  );
                } catch (error) {
                  logger.error('[BackupScreen] Failed to create backup:', error);
                  openAlert(
                    t('backup.alert_backup_failed_title'),
                    `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`,
                    [{ label: t('common.ok'), onPress: () => { } }]
                  );
                } finally {
                  setIsLoading(false);
                }
              }
            }
          ]
          : [{ label: t('common.ok'), onPress: () => { } }]
      );
    } catch (error) {
      logger.error('[BackupScreen] Failed to get backup preview:', error);
      openAlert(
        t('common.error'),
        'Failed to prepare backup information. Please try again.',
        [{ label: t('common.ok'), onPress: () => { } }]
      );
      setIsLoading(false);
    }
  }, [openAlert, preferences, getBackupOptions, t]);

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
        t('backup.alert_restore_confirm_title'),
        t('backup.alert_restore_confirm_msg', {
          date: new Date(backupInfo.timestamp || 0).toLocaleDateString()
        }),
        [
          { label: t('common.cancel'), onPress: () => { } },
          {
            label: 'Restore',
            onPress: async () => {
              try {
                setIsLoading(true);

                const restoreOptions = getBackupOptions();

                await backupService.restoreBackup(fileUri, restoreOptions);

                openAlert(
                  t('backup.alert_restore_complete_title'),
                  t('backup.alert_restore_complete_msg'),
                  [
                    { label: t('common.cancel'), onPress: () => { } },
                    {
                      label: t('backup.restart_app'),
                      onPress: restartApp,
                      style: { fontWeight: 'bold' }
                    }
                  ]
                );
              } catch (error) {
                logger.error('[BackupScreen] Failed to restore backup:', error);
                openAlert(
                  t('backup.alert_restore_failed_title'),
                  `Failed to restore backup: ${error instanceof Error ? error.message : String(error)}`,
                  [{ label: t('common.ok'), onPress: () => { } }]
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
        [{ label: t('common.ok'), onPress: () => { } }]
      );
    }
  }, [openAlert, t]);

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
          <Text style={[styles.backText, { color: currentTheme.colors.primary }]}>{t('settings.settings_title')}</Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {/* Empty for now, but keeping structure consistent */}
        </View>
      </View>

      <Text style={[styles.headerTitle, { color: currentTheme.colors.white }]}>
        {t('backup.title')}
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
              {t('backup.options_title')}
            </Text>
            <Text style={[styles.sectionDescription, { color: currentTheme.colors.mediumEmphasis }]}>
              {t('backup.options_desc')}
            </Text>

            {/* Core Data Group */}
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('coreData')}
              activeOpacity={0.7}
            >
              <Text style={[styles.groupLabel, { color: currentTheme.colors.highEmphasis }]}>
                {t('backup.section_core')}
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
                label={t('backup.library_label')}
                description={t('backup.library_desc')}
                value={preferences.includeLibrary}
                onValueChange={(v) => updatePreference('includeLibrary', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label={t('backup.watch_progress_label')}
                description={t('backup.watch_progress_desc')}
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
                {t('backup.section_addons')}
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
                label={t('backup.addons_label')}
                description={t('backup.addons_desc')}
                value={preferences.includeAddons}
                onValueChange={(v) => updatePreference('includeAddons', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label={t('backup.plugins_label')}
                description={t('backup.plugins_desc')}
                value={preferences.includeLocalScrapers}
                onValueChange={(v) => updatePreference('includeLocalScrapers', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label={t('backup.trakt_label')}
                description={t('backup.trakt_desc')}
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
                {t('backup.section_settings')}
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
                label={t('backup.app_settings_label')}
                description={t('backup.app_settings_desc')}
                value={preferences.includeSettings}
                onValueChange={(v) => updatePreference('includeSettings', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label={t('backup.user_prefs_label')}
                description={t('backup.user_prefs_desc')}
                value={preferences.includeUserPreferences}
                onValueChange={(v) => updatePreference('includeUserPreferences', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label={t('backup.catalog_settings_label')}
                description={t('backup.catalog_settings_desc')}
                value={preferences.includeCatalogSettings}
                onValueChange={(v) => updatePreference('includeCatalogSettings', v)}
                theme={currentTheme}
              />
              <OptionToggle
                label={t('backup.api_keys_label')}
                description={t('backup.api_keys_desc')}
                value={preferences.includeApiKeys}
                onValueChange={(v) => updatePreference('includeApiKeys', v)}
                theme={currentTheme}
              />
            </Animated.View>
          </View>

          {/* Backup Actions */}
          <View style={[styles.section, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
              {t('backup.title')}
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
                  <Text style={styles.actionButtonText}>{t('backup.action_create')}</Text>
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
              <Text style={styles.actionButtonText}>{t('backup.action_restore')}</Text>
            </TouchableOpacity>
          </View>

          {/* Info Section */}
          <View style={[styles.section, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
              {t('backup.section_info')}
            </Text>
            <Text style={[styles.infoText, { color: currentTheme.colors.mediumEmphasis }]}>
              {t('backup.info_text')}
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
