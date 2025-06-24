import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { StreamingContent } from '../../services/catalogService';

interface ContentItemProps {
  item: StreamingContent;
  onPress: () => void;
  width?: number;
}

const ContentItem = ({ item, onPress, width }: ContentItemProps) => {
  const { width: screenWidth } = Dimensions.get('window');
  const { currentTheme } = useTheme();
  const itemWidth = width || (screenWidth - 48) / 2.2; // Default to 2 items per row with spacing
  
  return (
    <TouchableOpacity
      style={[styles.container, { width: itemWidth }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.posterContainer, { shadowColor: currentTheme.colors.black }]}>
        <Image
          source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
          style={styles.poster}
          contentFit="cover"
          cachePolicy="memory"
          transition={200}
          placeholder={{ uri: 'https://via.placeholder.com/300x450' }}
          placeholderContentFit="cover"
          recyclingKey={item.id}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.gradient}
        >
          <Text style={[styles.title, { color: currentTheme.colors.white }]} numberOfLines={2}>
            {item.name}
          </Text>
          {item.year && (
            <Text style={styles.year}>{item.year}</Text>
          )}
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 0,
  },
  posterContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  poster: {
    aspectRatio: 2/3,
    width: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    justifyContent: 'flex-end',
    height: '45%',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.3,
  },
  year: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default React.memo(ContentItem); 