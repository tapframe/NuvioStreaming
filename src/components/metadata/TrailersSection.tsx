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
  ScrollView,
  Modal,
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
  const [selectedCategory, setSelectedCategory] = useState<string>('Trailer');
  const [dropdownVisible, setDropdownVisible] = useState(false);

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
          setSelectedCategory(''); // No category selected
        } else {
          logger.info('TrailersSection', `Categorized ${totalVideos} videos into ${Object.keys(categorized).length} categories`);
          setTrailers(categorized);

          // Auto-select the first available category, preferring "Trailer"
          const availableCategories = Object.keys(categorized);
          const preferredCategory = availableCategories.includes('Trailer') ? 'Trailer' :
                                   availableCategories.includes('Teaser') ? 'Teaser' : availableCategories[0];
          setSelectedCategory(preferredCategory);
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

  // Handle category selection
  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setDropdownVisible(false);
  };

  // Toggle dropdown
  const toggleDropdown = () => {
    setDropdownVisible(!dropdownVisible);
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
      {/* Enhanced Header with Category Selector */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.highEmphasis }]}>
          Trailers & Videos
        </Text>

        {/* Category Selector - Right Aligned */}
        {trailerCategories.length > 0 && selectedCategory && (
          <TouchableOpacity
            style={[styles.categorySelector, { borderColor: currentTheme.colors.primary + '40' }]}
            onPress={toggleDropdown}
            activeOpacity={0.8}
          >
            <Text
              style={[styles.categorySelectorText, { color: currentTheme.colors.highEmphasis }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {formatTrailerType(selectedCategory)}
            </Text>
            <MaterialIcons
              name={dropdownVisible ? "expand-less" : "expand-more"}
              size={18}
              color={currentTheme.colors.primary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Dropdown Modal */}
      <Modal
        visible={dropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setDropdownVisible(false)}
        >
          <View style={[styles.dropdownContainer, {
            backgroundColor: currentTheme.colors.background,
            borderColor: currentTheme.colors.primary + '20'
          }]}>
            {trailerCategories.map(category => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.dropdownItem,
                  selectedCategory === category && styles.dropdownItemSelected,
                  selectedCategory === category && { backgroundColor: currentTheme.colors.primary + '10' }
                ]}
                onPress={() => handleCategorySelect(category)}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownItemContent}>
                  <View style={[styles.categoryIconContainer, {
                    backgroundColor: currentTheme.colors.primary + '15'
                  }]}>
                    <MaterialIcons
                      name={getTrailerTypeIcon(category) as any}
                      size={14}
                      color={currentTheme.colors.primary}
                    />
                  </View>
                  <Text style={[
                    styles.dropdownItemText,
                    { color: currentTheme.colors.highEmphasis },
                    selectedCategory === category && { color: currentTheme.colors.primary, fontWeight: '600' }
                  ]}>
                    {formatTrailerType(category)}
                  </Text>
                  <Text style={[styles.dropdownItemCount, { color: currentTheme.colors.textMuted }]}>
                    {trailers[category].length}
                  </Text>
                </View>
                {selectedCategory === category && (
                  <MaterialIcons
                    name="check"
                    size={20}
                    color={currentTheme.colors.primary}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Selected Category Trailers */}
      {selectedCategory && trailers[selectedCategory] && (
        <View style={styles.selectedCategoryContent}>
          {/* Trailers Horizontal Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trailersScrollContent}
            style={styles.trailersScrollView}
            decelerationRate="fast"
              snapToInterval={isTablet ? 212 : 182} // card width + gap for smooth scrolling
            snapToAlignment="start"
          >
            {trailers[selectedCategory].map((trailer, index) => (
              <TouchableOpacity
                key={trailer.id}
                style={styles.trailerCard}
                onPress={() => handleTrailerPress(trailer)}
                activeOpacity={0.9}
              >
                  {/* Thumbnail with Gradient Overlay */}
                  <View style={styles.thumbnailWrapper}>
                    <FastImage
                      source={{ uri: getYouTubeThumbnail(trailer.key, 'hq') }}
                      style={styles.thumbnail}
                      resizeMode={FastImage.resizeMode.cover}
                    />
                    {/* Subtle Gradient Overlay */}
                    <View style={styles.thumbnailGradient} />
                    {/* Quality Badge */}
                    <View style={styles.qualityBadge}>
                      <Text style={styles.qualityText}>
                        {trailer.size}p
                      </Text>
                    </View>
                  </View>

                {/* Trailer Info */}
                <View style={styles.trailerInfo}>
                  <Text
                    style={[styles.trailerTitle, { color: currentTheme.colors.highEmphasis }]}
                    numberOfLines={2}
                  >
                    {trailer.name}
                  </Text>
                  <Text style={[styles.trailerMeta, { color: currentTheme.colors.textMuted }]}>
                    {new Date(trailer.published_at).getFullYear()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {/* Scroll Indicator - shows when there are more items to scroll */}
            {trailers[selectedCategory].length > (isTablet ? 4 : 3) && (
              <View style={styles.scrollIndicator}>
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={currentTheme.colors.textMuted}
                  style={{ opacity: 0.6 }}
                />
              </View>
            )}
          </ScrollView>
        </View>
      )}

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
  // Enhanced Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Category Selector Styles
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 6,
    maxWidth: 160, // Limit maximum width to prevent overflow
  },
  categorySelectorText: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120, // Limit text width
  },

  // Dropdown Styles
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dropdownContainer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemSelected: {
    borderBottomColor: 'transparent',
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dropdownItemText: {
    fontSize: 16,
    flex: 1,
  },
  dropdownItemCount: {
    fontSize: 12,
    opacity: 0.7,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    minWidth: 24,
    textAlign: 'center',
  },

  // Selected Category Content
  selectedCategoryContent: {
    marginTop: 16,
  },

  // Category Section Styles
  categorySection: {
    gap: 12,
    position: 'relative', // For scroll indicator positioning
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  categoryBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Trailers Scroll View
  trailersScrollView: {
    marginHorizontal: -4, // Compensate for padding
  },
  trailersScrollContent: {
    paddingHorizontal: 4, // Restore padding for first/last items
    gap: 12,
    paddingRight: 20, // Extra padding at end for scroll indicator
  },

  // Enhanced Trailer Card Styles
  trailerCard: {
    width: isTablet ? 200 : 170,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },

  // Thumbnail Styles
  thumbnailWrapper: {
    position: 'relative',
    aspectRatio: 16 / 9,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  thumbnailGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },


  // Badges
  qualityBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  qualityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },

  // Trailer Info Styles
  trailerInfo: {
    padding: 12,
  },
  trailerTitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginBottom: 4,
  },
  trailerMeta: {
    fontSize: 10,
    opacity: 0.7,
    fontWeight: '500',
  },

  // Loading and Error States
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

  // Scroll Indicator
  scrollIndicator: {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: [{ translateY: -10 }],
    width: 24,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
  },

  // No Trailers State
  noTrailersContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noTrailersText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
  },
});

export default TrailersSection;
