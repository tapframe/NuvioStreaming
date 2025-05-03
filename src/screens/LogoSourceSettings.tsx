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
import { colors } from '../styles/colors';
import { useSettings } from '../hooks/useSettings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TMDBService } from '../services/tmdbService';
import { logger } from '../utils/logger';

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

const LogoSourceSettings = () => {
  const { settings, updateSetting } = useSettings();
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();
  
  // Get current preference
  const [logoSource, setLogoSource] = useState<'metahub' | 'tmdb'>(
    settings.logoSourcePreference || 'metahub'
  );
  
  // Make sure logoSource stays in sync with settings
  useEffect(() => {
    setLogoSource(settings.logoSourcePreference || 'metahub');
  }, [settings.logoSourcePreference]);
  
  // Selected example show
  const [selectedShow, setSelectedShow] = useState(EXAMPLE_SHOWS[0]);
  
  // Add state for example logos and banners
  const [tmdbLogo, setTmdbLogo] = useState<string | null>(null);
  const [metahubLogo, setMetahubLogo] = useState<string | null>(null);
  const [tmdbBanner, setTmdbBanner] = useState<string | null>(null);
  const [metahubBanner, setMetahubBanner] = useState<string | null>(null);
  const [loadingLogos, setLoadingLogos] = useState(true);

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
    
    try {
      const tmdbService = TMDBService.getInstance();
      const imdbId = show.imdbId;
      const tmdbId = show.tmdbId;
      const contentType = show.type;
      
      logger.log(`[LogoSourceSettings] Fetching ${show.name} with TMDB ID: ${tmdbId}, IMDB ID: ${imdbId}`);
      
      // Get TMDB logo and banner
      try {
        // Manually fetch images from TMDB API
        const apiKey = TMDB_API_KEY;
        const endpoint = contentType === 'tv' ? 'tv' : 'movie';
        const response = await fetch(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}/images?api_key=${apiKey}`);
        const imagesData = await response.json();
        
        // Get TMDB logo
        if (imagesData.logos && imagesData.logos.length > 0) {
          // Look for English logo first
          let logoPath = null;
          
          // First try to find an English logo
          const englishLogo = imagesData.logos.find((logo: { iso_639_1: string; file_path: string }) => 
            logo.iso_639_1 === 'en'
          );
          if (englishLogo) {
            logoPath = englishLogo.file_path;
          } else if (imagesData.logos[0]) {
            // Fallback to the first logo
            logoPath = imagesData.logos[0].file_path;
          }
          
          if (logoPath) {
            const tmdbLogoUrl = `https://image.tmdb.org/t/p/original${logoPath}`;
            setTmdbLogo(tmdbLogoUrl);
            logger.log(`[LogoSourceSettings] Got ${show.name} TMDB logo: ${tmdbLogoUrl}`);
          }
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

  // Apply setting and show confirmation
  const applyLogoSourceSetting = (source: 'metahub' | 'tmdb') => {
    setLogoSource(source);
    updateSetting('logoSourcePreference', source);
    
    // Clear any cached logo data in storage
    try {
      AsyncStorage.removeItem('_last_logos_');
    } catch (e) {
      console.error('Error clearing logo cache:', e);
    }
    
    // Show confirmation alert
    Alert.alert(
      'Settings Updated',
      `Logo and background source preference set to ${source === 'metahub' ? 'Metahub' : 'TMDB'}. Changes will apply when you navigate to content.`,
      [{ text: 'OK' }]
    );
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
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <TouchableOpacity 
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Logo Source</Text>
        <View style={styles.headerRight} />
      </View>
      
      <ScrollView style={styles.scrollView}>
        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>
            Choose the primary source for content logos and background images. This affects the appearance
            of titles in the metadata screen.
          </Text>
        </View>
        
        {/* Show selector */}
        <View style={styles.showSelectorContainer}>
          <Text style={styles.selectorLabel}>Select a show/movie to preview:</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.showsScrollContent}
          >
            {EXAMPLE_SHOWS.map((show) => (
              <TouchableOpacity
                key={show.imdbId}
                style={[
                  styles.showItem,
                  selectedShow.imdbId === show.imdbId && styles.selectedShowItem
                ]}
                onPress={() => handleShowSelect(show)}
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
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>Metahub</Text>
              {logoSource === 'metahub' && (
                <MaterialIcons name="check-circle" size={24} color={colors.primary} />
              )}
            </View>
            
            <Text style={styles.optionDescription}>
              Prioritizes high-quality title logos from the Metahub image repository.
              Offers good coverage for popular titles.
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
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>TMDB</Text>
              {logoSource === 'tmdb' && (
                <MaterialIcons name="check-circle" size={24} color={colors.primary} />
              )}
            </View>
            
            <Text style={styles.optionDescription}>
              Uses logos from The Movie Database. Often includes more localized and newer logos,
              with better coverage for recent content.
            </Text>
            
            <View style={styles.exampleContainer}>
              <Text style={styles.exampleLabel}>Example:</Text>
              {renderLogoExample(tmdbLogo, tmdbBanner, loadingLogos)}
              <Text style={styles.logoSourceLabel}>{selectedShow.name} logo from TMDB</Text>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Additional Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            If a logo is not available from your preferred source, the app will automatically fall back to the other source.
            If no logo is found, the title text will be shown instead.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: colors.elevation2,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  descriptionContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  description: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  showSelectorContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  selectorLabel: {
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
  },
  showsScrollContent: {
    paddingRight: 16,
  },
  showItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.elevation2,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedShowItem: {
    borderColor: colors.primary,
    backgroundColor: colors.elevation3,
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
    padding: 16,
    gap: 16,
  },
  optionCard: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCard: {
    borderColor: colors.primary,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  optionDescription: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  exampleContainer: {
    marginTop: 8,
  },
  exampleLabel: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    marginBottom: 8,
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
    margin: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoText: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    lineHeight: 20,
  },
  logoSourceLabel: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    marginTop: 4,
  },
  bannerContainer: {
    height: 120,
    width: '100%',
    borderRadius: 8,
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
    height: '80%',
    alignSelf: 'center',
    top: '10%',
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

export default LogoSourceSettings; 