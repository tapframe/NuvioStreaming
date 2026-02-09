import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { MalApiService } from '../../services/mal/MalApi';
import { MalListStatus, MalAnimeNode } from '../../types/mal';
import { useToast } from '../../contexts/ToastContext';

interface MalEditModalProps {
  visible: boolean;
  onClose: () => void;
  anime: MalAnimeNode;
  onUpdateSuccess: () => void;
}

export const MalEditModal: React.FC<MalEditModalProps> = ({
  visible,
  onClose,
  anime,
  onUpdateSuccess,
}) => {
  const { currentTheme } = useTheme();
  const { showSuccess, showError } = useToast();
  
  const [status, setStatus] = useState<MalListStatus>(anime.list_status.status);
  const [episodes, setEpisodes] = useState(anime.list_status.num_episodes_watched.toString());
  const [score, setScore] = useState(anime.list_status.score.toString());
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (visible) {
      setStatus(anime.list_status.status);
      setEpisodes(anime.list_status.num_episodes_watched.toString());
      setScore(anime.list_status.score.toString());
    }
  }, [visible, anime]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const epNum = parseInt(episodes, 10) || 0;
      let scoreNum = parseInt(score, 10) || 0;
      
      // Validation: MAL scores must be between 0 and 10
      scoreNum = Math.max(0, Math.min(10, scoreNum));
      
      await MalApiService.updateStatus(anime.node.id, status, epNum, scoreNum);
      
      showSuccess('Updated', `${anime.node.title} status updated on MAL`);
      onUpdateSuccess();
      onClose();
    } catch (error) {
      showError('Update Failed', 'Could not update MAL status');
    } finally {
      setIsUpdating(false);
    }
  };

  const statusOptions: { label: string; value: MalListStatus }[] = [
    { label: 'Watching', value: 'watching' },
    { label: 'Completed', value: 'completed' },
    { label: 'On Hold', value: 'on_hold' },
    { label: 'Dropped', value: 'dropped' },
    { label: 'Plan to Watch', value: 'plan_to_watch' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.darkGray || '#1A1A1A' }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: currentTheme.colors.highEmphasis }]} numberOfLines={1}>
                Edit {anime.node.title}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialIcons name="close" size={24} color={currentTheme.colors.mediumEmphasis} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: currentTheme.colors.mediumEmphasis }]}>Status</Text>
              <View style={styles.statusGrid}>
                {statusOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.statusChip,
                      { borderColor: currentTheme.colors.border },
                      status === option.value && { 
                        backgroundColor: currentTheme.colors.primary,
                        borderColor: currentTheme.colors.primary 
                      }
                    ]}
                    onPress={() => setStatus(option.value)}
                  >
                    <Text style={[
                      styles.statusText,
                      { color: currentTheme.colors.highEmphasis },
                      status === option.value && { color: 'white' }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: currentTheme.colors.mediumEmphasis }]}>
                    Episodes ({anime.node.num_episodes || '?'})
                  </Text>
                  <TextInput
                    style={[styles.input, { 
                      color: currentTheme.colors.highEmphasis,
                      borderColor: currentTheme.colors.border,
                      backgroundColor: currentTheme.colors.elevation1
                    }]}
                    value={episodes}
                    onChangeText={setEpisodes}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={currentTheme.colors.mediumEmphasis}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: currentTheme.colors.mediumEmphasis }]}>Score (0-10)</Text>
                  <TextInput
                    style={[styles.input, { 
                      color: currentTheme.colors.highEmphasis,
                      borderColor: currentTheme.colors.border,
                      backgroundColor: currentTheme.colors.elevation1
                    }]}
                    value={score}
                    onChangeText={setScore}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={currentTheme.colors.mediumEmphasis}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.updateButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={handleUpdate}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.updateButtonText}>Update MAL</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  inputGroup: {
    flex: 1,
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  updateButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  updateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
