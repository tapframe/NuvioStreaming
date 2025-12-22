import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { getTrackDisplayName } from '../utils/playerUtils';

interface AudioTrackModalProps {
  showAudioModal: boolean;
  setShowAudioModal: (show: boolean) => void;
  ksAudioTracks: Array<{ id: number, name: string, language?: string }>;
  selectedAudioTrack: number | null;
  selectAudioTrack: (trackId: number) => void;
}

export const AudioTrackModal: React.FC<AudioTrackModalProps> = ({
  showAudioModal,
  setShowAudioModal,
  ksAudioTracks,
  selectedAudioTrack,
  selectAudioTrack,
}) => {
  const { width } = useWindowDimensions();
  const MENU_WIDTH = Math.min(width * 0.85, 400);

  const handleClose = () => setShowAudioModal(false);

  if (!showAudioModal) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </TouchableOpacity>

      <Animated.View
        entering={SlideInRight.duration(300)}
        exiting={SlideOutRight.duration(250)}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: MENU_WIDTH,
          backgroundColor: '#0f0f0f',
          borderLeftWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <View style={{ paddingTop: Platform.OS === 'ios' ? 60 : 15, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '700' }}>Audio Tracks</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 15, paddingBottom: 40 }}
        >
          <View style={{ gap: 8 }}>
            {ksAudioTracks.map((track) => {
              const isSelected = selectedAudioTrack === track.id;

              return (
                <TouchableOpacity
                  key={track.id}
                  onPress={() => {
                    selectAudioTrack(track.id);
                    setTimeout(handleClose, 200);
                  }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: isSelected ? 'white' : 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: isSelected ? 'white' : 'rgba(255,255,255,0.1)',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: isSelected ? 'black' : 'white',
                      fontWeight: isSelected ? '700' : '500',
                      fontSize: 15
                    }}>
                      {getTrackDisplayName(track)}
                    </Text>
                  </View>
                  {isSelected && <MaterialIcons name="check" size={18} color="black" />}
                </TouchableOpacity>
              );
            })}

            {ksAudioTracks.length === 0 && (
              <View style={{ padding: 40, alignItems: 'center', opacity: 0.5 }}>
                <MaterialIcons name="volume-off" size={32} color="white" />
                <Text style={{ color: 'white', marginTop: 10 }}>No audio tracks available</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

export default AudioTrackModal;
