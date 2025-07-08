import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../utils/playerStyles';
import { getTrackDisplayName } from '../utils/playerUtils';
import { SkiaProgressSlider } from './SkiaProgressSlider';

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
  setShowSourcesModal?: (show: boolean) => void;
  progressBarRef: React.RefObject<View>;
  progressAnim: Animated.Value;
  handleProgressBarTouch: (event: any) => void;
  handleProgressBarDragStart: () => void;
  handleProgressBarDragMove: (event: any) => void;
  handleProgressBarDragEnd: () => void;
  buffered: number;
  formatTime: (seconds: number) => string;
  seekToTime?: (time: number) => void;
}

const { width: screenWidth } = Dimensions.get('window');

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
  setShowSourcesModal,
  progressBarRef,
  progressAnim,
  handleProgressBarTouch,
  handleProgressBarDragStart,
  handleProgressBarDragMove,
  handleProgressBarDragEnd,
  buffered,
  formatTime,
  seekToTime,
}) => {
  // State for tracking preview time during dragging
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate slider width based on screen width minus padding
  const sliderWidth = screenWidth - 40; // 20px padding on each side

  const handleSeek = (time: number) => {
    if (seekToTime) {
      seekToTime(time);
    }
  };

  const handleSeekPreview = (time: number) => {
    setPreviewTime(time);
  };

  const handleSeekStart = () => {
    setIsDragging(true);
    handleProgressBarDragStart();
  };

  const handleSeekEnd = (time: number) => {
    setIsDragging(false);
    setPreviewTime(null);
    handleProgressBarDragEnd();
    handleSeek(time);
  };

  // Determine which time to display (preview time while dragging, otherwise current time)
  const displayTime = isDragging && previewTime !== null ? previewTime : currentTime;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}
      pointerEvents={showControls ? 'auto' : 'none'}
    >
      {/* Progress bar with Skia slider */}
      <View style={styles.sliderContainer}>
        <SkiaProgressSlider
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          onSeek={handleSeek}
          onSeekStart={handleSeekStart}
          onSeekEnd={handleSeekEnd}
          onSeekPreview={handleSeekPreview}
          width={sliderWidth}
        />
        <View style={styles.timeDisplay}>
          <Text style={[styles.duration, isDragging && { color: '#E50914' }]}>
            {formatTime(displayTime)}
          </Text>
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
              {/* Show year, quality, and provider */}
              <View style={styles.metadataRow}>
                {year && <Text style={styles.metadataText}>{year}</Text>}
                {quality && <View style={styles.qualityBadge}><Text style={styles.qualityText}>{quality}</Text></View>}
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
                onPress={() => setShowSubtitleModal(true)}
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