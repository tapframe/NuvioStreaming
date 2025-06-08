import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  // Render subtitle settings modal
  const renderSubtitleModal = () => {
    if (!showSubtitleModal) return null;
    
    return (
      <View style={styles.fullscreenOverlay}>
        <View style={styles.modernModalContainer}>
          <View style={styles.modernModalHeader}>
            <Text style={styles.modernModalTitle}>Subtitle Settings</Text>
            <TouchableOpacity 
              style={styles.modernCloseButton}
              onPress={() => setShowSubtitleModal(false)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modernTrackListScrollContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.modernTrackListContainer}>
              
              {/* External Subtitles Section - Priority */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>External Subtitles</Text>
                <Text style={styles.sectionDescription}>High quality subtitles with size control</Text>
                
                {/* Custom subtitles option - show if loaded */}
                {customSubtitles.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.modernTrackItem, useCustomSubtitles && styles.modernSelectedTrackItem]}
                    onPress={() => {
                      selectTextTrack(-999);
                      setShowSubtitleModal(false);
                    }}
                  >
                    <View style={styles.trackIconContainer}>
                      <Ionicons name="document-text" size={20} color="#4CAF50" />
                    </View>
                    <View style={styles.modernTrackInfoContainer}>
                      <Text style={styles.modernTrackPrimaryText}>Custom Subtitles</Text>
                      <Text style={styles.modernTrackSecondaryText}>
                        {customSubtitles.length} cues • Size adjustable
                      </Text>
                    </View>
                    {useCustomSubtitles && (
                      <View style={styles.modernSelectedIndicator}>
                        <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                      </View>
                    )}
                  </TouchableOpacity>
                ) : null}

                {/* Search for external subtitles */}
                <TouchableOpacity
                  style={styles.searchSubtitlesButton}
                  onPress={() => {
                    setShowSubtitleModal(false);
                    fetchAvailableSubtitles();
                  }}
                  disabled={isLoadingSubtitleList}
                >
                  <View style={styles.searchButtonContent}>
                    {isLoadingSubtitleList ? (
                      <ActivityIndicator size="small" color="#2196F3" />
                    ) : (
                      <Ionicons name="search" size={20} color="#2196F3" />
                    )}
                    <Text style={styles.searchSubtitlesText}>
                      {isLoadingSubtitleList ? 'Searching...' : 'Search Online Subtitles'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Subtitle Size Controls - Only for custom subtitles */}
              {useCustomSubtitles && (
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Size Control</Text>
                  <View style={styles.modernSubtitleSizeContainer}>
                    <TouchableOpacity 
                      style={styles.modernSizeButton}
                      onPress={decreaseSubtitleSize}
                    >
                      <Ionicons name="remove" size={20} color="white" />
                    </TouchableOpacity>
                    <View style={styles.sizeDisplayContainer}>
                      <Text style={styles.modernSubtitleSizeText}>{subtitleSize}px</Text>
                      <Text style={styles.sizeLabel}>Font Size</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.modernSizeButton}
                      onPress={increaseSubtitleSize}
                    >
                      <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Built-in Subtitles Section */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Built-in Subtitles</Text>
                <Text style={styles.sectionDescription}>System default sizing • No customization</Text>
                
                {/* Off option */}
                <TouchableOpacity
                  style={[styles.modernTrackItem, (selectedTextTrack === -1 && !useCustomSubtitles) && styles.modernSelectedTrackItem]}
                  onPress={() => {
                    selectTextTrack(-1);
                    setShowSubtitleModal(false);
                  }}
                >
                  <View style={styles.trackIconContainer}>
                    <Ionicons name="close-circle" size={20} color="#9E9E9E" />
                  </View>
                  <View style={styles.modernTrackInfoContainer}>
                    <Text style={styles.modernTrackPrimaryText}>Disabled</Text>
                    <Text style={styles.modernTrackSecondaryText}>No subtitles</Text>
                  </View>
                  {(selectedTextTrack === -1 && !useCustomSubtitles) && (
                    <View style={styles.modernSelectedIndicator}>
                      <Ionicons name="checkmark-circle" size={24} color="#9E9E9E" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Available built-in subtitle tracks */}
                {vlcTextTracks.length > 0 ? vlcTextTracks.map(track => (
                  <TouchableOpacity
                    key={track.id}
                    style={[styles.modernTrackItem, (selectedTextTrack === track.id && !useCustomSubtitles) && styles.modernSelectedTrackItem]}
                    onPress={() => {
                      selectTextTrack(track.id);
                      setShowSubtitleModal(false);
                    }}
                  >
                    <View style={styles.trackIconContainer}>
                      <Ionicons name="text" size={20} color="#FF9800" />
                    </View>
                    <View style={styles.modernTrackInfoContainer}>
                      <Text style={styles.modernTrackPrimaryText}>
                        {getTrackDisplayName(track)}
                      </Text>
                      <Text style={styles.modernTrackSecondaryText}>
                        Built-in track • System font size
                      </Text>
                    </View>
                    {(selectedTextTrack === track.id && !useCustomSubtitles) && (
                      <View style={styles.modernSelectedIndicator}>
                        <Ionicons name="checkmark-circle" size={24} color="#FF9800" />
                      </View>
                    )}
                  </TouchableOpacity>
                )) : (
                  <View style={styles.modernEmptyStateContainer}>
                    <Ionicons name="information-circle-outline" size={24} color="#666" />
                    <Text style={styles.modernEmptyStateText}>No built-in subtitles available</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  // Render subtitle language selection modal
  const renderSubtitleLanguageModal = () => {
    if (!showSubtitleLanguageModal) return null;
    
    return (
      <View style={styles.fullscreenOverlay}>
        <View style={styles.enhancedModalContainer}>
          <View style={styles.enhancedModalHeader}>
            <Text style={styles.enhancedModalTitle}>Select Language</Text>
            <TouchableOpacity 
              style={styles.enhancedCloseButton}
              onPress={() => setShowSubtitleLanguageModal(false)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.trackListScrollContainer}>
            <View style={styles.trackListContainer}>
              {availableSubtitles.length > 0 ? availableSubtitles.map(subtitle => (
                <TouchableOpacity
                  key={subtitle.id}
                  style={styles.enhancedTrackItem}
                  onPress={() => loadWyzieSubtitle(subtitle)}
                  disabled={isLoadingSubtitles}
                >
                  <View style={styles.subtitleLanguageItem}>
                    <Image 
                      source={{ uri: subtitle.flagUrl }}
                      style={styles.flagIcon}
                      resizeMode="cover"
                    />
                    <View style={styles.trackInfoContainer}>
                      <Text style={styles.trackPrimaryText}>
                        {formatLanguage(subtitle.language)}
                      </Text>
                      <Text style={styles.trackSecondaryText}>
                        {subtitle.display}
                      </Text>
                    </View>
                  </View>
                  {isLoadingSubtitles && (
                    <ActivityIndicator size="small" color="#E50914" />
                  )}
                </TouchableOpacity>
              )) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="alert-circle-outline" size={40} color="#888" />
                  <Text style={styles.emptyStateText}>
                    No subtitles found for this content
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
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