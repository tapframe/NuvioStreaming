import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Dimensions,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import FastImage from '@d11/react-native-fast-image';
import { MalApiService } from '../services/mal/MalApi';
import { MalAnimeNode, MalListStatus } from '../types/mal';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';
import { MalEditModal } from '../components/mal/MalEditModal';
import { MalSync } from '../services/mal/MalSync';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.35;
const ITEM_HEIGHT = ITEM_WIDTH * 1.5;

const MalLibraryScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { currentTheme } = useTheme();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [groupedList, setGroupedList] = useState<Record<MalListStatus, MalAnimeNode[]>>({
    watching: [],
    completed: [],
    on_hold: [],
    dropped: [],
    plan_to_watch: [],
  });

  const [selectedAnime, setSelectedAnime] = useState<MalAnimeNode | null>(null);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  const fetchMalList = useCallback(async () => {
    try {
      setIsLoading(true);
      
      let allItems: MalAnimeNode[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore && offset < 1000) {
          const response = await MalApiService.getUserList(undefined, offset, 100);
          if (response.data && response.data.length > 0) {
              allItems = [...allItems, ...response.data];
              offset += response.data.length;
              hasMore = !!response.paging.next;
          } else {
              hasMore = false;
          }
      }
      
      const grouped: Record<MalListStatus, MalAnimeNode[]> = {
        watching: [],
        completed: [],
        on_hold: [],
        dropped: [],
        plan_to_watch: [],
      };

      allItems.forEach(item => {
        const status = item.list_status.status;
        if (grouped[status]) {
          grouped[status].push(item);
        }
      });

      setGroupedList(grouped);
    } catch (error) {
      logger.error('[MalLibrary] Failed to fetch list', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMalList();
  }, [fetchMalList]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchMalList();
  };

  const handleItemPress = async (item: MalAnimeNode) => {
    // Requirement 8: Resolve correct Cinemata / TMDB / IMDb ID
    const malId = item.node.id;
    
    // Use MalSync API to get external IDs
    const { imdbId } = await MalSync.getIdsFromMalId(malId);
    
    if (imdbId) {
        navigation.navigate('Metadata', {
            id: imdbId,
            type: item.node.media_type === 'movie' ? 'movie' : 'series'
        });
    } else {
        // Fallback: Navigate to Search with the title if ID mapping is missing
        logger.warn(`[MalLibrary] Could not resolve IMDb ID for MAL:${malId}. Falling back to Search.`);
        navigation.navigate('Search', { query: item.node.title });
    }
  };

  const renderAnimeItem = ({ item }: { item: MalAnimeNode }) => (
    <TouchableOpacity 
      style={styles.animeItem} 
      onPress={() => handleItemPress(item)}
      activeOpacity={0.7}
    >
      <FastImage
        source={{ uri: item.node.main_picture?.medium }}
        style={styles.poster}
        resizeMode={FastImage.resizeMode.cover}
      />
      <View style={styles.badgeContainer}>
         <View style={[styles.episodeBadge, { backgroundColor: currentTheme.colors.primary }]}>
            <Text style={styles.episodeText}>
                {item.list_status.num_episodes_watched} / {item.node.num_episodes || '?'}
            </Text>
         </View>
      </View>
      <Text style={[styles.animeTitle, { color: currentTheme.colors.highEmphasis }]} numberOfLines={2}>
        {item.node.title}
      </Text>
      {item.list_status.score > 0 && (
        <View style={styles.scoreRow}>
          <MaterialIcons name="star" size={12} color="#FFD700" />
          <Text style={[styles.scoreText, { color: currentTheme.colors.mediumEmphasis }]}>
            {item.list_status.score}
          </Text>
        </View>
      )}
      
      {/* Requirement 5: Manual update button */}
      <TouchableOpacity 
        style={styles.editButton}
        onPress={() => {
          setSelectedAnime(item);
          setIsEditModalVisible(true);
        }}
      >
         <MaterialIcons name="edit" size={16} color={currentTheme.colors.white} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderSection = (status: MalListStatus, title: string, icon: string) => {
    const data = groupedList[status];
    if (data.length === 0) return null;

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name={icon as any} size={20} color={currentTheme.colors.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
            {title} ({data.length})
          </Text>
        </View>
        <FlatList
          data={data}
          renderItem={renderAnimeItem}
          keyExtractor={item => item.node.id.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          snapToInterval={ITEM_WIDTH + 12}
          decelerationRate="fast"
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.highEmphasis} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.highEmphasis }]}>
          MyAnimeList
        </Text>
        {/* Requirement 6: Manual Sync Button */}
        <TouchableOpacity onPress={handleRefresh} style={styles.syncButton} disabled={isLoading}>
          {isLoading ? (
              <ActivityIndicator size="small" color={currentTheme.colors.primary} />
          ) : (
              <MaterialIcons name="sync" size={24} color={currentTheme.colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {!isLoading || isRefreshing ? (
        <ScrollView 
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={currentTheme.colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {renderSection('watching', 'Watching', 'play-circle-outline')}
          {renderSection('plan_to_watch', 'Plan to Watch', 'bookmark-outline')}
          {renderSection('completed', 'Completed', 'check-circle-outline')}
          {renderSection('on_hold', 'On Hold', 'pause-circle-outline')}
          {renderSection('dropped', 'Dropped', 'highlight-off')}
        </ScrollView>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
        </View>
      )}

      {selectedAnime && (
        <MalEditModal
          visible={isEditModalVisible}
          anime={selectedAnime}
          onClose={() => {
            setIsEditModalVisible(false);
            setSelectedAnime(null);
          }}
          onUpdateSuccess={fetchMalList}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between'
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', flex: 1, marginLeft: 16 },
  syncButton: { padding: 4 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionContainer: { marginVertical: 12 },
  sectionHeader: { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  carouselContent: { paddingHorizontal: 10 },
  animeItem: {
    width: ITEM_WIDTH,
    marginHorizontal: 6,
    marginBottom: 10,
  },
  poster: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  badgeContainer: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  episodeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  episodeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  animeTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  scoreText: {
    fontSize: 11,
    marginLeft: 4,
  },
  editButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 15,
  }
});

export default MalLibraryScreen;
