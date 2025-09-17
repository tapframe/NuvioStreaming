import React, { useState, useEffect, useMemo } from 'react';
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
  ActivityIndicator,
  Modal,
  Dimensions,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSettings } from '../hooks/useSettings';
import { localScraperService, ScraperInfo, RepositoryInfo } from '../services/localScraperService';
import { logger } from '../utils/logger';
import { useTheme } from '../contexts/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 8 : 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
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
    backgroundColor: colors.darkBackground,
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
    backgroundColor: colors.darkBackground,
    borderRadius: 8,
    padding: 12,
    color: colors.white,
    marginBottom: 16,
    fontSize: 15,
  },
  button: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.elevation3,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: colors.elevation3,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.white,
    textAlign: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.white,
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
    marginTop: 8,
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
  // New styles for improved UX
  collapsibleSection: {
    backgroundColor: colors.darkBackground,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.elevation2,
  },
  collapsibleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  collapsibleContent: {
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.darkBackground,
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    color: colors.white,
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.elevation2,
    borderWidth: 1,
    borderColor: colors.elevation3,
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  bulkActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  bulkActionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderWidth: 1,
  },
  bulkActionButtonEnabled: {
    backgroundColor: 'transparent',
    borderColor: '#34C759',
  },
  bulkActionButtonDisabled: {
    backgroundColor: 'transparent',
    borderColor: colors.elevation3,
  },
  bulkActionButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.darkBackground,
    borderRadius: 16,
    padding: 20,
    margin: 20,
    maxHeight: '70%',
    width: screenWidth - 40,
    borderWidth: 1,
    borderColor: colors.elevation3,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 16,
    color: colors.mediumGray,
    lineHeight: 24,
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
  },
  modalButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '500',
  },
  // Compact modal styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  compactTextInput: {
    backgroundColor: colors.darkBackground,
    borderRadius: 8,
    padding: 12,
    color: colors.white,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.elevation3,
    marginBottom: 12,
  },
  compactExamples: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevation2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.elevation3,
  },
  quickButtonText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '500',
  },
  formatHint: {
    fontSize: 12,
    color: colors.mediumGray,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 16,
    lineHeight: 16,
  },
  compactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  compactButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  cancelButton: {
    backgroundColor: colors.elevation2,
    borderWidth: 1,
    borderColor: colors.elevation3,
  },
  cancelButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: colors.primary,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  quickSetupContainer: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  quickSetupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 8,
  },
  quickSetupText: {
    fontSize: 14,
    color: colors.mediumGray,
    lineHeight: 20,
    marginBottom: 12,
  },
  quickSetupButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  quickSetupButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
  },
  scraperCard: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.elevation3,
    minHeight: 120,
  },
  scraperCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scraperCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  scraperCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  scraperCardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 4,
  },
  scraperCardMetaText: {
    fontSize: 12,
    color: colors.mediumGray,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    marginBottom: 16,
  },
  // Repository management styles
  repositoriesList: {
    marginBottom: 16,
  },
  repositoryItem: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.elevation3,
  },
  repositoryInfo: {
    flex: 1,
    marginBottom: 12,
  },
  repositoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
    marginRight: 8,
  },
  repositoryDescription: {
    fontSize: 14,
    color: colors.mediumGray,
    marginBottom: 4,
    lineHeight: 18,
  },
  repositoryUrl: {
    fontSize: 12,
    color: colors.mediumGray,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
  },
  repositoryMeta: {
    fontSize: 12,
    color: colors.mediumGray,
  },
  repositoryActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  repositoryActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  repositoryActionButtonPrimary: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
  },
  repositoryActionButtonSecondary: {
    backgroundColor: 'transparent',
    borderColor: colors.elevation3,
  },
  repositoryActionButtonDanger: {
    backgroundColor: 'transparent',
    borderColor: '#ff3b30',
  },
  repositoryActionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.white,
  },
});

