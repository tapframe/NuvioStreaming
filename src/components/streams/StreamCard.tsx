import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../styles/colors';
import { Stream } from '../../types/metadata';
import QualityBadge from '../metadata/QualityBadge';

interface StreamCardProps {
  stream: Stream;
  onPress: () => void;
  index: number;
  isLoading?: boolean;
  statusMessage?: string;
}

const StreamCard = ({ stream, onPress, index, isLoading, statusMessage }: StreamCardProps) => {
  const quality = stream.title?.match(/(\d+)p/)?.[1] || null;
  const isHDR = stream.title?.toLowerCase().includes('hdr');
  const isDolby = stream.title?.toLowerCase().includes('dolby') || stream.title?.includes('DV');
  const size = stream.title?.match(/💾\s*([\d.]+\s*[GM]B)/)?.[1];
  const isDebrid = stream.behaviorHints?.cached;

  const displayTitle = stream.name || stream.title || 'Unnamed Stream';
  const displayAddonName = stream.title || '';

  return (
    <TouchableOpacity 
      style={[
        styles.streamCard, 
        isLoading && styles.streamCardLoading
      ]} 
      onPress={onPress}
      disabled={isLoading}
      activeOpacity={0.7}
    >
      <View style={styles.streamDetails}>
        <View style={styles.streamNameRow}>
          <View style={styles.streamTitleContainer}>
            <Text style={styles.streamName}>
              {displayTitle}
            </Text>
            {displayAddonName && displayAddonName !== displayTitle && (
              <Text style={styles.streamAddonName}>
                {displayAddonName}
              </Text>
            )}
          </View>
          
          {/* Show loading indicator if stream is loading */}
          {isLoading && (
            <View style={styles.loadingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>
                {statusMessage || "Loading..."}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.streamMetaRow}>
          {quality && quality >= "720" && (
            <QualityBadge type="HD" />
          )}
          
          {isDolby && (
            <QualityBadge type="VISION" />
          )}
          
          {size && (
            <View style={[styles.chip, { backgroundColor: colors.darkGray }]}>
              <Text style={styles.chipText}>{size}</Text>
            </View>
          )}
          
          {isDebrid && (
            <View style={[styles.chip, { backgroundColor: colors.success }]}>
              <Text style={styles.chipText}>DEBRID</Text>
            </View>
          )}
        </View>
      </View>
      
      <View style={styles.streamAction}>
        <MaterialIcons 
          name="play-arrow" 
          size={24} 
          color={colors.primary} 
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  streamCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    minHeight: 70,
    backgroundColor: colors.elevation1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    width: '100%',
    zIndex: 1,
  },
  streamCardLoading: {
    opacity: 0.7,
  },
  streamDetails: {
    flex: 1,
  },
  streamNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'wrap',
    gap: 8
  },
  streamTitleContainer: {
    flex: 1,
  },
  streamName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    lineHeight: 20,
    color: colors.highEmphasis,
  },
  streamAddonName: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.mediumEmphasis,
    marginBottom: 6,
  },
  streamMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  chipText: {
    color: colors.highEmphasis,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  loadingText: {
    color: colors.primary,
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  streamAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.elevation2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default React.memo(StreamCard); 