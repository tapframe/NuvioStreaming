import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import StreamCard from '../../../components/StreamCard';
import { Stream } from '../../../types/metadata';
import { StreamSection, GroupedStreams, LoadingProviders, ScraperLogos } from '../types';

interface StreamsListProps {
  sections: StreamSection[];
  streams: GroupedStreams;
  loadingProviders: LoadingProviders;
  loadingStreams: boolean;
  loadingEpisodeStreams: boolean;
  hasStremioStreamProviders: boolean;
  isAutoplayWaiting: boolean;
  autoplayTriggered: boolean;
  handleStreamPress: (stream: Stream) => void;
  openAlert: (title: string, message: string) => void;
  settings: any;
  currentTheme: any;
  colors: any;
  scraperLogos: ScraperLogos;
  metadata?: any;
  type: string;
  currentEpisode?: any;
  episodeImage?: string | null;
  id: string;
  imdbId?: string;
}

const StreamsList = memo(
  ({
    sections,
    streams,
    loadingProviders,
    loadingStreams,
    loadingEpisodeStreams,
    hasStremioStreamProviders,
    isAutoplayWaiting,
    autoplayTriggered,
    handleStreamPress,
    openAlert,
    settings,
    currentTheme,
    colors,
    scraperLogos,
    metadata,
    type,
    currentEpisode,
    episodeImage,
    id,
    imdbId,
  }: StreamsListProps) => {
    const insets = useSafeAreaInsets();
    const styles = React.useMemo(() => createStyles(colors), [colors]);

    const renderSectionHeader = useCallback(
      ({ section }: { section: StreamSection }) => {
        const isProviderLoading = loadingProviders[section.addonId];

        return (
          <View style={styles.sectionHeaderContainer}>
            <View style={styles.sectionHeaderContent}>
              <Text style={styles.streamGroupTitle}>{section.title}</Text>
              {isProviderLoading && (
                <View style={styles.sectionLoadingIndicator}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.sectionLoadingText, { color: colors.primary }]}>
                    Loading...
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      },
      [loadingProviders, styles, colors.primary]
    );

    return (
      <View collapsable={false} style={{ flex: 1 }}>
        {/* Autoplay overlay */}
        {isAutoplayWaiting && !autoplayTriggered && (
          <View style={styles.autoplayOverlay}>
            <View style={styles.autoplayIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.autoplayText}>Starting best stream...</Text>
            </View>
          </View>
        )}

        <ScrollView
          style={styles.streamsContent}
          contentContainerStyle={[
            styles.streamsContainer,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={true}
          overScrollMode="never"
          {...(Platform.OS === 'ios' && {
            removeClippedSubviews: false,
            scrollEventThrottle: 16,
          })}
        >
          {sections.filter(Boolean).map((section, sectionIndex) => (
            <View key={section!.addonId || sectionIndex}>
              {renderSectionHeader({ section: section! })}

              {section!.data && section!.data.length > 0 ? (
                <FlatList
                  data={section!.data}
                  keyExtractor={(item, index) => {
                    if (item && item.url) {
                      return `${item.url}-${sectionIndex}-${index}`;
                    }
                    return `empty-${sectionIndex}-${index}`;
                  }}
                  renderItem={({ item, index }) => (
                    <View>
                      <StreamCard
                        stream={item}
                        onPress={() => handleStreamPress(item)}
                        index={index}
                        isLoading={false}
                        statusMessage={undefined}
                        theme={currentTheme}
                        showLogos={settings.showScraperLogos}
                        scraperLogo={
                          (item.addonId && scraperLogos[item.addonId]) ||
                          ((item as any).addon ? scraperLogos[(item.addonId || (item as any).addon) as string] || null : null)
                        }
                        showAlert={(t: string, m: string) => openAlert(t, m)}
                        parentTitle={metadata?.name}
                        parentType={type as 'movie' | 'series'}
                        parentSeason={
                          (type === 'series' || type === 'other') ? currentEpisode?.season_number : undefined
                        }
                        parentEpisode={
                          (type === 'series' || type === 'other') ? currentEpisode?.episode_number : undefined
                        }
                        parentEpisodeTitle={
                          (type === 'series' || type === 'other') ? currentEpisode?.name : undefined
                        }
                        parentPosterUrl={episodeImage || metadata?.poster || undefined}
                        providerName={
                          streams &&
                          Object.keys(streams).find(pid =>
                            (streams as any)[pid]?.streams?.includes?.(item)
                          )
                        }
                        parentId={id}
                        parentImdbId={imdbId}
                      />
                    </View>
                  )}
                  scrollEnabled={false}
                  initialNumToRender={6}
                  maxToRenderPerBatch={2}
                  windowSize={3}
                  removeClippedSubviews={true}
                  showsVerticalScrollIndicator={false}
                  getItemLayout={(data, index) => ({
                    length: 78,
                    offset: 78 * index,
                    index,
                  })}
                />
              ) : null}
            </View>
          ))}

          {/* Footer Loading */}
          {(loadingStreams || loadingEpisodeStreams) && hasStremioStreamProviders && (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.footerLoadingText}>Loading more sources...</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }
);

const createStyles = (colors: any) =>
  StyleSheet.create({
    streamsContent: {
      flex: 1,
      width: '100%',
      zIndex: 2,
    },
    streamsContainer: {
      paddingHorizontal: 12,
      paddingBottom: 20,
      width: '100%',
    },
    streamGroupTitle: {
      color: colors.highEmphasis,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 6,
      marginTop: 0,
      opacity: 0.9,
      backgroundColor: 'transparent',
    },
    sectionHeaderContainer: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    sectionHeaderContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionLoadingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionLoadingText: {
      marginLeft: 8,
    },
    autoplayOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: 16,
      alignItems: 'center',
      zIndex: 10,
    },
    autoplayIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.elevation2,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
    },
    autoplayText: {
      color: colors.primary,
      fontSize: 14,
      marginLeft: 8,
      fontWeight: '600',
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

StreamsList.displayName = 'StreamsList';

export default StreamsList;
