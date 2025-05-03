import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../styles';

interface SearchBarProps {
  query: string;
  onChangeQuery: (text: string) => void;
  onClear: () => void;
  autoFocus?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  query, 
  onChangeQuery, 
  onClear, 
  autoFocus = true 
}) => {
  return (
    <View style={[
      styles.searchBar, 
      { 
        backgroundColor: colors.darkGray,
        borderColor: 'transparent',
      }
    ]}>
      <MaterialIcons 
        name="search" 
        size={24} 
        color={colors.lightGray}
        style={styles.searchIcon}
      />
      <TextInput
        style={[
          styles.searchInput,
          { color: colors.white }
        ]}
        placeholder="Search movies, shows..."
        placeholderTextColor={colors.lightGray}
        value={query}
        onChangeText={onChangeQuery}
        returnKeyType="search"
        keyboardAppearance="dark"
        autoFocus={autoFocus}
      />
      {query.length > 0 && (
        <TouchableOpacity 
          onPress={onClear} 
          style={styles.clearButton}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <MaterialIcons 
            name="close" 
            size={20} 
            color={colors.lightGray}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  clearButton: {
    padding: 4,
  },
});

export default SearchBar; 