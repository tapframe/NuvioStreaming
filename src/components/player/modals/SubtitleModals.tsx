import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image, Dimensions } from 'react-native';
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

const MODAL_WIDTH = Math.min(width - 32, 520);
const MODAL_MAX_HEIGHT = height * 0.85;

const SubtitleBadge = ({ 
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
  </View>
);

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
  const modalOpacity = useSharedValue(0);
  const languageModalOpacity = useSharedValue(0);
  
  React.useEffect(() => {
    if (showSubtitleModal) {
      modalOpacity.value = withTiming(1, { duration: 200 });
    } else {
      modalOpacity.value = withTiming(0, { duration: 150 });
    }

    return () => {
      modalOpacity.value = 0;
    };
  }, [showSubtitleModal]);

  React.useEffect(() => {
    if (showSubtitleLanguageModal) {
      languageModalOpacity.value = withTiming(1, { duration: 200 });
    } else {
      languageModalOpacity.value = withTiming(0, { duration: 150 });
    }

    return () => {
      languageModalOpacity.value = 0;
    };
  }, [showSubtitleLanguageModal]);

  const modalStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
  }));

  const languageModalStyle = useAnimatedStyle(() => ({
    opacity: languageModalOpacity.value,
  }));

  const handleClose = () => {
    modalOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setShowSubtitleModal)(false);
    });
  };

  const handleLanguageClose = () => {
    languageModalOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setShowSubtitleLanguageModal)(false);
    });
  };

  // Render subtitle settings modal
  const renderSubtitleModal = () => {
    if (!showSubtitleModal) return null;
    
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
                  Subtitle Settings
                </Text>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: 14,
                  marginTop: 4,
                  fontWeight: '500',
                  letterSpacing: 0.2,
                }}>
                  Customize your subtitle experience
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
              <View style={styles.modernTrackListContainer}>
                <View style={{ marginBottom: 24 }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: 14,
                    fontWeight: '600',
                    letterSpacing: 0.3,
                    marginBottom: 16,
                    textTransform: 'uppercase',
                  }}>
                    Size Adjustment
                  </Text>
                  
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: 20,
                    padding: 20,
                    borderWidth: 2,
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                  }}>
                    <TouchableOpacity
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 2,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      }}
                      onPress={decreaseSubtitleSize}
                    >
                      <MaterialIcons name="remove" size={24} color="rgba(255,255,255,0.8)" />
                    </TouchableOpacity>
                    
                    <View style={{
                      alignItems: 'center',
                      paddingHorizontal: 20,
                    }}>
                      <Text style={{
                        color: '#fff',
                        fontSize: 24,
                        fontWeight: '700',
                      }}>
                        {subtitleSize}
                      </Text>
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: 12,
                        marginTop: 4,
                      }}>
                        Font Size
                      </Text>
                    </View>
                    
                    <TouchableOpacity
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 2,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      }}
                      onPress={increaseSubtitleSize}
                    >
                      <MaterialIcons name="add" size={24} color="rgba(255,255,255,0.8)" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ marginBottom: 24 }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: 14,
                    fontWeight: '600',
                    letterSpacing: 0.3,
                    marginBottom: 16,
                    textTransform: 'uppercase',
                  }}>
                    Subtitle Source
                  </Text>
                  
                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(249, 115, 22, 0.08)',
                      borderRadius: 20,
                      padding: 20,
                      borderWidth: 2,
                      borderColor: 'rgba(249, 115, 22, 0.4)',
                      marginBottom: 12,
                    }}
                    onPress={() => setShowSubtitleLanguageModal(true)}
                  >
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{
                          color: '#fff',
                          fontSize: 16,
                          fontWeight: '700',
                          marginBottom: 8,
                        }}>
                          Change Language
                        </Text>
                        <View style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 6,
                        }}>
                          <SubtitleBadge 
                            text="LANGUAGE" 
                            color="#F97316" 
                            bgColor="rgba(249, 115, 22, 0.15)"
                            icon="language"
                          />
                          {selectedTextTrack !== -1 && (
                            <SubtitleBadge 
                              text={vlcTextTracks.find(t => t.id === selectedTextTrack)?.language?.toUpperCase() || 'UNKNOWN'} 
                              color="#6B7280" 
                              bgColor="rgba(107, 114, 128, 0.15)"
                            />
                          )}
                        </View>
                      </View>
                      <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.6)" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </BlurView>
        </Animated.View>
      </Animated.View>
    );
  };

  // Render subtitle language selection modal
  const renderSubtitleLanguageModal = () => {
    if (!showSubtitleLanguageModal) return null;

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
          onPress={handleLanguageClose}
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
            languageModalStyle,
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
                  Subtitle Language
                </Text>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: 14,
                  marginTop: 4,
                  fontWeight: '500',
                  letterSpacing: 0.2,
                }}>
                  Choose from {vlcTextTracks.length} available tracks
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
                onPress={handleLanguageClose}
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
              <View style={styles.modernTrackListContainer}>
                {vlcTextTracks.map((track) => (
                  <View
                    key={track.id}
                    style={{ 
                      marginBottom: 12,
                      width: '100%',
                    }}
                  >
                    <TouchableOpacity
                      style={{
                        backgroundColor: selectedTextTrack === track.id 
                          ? 'rgba(249, 115, 22, 0.08)' 
                          : 'rgba(255, 255, 255, 0.03)',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 2,
                        borderColor: selectedTextTrack === track.id 
                          ? 'rgba(249, 115, 22, 0.4)' 
                          : 'rgba(255, 255, 255, 0.08)',
                        elevation: selectedTextTrack === track.id ? 8 : 3,
                        shadowColor: selectedTextTrack === track.id ? '#F97316' : '#000',
                        shadowOffset: { width: 0, height: selectedTextTrack === track.id ? 4 : 2 },
                        shadowOpacity: selectedTextTrack === track.id ? 0.3 : 0.1,
                        shadowRadius: selectedTextTrack === track.id ? 12 : 6,
                        width: '100%',
                      }}
                      onPress={() => {
                        selectTextTrack(track.id);
                        handleLanguageClose();
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
                              color: selectedTextTrack === track.id ? '#fff' : 'rgba(255, 255, 255, 0.95)',
                              fontSize: 16,
                              fontWeight: '700',
                              letterSpacing: -0.2,
                              flex: 1,
                            }}>
                              {getTrackDisplayName(track)}
                            </Text>
                            
                            {selectedTextTrack === track.id && (
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
                                <MaterialIcons name="subtitles" size={12} color="#F97316" />
                                <Text style={{
                                  color: '#F97316',
                                  fontSize: 10,
                                  fontWeight: '800',
                                  marginLeft: 3,
                                  letterSpacing: 0.3,
                                }}>
                                  ACTIVE
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
                            <SubtitleBadge 
                              text="SUBTITLE" 
                              color="#F97316" 
                              bgColor="rgba(249, 115, 22, 0.15)"
                              icon="subtitles"
                            />
                            {track.language && (
                              <SubtitleBadge 
                                text={track.language.toUpperCase()} 
                                color="#6B7280" 
                                bgColor="rgba(107, 114, 128, 0.15)"
                                icon="language"
                              />
                            )}
                          </View>
                        </View>
                        
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: selectedTextTrack === track.id 
                            ? 'rgba(249, 115, 22, 0.15)' 
                            : 'rgba(255, 255, 255, 0.05)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderWidth: 2,
                          borderColor: selectedTextTrack === track.id 
                            ? 'rgba(249, 115, 22, 0.3)' 
                            : 'rgba(255, 255, 255, 0.1)',
                        }}>
                          <MaterialIcons 
                            name={selectedTextTrack === track.id ? "check-circle" : "subtitles"} 
                            size={24} 
                            color={selectedTextTrack === track.id ? "#F97316" : "rgba(255,255,255,0.6)"} 
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Online subtitles section */}
                {isLoadingSubtitleList && (
                  <View style={{ alignItems: 'center', marginTop: 24 }}>
                    <ActivityIndicator size="large" color="#22C55E" />
                  </View>
                )}

                {availableSubtitles.length > 0 && (
                  <>
                    <View style={{ marginVertical: 24 }}>
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 14,
                        fontWeight: '600',
                        letterSpacing: 0.3,
                        textTransform: 'uppercase',
                      }}>
                        Online Subtitles
                      </Text>
                    </View>

                    {availableSubtitles.map((sub) => (
                      <View key={sub.id} style={{ marginBottom: 12, width: '100%' }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.08)',
                            borderRadius: 20,
                            padding: 20,
                            borderWidth: 2,
                            borderColor: 'rgba(34, 197, 94, 0.4)',
                            width: '100%',
                          }}
                          onPress={() => {
                            loadWyzieSubtitle(sub);
                            handleLanguageClose();
                          }}
                          activeOpacity={0.85}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <View style={{ flex: 1, marginRight: 16 }}>
                              <Text style={{
                                color: '#fff',
                                fontSize: 16,
                                fontWeight: '700',
                                letterSpacing: -0.2,
                                marginBottom: 4,
                              }}>
                                {sub.display}
                              </Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                <SubtitleBadge 
                                  text={formatLanguage(sub.language)} 
                                  color="#22C55E" 
                                  bgColor="rgba(34, 197, 94, 0.15)"
                                />
                              </View>
                            </View>
                            <MaterialIcons name="cloud-download" size={24} color="#22C55E" />
                          </View>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}
              </View>
            </ScrollView>
          </BlurView>
        </Animated.View>
      </Animated.View>
    );
  };

  return (
    <>
      {renderSubtitleModal()}
      {renderSubtitleLanguageModal()}
    </>
  );
};

export default SubtitleModals; 