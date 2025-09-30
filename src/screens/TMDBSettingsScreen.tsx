import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tmdbService } from '../services/tmdbService';
import { useSettings } from '../hooks/useSettings';
import { logger } from '../utils/logger';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomAlert from '../components/CustomAlert';
// (duplicate import removed)

const TMDB_API_KEY_STORAGE_KEY = 'tmdb_api_key';
const USE_CUSTOM_TMDB_API_KEY = 'use_custom_tmdb_api_key';

const TMDBSettingsScreen = () => {
  const navigation = useNavigation();
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isKeySet, setIsKeySet] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertActions, setAlertActions] = useState<Array<{ label: string; onPress: () => void; style?: object }>>([
    { label: 'OK', onPress: () => setAlertVisible(false) },
  ]);
  const apiKeyInputRef = useRef<TextInput>(null);
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, updateSetting } = useSettings();
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [languageSearch, setLanguageSearch] = useState('');

  const openAlert = (
    title: string,
    message: string,
    actions?: Array<{ label: string; onPress?: () => void; style?: object }>
  ) => {
    setAlertTitle(title);
    setAlertMessage(message);
    if (actions && actions.length > 0) {
      setAlertActions(
        actions.map(a => ({
          label: a.label,
          style: a.style,
          onPress: () => { a.onPress?.(); },
        }))
      );
    } else {
      setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
    }
    setAlertVisible(true);
  };

  useEffect(() => {
    logger.log('[TMDBSettingsScreen] Component mounted');
    loadSettings();
    return () => {
      logger.log('[TMDBSettingsScreen] Component unmounted');
    };
  }, []);

  const loadSettings = async () => {
    logger.log('[TMDBSettingsScreen] Loading settings from storage');
    try {
      const [savedKey, savedUseCustomKey] = await Promise.all([
        AsyncStorage.getItem(TMDB_API_KEY_STORAGE_KEY),
        AsyncStorage.getItem(USE_CUSTOM_TMDB_API_KEY)
      ]);
      
      logger.log('[TMDBSettingsScreen] API key status:', savedKey ? 'Found' : 'Not found');
      logger.log('[TMDBSettingsScreen] Use custom API setting:', savedUseCustomKey);
      
      if (savedKey) {
        setApiKey(savedKey);
        setIsKeySet(true);
      } else {
        setIsKeySet(false);
      }
      
      setUseCustomKey(savedUseCustomKey === 'true');
    } catch (error) {
      logger.error('[TMDBSettingsScreen] Failed to load settings:', error);
      setIsKeySet(false);
      setUseCustomKey(false);
    } finally {
      setIsLoading(false);
      logger.log('[TMDBSettingsScreen] Finished loading settings');
    }
  };

  const saveApiKey = async () => {
    logger.log('[TMDBSettingsScreen] Starting API key save');
    Keyboard.dismiss();
    
    try {
      const trimmedKey = apiKey.trim();
      if (!trimmedKey) {
        logger.warn('[TMDBSettingsScreen] Empty API key provided');
        setTestResult({ success: false, message: 'API Key cannot be empty.' });
        return;
      }

      // Test the API key to make sure it works
      if (await testApiKey(trimmedKey)) {
        logger.log('[TMDBSettingsScreen] API key test successful, saving key');
        await AsyncStorage.setItem(TMDB_API_KEY_STORAGE_KEY, trimmedKey);
        await AsyncStorage.setItem(USE_CUSTOM_TMDB_API_KEY, 'true');
        setIsKeySet(true);
        setUseCustomKey(true);
        setTestResult({ success: true, message: 'API key verified and saved successfully.' });
        logger.log('[TMDBSettingsScreen] API key saved successfully');
      } else {
        logger.warn('[TMDBSettingsScreen] API key test failed');
        setTestResult({ success: false, message: 'Invalid API key. Please check and try again.' });
      }
    } catch (error) {
      logger.error('[TMDBSettingsScreen] Error saving API key:', error);
      setTestResult({
        success: false,
        message: 'An error occurred while saving. Please try again.'
      });
    }
  };

  const testApiKey = async (key: string): Promise<boolean> => {
    try {
      // Simple API call to test the key using the API key parameter method
      const response = await fetch(
        `https://api.themoviedb.org/3/configuration?api_key=${key}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      return response.ok;
    } catch (error) {
      logger.error('[TMDBSettingsScreen] API key test error:', error);
      return false;
    }
  };

  const clearApiKey = async () => {
    logger.log('[TMDBSettingsScreen] Clear API key requested');
    openAlert(
      'Clear API Key',
      'Are you sure you want to remove your custom API key and revert to the default?',
      [
        {
          label: 'Cancel',
          onPress: () => logger.log('[TMDBSettingsScreen] Clear API key cancelled'),
        },
        {
          label: 'Clear',
          onPress: async () => {
            logger.log('[TMDBSettingsScreen] Proceeding with API key clear');
            try {
              await AsyncStorage.removeItem(TMDB_API_KEY_STORAGE_KEY);
              await AsyncStorage.setItem(USE_CUSTOM_TMDB_API_KEY, 'false');
              setApiKey('');
              setIsKeySet(false);
              setUseCustomKey(false);
              setTestResult(null);
              logger.log('[TMDBSettingsScreen] API key cleared successfully');
            } catch (error) {
              logger.error('[TMDBSettingsScreen] Failed to clear API key:', error);
              openAlert('Error', 'Failed to clear API key');
            }
          },
        },
      ]
    );
  };

  const toggleUseCustomKey = async (value: boolean) => {
    logger.log('[TMDBSettingsScreen] Toggle use custom key:', value);
    try {
      await AsyncStorage.setItem(USE_CUSTOM_TMDB_API_KEY, value ? 'true' : 'false');
      setUseCustomKey(value);
      
      if (!value) {
        // If switching to built-in key, show confirmation
        logger.log('[TMDBSettingsScreen] Switching to built-in API key');
        setTestResult({ 
          success: true, 
          message: 'Now using the built-in TMDb API key.' 
        });
      } else if (apiKey && isKeySet) {
        // If switching to custom key and we have a key
        logger.log('[TMDBSettingsScreen] Switching to custom API key');
        setTestResult({ 
          success: true, 
          message: 'Now using your custom TMDb API key.' 
        });
      } else {
        // If switching to custom key but don't have a key yet
        logger.log('[TMDBSettingsScreen] No custom key available yet');
        setTestResult({ 
          success: false, 
          message: 'Please enter and save your custom TMDb API key.' 
        });
      }
    } catch (error) {
      logger.error('[TMDBSettingsScreen] Failed to toggle custom key setting:', error);
    }
  };

  const pasteFromClipboard = async () => {
    logger.log('[TMDBSettingsScreen] Attempting to paste from clipboard');
    try {
      const clipboardContent = await Clipboard.getString();
      if (clipboardContent) {
        logger.log('[TMDBSettingsScreen] Content pasted from clipboard');
        setApiKey(clipboardContent);
        setTestResult(null);
      } else {
        logger.warn('[TMDBSettingsScreen] No content in clipboard');
      }
    } catch (error) {
      logger.error('[TMDBSettingsScreen] Error pasting from clipboard:', error);
    }
  };

  const openTMDBWebsite = () => {
    logger.log('[TMDBSettingsScreen] Opening TMDb website');
    Linking.openURL('https://www.themoviedb.org/settings/api').catch(error => {
      logger.error('[TMDBSettingsScreen] Error opening website:', error);
    });
  };

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const headerHeight = headerBaseHeight + topSpacing;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
          <Text style={[styles.loadingText, { color: currentTheme.colors.text }]}>Loading Settings...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}> 
      <StatusBar barStyle="light-content" />
      <View style={[styles.headerContainer, { paddingTop: topSpacing }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="chevron-left" size={28} color={currentTheme.colors.primary} /> 
            <Text style={[styles.backText, { color: currentTheme.colors.primary }]}>Settings</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
          TMDb Settings
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Metadata Enrichment Section */}
        <View style={[styles.sectionCard, { backgroundColor: currentTheme.colors.elevation2 }]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="movie" size={20} color={currentTheme.colors.primary} />
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>Metadata Enrichment</Text>
          </View>
          <Text style={[styles.sectionDescription, { color: currentTheme.colors.mediumEmphasis }]}>
            Enhance your content metadata with TMDb data for better details and information.
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: currentTheme.colors.text }]}>Enable Enrichment</Text>
              <Text style={[styles.settingDescription, { color: currentTheme.colors.mediumEmphasis }]}>
                Augments addon metadata with TMDb for cast, certification, logos/posters, and episode fallback.
              </Text>
            </View>
            <Switch
              value={settings.enrichMetadataWithTMDB}
              onValueChange={(v) => updateSetting('enrichMetadataWithTMDB', v)}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: currentTheme.colors.primary }}
              thumbColor={Platform.OS === 'android' ? (settings.enrichMetadataWithTMDB ? currentTheme.colors.white : currentTheme.colors.white) : ''}
              ios_backgroundColor={'rgba(255,255,255,0.1)'}
            />
          </View>

          {settings.enrichMetadataWithTMDB && (
            <>
              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingTitle, { color: currentTheme.colors.text }]}>Localized Text</Text>
                  <Text style={[styles.settingDescription, { color: currentTheme.colors.mediumEmphasis }]}>
                    Fetch titles and descriptions in your preferred language from TMDb.
                  </Text>
                </View>
                <Switch
                  value={settings.useTmdbLocalizedMetadata}
                  onValueChange={(v) => updateSetting('useTmdbLocalizedMetadata', v)}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: currentTheme.colors.primary }}
                  thumbColor={Platform.OS === 'android' ? (settings.useTmdbLocalizedMetadata ? currentTheme.colors.white : currentTheme.colors.white) : ''}
                  ios_backgroundColor={'rgba(255,255,255,0.1)'}
                />
              </View>

              {settings.useTmdbLocalizedMetadata && (
                <>
                  <View style={styles.divider} />

                  <View style={styles.settingRow}>
                    <View style={styles.settingTextContainer}>
                      <Text style={[styles.settingTitle, { color: currentTheme.colors.text }]}>Language</Text>
                      <Text style={[styles.settingDescription, { color: currentTheme.colors.mediumEmphasis }]}>
                        Current: {(settings.tmdbLanguagePreference || 'en').toUpperCase()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setLanguagePickerVisible(true)}
                      style={[styles.languageButton, { backgroundColor: currentTheme.colors.primary }]}
                    >
                      <Text style={[styles.languageButtonText, { color: currentTheme.colors.white }]}>Change</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* API Configuration Section */}
        <View style={[styles.sectionCard, { backgroundColor: currentTheme.colors.elevation2 }]}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="api" size={20} color={currentTheme.colors.primary} />
            <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>API Configuration</Text>
          </View>
          <Text style={[styles.sectionDescription, { color: currentTheme.colors.mediumEmphasis }]}>
            Configure your TMDb API access for enhanced functionality.
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, { color: currentTheme.colors.text }]}>Custom API Key</Text>
              <Text style={[styles.settingDescription, { color: currentTheme.colors.mediumEmphasis }]}>
                Use your own TMDb API key for better performance and dedicated rate limits.
              </Text>
            </View>
            <Switch
              value={useCustomKey}
              onValueChange={toggleUseCustomKey}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: currentTheme.colors.primary }}
              thumbColor={Platform.OS === 'android' ? (useCustomKey ? currentTheme.colors.white : currentTheme.colors.white) : ''}
              ios_backgroundColor={'rgba(255,255,255,0.1)'}
            />
          </View>

          {useCustomKey && (
            <>
              <View style={styles.divider} />

              {/* API Key Status */}
              <View style={styles.statusRow}>
                <MaterialIcons
                  name={isKeySet ? "check-circle" : "error-outline"}
                  size={20}
                  color={isKeySet ? currentTheme.colors.success : currentTheme.colors.warning}
                />
                <Text style={[styles.statusText, {
                  color: isKeySet ? currentTheme.colors.success : currentTheme.colors.warning
                }]}>
                  {isKeySet ? "Custom API key active" : "API key required"}
                </Text>
              </View>

              {/* API Key Input */}
              <View style={styles.apiKeyContainer}>
                <View style={styles.inputContainer}>
                  <TextInput
                    ref={apiKeyInputRef}
                    style={[
                      styles.input,
                      {
                        backgroundColor: currentTheme.colors.elevation1,
                        color: currentTheme.colors.text,
                        borderColor: isInputFocused ? currentTheme.colors.primary : 'transparent'
                      }
                    ]}
                    value={apiKey}
                    onChangeText={(text) => {
                      setApiKey(text);
                      if (testResult) setTestResult(null);
                    }}
                    placeholder="Paste your TMDb API key (v3)"
                    placeholderTextColor={currentTheme.colors.mediumEmphasis}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                  />
                  <TouchableOpacity
                    style={styles.pasteButton}
                    onPress={pasteFromClipboard}
                  >
                    <MaterialIcons name="content-paste" size={20} color={currentTheme.colors.primary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: currentTheme.colors.primary }]}
                    onPress={saveApiKey}
                  >
                    <Text style={[styles.buttonText, { color: currentTheme.colors.white }]}>Save</Text>
                  </TouchableOpacity>

                  {isKeySet && (
                    <TouchableOpacity
                      style={[styles.button, styles.clearButton, { borderColor: currentTheme.colors.error }]}
                      onPress={clearApiKey}
                    >
                      <Text style={[styles.buttonText, { color: currentTheme.colors.error }]}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {testResult && (
                  <View style={[
                    styles.resultMessage,
                    { backgroundColor: testResult.success ? currentTheme.colors.success + '1A' : currentTheme.colors.error + '1A' }
                  ]}>
                    <MaterialIcons
                      name={testResult.success ? "check-circle" : "error"}
                      size={16}
                      color={testResult.success ? currentTheme.colors.success : currentTheme.colors.error}
                      style={styles.resultIcon}
                    />
                    <Text style={[
                      styles.resultText,
                      { color: testResult.success ? currentTheme.colors.success : currentTheme.colors.error }
                    ]}>
                      {testResult.message}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.helpLink}
                  onPress={openTMDBWebsite}
                >
                  <MaterialIcons name="help" size={16} color={currentTheme.colors.primary} style={styles.helpIcon} />
                  <Text style={[styles.helpText, { color: currentTheme.colors.primary }]}>
                    How to get a TMDb API key?
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {!useCustomKey && (
            <View style={styles.infoContainer}>
              <MaterialIcons name="info-outline" size={18} color={currentTheme.colors.primary} />
              <Text style={[styles.infoText, { color: currentTheme.colors.mediumEmphasis }]}>
                Currently using built-in API key. Consider using your own key for better performance.
              </Text>
            </View>
          )}
        </View>

        {/* Language Picker Modal */}
        <Modal
          visible={languagePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLanguagePickerVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: currentTheme.colors.darkBackground, borderTopLeftRadius: 16, borderTopRightRadius: 16, width: '100%', maxHeight: '80%', padding: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: currentTheme.colors.elevation3, alignSelf: 'center', marginBottom: 10 }} />
              <Text style={{ color: currentTheme.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Select Language</Text>
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                <View style={{ flex: 1, borderRadius: 10, backgroundColor: currentTheme.colors.elevation1, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 0 }}>
                  <TextInput
                    placeholder="Search language (e.g. Arabic)"
                    placeholderTextColor={currentTheme.colors.mediumEmphasis}
                    style={{ color: currentTheme.colors.text, paddingVertical: Platform.OS === 'ios' ? 0 : 8 }}
                    value={languageSearch}
                    onChangeText={setLanguageSearch}
                  />
                </View>
                <TouchableOpacity onPress={() => setLanguageSearch('')} style={{ marginLeft: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: currentTheme.colors.elevation1 }}>
                  <Text style={{ color: currentTheme.colors.text }}>Clear</Text>
                </TouchableOpacity>
              </View>
              {/* Most used quick chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ paddingVertical: 2 }}>
                {['en','ar','es','fr','de','tr'].map(code => (
                  <TouchableOpacity key={code} onPress={() => { updateSetting('tmdbLanguagePreference', code); setLanguagePickerVisible(false); }} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: settings.tmdbLanguagePreference === code ? currentTheme.colors.primary : currentTheme.colors.elevation1, borderRadius: 999, marginRight: 8 }}>
                    <Text style={{ color: settings.tmdbLanguagePreference === code ? currentTheme.colors.white : currentTheme.colors.text }}>{code.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView style={{ maxHeight: '70%' }}>
                {[
                  { code: 'en', label: 'English' },
                  { code: 'ar', label: 'Arabic' },
                  { code: 'es', label: 'Spanish' },
                  { code: 'fr', label: 'French' },
                  { code: 'de', label: 'German' },
                  { code: 'it', label: 'Italian' },
                  { code: 'pt', label: 'Portuguese' },
                  { code: 'ru', label: 'Russian' },
                  { code: 'tr', label: 'Turkish' },
                  { code: 'ja', label: 'Japanese' },
                  { code: 'ko', label: 'Korean' },
                  { code: 'zh', label: 'Chinese' },
                  { code: 'hi', label: 'Hindi' },
                  { code: 'he', label: 'Hebrew' },
                  { code: 'id', label: 'Indonesian' },
                  { code: 'nl', label: 'Dutch' },
                  { code: 'sv', label: 'Swedish' },
                  { code: 'no', label: 'Norwegian' },
                  { code: 'da', label: 'Danish' },
                  { code: 'fi', label: 'Finnish' },
                  { code: 'pl', label: 'Polish' },
                  { code: 'cs', label: 'Czech' },
                  { code: 'ro', label: 'Romanian' },
                  { code: 'uk', label: 'Ukrainian' },
                  { code: 'vi', label: 'Vietnamese' },
                  { code: 'th', label: 'Thai' },
                ]
                .filter(({ label, code }) =>
                  (languageSearch || '').length === 0 ||
                  label.toLowerCase().includes(languageSearch.toLowerCase()) || code.toLowerCase().includes(languageSearch.toLowerCase())
                )
                .map(({ code, label }) => (
                  <TouchableOpacity
                    key={code}
                    onPress={() => { updateSetting('tmdbLanguagePreference', code); setLanguagePickerVisible(false); }}
                    style={{ paddingVertical: 12, paddingHorizontal: 6, borderRadius: 10, backgroundColor: settings.tmdbLanguagePreference === code ? currentTheme.colors.elevation1 : 'transparent', marginBottom: 4 }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: currentTheme.colors.text, fontSize: 16 }}>
                        {label} ({code.toUpperCase()})
                      </Text>
                      {settings.tmdbLanguagePreference === code && (
                        <MaterialIcons name="check-circle" size={20} color={currentTheme.colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity onPress={() => setLanguagePickerVisible(false)} style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: currentTheme.colors.primary }}>
                <Text style={{ color: currentTheme.colors.white, fontWeight: '700' }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
        actions={alertActions}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.3,
    paddingLeft: 4,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    borderRadius: 16,
    marginBottom: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  languageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  languageButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  apiKeyContainer: {
    marginTop: 16,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 2,
  },
  pasteButton: {
    position: 'absolute',
    right: 12,
    padding: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    marginRight: 0,
    marginLeft: 8,
    flex: 0,
    paddingHorizontal: 16,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  resultMessage: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultIcon: {
    marginRight: 12,
  },
  resultText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  helpIcon: {
    marginRight: 8,
  },
  helpText: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
    opacity: 0.8,
    marginLeft: 8,
  },
});

export default TMDBSettingsScreen; 