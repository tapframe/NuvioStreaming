import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type AgeRating = 
  | 'NC-17' 
  | 'TV-Y' 
  | 'TV-Y7' 
  | 'G' 
  | 'TV-G' 
  | 'PG' 
  | 'TV-PG' 
  | 'PG-13' 
  | 'TV-14' 
  | 'R' 
  | 'TV-MA';

interface AgeRatingBadgeProps {
  rating: AgeRating | string;
}

const AgeRatingBadge: React.FC<AgeRatingBadgeProps> = ({ rating }) => {
  if (!rating) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{rating}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#575757',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#E6E6E6',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});

export default AgeRatingBadge;
