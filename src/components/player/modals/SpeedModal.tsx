import React from 'react';
import { View, Text, TouchableOpacity, Platform, useWindowDimensions, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isIos = Platform.OS === 'ios';
  const isLandscape = width > height;
  
  // Responsive tuning - more aggressive compacting
  const isCompact = width < 360 || height < 640;
  const sectionPad = isCompact ? 6 : 8;
  const chipPadH = isCompact ? 4 : 6;
  const chipPadV = isCompact ? 3 : 4;
  const menuWidth = Math.min(
    width * (isIos ? (isLandscape ? 0.55 : 0.8) : 0.85),
    isIos ? 380 : 360
  );

  const speedPresets = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  const holdSpeedOptions = [1.5, 2.0, 2.5, 3.0];

  const handleClose = () => {
    setShowSpeedModal(false);
  };

  const handleSpeedSelect = (speed: number) => {
    setPlaybackSpeed(speed);
  };

  const handleHoldSpeedSelect = (speed: number) => {
    setHoldToSpeedValue(speed);
  };

  const renderSpeedModal = () => {
    if (!showSpeedModal) return null;
    
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
            width: menuWidth,
            backgroundColor: '#1A1A1A',
            zIndex: 9999,
            elevation: 20,
            shadowColor: '#000',
            shadowOffset: { width: -5, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            borderTopLeftRadius: 20,
            borderBottomLeftRadius: 20,
            paddingRight: 0,
          }}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: insets.top + (isCompact ? 4 : 6),
            paddingBottom: 6,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255, 255, 255, 0.08)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialIcons name="speed" size={20} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Playback Speed</Text>
            </View>
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
            contentContainerStyle={{ 
              padding: 12, 
              paddingBottom: (isCompact ? 16 : 20) + (isIos ? insets.bottom : 0) 
            }}
            showsVerticalScrollIndicator={false}
          >
            
            {/* Current Speed Display */}
            <View style={{ 
              backgroundColor: 'rgba(59, 130, 246, 0.15)', 
              borderRadius: 12, 
              padding: sectionPad * 0.75, 
              marginBottom: 12,
              borderWidth: 1,
              borderColor: 'rgba(59, 130, 246, 0.3)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="play-arrow" size={20} color="#3B82F6" />
                <Text style={{ 
                  color: '#3B82F6', 
                  fontSize: isCompact ? 16 : 18, 
                  fontWeight: '700', 
                  marginLeft: 6 
                }}>
                  Current: {currentSpeed}x
                </Text>
              </View>
            </View>

            {/* Speed Presets */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 14,
                fontWeight: '600',
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Speed Presets
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {speedPresets.map((speed) => {
                  const isSelected = currentSpeed === speed;
                  return (
                    <TouchableOpacity
                      key={speed}
                      onPress={() => handleSpeedSelect(speed)}
                      style={{
                        paddingHorizontal: chipPadH,
                        paddingVertical: chipPadV,
                        borderRadius: 12,
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        borderWidth: 1,
                        borderColor: isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                        minWidth: 50,
                        alignItems: 'center',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ 
                        color: isSelected ? '#3B82F6' : '#FFFFFF', 
                        fontWeight: '600', 
                        fontSize: isCompact ? 11 : 12 
                      }}>
                        {speed}x
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Hold-to-Speed Settings - Android Only */}
            {Platform.OS === 'android' && (
              <View style={{ gap: isCompact ? 8 : 12 }}>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: sectionPad }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <MaterialIcons name="touch-app" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginLeft: 4, fontWeight: '600' }}>
                      Hold-to-Speed
                    </Text>
                  </View>

                  {/* Enable Toggle */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }}>Enable Hold Speed</Text>
                    <TouchableOpacity
                      style={{ 
                        width: isCompact ? 48 : 54, 
                        height: isCompact ? 28 : 30, 
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
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '600', marginBottom: 6, fontSize: 13 }}>Hold Speed</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {holdSpeedOptions.map((speed) => {
                          const isSelected = holdToSpeedValue === speed;
                          return (
                            <TouchableOpacity
                              key={speed}
                              onPress={() => handleHoldSpeedSelect(speed)}
                              style={{
                                paddingHorizontal: chipPadH,
                                paddingVertical: chipPadV,
                                borderRadius: 10,
                                backgroundColor: isSelected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                borderWidth: 1,
                                borderColor: isSelected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                minWidth: 45,
                                alignItems: 'center',
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ 
                                color: isSelected ? '#22C55E' : '#FFFFFF', 
                                fontWeight: '600', 
                                fontSize: isCompact ? 10 : 11 
                              }}>
                                {speed}x
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Info Text */}
                  <View style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: 10,
                    padding: sectionPad * 0.75,
                    borderWidth: 1,
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <MaterialIcons name="info" size={14} color="#22C55E" />
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          color: '#22C55E',
                          fontSize: isCompact ? 12 : 13,
                          fontWeight: '600',
                          marginBottom: 4,
                        }}>
                          Hold left/right sides
                        </Text>
                        <Text style={{
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: isCompact ? 11 : 12,
                          lineHeight: isCompact ? 14 : 16,
                        }}>
                          Hold and press the left or right side of the video player to temporarily boost playback speed.
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </>
    );
  };

  return (
    <>
      {renderSpeedModal()}
    </>
  );
};

export default SpeedModal;
