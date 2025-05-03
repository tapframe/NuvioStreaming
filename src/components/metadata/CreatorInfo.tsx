import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors } from '../../styles/colors';

interface CreatorInfoProps {
  directors?: string[];
  creators?: string[];
}

const CreatorInfo = React.memo(({ directors, creators }: CreatorInfoProps) => {
  const hasDirectors = directors && directors.length > 0;
  const hasCreators = creators && creators.length > 0;

  if (!hasDirectors && !hasCreators) {
    return null;
  }
  
  return (
    <Animated.View
      entering={FadeIn.duration(500).delay(200)}
      style={styles.creatorContainer}
    >
      {hasDirectors && (
        <View style={styles.creatorSection}>
          <Text style={styles.creatorLabel}>Director{directors.length > 1 ? 's' : ''}:</Text>
          <Text style={styles.creatorText}>{directors.join(', ')}</Text>
        </View>
      )}
      {hasCreators && (
        <View style={styles.creatorSection}>
          <Text style={styles.creatorLabel}>Creator{creators.length > 1 ? 's' : ''}:</Text>
          <Text style={styles.creatorText}>{creators.join(', ')}</Text>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  creatorContainer: {
    marginBottom: 2,
    paddingHorizontal: 16,
  },
  creatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    height: 20
  },
  creatorLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
    lineHeight: 20
  },
  creatorText: {
    color: colors.lightGray,
    fontSize: 14,
    flex: 1,
    lineHeight: 20
  }
});

export default CreatorInfo; 