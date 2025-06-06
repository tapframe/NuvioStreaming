import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Platform,
  FlatList
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
  withDelay,
  interpolate,
  useAnimatedScrollHandler,
  runOnJS
} from 'react-native-reanimated';
import { StreamingContent } from '../../services/catalogService';
import { SkeletonFeatured } from './SkeletonLoaders';
import { isValidMetahubLogo, hasValidLogoFormat, isMetahubUrl, isTmdbUrl } from '../../utils/logoUtils';
import { useSettings } from '../../hooks/useSettings';
import { TMDBService } from '../../services/tmdbService';
import { logger } from '../../utils/logger';
import { useTheme } from '../../contexts/ThemeContext';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';

const HEADER_HEIGHT = Platform.OS === 'ios' ? 100 : 90;

interface FeaturedContentProps {
  featuredContent: StreamingContent[] | null; // Changed to array
  isSaved: boolean;
  handleSaveToLibrary: (contentId: string) => void; // Modified to accept contentId
}

interface FeaturedCardProps {
  item: StreamingContent;
  index: number;
  currentIndex: number;
  scrollX: Animated.SharedValue<number>;
  isSaved: boolean;
  handleSaveToLibrary: (contentId: string) => void;
  cachedContent: {
    bannerUrl: string | null;
    logoUrl: string | null;
    logoLoadError: boolean;
  };
  onCardPress: (id: string, type: string) => void;
  onStreamPress: (id: string, type: string) => void;
  onInfoPress: (id: string, type: string) => void;
}

const BackgroundImage = React.memo(({ uri, isActive }: { uri: string | null, isActive: boolean }) => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : 0, { 
      duration: 800, 
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isActive, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!uri) return null;

  return (
    <Animated.View style={[styles.backgroundImage, animatedStyle]}>
      <ExpoImage
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={500}
        blurRadius={Platform.OS === 'android' ? 20 : 50}
      />
    </Animated.View>
  );
});

// Cache to store preloaded images
const imageCache: Record<string, boolean> = {};

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width * 0.7;
const CARD_HEIGHT = height * 0.55;
const VISIBLE_SIDE_CARD = width * 0.15;
const CARD_SPACING = 0;

