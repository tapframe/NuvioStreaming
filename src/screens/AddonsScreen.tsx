import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  ScrollView,
  useColorScheme,
  Switch,
  Linking
} from 'react-native';
import { stremioService, Manifest } from '../services/stremioService';
import { MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { BlurView as CommunityBlurView } from '@react-native-community/blur';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext';

// Extend Manifest type to include logo only (remove disabled status)
interface ExtendedManifest extends Manifest {
  logo?: string;
  transport?: string;
  behaviorHints?: {
    configurable?: boolean;
    configurationRequired?: boolean;
    configurationURL?: string;
  };
}

// Interface for Community Addon structure from the JSON URL
interface CommunityAddon {
  transportUrl: string;
  manifest: ExtendedManifest;
}

const { width } = Dimensions.get('window');

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Create a styles creator function that accepts the theme colors
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 8 : 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  activeHeaderButton: {
    backgroundColor: 'rgba(45, 156, 219, 0.2)',
    borderRadius: 6,
  },
  reorderModeText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '400',
  },
  reorderInfoBanner: {
    backgroundColor: 'rgba(45, 156, 219, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  reorderInfoText: {
    color: colors.white,
    fontSize: 14,
    marginLeft: 8,
  },
  reorderButtons: {
    position: 'absolute',
    left: -12,
    top: '50%',
    marginTop: -40,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  reorderButton: {
    backgroundColor: colors.elevation3,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: colors.elevation2,
  },
  priorityBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  priorityText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mediumGray,
    marginHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statsCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsDivider: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    alignSelf: 'center',
  },
  statsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
  },
  statsLabel: {
    fontSize: 13,
    color: colors.mediumGray,
  },
  addAddonContainer: {
    marginHorizontal: 16,
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  addonInput: {
    backgroundColor: colors.elevation1,
    borderRadius: 8,
    padding: 12,
    color: colors.white,
    marginBottom: 16,
    fontSize: 15,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  addonList: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  addonItem: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 16,
  },
  addonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addonIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.elevation3,
  },
  addonIconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.elevation3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addonTitleContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 16,
  },
  addonName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 2,
  },
  addonMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addonVersion: {
    fontSize: 13,
    color: colors.mediumGray,
  },
  addonDot: {
    fontSize: 13,
    color: colors.mediumGray,
    marginHorizontal: 4,
  },
  addonCategory: {
    fontSize: 13,
    color: colors.mediumGray,
    flex: 1,
  },
  addonDescription: {
    fontSize: 14,
    color: colors.mediumEmphasis,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 20,
    marginLeft: 48, // Align with title, accounting for icon width
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.elevation2,
    borderRadius: 14,
    width: '85%',
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.elevation3,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.white,
  },
  modalScrollContent: {
    maxHeight: 400,
  },
  addonDetailHeader: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.elevation3,
  },
  addonLogo: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: colors.elevation3,
  },
  addonLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.elevation3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  addonDetailName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
    textAlign: 'center',
  },
  addonDetailVersion: {
    fontSize: 14,
    color: colors.mediumGray,
  },
  addonDetailSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.elevation3,
  },
  addonDetailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 8,
  },
  addonDetailDescription: {
    fontSize: 15,
    color: colors.mediumEmphasis,
    lineHeight: 20,
  },
  addonDetailChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  addonDetailChip: {
    backgroundColor: colors.elevation3,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addonDetailChipText: {
    fontSize: 13,
    color: colors.white,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.elevation3,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.elevation3,
    marginRight: 8,
  },
  installButton: {
    backgroundColor: colors.success,
    borderRadius: 6,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  addonActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 6,
  },
  configButton: {
    padding: 6,
    marginRight: 8,
  },
  communityAddonsList: {
    paddingHorizontal: 20,
  },
  communityAddonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
  },
  communityAddonIcon: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 15,
  },
  communityAddonIconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 15,
    backgroundColor: colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  communityAddonDetails: {
    flex: 1,
    marginRight: 10,
  },
  communityAddonName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 3,
  },
  communityAddonDesc: {
    fontSize: 13,
    color: colors.lightGray,
    marginBottom: 5,
    opacity: 0.9,
  },
  communityAddonMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.8,
  },
  communityAddonVersion: {
     fontSize: 12,
     color: colors.lightGray,
  },
  communityAddonDot: {
    fontSize: 12,
    color: colors.lightGray,
    marginHorizontal: 5,
  },
  communityAddonCategory: {
     fontSize: 12,
     color: colors.lightGray,
     flexShrink: 1,
  },
  separator: {
    height: 10,
  },
  sectionSeparator: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 20,
      marginVertical: 20,
  },
  emptyMessage: {
    textAlign: 'center',
    color: colors.mediumGray,
    marginTop: 20,
    fontSize: 16,
    paddingHorizontal: 20,
  },
  errorMessage: {
    textAlign: 'center',
    color: colors.error,
    marginTop: 20,
    fontSize: 16,
    paddingHorizontal: 20,
  },
  loader: {
    marginTop: 30,
    alignSelf: 'center',
  },
  addonActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  androidBlurContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  androidBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  androidFallbackBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
  },
});

