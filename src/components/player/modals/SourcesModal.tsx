import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
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
import { Stream } from '../../../types/streams';
import QualityBadge from '../../metadata/QualityBadge';

interface SourcesModalProps {
  showSourcesModal: boolean;
  setShowSourcesModal: (show: boolean) => void;
  availableStreams: { [providerId: string]: { streams: Stream[]; addonName: string } };
  currentStreamUrl: string;
  onSelectStream: (stream: Stream) => void;
  isChangingSource: boolean;
}

const { width, height } = Dimensions.get('window');

// Fixed dimensions for the modal
const MODAL_WIDTH = Math.min(width - 32, 520);
const MODAL_MAX_HEIGHT = height * 0.85;

const QualityIndicator = ({ quality }: { quality: string | null }) => {
  if (!quality) return null;
  
  const qualityNum = parseInt(quality);
  let color = '#8B5CF6'; // Default purple
  let label = `${quality}p`;
  
  if (qualityNum >= 2160) {
    color = '#F59E0B'; // Gold for 4K
    label = '4K';
  } else if (qualityNum >= 1080) {
    color = '#EF4444'; // Red for 1080p
    label = 'FHD';
  } else if (qualityNum >= 720) {
    color = '#10B981'; // Green for 720p
    label = 'HD';
  }
  
  return (
    <Animated.View 
      entering={ZoomIn.duration(200).delay(100)}
      style={{
        backgroundColor: `${color}20`,
        borderColor: `${color}60`,
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
        marginRight: 4,
      }} />
      <Text style={{
        color: color,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
      }}>
        {label}
      </Text>
    </Animated.View>
  );
};

const StreamMetaBadge = ({ 
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
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
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
      <MaterialIcons name={icon as any} size={10} color={color} style={{ marginRight: 2 }} />
    )}
    <Text style={{
      color: color,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.3,
    }}>
      {text}
    </Text>
  </Animated.View>
);

