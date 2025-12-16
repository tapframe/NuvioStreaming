import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { StreamingContent } from '../../types/metadata';

interface MovieContentProps {
  metadata: StreamingContent;
}

export const MovieContent: React.FC<MovieContentProps> = ({ metadata }) => {
  return null;
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