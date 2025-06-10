import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { 
  FadeIn, 
  FadeOut, 
  SlideInDown, 
  SlideOutDown,
  FadeInDown,
  FadeInUp,
  Layout,
  withSpring,
  withTiming,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Easing,
  withDelay,
  withSequence,
  runOnJS,
  BounceIn,
  ZoomIn
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../utils/playerStyles';
import { getTrackDisplayName } from '../utils/playerUtils';

interface AudioTrackModalProps {
  showAudioModal: boolean;
  setShowAudioModal: (show: boolean) => void;
  vlcAudioTracks: Array<{id: number, name: string, language?: string}>;
  selectedAudioTrack: number | null;
  selectAudioTrack: (trackId: number) => void;
}

const { width, height } = Dimensions.get('window');

// Fixed dimensions for the modal
const MODAL_WIDTH = Math.min(width - 32, 520);
const MODAL_MAX_HEIGHT = height * 0.85;

const AudioBadge = ({ 
  text, 
  color, 
  bgColor, 
  icon,
  delay = 0 
}: { 
  text: string; 
  color: string; 
  bgColor: string; 
  icon?: string;
  delay?: number;
}) => (
  <Animated.View 
    entering={FadeInUp.duration(200).delay(delay)}
    style={{
      backgroundColor: bgColor,
      borderColor: `${color}40`,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      elevation: 2,
      shadowColor: color,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
    }}
  >
    {icon && (
      <MaterialIcons name={icon as any} size={12} color={color} style={{ marginRight: 4 }} />
    )}
    <Text style={{
      color: color,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    }}>
      {text}
    </Text>
  </Animated.View>
);

export const AudioTrackModal: React.FC<AudioTrackModalProps> = ({
  showAudioModal,
  setShowAudioModal,
  vlcAudioTracks,
  selectedAudioTrack,
  selectAudioTrack,
}) => {
  const modalScale = useSharedValue(0.9);
  const modalOpacity = useSharedValue(0);
  
  React.useEffect(() => {
    if (showAudioModal) {
      modalScale.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
        mass: 0.8,
      });
      modalOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [showAudioModal]);

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modalScale.value }],
    opacity: modalOpacity.value,
  }));

  const handleClose = () => {
    modalScale.value = withTiming(0.9, { duration: 150 });
    modalOpacity.value = withTiming(0, { duration: 150 });
    setTimeout(() => setShowAudioModal(false), 150);
  };

  if (!showAudioModal) return null;
  
  return (
    <Animated.View 
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      {/* Backdrop */}
      <TouchableOpacity 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        onPress={handleClose}
        activeOpacity={1}
      />

      {/* Modal Content */}
      <Animated.View
        style={[
          {
            width: MODAL_WIDTH,
            maxHeight: MODAL_MAX_HEIGHT,
            minHeight: height * 0.3,
            overflow: 'hidden',
            elevation: 25,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.4,
            shadowRadius: 25,
            alignSelf: 'center',
          },
          modalStyle,
        ]}
      >
        {/* Glassmorphism Background */}
        <BlurView 
          intensity={100} 
          tint="dark"
          style={{
            borderRadius: 28,
            overflow: 'hidden',
            backgroundColor: 'rgba(26, 26, 26, 0.8)',
            width: '100%',
            height: '100%',
          }}
        >
          {/* Header */}
          <LinearGradient
            colors={[
              'rgba(249, 115, 22, 0.95)',
              'rgba(234, 88, 12, 0.95)',
              'rgba(194, 65, 12, 0.9)'
            ]}
            locations={[0, 0.6, 1]}
            style={{
              paddingHorizontal: 28,
              paddingVertical: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255, 255, 255, 0.1)',
              width: '100%',
            }}
          >
            <Animated.View 
              entering={FadeInDown.duration(300).delay(100)}
              style={{ flex: 1 }}
            >
              <Text style={{
                color: '#fff',
                fontSize: 24,
                fontWeight: '800',
                letterSpacing: -0.8,
                textShadowColor: 'rgba(0, 0, 0, 0.3)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }}>
                Audio Tracks
              </Text>
              <Text style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: 14,
                marginTop: 4,
                fontWeight: '500',
                letterSpacing: 0.2,
              }}>
                Choose from {vlcAudioTracks.length} available track{vlcAudioTracks.length !== 1 ? 's' : ''}
              </Text>
            </Animated.View>
            
            <Animated.View entering={BounceIn.duration(400).delay(200)}>
              <TouchableOpacity 
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginLeft: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                }}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          </LinearGradient>

          {/* Content */}
          <ScrollView 
            style={{ 
              maxHeight: MODAL_MAX_HEIGHT - 100, // Account for header height
              backgroundColor: 'transparent',
              width: '100%',
            }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ 
              padding: 24,
              paddingBottom: 32,
              width: '100%',
            }}
            bounces={false}
          >
            <View style={styles.modernTrackListContainer}>
              {vlcAudioTracks.length > 0 ? vlcAudioTracks.map((track, index) => (
                <Animated.View
                  key={track.id}
                  entering={FadeInDown.duration(300).delay(150 + (index * 50))}
                  layout={Layout.springify()}
                  style={{ 
                    marginBottom: 16,
                    width: '100%',
                  }}
                >
                  <TouchableOpacity
                    style={{
                      backgroundColor: selectedAudioTrack === track.id 
                        ? 'rgba(249, 115, 22, 0.08)' 
                        : 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 20,
                      padding: 20,
                      borderWidth: 2,
                      borderColor: selectedAudioTrack === track.id 
                        ? 'rgba(249, 115, 22, 0.4)' 
                        : 'rgba(255, 255, 255, 0.08)',
                      elevation: selectedAudioTrack === track.id ? 8 : 3,
                      shadowColor: selectedAudioTrack === track.id ? '#F97316' : '#000',
                      shadowOffset: { width: 0, height: selectedAudioTrack === track.id ? 4 : 2 },
                      shadowOpacity: selectedAudioTrack === track.id ? 0.3 : 0.1,
                      shadowRadius: selectedAudioTrack === track.id ? 12 : 6,
                      width: '100%',
                    }}
                    onPress={() => {
                      selectAudioTrack(track.id);
                      handleClose();
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                    }}>
                      <View style={{ flex: 1, marginRight: 16 }}>
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 8,
                          gap: 12,
                        }}>
                          <Text style={{
                            color: selectedAudioTrack === track.id ? '#fff' : 'rgba(255, 255, 255, 0.95)',
                            fontSize: 16,
                            fontWeight: '700',
                            letterSpacing: -0.2,
                            flex: 1,
                          }}>
                            {getTrackDisplayName(track)}
                          </Text>
                          
                          {selectedAudioTrack === track.id && (
                            <Animated.View 
                              entering={BounceIn.duration(300)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: 'rgba(249, 115, 22, 0.25)',
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor: 'rgba(249, 115, 22, 0.5)',
                              }}
                            >
                              <MaterialIcons name="volume-up" size={12} color="#F97316" />
                              <Text style={{
                                color: '#F97316',
                                fontSize: 10,
                                fontWeight: '800',
                                marginLeft: 3,
                                letterSpacing: 0.3,
                              }}>
                                ACTIVE
                              </Text>
                            </Animated.View>
                          )}
                        </View>
                        
                        <View style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 6,
                          alignItems: 'center',
                        }}>
                          <AudioBadge 
                            text="AUDIO TRACK" 
                            color="#F97316" 
                            bgColor="rgba(249, 115, 22, 0.15)"
                            icon="audiotrack"
                          />
                          {track.language && (
                            <AudioBadge 
                              text={track.language.toUpperCase()} 
                              color="#6B7280" 
                              bgColor="rgba(107, 114, 128, 0.15)"
                              icon="language"
                              delay={50}
                            />
                          )}
                        </View>
                      </View>
                      
                      <View style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: selectedAudioTrack === track.id 
                          ? 'rgba(249, 115, 22, 0.15)' 
                          : 'rgba(255, 255, 255, 0.05)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 2,
                        borderColor: selectedAudioTrack === track.id 
                          ? 'rgba(249, 115, 22, 0.3)' 
                          : 'rgba(255, 255, 255, 0.1)',
                      }}>
                        {selectedAudioTrack === track.id ? (
                          <Animated.View entering={ZoomIn.duration(200)}>
                            <MaterialIcons name="check-circle" size={24} color="#F97316" />
                          </Animated.View>
                        ) : (
                          <MaterialIcons name="volume-up" size={24} color="rgba(255,255,255,0.6)" />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )) : (
                <Animated.View 
                  entering={FadeInDown.duration(300).delay(150)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 20,
                    padding: 40,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.05)',
                    width: '100%',
                  }}
                >
                  <MaterialIcons name="volume-off" size={48} color="rgba(255, 255, 255, 0.3)" />
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: 18,
                    fontWeight: '700',
                    marginTop: 16,
                    textAlign: 'center',
                    letterSpacing: -0.3,
                  }}>
                    No audio tracks found
                  </Text>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: 14,
                    marginTop: 8,
                    textAlign: 'center',
                    lineHeight: 20,
                  }}>
                    No audio tracks are available for this content.{'\n'}Try a different source or check your connection.
                  </Text>
                </Animated.View>
              )}
            </View>
          </ScrollView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

export default AudioTrackModal; 