const SourcesModal: React.FC<SourcesModalProps> = ({
  showSourcesModal,
  setShowSourcesModal,
  availableStreams,
  currentStreamUrl,
  onSelectStream,
  isChangingSource,
}) => {
  const modalScale = useSharedValue(0.9);
  const modalOpacity = useSharedValue(0);
  
  React.useEffect(() => {
    if (showSourcesModal) {
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
  }, [showSourcesModal]);

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modalScale.value }],
    opacity: modalOpacity.value,
  }));

  if (!showSourcesModal) return null;

  const sortedProviders = Object.entries(availableStreams).sort(([a], [b]) => {
    // Put HDRezka first
    if (a === 'hdrezka') return -1;
    if (b === 'hdrezka') return 1;
    return 0;
  });

  const handleStreamSelect = (stream: Stream) => {
    if (stream.url !== currentStreamUrl && !isChangingSource) {
      onSelectStream(stream);
    }
  };

  const getQualityFromTitle = (title?: string): string | null => {
    if (!title) return null;
    const match = title.match(/(\d+)p/);
    return match ? match[1] : null;
  };

  const isStreamSelected = (stream: Stream): boolean => {
    return stream.url === currentStreamUrl;
  };

  const handleClose = () => {
    modalScale.value = withTiming(0.9, { duration: 150 });
    modalOpacity.value = withTiming(0, { duration: 150 });
    setTimeout(() => setShowSourcesModal(false), 150);
  };

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
              'rgba(229, 9, 20, 0.95)',
              'rgba(176, 6, 16, 0.95)',
              'rgba(139, 5, 12, 0.9)'
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
                Switch Source
              </Text>
              <Text style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: 14,
                marginTop: 4,
                fontWeight: '500',
                letterSpacing: 0.2,
              }}>
                Choose from {Object.values(availableStreams).reduce((acc, curr) => acc + curr.streams.length, 0)} available streams
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
            {sortedProviders.map(([providerId, { streams, addonName }], providerIndex) => (
              <Animated.View 
                key={providerId}
                entering={FadeInDown.duration(400).delay(150 + (providerIndex * 80))}
                layout={Layout.springify()}
                style={{
                  marginBottom: streams.length > 0 ? 32 : 0,
                  width: '100%',
                }}
              >
                {/* Provider Header */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 20,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255, 255, 255, 0.08)',
                  width: '100%',
                }}>
                  <LinearGradient
                    colors={providerId === 'hdrezka' ? ['#00d4aa', '#00a085'] : ['#E50914', '#B00610']}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      marginRight: 16,
                      elevation: 3,
                      shadowColor: providerId === 'hdrezka' ? '#00d4aa' : '#E50914',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.4,
                      shadowRadius: 4,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: '#fff',
                      fontSize: 18,
                      fontWeight: '700',
                      letterSpacing: -0.3,
                    }}>
                      {addonName}
                    </Text>
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontSize: 12,
                      marginTop: 1,
                      fontWeight: '500',
                    }}>
                      Provider • {streams.length} stream{streams.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  
                  <View style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  }}>
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: 11,
                      fontWeight: '700',
                      letterSpacing: 0.5,
                    }}>
                      {streams.length}
                    </Text>
                  </View>
                </View>
                
                {/* Streams Grid */}
                <View style={{ gap: 16, width: '100%' }}>
                  {streams.map((stream, index) => {
                    const quality = getQualityFromTitle(stream.title);
                    const isSelected = isStreamSelected(stream);
                    const isHDR = stream.title?.toLowerCase().includes('hdr');
                    const isDolby = stream.title?.toLowerCase().includes('dolby') || stream.title?.includes('DV');
                    const size = stream.title?.match(/💾\s*([\d.]+\s*[GM]B)/)?.[1];
                    const isDebrid = stream.behaviorHints?.cached;
                    const isHDRezka = providerId === 'hdrezka';

                    return (
                      <Animated.View
                        key={`${stream.url}-${index}`}
                        entering={FadeInDown.duration(300).delay((providerIndex * 80) + (index * 40))}
                        layout={Layout.springify()}
                        style={{ width: '100%' }}
                      >
                        <TouchableOpacity
                          style={{
                            backgroundColor: isSelected 
                              ? 'rgba(229, 9, 20, 0.08)' 
                              : 'rgba(255, 255, 255, 0.03)',
                            borderRadius: 20,
                            padding: 20,
                            borderWidth: 2,
                            borderColor: isSelected 
                              ? 'rgba(229, 9, 20, 0.4)' 
                              : 'rgba(255, 255, 255, 0.08)',
                            elevation: isSelected ? 8 : 3,
                            shadowColor: isSelected ? '#E50914' : '#000',
                            shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
                            shadowOpacity: isSelected ? 0.3 : 0.1,
                            shadowRadius: isSelected ? 12 : 6,
                            transform: [{ scale: isSelected ? 1.02 : 1 }],
                            width: '100%',
                          }}
                          onPress={() => handleStreamSelect(stream)}
                          disabled={isChangingSource || isSelected}
                          activeOpacity={0.85}
                        >
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            width: '100%',
                          }}>
                            {/* Stream Info */}
                            <View style={{ flex: 1, marginRight: 16 }}>
                              {/* Title Row */}
                              <View style={{
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                marginBottom: 12,
                                flexWrap: 'wrap',
                                gap: 8,
                              }}>
                                <Text style={{
                                  color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.95)',
                                  fontSize: 16,
                                  fontWeight: '700',
                                  letterSpacing: -0.2,
                                  flex: 1,
                                  lineHeight: 22,
                                }}>
                                  {isHDRezka ? `HDRezka ${stream.title}` : (stream.name || stream.title || 'Unnamed Stream')}
                                </Text>
                                
                                {isSelected && (
                                  <Animated.View 
                                    entering={BounceIn.duration(300)}
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      backgroundColor: 'rgba(229, 9, 20, 0.25)',
                                      paddingHorizontal: 10,
                                      paddingVertical: 5,
                                      borderRadius: 14,
                                      borderWidth: 1,
                                      borderColor: 'rgba(229, 9, 20, 0.5)',
                                      elevation: 4,
                                      shadowColor: '#E50914',
                                      shadowOffset: { width: 0, height: 2 },
                                      shadowOpacity: 0.3,
                                      shadowRadius: 4,
                                    }}
                                  >
                                    <MaterialIcons name="play-circle-filled" size={12} color="#E50914" />
                                    <Text style={{
                                      color: '#E50914',
                                      fontSize: 10,
                                      fontWeight: '800',
                                      marginLeft: 3,
                                      letterSpacing: 0.3,
                                    }}>
                                      PLAYING
                                    </Text>
                                  </Animated.View>
                                )}
                                
                                {isChangingSource && isSelected && (
                                  <Animated.View 
                                    entering={FadeIn.duration(200)}
                                    style={{
                                      backgroundColor: 'rgba(229, 9, 20, 0.2)',
                                      paddingHorizontal: 8,
                                      paddingVertical: 4,
                                      borderRadius: 12,
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <ActivityIndicator size="small" color="#E50914" />
                                    <Text style={{
                                      color: '#E50914',
                                      fontSize: 10,
                                      fontWeight: '600',
                                      marginLeft: 4,
                                    }}>
                                      Switching...
                                    </Text>
                                  </Animated.View>
                                )}
                              </View>
                              
                              {/* Subtitle */}
                              {!isHDRezka && stream.title && stream.title !== stream.name && (
                                <Text style={{
                                  color: 'rgba(255, 255, 255, 0.65)',
                                  fontSize: 13,
                                  marginBottom: 12,
                                  lineHeight: 18,
                                  fontWeight: '400',
                                }}>
                                  {stream.title}
                                </Text>
                              )}
                              
                              {/* Enhanced Meta Info */}
                              <View style={{
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                gap: 6,
                                alignItems: 'center',
                              }}>
                                <QualityIndicator quality={quality} />
                                
                                {isDolby && (
                                  <StreamMetaBadge 
                                    text="DOLBY" 
                                    color="#8B5CF6" 
                                    bgColor="rgba(139, 92, 246, 0.15)"
                                    icon="hd"
                                    delay={100}
                                  />
                                )}
                                
                                {isHDR && (
                                  <StreamMetaBadge 
                                    text="HDR" 
                                    color="#F59E0B" 
                                    bgColor="rgba(245, 158, 11, 0.15)"
                                    icon="brightness-high"
                                    delay={120}
                                  />
                                )}
                                
                                {size && (
                                  <StreamMetaBadge 
                                    text={size} 
                                    color="#6B7280" 
                                    bgColor="rgba(107, 114, 128, 0.15)"
                                    icon="storage"
                                    delay={140}
                                  />
                                )}
                                
                                {isDebrid && (
                                  <StreamMetaBadge 
                                    text="DEBRID" 
                                    color="#00d4aa" 
                                    bgColor="rgba(0, 212, 170, 0.15)"
                                    icon="flash-on"
                                    delay={160}
                                  />
                                )}
                                
                                {isHDRezka && (
                                  <StreamMetaBadge 
                                    text="HDREZKA" 
                                    color="#00d4aa" 
                                    bgColor="rgba(0, 212, 170, 0.15)"
                                    icon="verified"
                                    delay={180}
                                  />
                                )}
                              </View>
                            </View>
                            
                            {/* Enhanced Action Icon */}
                            <View style={{
                              width: 48,
                              height: 48,
                              borderRadius: 24,
                              backgroundColor: isSelected 
                                ? 'rgba(229, 9, 20, 0.15)' 
                                : 'rgba(255, 255, 255, 0.05)',
                              justifyContent: 'center',
                              alignItems: 'center',
                              borderWidth: 2,
                              borderColor: isSelected 
                                ? 'rgba(229, 9, 20, 0.3)' 
                                : 'rgba(255, 255, 255, 0.1)',
                              elevation: 4,
                              shadowColor: isSelected ? '#E50914' : '#fff',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: isSelected ? 0.2 : 0.05,
                              shadowRadius: 4,
                            }}>
                              {isSelected ? (
                                <Animated.View entering={ZoomIn.duration(200)}>
                                  <MaterialIcons name="check-circle" size={24} color="#E50914" />
                                </Animated.View>
                              ) : (
                                <MaterialIcons name="play-arrow" size={24} color="rgba(255,255,255,0.6)" />
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              </Animated.View>
            ))}
          </ScrollView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

export default SourcesModal;