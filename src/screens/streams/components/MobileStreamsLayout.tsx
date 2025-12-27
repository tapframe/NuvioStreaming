import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { NavigationProp } from '@react-navigation/native';

import AnimatedImage from '../../../components/AnimatedImage';
import ProviderFilter from '../../../components/ProviderFilter';
import PulsingChip from '../../../components/PulsingChip';
import EpisodeHero from './EpisodeHero';
import MovieHero from './MovieHero';
import StreamsList from './StreamsList';
import { Stream } from '../../../types/metadata';
import { StreamSection, FilterItem, GroupedStreams, LoadingProviders, ScraperLogos } from '../types';

// Lazy-safe community blur import for Android
let AndroidBlurView: any = null;
if (Platform.OS === 'android') {
  try {
    AndroidBlurView = require('@react-native-community/blur').BlurView;
  } catch (_) {
    AndroidBlurView = null;
  }
}

interface MobileStreamsLayoutProps {
  // Navigation
  navigation: NavigationProp<any>;
  
  // Theme
  currentTheme: any;
  colors: any;
  settings: any;
  
  // Type
  type: string;
  
  // Metadata
  metadata: any;
  currentEpisode: any;
  selectedEpisode: string | undefined;
  
  // Movie hero
  movieLogoError: boolean;
  setMovieLogoError: (error: boolean) => void;
  
  // Episode hero
  episodeImage: string | null;
  effectiveEpisodeVote: number;
  effectiveEpisodeRuntime?: number;
  hasIMDbRating: boolean;
  gradientColors: [string, string, string, string, string];
  
  // Backdrop
  mobileBackdropSource: string | null | undefined;
  
  // Streams
  sections: StreamSection[];
  streams: GroupedStreams;
  filterItems: FilterItem[];
  selectedProvider: string;
  handleProviderChange: (provider: string) => void;
  handleStreamPress: (stream: Stream) => void;
  
  // Loading
  loadingProviders: LoadingProviders;
  loadingStreams: boolean;
  loadingEpisodeStreams: boolean;
  hasStremioStreamProviders: boolean;
  streamsEmpty: boolean;
  showInitialLoading: boolean;
  showStillFetching: boolean;
  showNoSourcesError: boolean;
  
  // Autoplay
  isAutoplayWaiting: boolean;
  autoplayTriggered: boolean;
  
  // Scrapers
  activeFetchingScrapers: string[];
  scraperLogos: ScraperLogos;
  
  // Alert
  openAlert: (title: string, message: string) => void;
  
  // IDs
  id: string;
  imdbId?: string;
}

