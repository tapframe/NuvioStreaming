import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../utils/playerStyles';
import { formatTime } from '../utils/playerUtils';

interface ResumeOverlayProps {
  showResumeOverlay: boolean;
  resumePosition: number | null;
  duration: number;
  title: string;
  season?: number;
  episode?: number;
  rememberChoice: boolean;
  setRememberChoice: (remember: boolean) => void;
  resumePreference: string | null;
  resetResumePreference: () => void;
  handleResume: () => void;
  handleStartFromBeginning: () => void;
}

export const ResumeOverlay: React.FC<ResumeOverlayProps> = ({
  showResumeOverlay,
  resumePosition,
  duration,
  title,
  season,
  episode,
  rememberChoice,
  setRememberChoice,
  resumePreference,
  resetResumePreference,
  handleResume,
  handleStartFromBeginning,
}) => {
  if (!showResumeOverlay || resumePosition === null) return null;
  
  return (
    <View style={styles.resumeOverlay}>
      <LinearGradient
        colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.7)']}
        style={styles.resumeContainer}
      >
        <View style={styles.resumeContent}>
          <View style={styles.resumeIconContainer}>
            <Ionicons name="play-circle" size={40} color="#E50914" />
          </View>
          <View style={styles.resumeTextContainer}>
            <Text style={styles.resumeTitle}>Continue Watching</Text>
            <Text style={styles.resumeInfo}>
              {title}
              {season && episode && ` • S${season}E${episode}`}
            </Text>
            <View style={styles.resumeProgressContainer}>
              <View style={styles.resumeProgressBar}>
                <View 
                  style={[
                    styles.resumeProgressFill, 
                    { width: `${duration > 0 ? (resumePosition / duration) * 100 : 0}%` }
                  ]} 
                />
              </View>
              <Text style={styles.resumeTimeText}>
                {formatTime(resumePosition)} {duration > 0 ? `/ ${formatTime(duration)}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Remember choice checkbox */}
        <TouchableOpacity 
          style={styles.rememberChoiceContainer}
          onPress={() => setRememberChoice(!rememberChoice)}
          activeOpacity={0.7}
        >
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, rememberChoice && styles.checkboxChecked]}>
              {rememberChoice && <Ionicons name="checkmark" size={12} color="white" />}
            </View>
            <Text style={styles.rememberChoiceText}>Remember my choice</Text>
          </View>
          
          {resumePreference && (
            <TouchableOpacity 
              onPress={resetResumePreference}
              style={styles.resetPreferenceButton}
            >
              <Text style={styles.resetPreferenceText}>Reset</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <View style={styles.resumeButtons}>
          <TouchableOpacity 
            style={styles.resumeButton} 
            onPress={handleStartFromBeginning}
          >
            <Ionicons name="refresh" size={16} color="white" style={styles.buttonIcon} />
            <Text style={styles.resumeButtonText}>Start Over</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.resumeButton, styles.resumeFromButton]} 
            onPress={handleResume}
          >
            <Ionicons name="play" size={16} color="white" style={styles.buttonIcon} />
            <Text style={styles.resumeButtonText}>Resume</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

export default ResumeOverlay; 