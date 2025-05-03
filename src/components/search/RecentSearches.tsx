import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../styles';

interface RecentSearchesProps {
  searches: string[];
  onSearchSelect: (search: string) => void;
  isDarkMode?: boolean;
}

const RecentSearches: React.FC<RecentSearchesProps> = ({
  searches,
  onSearchSelect,
  isDarkMode = true,
}) => {
  if (searches.length === 0) return null;

  return (
    <View style={styles.recentSearchesContainer}>
      <Text style={[styles.carouselTitle, { color: isDarkMode ? colors.white : colors.black }]}>
        Recent Searches
      </Text>
      {searches.map((search, index) => (
        <TouchableOpacity
          key={index}
          style={styles.recentSearchItem}
          onPress={() => onSearchSelect(search)}
        >
          <MaterialIcons
            name="history"
            size={20}
            color={isDarkMode ? colors.lightGray : colors.mediumGray}
            style={styles.recentSearchIcon}
          />
          <Text style={[
            styles.recentSearchText,
            { color: isDarkMode ? colors.white : colors.black }
          ]}>
            {search}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  recentSearchesContainer: {
    paddingHorizontal: 0,
    paddingBottom: 16,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  recentSearchIcon: {
    marginRight: 12,
  },
  recentSearchText: {
    fontSize: 16,
    flex: 1,
  },
});

export default RecentSearches; 