// Separate component for rendering individual cards
const FeaturedCard = React.memo(({ 
  item, 
  index, 
  currentIndex, 
  scrollX, 
  isSaved, 
  handleSaveToLibrary, 
  cachedContent,
  onCardPress,
  onStreamPress,
  onInfoPress
}: FeaturedCardProps) => {
  const { currentTheme } = useTheme();
  const [localLogoError, setLocalLogoError] = useState(false);
  
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(12);
  const genreOpacity = useSharedValue(0);
  const genreTranslateY = useSharedValue(8);
  
  useEffect(() => {
    // Reset the local error state when cache changes
    setLocalLogoError(false);
  }, [cachedContent.logoUrl]);
  
  useEffect(() => {
    // Animate text elements when this card becomes the current card
    if (index === currentIndex) {
      // Title animation
      titleOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      titleTranslateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
      
      // Genre animation with delay
      genreOpacity.value = withDelay(60, withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }));
      genreTranslateY.value = withDelay(60, withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) }));
    } else {
      // Reset animations when not the current card
      titleOpacity.value = 0;
      titleTranslateY.value = 12;
      genreOpacity.value = 0;
      genreTranslateY.value = 8;
    }
  }, [currentIndex, index, titleOpacity, titleTranslateY, genreOpacity, genreTranslateY]);
  
  const inputRange = [
    (index - 1) * CARD_WIDTH,
    index * CARD_WIDTH,
    (index + 1) * CARD_WIDTH
  ];
  
  const animatedCardStyle = useAnimatedStyle(() => {
    // Use Math.floor to ensure integer pixel values
    const pixelScrollX = Math.floor(scrollX.value);
    
    const scale = interpolate(
      pixelScrollX,
      inputRange,
      [0.9, 1, 0.9],
      'clamp'
    );
    
    const opacity = interpolate(
      pixelScrollX,
      inputRange,
      [0.7, 1, 0.7],
      'clamp'
    );
    
    const zIndex = Math.floor(interpolate(
      pixelScrollX,
      inputRange,
      [0, 10, 0],
      'clamp'
    ));
    
    const translateY = Math.floor(interpolate(
      pixelScrollX,
      inputRange,
      [25, 0, 25],
      'clamp'
    ));

    const rotateYValue = Math.floor(interpolate(
      pixelScrollX,
      inputRange,
      [20, 0, -20],
      'clamp'
    ));
    
    return {
      transform: [
        { perspective: 1000 },
        { scale }, 
        { translateY },
        { rotateY: `${rotateYValue}deg` }
      ],
      opacity,
      zIndex,
    };
  });
  
  const animatedTitleStyle = useAnimatedStyle(() => {
    return {
      opacity: titleOpacity.value,
      transform: [{ translateY: titleTranslateY.value }],
    };
  });
  
  const animatedGenreStyle = useAnimatedStyle(() => {
    return {
      opacity: genreOpacity.value,
      transform: [{ translateY: genreTranslateY.value }],
    };
  });
  
  const isCurrentCard = index === currentIndex;
  const hasLogoToShow = cachedContent.logoUrl && !cachedContent.logoLoadError && !localLogoError;
  
  // Log for debugging
  useEffect(() => {
    if (isCurrentCard) {
      console.log(`[FeaturedCard] Current card ${item.name} (${item.id})`);
      console.log(`[FeaturedCard] Logo URL: ${cachedContent.logoUrl}`);
      console.log(`[FeaturedCard] Logo error state: ${cachedContent.logoLoadError}`);
    }
  }, [isCurrentCard, item.id, item.name, cachedContent]);
  
  return (
    <Animated.View style={[
      styles.cardContainer,
      animatedCardStyle,
    ]}>
      <TouchableOpacity 
        activeOpacity={0.9}
        style={styles.card}
        onPress={() => onCardPress(item.id, item.type)}
        disabled={!isCurrentCard}
      >
        <View style={styles.featuredImage as ViewStyle}>
          <ExpoImage
            source={{ uri: cachedContent.bannerUrl || item.poster }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={400}
            cachePolicy="memory-disk"
          />
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
            <View style={styles.featuredContentContainer as ViewStyle}>
              {hasLogoToShow ? (
                <Animated.View style={[styles.logoContainer, animatedTitleStyle]}>
                  <ExpoImage 
                    source={{ uri: cachedContent.logoUrl! }}
                    style={styles.featuredLogo as ImageStyle}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={400}
                    onError={() => {
                      console.error(`[FeaturedCard] Logo failed to load: ${cachedContent.logoUrl}`);
                      setLocalLogoError(true);
                    }}
                  />
                </Animated.View>
              ) : (
                <Animated.Text style={[
                  styles.featuredTitleText as TextStyle, 
                  { color: currentTheme.colors.highEmphasis },
                  animatedTitleStyle
                ]}>
                  {item.name}
                </Animated.Text>
              )}
              
              <Animated.View style={[styles.genreContainer as ViewStyle, animatedGenreStyle]}>
                {item.genres?.slice(0, 3).map((genre, genreIndex, array) => (
                  <React.Fragment key={genreIndex}>
                    <Text style={[styles.genreText as TextStyle, { color: currentTheme.colors.white }]}>
                      {genre}
                    </Text>
                    {genreIndex < array.length - 1 && (
                      <Text style={[styles.genreDot as TextStyle, { color: currentTheme.colors.white }]}>•</Text>
                    )}
                  </React.Fragment>
                ))}
              </Animated.View>
            </View>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const FeaturedContent = ({ featuredContent, isSaved, handleSaveToLibrary }: FeaturedContentProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const flatListRef = useRef<FlatList>(null);
  const { settings } = useSettings();
  
  const [limitedContent, setLimitedContent] = useState<StreamingContent[] | null>(null);
  
  useEffect(() => {
    if (featuredContent) {
      setLimitedContent(featuredContent.slice(0, 7));
    } else {
      setLimitedContent(null);
    }
  }, [featuredContent]);
  
  // Content caching state
  const [contentCache, setContentCache] = useState<Record<string, {
    bannerUrl: string | null;
    logoUrl: string | null;
    logoLoaded: boolean;
    logoLoadError: boolean;
  }>>({});
  
  const logoFetchInProgress = useRef<Record<string, boolean>>({});

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

  // Fetch logo for a content item
  const fetchLogoForContent = async (content: StreamingContent) => {
    if (!content || logoFetchInProgress.current[content.id]) return;
    
    logoFetchInProgress.current[content.id] = true;
    console.log(`[FeaturedContent] Fetching logo for ${content.name} (${content.id})`);
    
    try {
      const contentId = content.id;
      const contentData = content;
        const currentLogo = contentData.logo;
      
      // If we already have a logo in the content object, use it
      if (currentLogo) {
        console.log(`[FeaturedContent] Content has logo already: ${currentLogo}`);
        setContentCache(prev => ({
          ...prev,
          [contentId]: {
            ...prev[contentId],
            logoUrl: currentLogo,
            logoLoadError: false
          }
        }));
        
        await preloadImage(currentLogo);
        logoFetchInProgress.current[content.id] = false;
        return;
      }
        
        // Get preferences
        const logoPreference = settings.logoSourcePreference || 'metahub';
        const preferredLanguage = settings.tmdbLanguagePreference || 'en';
        
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
          console.warn(`[FeaturedContent] Failed to find TMDB ID for ${imdbId}:`, findError);
        }
        }
        
        const tmdbType = contentData.type === 'series' ? 'tv' : 'movie';
        let finalLogoUrl: string | null = null;
        
        // --- Logo Fetching Logic ---
        
      // First try Metahub
          if (imdbId) {
            const metahubUrl = `https://images.metahub.space/logo/medium/${imdbId}/img`;
            try {
          console.log(`[FeaturedContent] Checking Metahub logo: ${metahubUrl}`);
              const response = await fetch(metahubUrl, { method: 'HEAD' });
              if (response.ok) {
                finalLogoUrl = metahubUrl;
            console.log(`[FeaturedContent] Found Metahub logo: ${finalLogoUrl}`);
          }
        } catch (error) { 
          console.warn(`[FeaturedContent] Metahub logo fetch failed for ${imdbId}`);
        }
      }
      
      // Then try TMDB if needed
      if (!finalLogoUrl && tmdbId) {
            try {
              const tmdbService = TMDBService.getInstance();
              const logoUrl = await tmdbService.getContentLogo(tmdbType, tmdbId, preferredLanguage);
              if (logoUrl) {
                finalLogoUrl = logoUrl;
            console.log(`[FeaturedContent] Found TMDB logo: ${finalLogoUrl}`);
          }
        } catch (error) {
          console.warn(`[FeaturedContent] TMDB logo fetch failed for ${tmdbId}`);
        }
        }
        
        // --- Set Final Logo ---
      console.log(`[FeaturedContent] Setting logo for ${contentId}: ${finalLogoUrl || 'NO LOGO FOUND'}`);
      
      setContentCache(prev => ({
        ...prev,
        [contentId]: {
          ...prev[contentId],
          logoUrl: finalLogoUrl,
          logoLoadError: !finalLogoUrl
        }
      }));
      
      // Update content item with logo for future use
      if (finalLogoUrl) {
        content.logo = finalLogoUrl;
        await preloadImage(finalLogoUrl);
        }
        
      } catch (error) {
      console.error('[FeaturedContent] Error in fetchLogo:', error);
      setContentCache(prev => ({
        ...prev,
        [content.id]: {
          ...prev[content.id],
          logoLoadError: true
        }
      }));
      } finally {
      logoFetchInProgress.current[content.id] = false;
    }
  };
  
  // Load content for visible items
  useEffect(() => {
    if (!limitedContent) return;
    
    // Initialize or update cache entries
    const initialCache: Record<string, any> = {};
    limitedContent.forEach(item => {
      const bannerUrl = item.banner || item.poster;
      
      initialCache[item.id] = {
        bannerUrl,
        logoUrl: contentCache[item.id]?.logoUrl || null,
        logoLoaded: contentCache[item.id]?.logoLoaded || false,
        logoLoadError: contentCache[item.id]?.logoLoadError || false,
      };
      
      // Preload banner images
      if (bannerUrl) {
        preloadImage(bannerUrl);
      }
    });
    
    setContentCache(prev => ({ ...prev, ...initialCache }));
    
    // Fetch logos for visible items
    const visibleStart = Math.max(0, currentIndex - 1);
    const visibleEnd = Math.min(limitedContent.length - 1, currentIndex + 1);
    
    for (let i = visibleStart; i <= visibleEnd; i++) {
      if (i >= 0 && i < limitedContent.length) {
        fetchLogoForContent(limitedContent[i]);
      }
    }
  }, [limitedContent, currentIndex]);
  
  // Scroll handler
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      // Use floor to prevent precision errors with long decimal values
      scrollX.value = Math.floor(event.contentOffset.x);
    },
    onMomentumEnd: (event) => {
      // Ensure we're working with integer values to avoid precision errors
      const position = Math.floor(event.contentOffset.x);
      const cardWidth = Math.floor(CARD_WIDTH);
      const newIndex = Math.round(position / cardWidth);
      
      if (newIndex !== currentIndex) {
        runOnJS(setCurrentIndex)(newIndex);
      }
    }
  });
  
  // Navigate to previous card
  const navigatePrev = () => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex - 1,
        animated: true
      });
    }
  };
  
  // Navigate to next card
  const navigateNext = () => {
    if (limitedContent && currentIndex < limitedContent.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true
      });
    }
  };

  // Handle card press
  const handleCardPress = useCallback((id: string, type: string) => {
    navigation.navigate('Metadata', {
      id,
      type
    });
  }, [navigation]);

  // Handle stream press
  const handleStreamPress = useCallback((id: string, type: string) => {
    navigation.navigate('Streams', { 
      id, 
      type
    });
  }, [navigation]);

  // Handle info press
  const handleInfoPress = useCallback((id: string, type: string) => {
    navigation.navigate('Metadata', {
      id,
      type
    });
  }, [navigation]);
  
  // Render item function for the FlatList
  const renderItem = ({ item, index }: { item: StreamingContent, index: number }) => {
    const cachedContent = contentCache[item.id] || {
      bannerUrl: item.banner || item.poster,
      logoUrl: null,
      logoLoadError: false
    };
    
    return (
      <FeaturedCard
        item={item}
        index={index}
        currentIndex={currentIndex}
        scrollX={scrollX}
        isSaved={isSaved}
        handleSaveToLibrary={handleSaveToLibrary}
        cachedContent={cachedContent}
        onCardPress={handleCardPress}
        onStreamPress={handleStreamPress}
        onInfoPress={handleInfoPress}
      />
    );
  };
  
  if (!limitedContent || limitedContent.length === 0) {
    return <SkeletonFeatured />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundContainer}>
        {limitedContent.map((item, index) => {
          const bannerUrl = contentCache[item.id]?.bannerUrl || item.banner || item.poster;
          return (
            <BackgroundImage
              key={`bg-${item.id}`}
              uri={bannerUrl}
              isActive={index === currentIndex}
            />
          );
        })}
        <View style={styles.backgroundOverlay} />
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={limitedContent}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        initialScrollIndex={0}
        getItemLayout={(data, index) => ({
          length: CARD_WIDTH,
          offset: CARD_WIDTH * index,
          index,
        })}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
        }}
      />

      <LinearGradient
        colors={[`${currentTheme.colors.background}00`, currentTheme.colors.background]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: height * 0.6,
    width: '100%',
    marginBottom: 8,
  },
  backgroundContainer: {
    position: 'absolute',
    top: -HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '120%',
    height: '120%',
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scrollContent: {
    paddingHorizontal: VISIBLE_SIDE_CARD,
    paddingVertical: 10,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    paddingHorizontal: 0,
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  featuredContentContainer: {
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  logoContainer: {
    width: '100%',
    height: 100,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredLogo: {
    width: '85%',
    height: 90,
    marginBottom: 12,
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  featuredTitleText: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 10,
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
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  }
});

export default FeaturedContent; 