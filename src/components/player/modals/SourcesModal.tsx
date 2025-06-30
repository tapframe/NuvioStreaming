import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { 
  FadeIn, 
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
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
    <View 
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
    </View>
  );
};

const StreamMetaBadge = ({ 
  text, 
  color, 
  bgColor, 
  icon
}: { 
  text: string; 
  color: string; 
  bgColor: string; 
  icon?: string;
}) => (
  <View 
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
  </View>
);

const SourcesModal: React.FC<SourcesModalProps> = ({
  showSourcesModal,
  setShowSourcesModal,
  availableStreams,
  currentStreamUrl,
  onSelectStream,
  isChangingSource,
}) => {
  const modalOpacity = useSharedValue(0);
  
  React.useEffect(() => {
    if (showSourcesModal) {
      modalOpacity.value = withTiming(1, { duration: 200 });
    } else {
      modalOpacity.value = withTiming(0, { duration: 150 });
    }

    return () => {
      modalOpacity.value = 0;
    };
  }, [showSourcesModal]);

  const modalStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
  }));

  const handleClose = () => {
    modalOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setShowSourcesModal)(false);
    });
  };

  if (!showSourcesModal) return null;

  const sortedProviders = Object.entries(availableStreams);

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

  return (
    <Animated.View 
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
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
            <View style={{ flex: 1 }}>
              <Text style={{
                color: '#fff',
                fontSize: 24,
                fontWeight: '800',
                letterSpacing: -0.8,
                textShadowColor: 'rgba(0, 0, 0, 0.3)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }}>
                Video Sources
              </Text>
              <Text style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: 14,
                marginTop: 4,
                fontWeight: '500',
                letterSpacing: 0.2,
              }}>
                Choose from {Object.values(availableStreams).reduce((acc, curr) => acc + curr.streams.length, 0)} available sources
              </Text>
            </View>
            
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
          </LinearGradient>

          <ScrollView 
            style={{ 
              maxHeight: MODAL_MAX_HEIGHT - 100,
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
            {sortedProviders.map(([providerId, { streams, addonName }]) => (
              <View key={providerId} style={{ marginBottom: 24 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 12,
                }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: 14,
                    fontWeight: '600',
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                  }}>
                    {addonName}
                  </Text>
                  <View style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                    marginLeft: 8,
                  }}>
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.5)',
                      fontSize: 12,
                      fontWeight: '600',
                    }}>
                      {streams.length}
                    </Text>
                  </View>
                </View>

                {streams.map((stream, index) => {
                  const isSelected = isStreamSelected(stream);
                  const quality = getQualityFromTitle(stream.title);

                  return (
                    <View
                      key={`${stream.url}-${index}`}
                      style={{ 
                        marginBottom: 12,
                        width: '100%',
                      }}
                    >
                      <TouchableOpacity
                        style={{
                          backgroundColor: isSelected 
                            ? 'rgba(249, 115, 22, 0.08)' 
                            : 'rgba(255, 255, 255, 0.03)',
                          borderRadius: 20,
                          padding: 20,
                          borderWidth: 2,
                          borderColor: isSelected 
                            ? 'rgba(249, 115, 22, 0.4)' 
                            : 'rgba(255, 255, 255, 0.08)',
                          elevation: isSelected ? 8 : 3,
                          shadowColor: isSelected ? '#F97316' : '#000',
                          shadowOffset: { width: 0, height: isSelected ? 4 : 2 },
                          shadowOpacity: isSelected ? 0.3 : 0.1,
                          shadowRadius: isSelected ? 12 : 6,
                          width: '100%',
                        }}
                        onPress={() => handleStreamSelect(stream)}
                        activeOpacity={0.85}
                        disabled={isChangingSource}
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
                                color: isSelected ? '#fff' : 'rgba(255, 255, 255, 0.95)',
                                fontSize: 16,
                                fontWeight: '700',
                                letterSpacing: -0.2,
                                flex: 1,
                              }}>
                                {stream.title || 'Untitled Stream'}
                              </Text>
                              
                              {isSelected && (
                                <View 
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
                                  <MaterialIcons name="play-arrow" size={12} color="#F97316" />
                                  <Text style={{
                                    color: '#F97316',
                                    fontSize: 10,
                                    fontWeight: '800',
                                    marginLeft: 3,
                                    letterSpacing: 0.3,
                                  }}>
                                    PLAYING
                                  </Text>
                                </View>
                              )}
                            </View>
                            
                            <View style={{
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              gap: 6,
                              alignItems: 'center',
                            }}>
                              {quality && <QualityIndicator quality={quality} />}
                              <StreamMetaBadge 
                                text={providerId.toUpperCase()} 
                                color="#6B7280" 
                                bgColor="rgba(107, 114, 128, 0.15)"
                                icon="source"
                              />
                            </View>
                          </View>
                          
                          <View style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            backgroundColor: isSelected 
                              ? 'rgba(249, 115, 22, 0.15)' 
                              : 'rgba(255, 255, 255, 0.05)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: isSelected 
                              ? 'rgba(249, 115, 22, 0.3)' 
                              : 'rgba(255, 255, 255, 0.1)',
                          }}>
                            {isChangingSource ? (
                              <ActivityIndicator size="small" color="#F97316" />
                            ) : (
                              <MaterialIcons 
                                name={isSelected ? "check-circle" : "play-circle-outline"} 
                                size={24} 
                                color={isSelected ? "#F97316" : "rgba(255,255,255,0.6)"} 
                              />
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

export default SourcesModal;