const MobileStreamsLayout = memo(
  ({
    navigation,
    currentTheme,
    colors,
    settings,
    type,
    metadata,
    currentEpisode,
    selectedEpisode,
    movieLogoError,
    setMovieLogoError,
    episodeImage,
    effectiveEpisodeVote,
    effectiveEpisodeRuntime,
    hasIMDbRating,
    gradientColors,
    mobileBackdropSource,
    sections,
    streams,
    filterItems,
    selectedProvider,
    handleProviderChange,
    handleStreamPress,
    loadingProviders,
    loadingStreams,
    loadingEpisodeStreams,
    hasStremioStreamProviders,
    streamsEmpty,
    showInitialLoading,
    showStillFetching,
    showNoSourcesError,
    isAutoplayWaiting,
    autoplayTriggered,
    activeFetchingScrapers,
    scraperLogos,
    openAlert,
    id,
    imdbId,
  }: MobileStreamsLayoutProps) => {
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const isEpisode = metadata?.videos && metadata.videos.length > 1 && selectedEpisode;

    return (
      <>
        {/* Full Screen Background */}
        {settings.enableStreamsBackdrop ? (
          <View style={StyleSheet.absoluteFill}>
            {mobileBackdropSource ? (
              <AnimatedImage
                source={{ uri: mobileBackdropSource }}
                style={styles.mobileFullScreenBackground}
                contentFit="cover"
              />
            ) : (
              <View style={styles.mobileNoBackdropBackground} />
            )}
            {Platform.OS === 'android' && AndroidBlurView ? (
              <AndroidBlurView
                blurAmount={15}
                blurRadius={25}
                overlayColor="rgba(0,0,0,0.85)"
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <ExpoBlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            {Platform.OS === 'ios' && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.8)' }]} />
            )}
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.darkBackground }]} />
        )}

        {/* Movie Hero */}
        {type === 'movie' && metadata && (
          <MovieHero
            metadata={metadata}
            movieLogoError={movieLogoError}
            setMovieLogoError={setMovieLogoError}
            colors={colors}
            enableStreamsBackdrop={settings.enableStreamsBackdrop}
          />
        )}

        {/* Episode Hero */}
        {currentEpisode && (
          <EpisodeHero
            episodeImage={episodeImage}
            currentEpisode={currentEpisode}
            effectiveEpisodeVote={effectiveEpisodeVote}
            effectiveEpisodeRuntime={effectiveEpisodeRuntime}
            hasIMDbRating={hasIMDbRating}
            gradientColors={gradientColors}
            colors={colors}
            enableStreamsBackdrop={settings.enableStreamsBackdrop}
          />
        )}

        {/* Hero blend overlay for episodes */}
        {isEpisode && (
          <View style={styles.heroBlendOverlay}>
            <LinearGradient
              colors={
                settings.enableStreamsBackdrop
                  ? ['rgba(0,0,0,0.98)', 'rgba(0,0,0,0.85)', 'transparent']
                  : [colors.darkBackground, colors.darkBackground, 'transparent']
              }
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}

        {/* Main Content */}
        <View
          style={[
            styles.streamsMainContent,
            type === 'movie' && styles.streamsMainContentMovie,
            !settings.enableStreamsBackdrop && { backgroundColor: colors.darkBackground },
          ]}
        >
          {/* Provider Filter */}
          <View style={styles.filterContainer}>
            {!streamsEmpty && (
              <ProviderFilter
                selectedProvider={selectedProvider}
                providers={filterItems}
                onSelect={handleProviderChange}
                theme={currentTheme}
              />
            )}
          </View>

          {/* Active Scrapers Status */}
          {activeFetchingScrapers.length > 0 && (
            <View style={styles.activeScrapersContainer}>
              <Text style={styles.activeScrapersTitle}>Fetching from:</Text>
              <View style={styles.activeScrapersRow}>
                {activeFetchingScrapers.map((scraperName, index) => (
                  <PulsingChip key={scraperName} text={scraperName} delay={index * 200} />
                ))}
              </View>
            </View>
          )}

          {/* Content */}
          {showNoSourcesError ? (
            <View style={styles.noStreams}>
              <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
              <Text style={styles.noStreamsText}>No streaming sources available</Text>
              <Text style={styles.noStreamsSubText}>Please add streaming sources in settings</Text>
              <TouchableOpacity
                style={styles.addSourcesButton}
                onPress={() => navigation.navigate('Addons' as never)}
              >
                <Text style={styles.addSourcesButtonText}>Add Sources</Text>
              </TouchableOpacity>
            </View>
          ) : streamsEmpty ? (
            showInitialLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>
                  {isAutoplayWaiting ? 'Finding best stream for autoplay...' : 'Finding available streams...'}
                </Text>
              </View>
            ) : showStillFetching ? (
              <View style={styles.loadingContainer}>
                <MaterialIcons name="hourglass-bottom" size={32} color={colors.primary} />
                <Text style={styles.loadingText}>Still fetching streams…</Text>
              </View>
            ) : (
              <View style={styles.noStreams}>
                <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
                <Text style={styles.noStreamsText}>No streams available</Text>
              </View>
            )
          ) : (
            <StreamsList
              sections={sections}
              streams={streams}
              loadingProviders={loadingProviders}
              loadingStreams={loadingStreams}
              loadingEpisodeStreams={loadingEpisodeStreams}
              hasStremioStreamProviders={hasStremioStreamProviders}
              isAutoplayWaiting={isAutoplayWaiting}
              autoplayTriggered={autoplayTriggered}
              handleStreamPress={handleStreamPress}
              openAlert={openAlert}
              settings={settings}
              currentTheme={currentTheme}
              colors={colors}
              scraperLogos={scraperLogos}
              metadata={metadata}
              type={type}
              currentEpisode={currentEpisode}
              episodeImage={episodeImage}
              id={id}
              imdbId={imdbId}
            />
          )}
        </View>
      </>
    );
  }
);

const createStyles = (colors: any) =>
  StyleSheet.create({
    mobileFullScreenBackground: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    mobileNoBackdropBackground: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.darkBackground,
    },
    heroBlendOverlay: {
      position: 'absolute',
      top: 140,
      left: 0,
      right: 0,
      height: Platform.OS === 'android' ? 95 : 180,
      zIndex: 0,
      pointerEvents: 'none',
    },
    streamsMainContent: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingTop: 12,
      zIndex: 1,
      ...(Platform.OS === 'ios' && {
        opacity: 1,
        shouldRasterizeIOS: false,
      }),
    },
    streamsMainContentMovie: {
      paddingTop: Platform.OS === 'android' ? 10 : 15,
    },
    filterContainer: {
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    activeScrapersContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: 'transparent',
      marginHorizontal: 16,
      marginBottom: 4,
    },
    activeScrapersTitle: {
      color: colors.mediumEmphasis,
      fontSize: 12,
      fontWeight: '500',
      marginBottom: 6,
      opacity: 0.8,
    },
    activeScrapersRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
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
    noStreamsSubText: {
      color: colors.mediumEmphasis,
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
    },
    addSourcesButton: {
      marginTop: 24,
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    addSourcesButtonText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '600',
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
  });

MobileStreamsLayout.displayName = 'MobileStreamsLayout';

export default MobileStreamsLayout;
