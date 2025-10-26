import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
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
  metadata?: { poster?: string; id?: string };
  onSelectEpisode: (episode: Episode) => void;
}

const { width } = Dimensions.get('window');
const MENU_WIDTH = Math.min(width * 0.85, 400);

export const EpisodesModal: React.FC<EpisodesModalProps> = ({
  showEpisodesModal,
  setShowEpisodesModal,
  groupedEpisodes,
  currentEpisode,
  metadata,
  onSelectEpisode,
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number>(currentEpisode?.season || 1);
  const [episodeProgress, setEpisodeProgress] = useState<{ [key: string]: { currentTime: number; duration: number; lastUpdated: number } }>({});
  const [tmdbEpisodeOverrides, setTmdbEpisodeOverrides] = useState<{ [epKey: string]: { vote_average?: number; runtime?: number; still_path?: string } }>({});
  const [currentTheme, setCurrentTheme] = useState({ 
    colors: { 
      text: '#FFFFFF', 
      textMuted: 'rgba(255,255,255,0.6)',
      mediumEmphasis: 'rgba(255,255,255,0.7)',
      primary: '#3B82F6',
      white: '#FFFFFF',
      elevation2: 'rgba(255,255,255,0.05)'
    }
  });

  useEffect(() => {
    if (currentEpisode?.season) {
      setSelectedSeason(currentEpisode.season);
    }
  }, [currentEpisode]);

  const loadEpisodesProgress = async () => {
    if (!metadata?.id) return;
    
    const allProgress = await storageService.getAllWatchProgress();
    const progress: { [key: string]: { currentTime: number; duration: number; lastUpdated: number } } = {};
    
    const currentSeasonEpisodes = groupedEpisodes[selectedSeason] || [];
    currentSeasonEpisodes.forEach(episode => {
      const episodeId = episode.stremioId || `${metadata.id}:${episode.season_number}:${episode.episode_number}`;
      const key = `series:${metadata.id}:${episodeId}`;
      if (allProgress[key]) {
        progress[episodeId] = {
          currentTime: allProgress[key].currentTime,
          duration: allProgress[key].duration,
          lastUpdated: allProgress[key].lastUpdated
        };
      }
    });
    
    // Trakt watched-history integration
    try {
      const traktService = TraktService.getInstance();
      const isAuthed = await traktService.isAuthenticated();
      if (isAuthed && metadata?.id) {
        const historyItems = await traktService.getWatchedEpisodesHistory(1, 400);

        historyItems.forEach(item => {
          if (item.type !== 'episode') return;

          const showImdb = item.show?.ids?.imdb ? `tt${item.show.ids.imdb.replace(/^tt/, '')}` : null;
          if (!showImdb || showImdb !== metadata.id) return;

          const season = item.episode?.season;
          const epNum = item.episode?.number;
          if (season === undefined || epNum === undefined) return;

          const episodeId = `${metadata.id}:${season}:${epNum}`;
          const watchedAt = new Date(item.watched_at).getTime();

          const traktProgressEntry = {
            currentTime: 1,
            duration: 1,
            lastUpdated: watchedAt,
          };

          const existing = progress[episodeId];
          const existingPercent = existing ? (existing.currentTime / existing.duration) * 100 : 0;

          if (!existing || existingPercent < 85) {
            progress[episodeId] = traktProgressEntry;
          }
        });
      }
    } catch (err) {
      logger.error('[EpisodesModal] Failed to merge Trakt history:', err);
    }
    
    setEpisodeProgress(progress);
  };

  useEffect(() => {
    loadEpisodesProgress();
  }, [selectedSeason, metadata?.id]);

  const handleClose = () => {
    setShowEpisodesModal(false);
  };

  if (!showEpisodesModal) return null;

  const seasons = Object.keys(groupedEpisodes).map(Number).sort((a, b) => a - b);
  const currentSeasonEpisodes = groupedEpisodes[selectedSeason] || [];

  const isEpisodeCurrent = (episode: Episode) => {
    return currentEpisode && 
           episode.season_number === currentEpisode.season && 
           episode.episode_number === currentEpisode.episode;
  };

  return (
    <>
      {/* Backdrop */}
      <Animated.View 
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
        }}
      >
        <TouchableOpacity 
          style={{ flex: 1 }}
          onPress={handleClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Side Menu */}
      <Animated.View
        entering={SlideInRight.duration(300)}
        exiting={SlideOutRight.duration(250)}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: MENU_WIDTH,
          backgroundColor: '#1A1A1A',
          zIndex: 9999,
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: { width: -5, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
          borderTopLeftRadius: 20,
          borderBottomLeftRadius: 20,
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 60,
          paddingBottom: 20,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        }}>
          <Text style={{
            color: '#FFFFFF',
            fontSize: 22,
            fontWeight: '700',
          }}>
            Episodes
          </Text>
          <TouchableOpacity 
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <MaterialIcons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Season Selector */}
        <View 
          style={{
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255, 255, 255, 0.08)',
            paddingVertical: 6,
          }}
        >
          <ScrollView 
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
            }}
          >
            {seasons.map((season) => (
              <TouchableOpacity
                key={season}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginRight: 8,
                  backgroundColor: selectedSeason === season ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  borderWidth: 1,
                  borderColor: selectedSeason === season ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                }}
                onPress={() => setSelectedSeason(season)}
                activeOpacity={0.7}
              >
                <Text style={{
                  color: selectedSeason === season ? '#3B82F6' : '#FFFFFF',
                  fontSize: 13,
                  fontWeight: selectedSeason === season ? '700' : '500',
                }}>
                  Season {season}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Episodes List */}
        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {currentSeasonEpisodes.length > 0 ? (
            currentSeasonEpisodes.map((episode, index) => {
              const isCurrent = isEpisodeCurrent(episode);
              
              return (
                <View
                  key={episode.id}
                  style={{
                    opacity: isCurrent ? 1 : 1,
                    marginBottom: index < currentSeasonEpisodes.length - 1 ? 16 : 0,
                  }}
                >
                  <EpisodeCard
                    episode={episode}
                    metadata={metadata}
                    tmdbEpisodeOverrides={tmdbEpisodeOverrides}
                    episodeProgress={episodeProgress}
                    onPress={() => onSelectEpisode(episode)}
                    currentTheme={currentTheme}
                    isCurrent={isCurrent}
                  />
                </View>
              );
            })
          ) : (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 16,
              padding: 20,
              alignItems: 'center',
            }}>
              <MaterialIcons name="error-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: 16,
                marginTop: 16,
                textAlign: 'center',
              }}>
                No episodes available for Season {selectedSeason}
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
};

