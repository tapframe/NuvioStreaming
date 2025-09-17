import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { getTrackDisplayName, DEBUG_MODE } from '../utils/playerUtils';
import { logger } from '../../../utils/logger';

interface AudioTrackModalProps {
  showAudioModal: boolean;
  setShowAudioModal: (show: boolean) => void;
  vlcAudioTracks: Array<{id: number, name: string, language?: string}>;
  selectedAudioTrack: number | null;
  selectAudioTrack: (trackId: number) => void;
}

const { width } = Dimensions.get('window');
const MENU_WIDTH = Math.min(width * 0.85, 400);

export const AudioTrackModal: React.FC<AudioTrackModalProps> = ({
  showAudioModal,
  setShowAudioModal,
  vlcAudioTracks,
  selectedAudioTrack,
  selectAudioTrack,
}) => {
  const handleClose = () => {
    setShowAudioModal(false);
  };

  // Debug logging when modal opens
  React.useEffect(() => {
    if (showAudioModal && DEBUG_MODE) {
      logger.log(`[AudioTrackModal] Modal opened with selectedAudioTrack:`, selectedAudioTrack);
      logger.log(`[AudioTrackModal] Available tracks:`, vlcAudioTracks);
      if (typeof selectedAudioTrack === 'number') {
        const selectedTrack = vlcAudioTracks.find(track => track.id === selectedAudioTrack);
        if (selectedTrack) {
          logger.log(`[AudioTrackModal] Selected track found: ${selectedTrack.name} (${selectedTrack.language})`);
        } else {
          logger.warn(`[AudioTrackModal] Selected track ${selectedAudioTrack} not found in available tracks`);
        }
      }
    }
  }, [showAudioModal, selectedAudioTrack, vlcAudioTracks]);

  if (!showAudioModal) return null;
  
  return (
    <>
      {/* Backdrop */}
      <Animated.View 
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
        }}
      >
        <TouchableOpacity 
          style={{ flex: 1 }}
          onPress={handleClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Side Menu */}
      <Animated.View
        entering={SlideInRight.duration(300)}
        exiting={SlideOutRight.duration(250)}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: MENU_WIDTH,
          backgroundColor: '#1A1A1A',
          zIndex: 9999,
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: { width: -5, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
          borderTopLeftRadius: 20,
          borderBottomLeftRadius: 20,
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 60,
          paddingBottom: 20,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        }}>
          <Text style={{
            color: '#FFFFFF',
            fontSize: 22,
            fontWeight: '700',
          }}>
            Audio Tracks
          </Text>
          <TouchableOpacity 
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <MaterialIcons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Audio Tracks */}
          <View>
            <Text style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 14,
              fontWeight: '600',
              marginBottom: 15,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              Available Tracks ({vlcAudioTracks.length})
            </Text>
            
            <View style={{ gap: 8 }}>
              {vlcAudioTracks.map((track) => {
                // Determine if track is selected
                const isSelected = selectedAudioTrack === track.id;

                return (
                  <TouchableOpacity
                    key={track.id}
                    style={{
                      backgroundColor: isSelected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: isSelected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                    }}
                    onPress={() => {
                      if (DEBUG_MODE) {
                        logger.log(`[AudioTrackModal] Selecting track: ${track.id} (${track.name})`);
                      }
                      selectAudioTrack(track.id);
                      // Close modal after selection
                      setTimeout(() => {
                        setShowAudioModal(false);
                      }, 200);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{
                            color: '#FFFFFF',
                            fontSize: 15,
                            fontWeight: '500',
                            flex: 1,
                          }}>
                            {getTrackDisplayName(track)}
                          </Text>
                        </View>
                        {track.language && (
                          <Text style={{
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: 13,
                          }}>
                            {track.language.toUpperCase()}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <MaterialIcons name="check" size={20} color="#22C55E" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {vlcAudioTracks.length === 0 && (
              <View style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 16,
                padding: 20,
                alignItems: 'center',
              }}>
                <MaterialIcons name="volume-off" size={48} color="rgba(255,255,255,0.3)" />
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: 16,
                  marginTop: 16,
                  textAlign: 'center',
                }}>
                  No audio tracks available
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}; 