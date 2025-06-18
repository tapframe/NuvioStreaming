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
import { useTheme } from '../contexts/ThemeContext';
import { useMetadata } from '../hooks/useMetadata';
import { CastSection } from '../components/metadata/CastSection';
import { SeriesContent } from '../components/metadata/SeriesContent';
import { MovieContent } from '../components/metadata/MovieContent';
import { MoreLikeThisSection } from '../components/metadata/MoreLikeThisSection';
import { RatingsSection } from '../components/metadata/RatingsSection';
import { RouteParams, Episode } from '../types/metadata';
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
  const [showSkeleton, setShowSkeleton] = useState(true);
  const transitionOpacity = useSharedValue(0);
  const skeletonOpacity = useSharedValue(1);

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
  } = useMetadata({ id, type });

  // Optimized hooks with memoization
  const watchProgressData = useWatchProgress(id, type as 'movie' | 'series', episodeId, episodes);
  const assetData = useMetadataAssets(metadata, id, type, imdbId, settings, setMetadata);
  const animations = useMetadataAnimations(safeAreaTop, watchProgressData.watchProgress);

  // Memoized derived values for performance
  const isReady = useMemo(() => !loading && metadata && !metadataError, [loading, metadata, metadataError]);
  
  // Smooth skeleton to content transition
  useEffect(() => {
    if (isReady && !isContentReady) {
      // Small delay to ensure skeleton is rendered before starting transition
      setTimeout(() => {
        // Start fade out skeleton and fade in content simultaneously
        skeletonOpacity.value = withTiming(0, { duration: 300 });
        transitionOpacity.value = withTiming(1, { duration: 400 });
        
        // Hide skeleton after fade out completes
        setTimeout(() => {
          setShowSkeleton(false);
          setIsContentReady(true);
        }, 300);
      }, 100);
    } else if (!isReady && isContentReady) {
      setIsContentReady(false);
      setShowSkeleton(true);
      transitionOpacity.value = 0;
      skeletonOpacity.value = 1;
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

  const handleShowStreams = useCallback(() => {
    const { watchProgress } = watchProgressData;
    if (type === 'series') {
      const targetEpisodeId = watchProgress?.episodeId || episodeId || (episodes.length > 0 ? 
        (episodes[0].stremioId || `${id}:${episodes[0].season_number}:${episodes[0].episode_number}`) : undefined);
      
      if (targetEpisodeId) {
        navigation.navigate('Streams', { id, type, episodeId: targetEpisodeId });
        return;
      }
    }
    navigation.navigate('Streams', { id, type, episodeId });
  }, [navigation, id, type, episodes, episodeId, watchProgressData.watchProgress]);

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

  const skeletonStyle = useAnimatedStyle(() => ({
    opacity: skeletonOpacity.value,
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

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Skeleton Loading Screen - with fade out transition */}
      {showSkeleton && (
        <Animated.View 
          style={[StyleSheet.absoluteFill, skeletonStyle]}
          pointerEvents={isContentReady ? 'none' : 'auto'}
        >
          <MetadataLoadingScreen type={metadata?.type === 'movie' ? 'movie' : 'series'} />
        </Animated.View>
      )}

      {/* Main Content - with fade in transition */}
      {metadata && (
        <Animated.View 
          style={[StyleSheet.absoluteFill, transitionStyle]}
          pointerEvents={isContentReady ? 'auto' : 'none'}
        >
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
      )}
    </View>
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