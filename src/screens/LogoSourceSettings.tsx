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
  ActivityIndicator
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

const LogoSourceSettings = () => {
  const { settings, updateSetting } = useSettings();
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();
  
  // Get current preference
  const [logoSource, setLogoSource] = useState<'metahub' | 'tmdb'>(
    settings.logoSourcePreference || 'metahub'
  );
  
  // Add state for example logos
  const [tmdbLogo, setTmdbLogo] = useState<string | null>(null);
  const [metahubLogo, setMetahubLogo] = useState<string | null>(null);
  const [loadingLogos, setLoadingLogos] = useState(true);

  // Load example logos on mount
  useEffect(() => {
    const fetchExampleLogos = async () => {
      setLoadingLogos(true);
      
      try {
        const tmdbService = TMDBService.getInstance();
        
        // Specifically search for Breaking Bad
        const searchResults = await tmdbService.searchTVShow("Breaking Bad");
        
        if (searchResults && searchResults.length > 0) {
          // Get Breaking Bad (should be the first result)
          const breakingBad = searchResults[0];
          const breakingBadId = breakingBad.id;
          
          logger.log(`[LogoSourceSettings] Found Breaking Bad with TMDB ID: ${breakingBadId}`);
          
          // Get the external IDs to get IMDB ID
          const externalIds = await tmdbService.getShowExternalIds(breakingBadId);
          
          if (externalIds?.imdb_id) {
            const imdbId = externalIds.imdb_id;
            logger.log(`[LogoSourceSettings] Breaking Bad IMDB ID: ${imdbId}`);
            
            // Get TMDB logo using the images endpoint
            try {
              // Manually fetch images from TMDB API
              const apiKey = TMDB_API_KEY; // Use the TMDB API key
              const response = await fetch(`https://api.themoviedb.org/3/tv/${breakingBadId}/images?api_key=${apiKey}`);
              const imagesData = await response.json();
              
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
                  logger.log(`[LogoSourceSettings] Got Breaking Bad TMDB logo: ${tmdbLogoUrl}`);
                } else {
                  // Fallback to hardcoded Breaking Bad TMDB logo
                  setTmdbLogo('https://image.tmdb.org/t/p/original/ggFHVNu6YYI5L9pCfOacjizRGt.png');
                  logger.log(`[LogoSourceSettings] Using fallback Breaking Bad TMDB logo`);
                }
              } else {
                // No logos found in the response
                setTmdbLogo('https://image.tmdb.org/t/p/original/ggFHVNu6YYI5L9pCfOacjizRGt.png');
                logger.log(`[LogoSourceSettings] No logos found in TMDB response, using fallback`);
              }
            } catch (tmdbError) {
              logger.error(`[LogoSourceSettings] Error fetching TMDB images:`, tmdbError);
              // Fallback to hardcoded Breaking Bad TMDB logo
              setTmdbLogo('https://image.tmdb.org/t/p/original/ggFHVNu6YYI5L9pCfOacjizRGt.png');
            }
            
            // Get Metahub logo
            const metahubLogoUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            
            // Check if Metahub logo exists
            try {
              const metahubResponse = await fetch(metahubLogoUrl, { method: 'HEAD' });
              if (metahubResponse.ok) {
                setMetahubLogo(metahubLogoUrl);
                logger.log(`[LogoSourceSettings] Got Breaking Bad Metahub logo: ${metahubLogoUrl}`);
              } else {
                // Fallback to hardcoded Breaking Bad Metahub logo
                setMetahubLogo('https://images.metahub.space/logo/medium/tt0903747/img');
                logger.log(`[LogoSourceSettings] Using fallback Breaking Bad Metahub logo`);
              }
            } catch (metahubErr) {
              logger.error(`[LogoSourceSettings] Error checking Metahub logo:`, metahubErr);
              // Fallback to hardcoded Breaking Bad Metahub logo
              setMetahubLogo('https://images.metahub.space/logo/medium/tt0903747/img');
            }
          }
        } else {
          logger.warn(`[LogoSourceSettings] Breaking Bad not found in search results`);
          // Use hardcoded Breaking Bad logos
          setTmdbLogo('https://image.tmdb.org/t/p/original/ggFHVNu6YYI5L9pCfOacjizRGt.png');
          setMetahubLogo('https://images.metahub.space/logo/medium/tt0903747/img');
        }
      } catch (err) {
        logger.error('[LogoSourceSettings] Error fetching Breaking Bad logos:', err);
        
        // Use hardcoded Breaking Bad logos
        setTmdbLogo('https://image.tmdb.org/t/p/original/ggFHVNu6YYI5L9pCfOacjizRGt.png');
        setMetahubLogo('https://images.metahub.space/logo/medium/tt0903747/img');
      } finally {
        setLoadingLogos(false);
      }
    };
    
    fetchExampleLogos();
  }, []);

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
  
  // Handle back navigation
  const handleBack = () => {
    navigation.goBack();
  };

  // Render logo example with loading state
  const renderLogoExample = (url: string | null, isLoading: boolean) => {
    if (isLoading) {
      return (
        <View style={[styles.exampleImage, styles.loadingContainer]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    
    return (
      <Image 
        source={{ uri: url || undefined }}
        style={styles.exampleImage}
        resizeMode="contain"
      />
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
              {renderLogoExample(metahubLogo, loadingLogos)}
              <Text style={styles.logoSourceLabel}>Breaking Bad logo from Metahub</Text>
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
              {renderLogoExample(tmdbLogo, loadingLogos)}
              <Text style={styles.logoSourceLabel}>Breaking Bad logo from TMDB</Text>
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
});

export default LogoSourceSettings; 