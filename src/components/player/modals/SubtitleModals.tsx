import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { styles } from '../utils/playerStyles';
import { WyzieSubtitle, SubtitleCue } from '../utils/playerTypes';
import { getTrackDisplayName, formatLanguage } from '../utils/playerUtils';

interface SubtitleModalsProps {
  showSubtitleModal: boolean;
  setShowSubtitleModal: (show: boolean) => void;
  showSubtitleLanguageModal: boolean;
  setShowSubtitleLanguageModal: (show: boolean) => void;
  isLoadingSubtitleList: boolean;
  isLoadingSubtitles: boolean;
  customSubtitles: SubtitleCue[];
  availableSubtitles: WyzieSubtitle[];
  vlcTextTracks: Array<{id: number, name: string, language?: string}>;
  selectedTextTrack: number;
  useCustomSubtitles: boolean;
  subtitleSize: number;
  fetchAvailableSubtitles: () => void;
  loadWyzieSubtitle: (subtitle: WyzieSubtitle) => void;
  selectTextTrack: (trackId: number) => void;
  increaseSubtitleSize: () => void;
  decreaseSubtitleSize: () => void;
}

const { width, height } = Dimensions.get('window');
const MENU_WIDTH = Math.min(width * 0.85, 400);

export const SubtitleModals: React.FC<SubtitleModalsProps> = ({
  showSubtitleModal,
  setShowSubtitleModal,
  showSubtitleLanguageModal,
  setShowSubtitleLanguageModal,
  isLoadingSubtitleList,
  isLoadingSubtitles,
  customSubtitles,
  availableSubtitles,
  vlcTextTracks,
  selectedTextTrack,
  useCustomSubtitles,
  subtitleSize,
  fetchAvailableSubtitles,
  loadWyzieSubtitle,
  selectTextTrack,
  increaseSubtitleSize,
  decreaseSubtitleSize,
}) => {
  // Track which specific online subtitle is currently loaded
  const [selectedOnlineSubtitleId, setSelectedOnlineSubtitleId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (showSubtitleModal && !isLoadingSubtitleList && availableSubtitles.length === 0) {
      fetchAvailableSubtitles();
    }
  }, [showSubtitleModal]);

  // Reset selected online subtitle when switching to built-in tracks
  React.useEffect(() => {
    if (!useCustomSubtitles) {
      setSelectedOnlineSubtitleId(null);
    }
  }, [useCustomSubtitles]);

  const handleClose = () => {
    setShowSubtitleModal(false);
  };

  const handleLoadWyzieSubtitle = (subtitle: WyzieSubtitle) => {
    setSelectedOnlineSubtitleId(subtitle.id);
    loadWyzieSubtitle(subtitle);
  };

  // Main subtitle menu
  const renderSubtitleMenu = () => {
    if (!showSubtitleModal) return null;
    
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
              Subtitles
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
            {/* Font Size Section */}
            <View style={{ marginBottom: 30 }}>
              <Text style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 14,
                fontWeight: '600',
                marginBottom: 15,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Font Size
              </Text>
              
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 16,
                padding: 16,
              }}>
                <TouchableOpacity
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  onPress={decreaseSubtitleSize}
                >
                  <MaterialIcons name="remove" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 18,
                  fontWeight: '600',
                }}>
                  {subtitleSize}
                </Text>
                
                <TouchableOpacity
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  onPress={increaseSubtitleSize}
                >
                  <MaterialIcons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Built-in Subtitles */}
            {vlcTextTracks.length > 0 && (
              <View style={{ marginBottom: 30 }}>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  fontWeight: '600',
                  marginBottom: 15,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  Built-in Subtitles
                </Text>
                
                <View style={{ gap: 8 }}>
                  {vlcTextTracks.map((track) => {
                    const isSelected = selectedTextTrack === track.id && !useCustomSubtitles;
                    return (
                      <TouchableOpacity
                        key={track.id}
                        style={{
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 16,
                          padding: 16,
                          borderWidth: 1,
                          borderColor: isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                        }}
                        onPress={() => {
                          selectTextTrack(track.id);
                          setSelectedOnlineSubtitleId(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{
                            color: '#FFFFFF',
                            fontSize: 15,
                            fontWeight: '500',
                            flex: 1,
                          }}>
                            {getTrackDisplayName(track)}
                          </Text>
                          {isSelected && (
                            <MaterialIcons name="check" size={20} color="#3B82F6" />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Online Subtitles */}
            <View style={{ marginBottom: 30 }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 15,
              }}>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  Online Subtitles
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                  onPress={() => fetchAvailableSubtitles()}
                  disabled={isLoadingSubtitleList}
                >
                  {isLoadingSubtitleList ? (
                    <ActivityIndicator size="small" color="#22C55E" />
                  ) : (
                    <MaterialIcons name="refresh" size={16} color="#22C55E" />
                  )}
                  <Text style={{
                    color: '#22C55E',
                    fontSize: 12,
                    fontWeight: '600',
                    marginLeft: 6,
                  }}>
                    {isLoadingSubtitleList ? 'Searching' : 'Refresh'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {availableSubtitles.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {availableSubtitles.map((sub) => {
                    const isSelected = useCustomSubtitles && selectedOnlineSubtitleId === sub.id;
                    return (
                      <TouchableOpacity
                        key={sub.id}
                        style={{
                          backgroundColor: isSelected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 16,
                          padding: 16,
                          borderWidth: 1,
                          borderColor: isSelected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                        }}
                        onPress={() => {
                          handleLoadWyzieSubtitle(sub);
                        }}
                        activeOpacity={0.7}
                        disabled={isLoadingSubtitles}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{
                              color: '#FFFFFF',
                              fontSize: 15,
                              fontWeight: '500',
                              marginBottom: 4,
                            }}>
                              {sub.display}
                            </Text>
                            <Text style={{
                              color: 'rgba(255, 255, 255, 0.6)',
                              fontSize: 13,
                            }}>
                              {formatLanguage(sub.language)}
                            </Text>
                          </View>
                          {isLoadingSubtitles ? (
                            <ActivityIndicator size="small" color="#22C55E" />
                          ) : isSelected ? (
                            <MaterialIcons name="check" size={20} color="#22C55E" />
                          ) : (
                            <MaterialIcons name="download" size={20} color="rgba(255,255,255,0.4)" />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : !isLoadingSubtitleList ? (
                <TouchableOpacity
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 16,
                    padding: 20,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderStyle: 'dashed',
                  }}
                  onPress={() => fetchAvailableSubtitles()}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="cloud-download" size={24} color="rgba(255,255,255,0.4)" />
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: 14,
                    marginTop: 8,
                    textAlign: 'center',
                  }}>
                    Tap to search online
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 16,
                  padding: 20,
                  alignItems: 'center',
                }}>
                  <ActivityIndicator size="large" color="#22C55E" />
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: 14,
                    marginTop: 12,
                  }}>
                    Searching...
                  </Text>
                </View>
              )}
            </View>

            {/* Turn Off Subtitles */}
            <View>
              <Text style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 14,
                fontWeight: '600',
                marginBottom: 15,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Options
              </Text>
              
              <TouchableOpacity
                style={{
                  backgroundColor: selectedTextTrack === -1 && !useCustomSubtitles 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: selectedTextTrack === -1 && !useCustomSubtitles 
                    ? 'rgba(239, 68, 68, 0.3)' 
                    : 'rgba(255, 255, 255, 0.1)',
                }}
                onPress={() => {
                  selectTextTrack(-1);
                  setSelectedOnlineSubtitleId(null);
                }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <MaterialIcons 
                      name="visibility-off" 
                      size={20} 
                      color={selectedTextTrack === -1 && !useCustomSubtitles ? "#EF4444" : "rgba(255,255,255,0.6)"} 
                      style={{ marginRight: 12 }} 
                    />
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 15,
                      fontWeight: '500',
                    }}>
                      Turn Off Subtitles
                    </Text>
                  </View>
                  {selectedTextTrack === -1 && !useCustomSubtitles && (
                    <MaterialIcons name="check" size={20} color="#EF4444" />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </>
    );
  };

  return (
    <>
      {renderSubtitleMenu()}
    </>
  );
};

export default SubtitleModals; 