import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTheme } from '../contexts/ThemeContext';
import { useMetadata } from '../hooks/useMetadata';
import { CastSection } from '../components/metadata/CastSection';
import { SeriesContent } from '../components/metadata/SeriesContent';
import { MovieContent } from '../components/metadata/MovieContent';
import { MoreLikeThisSection } from '../components/metadata/MoreLikeThisSection';
import { RatingsSection } from '../components/metadata/RatingsSection';
import { RouteParams, Episode } from '../types/metadata';
import { Stream, GroupedStreams } from '../types/streams';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings } from '../hooks/useSettings';
import { MetadataLoadingScreen } from '../components/loading/MetadataLoadingScreen';

// Import our optimized components and hooks
import HeroSection from '../components/metadata/HeroSection';
import FloatingHeader from '../components/metadata/FloatingHeader';
import MetadataDetails from '../components/metadata/MetadataDetails';
import { useMetadataAnimations } from '../hooks/useMetadataAnimations';
import { useMetadataAssets } from '../hooks/useMetadataAssets';
import { useWatchProgress } from '../hooks/useWatchProgress';

const { height } = Dimensions.get('window');

const MetadataScreen: React.FC = () => {
  const route = useRoute<RouteProp<Record<string, RouteParams & { episodeId?: string }>, string>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { id, type, episodeId } = route.params;
  
  // Consolidated hooks for better performance
  const { settings } = useSettings();
  const { currentTheme } = useTheme();
  const { top: safeAreaTop } = useSafeAreaInsets();

  // Optimized state management - reduced state variables
  const [isContentReady, setIsContentReady] = useState(false);
  const transitionOpacity = useSharedValue(0);

  const {
    metadata,
    loading,
    error: metadataError,
    cast,
    loadingCast,
    episodes,
    selectedSeason,
    loadingSeasons,
    loadMetadata,
    handleSeasonChange,
    toggleLibrary,
    inLibrary,
    groupedEpisodes,
    recommendations,
    loadingRecommendations,
    setMetadata,
    imdbId,
    loadStreams,
    loadEpisodeStreams,
    groupedStreams,
    episodeStreams,
  } = useMetadata({ id, type });

  // Optimized hooks with memoization
  const watchProgressData = useWatchProgress(id, type as 'movie' | 'series', episodeId, episodes);
  const assetData = useMetadataAssets(metadata, id, type, imdbId, settings, setMetadata);
  const animations = useMetadataAnimations(safeAreaTop, watchProgressData.watchProgress);

  // Memoized derived values for performance
  const isReady = useMemo(() => !loading && metadata && !metadataError, [loading, metadata, metadataError]);
  
  // Ultra-fast content transition
  useEffect(() => {
    if (isReady && !isContentReady) {
      setIsContentReady(true);
      transitionOpacity.value = withTiming(1, { duration: 200 });
    } else if (!isReady && isContentReady) {
      setIsContentReady(false);
      transitionOpacity.value = 0;
    }
  }, [isReady, isContentReady]);

  // Optimized callback functions with reduced dependencies
  const handleToggleLibrary = useCallback(() => {
    Haptics.impactAsync(inLibrary ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    toggleLibrary();
  }, [inLibrary, toggleLibrary]);

  const handleSeasonChangeWithHaptics = useCallback((seasonNumber: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleSeasonChange(seasonNumber);
  }, [handleSeasonChange]);

  // Helper function to get the first available stream from grouped streams
  const getFirstAvailableStream = useCallback((streams: GroupedStreams): Stream | null => {
    const providers = Object.values(streams);
    for (const provider of providers) {
      if (provider.streams && provider.streams.length > 0) {
        // Try to find a cached stream first
        const cachedStream = provider.streams.find(stream => 
          stream.behaviorHints?.cached === true
        );
        if (cachedStream) {
          return cachedStream;
        }
        
        // Otherwise return the first stream
        return provider.streams[0];
      }
    }
    return null;
  }, []);

  const handleShowStreams = useCallback(async () => {
    const { watchProgress } = watchProgressData;
    
    // Check if auto-play is enabled
    if (settings.autoPlayFirstStream) {
      try {
        console.log('Auto-play enabled, attempting to load streams...');
        
        // Determine the target episode for series
        let targetEpisodeId: string | undefined;
        if (type === 'series') {
          targetEpisodeId = watchProgress?.episodeId || episodeId || (episodes.length > 0 ? 
            (episodes[0].stremioId || `${id}:${episodes[0].season_number}:${episodes[0].episode_number}`) : undefined);
        }

        // Load streams without locking orientation yet
        let streamsLoaded = false;
        if (type === 'series' && targetEpisodeId) {
          console.log('Loading episode streams for:', targetEpisodeId);
          await loadEpisodeStreams(targetEpisodeId);
          streamsLoaded = true;
        } else if (type === 'movie') {
          console.log('Loading movie streams...');
          await loadStreams();
          streamsLoaded = true;
        }

        if (streamsLoaded) {
          // Wait a bit longer for streams to be processed and state to update
          console.log('Waiting for streams to be processed...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Check if we have any streams available
          const availableStreams = type === 'series' ? episodeStreams : groupedStreams;
          console.log('Available streams:', Object.keys(availableStreams));
          
          const firstStream = getFirstAvailableStream(availableStreams);
          
          if (firstStream) {
            console.log('Found stream, navigating to player:', firstStream);
            
            // Now lock orientation to landscape before navigation
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            if (type === 'series' && targetEpisodeId) {
              // Get episode details for navigation
              const targetEpisode = episodes.find(ep => 
                ep.stremioId === targetEpisodeId || 
                `${id}:${ep.season_number}:${ep.episode_number}` === targetEpisodeId
              );
              
              // Navigate directly to player with the first stream
              navigation.navigate('Player', {
                uri: firstStream.url,
                title: metadata?.name || 'Unknown',
                season: targetEpisode?.season_number,
                episode: targetEpisode?.episode_number,
                episodeTitle: targetEpisode?.name,
                quality: firstStream.title?.match(/(\d+)p/)?.[1] || 'Unknown',
                year: metadata?.year,
                streamProvider: firstStream.name || 'Unknown',
                id,
                type,
                episodeId: targetEpisodeId,
                imdbId: imdbId || id,
              });
              return;
            } else if (type === 'movie') {
              // Navigate directly to player with the first stream
              navigation.navigate('Player', {
                uri: firstStream.url,
                title: metadata?.name || 'Unknown',
                quality: firstStream.title?.match(/(\d+)p/)?.[1] || 'Unknown',
                year: metadata?.year,
                streamProvider: firstStream.name || 'Unknown',
                id,
                type,
                imdbId: imdbId || id,
              });
              return;
            }
          } else {
            console.log('No streams found after waiting, disabling auto-play for this session');
            // Don't fall back to streams screen, just show an alert
            alert('No streams available for auto-play. Please try selecting streams manually.');
            return;
          }
        }
        
        console.log('Auto-play failed, falling back to manual selection');
      } catch (error) {
        console.error('Auto-play failed with error:', error);
        // Don't fall back on error, just show alert
        alert('Auto-play failed. Please try selecting streams manually.');
        return;
      }
    }
    
    // Normal behavior: navigate to streams screen (only if auto-play is disabled or not attempted)
    console.log('Navigating to streams screen (normal flow)');
    if (type === 'series') {
      const targetEpisodeId = watchProgress?.episodeId || episodeId || (episodes.length > 0 ? 
        (episodes[0].stremioId || `${id}:${episodes[0].season_number}:${episodes[0].episode_number}`) : undefined);
      
      if (targetEpisodeId) {
        navigation.navigate('Streams', { id, type, episodeId: targetEpisodeId });
        return;
      }
    }
    navigation.navigate('Streams', { id, type, episodeId });
  }, [settings.autoPlayFirstStream, navigation, id, type, episodes, episodeId, watchProgressData, metadata, loadEpisodeStreams, loadStreams, episodeStreams, groupedStreams, imdbId, getFirstAvailableStream]);

  const handleEpisodeSelect = useCallback((episode: Episode) => {
    const episodeId = episode.stremioId || `${id}:${episode.season_number}:${episode.episode_number}`;
    navigation.navigate('Streams', { id, type, episodeId });
  }, [navigation, id, type]);

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleSelectCastMember = useCallback(() => {}, []); // Simplified for performance

  // Ultra-optimized animated styles - minimal calculations
  const containerStyle = useAnimatedStyle(() => ({
    opacity: animations.screenOpacity.value,
  }), []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: animations.contentOpacity.value,
    transform: [{ translateY: animations.uiElementsTranslateY.value }]
  }), []);

  const transitionStyle = useAnimatedStyle(() => ({
    opacity: transitionOpacity.value,
  }), []);

  // Memoized error component for performance
  const ErrorComponent = useMemo(() => {
    if (!metadataError) return null;
    
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}
        edges={['bottom']}
      >
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color={currentTheme.colors.textMuted} />
          <Text style={[styles.errorText, { color: currentTheme.colors.highEmphasis }]}>
            {metadataError || 'Content not found'}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: currentTheme.colors.primary }]}
            onPress={loadMetadata}
          >
            <MaterialIcons name="refresh" size={20} color={currentTheme.colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backButton, { borderColor: currentTheme.colors.primary }]}
            onPress={handleBack}
          >
            <Text style={[styles.backButtonText, { color: currentTheme.colors.primary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }, [metadataError, currentTheme, loadMetadata, handleBack]);

  // Show error if exists
  if (metadataError || (!loading && !metadata)) {
    return ErrorComponent;
  }

  // Show loading screen
  if (loading || !isContentReady) {
    return <MetadataLoadingScreen type={metadata?.type === 'movie' ? 'movie' : 'series'} />;
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, transitionStyle]}>
      <SafeAreaView 
        style={[containerStyle, styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}
        edges={['bottom']}
      >
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" animated />
        
        {/* Floating Header - Optimized */}
        <FloatingHeader 
          metadata={metadata}
          logoLoadError={assetData.logoLoadError}
          handleBack={handleBack}
          handleToggleLibrary={handleToggleLibrary}
          headerElementsY={animations.headerElementsY}
          inLibrary={inLibrary}
          headerOpacity={animations.headerOpacity}
          headerElementsOpacity={animations.headerElementsOpacity}
          safeAreaTop={safeAreaTop}
          setLogoLoadError={assetData.setLogoLoadError}
        />

        <Animated.ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={animations.scrollHandler}
          scrollEventThrottle={16}
          bounces={false}
          overScrollMode="never"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Hero Section - Optimized */}
          <HeroSection 
            metadata={metadata}
            bannerImage={assetData.bannerImage}
            loadingBanner={assetData.loadingBanner}
            logoLoadError={assetData.logoLoadError}
            scrollY={animations.scrollY}
            heroHeight={animations.heroHeight}
            heroOpacity={animations.heroOpacity}
            logoOpacity={animations.logoOpacity}
            buttonsOpacity={animations.buttonsOpacity}
            buttonsTranslateY={animations.buttonsTranslateY}
            watchProgressOpacity={animations.watchProgressOpacity}
            watchProgressWidth={animations.watchProgressWidth}
            watchProgress={watchProgressData.watchProgress}
            type={type as 'movie' | 'series'}
            getEpisodeDetails={watchProgressData.getEpisodeDetails}
            handleShowStreams={handleShowStreams}
            handleToggleLibrary={handleToggleLibrary}
            inLibrary={inLibrary}
            id={id}
            navigation={navigation}
            getPlayButtonText={watchProgressData.getPlayButtonText}
            setBannerImage={assetData.setBannerImage}
            setLogoLoadError={assetData.setLogoLoadError}
          />

          {/* Main Content - Optimized */}
          <Animated.View style={contentStyle}>
            <MetadataDetails 
              metadata={metadata}
              imdbId={imdbId}
              type={type as 'movie' | 'series'}
              renderRatings={() => imdbId ? (
                <RatingsSection imdbId={imdbId} type={type === 'series' ? 'show' : 'movie'} />
              ) : null}
            />

            <CastSection
              cast={cast}
              loadingCast={loadingCast}
              onSelectCastMember={handleSelectCastMember}
            />

            {type === 'movie' && (
              <MoreLikeThisSection 
                recommendations={recommendations}
                loadingRecommendations={loadingRecommendations}
              />
            )}

            {type === 'series' ? (
              <SeriesContent
                episodes={episodes}
                selectedSeason={selectedSeason}
                loadingSeasons={loadingSeasons}
                onSeasonChange={handleSeasonChangeWithHaptics}
                onSelectEpisode={handleEpisodeSelect}
                groupedEpisodes={groupedEpisodes}
                metadata={metadata || undefined}
              />
            ) : (
              metadata && <MovieContent metadata={metadata} />
            )}
          </Animated.View>
        </Animated.ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
};

// Optimized styles with minimal properties
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 2,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MetadataScreen;