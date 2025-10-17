import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';
import TrailerService from '../../services/trailerService';
import Video, { VideoRef, OnLoadData, OnProgressData } from 'react-native-video';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

// Helper function to format trailer type
const formatTrailerType = (type: string): string => {
  switch (type) {
    case 'Trailer':
      return 'Official Trailer';
    case 'Teaser':
      return 'Teaser';
    case 'Clip':
      return 'Clip';
    case 'Featurette':
      return 'Featurette';
    case 'Behind the Scenes':
      return 'Behind the Scenes';
    default:
      return type;
  }
};

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

interface TrailerModalProps {
  visible: boolean;
  onClose: () => void;
  trailer: TrailerVideo | null;
  contentTitle: string;
}

const TrailerModal: React.FC<TrailerModalProps> = memo(({
  visible,
  onClose,
  trailer,
  contentTitle
}) => {
  const { currentTheme } = useTheme();
  const videoRef = React.useRef<VideoRef>(null);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Load trailer when modal opens or trailer changes
  useEffect(() => {
    if (visible && trailer) {
      loadTrailer();
    } else {
      // Reset state when modal closes
      setTrailerUrl(null);
      setLoading(false);
      setError(null);
      setIsPlaying(false);
    }
  }, [visible, trailer]);

  const loadTrailer = useCallback(async () => {
    if (!trailer) return;

    setLoading(true);
    setError(null);
    setTrailerUrl(null);

    try {
      const youtubeUrl = `https://www.youtube.com/watch?v=${trailer.key}`;

      logger.info('TrailerModal', `Loading trailer: ${trailer.name} (${youtubeUrl})`);

      // Use the direct YouTube URL method - much more efficient!
      const directUrl = await TrailerService.getTrailerFromYouTubeUrl(
        youtubeUrl,
        `${contentTitle} - ${trailer.name}`,
        new Date(trailer.published_at).getFullYear().toString()
      );

      if (directUrl) {
        setTrailerUrl(directUrl);
        setIsPlaying(true);
        logger.info('TrailerModal', `Successfully loaded direct trailer URL for: ${trailer.name}`);
      } else {
        throw new Error('No streaming URL available');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load trailer';
      setError(errorMessage);
      logger.error('TrailerModal', 'Error loading trailer:', err);

      Alert.alert(
        'Trailer Unavailable',
        'This trailer could not be loaded at this time. Please try again later.',
        [{ text: 'OK', style: 'default' }]
      );
    } finally {
      setLoading(false);
    }
  }, [trailer, contentTitle]);

  const handleClose = useCallback(() => {
    setIsPlaying(false);
    onClose();
  }, [onClose]);

  const handleTrailerError = useCallback(() => {
    setError('Failed to play trailer');
    setIsPlaying(false);
  }, []);

  const handleTrailerEnd = useCallback(() => {
    setIsPlaying(false);
  }, []);

  if (!visible || !trailer) return null;

  const modalHeight = isTablet ? height * 0.8 : height * 0.7;
  const modalWidth = isTablet ? width * 0.8 : width * 0.95;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, {
          width: modalWidth,
          maxHeight: modalHeight,
          backgroundColor: currentTheme.colors.background
        }]}>
          {/* Enhanced Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIconContainer, { backgroundColor: currentTheme.colors.primary + '20' }]}>
                <MaterialIcons
                  name="play-circle-fill"
                  size={20}
                  color={currentTheme.colors.primary}
                />
              </View>
              <View style={styles.headerTextContainer}>
                <Text
                  style={[styles.title, { color: currentTheme.colors.highEmphasis }]}
                  numberOfLines={2}
                >
                  {trailer.name}
                </Text>
                <View style={styles.headerMeta}>
                  <Text style={[styles.meta, { color: currentTheme.colors.textMuted }]}>
                    {formatTrailerType(trailer.type)} • {new Date(trailer.published_at).getFullYear()}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.closeButton, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <MaterialIcons
                name="close"
                size={20}
                color={currentTheme.colors.highEmphasis}
              />
            </TouchableOpacity>
          </View>

          {/* Player Container */}
          <View style={styles.playerContainer}>
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={currentTheme.colors.primary} />
                <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>
                  Loading trailer...
                </Text>
              </View>
            )}

            {error && !loading && (
              <View style={styles.errorContainer}>
                <MaterialIcons
                  name="error-outline"
                  size={48}
                  color={currentTheme.colors.error || '#FF6B6B'}
                />
                <Text style={[styles.errorText, { color: currentTheme.colors.textMuted }]}>
                  {error}
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, { backgroundColor: currentTheme.colors.primary }]}
                  onPress={loadTrailer}
                >
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {trailerUrl && !loading && !error && (
              <View style={styles.playerWrapper}>
                <Video
                  ref={videoRef}
                  source={{ uri: trailerUrl }}
                  style={styles.player}
                  controls={true}
                  paused={!isPlaying}
                  resizeMode="contain"
                  volume={1.0}
                  rate={1.0}
                  playInBackground={false}
                  playWhenInactive={false}
                  ignoreSilentSwitch="ignore"
                  onLoad={(data: OnLoadData) => {
                    logger.info('TrailerModal', 'Trailer loaded successfully', data);
                  }}
                  onError={(error) => {
                    logger.error('TrailerModal', 'Video error:', error);
                    handleTrailerError();
                  }}
                  onEnd={() => {
                    logger.info('TrailerModal', 'Trailer ended');
                    handleTrailerEnd();
                  }}
                  onProgress={(data: OnProgressData) => {
                    // Handle progress if needed
                  }}
                  onLoadStart={() => {
                    logger.info('TrailerModal', 'Video load started');
                  }}
                  onReadyForDisplay={() => {
                    logger.info('TrailerModal', 'Video ready for display');
                  }}
                />
              </View>
            )}
          </View>

          {/* Enhanced Footer */}
          <View style={styles.footer}>
            <View style={styles.footerContent}>
              <MaterialIcons
                name="movie"
                size={16}
                color={currentTheme.colors.textMuted}
              />
              <Text style={[styles.footerText, { color: currentTheme.colors.textMuted }]}>
                {contentTitle}
              </Text>
            </View>
            <View style={styles.footerMeta}>
              <Text style={[styles.footerMetaText, { color: currentTheme.colors.textMuted }]}>
                {trailer.size}p HD
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  // Enhanced Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    gap: 12,
  },
  headerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    color: '#fff',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meta: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: '500',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerContainer: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.8,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
    gap: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  playerWrapper: {
    flex: 1,
  },
  player: {
    flex: 1,
  },
  // Enhanced Footer Styles
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.8,
  },
  footerMeta: {
    alignItems: 'flex-end',
  },
  footerMetaText: {
    fontSize: 11,
    opacity: 0.6,
    fontWeight: '500',
  },
});

export default TrailerModal;
