import React from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Feather from 'react-native-vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { styles } from '../utils/playerStyles';
import { getTrackDisplayName } from '../utils/playerUtils';
import { useTheme } from '../../../contexts/ThemeContext';

interface PlayerControlsProps {
  showControls: boolean;
  fadeAnim: Animated.Value;
  paused: boolean;
  title: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  quality?: string;
  year?: number;
  streamProvider?: string;
  streamName?: string;
  currentTime: number;
  duration: number;
  zoomScale: number;
  currentResizeMode?: string;
  ksAudioTracks: Array<{id: number, name: string, language?: string}>;
  selectedAudioTrack: number | null;
  availableStreams?: { [providerId: string]: { streams: any[]; addonName: string } };
  togglePlayback: () => void;
  skip: (seconds: number) => void;
  handleClose: () => void;
  cycleAspectRatio: () => void;
  cyclePlaybackSpeed: () => void;
  currentPlaybackSpeed: number;
  setShowAudioModal: (show: boolean) => void;
  setShowSubtitleModal: (show: boolean) => void;
  isSubtitleModalOpen?: boolean;
  setShowSourcesModal?: (show: boolean) => void;
  // Slider-specific props
  onSliderValueChange: (value: number) => void;
  onSlidingStart: () => void;
  onSlidingComplete: (value: number) => void;
  buffered: number;
  formatTime: (seconds: number) => string;
  playerBackend?: string;
  // AirPlay props
  isAirPlayActive?: boolean;
  allowsAirPlay?: boolean;
  onAirPlayPress?: () => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  showControls,
  fadeAnim,
  paused,
  title,
  episodeTitle,
  season,
  episode,
  quality,
  year,
  streamProvider,
  streamName,
  currentTime,
  duration,
  zoomScale,
  currentResizeMode,
  ksAudioTracks,
  selectedAudioTrack,
  availableStreams,
  togglePlayback,
  skip,
  handleClose,
  cycleAspectRatio,
  cyclePlaybackSpeed,
  currentPlaybackSpeed,
  setShowAudioModal,
  setShowSubtitleModal,
  isSubtitleModalOpen,
  setShowSourcesModal,
  onSliderValueChange,
  onSlidingStart,
  onSlidingComplete,
  buffered,
  formatTime,
  playerBackend,
  isAirPlayActive,
  allowsAirPlay,
  onAirPlayPress,
}) => {
  const { currentTheme } = useTheme();


  /* Responsive Spacing */
  const screenWidth = Dimensions.get('window').width;
  const buttonSpacing = screenWidth * 0.15;

  const playButtonSize = screenWidth * 0.12; // 12% of screen width
  const playIconSize = playButtonSize * 0.6; // 60% of button size
  const seekButtonSize = screenWidth * 0.11; // 11% of screen width
  const seekIconSize = seekButtonSize * 0.75; // 75% of button size
  const seekNumberSize = seekButtonSize * 0.25; // 25% of button size
  const arcBorderWidth = seekButtonSize * 0.05; // 5% of button size

  /* Animations - State & Refs */
  const [showBackwardSign, setShowBackwardSign] = React.useState(false);
  const [showForwardSign, setShowForwardSign] = React.useState(false);

  /* Separate Animations for Each Button */
  const backwardPressAnim = React.useRef(new Animated.Value(0)).current;
  const backwardSlideAnim = React.useRef(new Animated.Value(0)).current;
  const backwardScaleAnim = React.useRef(new Animated.Value(1)).current;
  const backwardArcOpacity = React.useRef(new Animated.Value(0)).current;
  const backwardArcRotation = React.useRef(new Animated.Value(0)).current;

  const forwardPressAnim = React.useRef(new Animated.Value(0)).current;
  const forwardSlideAnim = React.useRef(new Animated.Value(0)).current;
  const forwardScaleAnim = React.useRef(new Animated.Value(1)).current;
  const forwardArcOpacity = React.useRef(new Animated.Value(0)).current;
  const forwardArcRotation = React.useRef(new Animated.Value(0)).current;

  const playPressAnim = React.useRef(new Animated.Value(0)).current;
  const playIconScale = React.useRef(new Animated.Value(1)).current;
  const playIconOpacity = React.useRef(new Animated.Value(1)).current;

  /* Handle Seek with Animation */
  const handleSeekWithAnimation = (seconds: number) => {
    const isForward = seconds > 0;
    
    if (isForward) {
      setShowForwardSign(true);
    } else {
      setShowBackwardSign(true);
    }

    const pressAnim = isForward ? forwardPressAnim : backwardPressAnim;
    const slideAnim = isForward ? forwardSlideAnim : backwardSlideAnim;
    const scaleAnim = isForward ? forwardScaleAnim : backwardScaleAnim;
    const arcOpacity = isForward ? forwardArcOpacity : backwardArcOpacity;
    const arcRotation = isForward ? forwardArcRotation : backwardArcRotation;

    Animated.parallel([
      // Button press effect (circle flash)
      Animated.sequence([
        Animated.timing(pressAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(pressAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      // Number slide out
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: isForward ? (seekButtonSize * 0.75) : -(seekButtonSize * 0.75),
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
      // Button scale pulse
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.15,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
      // Arc sweep animation
      Animated.parallel([
        Animated.timing(arcOpacity, {
          toValue: 1,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(arcRotation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      if (isForward) {
        setShowForwardSign(false);
      } else {
        setShowBackwardSign(false);
      }
      arcOpacity.setValue(0);
      arcRotation.setValue(0);
    });

    skip(seconds);
  };

  /* Handle Play/Pause with Animation */
  const handlePlayPauseWithAnimation = () => {
    Animated.sequence([
      Animated.timing(playPressAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(playPressAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.timing(playIconScale, {
        toValue: 0.85,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(playIconScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    togglePlayback();
  };




  const deviceWidth = Dimensions.get('window').width;
  const BREAKPOINTS = { phone: 0, tablet: 768, largeTablet: 1024, tv: 1440 } as const;
  const getDeviceType = (w: number) => {
    if (w >= BREAKPOINTS.tv) return 'tv';
    if (w >= BREAKPOINTS.largeTablet) return 'largeTablet';
    if (w >= BREAKPOINTS.tablet) return 'tablet';
    return 'phone';
  };
  const deviceType = getDeviceType(deviceWidth);
  const isTablet = deviceType === 'tablet';
  const isLargeTablet = deviceType === 'largeTablet';
  const isTV = deviceType === 'tv';

  const closeIconSize = isTV ? 28 : isLargeTablet ? 26 : isTablet ? 24 : 24;
  const skipIconSize = isTV ? 28 : isLargeTablet ? 26 : isTablet ? 24 : 24;
  const playIconSize = isTV ? 56 : isLargeTablet ? 48 : isTablet ? 44 : 40;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fadeAnim, zIndex: 20 }]}
      pointerEvents={showControls ? 'box-none' : 'none'}
    >
      {/* Progress slider with native iOS slider */}
      <View style={styles.sliderContainer}>
        <Slider
          style={{
            width: '100%',
            height: 40,
            marginHorizontal: 0,
          }}
          minimumValue={0}
          maximumValue={duration || 1}
          value={currentTime}
          onValueChange={onSliderValueChange}
          onSlidingStart={onSlidingStart}
          onSlidingComplete={onSlidingComplete}
          minimumTrackTintColor={currentTheme.colors.primary}
          maximumTrackTintColor={currentTheme.colors.mediumEmphasis}
          thumbTintColor={Platform.OS === 'android' ? currentTheme.colors.white : undefined}
          tapToSeek={Platform.OS === 'ios'}
        />
        <View style={[styles.timeDisplay, { paddingHorizontal: 14 }]}>
          <Text style={styles.duration}>{formatTime(currentTime)}</Text>
          <Text style={styles.duration}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Controls Overlay */}
      <View style={styles.controlsContainer}>
        {/* Top Gradient & Header */}
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent']}
          style={styles.topGradient}
        >
          <View style={styles.header}>
            {/* Title Section - Enhanced with metadata */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>{title}</Text>
              {/* Show season and episode for series */}
              {season && episode && (
                <Text style={styles.episodeInfo}>
                  S{season}E{episode} {episodeTitle && `• ${episodeTitle}`}
                </Text>
              )}
              {/* Show year and provider (quality chip removed) */}
              <View style={styles.metadataRow}>
                {year && <Text style={styles.metadataText}>{year}</Text>}
                {streamName && <Text style={styles.providerText}>via {streamName}</Text>}
              </View>
              {playerBackend && (
                <View style={styles.metadataRow}>
                  <Text style={[styles.providerText, { fontSize: 11, opacity: 0.9 }]}>{playerBackend}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={closeIconSize} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        
        {/* Center Controls - CloudStream Style */}
        <View style={[styles.controls, { 
          transform: [{ translateY: -(playButtonSize / 2) }] 
        }]}>
          
          {/* Backward Seek Button (-10s) */}
          <TouchableOpacity 
            onPress={() => handleSeekWithAnimation(-10)} 
            activeOpacity={0.7}
          >
            <Animated.View style={[
              styles.seekButtonContainer,
              { 
                width: seekButtonSize,
                height: seekButtonSize,
                transform: [{ scale: backwardScaleAnim }] 
              }
            ]}>
              <Ionicons 
                name="reload-outline" 
                size={seekIconSize} 
                color="white" 
                style={{ transform: [{ scaleX: -1 }] }} 
              />
              <Animated.View style={[
                styles.buttonCircle,
                { 
                  opacity: backwardPressAnim,
                  width: seekButtonSize * 0.6, // 60% of seek button
                  height: seekButtonSize * 0.6,
                  borderRadius: (seekButtonSize * 0.6) / 2,
                }
              ]} />
              <View style={[styles.seekNumberContainer, {
                width: seekButtonSize,
                height: seekButtonSize,
              }]}>
                <Animated.Text style={[
                  styles.seekNumber,
                  { 
                    fontSize: seekNumberSize,
                    marginLeft: 7, // Opposite offset for flipped icon
                    transform: [{ translateX: backwardSlideAnim }] 
                  }
                ]}>
                  {showBackwardSign ? '-10' : '10'}
                </Animated.Text>
              </View>
              </Animated.View>
              <Animated.View style={[
                styles.arcContainer,
                {
                  width: seekButtonSize,
                  height: seekButtonSize,
                  opacity: backwardArcOpacity,
                  transform: [{
                    rotate: backwardArcRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['90deg', '-90deg']
                    })
                  }]
                }
              ]}>
                <View style={[
                  styles.arcLeft,
                  {
                    width: seekButtonSize,
                    height: seekButtonSize,
                    borderRadius: seekButtonSize / 2,
                    borderWidth: arcBorderWidth,
                  }
                ]} />
              </Animated.View>
          </TouchableOpacity>

          {/* Play/Pause Button */}
          <TouchableOpacity 
            onPress={handlePlayPauseWithAnimation} 
            activeOpacity={0.7}
            style={{ marginHorizontal: buttonSpacing }}
          >
            <View style={[styles.playButtonCircle, { width: playButtonSize, height: playButtonSize }]}>
              <Animated.View style={[
                styles.playPressCircle,
                { 
                  opacity: playPressAnim,
                  width: playButtonSize * 0.85, // ← 85% of button size
                  height: playButtonSize * 0.85,
                  borderRadius: (playButtonSize * 0.85) / 2, // ← Half of width/height for circle
                }
              ]} />
              <Animated.View style={{ 
                transform: [{ scale: playIconScale }],
                opacity: playIconOpacity 
              }}>
                <Ionicons 
                  name={paused ? "play" : "pause"} 
                  size={playIconSize} 
                  color="#FFFFFF"
                />
              </Animated.View>
            </View>
          </TouchableOpacity>

          {/* Forward Seek Button (+10s) */}
            <TouchableOpacity 
              onPress={() => handleSeekWithAnimation(10)} 
              activeOpacity={0.7}
            >
              <Animated.View style={[
                styles.seekButtonContainer,
                { 
                  width: seekButtonSize,
                  height: seekButtonSize,
                  transform: [{ scale: forwardScaleAnim }] 
                }
              ]}>
                <Ionicons 
                  name="reload-outline" 
                  size={seekIconSize} 
                  color="white" 
                />
              <Animated.View style={[
                styles.buttonCircle,
                { 
                  opacity: forwardPressAnim,
                  width: seekButtonSize * 0.6, // 60% of seek button
                  height: seekButtonSize * 0.6,
                  borderRadius: (seekButtonSize * 0.6) / 2,
                }
              ]} />
              <View style={[styles.seekNumberContainer, {
                width: seekButtonSize,
                height: seekButtonSize,
              }]}>
                <Animated.Text style={[
                  styles.seekNumber,
                  { 
                    fontSize: seekNumberSize,
                    transform: [{ translateX: forwardSlideAnim }] 
                  }
                ]}>
                  {showForwardSign ? '+10' : '10'}
                </Animated.Text>
              </View>
              <Animated.View style={[
                styles.arcContainer,
                {
                  width: seekButtonSize,
                  height: seekButtonSize,
                },
                {
                  opacity: forwardArcOpacity,
                  transform: [{
                    rotate: forwardArcRotation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-90deg', '90deg']
                    })
                  }]
                }
              ]}>
                <View style={[
                  styles.arcRight,
                  {
                    width: seekButtonSize,
                    height: seekButtonSize,
                    borderRadius: seekButtonSize / 2,
                    borderWidth: arcBorderWidth,
                  }
                ]} />
              </Animated.View>
            </Animated.View>
        {/* Center Controls (Play/Pause, Skip) */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={() => skip(-10)} style={styles.skipButton}>
            <Ionicons name="play-back" size={skipIconSize} color="white" />
            <Text style={styles.skipText}>10</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
            <Ionicons name={paused ? "play" : "pause"} size={playIconSize} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => skip(10)} style={styles.skipButton}>
            <Ionicons name="play-forward" size={skipIconSize} color="white" />
            <Text style={styles.skipText}>10</Text>
          </TouchableOpacity>
        </View>





        {/* Bottom Gradient */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.bottomGradient}
        >
          <View style={styles.bottomControls}>
            {/* Bottom Buttons Row */}
            <View style={styles.bottomButtons}>
              {/* Aspect Ratio Button - uses official resize modes */}
              <TouchableOpacity style={styles.bottomButton} onPress={cycleAspectRatio}>
                <Ionicons name="resize" size={20} color="white" />
                <Text style={[styles.bottomButtonText, { fontSize: 14, textAlign: 'center' }]}>
                  {currentResizeMode
                    ? (currentResizeMode === 'none'
                        ? 'Original'
                        : currentResizeMode.charAt(0).toUpperCase() + currentResizeMode.slice(1))
                    : 'Contain'}
                </Text>
              </TouchableOpacity>

              {/* Playback Speed Button - Hidden on iOS */}
              {Platform.OS !== 'ios' && (
                <TouchableOpacity style={styles.bottomButton} onPress={cyclePlaybackSpeed}>
                  <Ionicons name="speedometer" size={20} color="white" />
                  <Text style={styles.bottomButtonText}>
                    Speed {currentPlaybackSpeed}x
                  </Text>
                </TouchableOpacity>
              )}

              {/* Audio Button - Updated to use ksAudioTracks */}
              <TouchableOpacity
                style={styles.bottomButton}
                onPress={() => setShowAudioModal(true)}
                disabled={ksAudioTracks.length <= 1}
              >
                <Ionicons name="volume-high" size={20} color={ksAudioTracks.length <= 1 ? 'grey' : 'white'} />
                <Text style={[styles.bottomButtonText, ksAudioTracks.length <= 1 && {color: 'grey'}]} numberOfLines={1}>
                  {(() => {
                    const trackName = getTrackDisplayName(
                      ksAudioTracks.find(t => t.id === selectedAudioTrack) || { id: -1, name: 'Default' }
                    );
                    // Truncate long audio track names to prevent UI cramping
                    const maxLength = 12; // Limit to 12 characters
                    return trackName.length > maxLength ? `${trackName.substring(0, maxLength)}...` : trackName;
                  })()}
                </Text>
              </TouchableOpacity>
              
              {/* Subtitle Button - Always available for external subtitle search */}
              <TouchableOpacity
                style={styles.bottomButton}
                onPress={() => setShowSubtitleModal(!isSubtitleModalOpen)}
              >
                <Ionicons name="text" size={20} color="white" />
                <Text style={styles.bottomButtonText}>
                  Subtitles
                </Text>
              </TouchableOpacity>

              {/* Change Source Button */}
              {setShowSourcesModal && (
                <TouchableOpacity
                  style={styles.bottomButton}
                  onPress={() => setShowSourcesModal(true)}
                >
                  <Ionicons name="swap-horizontal" size={20} color="white" />
                  <Text style={styles.bottomButtonText}>
                    Change Source
                  </Text>
                </TouchableOpacity>
              )}

              {/* AirPlay Button - iOS only, KSAVPlayer only */}
              {Platform.OS === 'ios' && onAirPlayPress && playerBackend === 'KSAVPlayer' && (
                <TouchableOpacity
                  style={styles.bottomButton}
                  onPress={onAirPlayPress}
                >
                  <Feather
                    name="airplay"
                    size={20}
                    color={isAirPlayActive ? currentTheme.colors.primary : "white"}
                  />
                  <Text style={[
                    styles.bottomButtonText,
                    isAirPlayActive && { color: currentTheme.colors.primary }
                  ]}>
                    {allowsAirPlay ? 'AirPlay' : 'AirPlay Off'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};

export default PlayerControls;