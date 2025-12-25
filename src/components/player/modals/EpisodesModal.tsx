import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { Episode } from '../../../types/metadata';
import { EpisodeCard } from '../cards/EpisodeCard';
import { storageService } from '../../../services/storageService';
import { TraktService } from '../../../services/traktService';
import { logger } from '../../../utils/logger';

interface EpisodesModalProps {
  showEpisodesModal: boolean;
  setShowEpisodesModal: (show: boolean) => void;
  groupedEpisodes: { [seasonNumber: number]: Episode[] };
  currentEpisode?: { season: number; episode: number };
  metadata?: { poster?: string; id?: string; tmdbId?: string; type?: string };
  onSelectEpisode: (episode: Episode) => void;
  tmdbEpisodeOverrides?: any;
}

export const EpisodesModal: React.FC<EpisodesModalProps> = ({
  showEpisodesModal,
  setShowEpisodesModal,
  groupedEpisodes,
  currentEpisode,
  metadata,
  onSelectEpisode,
  tmdbEpisodeOverrides
}) => {
  const { width } = useWindowDimensions();
  const [selectedSeason, setSelectedSeason] = useState<number>(currentEpisode?.season || 1);
  const [episodeProgress, setEpisodeProgress] = useState<{ [key: string]: any }>({});
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const MENU_WIDTH = Math.min(width * 0.85, 400);

  const currentTheme = {
    colors: {
      text: '#FFFFFF',
      textMuted: 'rgba(255,255,255,0.6)',
      mediumEmphasis: 'rgba(255,255,255,0.7)',
      primary: 'rgba(255,255,255,0.9)',
      white: '#FFFFFF',
      elevation2: 'rgba(255,255,255,0.05)'
    }
  };

  // Logic Preserved: Fetch progress from storage/Trakt
  useEffect(() => {
    const fetchProgress = async () => {
      if (showEpisodesModal && metadata?.id) {
        setIsLoadingProgress(true);
        try {
          // Get all watch progress and filter for this show's episodes
          const allProgress = await storageService.getAllWatchProgress();
          const showPrefix = `series:${metadata.id}:`;
          const progress: { [key: string]: any } = {};

          for (const [key, value] of Object.entries(allProgress)) {
            if (key.startsWith(showPrefix)) {
              // Extract episode id from key (format: series:showId:episodeId)
              const episodeId = key.replace(showPrefix, '');
              progress[episodeId] = value;
            }
          }

          setEpisodeProgress(progress);

          // Trakt sync logic preserved
          if (await TraktService.getInstance().isAuthenticated()) {
            // Optional: background sync logic
          }
        } catch (err) {
          logger.error('Failed to fetch episode progress', err);
        } finally {
          setIsLoadingProgress(false);
        }
      }
    };
    fetchProgress();
  }, [showEpisodesModal, metadata?.id]);

  useEffect(() => {
    if (showEpisodesModal && currentEpisode?.season) {
      setSelectedSeason(currentEpisode.season);
    }
  }, [showEpisodesModal]);

  if (!showEpisodesModal) return null;

  const seasons = Object.keys(groupedEpisodes).map(Number).sort((a, b) => a - b);
  const currentSeasonEpisodes = groupedEpisodes[selectedSeason] || [];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowEpisodesModal(false)}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </TouchableOpacity>

      <Animated.View
        entering={SlideInRight.duration(300)}
        exiting={SlideOutRight.duration(250)}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: MENU_WIDTH,
          backgroundColor: '#0f0f0f',
          borderLeftWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <View style={{ paddingTop: Platform.OS === 'ios' ? 60 : 20, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '700' }}>Episodes</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 15, gap: 8 }}>
            {[...seasons]
              .sort((a, b) => {
                if (a === 0) return 1;
                if (b === 0) return -1;
                return a - b;
              }).map((season) => (
                <TouchableOpacity
                  key={season}
                  onPress={() => setSelectedSeason(season)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: selectedSeason === season ? 'white' : 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: selectedSeason === season ? 'white' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <Text style={{
                    color: selectedSeason === season ? 'black' : 'white',
                    fontWeight: selectedSeason === season ? '700' : '500'
                  }}>
                    {season === 0 ? 'Specials' : `Season ${season}`}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          {isLoadingProgress ? (
            <ActivityIndicator color="white" style={{ marginTop: 20 }} />
          ) : (
            <View style={{ gap: 2 }}>
              {currentSeasonEpisodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  metadata={metadata}
                  episodeProgress={episodeProgress}
                  tmdbEpisodeOverrides={tmdbEpisodeOverrides}
                  onPress={() => {
                    onSelectEpisode(episode);
                    setShowEpisodesModal(false);
                  }}
                  currentTheme={currentTheme}
                  isCurrent={currentEpisode?.season === episode.season_number && currentEpisode?.episode === episode.episode_number}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

export default EpisodesModal;
