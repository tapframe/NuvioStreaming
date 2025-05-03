import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  SafeAreaView,
  Image,
  Alert,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TMDBService } from '../services/tmdbService';
import { logger } from '../utils/logger';
import { useTheme } from '../contexts/ThemeContext';

// TMDB API key - since the default key might be private in the service, we'll use our own
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';

// Define example shows with their IMDB IDs and TMDB IDs
const EXAMPLE_SHOWS = [
  { 
    name: 'Breaking Bad', 
    imdbId: 'tt0903747', 
    tmdbId: '1396',
    type: 'tv' as const
  },
  { 
    name: 'Friends', 
    imdbId: 'tt0108778', 
    tmdbId: '1668',
    type: 'tv' as const
  },
  { 
    name: 'Game of Thrones', 
    imdbId: 'tt0944947', 
    tmdbId: '1399',
    type: 'tv' as const
  },
  { 
    name: 'Stranger Things', 
    imdbId: 'tt4574334', 
    tmdbId: '66732',
    type: 'tv' as const
  },
  { 
    name: 'Squid Game', 
    imdbId: 'tt10919420', 
    tmdbId: '93405',
    type: 'tv' as const
  },
  { 
    name: 'Avatar', 
    imdbId: 'tt0499549', 
    tmdbId: '19995',
    type: 'movie' as const
  },
  { 
    name: 'The Witcher', 
    imdbId: 'tt5180504', 
    tmdbId: '71912',
    type: 'tv' as const
  }
];

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
    paddingVertical: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 16 : 16,
    backgroundColor: colors.darkBackground,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginLeft: 16,
    color: colors.white,
  },
  headerRight: {
    width: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  descriptionContainer: {
    marginBottom: 16,
  },
  description: {
    color: colors.mediumEmphasis,
    fontSize: 15,
    lineHeight: 22,
  },
  showSelectorContainer: {
    marginBottom: 16,
  },
  selectorLabel: {
    color: colors.highEmphasis,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
  },
  showsScrollContent: {
    paddingRight: 16,
  },
  showItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.elevation2,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  selectedShowItem: {
    borderColor: colors.primary,
    backgroundColor: colors.elevation3,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  showItemText: {
    color: colors.mediumEmphasis,
    fontSize: 14,
  },
  selectedShowItemText: {
    color: colors.white,
    fontWeight: '600',
  },
  optionsContainer: {
    marginBottom: 16,
    gap: 12,
  },
  optionCard: {
    backgroundColor: colors.elevation2,
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  selectedCard: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    elevation: 3,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  optionTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  optionDescription: {
    color: colors.mediumEmphasis,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  exampleContainer: {
    marginTop: 4,
  },
  exampleLabel: {
    color: colors.mediumEmphasis,
    fontSize: 13,
    marginBottom: 4,
  },
  exampleImage: {
    height: 60,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBox: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  infoText: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    lineHeight: 18,
  },
  logoSourceLabel: {
    color: colors.mediumEmphasis,
    fontSize: 11,
    marginTop: 2,
  },
  languageSelectorContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
  },
  languageSelectorTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  languageSelectorDescription: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  languageSelectorLabel: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    marginBottom: 6,
  },
  languageScrollContent: {
    paddingVertical: 2,
  },
  languageItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.elevation1,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.elevation3,
    marginVertical: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  selectedLanguageItem: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  languageItemText: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    fontWeight: '600',
  },
  selectedLanguageItemText: {
    color: colors.white,
  },
  noteText: {
    color: colors.mediumEmphasis,
    fontSize: 11,
    marginTop: 8,
    fontStyle: 'italic',
  },
  bannerContainer: {
    height: 90,
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  logoOverBanner: {
    position: 'absolute',
    width: '80%',
    height: '75%',
    alignSelf: 'center',
    top: '12.5%',
  },
  noLogoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noLogoText: {
    color: colors.white,
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
});

const LogoSourceSettings = () => {
  const { settings, updateSetting } = useSettings();
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const styles = createStyles(colors);
  
  // Get current preference
  const [logoSource, setLogoSource] = useState<'metahub' | 'tmdb'>(
    settings.logoSourcePreference || 'metahub'
  );
  
  // TMDB Language Preference
  const [selectedTmdbLanguage, setSelectedTmdbLanguage] = useState<string>(
    settings.tmdbLanguagePreference || 'en'
  );
  
  // Make sure logoSource stays in sync with settings
  useEffect(() => {
    setLogoSource(settings.logoSourcePreference || 'metahub');
  }, [settings.logoSourcePreference]);
  
  // Keep selectedTmdbLanguage in sync with settings
  useEffect(() => {
    setSelectedTmdbLanguage(settings.tmdbLanguagePreference || 'en');
  }, [settings.tmdbLanguagePreference]);
  
  // Force reload settings from AsyncStorage when component mounts
  useEffect(() => {
    const loadSettingsFromStorage = async () => {
      try {
        const settingsJson = await AsyncStorage.getItem('app_settings');
        if (settingsJson) {
          const storedSettings = JSON.parse(settingsJson);
          
          // Update local state to match stored settings
          if (storedSettings.logoSourcePreference) {
            setLogoSource(storedSettings.logoSourcePreference);
          }
          
          if (storedSettings.tmdbLanguagePreference) {
            setSelectedTmdbLanguage(storedSettings.tmdbLanguagePreference);
          }
          
          logger.log('[LogoSourceSettings] Successfully loaded settings from AsyncStorage');
        }
      } catch (error) {
        logger.error('[LogoSourceSettings] Error loading settings from AsyncStorage:', error);
      }
    };
    
    loadSettingsFromStorage();
  }, []);
  
  // Selected example show
  const [selectedShow, setSelectedShow] = useState(EXAMPLE_SHOWS[0]);
  
  // Add state for example logos and banners
  const [tmdbLogo, setTmdbLogo] = useState<string | null>(null);
  const [metahubLogo, setMetahubLogo] = useState<string | null>(null);
  const [tmdbBanner, setTmdbBanner] = useState<string | null>(null);
  const [metahubBanner, setMetahubBanner] = useState<string | null>(null);
  const [loadingLogos, setLoadingLogos] = useState(true);
  
  // State for TMDB language selection
  // Store unique language codes as strings
  const [uniqueTmdbLanguages, setUniqueTmdbLanguages] = useState<string[]>([]); 
  const [tmdbLogosData, setTmdbLogosData] = useState<Array<{ iso_639_1: string; file_path: string }> | null>(null);

  // Load example logos for selected show
  useEffect(() => {
    fetchExampleLogos(selectedShow);
  }, [selectedShow]);

  // Function to fetch logos and banners for a specific show
  const fetchExampleLogos = async (show: typeof EXAMPLE_SHOWS[0]) => {
    setLoadingLogos(true);
    setTmdbLogo(null);
    setMetahubLogo(null);
    setTmdbBanner(null);
    setMetahubBanner(null);
    // Reset unique languages and logos data
    setUniqueTmdbLanguages([]); 
    setTmdbLogosData(null);
    
    try {
      const tmdbService = TMDBService.getInstance();
      const imdbId = show.imdbId;
      const tmdbId = show.tmdbId;
      const contentType = show.type;
      
      logger.log(`[LogoSourceSettings] Fetching ${show.name} with TMDB ID: ${tmdbId}, IMDB ID: ${imdbId}`);
      
      // Get TMDB logo and banner
      try {
        const apiKey = TMDB_API_KEY;
        const endpoint = contentType === 'tv' ? 'tv' : 'movie';
        const response = await fetch(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}/images?api_key=${apiKey}`);
        const imagesData = await response.json();
        
        // Store all TMDB logos data and extract unique languages
        if (imagesData.logos && imagesData.logos.length > 0) {
          setTmdbLogosData(imagesData.logos);
          
          // Filter for logos with valid language codes and get unique codes
          const validLogoLanguages = imagesData.logos
            .map((logo: { iso_639_1: string | null }) => logo.iso_639_1)
            .filter((lang: string | null): lang is string => lang !== null && typeof lang === 'string');
            
            // Explicitly type the Set and resulting array
            const uniqueCodes: string[] = [...new Set<string>(validLogoLanguages)];
            setUniqueTmdbLanguages(uniqueCodes);
            
            // Find initial logo (prefer selectedTmdbLanguage, then 'en')
            let initialLogoPath: string | null = null;
            let initialLanguage = selectedTmdbLanguage;
            
            // First try to find a logo in the user's preferred language
            const preferredLogo = imagesData.logos.find((logo: { iso_639_1: string; file_path: string }) => logo.iso_639_1 === selectedTmdbLanguage);
            
            if (preferredLogo) {
              initialLogoPath = preferredLogo.file_path;
              initialLanguage = selectedTmdbLanguage;
              logger.log(`[LogoSourceSettings] Found initial ${selectedTmdbLanguage} TMDB logo for ${show.name}`);
            } else {
              // Fallback to English logo
              const englishLogo = imagesData.logos.find((logo: { iso_639_1: string; file_path: string }) => logo.iso_639_1 === 'en');
              
              if (englishLogo) {
                initialLogoPath = englishLogo.file_path;
                initialLanguage = 'en';
                logger.log(`[LogoSourceSettings] Found initial English TMDB logo for ${show.name}`);
              } else if (imagesData.logos[0]) {
                // Fallback to the first available logo
                initialLogoPath = imagesData.logos[0].file_path;
                initialLanguage = imagesData.logos[0].iso_639_1;
                logger.log(`[LogoSourceSettings] No English logo, using first available (${initialLanguage}) TMDB logo for ${show.name}`);
              }
            }
            
            if (initialLogoPath) {
              setTmdbLogo(`https://image.tmdb.org/t/p/original${initialLogoPath}`);
              setSelectedTmdbLanguage(initialLanguage); // Set selected language based on found logo
            } else {
               logger.warn(`[LogoSourceSettings] No valid initial TMDB logo found for ${show.name}`);
            }
          } else {
            logger.warn(`[LogoSourceSettings] No TMDB logos found in response for ${show.name}`);
            setUniqueTmdbLanguages([]); // Ensure it's empty if no logos
          }
          
          // Get TMDB banner (backdrop)
          if (imagesData.backdrops && imagesData.backdrops.length > 0) {
            const backdropPath = imagesData.backdrops[0].file_path;
            const tmdbBannerUrl = `https://image.tmdb.org/t/p/original${backdropPath}`;
            setTmdbBanner(tmdbBannerUrl);
            logger.log(`[LogoSourceSettings] Got ${show.name} TMDB banner: ${tmdbBannerUrl}`);
          } else {
            // Try to get backdrop from details
            const detailsResponse = await fetch(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}`);
            const details = await detailsResponse.json();
            
            if (details.backdrop_path) {
              const tmdbBannerUrl = `https://image.tmdb.org/t/p/original${details.backdrop_path}`;
              setTmdbBanner(tmdbBannerUrl);
              logger.log(`[LogoSourceSettings] Got ${show.name} TMDB banner from details: ${tmdbBannerUrl}`);
            }
          }
        } catch (tmdbError) {
          logger.error(`[LogoSourceSettings] Error fetching TMDB images:`, tmdbError);
        }
        
        // Get Metahub logo and banner
        try {
          // Metahub logo
          const metahubLogoUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
          const logoResponse = await fetch(metahubLogoUrl, { method: 'HEAD' });
          
          if (logoResponse.ok) {
            setMetahubLogo(metahubLogoUrl);
            logger.log(`[LogoSourceSettings] Got ${show.name} Metahub logo: ${metahubLogoUrl}`);
          }
          
          // Metahub banner
          const metahubBannerUrl = `https://images.metahub.space/background/medium/${imdbId}/img`;
          const bannerResponse = await fetch(metahubBannerUrl, { method: 'HEAD' });
          
          if (bannerResponse.ok) {
            setMetahubBanner(metahubBannerUrl);
            logger.log(`[LogoSourceSettings] Got ${show.name} Metahub banner: ${metahubBannerUrl}`);
          } else if (tmdbBanner) {
            // If Metahub banner doesn't exist, use TMDB banner
            setMetahubBanner(tmdbBanner);
          }
        } catch (metahubErr) {
          logger.error(`[LogoSourceSettings] Error checking Metahub images:`, metahubErr);
        }
      } catch (err) {
        logger.error(`[LogoSourceSettings] Error fetching ${show.name} logos:`, err);
      } finally {
        setLoadingLogos(false);
      }
    };

    // Apply logo source setting and show confirmation
    const applyLogoSourceSetting = (source: 'metahub' | 'tmdb') => {
      // Update local state first
      setLogoSource(source);
      
      // Update using the settings hook
      updateSetting('logoSourcePreference', source);
      
      // Also save directly to AsyncStorage for extra assurance
      try {
        // Get current settings
        AsyncStorage.getItem('app_settings').then((settingsJson) => {
          if (settingsJson) {
            const currentSettings = JSON.parse(settingsJson);
            // Update the logo source preference
            const updatedSettings = {
              ...currentSettings,
              logoSourcePreference: source
            };
            // Save back to AsyncStorage
            AsyncStorage.setItem('app_settings', JSON.stringify(updatedSettings))
              .then(() => {
                logger.log(`[LogoSourceSettings] Successfully saved logo source preference '${source}' to AsyncStorage`);
              })
              .catch((error) => {
                logger.error(`[LogoSourceSettings] Error saving logo source preference to AsyncStorage:`, error);
              });
          }
        }).catch((error) => {
          logger.error(`[LogoSourceSettings] Error getting current settings:`, error);
        });
        
        // Clear any cached logo data
        AsyncStorage.removeItem('_last_logos_');
      } catch (e) {
        logger.error(`[LogoSourceSettings] Error in applyLogoSourceSetting:`, e);
      }
      
      // Show confirmation alert
      Alert.alert(
        'Settings Updated',
        `Logo and background source preference set to ${source === 'metahub' ? 'Metahub' : 'TMDB'}. Changes will apply when you navigate to content.`,
        [{ text: 'OK' }]
      );
    };
    
    // Handle TMDB language selection
    const handleTmdbLanguageSelect = (languageCode: string) => {
      // First set local state for immediate UI updates
      setSelectedTmdbLanguage(languageCode);
      
      // Update the preview logo if possible
      if (tmdbLogosData) {
        const selectedLogoData = tmdbLogosData.find(logo => logo.iso_639_1 === languageCode);
        if (selectedLogoData) {
          setTmdbLogo(`https://image.tmdb.org/t/p/original${selectedLogoData.file_path}`);
          logger.log(`[LogoSourceSettings] Switched TMDB logo preview to language: ${languageCode}`);
        } else {
          logger.warn(`[LogoSourceSettings] Could not find logo data for selected language: ${languageCode}`);
        }
      }
      
      // Then persist the setting globally
      saveLanguagePreference(languageCode);
    };
    
    // Save language preference with proper persistence
    const saveLanguagePreference = async (languageCode: string) => {
      logger.log(`[LogoSourceSettings] Saving TMDB language preference: ${languageCode}`);
      
      try {
        // First use the settings hook to update the setting - this is crucial
        updateSetting('tmdbLanguagePreference', languageCode);
        
        // For extra assurance, also save directly to AsyncStorage
        // Get current settings from AsyncStorage
        const settingsJson = await AsyncStorage.getItem('app_settings');
        
        if (settingsJson) {
          const currentSettings = JSON.parse(settingsJson);
          
          // Update the language preference
          const updatedSettings = {
            ...currentSettings,
            tmdbLanguagePreference: languageCode
          };
          
          // Save back to AsyncStorage using await to ensure it completes
          await AsyncStorage.setItem('app_settings', JSON.stringify(updatedSettings));
          logger.log(`[LogoSourceSettings] Successfully saved TMDB language preference '${languageCode}' to AsyncStorage`);
        } else {
          // If no settings exist yet, create new settings object with this preference
          const newSettings = {
            ...DEFAULT_SETTINGS,
            tmdbLanguagePreference: languageCode
          };
          
          // Save to AsyncStorage
          await AsyncStorage.setItem('app_settings', JSON.stringify(newSettings));
          logger.log(`[LogoSourceSettings] Created new settings with TMDB language preference '${languageCode}'`);
        }
        
        // Clear any cached logo data
        await AsyncStorage.removeItem('_last_logos_');
        
        // Show confirmation toast or feedback
        Alert.alert(
          'TMDB Language Updated',
          `TMDB logo language preference set to ${languageCode.toUpperCase()}. Changes will apply when you navigate to content.`,
          [{ text: 'OK' }]
        );
      } catch (e) {
        logger.error(`[LogoSourceSettings] Error in saveLanguagePreference:`, e);
        
        // Show error notification
        Alert.alert(
          'Error Saving Preference',
          'There was a problem saving your language preference. Please try again.',
          [{ text: 'OK' }]
        );
      }
    };
    
    // Save selected show to AsyncStorage to persist across navigation
    const saveSelectedShow = async (show: typeof EXAMPLE_SHOWS[0]) => {
      try {
        await AsyncStorage.setItem('logo_settings_selected_show', show.imdbId);
      } catch (e) {
        console.error('Error saving selected show:', e);
      }
    };
    
    // Load selected show from AsyncStorage on mount
    useEffect(() => {
      const loadSelectedShow = async () => {
        try {
          const savedShowId = await AsyncStorage.getItem('logo_settings_selected_show');
          if (savedShowId) {
            const foundShow = EXAMPLE_SHOWS.find(show => show.imdbId === savedShowId);
            if (foundShow) {
              setSelectedShow(foundShow);
            }
          }
        } catch (e) {
          console.error('Error loading selected show:', e);
        }
      };
      
      loadSelectedShow();
    }, []);
    
    // Update selected show and save to AsyncStorage
    const handleShowSelect = (show: typeof EXAMPLE_SHOWS[0]) => {
      setSelectedShow(show);
      saveSelectedShow(show);
    };

    // Handle back navigation
    const handleBack = () => {
      navigation.goBack();
    };

    // Render logo example with loading state and background
    const renderLogoExample = (logo: string | null, banner: string | null, isLoading: boolean) => {
      if (isLoading) {
        return (
          <View style={[styles.exampleImage, styles.loadingContainer]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        );
      }
      
      return (
        <View style={styles.bannerContainer}>
          <Image 
            source={{ uri: banner || undefined }}
            style={styles.bannerImage}
            resizeMode="cover"
          />
          <View style={styles.bannerOverlay} />
          {logo && (
            <Image 
              source={{ uri: logo }}
              style={styles.logoOverBanner}
              resizeMode="contain"
            />
          )}
          {!logo && (
            <View style={styles.noLogoContainer}>
              <Text style={styles.noLogoText}>No logo available</Text>
            </View>
          )}
        </View>
      );
    };

    return (
      <SafeAreaView style={[styles.container]}>
        <StatusBar barStyle="light-content" />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Logo Source</Text>
        </View>
        
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          scrollEventThrottle={32}
          decelerationRate="normal"
        >
          {/* Description */}
          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>
              Choose the primary source for content logos and backgrounds. The selected source will be used exclusively.
            </Text>
          </View>
          
          {/* Show selector */}
          <View style={styles.showSelectorContainer}>
            <Text style={styles.selectorLabel}>Select a show/movie to preview:</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.showsScrollContent}
              scrollEventThrottle={32}
              decelerationRate="normal"
            >
              {EXAMPLE_SHOWS.map((show) => (
                <TouchableOpacity
                  key={show.imdbId}
                  style={[
                    styles.showItem,
                    selectedShow.imdbId === show.imdbId && styles.selectedShowItem
                  ]}
                  onPress={() => handleShowSelect(show)}
                  activeOpacity={0.7}
                  delayPressIn={100}
                >
                  <Text 
                    style={[
                      styles.showItemText,
                      selectedShow.imdbId === show.imdbId && styles.selectedShowItemText
                    ]}
                  >
                    {show.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          
          {/* Options */}
          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={[
                styles.optionCard,
                logoSource === 'metahub' && styles.selectedCard
              ]}
              onPress={() => applyLogoSourceSetting('metahub')}
              activeOpacity={0.7}
              delayPressIn={100}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionTitle}>Metahub</Text>
                {logoSource === 'metahub' && (
                  <MaterialIcons name="check-circle" size={24} color={colors.primary} />
                )}
              </View>
              
              <Text style={styles.optionDescription}>
                High-quality logos from Metahub. Best for popular titles.
              </Text>
              
              <View style={styles.exampleContainer}>
                <Text style={styles.exampleLabel}>Example:</Text>
                {renderLogoExample(metahubLogo, metahubBanner, loadingLogos)}
                <Text style={styles.logoSourceLabel}>{selectedShow.name} logo from Metahub</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.optionCard,
                logoSource === 'tmdb' && styles.selectedCard
              ]}
              onPress={() => applyLogoSourceSetting('tmdb')}
              activeOpacity={0.7}
              delayPressIn={100}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionTitle}>TMDB</Text>
                {logoSource === 'tmdb' && (
                  <MaterialIcons name="check-circle" size={24} color={colors.primary} />
                )}
              </View>
              
              <Text style={styles.optionDescription}>
                Logos from TMDB. Offers localized options and better coverage for recent content.
              </Text>
              
              <View style={styles.exampleContainer}>
                <Text style={styles.exampleLabel}>Example:</Text>
                {renderLogoExample(tmdbLogo, tmdbBanner, loadingLogos)}
                <Text style={styles.logoSourceLabel}>{selectedShow.name} logo from TMDB</Text>
              </View>
              
              {/* TMDB Language Selector */}
              {uniqueTmdbLanguages.length > 1 && (
                <View style={styles.languageSelectorContainer}>
                  <Text style={styles.languageSelectorTitle}>Logo Language</Text>
                  <Text style={styles.languageSelectorDescription}>
                    Select your preferred language for TMDB logos.
                  </Text>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.languageScrollContent}
                    scrollEventThrottle={32}
                    decelerationRate="normal"
                  >
                    {/* Iterate over unique language codes */}
                    {uniqueTmdbLanguages.map((langCode) => (
                      <TouchableOpacity
                        key={langCode} // Use the unique code as key
                        style={[
                          styles.languageItem,
                          selectedTmdbLanguage === langCode && styles.selectedLanguageItem
                        ]}
                        onPress={() => handleTmdbLanguageSelect(langCode)}
                        activeOpacity={0.7}
                        delayPressIn={150}
                      >
                        <Text 
                          style={[
                            styles.languageItemText,
                            selectedTmdbLanguage === langCode && styles.selectedLanguageItemText
                          ]}
                        >
                          {(langCode || '').toUpperCase() || '??'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.noteText}>
                    If unavailable in preferred language, English will be used as fallback.
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          
          {/* Additional Info */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              The app will use only the selected source for logos and backgrounds. If no image is available from your chosen source, a text fallback will be used.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  };

  export default LogoSourceSettings; 