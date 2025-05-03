import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import Animated from 'react-native-reanimated';
import { colors } from '../../styles/colors';
import { TMDBService } from '../../services/tmdbService';
import { logger } from '../../utils/logger';

interface ActionButtonsProps {
  handleShowStreams: () => void;
  toggleLibrary: () => void;
  inLibrary: boolean;
  type: 'movie' | 'series';
  id: string;
  navigation: NavigationProp<RootStackParamList>;
  playButtonText: string;
  animatedStyle: any;
}

const ActionButtons = React.memo(({ 
  handleShowStreams, 
  toggleLibrary, 
  inLibrary, 
  type, 
  id, 
  navigation, 
  playButtonText,
  animatedStyle
}: ActionButtonsProps) => {
  // Add wrapper for play button with haptic feedback
  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    handleShowStreams();
  };

  return (
    <Animated.View style={[styles.actionButtons, animatedStyle]}>
      <TouchableOpacity
        style={[styles.actionButton, styles.playButton]}
        onPress={handlePlay}
      >
        <MaterialIcons 
          name={playButtonText === 'Resume' ? "play-circle-outline" : "play-arrow"} 
          size={24} 
          color="#000" 
        />
        <Text style={styles.playButtonText}>
          {playButtonText}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.infoButton]}
        onPress={toggleLibrary}
      >
        <MaterialIcons
          name={inLibrary ? 'bookmark' : 'bookmark-border'}
          size={24}
          color="#fff"
        />
        <Text style={styles.infoButtonText}>
          {inLibrary ? 'Saved' : 'Save'}
        </Text>
      </TouchableOpacity>

      {type === 'series' && (
        <TouchableOpacity
          style={[styles.iconButton]}
          onPress={async () => {
            const tmdb = TMDBService.getInstance();
            const tmdbId = await tmdb.extractTMDBIdFromStremioId(id);
            if (tmdbId) {
              navigation.navigate('ShowRatings', { showId: tmdbId });
            } else {
              logger.error('Could not find TMDB ID for show');
            }
          }}
        >
          <MaterialIcons name="assessment" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: -12,
    justifyContent: 'center',
    width: '100%',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 100,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flex: 1,
  },
  playButton: {
    backgroundColor: colors.white,
  },
  infoButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: '#fff',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  playButtonText: {
    color: '#000',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  infoButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ActionButtons; 