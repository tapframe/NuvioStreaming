import React from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  vlcAudioTracks: Array<{id: number, name: string, language?: string}>;
  selectedAudioTrack: number | null;
  availableStreams?: { [providerId: string]: { streams: any[]; addonName: string } };
  togglePlayback: () => void;
  skip: (seconds: number) => void;
  handleClose: () => void;
  cycleAspectRatio: () => void;
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
  vlcAudioTracks,
  selectedAudioTrack,
  availableStreams,
  togglePlayback,
  skip,
  handleClose,
  cycleAspectRatio,
  setShowAudioModal,
  setShowSubtitleModal,
  isSubtitleModalOpen,
  setShowSourcesModal,
  onSliderValueChange,
  onSlidingStart,
  onSlidingComplete,
  buffered,
  formatTime,
}) => {
  const { currentTheme } = useTheme();
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
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Center Controls (Play/Pause, Skip) */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={() => skip(-10)} style={styles.skipButton}>
            <Ionicons name="play-back" size={24} color="white" />
            <Text style={styles.skipText}>10</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
            <Ionicons name={paused ? "play" : "pause"} size={40} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => skip(10)} style={styles.skipButton}>
            <Ionicons name="play-forward" size={24} color="white" />
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
              {/* Fill/Cover Button - Updated to show fill/cover modes */}
              <TouchableOpacity style={styles.bottomButton} onPress={cycleAspectRatio}>
                <Ionicons name="resize" size={20} color="white" />
                <Text style={[styles.bottomButtonText, { fontSize: 14, textAlign: 'center' }]}>
                  {currentResizeMode ? 
                    (currentResizeMode === 'none' ? 'Original' : 
                     currentResizeMode.charAt(0).toUpperCase() + currentResizeMode.slice(1)) :
                    (zoomScale === 1.1 ? 'Fill' : 'Cover')
                  }
                </Text>
              </TouchableOpacity>

              {/* Audio Button - Updated to use vlcAudioTracks */}
              <TouchableOpacity
                style={styles.bottomButton}
                onPress={() => setShowAudioModal(true)}
                disabled={vlcAudioTracks.length <= 1}
              >
                <Ionicons name="volume-high" size={20} color={vlcAudioTracks.length <= 1 ? 'grey' : 'white'} />
                <Text style={[styles.bottomButtonText, vlcAudioTracks.length <= 1 && {color: 'grey'}]}>
                  {`Audio: ${getTrackDisplayName(vlcAudioTracks.find(t => t.id === selectedAudioTrack) || {id: -1, name: 'Default'})}`}
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
            </View>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};

export default PlayerControls;