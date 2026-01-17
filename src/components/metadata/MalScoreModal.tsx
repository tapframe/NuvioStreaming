import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { MalApiService } from '../../services/mal/MalApi';
import { MalSync } from '../../services/mal/MalSync';
import { MalListStatus } from '../../types/mal';
import { useTheme } from '../../contexts/ThemeContext';

interface MalScoreModalProps {
  visible: boolean;
  onClose: () => void;
  malId: number;
  animeTitle: string;
  initialStatus?: MalListStatus;
  initialScore?: number;
  initialEpisodes?: number;
  // Season support props
  seasons?: number[];
  currentSeason?: number;
  imdbId?: string;
  type?: 'movie' | 'series';
}

const STATUS_OPTIONS: { label: string; value: MalListStatus }[] = [
  { label: 'Watching', value: 'watching' },
  { label: 'Completed', value: 'completed' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Dropped', value: 'dropped' },
  { label: 'Plan to Watch', value: 'plan_to_watch' },
];

export const MalScoreModal: React.FC<MalScoreModalProps> = ({
  visible,
  onClose,
  malId,
  animeTitle,
  initialStatus = 'watching',
  initialScore = 0,
  initialEpisodes = 0,
  seasons = [],
  currentSeason = 1,
  imdbId,
  type = 'series'
}) => {
  const { currentTheme } = useTheme();
  
  // State for season management
  const [selectedSeason, setSelectedSeason] = useState(currentSeason);
  const [activeMalId, setActiveMalId] = useState(malId);
  const [fetchingData, setFetchingData] = useState(false);

  // Form State
  const [status, setStatus] = useState<MalListStatus>(initialStatus);
  const [score, setScore] = useState(initialScore);
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch data when season changes (only for series with multiple seasons)
  useEffect(() => {
    const loadSeasonData = async () => {
      setFetchingData(true);
      // Reset active ID to prevent writing to the wrong season if fetch fails
      setActiveMalId(0); 
      
      try {
        // 1. Resolve MAL ID for this season
        let resolvedId = malId;
        if (type === 'series' && (seasons.length > 1 || selectedSeason !== currentSeason)) {
            resolvedId = await MalSync.getMalId(animeTitle, type, undefined, selectedSeason, imdbId) || 0;
        }
        
        if (resolvedId) {
          setActiveMalId(resolvedId);
          
          // 2. Fetch user status for this ID
          const data = await MalApiService.getMyListStatus(resolvedId);
          
          if (data.list_status) {
            setStatus(data.list_status.status);
            setScore(data.list_status.score);
            setEpisodes(data.list_status.num_episodes_watched);
          } else {
            // Default if not in list
            setStatus('plan_to_watch');
            setScore(0);
            setEpisodes(0);
          }
          setTotalEpisodes(data.num_episodes || 0);
        } else {
            console.warn('Could not resolve MAL ID for season', selectedSeason);
        }
      } catch (e) {
        console.error('Failed to load season data', e);
      } finally {
        setFetchingData(false);
      }
    };

    loadSeasonData();
  }, [selectedSeason, type, animeTitle, imdbId, malId]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await MalApiService.updateStatus(activeMalId, status, episodes, score);
      onClose();
    } catch (e) {
      console.error('Failed to update MAL status', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: currentTheme.colors.elevation2 || '#1E1E1E' }]}>
          <View style={styles.header}>
            <Image 
              source={require('../../../assets/rating-icons/mal-icon.png')} 
              style={styles.logo} 
              resizeMode="contain" 
            />
            <Text style={[styles.title, { color: currentTheme.colors.highEmphasis }]}>{animeTitle}</Text>
          </View>
          
          {/* Season Selector */}
          {type === 'series' && seasons.length > 1 && (
            <View style={styles.seasonContainer}>
              <Text style={[styles.sectionTitle, { color: currentTheme.colors.mediumEmphasis, marginTop: 0 }]}>Season</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonScroll}>
                {seasons.sort((a, b) => a - b).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.seasonChip,
                      selectedSeason === s && { backgroundColor: currentTheme.colors.primary },
                      { borderColor: currentTheme.colors.border }
                    ]}
                    onPress={() => setSelectedSeason(s)}
                  >
                    <Text style={[styles.chipText, selectedSeason === s && { color: '#fff', fontWeight: 'bold' }]}>
                      Season {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {fetchingData ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={currentTheme.colors.primary} />
            </View>
          ) : (
            <ScrollView>
              <Text style={[styles.sectionTitle, { color: currentTheme.colors.mediumEmphasis }]}>Status</Text>
              <View style={styles.optionsRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.chip,
                      status === opt.value && { backgroundColor: currentTheme.colors.primary },
                      { borderColor: currentTheme.colors.border }
                    ]}
                    onPress={() => setStatus(opt.value)}
                  >
                    <Text style={[styles.chipText, status === opt.value && { color: '#fff' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: currentTheme.colors.mediumEmphasis }]}>Episodes Watched</Text>
              <View style={styles.episodeRow}>
                <TouchableOpacity 
                  style={[styles.roundButton, { borderColor: currentTheme.colors.border }]} 
                  onPress={() => setEpisodes(Math.max(0, episodes - 1))}
                >
                  <MaterialIcons name="remove" size={20} color={currentTheme.colors.highEmphasis} />
                </TouchableOpacity>
                
                <View style={styles.episodeDisplay}>
                    <Text style={[styles.episodeCount, { color: currentTheme.colors.highEmphasis }]}>{episodes}</Text>
                    {totalEpisodes > 0 && (
                        <Text style={[styles.totalEpisodes, { color: currentTheme.colors.mediumEmphasis }]}> / {totalEpisodes}</Text>
                    )}
                </View>
                
                <TouchableOpacity 
                  style={[styles.roundButton, { borderColor: currentTheme.colors.border }]} 
                  onPress={() => setEpisodes(totalEpisodes > 0 ? Math.min(totalEpisodes, episodes + 1) : episodes + 1)}
                >
                  <MaterialIcons name="add" size={20} color={currentTheme.colors.highEmphasis} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { color: currentTheme.colors.mediumEmphasis }]}>Score</Text>
              <View style={styles.optionsRow}>
                {[...Array(11).keys()].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.scoreChip,
                      score === s && { backgroundColor: '#F5C518', borderColor: '#F5C518' },
                      { borderColor: currentTheme.colors.border }
                    ]}
                    onPress={() => setScore(s)}
                  >
                    <Text style={[styles.chipText, score === s && { color: '#000', fontWeight: 'bold' }]}>{s === 0 ? '-' : s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={{ color: currentTheme.colors.mediumEmphasis }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                style={[styles.saveButton, { backgroundColor: currentTheme.colors.primary, opacity: (loading || fetchingData || !activeMalId) ? 0.6 : 1 }]} 
                onPress={handleSave}
                disabled={loading || fetchingData || !activeMalId}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  container: { borderRadius: 16, padding: 20, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  logo: { width: 32, height: 32, marginRight: 12, borderRadius: 8 },
  title: { fontSize: 18, fontWeight: 'bold', flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 4 },
  scoreChip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  chipText: { fontSize: 12, fontWeight: '500' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 24 },
  cancelButton: { padding: 12 },
  saveButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, minWidth: 100, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
  seasonContainer: { marginBottom: 8 },
  seasonScroll: { paddingVertical: 4, gap: 8 },
  seasonChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  loadingContainer: { height: 200, justifyContent: 'center', alignItems: 'center' },
  episodeRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  roundButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  episodeDisplay: { flexDirection: 'row', alignItems: 'baseline', minWidth: 80, justifyContent: 'center' },
  episodeCount: { fontSize: 20, fontWeight: 'bold' },
  totalEpisodes: { fontSize: 14, marginLeft: 2 },
});
