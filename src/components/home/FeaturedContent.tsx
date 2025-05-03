import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  ViewStyle,
  TextStyle,
  ImageStyle,
  ActivityIndicator,
  Platform
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
  Easing,
  withDelay
} from 'react-native-reanimated';
import { StreamingContent } from '../../services/catalogService';
import { SkeletonFeatured } from './SkeletonLoaders';
import { isValidMetahubLogo, hasValidLogoFormat, isMetahubUrl, isTmdbUrl } from '../../utils/logoUtils';
import { useSettings } from '../../hooks/useSettings';
import { TMDBService } from '../../services/tmdbService';
import { logger } from '../../utils/logger';
import { useTheme } from '../../contexts/ThemeContext';

interface FeaturedContentProps {
  featuredContent: StreamingContent | null;
  isSaved: boolean;
  handleSaveToLibrary: () => void;
}

// Cache to store preloaded images
const imageCache: Record<string, boolean> = {};

const { width, height } = Dimensions.get('window');

const FeaturedContent = ({ featuredContent, isSaved, handleSaveToLibrary }: FeaturedContentProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const { settings } = useSettings();
  const logoOpacity = useSharedValue(0);
  const bannerOpacity = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const prevContentIdRef = useRef<string | null>(null);
  // Add state for tracking logo load errors
  const [logoLoadError, setLogoLoadError] = useState(false);
  // Add a ref to track logo fetch in progress
  const logoFetchInProgress = useRef<boolean>(false);
  
  // Animation values
  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
  }));
  
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));
  
  const contentOpacity = useSharedValue(1); // Start visible
  const buttonsOpacity = useSharedValue(1);
  
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
  }));

  // Preload the image
  const preloadImage = async (url: string): Promise<boolean> => {
    if (!url) return false;
    if (imageCache[url]) return true;
    
    try {
      // For Metahub logos, only do validation if enabled
      // Note: Temporarily disable metahub validation until fixed
      if (false && url.includes('metahub.space')) {
        try {
          const isValid = await isValidMetahubLogo(url);
          if (!isValid) {
            return false;
          }
        } catch (validationError) {
          // If validation fails, still try to load the image
        }
      }
      
      // Always attempt to prefetch the image regardless of format validation
      await ExpoImage.prefetch(url);
      imageCache[url] = true;
      return true;
    } catch (error) {
      return false;
    }
  };

  // Reset logo error state when content changes
  useEffect(() => {
    setLogoLoadError(false);
  }, [featuredContent?.id]);
  
  // Fetch logo based on preference
  useEffect(() => {
    if (!featuredContent || logoFetchInProgress.current) return;
    
    const fetchLogo = async () => {
      // Set fetch in progress flag
      logoFetchInProgress.current = true;
      
      try {
        const contentId = featuredContent.id;
        
        // Get logo source preference from settings
        const logoPreference = settings.logoSourcePreference || 'metahub'; // Default to metahub if not set
        const preferredLanguage = settings.tmdbLanguagePreference || 'en'; // Get preferred language
        
        // Check if current logo matches preferences
        const currentLogo = featuredContent.logo;
        if (currentLogo) {
          const isCurrentMetahub = isMetahubUrl(currentLogo);
          const isCurrentTmdb = isTmdbUrl(currentLogo);
          
          // If logo already matches preference, use it
          if ((logoPreference === 'metahub' && isCurrentMetahub) || 
              (logoPreference === 'tmdb' && isCurrentTmdb)) {
            setLogoUrl(currentLogo);
            logoFetchInProgress.current = false;
            return;
          }
        }
        
        // Extract IMDB ID if available
        let imdbId = null;
        if (featuredContent.id.startsWith('tt')) {
          // If the ID itself is an IMDB ID
          imdbId = featuredContent.id;
        } else if ((featuredContent as any).imdbId) {
          // Try to get IMDB ID from the content object if available
          imdbId = (featuredContent as any).imdbId;
        }
        
        // Extract TMDB ID if available
        let tmdbId = null;
        if (contentId.startsWith('tmdb:')) {
          tmdbId = contentId.split(':')[1];
        }
        
        // First source based on preference
        if (logoPreference === 'metahub' && imdbId) {
          // Try to get logo from Metahub first
          const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
          
          try {
            const response = await fetch(metahubUrl, { method: 'HEAD' });
            if (response.ok) {
              setLogoUrl(metahubUrl);
              logoFetchInProgress.current = false;
              return; // Exit if Metahub logo was found
            }
          } catch (error) {
            // Removed logger.warn
          }
          
          // Fall back to TMDB if Metahub fails and we have a TMDB ID
          if (tmdbId) {
            const tmdbType = featuredContent.type === 'series' ? 'tv' : 'movie';
            try {
              const tmdbService = TMDBService.getInstance();
              const logoUrl = await tmdbService.getContentLogo(tmdbType, tmdbId, preferredLanguage);
              
              if (logoUrl) {
                setLogoUrl(logoUrl);
              } else if (currentLogo) {
                // If TMDB fails too, use existing logo if any
                setLogoUrl(currentLogo);
              }
            } catch (error) {
              // Removed logger.error
              if (currentLogo) setLogoUrl(currentLogo);
            }
          } else if (currentLogo) {
            // Use existing logo if we don't have TMDB ID
            setLogoUrl(currentLogo);
          }
        } else if (logoPreference === 'tmdb') {
          // Try to get logo from TMDB first
          if (tmdbId) {
            const tmdbType = featuredContent.type === 'series' ? 'tv' : 'movie';
            try {
              const tmdbService = TMDBService.getInstance();
              const logoUrl = await tmdbService.getContentLogo(tmdbType, tmdbId, preferredLanguage);
              
              if (logoUrl) {
                setLogoUrl(logoUrl);
                logoFetchInProgress.current = false;
                return; // Exit if TMDB logo was found
              }
            } catch (error) {
              // Removed logger.error
            }
          } else if (imdbId) {
            // If we have IMDB ID but no TMDB ID, try to find TMDB ID
            try {
              const tmdbService = TMDBService.getInstance();
              const foundTmdbId = await tmdbService.findTMDBIdByIMDB(imdbId);
              
              if (foundTmdbId) {
                const tmdbType = featuredContent.type === 'series' ? 'tv' : 'movie';
                const logoUrl = await tmdbService.getContentLogo(tmdbType, foundTmdbId.toString(), preferredLanguage);
                
                if (logoUrl) {
                  setLogoUrl(logoUrl);
                  logoFetchInProgress.current = false;
                  return; // Exit if TMDB logo was found
                }
              }
            } catch (error) {
              // Removed logger.error
            }
          }
          
          // Fall back to Metahub if TMDB fails and we have an IMDB ID
          if (imdbId) {
            const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            
            try {
              const response = await fetch(metahubUrl, { method: 'HEAD' });
              if (response.ok) {
                setLogoUrl(metahubUrl);
              } else if (currentLogo) {
                // If Metahub fails too, use existing logo if any
                setLogoUrl(currentLogo);
              }
            } catch (error) {
              // Removed logger.warn
              if (currentLogo) setLogoUrl(currentLogo);
            }
          } else if (currentLogo) {
            // Use existing logo if we don't have IMDB ID
            setLogoUrl(currentLogo);
          }
        }
      } catch (error) {
        // Removed logger.error
        // Optionally set a fallback logo or handle the error state
        setLogoUrl(featuredContent.logo ?? null); // Fallback to initial logo or null
      } finally {
        logoFetchInProgress.current = false;
      }
    };
    
    fetchLogo();
  }, [featuredContent?.id, settings.logoSourcePreference, settings.tmdbLanguagePreference]);

  // Load poster and logo
  useEffect(() => {
    if (!featuredContent) return;
    
    const posterUrl = featuredContent.banner || featuredContent.poster;
    const contentId = featuredContent.id;
    
    // Reset states for new content
    if (contentId !== prevContentIdRef.current) {
      posterOpacity.value = 0;
      logoOpacity.value = 0;
    }
    
    prevContentIdRef.current = contentId;
    
    // Set poster URL immediately for instant display
    if (posterUrl) setBannerUrl(posterUrl);
    
    // Load images in background
    const loadImages = async () => {
      // Load poster
      if (posterUrl) {
        const posterSuccess = await preloadImage(posterUrl);
        if (posterSuccess) {
          posterOpacity.value = withTiming(1, {
            duration: 600,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
          });
        }
      }
      
      // Load logo if available
      if (logoUrl) {
        const logoSuccess = await preloadImage(logoUrl);
        if (logoSuccess) {
          logoOpacity.value = withDelay(300, withTiming(1, {
            duration: 500,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
          }));
        } else {
          // If prefetch fails, mark as error to show title text instead
          setLogoLoadError(true);
          console.warn(`[FeaturedContent] Logo prefetch failed, falling back to text: ${logoUrl}`);
        }
      }
    };
    
    loadImages();
  }, [featuredContent?.id, logoUrl]);

  if (!featuredContent) {
    return <SkeletonFeatured />;
  }

  return (
    <TouchableOpacity 
      activeOpacity={0.9} 
      onPress={() => {
        navigation.navigate('Metadata', {
          id: featuredContent.id,
          type: featuredContent.type
        });
      }}
      style={styles.featuredContainer as ViewStyle}
    >
      <Animated.View style={[styles.imageContainer, posterAnimatedStyle]}>
        <ImageBackground
          source={{ uri: bannerUrl || featuredContent.poster }}
          style={styles.featuredImage as ViewStyle}
          resizeMode="cover"
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(0,0,0,0.1)',
              'rgba(0,0,0,0.7)',
              currentTheme.colors.darkBackground,
            ]}
            locations={[0, 0.3, 0.7, 1]}
            style={styles.featuredGradient as ViewStyle}
          >
            <Animated.View 
              style={[styles.featuredContentContainer as ViewStyle, contentAnimatedStyle]}
            >
              {logoUrl && !logoLoadError ? (
                <Animated.View style={logoAnimatedStyle}>
                  <ExpoImage 
                    source={{ uri: logoUrl }} 
                    style={styles.featuredLogo as ImageStyle}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={400}
                    onError={() => {
                      console.warn(`[FeaturedContent] Logo failed to load: ${logoUrl}`);
                      setLogoLoadError(true);
                    }}
                  />
                </Animated.View>
              ) : (
                <Text style={[styles.featuredTitleText as TextStyle, { color: currentTheme.colors.highEmphasis }]}>
                  {featuredContent.name}
                </Text>
              )}
              <View style={styles.genreContainer as ViewStyle}>
                {featuredContent.genres?.slice(0, 3).map((genre, index, array) => (
                  <React.Fragment key={index}>
                    <Text style={[styles.genreText as TextStyle, { color: currentTheme.colors.white }]}>
                      {genre}
                    </Text>
                    {index < array.length - 1 && (
                      <Text style={[styles.genreDot as TextStyle, { color: currentTheme.colors.white }]}>•</Text>
                    )}
                  </React.Fragment>
                ))}
              </View>
            </Animated.View>

            <Animated.View style={[styles.featuredButtons as ViewStyle, buttonsAnimatedStyle]}>
              <TouchableOpacity 
                style={styles.myListButton as ViewStyle}
                onPress={handleSaveToLibrary}
              >
                <MaterialIcons 
                  name={isSaved ? "bookmark" : "bookmark-border"} 
                  size={24} 
                  color={currentTheme.colors.white} 
                />
                <Text style={[styles.myListButtonText as TextStyle, { color: currentTheme.colors.white }]}>
                  {isSaved ? "Saved" : "Save"}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.playButton as ViewStyle, { backgroundColor: currentTheme.colors.white }]}
                onPress={() => {
                  if (featuredContent) {
                    navigation.navigate('Streams', { 
                      id: featuredContent.id, 
                      type: featuredContent.type
                    });
                  }
                }}
              >
                <MaterialIcons name="play-arrow" size={24} color={currentTheme.colors.black} />
                <Text style={[styles.playButtonText as TextStyle, { color: currentTheme.colors.black }]}>
                  Play
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.infoButton as ViewStyle}
                onPress={() => {
                  if (featuredContent) {
                    navigation.navigate('Metadata', {
                      id: featuredContent.id,
                      type: featuredContent.type
                    });
                  }
                }}
              >
                <MaterialIcons name="info-outline" size={24} color={currentTheme.colors.white} />
                <Text style={[styles.infoButtonText as TextStyle, { color: currentTheme.colors.white }]}>
                  Info
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </LinearGradient>
        </ImageBackground>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  featuredContainer: {
    width: '100%',
    height: height * 0.48,
    marginTop: 0,
    marginBottom: 8,
    position: 'relative',
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  backgroundFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  featuredGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  featuredContentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  featuredLogo: {
    width: width * 0.7,
    height: 100,
    marginBottom: 0,
    alignSelf: 'center',
  },
  featuredTitleText: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  genreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  genreText: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.9,
  },
  genreDot: {
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 4,
  },
  featuredButtons: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    width: '100%',
    flex: 1,
    maxHeight: 55,
    paddingTop: 0,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flex: 0,
    width: 150,
  },
  myListButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 6,
    width: 44,
    height: 44,
    flex: undefined,
  },
  infoButton: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    gap: 4,
    width: 44,
    height: 44,
    flex: undefined,
  },
  playButtonText: {
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  myListButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  infoButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default FeaturedContent; 