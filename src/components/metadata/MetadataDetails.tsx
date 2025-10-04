import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { isMDBListEnabled } from '../../screens/MDBListSettingsScreen';
// MetadataSourceSelector removed

interface MetadataDetailsProps {
  metadata: any;
  imdbId: string | null;
  type: 'movie' | 'series';
  renderRatings?: () => React.ReactNode;
  contentId: string;
  // Source switching removed
  loadingMetadata?: boolean;
}

const MetadataDetails: React.FC<MetadataDetailsProps> = ({
  metadata,
  imdbId: _imdbId,
  type,
  renderRatings,
  contentId,
  loadingMetadata = false,
}) => {
  const { currentTheme } = useTheme();
  const [isFullDescriptionOpen, setIsFullDescriptionOpen] = useState(false);
  const [isMDBEnabled, setIsMDBEnabled] = useState(false);
  const [isTextTruncated, setIsTextTruncated] = useState(false);

  // Animation values for smooth height transition
  const animatedHeight = useSharedValue(0);
  const [measuredHeights, setMeasuredHeights] = useState({ collapsed: 0, expanded: 0 });

  useEffect(() => {
    const checkMDBListEnabled = async () => {
      try {
        const enabled = await isMDBListEnabled();
        setIsMDBEnabled(enabled);
      } catch (error) {
        setIsMDBEnabled(false); // Default to disabled if there's an error
      }
    };
    
    checkMDBListEnabled();
  }, []);

  const handleTextLayout = (event: any) => {
    const { lines } = event.nativeEvent;
    // If we have 3 or more lines, it means the text was truncated
    setIsTextTruncated(lines.length >= 3);
  };

  const handleCollapsedTextLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    setMeasuredHeights(prev => ({ ...prev, collapsed: height }));
  };

  const handleExpandedTextLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    setMeasuredHeights(prev => ({ ...prev, expanded: height }));
  };

  // Animate height changes
  const toggleDescription = () => {
    const targetHeight = isFullDescriptionOpen ? measuredHeights.collapsed : measuredHeights.expanded;
    animatedHeight.value = withTiming(targetHeight, { duration: 300 });
    setIsFullDescriptionOpen(!isFullDescriptionOpen);
  };

  // Initialize height when component mounts or text changes
  useEffect(() => {
    if (measuredHeights.collapsed > 0) {
      animatedHeight.value = measuredHeights.collapsed;
    }
  }, [measuredHeights.collapsed]);

  // Animated style for smooth height transition
  const animatedDescriptionStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    overflow: 'hidden',
  }));

function formatRuntime(runtime: string): string {
  // Try to match formats like "1h55min", "2h 7min", "125 min", etc.
  const match = runtime.match(/(?:(\d+)\s*h\s*)?(\d+)\s*min/i);
  if (match) {
    const h = match[1] ? parseInt(match[1], 10) : 0;
    const m = match[2] ? parseInt(match[2], 10) : 0;
    if (h > 0) {
      return `${h}H ${m}M`;
    }
    if (m < 60) {
      return `${m} MIN`;
    }
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    return hours > 0 ? `${hours}H ${mins}M` : `${mins} MIN`;
  }

  // Fallback: treat as minutes if it's a number
  const r = parseInt(runtime, 10);
  if (!isNaN(r)) {
    if (r < 60) return `${r} MIN`;
    const h = Math.floor(r / 60);
    const m = r % 60;
    return h > 0 ? `${h}H ${m}M` : `${m} MIN`;
  }

  // If not matched, return as is
  return runtime;
  
}

  return (
    <>
      {/* Metadata Source Selector removed */}

      {/* Loading indicator when switching sources */}
      {loadingMetadata && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={currentTheme.colors.primary} />
          <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>
            Loading metadata...
          </Text>
        </View>
      )}

      {/* Meta Info */}
      <View style={[styles.metaInfo, loadingMetadata && styles.dimmed]}>
        {metadata.year && (
          <Text style={[styles.metaText, { color: currentTheme.colors.text }]}>{metadata.year}</Text>
        )}
        {metadata.runtime && (
          <Text style={[styles.metaText, { color: currentTheme.colors.text }]}>
            {formatRuntime(metadata.runtime)}
          </Text>
        )}
        {metadata.certification && (
          <Text style={[styles.metaText, { color: currentTheme.colors.text }]}>{metadata.certification}</Text>
        )}
        {metadata.imdbRating && !isMDBEnabled && (
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

      {/* Ratings Section */}
      {renderRatings && renderRatings()}

      {/* Creator/Director Info */}
      <Animated.View
        entering={FadeIn.duration(300).delay(100)}
        style={[styles.creatorContainer, loadingMetadata && styles.dimmed]}
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
          style={[styles.descriptionContainer, loadingMetadata && styles.dimmed]}
          entering={FadeIn.duration(300)}
        >
          {/* Hidden text elements to measure heights */}
          <Text
            style={[styles.description, { color: currentTheme.colors.mediumEmphasis, position: 'absolute', opacity: 0 }]}
            numberOfLines={3}
            onLayout={handleCollapsedTextLayout}
          >
            {metadata.description}
          </Text>
          <Text
            style={[styles.description, { color: currentTheme.colors.mediumEmphasis, position: 'absolute', opacity: 0 }]}
            onLayout={handleExpandedTextLayout}
          >
            {metadata.description}
          </Text>

          <TouchableOpacity
            onPress={toggleDescription}
            activeOpacity={0.7}
            disabled={!isTextTruncated && !isFullDescriptionOpen}
          >
            <Animated.View style={animatedDescriptionStyle}>
              <Text
                style={[styles.description, { color: currentTheme.colors.mediumEmphasis }]}
                numberOfLines={isFullDescriptionOpen ? undefined : 3}
                onTextLayout={handleTextLayout}
              >
                {metadata.description}
              </Text>
            </Animated.View>
            {(isTextTruncated || isFullDescriptionOpen) && (
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
            )}
          </TouchableOpacity>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  // Removed source selector styles
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  dimmed: {
    opacity: 0.6,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
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