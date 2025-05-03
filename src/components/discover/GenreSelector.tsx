import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface GenreSelectorProps {
  genres: string[];
  selectedGenre: string;
  onSelectGenre: (genre: string) => void;
}

const GenreSelector = ({ 
  genres, 
  selectedGenre, 
  onSelectGenre 
}: GenreSelectorProps) => {
  const { currentTheme } = useTheme();
  
  const renderGenreButton = useCallback((genre: string) => {
    const isSelected = selectedGenre === genre;
    
    return (
      <TouchableOpacity
        key={genre}
        style={[
          styles.genreButton,
          isSelected && { backgroundColor: currentTheme.colors.primary }
        ]}
        onPress={() => onSelectGenre(genre)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.genreText,
            isSelected && { color: currentTheme.colors.white, fontWeight: '600' }
          ]}
        >
          {genre}
        </Text>
      </TouchableOpacity>
    );
  }, [selectedGenre, onSelectGenre, currentTheme]);

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollViewContent}
        decelerationRate="fast"
        snapToInterval={10}
      >
        {genres.map(renderGenreButton)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  scrollViewContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  genreButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  genreText: {
    color: '#9e9e9e', // Default medium gray
    fontWeight: '500',
    fontSize: 14,
  },
});

export default React.memo(GenreSelector); 