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
import { colors } from '../../styles/colors';

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
  const [isFullDescriptionOpen, setIsFullDescriptionOpen] = useState(false);

  return (
    <>
      {/* Meta Info */}
      <View style={styles.metaInfo}>
        {metadata.year && (
          <Text style={styles.metaText}>{metadata.year}</Text>
        )}
        {metadata.runtime && (
          <Text style={styles.metaText}>{metadata.runtime}</Text>
        )}
        {metadata.certification && (
          <Text style={styles.metaText}>{metadata.certification}</Text>
        )}
        {metadata.imdbRating && (
          <View style={styles.ratingContainer}>
            <Image 
              source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/575px-IMDB_Logo_2016.svg.png' }}
              style={styles.imdbLogo}
              contentFit="contain"
            />
            <Text style={styles.ratingText}>{metadata.imdbRating}</Text>
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
            <Text style={styles.creatorLabel}>Director{metadata.directors.length > 1 ? 's' : ''}:</Text>
            <Text style={styles.creatorText}>{metadata.directors.join(', ')}</Text>
          </View>
        )}
        {metadata.creators && metadata.creators.length > 0 && (
          <View style={styles.creatorSection}>
            <Text style={styles.creatorLabel}>Creator{metadata.creators.length > 1 ? 's' : ''}:</Text>
            <Text style={styles.creatorText}>{metadata.creators.join(', ')}</Text>
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
            <Text style={styles.description} numberOfLines={isFullDescriptionOpen ? undefined : 3}>
              {metadata.description}
            </Text>
            <View style={styles.showMoreButton}>
              <Text style={styles.showMoreText}>
                {isFullDescriptionOpen ? 'Show Less' : 'Show More'}
              </Text>
              <MaterialIcons 
                name={isFullDescriptionOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                size={18} 
                color={colors.textMuted} 
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
    color: colors.text,
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
    color: colors.text,
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
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
    lineHeight: 20
  },
  creatorText: {
    color: colors.lightGray,
    fontSize: 14,
    flex: 1,
    lineHeight: 20
  },
  descriptionContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  description: {
    color: colors.mediumEmphasis,
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
    color: colors.textMuted,
    fontSize: 14,
    marginRight: 4,
  },
});

export default React.memo(MetadataDetails); 