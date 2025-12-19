import React from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  withTiming,
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

const MorphingButton = ({ label, isSelected, onPress, isSmall = false }: any) => {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      // Linear transition from 40 (Pill) to 10 (Rectangle)
      borderRadius: withTiming(isSelected ? 10 : 40, { duration: 250 }),
      backgroundColor: withTiming(isSelected ? (isSmall ? 'rgba(255,255,255,0.2)' : 'white') : 'rgba(255,255,255,0.06)', { duration: 50 }),
    };
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: isSmall ? 0 : 1 }}>
      <Animated.View style={[{ paddingVertical: isSmall ? 6 : 8, paddingHorizontal: isSmall ? 14 : 0, alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>
        <Text style={{
          color: isSelected && !isSmall ? 'black' : 'white',
          fontWeight: isSelected ? '700' : '400',
          fontSize: isSmall ? 11 : 13
        }}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const SpeedModal: React.FC<SpeedModalProps> = ({
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
  const speedPresets = [0.5, 1.0, 1.25, 1.5, 2.0, 2.5];
  const holdSpeedOptions = [1.0, 2.0, 3.0];

  if (!showSpeedModal) return null;

  return (
    <View style={StyleSheet.absoluteFill} zIndex={9999}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setShowSpeedModal(false)}
      >
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }} />
      </TouchableOpacity>

      <View pointerEvents="box-none" style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingBottom: 20 }}>
        <Animated.View
          entering={SlideInDown.duration(300)}
          exiting={SlideOutDown.duration(250)}
          style={{
            width: Math.min(width * 0.9, 420),
            backgroundColor: 'rgba(15, 15, 15, 0.95)',
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)'
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600'}}>Playback Speed</Text>
          </View>

          {/* Speed Selection Row */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
            {speedPresets.map((speed) => (
              <MorphingButton
                key={speed}
                label={`${speed}x`}
                isSelected={currentSpeed === speed}
                onPress={() => setPlaybackSpeed(speed)}
              />
            ))}
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 14 }} />

          {/* On Hold Section */}
          <View>
            <TouchableOpacity
              onPress={() => setHoldToSpeedEnabled(!holdToSpeedEnabled)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: holdToSpeedEnabled ? 15 : 0 }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>On Hold</Text>
              <View style={{
                width: 34, height: 18, borderRadius: 10,
                backgroundColor: holdToSpeedEnabled ? 'white' : 'rgba(255,255,255,0.2)',
                padding: 2, alignItems: holdToSpeedEnabled ? 'flex-end' : 'flex-start'
              }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: holdToSpeedEnabled ? 'black' : 'white' }} />
              </View>
            </TouchableOpacity>

            {holdToSpeedEnabled && (
              <Animated.View entering={FadeIn} style={{ flexDirection: 'row', gap: 8 }}>
                {holdSpeedOptions.map((speed) => (
                  <MorphingButton
                    key={speed}
                    isSmall
                    label={`${speed}x`}
                    isSelected={holdToSpeedValue === speed}
                    onPress={() => setHoldToSpeedValue(speed)}
                  />
                ))}
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

export default SpeedModal;
