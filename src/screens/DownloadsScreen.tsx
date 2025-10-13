import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Platform,
  Clipboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';
import { useDownloads } from '../contexts/DownloadsContext';
import type { DownloadItem } from '../contexts/DownloadsContext';
import { Toast } from 'toastify-react-native';

const { height, width } = Dimensions.get('window');

// Download items come from DownloadsContext

// Empty state component
const EmptyDownloadsState: React.FC = () => {
  const { currentTheme } = useTheme();
  
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconContainer, { backgroundColor: currentTheme.colors.elevation1 }]}>
        <MaterialCommunityIcons
          name="download-outline"
          size={48}
          color={currentTheme.colors.mediumEmphasis}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: currentTheme.colors.text }]}>
        No Downloads Yet
      </Text>
      <Text style={[styles.emptySubtitle, { color: currentTheme.colors.mediumEmphasis }]}>
        Downloaded content will appear here for offline viewing
      </Text>
      <TouchableOpacity 
        style={[styles.exploreButton, { backgroundColor: currentTheme.colors.primary }]}
        onPress={() => {
          // Navigate to search or home to find content
        }}
      >
        <Text style={[styles.exploreButtonText, { color: currentTheme.colors.background }]}>
          Explore Content
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// Download item component
const DownloadItemComponent: React.FC<{
  item: DownloadItem;
  onPress: (item: DownloadItem) => void;
  onAction: (item: DownloadItem, action: 'pause' | 'resume' | 'cancel' | 'retry') => void;
}> = React.memo(({ item, onPress, onAction }) => {
  const { currentTheme } = useTheme();

  const handleLongPress = useCallback(() => {
    if (item.status === 'completed' && item.fileUri) {
      Clipboard.setString(item.fileUri);
      if (Platform.OS === 'android') {
        Toast.success('Local file path copied to clipboard');
      } else {
        Alert.alert('Copied', 'Local file path copied to clipboard');
      }
    } else if (item.status !== 'completed') {
      if (Platform.OS === 'android') {
        Toast.info('Download is not complete yet');
      } else {
        Alert.alert('Not Available', 'The local file path is available only after the download is complete.');
      }
    }
  }, [item.status, item.fileUri]);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const sizes = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const v = bytes / Math.pow(1024, i);
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${sizes[i]}`;
  };
  
  const getStatusColor = () => {
    switch (item.status) {
      case 'downloading':
        return currentTheme.colors.primary;
      case 'completed':
        return currentTheme.colors.success;
      case 'paused':
        return currentTheme.colors.warning;
      case 'error':
        return currentTheme.colors.error;
      case 'queued':
        return currentTheme.colors.mediumEmphasis;
      default:
        return currentTheme.colors.mediumEmphasis;
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'downloading':
        const eta = item.etaSeconds ? `${Math.ceil(item.etaSeconds / 60)}m` : undefined;
        return eta ? `Downloading • ${eta}` : 'Downloading';
      case 'completed':
        return 'Completed';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      case 'queued':
        return 'Queued';
      default:
        return 'Unknown';
    }
  };

  const getActionIcon = () => {
    switch (item.status) {
      case 'downloading':
        return 'pause';
      case 'paused':
      case 'error':
        return 'play';
      case 'queued':
        return 'play';
      default:
        return null;
    }
  };

  const handleActionPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    switch (item.status) {
      case 'downloading':
        onAction(item, 'pause');
        break;
      case 'paused':
      case 'error':
      case 'queued':
        onAction(item, 'resume');
        break;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.downloadItem, { backgroundColor: currentTheme.colors.card }]}
      onPress={() => onPress(item)}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      {/* Content info */}
      <View style={styles.downloadContent}>
        <View style={styles.downloadHeader}>
          <View style={styles.titleContainer}>
            <Text style={[styles.downloadTitle, { color: currentTheme.colors.text }]} numberOfLines={1}>
              {item.title}{item.type === 'series' && item.season && item.episode ? `  S${String(item.season).padStart(2,'0')}E${String(item.episode).padStart(2,'0')}` : ''}
            </Text>
          </View>
          
          {item.type === 'series' && (
            <Text style={[styles.episodeInfo, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={1}>
              S{item.season?.toString().padStart(2, '0')}E{item.episode?.toString().padStart(2, '0')} • {item.episodeTitle}
            </Text>
          )}
        </View>

        {/* Progress section */}
        <View style={styles.progressSection}>
          {/* Provider + quality row */}
          <View style={styles.providerRow}>
            <Text style={[styles.providerText, { color: currentTheme.colors.mediumEmphasis }]}>
              {(item.providerName || 'Provider') + (item.quality ? `  ${item.quality}` : '')}
            </Text>
          </View>
          {/* Status row */}
          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>

          {/* Size row */}
          <View style={styles.sizeRow}>
            <Text style={[styles.progressText, { color: currentTheme.colors.mediumEmphasis }]}>
              {formatBytes(item.downloadedBytes)} / {item.totalBytes ? formatBytes(item.totalBytes) : '—'}
            </Text>
          </View>
          
          {/* Progress bar */}
          <View style={[styles.progressContainer, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  backgroundColor: getStatusColor(),
                  width: `${item.progress || 0}%`,
                },
              ]}
            />
          </View>
          
          <View style={styles.progressDetails}>
            <Text style={[styles.progressPercentage, { color: currentTheme.colors.text }]}>
              {item.progress || 0}%
            </Text>
            {item.etaSeconds && item.status === 'downloading' && (
              <Text style={[styles.etaText, { color: currentTheme.colors.mediumEmphasis }]}>
                {Math.ceil(item.etaSeconds / 60)}m remaining
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionContainer}>
        {getActionIcon() && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: currentTheme.colors.elevation2 }]}
            onPress={handleActionPress}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={getActionIcon() as any}
              size={20}
              color={currentTheme.colors.primary}
            />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: currentTheme.colors.elevation2 }]}
          onPress={() => {
            Alert.alert(
              'Remove Download',
              'Are you sure you want to remove this download?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => onAction(item, 'cancel') },
              ]
            );
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="delete-outline"
            size={20}
            color={currentTheme.colors.error}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

const DownloadsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const { top: safeAreaTop } = useSafeAreaInsets();
  const { downloads, pauseDownload, resumeDownload, cancelDownload } = useDownloads();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'downloading' | 'completed' | 'paused'>('all');

  // Animation values
  const headerOpacity = useSharedValue(1);

  // Filter downloads based on selected filter
  const filteredDownloads = useMemo(() => {
    if (selectedFilter === 'all') return downloads;
    return downloads.filter(item => {
      switch (selectedFilter) {
        case 'downloading':
          return item.status === 'downloading' || item.status === 'queued';
        case 'completed':
          return item.status === 'completed';
        case 'paused':
          return item.status === 'paused' || item.status === 'error';
        default:
          return true;
      }
    });
  }, [downloads, selectedFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = downloads.length;
    const downloading = downloads.filter(item =>
      item.status === 'downloading' || item.status === 'queued'
    ).length;
    const completed = downloads.filter(item => item.status === 'completed').length;
    const paused = downloads.filter(item =>
      item.status === 'paused' || item.status === 'error'
    ).length;

    return { total, downloading, completed, paused };
  }, [downloads]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // In a real app, this would refresh the downloads from the service
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  }, []);

  const handleDownloadPress = useCallback((item: DownloadItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.status !== 'completed') {
      Alert.alert('Download not ready', 'Please wait until the download completes.');
      return;
    }
    const uri = (item as any).fileUri || (item as any).sourceUrl;
    if (!uri) return;

    // Infer videoType and mkv
    const lower = String(uri).toLowerCase();
    const isMkv = /\.mkv(\?|$)/i.test(lower) || /(?:[?&]ext=|container=|format=)mkv\b/i.test(lower);
    const isM3u8 = /\.m3u8(\?|$)/i.test(lower);
    const isMpd = /\.mpd(\?|$)/i.test(lower);
    const isMp4 = /\.mp4(\?|$)/i.test(lower);
    const videoType = isM3u8 ? 'm3u8' : isMpd ? 'mpd' : isMp4 ? 'mp4' : undefined;

    const playerRoute = Platform.OS === 'ios' ? 'PlayerIOS' : 'PlayerAndroid';
    navigation.navigate(playerRoute as any, {
      uri,
      title: item.title,
      episodeTitle: item.type === 'series' ? item.episodeTitle : undefined,
      season: item.type === 'series' ? item.season : undefined,
      episode: item.type === 'series' ? item.episode : undefined,
      quality: item.quality,
      year: undefined,
      streamProvider: 'Downloads',
      streamName: item.providerName || 'Offline',
      headers: undefined,
      forceVlc: Platform.OS === 'android' ? isMkv : false,
      id: item.id,
      type: item.type,
      episodeId: undefined,
      imdbId: undefined,
      availableStreams: {},
      backdrop: undefined,
      videoType,
    } as any);
  }, [navigation]);

  const handleDownloadAction = useCallback((item: DownloadItem, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    if (action === 'pause') pauseDownload(item.id);
    if (action === 'resume') resumeDownload(item.id);
    if (action === 'cancel') cancelDownload(item.id);
  }, [pauseDownload, resumeDownload, cancelDownload]);

  const handleFilterPress = useCallback((filter: 'all' | 'downloading' | 'completed' | 'paused') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFilter(filter);
  }, []);

  // Focus effect
  useFocusEffect(
    useCallback(() => {
      // In a real app, this would load downloads from the service
      // For now, we'll just show empty state
    }, [])
  );

  // Animated styles
  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const renderFilterButton = (filter: typeof selectedFilter, label: string, count: number) => (
    <TouchableOpacity
      key={filter}
      style={[
        styles.filterButton,
        {
          backgroundColor: selectedFilter === filter 
            ? currentTheme.colors.primary 
            : currentTheme.colors.elevation1,
        }
      ]}
      onPress={() => handleFilterPress(filter)}
      activeOpacity={0.8}
    >
      <Text style={[
        styles.filterButtonText,
        {
          color: selectedFilter === filter 
            ? currentTheme.colors.background 
            : currentTheme.colors.text,
        }
      ]}>
        {label}
      </Text>
      {count > 0 && (
        <View style={[
          styles.filterBadge,
          {
            backgroundColor: selectedFilter === filter 
              ? currentTheme.colors.background 
              : currentTheme.colors.primary,
          }
        ]}>
          <Text style={[
            styles.filterBadgeText,
            {
              color: selectedFilter === filter 
                ? currentTheme.colors.primary 
                : currentTheme.colors.background,
            }
          ]}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.background }]}>
      <StatusBar
        translucent
        barStyle="light-content"
        backgroundColor="transparent"
      />

      {/* Header */}
      <Animated.View style={[
        styles.header,
        {
          backgroundColor: currentTheme.colors.background,
          paddingTop: safeAreaTop + 16,
        },
        headerStyle,
      ]}>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
          Downloads
        </Text>
        
        {downloads.length > 0 && (
          <View style={styles.filterContainer}>
            {renderFilterButton('all', 'All', stats.total)}
            {renderFilterButton('downloading', 'Active', stats.downloading)}
            {renderFilterButton('completed', 'Done', stats.completed)}
            {renderFilterButton('paused', 'Paused', stats.paused)}
          </View>
        )}
      </Animated.View>

      {/* Content */}
      {downloads.length === 0 ? (
        <EmptyDownloadsState />
      ) : (
        <FlatList
          data={filteredDownloads}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DownloadItemComponent
              item={item}
              onPress={handleDownloadPress}
              onAction={handleDownloadAction}
            />
          )}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={currentTheme.colors.primary}
              colors={[currentTheme.colors.primary]}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyFilterContainer}>
              <MaterialCommunityIcons
                name="filter-off"
                size={48}
                color={currentTheme.colors.mediumEmphasis}
              />
              <Text style={[styles.emptyFilterTitle, { color: currentTheme.colors.text }]}>
                No {selectedFilter} downloads
              </Text>
              <Text style={[styles.emptyFilterSubtitle, { color: currentTheme.colors.mediumEmphasis }]}>
                Try selecting a different filter
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContainer: {
    padding: 20,
    paddingTop: 8,
  },
  downloadItem: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  downloadContent: {
    flex: 1,
    marginRight: 12,
  },
  downloadHeader: {
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  downloadTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  qualityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qualityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  episodeInfo: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressSection: {
    gap: 4,
  },
  providerRow: {
    marginBottom: 2,
  },
  providerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusRow: {
    marginBottom: 2,
  },
  sizeRow: {
    marginBottom: 6,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  progressDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '700',
  },
  etaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  exploreButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  exploreButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyFilterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyFilterTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyFilterSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default DownloadsScreen;