import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../styles/colors';
import { StreamingContent } from '../../types/metadata';

interface MovieContentProps {
  metadata: StreamingContent;
}

export const MovieContent: React.FC<MovieContentProps> = ({ metadata }) => {
  const hasCast = Array.isArray(metadata.cast) && metadata.cast.length > 0;
  const castDisplay = hasCast ? (metadata.cast as string[]).slice(0, 5).join(', ') : '';
  
  return (
    <View style={styles.container}>
      {/* Additional metadata */}
      <View style={styles.additionalInfo}>
        {metadata.director && (
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Director:</Text>
            <Text style={styles.metadataValue}>{metadata.director}</Text>
          </View>
        )}
        
        {metadata.writer && (
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Writer:</Text>
            <Text style={styles.metadataValue}>{metadata.writer}</Text>
          </View>
        )}
        
        {hasCast && (
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Cast:</Text>
            <Text style={styles.metadataValue}>{castDisplay}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  additionalInfo: {
    gap: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metadataLabel: {
    color: colors.textMuted,
    fontSize: 15,
    width: 70,
  },
  metadataValue: {
    color: colors.text,
    fontSize: 15,
    flex: 1,
    lineHeight: 24,
  },
}); 