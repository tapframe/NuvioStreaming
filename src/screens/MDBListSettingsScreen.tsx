import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
  Linking,
  ScrollView,
  Keyboard,
  Clipboard,
  Switch,
  useColorScheme,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect, NavigationProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Feather from 'react-native-vector-icons/Feather'; // Added Feather icon import
import { mmkvStorage } from '../services/mmkvStorage';
import { useTheme } from '../contexts/ThemeContext';
import { logger } from '../utils/logger';
import { RATING_PROVIDERS } from '../components/metadata/RatingsSection';
import CustomAlert from '../components/CustomAlert'; // Moved CustomAlert import here

export const MDBLIST_API_KEY_STORAGE_KEY = 'mdblist_api_key';
export const RATING_PROVIDERS_STORAGE_KEY = 'rating_providers_config';
export const MDBLIST_ENABLED_STORAGE_KEY = 'mdblist_enabled';
const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Function to check if MDBList is enabled
export const isMDBListEnabled = async (): Promise<boolean> => {
  try {
    const enabledSetting = await mmkvStorage.getItem(MDBLIST_ENABLED_STORAGE_KEY);
    return enabledSetting === 'true';
  } catch (error) {
    logger.error('[MDBList] Error checking if MDBList is enabled:', error);
    return false; // Default to disabled if there's an error
  }
};

// Function to get MDBList API key if enabled
export const getMDBListAPIKey = async (): Promise<string | null> => {
  try {
    const isEnabled = await isMDBListEnabled();
    if (!isEnabled) {
      logger.log('[MDBList] MDBList is disabled, not retrieving API key');
      return null;
    }

    return await mmkvStorage.getItem(MDBLIST_API_KEY_STORAGE_KEY);
  } catch (error) {
    logger.error('[MDBList] Error retrieving API key:', error);
    return null;
  }
};

