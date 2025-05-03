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
  ActivityIndicator
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
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const prevContentIdRef = useRef<string | null>(null);
  
  // Animation values
  const posterOpacity = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  
  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
  }));
  
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));
  
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // Preload the image
  const preloadImage = async (url: string): Promise<boolean> => {
    if (!url) return false;
    
    // If already cached, return true immediately
    if (imageCache[url]) return true;
    
    try {
      await ExpoImage.prefetch(url);
      imageCache[url] = true;
      return true;
    } catch (error) {
      console.error('Error preloading image:', error);
      return false;
    }
  };

  // Load poster first, then logo
  useEffect(() => {
    if (!featuredContent) return;
    
    const posterUrl = featuredContent.banner || featuredContent.poster;
    const titleLogo = featuredContent.logo;
    const contentId = featuredContent.id;
    
    // Reset states for new content
    if (contentId !== prevContentIdRef.current) {
      setPosterLoaded(false);
      setLogoLoaded(false);
      setImageError(false);
      posterOpacity.value = 0;
      logoOpacity.value = 0;
      contentOpacity.value = 0;
    }
    
    prevContentIdRef.current = contentId;
    
    // Sequential loading: poster first, then logo
    const loadImages = async () => {
      // Step 1: Load poster
      if (posterUrl) {
        setBannerUrl(posterUrl);
        const posterSuccess = await preloadImage(posterUrl);
        
        if (posterSuccess) {
          setPosterLoaded(true);
          // Fade in poster
          posterOpacity.value = withTiming(1, {
            duration: 600,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
          });
          
          // After poster loads, start showing content with slight delay
          contentOpacity.value = withDelay(150, withTiming(1, {
            duration: 400,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
          }));
        } else {
          setImageError(true);
        }
      }
      
      // Step 2: Load logo if available
      if (titleLogo) {
        setLogoUrl(titleLogo);
        const logoSuccess = await preloadImage(titleLogo);
        
        if (logoSuccess) {
          setLogoLoaded(true);
          // Fade in logo with delay after poster
          logoOpacity.value = withDelay(300, withTiming(1, {
            duration: 500,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
          }));
        }
      }
    };
    
    loadImages();
  }, [featuredContent?.id]);

  // Preload next content
  useEffect(() => {
    if (!featuredContent || !posterLoaded) return;
    
    // After current poster loads, prefetch for potential next items
    const preloadNextContent = async () => {
      // Simulate preloading next item (in a real app, you'd get this from allFeaturedContent)
      if (featuredContent.type === 'movie' && featuredContent.id) {
        // Try to preload related content by ID pattern
        const relatedIds = [
          `tmdb:${parseInt(featuredContent.id.split(':')[1] || '0') + 1}`,
          `tmdb:${parseInt(featuredContent.id.split(':')[1] || '0') + 2}`
        ];
        
        for (const id of relatedIds) {
          // This is just a simulation - in real app you'd have actual next content URLs
          const potentialNextPoster = featuredContent.poster?.replace(
            featuredContent.id, 
            id
          );
          
          if (potentialNextPoster) {
            await preloadImage(potentialNextPoster);
          }
        }
      }
    };
    
    preloadNextContent();
  }, [posterLoaded, featuredContent]);

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
          source={{ uri: bannerUrl || '' }}
          style={styles.featuredImage as ViewStyle}
          resizeMode="cover"
          imageStyle={{ opacity: imageError ? 0.5 : 1 }}
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
              {featuredContent.logo ? (
                <Animated.View style={logoAnimatedStyle}>
                  <ExpoImage 
                    source={{ uri: logoUrl }} 
                    style={styles.featuredLogo as ImageStyle}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={400}
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
              <View style={styles.featuredButtons as ViewStyle}>
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
              </View>
            </Animated.View>
          </LinearGradient>
        </ImageBackground>
      </Animated.View>
      
      {!posterLoaded && (
        <View style={styles.backgroundFallback}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  featuredContainer: {
    width: '100%',
    height: height * 0.6,
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
    paddingBottom: 20,
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
    marginBottom: 16,
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
    maxHeight: 65,
    paddingTop: 16,
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