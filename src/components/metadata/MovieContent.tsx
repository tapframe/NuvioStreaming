import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { StreamingContent } from '../../types/metadata';

interface MovieContentProps {
  metadata: StreamingContent;
}

export const MovieContent: React.FC<MovieContentProps> = ({ metadata }) => {
  const { currentTheme } = useTheme();
  const hasCast = Array.isArray(metadata.cast) && metadata.cast.length > 0;
  const castDisplay = hasCast ? metadata.cast!.slice(0, 5).join(', ') : '';
  
  return (
    <View style={styles.container}>
      {/* Additional metadata */}
      <View style={styles.additionalInfo}>
        {metadata.director && (
          <View style={styles.metadataRow}>
            <Text style={[styles.metadataLabel, { color: currentTheme.colors.textMuted }]}>Director:</Text>
            <Text style={[styles.metadataValue, { color: currentTheme.colors.text }]}>{metadata.director}</Text>
          </View>
        )}
        

        {hasCast && (
          <View style={styles.metadataRow}>
            <Text style={[styles.metadataLabel, { color: currentTheme.colors.textMuted }]}>Cast:</Text>
            <Text style={[styles.metadataValue, { color: currentTheme.colors.text }]}>{castDisplay}</Text>
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
    fontSize: 15,
    width: 70,
  },
  metadataValue: {
    fontSize: 15,
    flex: 1,
    lineHeight: 24,
  },
}); 