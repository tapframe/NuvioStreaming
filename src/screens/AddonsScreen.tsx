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
import { colors } from '../styles';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import axios from 'axios';

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

const AddonsScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [addons, setAddons] = useState<ExtendedManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [addonUrl, setAddonUrl] = useState('');
  const [addonDetails, setAddonDetails] = useState<ExtendedManifest | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);
  const [reorderMode, setReorderMode] = useState(false);
  const isDarkMode = true;

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
      const validAddons = response.data.filter(addon => addon.manifest && addon.transportUrl);
      setCommunityAddons(validAddons);
    } catch (error) {
      logger.error('Failed to load community addons:', error);
      setCommunityError('Failed to load community addons. Please try again later.');
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
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? colors.background : colors.white }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Addons</Text>
        <TouchableOpacity onPress={toggleReorderMode} style={styles.reorderButton}>
          <MaterialIcons 
            name={reorderMode ? "done" : "reorder"} 
            size={24} 
            color={colors.primary} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <StatsCard value={addons.length} label="Installed" />
        <StatsCard value={catalogCount} label="Catalogs" />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter addon URL..."
          placeholderTextColor={colors.mediumGray}
          value={addonUrl}
          onChangeText={setAddonUrl}
        />
        <TouchableOpacity 
          style={[styles.addButton, !addonUrl && styles.disabledButton]}
          onPress={() => handleAddAddon()}
          disabled={!addonUrl || installing}
        >
          {installing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <MaterialIcons name="add" size={24} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading addons...</Text>
        </View>
      ) : (
        <FlatList
          data={addons}
          renderItem={renderAddonItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="extension-off" size={48} color={colors.mediumGray} />
              <Text style={styles.emptyText}>No addons installed</Text>
              <Text style={styles.emptySubtext}>Add an addon using the URL field above</Text>
            </View>
          )}
        />
      )}

      {/* Community Addons Section */}
      <View style={styles.communitySection}>
        <Text style={styles.sectionTitle}>Community Addons</Text>
        {communityLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading community addons...</Text>
          </View>
        ) : communityError ? (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={24} color={colors.error} />
            <Text style={styles.errorText}>{communityError}</Text>
          </View>
        ) : (
          <FlatList
            data={communityAddons}
            renderItem={renderCommunityAddonItem}
            keyExtractor={(item) => item.manifest.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.communityList}
            contentContainerStyle={styles.communityListContent}
          />
        )}
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <BlurView intensity={100} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Install Addon</Text>
            {addonDetails && (
              <>
                <Text style={styles.modalAddonName}>{addonDetails.name}</Text>
                <Text style={styles.modalAddonDesc}>{addonDetails.description}</Text>
              </>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmInstallAddon}
              >
                <Text style={styles.modalButtonText}>Install</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    justifyContent: 'space-around',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.darkGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    color: colors.white,
  },
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.mediumGray,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mediumGray,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.mediumGray,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: colors.darkGray,
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 16,
  },
  modalAddonName: {
    fontSize: 16,
    color: colors.white,
    marginBottom: 8,
  },
  modalAddonDesc: {
    fontSize: 14,
    color: colors.mediumGray,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  modalButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButton: {
    backgroundColor: colors.mediumGray,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  communitySection: {
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  communityList: {
    height: 160,
  },
  communityListContent: {
    paddingHorizontal: 16,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    color: colors.error,
    marginLeft: 8,
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
  reorderButton: {
    padding: 8,
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
  installButton: {
    backgroundColor: colors.success,
    borderRadius: 6,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsCard: {
    backgroundColor: colors.darkGray,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    minWidth: 100,
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
});

export default AddonsScreen; 