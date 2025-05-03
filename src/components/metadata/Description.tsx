import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { Layout, Easing } from 'react-native-reanimated';
import { colors } from '../../styles/colors';

interface DescriptionProps {
  description: string;
}

const Description = React.memo(({ description }: DescriptionProps) => {
  const [isFullDescriptionOpen, setIsFullDescriptionOpen] = useState(false);

  if (!description) {
    return null;
  }

  return (
    <Animated.View 
      style={styles.descriptionContainer}
      layout={Layout.duration(300).easing(Easing.inOut(Easing.ease))}
    >
      <TouchableOpacity 
        onPress={() => setIsFullDescriptionOpen(!isFullDescriptionOpen)}
        activeOpacity={0.7}
      >
        <Text style={styles.description} numberOfLines={isFullDescriptionOpen ? undefined : 3}>
          {description}
        </Text>
        <View style={styles.showMoreButton}>
          <Text style={styles.showMoreText}>
            {isFullDescriptionOpen ? 'Show Less' : 'Show More'}
          </Text>
          <MaterialIcons 
            name={isFullDescriptionOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
            size={18} 
            color={colors.textMuted} 
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  descriptionContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  description: {
    color: colors.mediumEmphasis,
    fontSize: 15,
    lineHeight: 24,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  showMoreText: {
    color: colors.textMuted,
    fontSize: 14,
    marginRight: 4,
  }
});

export default Description; 