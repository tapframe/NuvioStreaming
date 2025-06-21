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
  
  // Enhanced poster transition animations
  const posterScale = useSharedValue(1);
  const posterTranslateY = useSharedValue(0);
  const overlayOpacity = useSharedValue(0.15);
  
  // Animation values
  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
    transform: [
      { scale: posterScale.value },
      { translateY: posterTranslateY.value }
    ],
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

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // Preload the image
  const preloadImage = async (url: string): Promise<boolean> => {
    // Skip if already cached to prevent redundant prefetch
    if (imageCache[url]) return true;
    
    try {
      // Basic URL validation
      if (!url || typeof url !== 'string') return false;
      
      // Check if URL appears to be a valid image URL
      const urlLower = url.toLowerCase();
      const hasImageExtension = /\.(jpg|jpeg|png|webp|svg)(\?.*)?$/i.test(url);
      const isImageService = urlLower.includes('image') || urlLower.includes('poster') || urlLower.includes('banner') || urlLower.includes('logo');
      
      if (!hasImageExtension && !isImageService) {
        try {
          // For URLs without clear image extensions, do a quick HEAD request
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const response = await fetch(url, { 
            method: 'HEAD',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) return false;
          
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.startsWith('image/')) {
            return false;
          }
        } catch (validationError) {
          // If validation fails, still try to load the image
        }
      }
      
      // Always attempt to prefetch the image regardless of format validation
      // Add timeout and retry logic for prefetch
      const prefetchWithTimeout = () => {
        return Promise.race([
          ExpoImage.prefetch(url),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Prefetch timeout')), 5000)
          )
        ]);
      };
      
      await prefetchWithTimeout();
      imageCache[url] = true;
      return true;
    } catch (error) {
      // Clear any partial cache entry on error
      delete imageCache[url];
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
      logoFetchInProgress.current = true;
      
      try {
        const contentId = featuredContent.id;
        const contentData = featuredContent; // Use a clearer variable name
        const currentLogo = contentData.logo;
        
        // Get preferences
        const logoPreference = settings.logoSourcePreference || 'metahub';
        const preferredLanguage = settings.tmdbLanguagePreference || 'en';
        
        // Reset state for new fetch
        setLogoUrl(null);
        setLogoLoadError(false);
        
        // Extract IDs
        let imdbId: string | null = null;
        if (contentData.id.startsWith('tt')) {
          imdbId = contentData.id;
        } else if ((contentData as any).imdbId) {
          imdbId = (contentData as any).imdbId;
        } else if ((contentData as any).externalIds?.imdb_id) {
          imdbId = (contentData as any).externalIds.imdb_id;
        }
        
        let tmdbId: string | null = null;
        if (contentData.id.startsWith('tmdb:')) {
          tmdbId = contentData.id.split(':')[1];
        } else if ((contentData as any).tmdb_id) {
           tmdbId = String((contentData as any).tmdb_id);
        }
        
        // If we only have IMDB ID, try to find TMDB ID proactively
        if (imdbId && !tmdbId) {
          try {
            const tmdbService = TMDBService.getInstance();
            const foundData = await tmdbService.findTMDBIdByIMDB(imdbId);
            if (foundData) {
              tmdbId = String(foundData);
            }
          } catch (findError) {
            // logger.warn(`[FeaturedContent] Failed to find TMDB ID for ${imdbId}:`, findError);
          }
        }
        
        const tmdbType = contentData.type === 'series' ? 'tv' : 'movie';
        let finalLogoUrl: string | null = null;
        let primaryAttempted = false;
        let fallbackAttempted = false;
        
        // --- Logo Fetching Logic ---
        
        if (logoPreference === 'metahub') {
          // Primary: Metahub (needs imdbId)
          if (imdbId) {
            primaryAttempted = true;
            const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            try {
              const response = await fetch(metahubUrl, { method: 'HEAD' });
              if (response.ok) {
                finalLogoUrl = metahubUrl;
              }
            } catch (error) { /* Log if needed */ }
          }
          
          // Fallback: TMDB (needs tmdbId)
          if (!finalLogoUrl && tmdbId) {
            fallbackAttempted = true;
            try {
              const tmdbService = TMDBService.getInstance();
              const logoUrl = await tmdbService.getContentLogo(tmdbType, tmdbId, preferredLanguage);
              if (logoUrl) {
                finalLogoUrl = logoUrl;
              }
            } catch (error) { /* Log if needed */ }
          }
          
        } else { // logoPreference === 'tmdb'
          // Primary: TMDB (needs tmdbId)
          if (tmdbId) {
            primaryAttempted = true;
            try {
              const tmdbService = TMDBService.getInstance();
              const logoUrl = await tmdbService.getContentLogo(tmdbType, tmdbId, preferredLanguage);
              if (logoUrl) {
                finalLogoUrl = logoUrl;
              }
            } catch (error) { /* Log if needed */ }
          }
          
          // Fallback: Metahub (needs imdbId)
          if (!finalLogoUrl && imdbId) {
            fallbackAttempted = true;
            const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            try {
              const response = await fetch(metahubUrl, { method: 'HEAD' });
              if (response.ok) {
                finalLogoUrl = metahubUrl;
              }
            } catch (error) { /* Log if needed */ }
          }
        }
        
        // --- Set Final Logo ---
        if (finalLogoUrl) {
          setLogoUrl(finalLogoUrl);
        } else if (currentLogo) {
          // Use existing logo only if primary and fallback failed or weren't applicable
          setLogoUrl(currentLogo);
        } else {
          // No logo found from any source
          setLogoLoadError(true);
          // logger.warn(`[FeaturedContent] No logo found for ${contentData.name} (${contentId}) with preference ${logoPreference}. Primary attempted: ${primaryAttempted}, Fallback attempted: ${fallbackAttempted}`);
        }
        
      } catch (error) {
        // logger.error('[FeaturedContent] Error in fetchLogo:', error);
        setLogoLoadError(true);
      } finally {
        logoFetchInProgress.current = false;
      }
    };
    
    // Trigger fetch when content changes
    fetchLogo();
  }, [featuredContent, settings.logoSourcePreference, settings.tmdbLanguagePreference]);

  // Load poster and logo
  useEffect(() => {
    if (!featuredContent) return;
    
    const posterUrl = featuredContent.banner || featuredContent.poster;
    const contentId = featuredContent.id;
    const isContentChange = contentId !== prevContentIdRef.current;
    
    // Enhanced content change detection and animations
    if (isContentChange) {
      // Animate out current content
      if (prevContentIdRef.current) {
        posterOpacity.value = withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.cubic)
        });
        posterScale.value = withTiming(0.95, {
          duration: 300,
          easing: Easing.out(Easing.cubic)
        });
        overlayOpacity.value = withTiming(0.6, {
          duration: 300,
          easing: Easing.out(Easing.cubic)
        });
        contentOpacity.value = withTiming(0.3, {
          duration: 200,
          easing: Easing.out(Easing.cubic)
        });
        buttonsOpacity.value = withTiming(0.3, {
          duration: 200,
          easing: Easing.out(Easing.cubic)
        });
      } else {
        // Initial load - start from 0
        posterOpacity.value = 0;
        posterScale.value = 1.1;
        overlayOpacity.value = 0;
        contentOpacity.value = 0;
        buttonsOpacity.value = 0;
      }
      logoOpacity.value = 0;
    }
    
    prevContentIdRef.current = contentId;
    
    // Set poster URL for immediate display
    if (posterUrl) setBannerUrl(posterUrl);
    
    // Load images with enhanced animations
    const loadImages = async () => {
      // Small delay to allow fade out animation to complete
      await new Promise(resolve => setTimeout(resolve, isContentChange && prevContentIdRef.current ? 300 : 0));
      
      // Load poster with enhanced transition
      if (posterUrl) {
        const posterSuccess = await preloadImage(posterUrl);
        if (posterSuccess) {
          // Animate in new poster with scale and fade
          posterScale.value = withTiming(1, {
            duration: 800,
            easing: Easing.out(Easing.cubic)
          });
          posterOpacity.value = withTiming(1, {
            duration: 700,
            easing: Easing.out(Easing.cubic)
          });
          overlayOpacity.value = withTiming(0.15, {
            duration: 600,
            easing: Easing.out(Easing.cubic)
          });
          
          // Animate content back in with delay
          contentOpacity.value = withDelay(200, withTiming(1, {
            duration: 600,
            easing: Easing.out(Easing.cubic)
          }));
          buttonsOpacity.value = withDelay(400, withTiming(1, {
            duration: 500,
            easing: Easing.out(Easing.cubic)
          }));
        }
      }
      
      // Load logo if available with enhanced timing
      if (logoUrl) {
        const logoSuccess = await preloadImage(logoUrl);
        if (logoSuccess) {
          logoOpacity.value = withDelay(500, withTiming(1, {
            duration: 600,
            easing: Easing.out(Easing.cubic)
          }));
        } else {
          setLogoLoadError(true);
        }
      }
    };
    
    loadImages();
  }, [featuredContent?.id, logoUrl]);

  const onLogoLoadError = () => {
    setLogoLoaded(true); // Treat error as "loaded" to stop spinner
    setLogoError(true);
  };

  const handleInfoPress = () => {
    if (featuredContent) {
      navigation.navigate('Metadata', {
        id: featuredContent.id,
        type: featuredContent.type
      });
    }
  };

  if (!featuredContent) {
    return <SkeletonFeatured />;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(400).easing(Easing.out(Easing.cubic))}
    >
      <TouchableOpacity 
        activeOpacity={0.95}
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
            {/* Subtle content overlay for better readability */}
            <Animated.View style={[styles.contentOverlay, overlayAnimatedStyle]} />
            
            <LinearGradient
              colors={[
                'rgba(0,0,0,0.1)',
                'rgba(0,0,0,0.2)',
                'rgba(0,0,0,0.4)',
                'rgba(0,0,0,0.8)',
                currentTheme.colors.darkBackground,
              ]}
              locations={[0, 0.2, 0.5, 0.8, 1]}
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
                      cachePolicy="memory"
                      transition={300}
                      recyclingKey={`logo-${featuredContent.id}`}
                      onError={onLogoLoadError}
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
                  activeOpacity={0.7}
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
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="play-arrow" size={24} color={currentTheme.colors.black} />
                  <Text style={[styles.playButtonText as TextStyle, { color: currentTheme.colors.black }]}>
                    Play
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.infoButton as ViewStyle}
                  onPress={handleInfoPress}
                  activeOpacity={0.7}
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  featuredContainer: {
    width: '100%',
    height: height * 0.55, // Slightly taller for better proportions
    marginTop: 0,
    marginBottom: 12,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
    transform: [{ scale: 1.05 }], // Subtle zoom for depth
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
    paddingTop: 20,
  },
  featuredContentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 40,
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
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    minHeight: 70,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flex: 0,
    width: 140,
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
  contentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: 1,
    pointerEvents: 'none',
  },
});

export default FeaturedContent; 