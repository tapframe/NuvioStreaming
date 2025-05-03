import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../../styles/colors';

interface MetaInfoProps {
  year?: string | number;
  runtime?: string;
  certification?: string;
  imdbRating?: string | number;
}

const MetaInfo = React.memo(({
  year,
  runtime,
  certification,
  imdbRating
}: MetaInfoProps) => {
  return (
    <View style={styles.metaInfo}>
      {year && (
        <Text style={styles.metaText}>{year}</Text>
      )}
      {runtime && (
        <Text style={styles.metaText}>{runtime}</Text>
      )}
      {certification && (
        <Text style={styles.metaText}>{certification}</Text>
      )}
      {imdbRating && (
        <View style={styles.ratingContainer}>
          <Image 
            source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/575px-IMDB_Logo_2016.svg.png' }}
            style={styles.imdbLogo}
            contentFit="contain"
          />
          <Text style={styles.ratingText}>{imdbRating}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metaText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imdbLogo: {
    width: 35,
    height: 18,
    marginRight: 4,
  },
  ratingText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  }
});

export default MetaInfo; 