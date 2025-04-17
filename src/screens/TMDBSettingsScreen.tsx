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
  Alert,
  ActivityIndicator,
  Linking,
  ScrollView,
  Keyboard,
  Clipboard,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../styles/colors';
import { logger } from '../utils/logger';

const TMDB_API_KEY_STORAGE_KEY = 'tmdb_api_key';
const USE_CUSTOM_TMDB_API_KEY = 'use_custom_tmdb_api_key';
const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

const TMDBSettingsScreen = () => {
  const navigation = useNavigation();
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isKeySet, setIsKeySet] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const apiKeyInputRef = useRef<TextInput>(null);

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
      // Simple API call to test the key
      const response = await fetch(
        'https://api.themoviedb.org/3/configuration',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${key}`,
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading Settings...</Text>
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
      <Text style={styles.headerTitle}>TMDb Settings</Text>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.switchCard}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Use Custom TMDb API Key</Text>
            <Switch
              value={useCustomKey}
              onValueChange={toggleUseCustomKey}
              trackColor={{ false: colors.lightGray, true: colors.accentLight }}
              thumbColor={Platform.OS === 'android' ? colors.primary : ''}
              ios_backgroundColor={colors.lightGray}
            />
          </View>
          <Text style={styles.switchDescription}>
            Enable to use your own TMDb API key instead of the built-in one.
            Using your own API key may provide better performance and higher rate limits.
          </Text>
        </View>

        {useCustomKey && (
          <>
            <View style={styles.statusCard}>
              <MaterialIcons 
                name={isKeySet ? "check-circle" : "error-outline"} 
                size={28}
                color={isKeySet ? colors.success : colors.warning} 
                style={styles.statusIcon}
              />
              <View style={styles.statusTextContainer}>
                <Text style={styles.statusTitle}>
                  {isKeySet ? "API Key Active" : "API Key Required"}
                </Text>
                <Text style={styles.statusDescription}>
                  {isKeySet 
                    ? "Your custom TMDb API key is set and active."
                    : "Add your TMDb API key below."}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>API Key</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  ref={apiKeyInputRef}
                  style={[styles.input, isInputFocused && styles.inputFocused]}
                  value={apiKey}
                  onChangeText={(text) => {
                    setApiKey(text);
                    if (testResult) setTestResult(null);
                  }}
                  placeholder="Paste your TMDb API key (v4 auth)"
                  placeholderTextColor={colors.mediumGray}
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
                  <MaterialIcons name="content-paste" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity 
                  style={styles.button}
                  onPress={saveApiKey}
                >
                  <Text style={styles.buttonText}>Save API Key</Text>
                </TouchableOpacity>
                
                {isKeySet && (
                  <TouchableOpacity 
                    style={[styles.button, styles.clearButton]}
                    onPress={clearApiKey}
                  >
                    <Text style={[styles.buttonText, styles.clearButtonText]}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              {testResult && (
                <View style={[
                  styles.resultMessage,
                  testResult.success ? styles.successMessage : styles.errorMessage
                ]}>
                  <MaterialIcons 
                    name={testResult.success ? "check-circle" : "error"} 
                    size={18} 
                    color={testResult.success ? colors.success : colors.error}
                    style={styles.resultIcon}
                  />
                  <Text style={[
                    styles.resultText,
                    testResult.success ? styles.successText : styles.errorText
                  ]}>
                    {testResult.message}
                  </Text>
                </View>
              )}

              <TouchableOpacity 
                style={styles.helpLink}
                onPress={openTMDBWebsite}
              >
                <MaterialIcons name="help" size={16} color={colors.primary} style={styles.helpIcon} />
                <Text style={styles.helpText}>
                  How to get a TMDb API key?
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoCard}>
              <MaterialIcons name="info-outline" size={22} color={colors.primary} style={styles.infoIcon} />
              <Text style={styles.infoText}>
                To get your own TMDb API key (v4 auth token), you need to create a TMDb account and request an API key from their website.
                Using your own API key gives you dedicated quota and may improve app performance.
              </Text>
            </View>
          </>
        )}

        {!useCustomKey && (
          <View style={styles.infoCard}>
            <MaterialIcons name="info-outline" size={22} color={colors.primary} style={styles.infoIcon} />
            <Text style={styles.infoText}>
              Currently using the built-in TMDb API key. This key is shared among all users.
              For better performance and reliability, consider using your own API key.
            </Text>
          </View>
        )}
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 16 : 16,
    paddingBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.white,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  switchCard: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.white,
  },
  switchDescription: {
    fontSize: 14,
    color: colors.mediumEmphasis,
    lineHeight: 20,
  },
  statusCard: {
    flexDirection: 'row',
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusIcon: {
    marginRight: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.white,
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 14,
    color: colors.mediumEmphasis,
  },
  card: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.white,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: colors.elevation1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  pasteButton: {
    position: 'absolute',
    right: 8,
    padding: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.error,
    marginRight: 0,
    marginLeft: 8,
    flex: 0,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '500',
    fontSize: 15,
  },
  clearButtonText: {
    color: colors.error,
  },
  resultMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successMessage: {
    backgroundColor: colors.success + '1A', // 10% opacity
  },
  errorMessage: {
    backgroundColor: colors.error + '1A', // 10% opacity
  },
  resultIcon: {
    marginRight: 8,
  },
  resultText: {
    fontSize: 14,
    flex: 1,
  },
  successText: {
    color: colors.success,
  },
  errorText: {
    color: colors.error,
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  helpIcon: {
    marginRight: 6,
  },
  helpText: {
    color: colors.primary,
    fontSize: 14,
  },
  infoCard: {
    backgroundColor: colors.elevation1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoText: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});

export default TMDBSettingsScreen; 