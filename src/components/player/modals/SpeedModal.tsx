import React from 'react';
import { View, Text, TouchableOpacity, Platform, useWindowDimensions, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';

interface SpeedModalProps {
  showSpeedModal: boolean;
  setShowSpeedModal: (show: boolean) => void;
  currentSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  holdToSpeedEnabled: boolean;
  setHoldToSpeedEnabled: (enabled: boolean) => void;
  holdToSpeedValue: number;
  setHoldToSpeedValue: (speed: number) => void;
}

export const SpeedModal: React.FC<SpeedModalProps> = ({
  showSpeedModal,
  setShowSpeedModal,
  currentSpeed,
  setPlaybackSpeed,
  holdToSpeedEnabled,
  setHoldToSpeedEnabled,
  holdToSpeedValue,
  setHoldToSpeedValue,
}) => {
  const { width } = useWindowDimensions();
  const MENU_WIDTH = Math.min(width * 0.85, 400);

  const speedPresets = [0.5, 1.0, 1.5, 2.0, 2.5];
  const holdSpeedOptions = [1.5, 2.0];

  const handleClose = () => {
    setShowSpeedModal(false);
  };

  const handleSpeedSelect = (speed: number) => {
    setPlaybackSpeed(speed);
  };

  const handleHoldSpeedSelect = (speed: number) => {
    setHoldToSpeedValue(speed);
  };

  if (!showSpeedModal) return null;

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
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '700' }}>Playback Speed</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 15, paddingBottom: 40 }}
        >
          {/* Current Speed Display */}
          <View style={{
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderRadius: 12,
            padding: 12,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: 'rgba(59, 130, 246, 0.3)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="play-arrow" size={20} color="#3B82F6" />
              <Text style={{
                color: '#3B82F6',
                fontSize: 18,
                fontWeight: '700',
                marginLeft: 6
              }}>
                Current: {currentSpeed}x
              </Text>
            </View>
          </View>

          {/* Speed Presets */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 14,
              fontWeight: '600',
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              Speed Presets
            </Text>

            <View style={{ gap: 8 }}>
              {speedPresets.map((speed) => {
                const isSelected = currentSpeed === speed;
                return (
                  <TouchableOpacity
                    key={speed}
                    onPress={() => handleSpeedSelect(speed)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: isSelected ? 'white' : 'rgba(255,255,255,0.06)',
                      borderWidth: 1,
                      borderColor: isSelected ? 'white' : 'rgba(255,255,255,0.1)',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{
                      color: isSelected ? 'black' : 'white',
                      fontWeight: isSelected ? '700' : '500',
                      fontSize: 15
                    }}>
                      {speed}x
                    </Text>
                    {isSelected && <MaterialIcons name="check" size={18} color="black" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Hold-to-Speed Settings */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <MaterialIcons name="touch-app" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginLeft: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Hold-to-Speed
              </Text>
            </View>

            {/* Enable Toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>Enable Hold Speed</Text>
              <TouchableOpacity
                style={{
                  width: 54,
                  height: 30,
                  backgroundColor: holdToSpeedEnabled ? '#22C55E' : 'rgba(255,255,255,0.25)',
                  borderRadius: 15,
                  justifyContent: 'center',
                  alignItems: holdToSpeedEnabled ? 'flex-end' : 'flex-start',
                  paddingHorizontal: 3
                }}
                onPress={() => setHoldToSpeedEnabled(!holdToSpeedEnabled)}
              >
                <View style={{ width: 24, height: 24, backgroundColor: 'white', borderRadius: 12 }} />
              </TouchableOpacity>
            </View>

            {/* Hold Speed Selector */}
            {holdToSpeedEnabled && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: 'white', fontWeight: '600', marginBottom: 10, fontSize: 15 }}>Hold Speed</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {holdSpeedOptions.map((speed) => {
                    const isSelected = holdToSpeedValue === speed;
                    return (
                      <TouchableOpacity
                        key={speed}
                        onPress={() => handleHoldSpeedSelect(speed)}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: isSelected ? 'white' : 'rgba(255,255,255,0.06)',
                          borderWidth: 1,
                          borderColor: isSelected ? 'white' : 'rgba(255,255,255,0.1)',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{
                          color: isSelected ? 'black' : 'white',
                          fontWeight: isSelected ? '700' : '500',
                          fontSize: 14
                        }}>
                          {speed}x
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Info Text */}
            <View style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: 'rgba(34, 197, 94, 0.3)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <MaterialIcons name="info" size={16} color="#22C55E" />
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color: '#22C55E',
                    fontSize: 13,
                    fontWeight: '600',
                    marginBottom: 4,
                  }}>
                    Hold left/right sides
                  </Text>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 12,
                    lineHeight: 16,
                  }}>
                    Hold and press the left or right side of the video player to temporarily boost playback speed.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

export default SpeedModal;
