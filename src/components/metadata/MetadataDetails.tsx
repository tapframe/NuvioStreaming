import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  Layout,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';

interface MetadataDetailsProps {
  metadata: any;
  imdbId: string | null;
  type: 'movie' | 'series';
}

const MetadataDetails: React.FC<MetadataDetailsProps> = ({
  metadata,
  imdbId,
  type,
}) => {
  const { currentTheme } = useTheme();
  const [isFullDescriptionOpen, setIsFullDescriptionOpen] = useState(false);

  return (
    <>
      {/* Meta Info */}
      <View style={styles.metaInfo}>
        {metadata.year && (
          <Text style={[styles.metaText, { color: currentTheme.colors.text }]}>{metadata.year}</Text>
        )}
        {metadata.runtime && (
          <Text style={[styles.metaText, { color: currentTheme.colors.text }]}>{metadata.runtime}</Text>
        )}
        {metadata.certification && (
          <Text style={[styles.metaText, { color: currentTheme.colors.text }]}>{metadata.certification}</Text>
        )}
        {metadata.imdbRating && (
          <View style={styles.ratingContainer}>
            <Image 
              source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/575px-IMDB_Logo_2016.svg.png' }}
              style={styles.imdbLogo}
              contentFit="contain"
            />
            <Text style={[styles.ratingText, { color: currentTheme.colors.text }]}>{metadata.imdbRating}</Text>
          </View>
        )}
      </View>

      {/* Creator/Director Info */}
      <Animated.View
        entering={FadeIn.duration(500).delay(200)}
        style={styles.creatorContainer}
      >
        {metadata.directors && metadata.directors.length > 0 && (
          <View style={styles.creatorSection}>
            <Text style={[styles.creatorLabel, { color: currentTheme.colors.white }]}>Director{metadata.directors.length > 1 ? 's' : ''}:</Text>
            <Text style={[styles.creatorText, { color: currentTheme.colors.mediumEmphasis }]}>{metadata.directors.join(', ')}</Text>
          </View>
        )}
        {metadata.creators && metadata.creators.length > 0 && (
          <View style={styles.creatorSection}>
            <Text style={[styles.creatorLabel, { color: currentTheme.colors.white }]}>Creator{metadata.creators.length > 1 ? 's' : ''}:</Text>
            <Text style={[styles.creatorText, { color: currentTheme.colors.mediumEmphasis }]}>{metadata.creators.join(', ')}</Text>
          </View>
        )}
      </Animated.View>

      {/* Description */}
      {metadata.description && (
        <Animated.View 
          style={styles.descriptionContainer}
          layout={Layout.duration(300).easing(Easing.inOut(Easing.ease))}
        >
          <TouchableOpacity 
            onPress={() => setIsFullDescriptionOpen(!isFullDescriptionOpen)}
            activeOpacity={0.7}
          >
            <Text style={[styles.description, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={isFullDescriptionOpen ? undefined : 3}>
              {metadata.description}
            </Text>
            <View style={styles.showMoreButton}>
              <Text style={[styles.showMoreText, { color: currentTheme.colors.textMuted }]}>
                {isFullDescriptionOpen ? 'Show Less' : 'Show More'}
              </Text>
              <MaterialIcons 
                name={isFullDescriptionOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                size={18} 
                color={currentTheme.colors.textMuted} 
              />
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metaText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imdbLogo: {
    width: 35,
    height: 18,
    marginRight: 4,
  },
  ratingText: {
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  creatorContainer: {
    marginBottom: 2,
    paddingHorizontal: 16,
  },
  creatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    height: 20
  },
  creatorLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
    lineHeight: 20
  },
  creatorText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20
  },
  descriptionContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  showMoreText: {
    fontSize: 14,
    marginRight: 4,
  },
});

export default React.memo(MetadataDetails); 