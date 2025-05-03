import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
  Platform,
  StatusBar,
  Dimensions
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList, RootStackNavigationProp } from '../navigation/AppNavigator';
import { useMetadata } from '../hooks/useMetadata';
import { colors } from '../styles/colors';
import { Stream } from '../types/metadata';
import { useSettings } from '../hooks/useSettings';
import Animated, {
  FadeIn,
  withTiming,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolate,
  cancelAnimation
} from 'react-native-reanimated';
import { logger } from '../utils/logger';

// Import custom components
import StreamCard from '../components/streams/StreamCard';
import ProviderFilter from '../components/streams/ProviderFilter';
import MovieHero from '../components/streams/MovieHero';
import EpisodeHero from '../components/streams/EpisodeHero';

// Import custom hooks
import { useStreamNavigation } from '../hooks/useStreamNavigation';
import { useStreamProviders } from '../hooks/useStreamProviders';

export const StreamsScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Streams'>>();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { id, type, episodeId } = route.params;
  const { settings } = useSettings();
  
  // Track loading initialization to prevent duplicate loads
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const {
    metadata,
    episodes,
    groupedStreams,
    loadingStreams,
    episodeStreams,
    loadingEpisodeStreams,
    selectedEpisode,
    loadStreams,
    loadEpisodeStreams,
    setSelectedEpisode,
    groupedEpisodes,
  } = useMetadata({ id, type });

  // Optimize animation values with cleanup
  const headerOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.95);
  const filterOpacity = useSharedValue(0);

  // Use custom hooks
  const {
    selectedProvider,
    filterItems,
    filteredSections,
    handleProviderChange,
    loadingProviders,
    providerStatus,
    setLoadingProviders
  } = useStreamProviders(
    groupedStreams,
    episodeStreams,
    type,
    loadingStreams,
    loadingEpisodeStreams
  );

  // Load initial streams only once
  useEffect(() => {
    if (initialLoadComplete) return;
    
    if (type === 'series' && episodeId) {
      logger.log(`🎬 Loading episode streams for: ${episodeId}`);
      setLoadingProviders({
        'stremio': true
      });
      setSelectedEpisode(episodeId);
      loadEpisodeStreams(episodeId);
      setInitialLoadComplete(true);
    } else if (type === 'movie') {
      logger.log(`🎬 Loading movie streams for: ${id}`);
      setLoadingProviders({
        'stremio': true
      });
      loadStreams();
      setInitialLoadComplete(true);
    }
  }, [
    initialLoadComplete, 
    type, 
    episodeId, 
    id, 
    loadEpisodeStreams, 
    loadStreams, 
    setSelectedEpisode, 
    setLoadingProviders
  ]);

  // Animation effects
  useEffect(() => {
    // Trigger entrance animations
    headerOpacity.value = withTiming(1, { duration: 400 });
    heroScale.value = withTiming(1, { duration: 400 });
    filterOpacity.value = withTiming(1, { duration: 500 });

    return () => {
      // Cleanup animations on unmount
      cancelAnimation(headerOpacity);
      cancelAnimation(heroScale);
      cancelAnimation(filterOpacity);
    };
  }, [headerOpacity, heroScale, filterOpacity]);

  const currentEpisode = useMemo(() => {
    if (!selectedEpisode) return null;

    // Search through all episodes in all seasons
    const allEpisodes = Object.values(groupedEpisodes).flat();
    return allEpisodes.find(ep => 
      ep.stremioId === selectedEpisode || 
      `${id}:${ep.season_number}:${ep.episode_number}` === selectedEpisode
    );
  }, [selectedEpisode, groupedEpisodes, id]);

  // Use navigation hook
  const { handleStreamPress } = useStreamNavigation({
    metadata,
    currentEpisode,
    id,
    type,
    selectedEpisode: selectedEpisode || undefined,
    useExternalPlayer: settings.useExternalPlayer,
    preferredPlayer: settings.preferredPlayer as 'internal' | 'vlc' | 'outplayer' | 'infuse' | 'vidhub' | 'external'
  });

  // Memoize handlers
  const handleBack = useCallback(() => {
    const cleanup = () => {
      headerOpacity.value = withTiming(0, { duration: 200 });
      heroScale.value = withTiming(0.95, { duration: 200 });
      filterOpacity.value = withTiming(0, { duration: 200 });
    };
    cleanup();
    
    // For series episodes, always replace current screen with metadata screen
    if (type === 'series') {
      navigation.replace('Metadata', {
        id: id,
        type: type
      });
    } else {
      navigation.goBack();
    }
  }, [navigation, headerOpacity, heroScale, filterOpacity, type, id]);

  const isLoading = type === 'series' ? loadingEpisodeStreams : loadingStreams;
  const streams = type === 'series' ? episodeStreams : groupedStreams;

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value }],
    opacity: headerOpacity.value
  }));

  const filterStyle = useAnimatedStyle(() => ({
    opacity: filterOpacity.value,
    transform: [
      { 
        translateY: interpolate(
          filterOpacity.value,
          [0, 1],
          [20, 0],
          Extrapolate.CLAMP
        )
      }
    ]
  }));

  const renderItem = useCallback(({ item, index, section }: { item: Stream; index: number; section: any }) => {
    const stream = item;
    const isLoading = loadingProviders[section.addonId];
    
    return (
      <StreamCard 
        key={`${stream.url}-${index}`}
        stream={stream} 
        onPress={() => handleStreamPress(stream)} 
        index={index}
        isLoading={isLoading}
        statusMessage={providerStatus[section.addonId]?.message}
      />
    );
  }, [handleStreamPress, loadingProviders, providerStatus]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string } }) => (
    <Animated.View
      entering={FadeIn.duration(300)}
    >
      <Text style={styles.streamGroupTitle}>{section.title}</Text>
    </Animated.View>
  ), []);

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      
      {/* Back Button */}
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[styles.backButtonContainer]}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.backButtonText}>
            {type === 'series' ? 'Back to Episodes' : 'Back to Info'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Movie Hero */}
      {type === 'movie' && metadata && (
        <MovieHero metadata={metadata} animatedStyle={heroStyle} />
      )}

      {/* Episode Hero */}
      {type === 'series' && currentEpisode && (
        <EpisodeHero 
          currentEpisode={currentEpisode} 
          metadata={metadata} 
          animatedStyle={heroStyle}
        />
      )}

      {/* Stream List */}
      <View style={[
        styles.streamsMainContent,
        type === 'movie' && styles.streamsMainContentMovie
      ]}>
        {/* Provider Filter */}
        <Animated.View style={[styles.filterContainer, filterStyle]}>
          {Object.keys(streams).length > 0 && (
            <ProviderFilter
              selectedProvider={selectedProvider}
              providers={filterItems}
              onSelect={handleProviderChange}
            />
          )}
        </Animated.View>

        {/* Loading or Empty State */}
        {isLoading && Object.keys(streams).length === 0 ? (
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.loadingContainer}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Finding available streams...</Text>
          </Animated.View>
        ) : Object.keys(streams).length === 0 ? (
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.noStreams}
          >
            <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
            <Text style={styles.noStreamsText}>No streams available</Text>
          </Animated.View>
        ) : (
          <View collapsable={false} style={{ flex: 1 }}>
            <SectionList
              sections={filteredSections}
              keyExtractor={(item) => item.url || `${item.name}-${item.title}`}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              initialNumToRender={8}
              maxToRenderPerBatch={4}
              windowSize={5}
              removeClippedSubviews={false}
              contentContainerStyle={styles.streamsContainer}
              style={styles.streamsContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
              overScrollMode="never"
              ListFooterComponent={
                isLoading ? (
                  <View style={styles.footerLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.footerLoadingText}>Loading more sources...</Text>
                  </View>
                ) : null
              }
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    pointerEvents: 'box-none',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    paddingTop: Platform.OS === 'android' ? 35 : 45,
  },
  backButtonText: {
    color: colors.highEmphasis,
    fontSize: 13,
    fontWeight: '600',
  },
  streamsMainContent: {
    flex: 1,
    backgroundColor: colors.darkBackground,
    paddingTop: 20,
    zIndex: 1,
  },
  streamsMainContentMovie: {
    paddingTop: Platform.OS === 'android' ? 90 : 100,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  streamsContent: {
    flex: 1,
    width: '100%',
    zIndex: 2,
  },
  streamsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    width: '100%',
  },
  streamGroupTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 0,
    backgroundColor: 'transparent',
  },
  noStreams: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  noStreamsText: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    color: colors.primary,
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  footerLoadingText: {
    color: colors.primary,
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '500',
  },
});

export default React.memo(StreamsScreen); 