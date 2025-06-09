import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image, Dimensions } from 'react-native';
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

const SubtitleBadge = ({ 
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
  const modalScale = useSharedValue(0.9);
  const modalOpacity = useSharedValue(0);
  const languageModalScale = useSharedValue(0.9);
  const languageModalOpacity = useSharedValue(0);
  
  React.useEffect(() => {
    if (showSubtitleModal) {
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
  }, [showSubtitleModal]);

  React.useEffect(() => {
    if (showSubtitleLanguageModal) {
      languageModalScale.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
        mass: 0.8,
      });
      languageModalOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [showSubtitleLanguageModal]);

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modalScale.value }],
    opacity: modalOpacity.value,
  }));

  const languageModalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: languageModalScale.value }],
    opacity: languageModalOpacity.value,
  }));

  const handleClose = () => {
    modalScale.value = withTiming(0.9, { duration: 150 });
    modalOpacity.value = withTiming(0, { duration: 150 });
    setTimeout(() => setShowSubtitleModal(false), 150);
  };

  const handleLanguageClose = () => {
    languageModalScale.value = withTiming(0.9, { duration: 150 });
    languageModalOpacity.value = withTiming(0, { duration: 150 });
    setTimeout(() => setShowSubtitleLanguageModal(false), 150);
  };

  // Render subtitle settings modal
  const renderSubtitleModal = () => {
    if (!showSubtitleModal) return null;
    
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
              width: Math.min(width - 32, 520),
              maxHeight: height * 0.85,
              overflow: 'hidden',
              elevation: 25,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.4,
              shadowRadius: 25,
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
            }}
          >
            {/* Header */}
            <LinearGradient
              colors={[
                'rgba(139, 92, 246, 0.95)',
                'rgba(124, 58, 237, 0.95)',
                'rgba(109, 40, 217, 0.9)'
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
                  Subtitle Settings
                </Text>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: 14,
                  marginTop: 4,
                  fontWeight: '500',
                  letterSpacing: 0.2,
                }}>
                  Configure subtitles and language options
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
                maxHeight: height * 0.6,
                backgroundColor: 'transparent',
              }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ 
                padding: 24,
                paddingBottom: 32,
              }}
              bounces={false}
            >
              <View style={styles.modernTrackListContainer}>
                
                {/* External Subtitles Section */}
                <Animated.View 
                  entering={FadeInDown.duration(400).delay(150)}
                  layout={Layout.springify()}
                  style={{
                    marginBottom: 32,
                  }}
                >
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 20,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
                  }}>
                    <LinearGradient
                      colors={['#4CAF50', '#388E3C']}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        marginRight: 16,
                        elevation: 3,
                        shadowColor: '#4CAF50',
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
                        External Subtitles
                      </Text>
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: 12,
                        marginTop: 1,
                        fontWeight: '500',
                      }}>
                        High quality with size control
                      </Text>
                    </View>
                  </View>

                  {/* Custom subtitles option */}
                  {customSubtitles.length > 0 && (
                    <Animated.View
                      entering={FadeInDown.duration(300).delay(200)}
                      layout={Layout.springify()}
                      style={{ marginBottom: 16 }}
                    >
                      <TouchableOpacity
                        style={{
                          backgroundColor: useCustomSubtitles 
                            ? 'rgba(76, 175, 80, 0.08)' 
                            : 'rgba(255, 255, 255, 0.03)',
                          borderRadius: 20,
                          padding: 20,
                          borderWidth: 2,
                          borderColor: useCustomSubtitles 
                            ? 'rgba(76, 175, 80, 0.4)' 
                            : 'rgba(255, 255, 255, 0.08)',
                          elevation: useCustomSubtitles ? 8 : 3,
                          shadowColor: useCustomSubtitles ? '#4CAF50' : '#000',
                          shadowOffset: { width: 0, height: useCustomSubtitles ? 4 : 2 },
                          shadowOpacity: useCustomSubtitles ? 0.3 : 0.1,
                          shadowRadius: useCustomSubtitles ? 12 : 6,
                        }}
                        onPress={() => {
                          selectTextTrack(-999);
                          setShowSubtitleModal(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                          <View style={{ flex: 1, marginRight: 16 }}>
                            <View style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginBottom: 8,
                              gap: 12,
                            }}>
                              <Text style={{
                                color: useCustomSubtitles ? '#fff' : 'rgba(255, 255, 255, 0.95)',
                                fontSize: 16,
                                fontWeight: '700',
                                letterSpacing: -0.2,
                                flex: 1,
                              }}>
                                Custom Subtitles
                              </Text>
                              
                              {useCustomSubtitles && (
                                <Animated.View 
                                  entering={BounceIn.duration(300)}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: 'rgba(76, 175, 80, 0.25)',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 14,
                                    borderWidth: 1,
                                    borderColor: 'rgba(76, 175, 80, 0.5)',
                                  }}
                                >
                                  <MaterialIcons name="subtitles" size={12} color="#4CAF50" />
                                  <Text style={{
                                    color: '#4CAF50',
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
                              <SubtitleBadge 
                                text={`${customSubtitles.length} CUES`} 
                                color="#4CAF50" 
                                bgColor="rgba(76, 175, 80, 0.15)"
                                icon="format-quote-close"
                              />
                              <SubtitleBadge 
                                text="SIZE CONTROL" 
                                color="#8B5CF6" 
                                bgColor="rgba(139, 92, 246, 0.15)"
                                icon="format-size"
                                delay={50}
                              />
                            </View>
                          </View>
                          
                          <View style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            backgroundColor: useCustomSubtitles 
                              ? 'rgba(76, 175, 80, 0.15)' 
                              : 'rgba(255, 255, 255, 0.05)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: useCustomSubtitles 
                              ? 'rgba(76, 175, 80, 0.3)' 
                              : 'rgba(255, 255, 255, 0.1)',
                          }}>
                            {useCustomSubtitles ? (
                              <Animated.View entering={ZoomIn.duration(200)}>
                                <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
                              </Animated.View>
                            ) : (
                              <MaterialIcons name="subtitles" size={24} color="rgba(255,255,255,0.6)" />
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  )}

                  {/* Search for external subtitles */}
                  <Animated.View
                    entering={FadeInDown.duration(300).delay(250)}
                    layout={Layout.springify()}
                  >
                    <TouchableOpacity
                      style={{
                        backgroundColor: 'rgba(33, 150, 243, 0.08)',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 2,
                        borderColor: 'rgba(33, 150, 243, 0.2)',
                        elevation: 3,
                        shadowColor: '#2196F3',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                      }}
                      onPress={() => {
                        handleClose();
                        fetchAvailableSubtitles();
                      }}
                      disabled={isLoadingSubtitleList}
                      activeOpacity={0.85}
                    >
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {isLoadingSubtitleList ? (
                          <ActivityIndicator size="small" color="#2196F3" style={{ marginRight: 12 }} />
                        ) : (
                          <MaterialIcons name="search" size={20} color="#2196F3" style={{ marginRight: 12 }} />
                        )}
                        <Text style={{
                          color: '#2196F3',
                          fontSize: 16,
                          fontWeight: '700',
                          letterSpacing: -0.2,
                        }}>
                          {isLoadingSubtitleList ? 'Searching...' : 'Search Online Subtitles'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                </Animated.View>

                {/* Subtitle Size Controls */}
                {useCustomSubtitles && (
                  <Animated.View 
                    entering={FadeInDown.duration(400).delay(200)}
                    layout={Layout.springify()}
                    style={{
                      marginBottom: 32,
                    }}
                  >
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 20,
                      paddingBottom: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(255, 255, 255, 0.08)',
                    }}>
                      <LinearGradient
                        colors={['#8B5CF6', '#7C3AED']}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          marginRight: 16,
                          elevation: 3,
                          shadowColor: '#8B5CF6',
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
                          Size Control
                        </Text>
                        <Text style={{
                          color: 'rgba(255, 255, 255, 0.6)',
                          fontSize: 12,
                          marginTop: 1,
                          fontWeight: '500',
                        }}>
                          Adjust font size for better readability
                        </Text>
                      </View>
                    </View>

                    <Animated.View
                      entering={FadeInDown.duration(300).delay(300)}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: 20,
                        padding: 24,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        elevation: 3,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                      }}
                    >
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <TouchableOpacity 
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            backgroundColor: 'rgba(139, 92, 246, 0.15)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: 'rgba(139, 92, 246, 0.3)',
                            elevation: 4,
                            shadowColor: '#8B5CF6',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.2,
                            shadowRadius: 4,
                          }}
                          onPress={decreaseSubtitleSize}
                          activeOpacity={0.7}
                        >
                          <MaterialIcons name="remove" size={24} color="#8B5CF6" />
                        </TouchableOpacity>
                        
                        <View style={{
                          alignItems: 'center',
                          backgroundColor: 'rgba(139, 92, 246, 0.08)',
                          paddingHorizontal: 24,
                          paddingVertical: 16,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: 'rgba(139, 92, 246, 0.2)',
                          minWidth: 120,
                        }}>
                          <Text style={{
                            color: '#8B5CF6',
                            fontSize: 24,
                            fontWeight: '800',
                            letterSpacing: -0.5,
                          }}>
                            {subtitleSize}px
                          </Text>
                          <Text style={{
                            color: 'rgba(139, 92, 246, 0.7)',
                            fontSize: 12,
                            fontWeight: '600',
                            marginTop: 2,
                            letterSpacing: 0.3,
                          }}>
                            Font Size
                          </Text>
                        </View>
                        
                        <TouchableOpacity 
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            backgroundColor: 'rgba(139, 92, 246, 0.15)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: 'rgba(139, 92, 246, 0.3)',
                            elevation: 4,
                            shadowColor: '#8B5CF6',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.2,
                            shadowRadius: 4,
                          }}
                          onPress={increaseSubtitleSize}
                          activeOpacity={0.7}
                        >
                          <MaterialIcons name="add" size={24} color="#8B5CF6" />
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  </Animated.View>
                )}

                {/* Available built-in subtitle tracks */}
                {vlcTextTracks.length > 0 ? vlcTextTracks.map((track, index) => (
                  <Animated.View
                    key={track.id}
                    entering={FadeInDown.duration(300).delay(400 + (index * 50))}
                    layout={Layout.springify()}
                    style={{ marginBottom: 16 }}
                  >
                    <TouchableOpacity
                      style={{
                        backgroundColor: (selectedTextTrack === track.id && !useCustomSubtitles) 
                          ? 'rgba(255, 152, 0, 0.08)' 
                          : 'rgba(255, 255, 255, 0.03)',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 2,
                        borderColor: (selectedTextTrack === track.id && !useCustomSubtitles) 
                          ? 'rgba(255, 152, 0, 0.4)' 
                          : 'rgba(255, 255, 255, 0.08)',
                        elevation: (selectedTextTrack === track.id && !useCustomSubtitles) ? 8 : 3,
                        shadowColor: (selectedTextTrack === track.id && !useCustomSubtitles) ? '#FF9800' : '#000',
                        shadowOffset: { width: 0, height: (selectedTextTrack === track.id && !useCustomSubtitles) ? 4 : 2 },
                        shadowOpacity: (selectedTextTrack === track.id && !useCustomSubtitles) ? 0.3 : 0.1,
                        shadowRadius: (selectedTextTrack === track.id && !useCustomSubtitles) ? 12 : 6,
                      }}
                      onPress={() => {
                        selectTextTrack(track.id);
                        handleClose();
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <View style={{ flex: 1, marginRight: 16 }}>
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 8,
                            gap: 12,
                          }}>
                            <Text style={{
                              color: (selectedTextTrack === track.id && !useCustomSubtitles) ? '#fff' : 'rgba(255, 255, 255, 0.95)',
                              fontSize: 16,
                              fontWeight: '700',
                              letterSpacing: -0.2,
                              flex: 1,
                            }}>
                              {getTrackDisplayName(track)}
                            </Text>
                            
                            {(selectedTextTrack === track.id && !useCustomSubtitles) && (
                              <Animated.View 
                                entering={BounceIn.duration(300)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  backgroundColor: 'rgba(255, 152, 0, 0.25)',
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 14,
                                  borderWidth: 1,
                                  borderColor: 'rgba(255, 152, 0, 0.5)',
                                }}
                              >
                                <MaterialIcons name="subtitles" size={12} color="#FF9800" />
                                <Text style={{
                                  color: '#FF9800',
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
                            <SubtitleBadge 
                              text="BUILT-IN" 
                              color="#FF9800" 
                              bgColor="rgba(255, 152, 0, 0.15)"
                              icon="settings"
                            />
                            <SubtitleBadge 
                              text="SYSTEM SIZE" 
                              color="#6B7280" 
                              bgColor="rgba(107, 114, 128, 0.15)"
                              icon="format-size"
                              delay={50}
                            />
                          </View>
                        </View>
                        
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: (selectedTextTrack === track.id && !useCustomSubtitles) 
                            ? 'rgba(255, 152, 0, 0.15)' 
                            : 'rgba(255, 255, 255, 0.05)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderWidth: 2,
                          borderColor: (selectedTextTrack === track.id && !useCustomSubtitles) 
                            ? 'rgba(255, 152, 0, 0.3)' 
                            : 'rgba(255, 255, 255, 0.1)',
                        }}>
                          {(selectedTextTrack === track.id && !useCustomSubtitles) ? (
                            <Animated.View entering={ZoomIn.duration(200)}>
                              <MaterialIcons name="check-circle" size={24} color="#FF9800" />
                            </Animated.View>
                          ) : (
                            <MaterialIcons name="text-fields" size={24} color="rgba(255,255,255,0.6)" />
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                )) : (
                  <Animated.View 
                    entering={FadeInDown.duration(300).delay(400)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: 16,
                      padding: 32,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <MaterialIcons name="info-outline" size={32} color="rgba(255, 255, 255, 0.4)" />
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontSize: 16,
                      fontWeight: '600',
                      marginTop: 12,
                      textAlign: 'center',
                      letterSpacing: -0.2,
                    }}>
                      No built-in subtitles available
                    </Text>
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.4)',
                      fontSize: 13,
                      marginTop: 4,
                      textAlign: 'center',
                    }}>
                      Try searching for external subtitles
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

  // Render subtitle language selection modal
  const renderSubtitleLanguageModal = () => {
    if (!showSubtitleLanguageModal) return null;
    
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
          onPress={handleLanguageClose}
          activeOpacity={1}
        />

        {/* Modal Content */}
        <Animated.View
          style={[
            {
              width: Math.min(width - 32, 520),
              maxHeight: height * 0.85,
              overflow: 'hidden',
              elevation: 25,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.4,
              shadowRadius: 25,
            },
            languageModalStyle,
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
            }}
          >
            {/* Header */}
            <LinearGradient
              colors={[
                'rgba(33, 150, 243, 0.95)',
                'rgba(30, 136, 229, 0.95)',
                'rgba(25, 118, 210, 0.9)'
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
                  Select Language
                </Text>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: 14,
                  marginTop: 4,
                  fontWeight: '500',
                  letterSpacing: 0.2,
                }}>
                  Choose from {availableSubtitles.length} available languages
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
                  onPress={handleLanguageClose}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
            </LinearGradient>

            {/* Content */}
            <ScrollView 
              style={{ 
                maxHeight: height * 0.6,
                backgroundColor: 'transparent',
              }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ 
                padding: 24,
                paddingBottom: 32,
              }}
              bounces={false}
            >
              {availableSubtitles.length > 0 ? availableSubtitles.map((subtitle, index) => (
                <Animated.View
                  key={subtitle.id}
                  entering={FadeInDown.duration(300).delay(150 + (index * 50))}
                  layout={Layout.springify()}
                  style={{ marginBottom: 16 }}
                >
                  <TouchableOpacity
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 20,
                      padding: 20,
                      borderWidth: 2,
                      borderColor: 'rgba(255, 255, 255, 0.08)',
                      elevation: 3,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 6,
                    }}
                    onPress={() => loadWyzieSubtitle(subtitle)}
                    disabled={isLoadingSubtitles}
                    activeOpacity={0.85}
                  >
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        flex: 1,
                        marginRight: 16,
                      }}>
                        <Image 
                          source={{ uri: subtitle.flagUrl }}
                          style={{
                            width: 32,
                            height: 24,
                            borderRadius: 4,
                            marginRight: 16,
                          }}
                          resizeMode="cover"
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{
                            color: 'rgba(255, 255, 255, 0.95)',
                            fontSize: 16,
                            fontWeight: '700',
                            letterSpacing: -0.2,
                            marginBottom: 4,
                          }}>
                            {formatLanguage(subtitle.language)}
                          </Text>
                          <Text style={{
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: 13,
                            fontWeight: '500',
                          }}>
                            {subtitle.display}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: isLoadingSubtitles 
                          ? 'rgba(33, 150, 243, 0.15)' 
                          : 'rgba(255, 255, 255, 0.05)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 2,
                        borderColor: isLoadingSubtitles 
                          ? 'rgba(33, 150, 243, 0.3)' 
                          : 'rgba(255, 255, 255, 0.1)',
                      }}>
                        {isLoadingSubtitles ? (
                          <ActivityIndicator size="small" color="#2196F3" />
                        ) : (
                          <MaterialIcons name="download" size={24} color="rgba(255,255,255,0.6)" />
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
                  }}
                >
                  <MaterialIcons name="translate" size={48} color="rgba(255, 255, 255, 0.3)" />
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: 18,
                    fontWeight: '700',
                    marginTop: 16,
                    textAlign: 'center',
                    letterSpacing: -0.3,
                  }}>
                    No subtitles found
                  </Text>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: 14,
                    marginTop: 8,
                    textAlign: 'center',
                    lineHeight: 20,
                  }}>
                    No subtitles are available for this content.{'\n'}Try searching again or check back later.
                  </Text>
                </Animated.View>
              )}
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