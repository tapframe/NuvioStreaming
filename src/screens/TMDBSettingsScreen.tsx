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
  Alert,
  ActivityIndicator,
  Linking,
  ScrollView,
  Keyboard,
  Clipboard,
  Switch,
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tmdbService } from '../services/tmdbService';
import { useSettings } from '../hooks/useSettings';
import { logger } from '../utils/logger';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const apiKeyInputRef = useRef<TextInput>(null);
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();

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
    Alert.alert(
      'Clear API Key',
      'Are you sure you want to remove your custom API key and revert to the default?',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => logger.log('[TMDBSettingsScreen] Clear API key cancelled')
        },
        {
          text: 'Clear',
          style: 'destructive',
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
              Alert.alert('Error', 'Failed to clear API key');
            }
          }
        }
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
        <View style={[styles.switchCard, { backgroundColor: currentTheme.colors.elevation2 }]}>
          <View style={styles.switchTextContainer}>
            <Text style={[styles.switchTitle, { color: currentTheme.colors.text }]}>Use Custom TMDb API Key</Text>
            <Text style={[styles.switchDescription, { color: currentTheme.colors.mediumEmphasis }]}>
              Enable to use your own TMDb API key instead of the built-in one.
              Using your own API key may provide better performance and higher rate limits.
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
            <View style={[styles.statusCard, { backgroundColor: currentTheme.colors.elevation2 }]}>
              <MaterialIcons 
                name={isKeySet ? "check-circle" : "error-outline"} 
                size={28}
                color={isKeySet ? currentTheme.colors.success : currentTheme.colors.warning} 
                style={styles.statusIconContainer}
              />
              <View style={styles.statusTextContainer}>
                <Text style={[styles.statusTitle, { color: currentTheme.colors.text }]}>
                  {isKeySet ? "API Key Active" : "API Key Required"}
                </Text>
                <Text style={[styles.statusDescription, { color: currentTheme.colors.mediumEmphasis }]}>
                  {isKeySet 
                    ? "Your custom TMDb API key is set and active."
                    : "Add your TMDb API key below."}
                </Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: currentTheme.colors.elevation2 }]}>
              <Text style={[styles.cardTitle, { color: currentTheme.colors.text }]}>API Key</Text>
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
                  <Text style={[styles.buttonText, { color: currentTheme.colors.white }]}>Save API Key</Text>
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
                    size={18} 
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

            <View style={[styles.infoCard, { backgroundColor: currentTheme.colors.elevation1 }]}>
              <MaterialIcons name="info-outline" size={22} color={currentTheme.colors.primary} style={styles.infoIcon} />
              <Text style={[styles.infoText, { color: currentTheme.colors.mediumEmphasis }]}>
                To get your own TMDb API key (v3), you need to create a TMDb account and request an API key from their website.
                Using your own API key gives you dedicated quota and may improve app performance.
              </Text>
            </View>
          </>
        )}

        {!useCustomKey && (
          <View style={[styles.infoCard, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <MaterialIcons name="info-outline" size={22} color={currentTheme.colors.primary} style={styles.infoIcon} />
            <Text style={[styles.infoText, { color: currentTheme.colors.mediumEmphasis }]}>
              Currently using the built-in TMDb API key. This key is shared among all users.
              For better performance and reliability, consider using your own API key.
            </Text>
          </View>
        )}
      </ScrollView>
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
  switchCard: {
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  switchTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  statusCard: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusIconContainer: {
    marginRight: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 14,
    opacity: 0.8,
  },
  card: {
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
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
  infoCard: {
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
    opacity: 0.8,
  },
});

export default TMDBSettingsScreen; 