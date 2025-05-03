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
import { colors } from '../../styles/colors';
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
import { isValidMetahubLogo, hasValidLogoFormat } from '../../utils/logoUtils';

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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const prevContentIdRef = useRef<string | null>(null);
  // Add state for tracking logo load errors
  const [logoLoadError, setLogoLoadError] = useState(false);
  
  // Animation values
  const posterOpacity = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(1); // Start visible
  const buttonsOpacity = useSharedValue(1);
  
  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
  }));
  
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));
  
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
            console.warn(`[FeaturedContent] Metahub logo validation failed: ${url}`);
            return false;
          }
        } catch (validationError) {
          // If validation fails, still try to load the image
          console.warn(`[FeaturedContent] Logo validation error, will try to load anyway: ${url}`, validationError);
        }
      }
      
      // Always attempt to prefetch the image regardless of format validation
      await ExpoImage.prefetch(url);
      imageCache[url] = true;
      console.log(`[FeaturedContent] Successfully preloaded image: ${url}`);
      return true;
    } catch (error) {
      console.error('[FeaturedContent] Error preloading image:', error);
      return false;
    }
  };

  // Reset logo error state when content changes
  useEffect(() => {
    setLogoLoadError(false);
  }, [featuredContent?.id]);

  // Load poster and logo
  useEffect(() => {
    if (!featuredContent) return;
    
    const posterUrl = featuredContent.banner || featuredContent.poster;
    const titleLogo = featuredContent.logo;
    const contentId = featuredContent.id;
    
    // Reset states for new content
    if (contentId !== prevContentIdRef.current) {
      posterOpacity.value = 0;
      logoOpacity.value = 0;
    }
    
    prevContentIdRef.current = contentId;
    
    // Set URLs immediately for instant display
    if (posterUrl) setBannerUrl(posterUrl);
    if (titleLogo) setLogoUrl(titleLogo);
    
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
      if (titleLogo) {
        const logoSuccess = await preloadImage(titleLogo);
        if (logoSuccess) {
          logoOpacity.value = withDelay(300, withTiming(1, {
            duration: 500,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
          }));
        } else {
          // If prefetch fails, mark as error to show title text instead
          setLogoLoadError(true);
          console.warn(`[FeaturedContent] Logo prefetch failed, falling back to text: ${titleLogo}`);
        }
      }
    };
    
    loadImages();
  }, [featuredContent?.id]);

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
              colors.darkBackground,
            ]}
            locations={[0, 0.3, 0.7, 1]}
            style={styles.featuredGradient as ViewStyle}
          >
            <Animated.View 
              style={[styles.featuredContentContainer as ViewStyle, contentAnimatedStyle]}
            >
              {featuredContent.logo && !logoLoadError ? (
                <Animated.View style={logoAnimatedStyle}>
                  <ExpoImage 
                    source={{ uri: logoUrl || featuredContent.logo }} 
                    style={styles.featuredLogo as ImageStyle}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={400}
                    onError={() => {
                      console.warn(`[FeaturedContent] Logo failed to load: ${featuredContent.logo}`);
                      setLogoLoadError(true);
                    }}
                  />
                </Animated.View>
              ) : (
                <Text style={styles.featuredTitleText as TextStyle}>{featuredContent.name}</Text>
              )}
              <View style={styles.genreContainer as ViewStyle}>
                {featuredContent.genres?.slice(0, 3).map((genre, index, array) => (
                  <React.Fragment key={index}>
                    <Text style={styles.genreText as TextStyle}>{genre}</Text>
                    {index < array.length - 1 && (
                      <Text style={styles.genreDot as TextStyle}>•</Text>
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
                  color={colors.white} 
                />
                <Text style={styles.myListButtonText as TextStyle}>
                  {isSaved ? "Saved" : "Save"}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.playButton as ViewStyle}
                onPress={() => {
                  if (featuredContent) {
                    navigation.navigate('Streams', { 
                      id: featuredContent.id, 
                      type: featuredContent.type
                    });
                  }
                }}
              >
                <MaterialIcons name="play-arrow" size={24} color={colors.black} />
                <Text style={styles.playButtonText as TextStyle}>Play</Text>
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
                <MaterialIcons name="info-outline" size={24} color={colors.white} />
                <Text style={styles.infoButtonText as TextStyle}>Info</Text>
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
    backgroundColor: colors.elevation1,
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
    backgroundColor: colors.elevation1,
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
    color: colors.highEmphasis,
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
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.9,
  },
  genreDot: {
    color: colors.white,
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
    backgroundColor: colors.white,
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
    color: colors.black,
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  myListButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  infoButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
});

export default FeaturedContent; 