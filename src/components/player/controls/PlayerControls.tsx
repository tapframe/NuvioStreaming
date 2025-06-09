import React from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../utils/playerStyles';
import { getTrackDisplayName } from '../utils/playerUtils';

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
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  zoomScale: number;
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
  currentTime,
  duration,
  playbackSpeed,
  zoomScale,
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
}) => {
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}
      pointerEvents={showControls ? 'auto' : 'none'}
    >
      {/* Progress bar with enhanced touch handling */}
      <View style={styles.sliderContainer}>
        <View
          style={styles.progressTouchArea}
          onTouchStart={handleProgressBarDragStart}
          onTouchMove={handleProgressBarDragMove}
          onTouchEnd={handleProgressBarDragEnd}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleProgressBarTouch}
            style={{width: '100%'}}
          >
            <View 
              ref={progressBarRef}
              style={styles.progressBarContainer}
            >
              {/* Buffered Progress */}
              <View style={[styles.bufferProgress, { 
                width: `${(buffered / (duration || 1)) * 100}%`
              }]} />
              {/* Animated Progress */}
              <Animated.View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%']
                    })
                  }
                ]} 
              />
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.timeDisplay}>
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
              {/* Show year, quality, and provider */}
              <View style={styles.metadataRow}>
                {year && <Text style={styles.metadataText}>{year}</Text>}
                {quality && <View style={styles.qualityBadge}><Text style={styles.qualityText}>{quality}</Text></View>}
                {streamProvider && <Text style={styles.providerText}>via {streamProvider}</Text>}
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
              {/* Speed Button */}
              <TouchableOpacity style={styles.bottomButton}>
                <Ionicons name="speedometer" size={20} color="white" />
                <Text style={styles.bottomButtonText}>Speed ({playbackSpeed}x)</Text>
              </TouchableOpacity>

              {/* Fill/Cover Button - Updated to show fill/cover modes */}
              <TouchableOpacity style={styles.bottomButton} onPress={cycleAspectRatio}>
                <Ionicons name="resize" size={20} color="white" />
                <Text style={[styles.bottomButtonText, { fontSize: 14, textAlign: 'center' }]}>
                  {zoomScale === 1.1 ? 'Fill' : 'Cover'}
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