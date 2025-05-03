import React, { useCallback } from 'react';
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
import { colors } from '../styles/colors';
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
} from 'react-native-reanimated';
import { RouteProp } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings } from '../hooks/useSettings';

// Import our new components and hooks
import HeroSection from '../components/metadata/HeroSection';
import FloatingHeader from '../components/metadata/FloatingHeader';
import MetadataDetails from '../components/metadata/MetadataDetails';
import { useMetadataAnimations } from '../hooks/useMetadataAnimations';
import { useMetadataAssets } from '../hooks/useMetadataAssets';
import { useWatchProgress } from '../hooks/useWatchProgress';

const { height } = Dimensions.get('window');

const MetadataScreen = () => {
  const route = useRoute<RouteProp<Record<string, RouteParams & { episodeId?: string }>, string>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { id, type, episodeId } = route.params;
  
  // Add settings hook
  const { settings } = useSettings();

  // Get safe area insets
  const { top: safeAreaTop } = useSafeAreaInsets();

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

  // Use our new hooks
  const {
    watchProgress,
    getEpisodeDetails,
    getPlayButtonText,
  } = useWatchProgress(id, type as 'movie' | 'series', episodeId, episodes);

  const {
    bannerImage,
    loadingBanner,
    logoLoadError,
    setLogoLoadError,
    setBannerImage,
  } = useMetadataAssets(metadata, id, type, imdbId, settings, setMetadata);

  const animations = useMetadataAnimations(safeAreaTop, watchProgress);

  // Add wrapper for toggleLibrary that includes haptic feedback
  const handleToggleLibrary = useCallback(() => {
    // Trigger appropriate haptic feedback based on action
    if (inLibrary) {
      // Removed from library - light impact
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // Added to library - success feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    // Call the original toggleLibrary function
    toggleLibrary();
  }, [inLibrary, toggleLibrary]);

  // Add wrapper for season change with distinctive haptic feedback
  const handleSeasonChangeWithHaptics = useCallback((seasonNumber: number) => {
    // Change to Light impact for a more subtle feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Wait a tiny bit before changing season, making the feedback more noticeable
    setTimeout(() => {
      handleSeasonChange(seasonNumber);
    }, 10);
  }, [handleSeasonChange]);

  // Handler functions
  const handleShowStreams = useCallback(() => {
    if (type === 'series') {
      // If we have watch progress with an episodeId, use that
      if (watchProgress?.episodeId) {
        navigation.navigate('Streams', { 
          id, 
          type, 
          episodeId: watchProgress.episodeId 
        });
        return;
      }
      
      // If we have a specific episodeId from route params, use that
      if (episodeId) {
        navigation.navigate('Streams', { id, type, episodeId });
        return;
      }
      
      // Otherwise, if we have episodes, start with the first one
      if (episodes.length > 0) {
        const firstEpisode = episodes[0];
        const newEpisodeId = firstEpisode.stremioId || `${id}:${firstEpisode.season_number}:${firstEpisode.episode_number}`;
        navigation.navigate('Streams', { id, type, episodeId: newEpisodeId });
        return;
      }
    }
    
    navigation.navigate('Streams', { id, type, episodeId });
  }, [navigation, id, type, episodes, episodeId, watchProgress]);

  const handleSelectCastMember = useCallback((castMember: any) => {
    // Future implementation
  }, []);

  const handleEpisodeSelect = useCallback((episode: Episode) => {
    const episodeId = episode.stremioId || `${id}:${episode.season_number}:${episode.episode_number}`;
    navigation.navigate('Streams', {
      id,
      type,
      episodeId
    });
  }, [navigation, id, type]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Animated styles
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ scale: animations.screenScale.value }],
    opacity: animations.screenOpacity.value
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: animations.contentTranslateY.value }],
    opacity: interpolate(
      animations.contentTranslateY.value,
      [60, 0],
      [0, 1],
      Extrapolate.CLAMP
    )
  }));

  if (loading) {
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.darkBackground }]}
        edges={['bottom']}
      >
        <StatusBar
          translucent={true}
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.lightGray }]}>
            Loading content...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (metadataError || !metadata) {
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.darkBackground }]}
        edges={['bottom']}
      >
        <StatusBar
          translucent={true}
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <View style={styles.errorContainer}>
          <MaterialIcons 
            name="error-outline" 
            size={64} 
            color={colors.textMuted} 
          />
          <Text style={[styles.errorText, { color: colors.text }]}>
            {metadataError || 'Content not found'}
          </Text>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: colors.primary }
            ]}
            onPress={loadMetadata}
          >
            <MaterialIcons 
              name="refresh" 
              size={20} 
              color={colors.white}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.backButton,
              { borderColor: colors.primary }
            ]}
            onPress={handleBack}
          >
            <Text style={[styles.backButtonText, { color: colors.primary }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.darkBackground }]}
      edges={['bottom']}
    >
      <StatusBar
        translucent={true}
        backgroundColor="transparent"
        barStyle="light-content"
        animated={true}
      />
      <Animated.View style={containerAnimatedStyle}>
        {/* Floating Header */}
        <FloatingHeader 
          metadata={metadata}
          logoLoadError={logoLoadError}
          handleBack={handleBack}
          handleToggleLibrary={handleToggleLibrary}
          inLibrary={inLibrary}
          headerOpacity={animations.headerOpacity}
          headerElementsY={animations.headerElementsY}
          headerElementsOpacity={animations.headerElementsOpacity}
          safeAreaTop={safeAreaTop}
          setLogoLoadError={setLogoLoadError}
        />

        <Animated.ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScroll={animations.scrollHandler}
          scrollEventThrottle={16}
        >
          {/* Hero Section */}
          <HeroSection 
            metadata={metadata}
            bannerImage={bannerImage}
            loadingBanner={loadingBanner}
            logoLoadError={logoLoadError}
            scrollY={animations.scrollY}
            dampedScrollY={animations.dampedScrollY}
            heroHeight={animations.heroHeight}
            heroOpacity={animations.heroOpacity}
            heroScale={animations.heroScale}
            logoOpacity={animations.logoOpacity}
            logoScale={animations.logoScale}
            genresOpacity={animations.genresOpacity}
            genresTranslateY={animations.genresTranslateY}
            buttonsOpacity={animations.buttonsOpacity}
            buttonsTranslateY={animations.buttonsTranslateY}
            watchProgressOpacity={animations.watchProgressOpacity}
            watchProgressScaleY={animations.watchProgressScaleY}
                    watchProgress={watchProgress}
                    type={type as 'movie' | 'series'}
                    getEpisodeDetails={getEpisodeDetails}
                    handleShowStreams={handleShowStreams}
            handleToggleLibrary={handleToggleLibrary}
                    inLibrary={inLibrary}
                    id={id}
                    navigation={navigation}
            getPlayButtonText={getPlayButtonText}
            setBannerImage={setBannerImage}
            setLogoLoadError={setLogoLoadError}
                  />

          {/* Main Content */}
          <Animated.View style={contentAnimatedStyle}>
            {/* Metadata Details */}
            <MetadataDetails 
              metadata={metadata}
              imdbId={imdbId}
              type={type as 'movie' | 'series'}
            />

            {/* Add RatingsSection right under the main metadata */}
            {imdbId && (
              <RatingsSection 
                imdbId={imdbId}
                type={type === 'series' ? 'show' : 'movie'} 
              />
            )}

            {/* Cast Section */}
            <CastSection
              cast={cast}
              loadingCast={loadingCast}
              onSelectCastMember={handleSelectCastMember}
            />

            {/* More Like This Section - Only for movies */}
            {type === 'movie' && (
              <MoreLikeThisSection 
                recommendations={recommendations}
                loadingRecommendations={loadingRecommendations}
              />
            )}

            {/* Type-specific content */}
            {type === 'series' ? (
              <SeriesContent
                episodes={episodes}
                selectedSeason={selectedSeason}
                loadingSeasons={loadingSeasons}
                onSeasonChange={handleSeasonChangeWithHaptics}
                onSelectEpisode={handleEpisodeSelect}
                groupedEpisodes={groupedEpisodes}
                metadata={metadata}
              />
            ) : (
              <MovieContent metadata={metadata} />
            )}
          </Animated.View>
        </Animated.ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 0,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 24,
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
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default MetadataScreen;