// Create a styles creator function that accepts the theme colors
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 8 : 8,
    paddingBottom: 10,
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
    marginLeft: 0,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.white,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 10,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.darkBackground,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: colors.mediumGray,
  },
  card: {
    backgroundColor: colors.elevation2,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: colors.elevation1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoCard: {
    backgroundColor: colors.elevation1,
    borderRadius: 10,
    padding: 12,
  },
  statusIcon: {
    marginRight: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 2,
  },
  statusSubtitle: {
    fontSize: 13,
    color: colors.mediumGray,
    lineHeight: 18,
  },
  statusDescription: {
    fontSize: 13,
    color: colors.mediumGray,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.lightGray,
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.mediumGray,
    marginBottom: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevation2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    color: colors.white,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  pasteButton: {
    padding: 8,
    marginRight: 2,
  },
  testResultContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 10,
    borderWidth: 1,
  },
  testResultSuccess: {
    backgroundColor: colors.success + '15',
    borderColor: colors.success + '40',
  },
  testResultError: {
    backgroundColor: colors.error + '15',
    borderColor: colors.error + '40',
  },
  testResultText: {
    marginLeft: 8,
    fontSize: 13,
    flex: 1,
  },
  buttonContainer: {
    marginTop: 12,
    gap: 10,
  },
  buttonIcon: {
    marginRight: 6,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.elevation2,
    opacity: 0.8,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error + '40',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  clearButtonDisabled: {
    borderColor: colors.border,
  },
  clearButtonText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '600',
  },
  clearButtonTextDisabled: {
    color: colors.darkGray,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    marginLeft: 8,
  },
  infoSteps: {
    marginBottom: 12,
    gap: 6,
  },
  stepsContainer: {
    marginBottom: 15,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepNumberText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: colors.mediumGray,
    lineHeight: 18,
  },
  linkText: {
    fontWeight: '600',
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoStepNumber: {
    fontSize: 13,
    color: colors.mediumGray,
    width: 20,
  },
  infoStepText: {
    color: colors.mediumGray,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '600',
    color: colors.lightGray,
  },
  websiteButton: {
    backgroundColor: colors.primary + '20',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  websiteButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  websiteButtonDisabled: {
    backgroundColor: colors.elevation1,
  },
  websiteButtonTextDisabled: {
    color: colors.darkGray,
  },
  sectionDescription: {
    fontSize: 13,
    color: colors.mediumGray,
    marginBottom: 12,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 15,
    color: colors.white,
    fontWeight: '500',
  },
  masterToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  masterToggleInfo: {
    flex: 1,
  },
  masterToggleTitle: {
    fontSize: 15,
    color: colors.white,
    fontWeight: '600',
  },
  masterToggleDescription: {
    fontSize: 13,
    color: colors.mediumGray,
    marginTop: 2,
  },
  disabledCard: {
    opacity: 0.7,
  },
  disabledInput: {
    borderColor: colors.border,
    backgroundColor: colors.elevation1,
  },
  disabledText: {
    color: colors.darkGray,
  },
  disabledBoldText: {
    color: colors.darkGray,
  },
  darkGray: {
    color: colors.darkGray || '#555555',
  },
});

interface RootStackParamList {
  Settings: undefined;
  // Add other routes if necessary
}

const MDBListSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const isDarkMode = useColorScheme() === 'dark';
  const colors = currentTheme.colors;
  const styles = createStyles(colors);

  // Custom alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertActions, setAlertActions] = useState<any[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isKeySet, setIsKeySet] = useState(false);
  const [isMdbListEnabled, setIsMdbListEnabled] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [enabledProviders, setEnabledProviders] = useState<Record<string, boolean>>({});
  const apiKeyInputRef = useRef<TextInput>(null);

  useEffect(() => {
    logger.log('[MDBListSettingsScreen] Component mounted');
    loadApiKey();
    loadProviderSettings();
    loadMdbListEnabledSetting();
    return () => {
      logger.log('[MDBListSettingsScreen] Component unmounted');
    };
  }, []);

  const loadMdbListEnabledSetting = async () => {
    logger.log('[MDBListSettingsScreen] Loading MDBList enabled setting');
    try {
      const savedSetting = await mmkvStorage.getItem(MDBLIST_ENABLED_STORAGE_KEY);
      if (savedSetting !== null) {
        setIsMdbListEnabled(savedSetting === 'true');
        logger.log('[MDBListSettingsScreen] MDBList enabled setting:', savedSetting === 'true');
      } else {
        // Default to disabled if no setting found
        setIsMdbListEnabled(false);
        await mmkvStorage.setItem(MDBLIST_ENABLED_STORAGE_KEY, 'false');
        logger.log('[MDBListSettingsScreen] MDBList enabled setting not found, defaulting to false');
      }
    } catch (error) {
      logger.error('[MDBListSettingsScreen] Failed to load MDBList enabled setting:', error);
      setIsMdbListEnabled(false);
    }
  };

  const toggleMdbListEnabled = async () => {
    logger.log('[MDBListSettingsScreen] Toggling MDBList enabled setting');
    try {
      const newValue = !isMdbListEnabled;
      setIsMdbListEnabled(newValue);
      await mmkvStorage.setItem(MDBLIST_ENABLED_STORAGE_KEY, newValue.toString());
      logger.log('[MDBListSettingsScreen] MDBList enabled set to:', newValue);
    } catch (error) {
      logger.error('[MDBListSettingsScreen] Failed to save MDBList enabled setting:', error);
    }
  };

  const loadApiKey = async () => {
    logger.log('[MDBListSettingsScreen] Loading API key from storage');
    try {
      const savedKey = await mmkvStorage.getItem(MDBLIST_API_KEY_STORAGE_KEY);
      logger.log('[MDBListSettingsScreen] API key status:', savedKey ? 'Found' : 'Not found');
      if (savedKey) {
        setApiKey(savedKey);
        setIsKeySet(true);
      } else {
        setIsKeySet(false);
      }
    } catch (error) {
      logger.error('[MDBListSettingsScreen] Failed to load API key:', error);
      setIsKeySet(false);
    } finally {
      setIsLoading(false);
      logger.log('[MDBListSettingsScreen] Finished loading API key');
    }
  };

  const loadProviderSettings = async () => {
    try {
      const savedSettings = await mmkvStorage.getItem(RATING_PROVIDERS_STORAGE_KEY);
      if (savedSettings) {
        setEnabledProviders(JSON.parse(savedSettings));
      } else {
        // Default all providers to enabled
        const defaultSettings = Object.keys(RATING_PROVIDERS).reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setEnabledProviders(defaultSettings);
        await mmkvStorage.setItem(RATING_PROVIDERS_STORAGE_KEY, JSON.stringify(defaultSettings));
      }
    } catch (error) {
      logger.error('[MDBListSettingsScreen] Failed to load provider settings:', error);
    }
  };

  const toggleProvider = async (providerId: string) => {
    try {
      const newSettings = {
        ...enabledProviders,
        [providerId]: !enabledProviders[providerId]
      };
      setEnabledProviders(newSettings);
      await mmkvStorage.setItem(RATING_PROVIDERS_STORAGE_KEY, JSON.stringify(newSettings));
    } catch (error) {
      logger.error('[MDBListSettingsScreen] Failed to save provider settings:', error);
    }
  };

  const saveApiKey = async () => {
    logger.log('[MDBListSettingsScreen] Starting API key save');
    Keyboard.dismiss();

    try {
      const trimmedKey = apiKey.trim();
      if (!trimmedKey) {
        logger.warn('[MDBListSettingsScreen] Empty API key provided');
        setAlertTitle(t('common.error'));
        setAlertMessage(t('mdblist.api_key_empty_error'));
        setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
        setAlertVisible(true);
        return;
      }

      logger.log('[MDBListSettingsScreen] Saving API key');
      await mmkvStorage.setItem(MDBLIST_API_KEY_STORAGE_KEY, trimmedKey);
      setIsKeySet(true);
      setAlertTitle(t('common.success'));
      setAlertMessage(t('mdblist.success_saved'));
      setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
      setAlertVisible(true);
      logger.log('[MDBListSettingsScreen] API key saved successfully');

    } catch (error) {
      logger.error('[MDBListSettingsScreen] Error saving API key:', error);
      setAlertTitle(t('common.error'));
      setAlertMessage(t('mdblist.error_save'));
      setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
      setAlertVisible(true);
    }
  };

  const handleClear = async () => {
    logger.log('[MDBListSettingsScreen] Clear API key requested');
    setAlertTitle(t('mdblist.alert_clear_title'));
    setAlertMessage(t('mdblist.alert_clear_msg'));
    setAlertActions([
      {
        label: t('common.cancel'),
        onPress: () => setAlertVisible(false),
        style: { color: currentTheme.colors.mediumGray }
      },
      {
        label: t('mdblist.clear'),
        onPress: async () => {
          logger.log('[MDBListSettingsScreen] Proceeding with API key clear');
          try {
            await mmkvStorage.removeItem(MDBLIST_API_KEY_STORAGE_KEY);
            setApiKey('');
            setIsKeySet(false);
            setTestResult(null);
            setAlertTitle(t('common.success'));
            setAlertMessage(t('mdblist.success_cleared'));
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
            logger.log('[MDBListSettingsScreen] API key cleared successfully');
          } catch (error) {
            logger.error('[MDBListSettingsScreen] Failed to clear API key:', error);
            setAlertTitle(t('common.error'));
            setAlertMessage(t('mdblist.error_clear'));
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
          }
        },
        style: { color: colors.error }
      },
    ]);
    setAlertVisible(true);
  };

  const pasteFromClipboard = async () => {
    logger.log('[MDBListSettingsScreen] Attempting to paste from clipboard');
    try {
      const clipboardContent = await Clipboard.getString();
      if (clipboardContent) {
        logger.log('[MDBListSettingsScreen] Content pasted from clipboard');
        setApiKey(clipboardContent);
        setTestResult(null);
      } else {
        logger.warn('[MDBListSettingsScreen] No content in clipboard');
      }
    } catch (error) {
      logger.error('[MDBListSettingsScreen] Error pasting from clipboard:', error);
    }
  };

  const openMDBListWebsite = () => {
    logger.log('[MDBListSettingsScreen] Opening MDBList website');
    Linking.openURL('https://mdblist.com/preferences').catch(error => {
      logger.error('[MDBListSettingsScreen] Error opening website:', error);
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('common.loading_settings')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={currentTheme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: currentTheme.colors.text }]}>
          {t('mdblist.title')}
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.statusCard}>
          <MaterialIcons
            name={isKeySet && isMdbListEnabled ? "check-circle" : "error-outline"}
            size={28}
            color={isKeySet && isMdbListEnabled ? colors.success : colors.warning}
            style={styles.statusIcon}
          />
          <View style={styles.statusContent}>
            <Text style={[styles.statusTitle, { color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }]}>
              {!isMdbListEnabled
                ? t('mdblist.status_disabled')
                : (isKeySet ? t('mdblist.status_active') : t('mdblist.status_required'))}
            </Text>
            <Text style={[styles.statusSubtitle, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
              {!isMdbListEnabled
                ? t('mdblist.status_disabled_desc')
                : (isKeySet ? t('mdblist.status_active_desc') : t('mdblist.status_required_desc'))}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.masterToggleContainer}>
            <View style={styles.masterToggleInfo}>
              <Text style={styles.masterToggleTitle}>{t('mdblist.enable_toggle')}</Text>
              <Text style={styles.masterToggleDescription}>{t('mdblist.enable_toggle_desc')}</Text>
            </View>
            <Switch
              value={isMdbListEnabled}
              onValueChange={toggleMdbListEnabled}
              trackColor={{ false: colors.elevation1, true: colors.primary + '50' }}
              thumbColor={isMdbListEnabled ? colors.primary : colors.mediumGray}
            />
          </View>
        </View>

        <View style={[styles.card, !isMdbListEnabled && styles.disabledCard]}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
            {t('mdblist.api_section')}
          </Text>

          <View style={[styles.inputContainer, {
            backgroundColor: isDarkMode ? currentTheme.colors.elevation2 : '#F5F5F5',
            borderColor: isDarkMode ? 'transparent' : '#E0E0E0'
          }]}>
            <MaterialIcons name="vpn-key" size={20} color={currentTheme.colors.mediumEmphasis} style={styles.inputIcon} />
            <TextInput
              ref={apiKeyInputRef}
              style={[
                styles.input,
                isInputFocused && styles.inputFocused,
                !isMdbListEnabled && styles.disabledText,
                { color: currentTheme.colors.text }
              ]}
              value={apiKey}
              onChangeText={(text) => {
                setApiKey(text);
                if (testResult) setTestResult(null);
              }}
              placeholder={t('mdblist.placeholder')}
              placeholderTextColor={!isMdbListEnabled ? colors.darkGray : colors.mediumGray}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              editable={isMdbListEnabled}
              secureTextEntry
            />
            <TouchableOpacity
              style={styles.pasteButton}
              onPress={pasteFromClipboard}
              disabled={!isMdbListEnabled}
            >
              <MaterialIcons
                name="content-paste"
                size={20}
                color={!isMdbListEnabled ? colors.darkGray : colors.primary}
              />
            </TouchableOpacity>
          </View>

          {testResult && (
            <View style={[
              styles.testResultContainer,
              testResult.success ? styles.testResultSuccess : styles.testResultError
            ]}>
              <MaterialIcons
                name={testResult.success ? "check" : "warning"}
                size={18}
                color={testResult.success ? colors.success : colors.error}
              />
              <Text style={styles.testResultText}>
                {testResult.message}
              </Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!apiKey.trim() || !isMdbListEnabled) && styles.saveButtonDisabled
              ]}
              onPress={saveApiKey}
              disabled={!apiKey.trim() || !isMdbListEnabled}
            >
              <MaterialIcons name="save" size={18} color={colors.white} style={styles.buttonIcon} />
              <Text style={styles.saveButtonText}>{t('mdblist.save')}</Text>
            </TouchableOpacity>

            {isKeySet && (
              <TouchableOpacity
                style={[styles.clearButton, !isMdbListEnabled && styles.clearButtonDisabled]}
                onPress={handleClear}
                disabled={!isMdbListEnabled}
              >
                <MaterialIcons
                  name="delete-outline"
                  size={18}
                  color={!isMdbListEnabled ? colors.darkGray : colors.error}
                  style={styles.buttonIcon}
                />
                <Text style={[
                  styles.clearButtonText,
                  !isMdbListEnabled && styles.clearButtonTextDisabled
                ]}>
                  {t('mdblist.clear')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[styles.card, !isMdbListEnabled && styles.disabledCard]}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
            {t('mdblist.rating_providers')}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
            {t('mdblist.rating_providers_desc')}
          </Text>
          {Object.entries(RATING_PROVIDERS).map(([id, provider]) => (
            <View key={id} style={styles.providerItem}>
              <View style={styles.providerInfo}>
                <Text style={[
                  styles.providerName,
                  !isMdbListEnabled && styles.disabledText
                ]}>
                  {provider.name}
                </Text>
              </View>
              <Switch
                value={enabledProviders[id] ?? true}
                onValueChange={() => toggleProvider(id)}
                trackColor={{ false: colors.elevation1, true: colors.primary + '50' }}
                thumbColor={enabledProviders[id] ? colors.primary : colors.mediumGray}
                disabled={!isMdbListEnabled}
              />
            </View>
          ))}
        </View>

        <View style={[styles.infoCard, !isMdbListEnabled && styles.disabledCard]}>
          <View style={styles.infoHeader}>
            <Feather name="info" size={20} color={currentTheme.colors.primary} />
            <Text style={[styles.infoTitle, { color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }]}>
              {t('mdblist.how_to')}
            </Text>
          </View>

          <View style={styles.stepsContainer}>
            <View style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: currentTheme.colors.primary }]}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <Text style={[styles.stepText, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
                {t('mdblist.step_1')} <Text style={[styles.linkText, { color: currentTheme.colors.primary }]} onPress={openMDBListWebsite}>{t('mdblist.step_1_link')}</Text>.
              </Text>
            </View>

            <View style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: currentTheme.colors.primary }]}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <Text style={[styles.stepText, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
                {t('mdblist.step_2')} <Text style={{ fontWeight: 'bold', color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }}>{t('mdblist.step_2_settings')}</Text> {'>'} <Text style={{ fontWeight: 'bold', color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }}>{t('mdblist.step_2_api')}</Text> {t('mdblist.step_2_end')}
              </Text>
            </View>

            <View style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: currentTheme.colors.primary }]}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={[styles.stepText, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
                {t('mdblist.step_3')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.websiteButton,
              !isMdbListEnabled && styles.websiteButtonDisabled
            ]}
            onPress={openMDBListWebsite}
            disabled={!isMdbListEnabled}
          >
            <MaterialIcons
              name="open-in-new"
              size={18}
              color={!isMdbListEnabled ? currentTheme.colors.mediumEmphasis : currentTheme.colors.primary}
              style={styles.buttonIcon}
            />
            <Text style={[
              styles.websiteButtonText,
              !isMdbListEnabled && styles.websiteButtonTextDisabled
            ]}>
              {t('mdblist.go_to_website')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
        actions={alertActions}
      />
    </SafeAreaView>
  );
};

export default MDBListSettingsScreen; 