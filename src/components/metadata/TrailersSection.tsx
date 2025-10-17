import React, { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import FastImage from '@d11/react-native-fast-image';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';
import TrailerService from '../../services/trailerService';
import TrailerModal from './TrailerModal';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

interface TrailerVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
}

interface TrailersSectionProps {
  tmdbId: number | null;
  type: 'movie' | 'tv';
  contentId: string;
  contentTitle: string;
}

interface CategorizedTrailers {
  [key: string]: TrailerVideo[];
}

const TrailersSection: React.FC<TrailersSectionProps> = memo(({
  tmdbId,
  type,
  contentId,
  contentTitle
}) => {
  const { currentTheme } = useTheme();
  const [trailers, setTrailers] = useState<CategorizedTrailers>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrailer, setSelectedTrailer] = useState<TrailerVideo | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Fetch trailers from TMDB
  useEffect(() => {
    if (!tmdbId) return;

    const fetchTrailers = async () => {
      setLoading(true);
      setError(null);

      try {
        logger.info('TrailersSection', `Fetching trailers for TMDB ID: ${tmdbId}, type: ${type}`);

        // First check if the movie/TV show exists
        const basicEndpoint = type === 'movie'
          ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=d131017ccc6e5462a81c9304d21476de`
          : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=d131017ccc6e5462a81c9304d21476de`;

        const basicResponse = await fetch(basicEndpoint);
        if (!basicResponse.ok) {
          logger.error('TrailersSection', `TMDB ID ${tmdbId} not found: ${basicResponse.status}`);
          setError(`Content not found (TMDB ID: ${tmdbId})`);
          return;
        }

        const videosEndpoint = type === 'movie'
          ? `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=d131017ccc6e5462a81c9304d21476de&language=en-US`
          : `https://api.themoviedb.org/3/tv/${tmdbId}/videos?api_key=d131017ccc6e5462a81c9304d21476de&language=en-US`;

        logger.info('TrailersSection', `Fetching videos from: ${videosEndpoint}`);

        const response = await fetch(videosEndpoint);
        if (!response.ok) {
          // 404 is normal - means no videos exist for this content
          if (response.status === 404) {
            logger.info('TrailersSection', `No videos found for TMDB ID ${tmdbId} (404 response)`);
            setTrailers({}); // Empty trailers - section won't render
            return;
          }
          logger.error('TrailersSection', `Videos endpoint failed: ${response.status} ${response.statusText}`);
          throw new Error(`Failed to fetch trailers: ${response.status}`);
        }

        const data = await response.json();
        logger.info('TrailersSection', `Received ${data.results?.length || 0} videos for TMDB ID ${tmdbId}`);

        const categorized = categorizeTrailers(data.results || []);
        const totalVideos = Object.values(categorized).reduce((sum, videos) => sum + videos.length, 0);

        if (totalVideos === 0) {
          logger.info('TrailersSection', `No videos found for TMDB ID ${tmdbId} - this is normal`);
          setTrailers({}); // No trailers available
        } else {
          logger.info('TrailersSection', `Categorized ${totalVideos} videos into ${Object.keys(categorized).length} categories`);
          setTrailers(categorized);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load trailers';
        setError(errorMessage);
        logger.error('TrailersSection', 'Error fetching trailers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrailers();
  }, [tmdbId, type]);

  // Categorize trailers by type
  const categorizeTrailers = (videos: any[]): CategorizedTrailers => {
    const categories: CategorizedTrailers = {};

    videos.forEach(video => {
      if (video.site !== 'YouTube') return; // Only YouTube videos

      const category = video.type;
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(video);
    });

    // Sort within each category by published date (newest first)
    Object.keys(categories).forEach(category => {
      categories[category].sort((a, b) =>
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      );
    });

    return categories;
  };

  // Handle trailer selection
  const handleTrailerPress = (trailer: TrailerVideo) => {
    setSelectedTrailer(trailer);
    setModalVisible(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedTrailer(null);
  };

  // Get thumbnail URL for YouTube video
  const getYouTubeThumbnail = (videoId: string, quality: 'default' | 'hq' | 'maxres' = 'hq') => {
    const qualities = {
      default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
      hq: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
    return qualities[quality];
  };

  // Format trailer type for display
  const formatTrailerType = (type: string): string => {
    switch (type) {
      case 'Trailer':
        return 'Official Trailers';
      case 'Teaser':
        return 'Teasers';
      case 'Clip':
        return 'Clips & Scenes';
      case 'Featurette':
        return 'Featurettes';
      case 'Behind the Scenes':
        return 'Behind the Scenes';
      default:
        return type;
    }
  };

  // Get icon for trailer type
  const getTrailerTypeIcon = (type: string): string => {
    switch (type) {
      case 'Trailer':
        return 'movie';
      case 'Teaser':
        return 'videocam';
      case 'Clip':
        return 'content-cut';
      case 'Featurette':
        return 'featured-video';
      case 'Behind the Scenes':
        return 'camera';
      default:
        return 'play-circle-outline';
    }
  };

  if (!tmdbId) {
    return null; // Don't show if no TMDB ID
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <MaterialIcons name="movie" size={20} color={currentTheme.colors.primary} />
          <Text style={[styles.headerTitle, { color: currentTheme.colors.highEmphasis }]}>
            Trailers
          </Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={currentTheme.colors.primary} />
          <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>
            Loading trailers...
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <MaterialIcons name="movie" size={20} color={currentTheme.colors.primary} />
          <Text style={[styles.headerTitle, { color: currentTheme.colors.highEmphasis }]}>
            Trailers
          </Text>
        </View>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={24} color={currentTheme.colors.error || '#FF6B6B'} />
          <Text style={[styles.errorText, { color: currentTheme.colors.textMuted }]}>
            {error}
          </Text>
        </View>
      </View>
    );
  }

  const trailerCategories = Object.keys(trailers);
  const totalVideos = Object.values(trailers).reduce((sum, videos) => sum + videos.length, 0);

  // Don't show section if no trailers (this is normal for many movies/TV shows)
  if (trailerCategories.length === 0 || totalVideos === 0) {
    // In development, show a subtle indicator that the section checked but found no trailers
    if (__DEV__) {
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <MaterialIcons name="movie" size={20} color={currentTheme.colors.primary} />
            <Text style={[styles.headerTitle, { color: currentTheme.colors.highEmphasis }]}>
              Trailers
            </Text>
          </View>
          <View style={styles.noTrailersContainer}>
            <Text style={[styles.noTrailersText, { color: currentTheme.colors.textMuted }]}>
              No trailers available
            </Text>
          </View>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="movie" size={20} color={currentTheme.colors.primary} />
        <Text style={[styles.headerTitle, { color: currentTheme.colors.highEmphasis }]}>
          Trailers
        </Text>
      </View>

      {trailerCategories.map(category => (
        <View key={category} style={styles.categoryContainer}>
          <View style={styles.categoryHeader}>
            <MaterialIcons
              name={getTrailerTypeIcon(category) as any}
              size={16}
              color={currentTheme.colors.primary}
            />
            <Text style={[styles.categoryTitle, { color: currentTheme.colors.highEmphasis }]}>
              {formatTrailerType(category)}
            </Text>
            <Text style={[styles.categoryCount, { color: currentTheme.colors.textMuted }]}>
              {trailers[category].length}
            </Text>
          </View>

          <View style={styles.trailersGrid}>
            {trailers[category].map(trailer => {

              return (
                <TouchableOpacity
                  key={trailer.id}
                  style={styles.trailerCard}
                  onPress={() => handleTrailerPress(trailer)}
                  activeOpacity={0.8}
                >
                  <View style={styles.thumbnailContainer}>
                    <FastImage
                      source={{ uri: getYouTubeThumbnail(trailer.key, 'hq') }}
                      style={styles.thumbnail}
                      resizeMode={FastImage.resizeMode.cover}
                    />
                    <View style={styles.playOverlay}>
                    <MaterialIcons name="play-arrow" size={32} color="#fff" />
                  </View>
                    <View style={styles.durationBadge}>
                      <Text style={styles.durationText}>
                        {trailer.size}p
                      </Text>
                    </View>
                  </View>

                  <View style={styles.trailerInfo}>
                    <Text
                      style={[styles.trailerTitle, { color: currentTheme.colors.highEmphasis }]}
                      numberOfLines={2}
                    >
                      {trailer.name}
                    </Text>
                    <Text style={[styles.trailerMeta, { color: currentTheme.colors.textMuted }]}>
                      {new Date(trailer.published_at).getFullYear()}
                      {trailer.official && ' • Official'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {/* Trailer Modal */}
      <TrailerModal
        visible={modalVisible}
        onClose={handleModalClose}
        trailer={selectedTrailer}
        contentTitle={contentTitle}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.9,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.7,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  categoryContainer: {
    marginBottom: 24,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  categoryCount: {
    fontSize: 12,
    opacity: 0.6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  trailersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  trailerCard: {
    width: isTablet ? (width - 32 - 24) / 3 : (width - 32 - 12) / 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  thumbnailContainer: {
    position: 'relative',
    aspectRatio: 16 / 9,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  trailerInfo: {
    padding: 12,
  },
  trailerTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
    marginBottom: 4,
  },
  trailerMeta: {
    fontSize: 11,
    opacity: 0.7,
  },
  noTrailersContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noTrailersText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
  },
});

export default TrailersSection;
