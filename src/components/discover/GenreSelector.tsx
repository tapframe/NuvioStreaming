import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../styles';

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
  
  const renderGenreButton = useCallback((genre: string) => {
    const isSelected = selectedGenre === genre;
    
    return (
      <TouchableOpacity
        key={genre}
        style={[
          styles.genreButton,
          isSelected && styles.selectedGenreButton
        ]}
        onPress={() => onSelectGenre(genre)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.genreText,
            isSelected && styles.selectedGenreText
          ]}
        >
          {genre}
        </Text>
      </TouchableOpacity>
    );
  }, [selectedGenre, onSelectGenre]);

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
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  selectedGenreButton: {
    backgroundColor: colors.primary,
  },
  genreText: {
    color: colors.mediumGray,
    fontWeight: '500',
    fontSize: 14,
  },
  selectedGenreText: {
    color: colors.white,
    fontWeight: '600',
  },
});

export default React.memo(GenreSelector); 