import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../utils/playerStyles';
import { getTrackDisplayName } from '../utils/playerUtils';

interface AudioTrackModalProps {
  showAudioModal: boolean;
  setShowAudioModal: (show: boolean) => void;
  vlcAudioTracks: Array<{id: number, name: string, language?: string}>;
  selectedAudioTrack: number | null;
  selectAudioTrack: (trackId: number) => void;
}

export const AudioTrackModal: React.FC<AudioTrackModalProps> = ({
  showAudioModal,
  setShowAudioModal,
  vlcAudioTracks,
  selectedAudioTrack,
  selectAudioTrack,
}) => {
  if (!showAudioModal) return null;
  
  return (
    <View style={styles.fullscreenOverlay}>
      <View style={styles.enhancedModalContainer}>
        <View style={styles.enhancedModalHeader}>
          <Text style={styles.enhancedModalTitle}>Audio</Text>
          <TouchableOpacity 
            style={styles.enhancedCloseButton}
            onPress={() => setShowAudioModal(false)}
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.trackListScrollContainer}>
          <View style={styles.trackListContainer}>
            {vlcAudioTracks.length > 0 ? vlcAudioTracks.map(track => (
              <TouchableOpacity
                key={track.id}
                style={styles.enhancedTrackItem}
                onPress={() => {
                  selectAudioTrack(track.id);
                  setShowAudioModal(false);
                }}
              >
                <View style={styles.trackInfoContainer}>
                  <Text style={styles.trackPrimaryText}>
                    {getTrackDisplayName(track)}
                  </Text>
                  {(track.name && track.language) && (
                    <Text style={styles.trackSecondaryText}>{track.name}</Text>
                  )}
                </View>
                {selectedAudioTrack === track.id && (
                  <View style={styles.selectedIndicatorContainer}>
                    <Ionicons name="checkmark" size={22} color="#E50914" />
                  </View>
                )}
              </TouchableOpacity>
            )) : (
              <View style={styles.emptyStateContainer}>
                <Ionicons name="alert-circle-outline" size={40} color="#888" />
                <Text style={styles.emptyStateText}>No audio tracks available</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

export default AudioTrackModal; 