// Cinemeta addon details
const cinemetaAddon: CommunityAddon = {
  transportUrl: 'https://v3-cinemeta.strem.io/manifest.json',
  manifest: {
    id: 'com.linvo.cinemeta',
    version: '3.0.13',
    name: 'Cinemeta',
    description: 'Provides metadata for movies and series from TheTVDB, TheMovieDB, etc.',
    logo: 'https://static.strem.io/addons/cinemeta.png',
    types: ['movie', 'series'],
    behaviorHints: {
      configurable: false
    }
  } as ExtendedManifest,
};

const AddonsScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [addons, setAddons] = useState<ExtendedManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [addonUrl, setAddonUrl] = useState('');
  const [addonDetails, setAddonDetails] = useState<ExtendedManifest | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);
  // Add state for reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  // Use ThemeContext
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const styles = createStyles(colors);

  // State for community addons
  const [communityAddons, setCommunityAddons] = useState<CommunityAddon[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError, setCommunityError] = useState<string | null>(null);

  useEffect(() => {
    loadAddons();
    loadCommunityAddons();
  }, []);

  const loadAddons = async () => {
    try {
      setLoading(true);
      // Use the regular method without disabled state
      const installedAddons = await stremioService.getInstalledAddonsAsync();
      setAddons(installedAddons as ExtendedManifest[]);
      
      // Count catalogs
      let totalCatalogs = 0;
      installedAddons.forEach(addon => {
        if (addon.catalogs && addon.catalogs.length > 0) {
          totalCatalogs += addon.catalogs.length;
        }
      });
      
      // Get catalog settings to determine enabled count
      const catalogSettingsJson = await AsyncStorage.getItem('catalog_settings');
      if (catalogSettingsJson) {
        const catalogSettings = JSON.parse(catalogSettingsJson);
        const disabledCount = Object.entries(catalogSettings)
          .filter(([key, value]) => key !== '_lastUpdate' && value === false)
          .length;
        setCatalogCount(totalCatalogs - disabledCount);
      } else {
        setCatalogCount(totalCatalogs);
      }
    } catch (error) {
      logger.error('Failed to load addons:', error);
      Alert.alert('Error', 'Failed to load addons');
    } finally {
      setLoading(false);
    }
  };

  // Function to load community addons
  const loadCommunityAddons = async () => {
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const response = await axios.get<CommunityAddon[]>('https://stremio-addons.com/catalog.json');
      // Filter out addons without a manifest or transportUrl (basic validation)
      let validAddons = response.data.filter(addon => addon.manifest && addon.transportUrl);

      // Filter out Cinemeta if it's already in the community list to avoid duplication
      validAddons = validAddons.filter(addon => addon.manifest.id !== 'com.linvo.cinemeta');

      // Add Cinemeta to the beginning of the list
      setCommunityAddons([cinemetaAddon, ...validAddons]);
    } catch (error) {
      logger.error('Failed to load community addons:', error);
      setCommunityError('Failed to load community addons. Please try again later.');
      // Still show Cinemeta if the community list fails to load
      setCommunityAddons([cinemetaAddon]);
    } finally {
      setCommunityLoading(false);
    }
  };

  const handleAddAddon = async (url?: string) => {
    const urlToInstall = url || addonUrl;
    if (!urlToInstall) {
      Alert.alert('Error', 'Please enter an addon URL or select a community addon');
      return;
    }

    try {
      setInstalling(true);
      const manifest = await stremioService.getManifest(urlToInstall);
      setAddonDetails(manifest);
      setAddonUrl(urlToInstall);
      setShowConfirmModal(true);
    } catch (error) {
      logger.error('Failed to fetch addon details:', error);
      Alert.alert('Error', `Failed to fetch addon details from ${urlToInstall}`);
    } finally {
      setInstalling(false);
    }
  };

  const confirmInstallAddon = async () => {
    if (!addonDetails || !addonUrl) return;

    try {
      setInstalling(true);
      await stremioService.installAddon(addonUrl);
      setAddonUrl('');
      setShowConfirmModal(false);
      setAddonDetails(null);
      loadAddons();
      Alert.alert('Success', 'Addon installed successfully');
    } catch (error) {
      logger.error('Failed to install addon:', error);
      Alert.alert('Error', 'Failed to install addon');
    } finally {
      setInstalling(false);
    }
  };

  const refreshAddons = async () => {
    loadAddons();
    loadCommunityAddons();
  };

  const moveAddonUp = (addon: ExtendedManifest) => {
    if (stremioService.moveAddonUp(addon.id)) {
      // Refresh the list to reflect the new order
      loadAddons();
    }
  };

  const moveAddonDown = (addon: ExtendedManifest) => {
    if (stremioService.moveAddonDown(addon.id)) {
      // Refresh the list to reflect the new order
      loadAddons();
    }
  };

  const handleRemoveAddon = (addon: ExtendedManifest) => {
    Alert.alert(
      'Uninstall Addon',
      `Are you sure you want to uninstall ${addon.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Uninstall',
          style: 'destructive',
          onPress: () => {
            stremioService.removeAddon(addon.id);
            
            // Remove from addons list
            setAddons(prev => prev.filter(a => a.id !== addon.id));
          },
        },
      ]
    );
  };

  // Add function to handle configuration
  const handleConfigureAddon = (addon: ExtendedManifest, transportUrl?: string) => {
    // Try different ways to get the configuration URL
    let configUrl = '';
    
    // Debug log the addon data to help troubleshoot
    logger.info(`Configure addon: ${addon.name}, ID: ${addon.id}`);
    if (transportUrl) {
      logger.info(`TransportUrl provided: ${transportUrl}`);
    }
    
    // First check if the addon has a configurationURL directly
    if (addon.behaviorHints?.configurationURL) {
      configUrl = addon.behaviorHints.configurationURL;
      logger.info(`Using configurationURL from behaviorHints: ${configUrl}`);
    }
    // If a transport URL was provided directly (for community addons)
    else if (transportUrl) {
      // Remove any trailing filename like manifest.json
      const baseUrl = transportUrl.replace(/\/[^\/]+\.json$/, '/');
      configUrl = `${baseUrl}configure`;
      logger.info(`Using transportUrl to create config URL: ${configUrl}`);
    }
    // If the addon has a url property (this is set during installation)
    else if (addon.url) {
      configUrl = `${addon.url}configure`;
      logger.info(`Using addon.url property: ${configUrl}`);
    }
    // For com.stremio.*.addon format (common format for installed addons)
    else if (addon.id && addon.id.match(/^com\.stremio\.(.*?)\.addon$/)) {
      // Extract the domain part
      const match = addon.id.match(/^com\.stremio\.(.*?)\.addon$/);
      if (match && match[1]) {
        // Construct URL from the domain part of the ID
        const addonName = match[1];
        // For torrentio specifically, use known URL
        if (addonName === 'torrentio') {
          configUrl = 'https://torrentio.strem.fun/configure';
          logger.info(`Special case for torrentio: ${configUrl}`);
        } else {
          // Try to construct a reasonable URL for other addons
          configUrl = `https://${addonName}.strem.fun/configure`;
          logger.info(`Constructed URL from addon name: ${configUrl}`);
        }
      }
    }
    // If the ID is a URL, use that as the base (common for installed addons)
    else if (addon.id && addon.id.startsWith('http')) {
      // Get base URL from addon id (remove manifest.json or any trailing file)
      const baseUrl = addon.id.replace(/\/[^\/]+\.json$/, '/');
      configUrl = `${baseUrl}configure`;
      logger.info(`Using addon.id as HTTP URL: ${configUrl}`);
    } 
    // If the ID uses stremio:// protocol but contains http URL (common format)
    else if (addon.id && (addon.id.includes('https://') || addon.id.includes('http://'))) {
      // Extract the HTTP URL using a more flexible regex
      const match = addon.id.match(/(https?:\/\/[^\/]+)(\/[^\s]*)?/);
      if (match) {
        // Use the domain and path if available, otherwise just domain with /configure
        const domain = match[1];
        const path = match[2] ? match[2].replace(/\/[^\/]+\.json$/, '/') : '/';
        configUrl = `${domain}${path}configure`;
        logger.info(`Extracted HTTP URL from stremio:// format: ${configUrl}`);
      }
    }
    
    // Special case for common addon format like stremio://addon.stremio.com/...
    if (!configUrl && addon.id && addon.id.startsWith('stremio://')) {
      // Try to convert stremio://domain.com/... to https://domain.com/...
      const domainMatch = addon.id.match(/stremio:\/\/([^\/]+)(\/[^\s]*)?/);
      if (domainMatch) {
        const domain = domainMatch[1];
        const path = domainMatch[2] ? domainMatch[2].replace(/\/[^\/]+\.json$/, '/') : '/';
        configUrl = `https://${domain}${path}configure`;
        logger.info(`Converted stremio:// protocol to https:// for config URL: ${configUrl}`);
      }
    }
    
    // Use transport property if available (some addons include this)
    if (!configUrl && addon.transport && typeof addon.transport === 'string' && addon.transport.includes('http')) {
      const baseUrl = addon.transport.replace(/\/[^\/]+\.json$/, '/');
      configUrl = `${baseUrl}configure`;
      logger.info(`Using addon.transport for config URL: ${configUrl}`);
    }
    
    // Get the URL from manifest's originalUrl if available
    if (!configUrl && (addon as any).originalUrl) {
      const baseUrl = (addon as any).originalUrl.replace(/\/[^\/]+\.json$/, '/');
      configUrl = `${baseUrl}configure`;
      logger.info(`Using originalUrl property: ${configUrl}`);
    }
    
    // If we couldn't determine a config URL, show an error
    if (!configUrl) {
      logger.error(`Failed to determine config URL for addon: ${addon.name}, ID: ${addon.id}`);
      Alert.alert(
        'Configuration Unavailable', 
        'Could not determine configuration URL for this addon.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Log the URL being opened
    logger.info(`Opening configuration for addon: ${addon.name} at URL: ${configUrl}`);
    
    // Check if the URL can be opened
    Linking.canOpenURL(configUrl).then(supported => {
      if (supported) {
        Linking.openURL(configUrl);
      } else {
        logger.error(`URL cannot be opened: ${configUrl}`);
        Alert.alert(
          'Cannot Open Configuration',
          `The configuration URL (${configUrl}) cannot be opened. The addon may not have a configuration page.`,
          [{ text: 'OK' }]
        );
      }
    }).catch(err => {
      logger.error(`Error checking if URL can be opened: ${configUrl}`, err);
      Alert.alert('Error', 'Could not open configuration page.');
    });
  };

  const toggleReorderMode = () => {
    setReorderMode(!reorderMode);
  };

  const renderAddonItem = ({ item, index }: { item: ExtendedManifest, index: number }) => {
    const types = item.types || [];
    const description = item.description || '';
    // @ts-ignore - some addons might have logo property even though it's not in the type
    const logo = item.logo || null;
    // Check if addon is configurable
    const isConfigurable = item.behaviorHints?.configurable === true;
    
    // Format the types into a simple category text
    const categoryText = types.length > 0 
      ? types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' • ') 
      : 'No categories';
      
    const isFirstItem = index === 0;
    const isLastItem = index === addons.length - 1;

    return (
      <View style={styles.addonItem}>
        {reorderMode && (
          <View style={styles.reorderButtons}>
            <TouchableOpacity 
              style={[styles.reorderButton, isFirstItem && styles.disabledButton]}
              onPress={() => moveAddonUp(item)}
              disabled={isFirstItem}
            >
              <MaterialIcons 
                name="arrow-upward" 
                size={20} 
                color={isFirstItem ? colors.mediumGray : colors.white} 
              />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.reorderButton, isLastItem && styles.disabledButton]}
              onPress={() => moveAddonDown(item)}
              disabled={isLastItem}
            >
              <MaterialIcons 
                name="arrow-downward" 
                size={20} 
                color={isLastItem ? colors.mediumGray : colors.white}
              />
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.addonHeader}>
          {logo ? (
            <ExpoImage 
              source={{ uri: logo }} 
              style={styles.addonIcon} 
              contentFit="contain"
            />
          ) : (
            <View style={styles.addonIconPlaceholder}>
              <MaterialIcons name="extension" size={22} color={colors.mediumGray} />
            </View>
          )}
          <View style={styles.addonTitleContainer}>
            <Text style={styles.addonName}>{item.name}</Text>
            <View style={styles.addonMetaContainer}>
              <Text style={styles.addonVersion}>v{item.version || '1.0.0'}</Text>
              <Text style={styles.addonDot}>•</Text>
              <Text style={styles.addonCategory}>{categoryText}</Text>
            </View>
          </View>
          <View style={styles.addonActions}>
            {!reorderMode ? (
              <>
                {isConfigurable && (
                  <TouchableOpacity 
                    style={styles.configButton}
                    onPress={() => handleConfigureAddon(item, item.transport)}
                  >
                    <MaterialIcons name="settings" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => handleRemoveAddon(item)}
                >
                  <MaterialIcons name="delete" size={20} color={colors.error} />
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.priorityBadge}>
                <Text style={styles.priorityText}>#{index + 1}</Text>
              </View>
            )}
          </View>
        </View>
        
        <Text style={styles.addonDescription}>
          {description.length > 100 ? description.substring(0, 100) + '...' : description}
        </Text>
      </View>
    );
  };

  // Function to render community addon items
  const renderCommunityAddonItem = ({ item }: { item: CommunityAddon }) => {
    const { manifest, transportUrl } = item;
    const types = manifest.types || [];
    const description = manifest.description || 'No description provided.';
    // @ts-ignore - logo might exist
    const logo = manifest.logo || null;
    const categoryText = types.length > 0
      ? types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' • ')
      : 'General';
    // Check if addon is configurable
    const isConfigurable = manifest.behaviorHints?.configurable === true;

    return (
      <View style={styles.communityAddonItem}>
        {logo ? (
          <ExpoImage
            source={{ uri: logo }}
            style={styles.communityAddonIcon}
            contentFit="contain"
          />
        ) : (
          <View style={styles.communityAddonIconPlaceholder}>
            <MaterialIcons name="extension" size={22} color={colors.darkGray} />
          </View>
        )}
        <View style={styles.communityAddonDetails}>
          <Text style={styles.communityAddonName}>{manifest.name}</Text>
          <Text style={styles.communityAddonDesc} numberOfLines={2}>{description}</Text>
          <View style={styles.communityAddonMetaContainer}>
             <Text style={styles.communityAddonVersion}>v{manifest.version || 'N/A'}</Text>
             <Text style={styles.communityAddonDot}>•</Text>
             <Text style={styles.communityAddonCategory}>{categoryText}</Text>
          </View>
        </View>
        <View style={styles.addonActionButtons}>
          {isConfigurable && (
            <TouchableOpacity
              style={styles.configButton}
              onPress={() => handleConfigureAddon(manifest, transportUrl)}
            >
              <MaterialIcons name="settings" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.installButton, installing && { opacity: 0.6 }]}
            onPress={() => handleAddAddon(transportUrl)}
            disabled={installing}
          >
            {installing ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <MaterialIcons name="add" size={20} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const StatsCard = ({ value, label }: { value: number; label: string }) => (
    <View style={styles.statsCard}>
      <Text style={styles.statsValue}>{value}</Text>
      <Text style={styles.statsLabel}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="chevron-left" size={28} color={colors.white} />
          <Text style={styles.backText}>Settings</Text>
        </TouchableOpacity>
        
        <View style={styles.headerActions}>
          {/* Reorder Mode Toggle Button */}
          <TouchableOpacity 
            style={[styles.headerButton, reorderMode && styles.activeHeaderButton]}
            onPress={toggleReorderMode}
          >
            <MaterialIcons 
              name="swap-vert" 
              size={24} 
              color={reorderMode ? colors.primary : colors.white} 
            />
          </TouchableOpacity>
          
          {/* Refresh Button */}
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={refreshAddons}
            disabled={loading}
          >
            <MaterialIcons 
              name="refresh" 
              size={24} 
              color={loading ? colors.mediumGray : colors.white} 
            />
          </TouchableOpacity>
        </View>
      </View>
      
      <Text style={styles.headerTitle}>
        Addons
        {reorderMode && <Text style={styles.reorderModeText}> (Reorder Mode)</Text>}
      </Text>
      
      {reorderMode && (
        <View style={styles.reorderInfoBanner}>
          <MaterialIcons name="info-outline" size={18} color={colors.primary} />
          <Text style={styles.reorderInfoText}>
            Addons at the top have higher priority when loading content
          </Text>
        </View>
      )}
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Overview Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OVERVIEW</Text>
            <View style={styles.statsContainer}>
              <StatsCard value={addons.length} label="Addons" />
              <View style={styles.statsDivider} />
              <StatsCard value={addons.length} label="Active" />
              <View style={styles.statsDivider} />
              <StatsCard value={catalogCount} label="Catalogs" />
            </View>
          </View>
          
          {/* Hide Add Addon Section in reorder mode */}
          {!reorderMode && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ADD NEW ADDON</Text>
              <View style={styles.addAddonContainer}>
                <TextInput
                  style={styles.addonInput}
                  placeholder="Addon URL"
                  placeholderTextColor={colors.mediumGray}
                  value={addonUrl}
                  onChangeText={setAddonUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity 
                  style={[styles.addButton, {opacity: installing || !addonUrl ? 0.6 : 1}]}
                  onPress={() => handleAddAddon()}
                  disabled={installing || !addonUrl}
                >
                  <Text style={styles.addButtonText}>
                    {installing ? 'Loading...' : 'Add Addon'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Installed Addons Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {reorderMode ? "DRAG ADDONS TO REORDER" : "INSTALLED ADDONS"}
            </Text>
            <View style={styles.addonList}>
              {addons.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="extension-off" size={32} color={colors.mediumGray} />
                  <Text style={styles.emptyText}>No addons installed</Text>
                </View>
              ) : (
                addons.map((addon, index) => (
                  <View 
                    key={addon.id} 
                    style={{ marginBottom: index === addons.length - 1 ? 32 : 0 }}
                  >
                    {renderAddonItem({ item: addon, index })}
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Separator */}
           <View style={styles.sectionSeparator} />

           {/* Community Addons Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>COMMUNITY ADDONS</Text>
            <View style={styles.addonList}>
              {communityLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : communityError ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="error-outline" size={32} color={colors.error} />
                  <Text style={styles.emptyText}>{communityError}</Text>
                </View>
              ) : communityAddons.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="extension-off" size={32} color={colors.mediumGray} />
                  <Text style={styles.emptyText}>No community addons available</Text>
                </View>
              ) : (
                communityAddons.map((item, index) => (
                  <View 
                    key={item.transportUrl} 
                    style={{ marginBottom: index === communityAddons.length - 1 ? 32 : 16 }}
                  >
                    <View style={styles.addonItem}>
                      <View style={styles.addonHeader}>
                        {item.manifest.logo ? (
                          <ExpoImage 
                            source={{ uri: item.manifest.logo }} 
                            style={styles.addonIcon} 
                            contentFit="contain"
                          />
                        ) : (
                          <View style={styles.addonIconPlaceholder}>
                            <MaterialIcons name="extension" size={22} color={colors.mediumGray} />
                          </View>
                        )}
                        <View style={styles.addonTitleContainer}>
                          <Text style={styles.addonName}>{item.manifest.name}</Text>
                          <View style={styles.addonMetaContainer}>
                            <Text style={styles.addonVersion}>v{item.manifest.version || 'N/A'}</Text>
                            <Text style={styles.addonDot}>•</Text>
                            <Text style={styles.addonCategory}>
                              {item.manifest.types && item.manifest.types.length > 0
                                ? item.manifest.types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' • ')
                                : 'General'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.addonActions}>
                          {item.manifest.behaviorHints?.configurable && (
                            <TouchableOpacity 
                              style={styles.configButton}
                              onPress={() => handleConfigureAddon(item.manifest, item.transportUrl)}
                            >
                              <MaterialIcons name="settings" size={20} color={colors.primary} />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity 
                            style={[styles.installButton, installing && { opacity: 0.6 }]}
                            onPress={() => handleAddAddon(item.transportUrl)}
                            disabled={installing}
                          >
                            {installing ? (
                              <ActivityIndicator size="small" color={colors.white} />
                            ) : (
                              <MaterialIcons name="add" size={20} color={colors.white} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                      
                      <Text style={styles.addonDescription}>
                        {item.manifest.description 
                          ? (item.manifest.description.length > 100 
                              ? item.manifest.description.substring(0, 100) + '...' 
                              : item.manifest.description)
                          : 'No description provided.'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Addon Details Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowConfirmModal(false);
          setAddonDetails(null);
        }}
      >
        <View style={styles.modalContainer}>
          {Platform.OS === 'ios' ? (
            <ExpoBlurView intensity={80} style={styles.blurOverlay} tint="dark" />
          ) : (
            Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? (
              <View style={[styles.androidBlurContainer, styles.androidFallbackBlur]} />
            ) : (
              <View style={styles.androidBlurContainer}>
                <CommunityBlurView
                  style={styles.androidBlur}
                  blurType="dark"
                  blurAmount={8}
                  overlayColor="rgba(0,0,0,0.4)"
                  reducedTransparencyFallbackColor="black"
                />
              </View>
            )
          )}
          <View style={styles.modalContent}>
            {addonDetails && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Install Addon</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowConfirmModal(false);
                      setAddonDetails(null);
                    }}
                  >
                    <MaterialIcons name="close" size={24} color={colors.white} />
                  </TouchableOpacity>
                </View>
                
                <ScrollView 
                  style={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={true}
                >
                  <View style={styles.addonDetailHeader}>
                    {/* @ts-ignore */}
                    {addonDetails.logo ? (
                      <ExpoImage
                        source={{ uri: addonDetails.logo }}
                        style={styles.addonLogo}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={styles.addonLogoPlaceholder}>
                        <MaterialIcons name="extension" size={40} color={colors.mediumGray} />
                      </View>
                    )}
                    <Text style={styles.addonDetailName}>{addonDetails.name}</Text>
                    <Text style={styles.addonDetailVersion}>v{addonDetails.version || '1.0.0'}</Text>
                  </View>
                  
                  <View style={styles.addonDetailSection}>
                    <Text style={styles.addonDetailSectionTitle}>Description</Text>
                    <Text style={styles.addonDetailDescription}>
                      {addonDetails.description || 'No description available'}
                    </Text>
                  </View>
                  
                  {addonDetails.types && addonDetails.types.length > 0 && (
                    <View style={styles.addonDetailSection}>
                      <Text style={styles.addonDetailSectionTitle}>Supported Types</Text>
                      <View style={styles.addonDetailChips}>
                        {addonDetails.types.map((type, index) => (
                          <View key={index} style={styles.addonDetailChip}>
                            <Text style={styles.addonDetailChipText}>{type}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  
                  {addonDetails.catalogs && addonDetails.catalogs.length > 0 && (
                    <View style={styles.addonDetailSection}>
                      <Text style={styles.addonDetailSectionTitle}>Catalogs</Text>
                      <View style={styles.addonDetailChips}>
                        {addonDetails.catalogs.map((catalog, index) => (
                          <View key={index} style={styles.addonDetailChip}>
                            <Text style={styles.addonDetailChipText}>
                              {catalog.type} - {catalog.id}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </ScrollView>
                
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setShowConfirmModal(false);
                      setAddonDetails(null);
                    }}
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.installButton]}
                    onPress={confirmInstallAddon}
                    disabled={installing}
                  >
                    {installing ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.modalButtonText}>Install</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default AddonsScreen; 