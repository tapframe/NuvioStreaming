import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../styles/colors';

interface GenreTagsProps {
  genres: string[];
  maxToShow?: number;
}

const GenreTags = React.memo(({ genres, maxToShow = 4 }: GenreTagsProps) => {
  if (!genres || genres.length === 0) {
    return null;
  }

  const genresToDisplay = genres.slice(0, maxToShow);

  return (
    <>
      {genresToDisplay.map((genre, index, array) => (
        // Use React.Fragment to avoid extra View wrappers
        <React.Fragment key={index}>
          <Text style={styles.genreText}>{genre}</Text>
          {/* Add dot separator */}
          {index < array.length - 1 && (
            <Text style={styles.genreDot}>•</Text>
          )}
        </React.Fragment>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  genreText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  genreDot: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.6,
    marginHorizontal: 4,
  }
});

export default GenreTags; 