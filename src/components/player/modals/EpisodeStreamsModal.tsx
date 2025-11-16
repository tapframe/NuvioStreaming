import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { Episode } from '../../../types/metadata';
import { Stream } from '../../../types/streams';
import { stremioService } from '../../../services/stremioService';
import { logger } from '../../../utils/logger';

interface EpisodeStreamsModalProps {
  visible: boolean;
  episode: Episode | null;
  onClose: () => void;
  onSelectStream: (stream: Stream) => void;
  metadata?: { id?: string; name?: string };
}

const { width } = Dimensions.get('window');
const MENU_WIDTH = Math.min(width * 0.85, 400);

const QualityBadge = ({ quality }: { quality: string | null }) => {
  if (!quality) return null;
  
  const qualityNum = parseInt(quality);
  let color = '#8B5CF6';
  let label = `${quality}p`;
  
  if (qualityNum >= 2160) {
    color = '#F59E0B';
    label = '4K';
  } else if (qualityNum >= 1080) {
    color = '#EF4444';
    label = 'FHD';
  } else if (qualityNum >= 720) {
    color = '#10B981';
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

export const EpisodeStreamsModal: React.FC<EpisodeStreamsModalProps> = ({
  visible,
  episode,
  onClose,
  onSelectStream,
  metadata,
}) => {
  const [availableStreams, setAvailableStreams] = useState<{ [providerId: string]: { streams: Stream[]; addonName: string } }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasErrors, setHasErrors] = useState<string[]>([]);

  useEffect(() => {
    if (visible && episode && metadata?.id) {
      fetchStreams();
    } else {
      setAvailableStreams({});
      setIsLoading(false);
      setHasErrors([]);
    }
  }, [visible, episode, metadata?.id]);

  const fetchStreams = async () => {
    if (!episode || !metadata?.id) return;
    
    setIsLoading(true);
    setHasErrors([]);
    setAvailableStreams({});
    
    try {
      const episodeId = episode.stremioId || `${metadata.id}:${episode.season_number}:${episode.episode_number}`;
      let completedProviders = 0;
      const expectedProviders = new Set<string>();
      const respondedProviders = new Set<string>();
      
      const installedAddons = stremioService.getInstalledAddons();
      const streamAddons = installedAddons.filter((addon: any) => 
        addon.resources && addon.resources.includes('stream')
      );
      
      streamAddons.forEach((addon: any) => expectedProviders.add(addon.id));
      
      logger.log(`[EpisodeStreamsModal] Fetching streams for ${episodeId}, expecting ${expectedProviders.size} providers`);
      
      await stremioService.getStreams('series', episodeId, (streams: any, addonId: any, addonName: any, error: any) => {
        completedProviders++;
        respondedProviders.add(addonId);
        
        if (error) {
          logger.warn(`[EpisodeStreamsModal] Error from ${addonName || addonId}:`, error);
          setHasErrors(prev => [...prev, `${addonName || addonId}: ${error.message || 'Unknown error'}`]);
        } else if (streams && streams.length > 0) {
          // Update state incrementally for each provider
          setAvailableStreams(prev => ({
            ...prev,
            [addonId]: {
              streams: streams,
              addonName: addonName || addonId
            }
          }));
          logger.log(`[EpisodeStreamsModal] Added ${streams.length} streams from ${addonName || addonId}`);
        } else {
          logger.log(`[EpisodeStreamsModal] No streams from ${addonName || addonId}`);
        }
        
        if (completedProviders >= expectedProviders.size) {
          logger.log(`[EpisodeStreamsModal] All providers completed. Total providers responded: ${respondedProviders.size}`);
          setIsLoading(false);
        }
      });
      
      // Fallback timeout
      setTimeout(() => {
        if (respondedProviders.size === 0) {
          logger.warn(`[EpisodeStreamsModal] Timeout: No providers responded`);
          setHasErrors(prev => [...prev, 'Timeout: No providers responded']);
          setIsLoading(false);
        }
      }, 8000);
      
    } catch (error) {
      logger.error('[EpisodeStreamsModal] Error fetching streams:', error);
      setHasErrors(prev => [...prev, `Failed to fetch streams: ${error}`]);
      setIsLoading(false);
    }
  };

  const getQualityFromTitle = (title?: string): string | null => {
    if (!title) return null;
    const match = title.match(/(\d+)p/);
    return match ? match[1] : null;
  };

  const handleClose = () => {
    onClose();
  };

  if (!visible) return null;

  const sortedProviders = Object.entries(availableStreams);

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
          <View style={{ flex: 1 }}>
            <Text style={{
              color: '#FFFFFF',
              fontSize: 18,
              fontWeight: '700',
            }}>
              {episode?.name || 'Select Stream'}
            </Text>
            {episode && (
              <Text style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: 12,
                marginTop: 4,
              }}>
                S{episode.season_number}E{episode.episode_number}
              </Text>
            )}
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
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {isLoading && (
            <View style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 16,
              padding: 20,
              alignItems: 'center',
            }}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: 14,
                marginTop: 12,
                textAlign: 'center',
              }}>
                Finding available streams...
              </Text>
            </View>
          )}

          {!isLoading && sortedProviders.length > 0 && (
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
                    const quality = getQualityFromTitle(stream.title) || stream.quality;
                    
                    return (
                      <TouchableOpacity
                        key={`${providerId}-${index}`}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 16,
                          padding: 16,
                          borderWidth: 1,
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                        }}
                        onPress={() => onSelectStream(stream)}
                        activeOpacity={0.7}
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
                            <MaterialIcons name="play-arrow" size={20} color="rgba(255,255,255,0.4)" />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          {!isLoading && sortedProviders.length === 0 && hasErrors.length === 0 && (
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

          {!isLoading && hasErrors.length > 0 && (
            <View style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <MaterialIcons name="error" size={20} color="#EF4444" />
                <Text style={{
                  color: '#EF4444',
                  fontSize: 14,
                  fontWeight: '600',
                  marginLeft: 8,
                }}>
                  Errors occurred
                </Text>
              </View>
              {hasErrors.map((error, index) => (
                <Text key={index} style={{
                  color: '#EF4444',
                  fontSize: 12,
                  marginTop: 4,
                }}>
                  {error}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
};

