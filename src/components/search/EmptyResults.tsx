import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../styles';

interface EmptyResultsProps {
  isDarkMode?: boolean;
}

const EmptyResults: React.FC<EmptyResultsProps> = ({ isDarkMode = true }) => {
  return (
    <View style={styles.emptyContainer}>
      <MaterialIcons 
        name="search-off" 
        size={64} 
        color={isDarkMode ? colors.lightGray : colors.mediumGray}
      />
      <Text style={[
        styles.emptyText,
        { color: isDarkMode ? colors.white : colors.black }
      ]}>
        No results found
      </Text>
      <Text style={[
        styles.emptySubtext,
        { color: isDarkMode ? colors.lightGray : colors.mediumGray }
      ]}>
        Try different keywords or check your spelling
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default EmptyResults; 