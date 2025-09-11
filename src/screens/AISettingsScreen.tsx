import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

const AISettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [isKeySet, setIsKeySet] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    try {
      const savedKey = await AsyncStorage.getItem('openrouter_api_key');
      if (savedKey) {
        setApiKey(savedKey);
        setIsKeySet(true);
      }
    } catch (error) {
      if (__DEV__) console.error('Error loading OpenRouter API key:', error);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter a valid API key');
      return;
    }

    if (!apiKey.startsWith('sk-or-')) {
      Alert.alert('Error', 'OpenRouter API keys should start with "sk-or-"');
      return;
    }

    setLoading(true);
    try {
      await AsyncStorage.setItem('openrouter_api_key', apiKey.trim());
      setIsKeySet(true);
      Alert.alert('Success', 'OpenRouter API key saved successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save API key');
      if (__DEV__) console.error('Error saving OpenRouter API key:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveApiKey = () => {
    Alert.alert(
      'Remove API Key',
      'Are you sure you want to remove your OpenRouter API key? This will disable AI chat features.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('openrouter_api_key');
              setApiKey('');
              setIsKeySet(false);
              Alert.alert('Success', 'API key removed successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove API key');
            }
          }
        }
      ]
    );
  };

  const handleGetApiKey = () => {
    Linking.openURL('https://openrouter.ai/keys');
  };

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;
  const headerHeight = headerBaseHeight + topSpacing;

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={[styles.header, { height: headerHeight, paddingTop: topSpacing }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <MaterialIcons 
              name="arrow-back" 
              size={24} 
              color={currentTheme.colors.text} 
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
            AI Assistant
          </Text>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: currentTheme.colors.elevation1 }]}>
          <View style={styles.infoHeader}>
            <MaterialIcons 
              name="smart-toy" 
              size={24} 
              color={currentTheme.colors.primary}
            />
            <Text style={[styles.infoTitle, { color: currentTheme.colors.highEmphasis }]}>
              AI-Powered Chat
            </Text>
          </View>
          <Text style={[styles.infoDescription, { color: currentTheme.colors.mediumEmphasis }]}>
            Ask questions about any movie or TV show episode using advanced AI. Get insights about plot, characters, themes, trivia, and more - all powered by comprehensive TMDB data.
          </Text>
          
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <MaterialIcons name="check-circle" size={16} color={currentTheme.colors.primary} />
              <Text style={[styles.featureText, { color: currentTheme.colors.mediumEmphasis }]}>
                Episode-specific context and analysis
              </Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="check-circle" size={16} color={currentTheme.colors.primary} />
              <Text style={[styles.featureText, { color: currentTheme.colors.mediumEmphasis }]}>
                Plot explanations and character insights
              </Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="check-circle" size={16} color={currentTheme.colors.primary} />
              <Text style={[styles.featureText, { color: currentTheme.colors.mediumEmphasis }]}>
                Behind-the-scenes trivia and facts
              </Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="check-circle" size={16} color={currentTheme.colors.primary} />
              <Text style={[styles.featureText, { color: currentTheme.colors.mediumEmphasis }]}>
                Your own free OpenRouter API key
              </Text>
            </View>
          </View>
        </View>

        {/* API Key Configuration */}
        <View style={[styles.card, { backgroundColor: currentTheme.colors.elevation1 }]}>
          <Text style={[styles.cardTitle, { color: currentTheme.colors.mediumEmphasis }]}>
            OPENROUTER API KEY
          </Text>
          
          <View style={styles.apiKeySection}>
            <Text style={[styles.label, { color: currentTheme.colors.highEmphasis }]}>
              API Key
            </Text>
            <Text style={[styles.description, { color: currentTheme.colors.mediumEmphasis }]}>
              Enter your OpenRouter API key to enable AI chat features
            </Text>
            
            <TextInput
              style={[
                styles.input,
                { 
                  backgroundColor: currentTheme.colors.elevation2,
                  color: currentTheme.colors.highEmphasis,
                  borderColor: currentTheme.colors.elevation2
                }
              ]}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor={currentTheme.colors.mediumEmphasis}
              secureTextEntry={true}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.buttonContainer}>
              {!isKeySet ? (
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: currentTheme.colors.primary }]}
                  onPress={handleSaveApiKey}
                  disabled={loading}
                >
                  <MaterialIcons 
                    name="save" 
                    size={20} 
                    color={currentTheme.colors.white}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.saveButtonText}>
                    {loading ? 'Saving...' : 'Save API Key'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.updateButton, { backgroundColor: currentTheme.colors.primary }]}
                    onPress={handleSaveApiKey}
                    disabled={loading}
                  >
                    <MaterialIcons 
                      name="update" 
                      size={20} 
                      color={currentTheme.colors.white}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.updateButtonText}>Update</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.removeButton, { borderColor: currentTheme.colors.error }]}
                    onPress={handleRemoveApiKey}
                  >
                    <MaterialIcons 
                      name="delete" 
                      size={20} 
                      color={currentTheme.colors.error}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={[styles.removeButtonText, { color: currentTheme.colors.error }]}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.getKeyButton, { backgroundColor: currentTheme.colors.elevation2 }]}
              onPress={handleGetApiKey}
            >
              <MaterialIcons 
                name="open-in-new" 
                size={20} 
                color={currentTheme.colors.primary}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.getKeyButtonText, { color: currentTheme.colors.primary }]}>
                Get Free API Key from OpenRouter
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Card */}
        {isKeySet && (
          <View style={[styles.statusCard, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <View style={styles.statusHeader}>
              <MaterialIcons 
                name="check-circle" 
                size={24} 
                color={currentTheme.colors.success || '#4CAF50'}
              />
              <Text style={[styles.statusTitle, { color: currentTheme.colors.success || '#4CAF50' }]}>
                AI Chat Enabled
              </Text>
            </View>
            <Text style={[styles.statusDescription, { color: currentTheme.colors.mediumEmphasis }]}>
              You can now ask questions about movies and TV shows. Look for the "Ask AI" button on content pages!
            </Text>
          </View>
        )}

        {/* Usage Info */}
        <View style={[styles.usageCard, { backgroundColor: currentTheme.colors.elevation1 }]}>
          <Text style={[styles.usageTitle, { color: currentTheme.colors.highEmphasis }]}>
            How it works
          </Text>
          <Text style={[styles.usageText, { color: currentTheme.colors.mediumEmphasis }]}>
            • OpenRouter provides access to multiple AI models{'\n'}
            • Your API key stays private and secure{'\n'}
            • Free tier includes generous usage limits{'\n'}
            • Chat with context about specific episodes/movies{'\n'}
            • Get detailed analysis and explanations
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Math.max(16, width * 0.05),
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  headerTitle: {
    fontSize: Math.min(28, width * 0.07),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Math.max(16, width * 0.05),
    paddingBottom: 40,
  },
  infoCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 12,
  },
  infoDescription: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  featureList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 15,
    marginLeft: 8,
    flex: 1,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  apiKeySection: {
    gap: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
  },
  buttonContainer: {
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 1,
  },
  updateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    flex: 1,
  },
  removeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  getKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  getKeyButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  statusCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  statusDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  usageCard: {
    borderRadius: 16,
    padding: 20,
  },
  usageTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  usageText: {
    fontSize: 15,
    lineHeight: 24,
  },
});

export default AISettingsScreen;
