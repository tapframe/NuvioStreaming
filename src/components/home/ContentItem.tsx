import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions, Platform, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { catalogService, StreamingContent } from '../../services/catalogService';
import { DropUpMenu } from './DropUpMenu';

interface ContentItemProps {
  item: StreamingContent;
  onPress: (id: string, type: string) => void;
}

const { width } = Dimensions.get('window');

// Dynamic poster calculation based on screen width - show 1/4 of next poster
const calculatePosterLayout = (screenWidth: number) => {
  const MIN_POSTER_WIDTH = 100; // Reduced minimum for more posters
  const MAX_POSTER_WIDTH = 130; // Reduced maximum for more posters
  const LEFT_PADDING = 16; // Left padding
  const SPACING = 8; // Space between posters
  
  // Calculate available width for posters (reserve space for left padding)
  const availableWidth = screenWidth - LEFT_PADDING;
  
  // Try different numbers of full posters to find the best fit
  let bestLayout = { numFullPosters: 3, posterWidth: 120 };
  
  for (let n = 3; n <= 6; n++) {
    // Calculate poster width needed for N full posters + 0.25 partial poster
    // Formula: N * posterWidth + (N-1) * spacing + 0.25 * posterWidth = availableWidth - rightPadding
    // Simplified: posterWidth * (N + 0.25) + (N-1) * spacing = availableWidth - rightPadding
    // We'll use minimal right padding (8px) to maximize space
    const usableWidth = availableWidth - 8;
    const posterWidth = (usableWidth - (n - 1) * SPACING) / (n + 0.25);
    
    if (posterWidth >= MIN_POSTER_WIDTH && posterWidth <= MAX_POSTER_WIDTH) {
      bestLayout = { numFullPosters: n, posterWidth };
    }
  }
  
  return {
    numFullPosters: bestLayout.numFullPosters,
    posterWidth: bestLayout.posterWidth,
    spacing: SPACING,
    partialPosterWidth: bestLayout.posterWidth * 0.25 // 1/4 of next poster
  };
};

const posterLayout = calculatePosterLayout(width);
const POSTER_WIDTH = posterLayout.posterWidth;

const ContentItem = React.memo(({ item, onPress }: ContentItemProps) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const { currentTheme } = useTheme();

  const handleLongPress = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handlePress = useCallback(() => {
    onPress(item.id, item.type);
  }, [item.id, item.type, onPress]);

  const handleOptionSelect = useCallback((option: string) => {
    switch (option) {
      case 'library':
        if (item.inLibrary) {
          catalogService.removeFromLibrary(item.type, item.id);
        } else {
          catalogService.addToLibrary(item);
        }
        break;
      case 'watched':
        setIsWatched(prev => !prev);
        break;
      case 'playlist':
        break;
      case 'share':
        break;
    }
  }, [item]);

  const handleMenuClose = useCallback(() => {
    setMenuVisible(false);
  }, []);

  return (
    <>
      <View style={styles.itemContainer}>
        <TouchableOpacity
          style={styles.contentItem}
          activeOpacity={0.7}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={300}
        >
          <View style={styles.contentItemContainer}>
            <ExpoImage
              source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
              style={styles.poster}
              contentFit="cover"
              cachePolicy="memory"
              transition={200}
              placeholder={{ uri: 'https://via.placeholder.com/300x450' }}
              placeholderContentFit="cover"
              recyclingKey={item.id}
            />
            {isWatched && (
              <View style={styles.watchedIndicator}>
                <MaterialIcons name="check-circle" size={22} color={currentTheme.colors.success} />
              </View>
            )}
            {item.inLibrary && (
              <View style={styles.libraryBadge}>
                <MaterialIcons name="bookmark" size={16} color={currentTheme.colors.white} />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={[styles.title, { color: currentTheme.colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>
      </View>
      
      <DropUpMenu
        visible={menuVisible}
        onClose={handleMenuClose}
        item={item}
        onOptionSelect={handleOptionSelect}
      />
    </>
  );
});

const styles = StyleSheet.create({
  itemContainer: {
    width: POSTER_WIDTH,
  },
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    margin: 0,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },
  contentItemContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 12,
    padding: 2,
  },
  libraryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 8,
    padding: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'SpaceMono-Regular',
  }
});

export default ContentItem; 