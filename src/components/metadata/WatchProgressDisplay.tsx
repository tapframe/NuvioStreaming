import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors } from '../../styles/colors';

interface WatchProgressDisplayProps {
  watchProgress: { 
    currentTime: number; 
    duration: number; 
    lastUpdated: number; 
    episodeId?: string 
  } | null;
  type: 'movie' | 'series';
  getEpisodeDetails: (episodeId: string) => { 
    seasonNumber: string; 
    episodeNumber: string; 
    episodeName: string 
  } | null;
  animatedStyle: any;
}

const WatchProgressDisplay = React.memo(({ 
  watchProgress, 
  type, 
  getEpisodeDetails, 
  animatedStyle 
}: WatchProgressDisplayProps) => {
  if (!watchProgress || watchProgress.duration === 0) {
    return null;
  }

  const progressPercent = (watchProgress.currentTime / watchProgress.duration) * 100;
  const formattedTime = new Date(watchProgress.lastUpdated).toLocaleDateString();
  let episodeInfo = '';

  if (type === 'series' && watchProgress.episodeId) {
    const details = getEpisodeDetails(watchProgress.episodeId);
    if (details) {
      episodeInfo = ` • S${details.seasonNumber}:E${details.episodeNumber}${details.episodeName ? ` - ${details.episodeName}` : ''}`;
    }
  }

  return (
    <Animated.View style={[styles.watchProgressContainer, animatedStyle]}>
      <View style={styles.watchProgressBar}>
        <View 
          style={[
            styles.watchProgressFill, 
            { width: `${progressPercent}%` }
          ]} 
        />
      </View>
      <Text style={styles.watchProgressText}>
        {progressPercent >= 95 ? 'Watched' : `${Math.round(progressPercent)}% watched`}{episodeInfo} • Last watched on {formattedTime}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  watchProgressContainer: {
    marginTop: 6,
    marginBottom: 8,
    width: '100%',
    alignItems: 'center',
    overflow: 'hidden',
    height: 48,
  },
  watchProgressBar: {
    width: '75%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginBottom: 6
  },
  watchProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 1.5,
  },
  watchProgressText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.9,
    letterSpacing: 0.2
  },
});

export default WatchProgressDisplay; 