// Helper component for collapsible sections
const CollapsibleSection: React.FC<{
  title: string;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  colors: any;
  styles: any;
}> = ({ title, children, isExpanded, onToggle, colors, styles }) => (
  <View style={styles.collapsibleSection}>
    <TouchableOpacity style={styles.collapsibleHeader} onPress={onToggle}>
      <Text style={styles.collapsibleTitle}>{title}</Text>
      <Ionicons 
        name={isExpanded ? "chevron-up" : "chevron-down"} 
        size={20} 
        color={colors.mediumGray} 
      />
    </TouchableOpacity>
    {isExpanded && <View style={styles.collapsibleContent}>{children}</View>}
  </View>
);

// Helper component for info tooltips
const InfoTooltip: React.FC<{ text: string; colors: any }> = ({ text, colors }) => (
  <TouchableOpacity style={{ marginLeft: 8 }}>
    <Ionicons name="information-circle-outline" size={16} color={colors.mediumGray} />
  </TouchableOpacity>
);

// Helper component for status badges
const StatusBadge: React.FC<{ 
  status: 'enabled' | 'disabled' | 'available' | 'platform-disabled' | 'error';
  colors: any;
}> = ({ status, colors }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'enabled':
        return { color: '#34C759', text: 'Active' };
      case 'disabled':
        return { color: colors.mediumGray, text: 'Disabled' };
      case 'available':
        return { color: colors.primary, text: 'Available' };
      case 'platform-disabled':
        return { color: '#FF9500', text: 'Platform Disabled' };
      case 'error':
        return { color: '#FF3B30', text: 'Error' };
      default:
        return { color: colors.mediumGray, text: 'Unknown' };
    }
  };

  const config = getStatusConfig();
  
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 9999,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: config.color,
      gap: 6,
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: config.color }} />
      <Text style={{ color: config.color, fontSize: 11, fontWeight: '600' }}>{config.text}</Text>
    </View>
  );
};

const PluginsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { settings, updateSetting } = useSettings();
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const styles = createStyles(colors);
  
  // Core state
  const [repositoryUrl, setRepositoryUrl] = useState(settings.scraperRepositoryUrl);
  const [installedScrapers, setInstalledScrapers] = useState<ScraperInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRepository, setHasRepository] = useState(false);
  const [showboxCookie, setShowboxCookie] = useState<string>('');
  const [showboxRegion, setShowboxRegion] = useState<string>('');
  
  // Multiple repositories state
  const [repositories, setRepositories] = useState<RepositoryInfo[]>([]);
  const [currentRepositoryId, setCurrentRepositoryId] = useState<string>('');
  const [showAddRepositoryModal, setShowAddRepositoryModal] = useState(false);
  const [newRepositoryUrl, setNewRepositoryUrl] = useState('');
  const [switchingRepository, setSwitchingRepository] = useState<string | null>(null);
  
  // New UX state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [expandedSections, setExpandedSections] = useState({
    repository: true,
    scrapers: true,
    settings: false,
    quality: false,
  });
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showRepositoryModal, setShowRepositoryModal] = useState(false);
  const [showScraperDetails, setShowScraperDetails] = useState<string | null>(null);
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

  // Filtered scrapers based on search and filter
  const filteredScrapers = useMemo(() => {
    let filtered = installedScrapers;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(scraper => 
        scraper.name.toLowerCase().includes(query) ||
        scraper.description.toLowerCase().includes(query) ||
        scraper.id.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(scraper => 
        scraper.supportedTypes?.includes(selectedFilter as 'movie' | 'tv')
      );
    }

    return filtered;
  }, [installedScrapers, searchQuery, selectedFilter]);

  // Helper functions
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getScraperStatus = (scraper: ScraperInfo): 'enabled' | 'disabled' | 'available' | 'platform-disabled' | 'error' => {
    if (scraper.manifestEnabled === false) return 'disabled';
    if (scraper.disabledPlatforms?.includes(Platform.OS as 'ios' | 'android')) return 'platform-disabled';
    if (scraper.enabled) return 'enabled';
    return 'available';
  };

  const handleBulkToggle = async (enabled: boolean) => {
    try {
      setIsRefreshing(true);
      const promises = filteredScrapers.map(scraper => 
        localScraperService.setScraperEnabled(scraper.id, enabled)
      );
      await Promise.all(promises);
      await loadScrapers();
      Alert.alert('Success', `${enabled ? 'Enabled' : 'Disabled'} ${filteredScrapers.length} scrapers`);
    } catch (error) {
      logger.error('[ScraperSettings] Failed to bulk toggle:', error);
      Alert.alert('Error', 'Failed to update scrapers');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUrlChange = (url: string) => {
    setNewRepositoryUrl(url);
  };

  const handleAddRepository = async () => {
    if (!newRepositoryUrl.trim()) {
      Alert.alert('Error', 'Please enter a valid repository URL');
      return;
    }

    // Validate URL format
    const url = newRepositoryUrl.trim();
    if (!url.startsWith('https://raw.githubusercontent.com/') && !url.startsWith('http://')) {
      Alert.alert(
        'Invalid URL Format',
        'Please use a valid GitHub raw URL format:\n\nhttps://raw.githubusercontent.com/username/repo/refs/heads/branch\n\nor include manifest.json:\nhttps://raw.githubusercontent.com/username/repo/refs/heads/branch/manifest.json\n\nExample:\nhttps://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/master'
      );
      return;
    }

    // Check if URL already includes manifest.json
    const isManifestUrl = url.includes('/manifest.json');

    // Normalize URL - if it's a manifest URL, extract the base repository URL
    let normalizedUrl = url;
    if (isManifestUrl) {
      normalizedUrl = url.replace('/manifest.json', '');
      logger.log('[PluginsScreen] Detected manifest URL, extracting base repository URL:', normalizedUrl);
    }

    // Additional validation for normalized URL
    if (!normalizedUrl.endsWith('/refs/heads/') && !normalizedUrl.includes('/refs/heads/')) {
      Alert.alert(
        'Invalid Repository Structure',
        'The URL should point to a GitHub repository branch.\n\nExpected format:\nhttps://raw.githubusercontent.com/username/repo/refs/heads/branch'
      );
      return;
    }

    try {
      setIsLoading(true);
      const repoId = await localScraperService.addRepository({
        name: '', // Let the service fetch from manifest
        url: normalizedUrl, // Use normalized URL (without manifest.json)
        description: '',
        enabled: true
      });
      
      await loadRepositories();
      
      // Switch to the new repository and refresh it
      await localScraperService.setCurrentRepository(repoId);
      await loadRepositories();
      await loadScrapers();
      
      setNewRepositoryUrl('');
      setShowAddRepositoryModal(false);
      Alert.alert('Success', 'Repository added and refreshed successfully');
    } catch (error) {
      logger.error('[PluginsScreen] Failed to add repository:', error);
      Alert.alert('Error', 'Failed to add repository');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchRepository = async (repoId: string) => {
    try {
      setSwitchingRepository(repoId);
      await localScraperService.setCurrentRepository(repoId);
      await loadRepositories();
      await loadScrapers();
      Alert.alert('Success', 'Repository switched successfully');
    } catch (error) {
      logger.error('[ScraperSettings] Failed to switch repository:', error);
      Alert.alert('Error', 'Failed to switch repository');
    } finally {
      setSwitchingRepository(null);
    }
  };

  const handleRemoveRepository = async (repoId: string) => {
    const repo = repositories.find(r => r.id === repoId);
    if (!repo) return;

    // Special handling for the last repository
    const isLastRepository = repositories.length === 1;
    
    const alertTitle = isLastRepository ? 'Remove Last Repository' : 'Remove Repository';
    const alertMessage = isLastRepository 
      ? `Are you sure you want to remove "${repo.name}"? This is your only repository, so you'll have no scrapers available until you add a new repository.`
      : `Are you sure you want to remove "${repo.name}"? This will also remove all scrapers from this repository.`;

    Alert.alert(
      alertTitle,
      alertMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await localScraperService.removeRepository(repoId);
              await loadRepositories();
              await loadScrapers();
              const successMessage = isLastRepository 
                ? 'Repository removed successfully. You can add a new repository using the "Add Repository" button.'
                : 'Repository removed successfully';
              Alert.alert('Success', successMessage);
            } catch (error) {
              logger.error('[ScraperSettings] Failed to remove repository:', error);
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to remove repository');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadScrapers();
    loadRepositories();
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

  const loadRepositories = async () => {
    try {
      // First refresh repository names from manifests for existing repositories
      await localScraperService.refreshRepositoryNamesFromManifests();
      
      const repos = await localScraperService.getRepositories();
      setRepositories(repos);
      setHasRepository(repos.length > 0);
      
      const currentRepoId = localScraperService.getCurrentRepositoryId();
      setCurrentRepositoryId(currentRepoId);
      
      const currentRepo = repos.find(r => r.id === currentRepoId);
      if (currentRepo) {
        setRepositoryUrl(currentRepo.url);
      }
    } catch (error) {
      logger.error('[ScraperSettings] Failed to load repositories:', error);
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
        'Please use a valid GitHub raw URL format:\n\nhttps://raw.githubusercontent.com/username/repo/refs/heads/branch\n\nExample:\nhttps://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/master'
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
      logger.log('[PluginsScreen] Starting hard refresh of repository...');

      // Force a complete hard refresh by clearing any cached data first
      await localScraperService.refreshRepository();

      // Load fresh scrapers from the updated repository
      await loadScrapers();

      Alert.alert('Success', 'Repository refreshed successfully with latest files');
    } catch (error) {
      logger.error('[PluginsScreen] Failed to refresh repository:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert(
        'Repository Error',
        `Failed to refresh repository: ${errorMessage}\n\nPlease ensure your URL is correct and follows this format:\nhttps://raw.githubusercontent.com/username/repo/refs/heads/branch`
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
    const defaultUrl = 'https://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main';
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
          <Text style={styles.backText}>Settings</Text>
        </TouchableOpacity>
        
        <View style={styles.headerActions}>
          {/* Help Button */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowHelpModal(true)}
          >
            <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      
      <Text style={styles.headerTitle}>Plugins</Text>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={async () => {
              try {
                setIsRefreshing(true);
                logger.log('[PluginsScreen] Pull-to-refresh: Starting hard refresh...');

                // Force hard refresh of repository
                await localScraperService.refreshRepository();
                await loadScrapers();

                logger.log('[PluginsScreen] Pull-to-refresh completed');
              } catch (error) {
                logger.error('[PluginsScreen] Pull-to-refresh failed:', error);
              } finally {
                setIsRefreshing(false);
              }
            }}
          />
        }
      >
        {/* Quick Setup banner removed */}

        {/* Enable Local Scrapers */}
        <CollapsibleSection
          title="Enable Local Scrapers"
          isExpanded={expandedSections.repository}
          onToggle={() => toggleSection('repository')}
          colors={colors}
          styles={styles}
        >
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
        </CollapsibleSection>

        {/* Repository Configuration */}
        <CollapsibleSection
          title="Repository Configuration"
          isExpanded={expandedSections.repository}
          onToggle={() => toggleSection('repository')}
          colors={colors}
          styles={styles}
        >
          <Text style={styles.sectionDescription}>
            Manage multiple scraper repositories. Switch between repositories to access different sets of scrapers.
          </Text>
          
          {/* Current Repository */}
          {currentRepositoryId && (
            <View style={styles.currentRepoContainer}>
              <Text style={styles.currentRepoLabel}>Current Repository:</Text>
              <Text style={styles.currentRepoUrl}>{localScraperService.getRepositoryName()}</Text>
              <Text style={[styles.currentRepoUrl, { fontSize: 12, opacity: 0.7, marginTop: 4 }]}>{repositoryUrl}</Text>
            </View>
          )}
          
          {/* Repository List */}
          {repositories.length > 0 && (
            <View style={styles.repositoriesList}>
              <Text style={[styles.settingTitle, { marginBottom: 12 }]}>Available Repositories</Text>
              {repositories.map((repo) => (
                <View key={repo.id} style={styles.repositoryItem}>
                  <View style={styles.repositoryInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={styles.repositoryName}>{repo.name}</Text>
                      {repo.id === currentRepositoryId && (
                        <View style={[styles.statusBadge, { backgroundColor: '#34C759' }]}>
                          <Ionicons name="checkmark-circle" size={12} color="white" />
                          <Text style={styles.statusBadgeText}>Active</Text>
                        </View>
                      )}
                      {switchingRepository === repo.id && (
                        <View style={[styles.statusBadge, { backgroundColor: colors.primary }]}>
                          <ActivityIndicator size={12} color="white" />
                          <Text style={styles.statusBadgeText}>Switching...</Text>
                        </View>
                      )}
                    </View>
                    {repo.description && (
                      <Text style={styles.repositoryDescription}>{repo.description}</Text>
                    )}
                    <Text style={styles.repositoryUrl}>{repo.url}</Text>
                    <Text style={styles.repositoryMeta}>
                      {repo.scraperCount || 0} scrapers • Last updated: {repo.lastUpdated ? new Date(repo.lastUpdated).toLocaleDateString() : 'Never'}
            </Text>
          </View>
                  <View style={styles.repositoryActions}>
                    {repo.id !== currentRepositoryId && (
                      <TouchableOpacity
                        style={[styles.repositoryActionButton, styles.repositoryActionButtonPrimary]}
                        onPress={() => handleSwitchRepository(repo.id)}
                        disabled={switchingRepository === repo.id}
                      >
                        {switchingRepository === repo.id ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={styles.repositoryActionButtonText}>Switch</Text>
                        )}
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.repositoryActionButton, styles.repositoryActionButtonSecondary]}
                      onPress={() => handleRefreshRepository()}
                      disabled={isRefreshing || switchingRepository !== null}
                    >
                      {isRefreshing ? (
                        <ActivityIndicator size="small" color={colors.mediumGray} />
                      ) : (
                        <Text style={styles.repositoryActionButtonText}>Refresh</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.repositoryActionButton, styles.repositoryActionButtonDanger]}
                      onPress={() => handleRemoveRepository(repo.id)}
                      disabled={switchingRepository !== null}
                    >
                      <Text style={styles.repositoryActionButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
        </View>
              ))}
            </View>
          )}

          {/* Add Official Repository Button */}
          {!localScraperService.hasTapframeRepository() && (
            <TouchableOpacity
              style={[styles.defaultRepoButton]}
              onPress={async () => {
                try {
                  setIsLoading(true);
                  const tapframeInfo = localScraperService.getTapframeRepositoryInfo();
                  const repoId = await localScraperService.addRepository(tapframeInfo);
                  await loadRepositories();
                  Alert.alert('Success', 'Official repository added successfully!');
                } catch (error) {
                  logger.error('[PluginsScreen] Failed to add tapframe repository:', error);
                  Alert.alert('Error', 'Failed to add official repository');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={!settings.enableLocalScrapers || isLoading}
            >
              <Ionicons name="add-circle" size={16} color={colors.primary} />
              <Text style={styles.defaultRepoButtonText}>Add Official Repository</Text>
            </TouchableOpacity>
          )}

          {/* Add Repository Button */}
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, { marginTop: 16 }]}
            onPress={() => setShowAddRepositoryModal(true)}
            disabled={!settings.enableLocalScrapers || switchingRepository !== null}
          >
            <Text style={styles.buttonText}>Add New Repository</Text>
          </TouchableOpacity>
        </CollapsibleSection>

        {/* Available Scrapers */}
        <CollapsibleSection
          title={`Available Scrapers (${filteredScrapers.length})`}
          isExpanded={expandedSections.scrapers}
          onToggle={() => toggleSection('scrapers')}
          colors={colors}
          styles={styles}
        >
          {installedScrapers.length > 0 && (
            <>
              {/* Search and Filter */}
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={colors.mediumGray} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search scrapers..."
                  placeholderTextColor={colors.mediumGray}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color={colors.mediumGray} />
              </TouchableOpacity>
            )}
          </View>

              {/* Filter Chips */}
              <View style={styles.filterContainer}>
                {['all', 'movie', 'tv'].map((filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={[
                      styles.filterChip,
                      selectedFilter === filter && styles.filterChipSelected
                    ]}
                    onPress={() => setSelectedFilter(filter as any)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      selectedFilter === filter && styles.filterChipTextSelected
                    ]}>
                      {filter === 'all' ? 'All' : filter === 'movie' ? 'Movies' : 'TV Shows'}
          </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Bulk Actions */}
              {filteredScrapers.length > 0 && (
                <View style={styles.bulkActionsContainer}>
                  <TouchableOpacity
                    style={[styles.bulkActionButton, styles.bulkActionButtonEnabled]}
                    onPress={() => handleBulkToggle(true)}
                    disabled={isRefreshing}
                  >
                    <Text style={[styles.bulkActionButtonText, { color: '#34C759' }]}>Enable All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bulkActionButton, styles.bulkActionButtonDisabled]}
                    onPress={() => handleBulkToggle(false)}
                    disabled={isRefreshing}
                  >
                    <Text style={[styles.bulkActionButtonText, { color: colors.mediumGray }]}>Disable All</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {filteredScrapers.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons 
                name={searchQuery ? "search" : "download-outline"} 
                size={48} 
                color={colors.mediumGray}
                style={styles.emptyStateIcon}
              />
              <Text style={styles.emptyStateTitle}>
                {searchQuery ? 'No Scrapers Found' : 'No Scrapers Available'}
               </Text>
              <Text style={styles.emptyStateDescription}>
                {searchQuery 
                  ? `No scrapers match "${searchQuery}". Try a different search term.`
                  : 'Configure a repository above to view available scrapers.'
                }
              </Text>
              {searchQuery && (
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={() => setSearchQuery('')}
                >
                  <Text style={styles.secondaryButtonText}>Clear Search</Text>
                </TouchableOpacity>
              )}
             </View>
           ) : (
             <View style={styles.scrapersContainer}>
              {filteredScrapers.map((scraper) => (
                <View key={scraper.id} style={styles.scraperCard}>
                  <View style={styles.scraperCardHeader}>
                        {scraper.logo ? (
                          <Image
                            source={{ uri: scraper.logo }}
                            style={styles.scraperLogo}
                            contentFit="contain"
                          />
                        ) : (
                      <View style={styles.scraperLogo} />
                    )}
                    <View style={styles.scraperCardInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                        <Text style={styles.scraperName}>{scraper.name}</Text>
                        <StatusBadge status={getScraperStatus(scraper)} colors={colors} />
                               </View>
                      <Text style={styles.scraperDescription}>{scraper.description}</Text>
                        </View>
                        <Switch
                              value={scraper.enabled && settings.enableLocalScrapers}
                              onValueChange={(enabled) => handleToggleScraper(scraper.id, enabled)}
                              trackColor={{ false: colors.elevation3, true: colors.primary }}
                              thumbColor={scraper.enabled && settings.enableLocalScrapers ? colors.white : '#f4f3f4'}
                              disabled={!settings.enableLocalScrapers || scraper.manifestEnabled === false || (scraper.disabledPlatforms && scraper.disabledPlatforms.includes(Platform.OS as 'ios' | 'android'))}
                            />
                      </View>
                  
                  <View style={styles.scraperCardMeta}>
                    <View style={styles.scraperCardMetaItem}>
                      <Ionicons name="information-circle" size={12} color={colors.mediumGray} />
                      <Text style={styles.scraperCardMetaText}>v{scraper.version}</Text>
                    </View>
                    <View style={styles.scraperCardMetaItem}>
                      <Ionicons name="film" size={12} color={colors.mediumGray} />
                      <Text style={styles.scraperCardMetaText}>
                        {scraper.supportedTypes?.join(', ') || 'Unknown'}
                      </Text>
                    </View>
                    {scraper.contentLanguage && scraper.contentLanguage.length > 0 && (
                      <View style={styles.scraperCardMetaItem}>
                        <Ionicons name="globe" size={12} color={colors.mediumGray} />
                        <Text style={styles.scraperCardMetaText}>
                          {scraper.contentLanguage.map(lang => lang.toUpperCase()).join(', ')}
                        </Text>
                      </View>
                    )}
                    {scraper.supportsExternalPlayer === false && (
                      <View style={styles.scraperCardMetaItem}>
                        <Ionicons name="play-circle" size={12} color={colors.mediumGray} />
                        <Text style={styles.scraperCardMetaText}>
                          No external player
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* ShowBox Settings */}
                       {scraper.id === 'showboxog' && settings.enableLocalScrapers && (
                    <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.elevation3 }}>
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
              ))}
             </View>
           )}
        </CollapsibleSection>

        {/* Additional Settings */}
        <CollapsibleSection
          title="Additional Settings"
          isExpanded={expandedSections.settings}
          onToggle={() => toggleSection('settings')}
          colors={colors}
          styles={styles}
        >
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Enable URL Validation</Text>
              <Text style={styles.settingDescription}>
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
              <Text style={styles.settingTitle}>Group Plugin Streams</Text>
              <Text style={styles.settingDescription}>
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
              <Text style={styles.settingTitle}>Sort by Quality First</Text>
              <Text style={styles.settingDescription}>
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
              <Text style={styles.settingTitle}>Show Scraper Logos</Text>
              <Text style={styles.settingDescription}>
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
        </CollapsibleSection>

        {/* Quality Filtering */}
        <CollapsibleSection
          title="Quality Filtering"
          isExpanded={expandedSections.quality}
          onToggle={() => toggleSection('quality')}
          colors={colors}
          styles={styles}
        >
          <Text style={styles.sectionDescription}>
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
              Excluded qualities: {(settings.excludedQualities || []).join(', ')}
            </Text>
          )}
        </CollapsibleSection>

        {/* About */}
        <View style={[styles.section, styles.lastSection]}>
          <Text style={styles.sectionTitle}>About Plugins</Text>
          <Text style={styles.infoText}>
            Plugins are JavaScript modules that can search for streaming links from various sources. 
            They run locally on your device and can be installed from trusted repositories.
          </Text>
        </View>
      </ScrollView>

      {/* Help Modal */}
      <Modal
        visible={showHelpModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHelpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Getting Started with Plugins</Text>
            <Text style={styles.modalText}>
              1. <Text style={{ fontWeight: '600' }}>Enable Local Scrapers</Text> - Turn on the main switch to allow plugins
            </Text>
            <Text style={styles.modalText}>
              2. <Text style={{ fontWeight: '600' }}>Add Repository</Text> - Add a GitHub raw URL or use the default repository
            </Text>
            <Text style={styles.modalText}>
              3. <Text style={{ fontWeight: '600' }}>Refresh Repository</Text> - Download available scrapers from the repository
            </Text>
            <Text style={styles.modalText}>
              4. <Text style={{ fontWeight: '600' }}>Enable Scrapers</Text> - Turn on the scrapers you want to use for streaming
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowHelpModal(false)}
            >
              <Text style={styles.modalButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Repository Modal */}
      <Modal
        visible={showAddRepositoryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddRepositoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Ionicons name="add-circle" size={20} color={colors.primary} />
                <Text style={styles.modalTitle}>Add Repository</Text>
              </View>

              <TextInput
                style={styles.compactTextInput}
                value={newRepositoryUrl}
                onChangeText={handleUrlChange}
                placeholder="Repository URL"
                placeholderTextColor={colors.mediumGray}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                multiline={false}
                numberOfLines={1}
              />

            {/* Quick Example */}
            <View style={styles.compactExamples}>
              <TouchableOpacity
                style={styles.quickButton}
                onPress={() => setNewRepositoryUrl('https://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main')}
              >
                <Ionicons name="star" size={14} color={colors.primary} />
                <Text style={styles.quickButtonText}>Official</Text>
              </TouchableOpacity>
            </View>

            {/* Format Hint */}
            <Text style={styles.formatHint}>
              Format: https://raw.githubusercontent.com/username/repo/refs/heads/branch
            </Text>

            {/* Action Buttons */}
            <View style={styles.compactActions}>
              <TouchableOpacity
                style={[styles.compactButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddRepositoryModal(false);
                  setNewRepositoryUrl('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.compactButton, styles.addButton, (!newRepositoryUrl.trim() || isLoading) && styles.disabledButton]}
                onPress={handleAddRepository}
                disabled={!newRepositoryUrl.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.addButtonText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default PluginsScreen;