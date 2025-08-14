import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  TextInput,
  ScrollView,
  RefreshControl,
  StatusBar,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSettings } from '../hooks/useSettings';
import { localScraperService, ScraperInfo } from '../services/localScraperService';
import { logger } from '../utils/logger';
import { useTheme } from '../contexts/ThemeContext';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Create a styles creator function that accepts the theme colors
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 44 : ANDROID_STATUSBAR_HEIGHT + 16,
      paddingBottom: 16,
    },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontSize: 17,
    color: colors.primary,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: colors.white,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: colors.elevation1,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.white,
      marginBottom: 8,
    },
  sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
  sectionDescription: {
    fontSize: 14,
    color: colors.mediumGray,
    marginBottom: 16,
    lineHeight: 20,
  },
  emptyContainer: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyText: {
    marginTop: 8,
    color: colors.mediumGray,
    fontSize: 15,
  },
  scraperItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevation2,
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scraperLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderRadius: 6,
    backgroundColor: colors.elevation3,
  },
  scraperInfo: {
    flex: 1,
  },
  scraperName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 2,
  },
  scraperDescription: {
    fontSize: 13,
    color: colors.mediumGray,
    marginBottom: 4,
    lineHeight: 18,
  },
  scraperMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scraperVersion: {
    fontSize: 12,
    color: colors.mediumGray,
  },
  scraperDot: {
    fontSize: 12,
    color: colors.mediumGray,
    marginHorizontal: 8,
  },
  scraperTypes: {
    fontSize: 12,
    color: colors.mediumGray,
  },
  scraperLanguage: {
    fontSize: 12,
    color: colors.mediumGray,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: colors.mediumEmphasis,
    lineHeight: 20,
  },
  textInput: {
    backgroundColor: colors.elevation1,
    borderRadius: 8,
    padding: 12,
    color: colors.white,
    marginBottom: 16,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.elevation2,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.elevation2,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.mediumGray,
    textAlign: 'center',
  },
  clearButton: {
    backgroundColor: '#ff3b30',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  currentRepoContainer: {
    backgroundColor: colors.elevation1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  currentRepoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  currentRepoUrl: {
    fontSize: 14,
    color: colors.white,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },
  urlHint: {
    fontSize: 12,
    color: colors.mediumGray,
    marginBottom: 8,
    lineHeight: 16,
  },
  defaultRepoButton: {
    backgroundColor: colors.elevation3,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  defaultRepoButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoText: {
     fontSize: 14,
     color: colors.mediumEmphasis,
     lineHeight: 20,
   },
   content: {
     flex: 1,
   },
   emptyState: {
     alignItems: 'center',
     paddingVertical: 32,
   },
   emptyStateTitle: {
     fontSize: 18,
     fontWeight: '600',
     color: colors.white,
     marginTop: 16,
     marginBottom: 8,
   },
   emptyStateDescription: {
     fontSize: 14,
     color: colors.mediumGray,
     textAlign: 'center',
     lineHeight: 20,
   },
   scrapersList: {
     gap: 12,
   },
   scrapersContainer: {
     marginBottom: 24,
   },
   inputContainer: {
     marginBottom: 16,
   },
   lastSection: {
     borderBottomWidth: 0,
   },
   disabledSection: {
     opacity: 0.5,
   },
   disabledText: {
     color: colors.elevation3,
   },
   disabledContainer: {
     opacity: 0.5,
   },
   disabledInput: {
     backgroundColor: colors.elevation1,
     opacity: 0.5,
   },
   disabledButton: {
     opacity: 0.5,
   },
   disabledImage: {
    opacity: 0.3,
  },
  availableIndicator: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  availableIndicatorText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '600',
  },
  qualityChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  qualityChip: {
    backgroundColor: colors.elevation2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.elevation3,
  },
  qualityChipSelected: {
    backgroundColor: '#ff3b30',
    borderColor: '#ff3b30',
  },
  qualityChipText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '500',
  },
  qualityChipTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
});

const PluginsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { settings, updateSetting } = useSettings();
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const styles = createStyles(colors);
  const [repositoryUrl, setRepositoryUrl] = useState(settings.scraperRepositoryUrl);
  const [installedScrapers, setInstalledScrapers] = useState<ScraperInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRepository, setHasRepository] = useState(false);
  const [showboxCookie, setShowboxCookie] = useState<string>('');
  const [showboxRegion, setShowboxRegion] = useState<string>('');
  const regionOptions = [
    { value: 'USA7', label: 'US East' },
    { value: 'USA6', label: 'US West' },
    { value: 'USA5', label: 'US Middle' },
    { value: 'UK3', label: 'United Kingdom' },
    { value: 'CA1', label: 'Canada' },
    { value: 'FR1', label: 'France' },
    { value: 'DE2', label: 'Germany' },
    { value: 'HK1', label: 'Hong Kong' },
    { value: 'IN1', label: 'India' },
    { value: 'AU1', label: 'Australia' },
    { value: 'SZ', label: 'China' },
  ];

  useEffect(() => {
    loadScrapers();
    checkRepository();
  }, []);

  const loadScrapers = async () => {
    try {
      const scrapers = await localScraperService.getAvailableScrapers();
      setInstalledScrapers(scrapers);
      // preload showbox settings if present
      const sb = scrapers.find(s => s.id === 'showboxog');
      if (sb) {
        const s = await localScraperService.getScraperSettings('showboxog');
        setShowboxCookie(s.cookie || '');
        setShowboxRegion(s.region || '');
      }
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
      await loadScrapers(); // This will now load available scrapers from manifest
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
      if (enabled) {
        // If enabling a scraper, ensure it's installed first
        const installedScrapers = await localScraperService.getInstalledScrapers();
        const isInstalled = installedScrapers.some(scraper => scraper.id === scraperId);
        
        if (!isInstalled) {
          // Need to install the scraper first
          setIsRefreshing(true);
          await localScraperService.refreshRepository();
          setIsRefreshing(false);
        }
      }
      
      await localScraperService.setScraperEnabled(scraperId, enabled);
      await loadScrapers();
    } catch (error) {
      logger.error('[ScraperSettings] Failed to toggle scraper:', error);
      Alert.alert('Error', 'Failed to update scraper status');
      setIsRefreshing(false);
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

  const handleToggleQualityExclusion = async (quality: string) => {
    const currentExcluded = settings.excludedQualities || [];
    const isExcluded = currentExcluded.includes(quality);
    
    let newExcluded: string[];
    if (isExcluded) {
      // Remove from excluded list
      newExcluded = currentExcluded.filter(q => q !== quality);
    } else {
      // Add to excluded list
      newExcluded = [...currentExcluded, quality];
    }
    
    await updateSetting('excludedQualities', newExcluded);
  };

  // Define available quality options
  const qualityOptions = ['2160p', '4K', '1080p', '720p', '360p', 'DV', 'HDR', 'REMUX', '480p', 'CAM', 'TS'];



  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={Platform.OS === 'ios' ? 'light-content' : 'light-content'}
        backgroundColor={colors.background}
      />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
          <Text style={styles.backText}>Settings</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.headerTitle}>Plugins</Text>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={loadScrapers} />
        }
      >
        {/* Enable Local Scrapers - Top Priority */}
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
              trackColor={{ false: colors.elevation3, true: colors.primary }}
              thumbColor={settings.enableLocalScrapers ? colors.white : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Repository Configuration - Moved up for better UX */}
        <View style={[styles.section, !settings.enableLocalScrapers && styles.disabledSection]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, !settings.enableLocalScrapers && styles.disabledText]}>Repository Configuration</Text>
            {hasRepository && settings.enableLocalScrapers && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearCache}
              >
                <Text style={styles.clearButtonText}>Clear Cache</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.sectionDescription, !settings.enableLocalScrapers && styles.disabledText]}>
            Enter the URL of a Nuvio scraper repository to download and install scrapers.
          </Text>
          
          {hasRepository && repositoryUrl && (
            <View style={[styles.currentRepoContainer, !settings.enableLocalScrapers && styles.disabledContainer]}>
              <Text style={[styles.currentRepoLabel, !settings.enableLocalScrapers && styles.disabledText]}>Current Repository:</Text>
              <Text style={[styles.currentRepoUrl, !settings.enableLocalScrapers && styles.disabledText]}>{localScraperService.getRepositoryName()}</Text>
              <Text style={[styles.currentRepoUrl, !settings.enableLocalScrapers && styles.disabledText, { fontSize: 12, opacity: 0.7, marginTop: 4 }]}>{repositoryUrl}</Text>
            </View>
          )}
          
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.textInput, !settings.enableLocalScrapers && styles.disabledInput]}
              value={repositoryUrl}
              onChangeText={setRepositoryUrl}
              placeholder="https://raw.githubusercontent.com/tapframe/nuvio-providers/main"
              placeholderTextColor={!settings.enableLocalScrapers ? colors.elevation3 : "#999"}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={settings.enableLocalScrapers}
            />
            <Text style={[styles.urlHint, !settings.enableLocalScrapers && styles.disabledText]}>
              💡 Use GitHub raw URL format. Default: https://raw.githubusercontent.com/tapframe/nuvio-providers/main
            </Text>
            
            <TouchableOpacity 
              style={[styles.defaultRepoButton, !settings.enableLocalScrapers && styles.disabledButton]} 
              onPress={handleUseDefaultRepo}
              disabled={!settings.enableLocalScrapers}
            >
              <Text style={[styles.defaultRepoButtonText, !settings.enableLocalScrapers && styles.disabledText]}>Use Default Repository</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, !settings.enableLocalScrapers && styles.disabledButton]}
              onPress={handleSaveRepository}
              disabled={isLoading || !settings.enableLocalScrapers}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={[styles.buttonText, !settings.enableLocalScrapers && styles.disabledText]}>Save Repository</Text>
              )}
            </TouchableOpacity>

            {hasRepository && (
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, !settings.enableLocalScrapers && styles.disabledButton]}
                onPress={handleRefreshRepository}
                disabled={isRefreshing || !settings.enableLocalScrapers}
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.secondaryButtonText, !settings.enableLocalScrapers && styles.disabledText]}>Refresh</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Available Scrapers */}
        <View style={[styles.section, !settings.enableLocalScrapers && styles.disabledSection]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, !settings.enableLocalScrapers && styles.disabledText]}>Available Scrapers</Text>
            {installedScrapers.length > 0 && settings.enableLocalScrapers && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearScrapers}
              >
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.sectionDescription, !settings.enableLocalScrapers && styles.disabledText]}>
            Scrapers available in the repository. Only enabled scrapers that are also installed will be used for streaming.
          </Text>

          {installedScrapers.length === 0 ? (
             <View style={[styles.emptyContainer, !settings.enableLocalScrapers && styles.disabledContainer]}>
               <Ionicons name="download-outline" size={48} color={!settings.enableLocalScrapers ? colors.elevation3 : colors.mediumGray} />
               <Text style={[styles.emptyStateTitle, !settings.enableLocalScrapers && styles.disabledText]}>No Scrapers Available</Text>
               <Text style={[styles.emptyStateDescription, !settings.enableLocalScrapers && styles.disabledText]}>
                 Configure a repository above to view available scrapers.
               </Text>
             </View>
           ) : (
             <View style={styles.scrapersContainer}>
                {installedScrapers.map((scraper) => {
                                  return (
                    <View key={scraper.id} style={[styles.scraperItem, !settings.enableLocalScrapers && styles.disabledContainer]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                        {scraper.logo ? (
                          <Image
                            source={{ uri: scraper.logo }}
                            style={[styles.scraperLogo, !settings.enableLocalScrapers && styles.disabledImage]}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={[styles.scraperLogo, !settings.enableLocalScrapers && styles.disabledContainer]} />
                        )}
                        <View style={styles.scraperInfo}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                             <Text style={[styles.scraperName, !settings.enableLocalScrapers && styles.disabledText]}>{scraper.name}</Text>
                             {scraper.manifestEnabled === false ? (
                               <View style={[styles.availableIndicator, { backgroundColor: colors.mediumGray }]}>
                                 <Text style={styles.availableIndicatorText}>Disabled</Text>
                               </View>
                             ) : scraper.disabledPlatforms && scraper.disabledPlatforms.includes(Platform.OS as 'ios' | 'android') ? (
                               <View style={[styles.availableIndicator, { backgroundColor: '#ff9500' }]}>
                                 <Text style={styles.availableIndicatorText}>Platform Disabled</Text>
                               </View>
                             ) : !scraper.enabled && (
                               <View style={styles.availableIndicator}>
                                 <Text style={styles.availableIndicatorText}>Available</Text>
                               </View>
                             )}
                           </View>
                          <Text style={[styles.scraperDescription, !settings.enableLocalScrapers && styles.disabledText]}>{scraper.description}</Text>
                          <View style={styles.scraperMeta}>
                            <Text style={[styles.scraperVersion, !settings.enableLocalScrapers && styles.disabledText]}>v{scraper.version}</Text>
                            <Text style={[styles.scraperDot, !settings.enableLocalScrapers && styles.disabledText]}>•</Text>
                            <Text style={[styles.scraperTypes, !settings.enableLocalScrapers && styles.disabledText]}>
                              {scraper.supportedTypes && Array.isArray(scraper.supportedTypes) ? scraper.supportedTypes.join(', ') : 'Unknown'}
                            </Text>
                            {scraper.contentLanguage && Array.isArray(scraper.contentLanguage) && scraper.contentLanguage.length > 0 && (
                              <>
                                <Text style={[styles.scraperDot, !settings.enableLocalScrapers && styles.disabledText]}>•</Text>
                                <Text style={[styles.scraperLanguage, !settings.enableLocalScrapers && styles.disabledText]}>
                                  {scraper.contentLanguage.map(lang => lang.toUpperCase()).join(', ')}
                                </Text>
                              </>
                            )}
                          </View>
                        </View>
                        <Switch
                              value={scraper.enabled && settings.enableLocalScrapers}
                              onValueChange={(enabled) => handleToggleScraper(scraper.id, enabled)}
                              trackColor={{ false: colors.elevation3, true: colors.primary }}
                              thumbColor={scraper.enabled && settings.enableLocalScrapers ? colors.white : '#f4f3f4'}
                              disabled={!settings.enableLocalScrapers || scraper.manifestEnabled === false || (scraper.disabledPlatforms && scraper.disabledPlatforms.includes(Platform.OS as 'ios' | 'android'))}
                              style={{ opacity: (!settings.enableLocalScrapers || scraper.manifestEnabled === false || (scraper.disabledPlatforms && scraper.disabledPlatforms.includes(Platform.OS as 'ios' | 'android'))) ? 0.5 : 1 }}
                            />
                      </View>
                       {scraper.id === 'showboxog' && settings.enableLocalScrapers && (
                         <View style={{ marginTop: 16, width: '100%', paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.elevation3 }}>
                           <Text style={[styles.settingTitle, { marginBottom: 8 }]}>ShowBox Cookie</Text>
                           <TextInput
                             style={[styles.textInput, { marginBottom: 12 }]}
                             value={showboxCookie}
                             onChangeText={setShowboxCookie}
                             placeholder="Paste FebBox ui cookie value"
                             placeholderTextColor={colors.mediumGray}
                             autoCapitalize="none"
                             autoCorrect={false}
                             multiline={true}
                             numberOfLines={3}
                           />
                           <Text style={[styles.settingTitle, { marginBottom: 8 }]}>Region</Text>
                           <View style={[styles.qualityChipsContainer, { marginBottom: 16 }]}>
                             {regionOptions.map(opt => {
                               const selected = showboxRegion === opt.value;
                               return (
                                 <TouchableOpacity
                                   key={opt.value}
                                   style={[styles.qualityChip, selected && styles.qualityChipSelected]}
                                   onPress={() => setShowboxRegion(opt.value)}
                                 >
                                   <Text style={[styles.qualityChipText, selected && styles.qualityChipTextSelected]}>
                                     {opt.label}
                                   </Text>
                                 </TouchableOpacity>
                               );
                             })}
                           </View>
                           <View style={styles.buttonRow}>
                             <TouchableOpacity
                               style={[styles.button, styles.primaryButton]}
                               onPress={async () => {
                                 await localScraperService.setScraperSettings('showboxog', { cookie: showboxCookie, region: showboxRegion });
                                 Alert.alert('Saved', 'ShowBox settings updated');
                               }}
                             >
                               <Text style={styles.buttonText}>Save</Text>
                             </TouchableOpacity>
                             <TouchableOpacity
                               style={[styles.button, styles.secondaryButton]}
                               onPress={async () => {
                                 setShowboxCookie('');
                                 setShowboxRegion('');
                                 await localScraperService.setScraperSettings('showboxog', {});
                               }}
                             >
                               <Text style={styles.secondaryButtonText}>Clear</Text>
                             </TouchableOpacity>
                           </View>
                         </View>
                       )}
                     </View>
                 );
               })}
             </View>
           )}
        </View>

        {/* Additional Scraper Settings */}
        <View style={[styles.section, !settings.enableLocalScrapers && styles.disabledSection]}>
          <Text style={[styles.sectionTitle, !settings.enableLocalScrapers && styles.disabledText]}>Additional Settings</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, !settings.enableLocalScrapers && styles.disabledText]}>Enable URL Validation</Text>
              <Text style={[styles.settingDescription, !settings.enableLocalScrapers && styles.disabledText]}>
                Validate streaming URLs before returning them (may slow down results but improves reliability)
              </Text>
            </View>
            <Switch
              value={settings.enableScraperUrlValidation && settings.enableLocalScrapers}
              onValueChange={handleToggleUrlValidation}
              trackColor={{ false: colors.elevation3, true: colors.primary }}
              thumbColor={settings.enableScraperUrlValidation && settings.enableLocalScrapers ? colors.white : '#f4f3f4'}
              disabled={!settings.enableLocalScrapers}
            />
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, !settings.enableLocalScrapers && styles.disabledText]}>Group Plugin Streams</Text>
              <Text style={[styles.settingDescription, !settings.enableLocalScrapers && styles.disabledText]}>
                When enabled, all plugin streams are grouped under "{localScraperService.getRepositoryName()}". When disabled, each plugin shows as a separate provider.
              </Text>
            </View>
            <Switch
               value={settings.streamDisplayMode === 'grouped'}
               onValueChange={(value) => {
                 updateSetting('streamDisplayMode', value ? 'grouped' : 'separate');
                 // Auto-disable quality sorting when grouping is disabled
                 if (!value && settings.streamSortMode === 'quality-then-scraper') {
                   updateSetting('streamSortMode', 'scraper-then-quality');
                 }
               }}
               trackColor={{ false: colors.elevation3, true: colors.primary }}
               thumbColor={settings.streamDisplayMode === 'grouped' ? colors.white : '#f4f3f4'}
               disabled={!settings.enableLocalScrapers}
             />
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, (!settings.enableLocalScrapers || settings.streamDisplayMode !== 'grouped') && styles.disabledText]}>Sort by Quality First</Text>
              <Text style={[styles.settingDescription, (!settings.enableLocalScrapers || settings.streamDisplayMode !== 'grouped') && styles.disabledText]}>
                When enabled, streams are sorted by quality first, then by scraper. When disabled, streams are sorted by scraper first, then by quality. Only available when grouping is enabled.
              </Text>
            </View>
            <Switch
               value={settings.streamSortMode === 'quality-then-scraper'}
               onValueChange={(value) => updateSetting('streamSortMode', value ? 'quality-then-scraper' : 'scraper-then-quality')}
               trackColor={{ false: colors.elevation3, true: colors.primary }}
               thumbColor={settings.streamSortMode === 'quality-then-scraper' ? colors.white : '#f4f3f4'}
               disabled={!settings.enableLocalScrapers || settings.streamDisplayMode !== 'grouped'}
             />
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, !settings.enableLocalScrapers && styles.disabledText]}>Show Scraper Logos</Text>
              <Text style={[styles.settingDescription, !settings.enableLocalScrapers && styles.disabledText]}>
                Display scraper logos next to streaming links on the streams screen.
              </Text>
            </View>
            <Switch
               value={settings.showScraperLogos && settings.enableLocalScrapers}
               onValueChange={(value) => updateSetting('showScraperLogos', value)}
               trackColor={{ false: colors.elevation3, true: colors.primary }}
               thumbColor={settings.showScraperLogos && settings.enableLocalScrapers ? colors.white : '#f4f3f4'}
               disabled={!settings.enableLocalScrapers}
             />
          </View>
        </View>

        {/* Quality Filtering */}
        <View style={[styles.section, !settings.enableLocalScrapers && styles.disabledSection]}>
          <Text style={[styles.sectionTitle, !settings.enableLocalScrapers && styles.disabledText]}>Quality Filtering</Text>
          <Text style={[styles.sectionDescription, !settings.enableLocalScrapers && styles.disabledText]}>
            Exclude specific video qualities from search results. Tap on a quality to exclude it from plugin results.
          </Text>
          
          <View style={styles.qualityChipsContainer}>
            {qualityOptions.map((quality) => {
              const isExcluded = (settings.excludedQualities || []).includes(quality);
              return (
                <TouchableOpacity
                  key={quality}
                  style={[
                    styles.qualityChip,
                    isExcluded && styles.qualityChipSelected,
                    !settings.enableLocalScrapers && styles.disabledButton
                  ]}
                  onPress={() => handleToggleQualityExclusion(quality)}
                  disabled={!settings.enableLocalScrapers}
                >
                  <Text style={[
                    styles.qualityChipText,
                    isExcluded && styles.qualityChipTextSelected,
                    !settings.enableLocalScrapers && styles.disabledText
                  ]}>
                    {isExcluded ? '✕ ' : ''}{quality}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          {(settings.excludedQualities || []).length > 0 && (
            <Text style={[styles.infoText, { marginTop: 12 }, !settings.enableLocalScrapers && styles.disabledText]}>
              💡 Excluded qualities: {(settings.excludedQualities || []).join(', ')}
            </Text>
          )}
        </View>

        {/* About */}
        <View style={[styles.section, styles.lastSection]}>
          <Text style={styles.sectionTitle}>About Plugins</Text>
          <Text style={styles.infoText}>
            Plugins are JavaScript modules that can search for streaming links from various sources. 
            They run locally on your device and can be installed from trusted repositories.
          </Text>
        </View>
      </ScrollView>
    </View>
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
  lastSection: {
    borderBottomWidth: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
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
    marginLeft: 0,
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
  scraperLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderRadius: 8,
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

export default PluginsScreen;