import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { styles } from '../utils/playerStyles';
import { Stream } from '../../../types/streams';
import QualityBadge from '../../metadata/QualityBadge';

interface SourcesModalProps {
  showSourcesModal: boolean;
  setShowSourcesModal: (show: boolean) => void;
  availableStreams: { [providerId: string]: { streams: Stream[]; addonName: string } };
  currentStreamUrl: string;
  onSelectStream: (stream: Stream) => void;
  isChangingSource: boolean;
}

const SourcesModal: React.FC<SourcesModalProps> = ({
  showSourcesModal,
  setShowSourcesModal,
  availableStreams,
  currentStreamUrl,
  onSelectStream,
  isChangingSource,
}) => {
  if (!showSourcesModal) return null;

  const sortedProviders = Object.entries(availableStreams).sort(([a], [b]) => {
    // Put HDRezka first
    if (a === 'hdrezka') return -1;
    if (b === 'hdrezka') return 1;
    return 0;
  });

  const handleStreamSelect = (stream: Stream) => {
    if (stream.url !== currentStreamUrl && !isChangingSource) {
      onSelectStream(stream);
    }
  };

  const getQualityFromTitle = (title?: string): string | null => {
    if (!title) return null;
    const match = title.match(/(\d+)p/);
    return match ? match[1] : null;
  };

  const isStreamSelected = (stream: Stream): boolean => {
    return stream.url === currentStreamUrl;
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.sourcesModal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Choose Source</Text>
          <TouchableOpacity 
            style={styles.modalCloseButton}
            onPress={() => setShowSourcesModal(false)}
          >
            <MaterialIcons name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.sourcesScrollView} showsVerticalScrollIndicator={false}>
          {sortedProviders.map(([providerId, { streams, addonName }]) => (
            <View key={providerId} style={styles.sourceProviderSection}>
              <Text style={styles.sourceProviderTitle}>{addonName}</Text>
              
              {streams.map((stream, index) => {
                const quality = getQualityFromTitle(stream.title);
                const isSelected = isStreamSelected(stream);
                const isHDR = stream.title?.toLowerCase().includes('hdr');
                const isDolby = stream.title?.toLowerCase().includes('dolby') || stream.title?.includes('DV');
                const size = stream.title?.match(/💾\s*([\d.]+\s*[GM]B)/)?.[1];
                const isDebrid = stream.behaviorHints?.cached;
                const isHDRezka = providerId === 'hdrezka';

                return (
                  <TouchableOpacity
                    key={`${stream.url}-${index}`}
                    style={[
                      styles.sourceStreamItem,
                      isSelected && styles.sourceStreamItemSelected
                    ]}
                    onPress={() => handleStreamSelect(stream)}
                    disabled={isChangingSource || isSelected}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sourceStreamDetails}>
                      <View style={styles.sourceStreamTitleRow}>
                        <Text style={[
                          styles.sourceStreamTitle,
                          isSelected && styles.sourceStreamTitleSelected
                        ]}>
                          {isHDRezka ? `HDRezka ${stream.title}` : (stream.name || stream.title || 'Unnamed Stream')}
                        </Text>
                        
                        {isSelected && (
                          <View style={styles.currentStreamBadge}>
                            <MaterialIcons name="play-arrow" size={16} color="#E50914" />
                            <Text style={styles.currentSourceItem}>Current</Text>
                          </View>
                        )}
                        
                        {isChangingSource && isSelected && (
                          <ActivityIndicator size="small" color="#E50914" style={{ marginLeft: 8 }} />
                        )}
                      </View>
                      
                      {!isHDRezka && stream.title && stream.title !== stream.name && (
                        <Text style={styles.sourceStreamSubtitle}>{stream.title}</Text>
                      )}
                      
                      <View style={styles.sourceStreamMeta}>
                        {quality && quality >= "720" && (
                          <QualityBadge type="HD" />
                        )}
                        
                        {isDolby && (
                          <QualityBadge type="VISION" />
                        )}
                        
                        {size && (
                          <View style={styles.sourceChip}>
                            <Text style={styles.sourceChipText}>{size}</Text>
                          </View>
                        )}
                        
                        {isDebrid && (
                          <View style={[styles.sourceChip, styles.debridChip]}>
                            <Text style={styles.sourceChipText}>DEBRID</Text>
                          </View>
                        )}
                        
                        {isHDRezka && (
                          <View style={[styles.sourceChip, styles.hdrezkaChip]}>
                            <Text style={styles.sourceChipText}>HDREZKA</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    
                    <View style={styles.sourceStreamAction}>
                      {isSelected ? (
                        <MaterialIcons name="check-circle" size={24} color="#E50914" />
                      ) : (
                        <MaterialIcons name="play-arrow" size={24} color="rgba(255,255,255,0.7)" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

export default SourcesModal; 