import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Episode } from '../../../types/metadata';


const EPISODE_PLACEHOLDER = 'https://via.placeholder.com/500x280/1a1a1a/666666?text=No+Preview';

interface EpisodeCardProps {
  episode: Episode;
  metadata?: { poster?: string; id?: string };
  tmdbEpisodeOverrides?: { [key: string]: { vote_average?: number; runtime?: number; still_path?: string } };
  episodeProgress?: { [key: string]: { currentTime: number; duration: number; lastUpdated: number } };
  onPress: () => void;
  currentTheme: any;
  isCurrent?: boolean;
}

export const EpisodeCard: React.FC<EpisodeCardProps> = ({
  episode,
  metadata,
  tmdbEpisodeOverrides,
  episodeProgress,
  onPress,
  currentTheme,
  isCurrent = false,
}) => {
  const { width } = Dimensions.get('window');
  const isTablet = width >= 768;

  // Get episode image
  let episodeImage = EPISODE_PLACEHOLDER;
  if (episode.still_path) {
    if (episode.still_path.startsWith('http')) {
      episodeImage = episode.still_path;
    } else {
      const { tmdbService } = require('../../../services/tmdbService');
      const tmdbUrl = tmdbService.getImageUrl(episode.still_path, 'w500');
      if (tmdbUrl) episodeImage = tmdbUrl;
    }
  } else if (metadata?.poster) {
    episodeImage = metadata.poster;
  }

  const episodeNumber = typeof episode.episode_number === 'number' ? episode.episode_number.toString() : '';
  const seasonNumber = typeof episode.season_number === 'number' ? episode.season_number.toString() : '';
  const episodeString = seasonNumber && episodeNumber ? `S${seasonNumber.padStart(2, '0')}E${episodeNumber.padStart(2, '0')}` : '';

  // Get episode progress
  const episodeId = episode.stremioId || `${metadata?.id}:${episode.season_number}:${episode.episode_number}`;
  const tmdbOverride = tmdbEpisodeOverrides?.[`${metadata?.id}:${episode.season_number}:${episode.episode_number}`];
  const effectiveVote = (tmdbOverride?.vote_average ?? episode.vote_average) || 0;
  const effectiveRuntime = tmdbOverride?.runtime ?? (episode as any).runtime;
  if (!episode.still_path && tmdbOverride?.still_path) {
    const { tmdbService } = require('../../../services/tmdbService');
    const tmdbUrl = tmdbService.getImageUrl(tmdbOverride.still_path, 'w500');
    if (tmdbUrl) episodeImage = tmdbUrl;
  }
  const progress = episodeProgress?.[episodeId];
  const progressPercent = progress ? (progress.currentTime / progress.duration) * 100 : 0;
  const showProgress = progress && progressPercent < 85;

  const formatRuntime = (runtime: number) => {
    if (!runtime) return null;
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <TouchableOpacity
      key={episode.id}
      style={[
        styles.episodeCard,
        isCurrent && { borderWidth: 2, borderColor: currentTheme.colors.primary }
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.episodeImageContainer}>
        <FastImage
          source={{ uri: episodeImage }}
          style={styles.episodeImage}
          resizeMode={FastImage.resizeMode.cover}
        />
        {isCurrent && (
          <View style={styles.currentBadge}>
            <MaterialIcons name="visibility" size={14} color={currentTheme.colors.primary} />
          </View>
        )}
        <View style={styles.episodeNumberBadge}>
          <Text style={styles.episodeNumberText}>{episodeString}</Text>
        </View>
        {showProgress && (
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${progressPercent}%`, backgroundColor: currentTheme.colors.primary }
              ]}
            />
          </View>
        )}
        {progressPercent >= 85 && (
          <View style={[
            styles.completedBadge,
            { backgroundColor: currentTheme.colors.primary }
          ]}>
            <MaterialIcons name="check" size={12} color={currentTheme.colors.white} />
          </View>
        )}
        {(!progress || progressPercent === 0) && (
          <View style={styles.unwatchedBadge} />
        )}
      </View>

      <View style={styles.episodeInfo}>
        <View style={styles.episodeHeader}>
          <Text style={[styles.episodeTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>
            {episode.name}
          </Text>
          <View style={styles.episodeMetadata}>
            {effectiveVote > 0 && (
              <View style={styles.ratingContainer}>
                <Text style={[styles.ratingText, { color: '#F5C518' }]}>
                  {effectiveVote.toFixed(1)}
                </Text>
              </View>
            )}
            {effectiveRuntime && (
              <View style={styles.runtimeContainer}>
                <MaterialIcons name="schedule" size={14} color={currentTheme.colors.textMuted} />
                <Text style={[styles.runtimeText, { color: currentTheme.colors.textMuted }]}>
                  {formatRuntime(effectiveRuntime)}
                </Text>
              </View>
            )}
            {episode.air_date && (
              <Text style={[styles.airDateText, { color: currentTheme.colors.textMuted }]}>
                {formatDate(episode.air_date)}
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.episodeOverview, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={2}>
          {episode.overview || 'No description available'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  episodeCard: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    height: 120,
  },
  episodeImageContainer: {
    position: 'relative',
    width: 120,
    height: 120,
  },
  episodeImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.02 }],
  },
  episodeNumberBadge: {
    position: 'absolute',
    bottom: 8,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 1,
  },
  episodeNumberText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  episodeInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  episodeHeader: {
    marginBottom: 4,
  },
  episodeTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  episodeMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  runtimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  runtimeText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  airDateText: {
    fontSize: 12,
    opacity: 0.8,
  },
  episodeOverview: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  progressBar: {
    height: '100%',
  },
  completedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 2,
  },
  unwatchedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.85,
  },
  currentBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
});

