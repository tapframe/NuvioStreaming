import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { Stream } from '../../../types/streams';

interface SourcesModalProps {
  showSourcesModal: boolean;
  setShowSourcesModal: (show: boolean) => void;
  availableStreams: { [providerId: string]: { streams: Stream[]; addonName: string } };
  currentStreamUrl: string;
  onSelectStream: (stream: Stream) => void;
  isChangingSource: boolean;
}

const { width } = Dimensions.get('window');
const MENU_WIDTH = Math.min(width * 0.85, 400);

const QualityBadge = ({ quality }: { quality: string | null }) => {
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
        paddingVertical: 4,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Text style={{
        color: color,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
      }}>
        {label}
      </Text>
    </View>
  );
};

export const SourcesModal: React.FC<SourcesModalProps> = ({
  showSourcesModal,
  setShowSourcesModal,
  availableStreams,
  currentStreamUrl,
  onSelectStream,
  isChangingSource,
}) => {
  const handleClose = () => {
    setShowSourcesModal(false);
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
            Change Source
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
          {isChangingSource && (
            <View style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
              <ActivityIndicator size="small" color="#22C55E" />
              <Text style={{
                color: '#22C55E',
                fontSize: 14,
                fontWeight: '600',
                marginLeft: 12,
              }}>
                Switching source...
              </Text>
            </View>
          )}

          {sortedProviders.length > 0 ? (
            sortedProviders.map(([providerId, providerData]) => (
              <View key={providerId} style={{ marginBottom: 30 }}>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  fontWeight: '600',
                  marginBottom: 15,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  {providerData.addonName} ({providerData.streams.length})
                </Text>
                
                <View style={{ gap: 8 }}>
                  {providerData.streams.map((stream, index) => {
                    const isSelected = isStreamSelected(stream);
                    const quality = getQualityFromTitle(stream.title) || stream.quality;
                    
                    return (
                      <TouchableOpacity
                        key={`${providerId}-${index}`}
                        style={{
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 16,
                          padding: 16,
                          borderWidth: 1,
                          borderColor: isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                          opacity: isChangingSource && !isSelected ? 0.6 : 1,
                        }}
                        onPress={() => handleStreamSelect(stream)}
                        activeOpacity={0.7}
                        disabled={isChangingSource}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <View style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginBottom: 8,
                              gap: 8,
                            }}>
                              <Text style={{
                                color: '#FFFFFF',
                                fontSize: 15,
                                fontWeight: '500',
                                flex: 1,
                              }}>
                                {stream.title || stream.name || `Stream ${index + 1}`}
                              </Text>
                              {quality && <QualityBadge quality={quality} />}
                            </View>
                            
                            {(stream.size || stream.lang) && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {stream.size && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <MaterialIcons name="storage" size={14} color="rgba(107, 114, 128, 0.8)" />
                                    <Text style={{
                                      color: 'rgba(107, 114, 128, 0.8)',
                                      fontSize: 12,
                                      fontWeight: '600',
                                      marginLeft: 4,
                                    }}>
                                      {(stream.size / (1024 * 1024 * 1024)).toFixed(1)} GB
                                    </Text>
                                  </View>
                                )}
                                {stream.lang && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <MaterialIcons name="language" size={14} color="rgba(59, 130, 246, 0.8)" />
                                    <Text style={{
                                      color: 'rgba(59, 130, 246, 0.8)',
                                      fontSize: 12,
                                      fontWeight: '600',
                                      marginLeft: 4,
                                    }}>
                                      {stream.lang.toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                          
                          <View style={{
                            marginLeft: 12,
                            alignItems: 'center',
                          }}>
                            {isSelected ? (
                              <MaterialIcons name="check" size={20} color="#3B82F6" />
                            ) : (
                              <MaterialIcons name="play-arrow" size={20} color="rgba(255,255,255,0.4)" />
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          ) : (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 16,
              padding: 20,
              alignItems: 'center',
            }}>
              <MaterialIcons name="error-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: 16,
                marginTop: 16,
                textAlign: 'center',
              }}>
                No sources available
              </Text>
              <Text style={{
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: 14,
                marginTop: 8,
                textAlign: 'center',
              }}>
                Try searching for different content
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
};