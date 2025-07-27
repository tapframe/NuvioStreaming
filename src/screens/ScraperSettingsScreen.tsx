import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSettings } from '../hooks/useSettings';
import { localScraperService, ScraperInfo } from '../services/localScraperService';
import { logger } from '../utils/logger';

const ScraperSettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { settings, updateSetting } = useSettings();
  const [repositoryUrl, setRepositoryUrl] = useState(settings.scraperRepositoryUrl);
  const [installedScrapers, setInstalledScrapers] = useState<ScraperInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRepository, setHasRepository] = useState(false);

  useEffect(() => {
    loadScrapers();
    checkRepository();
  }, []);

  const loadScrapers = async () => {
    try {
      const scrapers = await localScraperService.getInstalledScrapers();
      setInstalledScrapers(scrapers);
    } catch (error) {
      logger.error('[ScraperSettings] Failed to load scrapers:', error);
    }
  };

  const checkRepository = async () => {
    try {
      const repoUrl = await localScraperService.getRepositoryUrl();
      setHasRepository(!!repoUrl);
      if (repoUrl && repoUrl !== repositoryUrl) {
        setRepositoryUrl(repoUrl);
      }
    } catch (error) {
      logger.error('[ScraperSettings] Failed to check repository:', error);
    }
  };

  const handleSaveRepository = async () => {
    if (!repositoryUrl.trim()) {
      Alert.alert('Error', 'Please enter a valid repository URL');
      return;
    }

    // Validate URL format
    const url = repositoryUrl.trim();
    if (!url.startsWith('https://raw.githubusercontent.com/') && !url.startsWith('http://')) {
      Alert.alert(
        'Invalid URL Format', 
        'Please use a valid GitHub raw URL format:\n\nhttps://raw.githubusercontent.com/username/repo/branch/\n\nExample:\nhttps://raw.githubusercontent.com/tapframe/nuvio-providers/main/'
      );
      return;
    }

    try {
      setIsLoading(true);
      await localScraperService.setRepositoryUrl(url);
      await updateSetting('scraperRepositoryUrl', url);
      setHasRepository(true);
      Alert.alert('Success', 'Repository URL saved successfully');
    } catch (error) {
      logger.error('[ScraperSettings] Failed to save repository:', error);
      Alert.alert('Error', 'Failed to save repository URL');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshRepository = async () => {
    if (!repositoryUrl.trim()) {
      Alert.alert('Error', 'Please set a repository URL first');
      return;
    }

    try {
      setIsRefreshing(true);
      await localScraperService.refreshRepository();
      await loadScrapers();
      Alert.alert('Success', 'Repository refreshed successfully');
    } catch (error) {
      logger.error('[ScraperSettings] Failed to refresh repository:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert(
        'Repository Error', 
        `Failed to refresh repository: ${errorMessage}\n\nPlease ensure your URL is correct and follows this format:\nhttps://raw.githubusercontent.com/username/repo/branch/`
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggleScraper = async (scraperId: string, enabled: boolean) => {
    try {
      await localScraperService.setScraperEnabled(scraperId, enabled);
      await loadScrapers();
    } catch (error) {
      logger.error('[ScraperSettings] Failed to toggle scraper:', error);
      Alert.alert('Error', 'Failed to update scraper status');
    }
  };

  const handleClearScrapers = () => {
    Alert.alert(
      'Clear All Scrapers',
      'Are you sure you want to remove all installed scrapers? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await localScraperService.clearScrapers();
              await loadScrapers();
              Alert.alert('Success', 'All scrapers have been removed');
            } catch (error) {
              logger.error('[ScraperSettings] Failed to clear scrapers:', error);
              Alert.alert('Error', 'Failed to clear scrapers');
            }
          },
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Repository Cache',
      'This will remove the saved repository URL and clear all cached scraper data. You will need to re-enter your repository URL.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            try {
              await localScraperService.clearScrapers();
              await localScraperService.setRepositoryUrl('');
              await updateSetting('scraperRepositoryUrl', '');
              setRepositoryUrl('');
              setHasRepository(false);
              await loadScrapers();
              Alert.alert('Success', 'Repository cache cleared successfully');
            } catch (error) {
              logger.error('[ScraperSettings] Failed to clear cache:', error);
              Alert.alert('Error', 'Failed to clear repository cache');
            }
          },
        },
      ]
    );
  };

  const handleUseDefaultRepo = () => {
    const defaultUrl = 'https://raw.githubusercontent.com/tapframe/nuvio-providers/main';
    setRepositoryUrl(defaultUrl);
  };

  const handleToggleLocalScrapers = async (enabled: boolean) => {
    await updateSetting('enableLocalScrapers', enabled);
  };

  const handleToggleUrlValidation = async (enabled: boolean) => {
    await updateSetting('enableScraperUrlValidation', enabled);
  };

  const renderScraperItem = (scraper: ScraperInfo) => (
    <View key={scraper.id} style={styles.scraperItem}>
      <View style={styles.scraperInfo}>
        <Text style={styles.scraperName}>{scraper.name}</Text>
        <Text style={styles.scraperDescription}>{scraper.description}</Text>
        <View style={styles.scraperMeta}>
          <Text style={styles.scraperVersion}>v{scraper.version}</Text>
          <Text style={styles.scraperTypes}>
            {scraper.supportedTypes.join(', ')}
          </Text>
        </View>
      </View>
      <Switch
        value={scraper.enabled}
        onValueChange={(enabled) => handleToggleScraper(scraper.id, enabled)}
        trackColor={{ false: '#767577', true: '#007AFF' }}
        thumbColor={scraper.enabled ? '#ffffff' : '#f4f3f4'}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Local Scrapers</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={loadScrapers} />
        }
      >
        {/* Enable/Disable Local Scrapers */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Enable Local Scrapers</Text>
              <Text style={styles.settingDescription}>
                Allow the app to use locally installed scrapers for finding streams
              </Text>
            </View>
            <Switch
              value={settings.enableLocalScrapers}
              onValueChange={handleToggleLocalScrapers}
              trackColor={{ false: '#767577', true: '#007AFF' }}
              thumbColor={settings.enableLocalScrapers ? '#ffffff' : '#f4f3f4'}
            />
          </View>
          
          {/* URL Validation Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Enable URL Validation</Text>
              <Text style={styles.settingDescription}>
                Validate streaming URLs before returning them (may slow down results but improves reliability)
              </Text>
            </View>
            <Switch
              value={settings.enableScraperUrlValidation}
              onValueChange={handleToggleUrlValidation}
              trackColor={{ false: '#767577', true: '#007AFF' }}
              thumbColor={settings.enableScraperUrlValidation ? '#ffffff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Repository Configuration */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Repository Configuration</Text>
            {hasRepository && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearCache}
              >
                <Text style={styles.clearButtonText}>Clear Cache</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionDescription}>
            Enter the URL of a Nuvio scraper repository to download and install scrapers.
          </Text>
          
          {hasRepository && repositoryUrl && (
            <View style={styles.currentRepoContainer}>
              <Text style={styles.currentRepoLabel}>Current Repository:</Text>
              <Text style={styles.currentRepoUrl}>{repositoryUrl}</Text>
            </View>
          )}
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={repositoryUrl}
              onChangeText={setRepositoryUrl}
              placeholder="https://raw.githubusercontent.com/tapframe/nuvio-providers/main"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.urlHint}>
              💡 Use GitHub raw URL format. Default: https://raw.githubusercontent.com/tapframe/nuvio-providers/main
            </Text>
            
            <TouchableOpacity 
              style={styles.defaultRepoButton} 
              onPress={handleUseDefaultRepo}
            >
              <Text style={styles.defaultRepoButtonText}>Use Default Repository</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleSaveRepository}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Save Repository</Text>
              )}
            </TouchableOpacity>

            {hasRepository && (
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleRefreshRepository}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Refresh</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Installed Scrapers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Installed Scrapers</Text>
            {installedScrapers.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearScrapers}
              >
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>

          {installedScrapers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="download-outline" size={48} color="#999" />
              <Text style={styles.emptyStateTitle}>No Scrapers Installed</Text>
              <Text style={styles.emptyStateDescription}>
                Add a repository URL above and refresh to install scrapers.
              </Text>
            </View>
          ) : (
            <View style={styles.scrapersList}>
              {installedScrapers.map(renderScraperItem)}
            </View>
          )}
        </View>

        {/* Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Local Scrapers</Text>
          <Text style={styles.infoText}>
            Local scrapers are JavaScript modules that can search for streaming links from various sources. 
            They run locally on your device and can be installed from trusted repositories.
          </Text>
          <Text style={styles.infoText}>
            ⚠️ Only install scrapers from trusted sources. Malicious scrapers could potentially access your data.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#999',
    lineHeight: 18,
  },
  inputContainer: {
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#ff3b30',
  },
  clearButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  scrapersList: {
    gap: 12,
  },
  scraperItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  scraperInfo: {
    flex: 1,
    marginRight: 16,
  },
  scraperName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  scraperDescription: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
    lineHeight: 18,
  },
  scraperMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  scraperVersion: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  scraperTypes: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
    marginBottom: 12,
  },
  currentRepoContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  currentRepoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
    marginBottom: 4,
  },
  currentRepoUrl: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  urlHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    lineHeight: 16,
  },
  defaultRepoButton: {
    backgroundColor: '#333',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  defaultRepoButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ScraperSettingsScreen;