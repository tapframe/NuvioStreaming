import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { catalogService, StreamingContent } from '../../services/catalogService';
import DropUpMenu from './DropUpMenu';

interface ContentItemProps {
  item: StreamingContent;
  onPress: (id: string, type: string) => void;
}

const { width } = Dimensions.get('window');

// Dynamic poster calculation based on screen width
const calculatePosterLayout = (screenWidth: number) => {
  const MIN_POSTER_WIDTH = 110; // Minimum poster width for readability
  const MAX_POSTER_WIDTH = 140; // Maximum poster width to prevent oversized posters
  const HORIZONTAL_PADDING = 50; // Total horizontal padding/margins
  
  // Calculate how many posters can fit
  const availableWidth = screenWidth - HORIZONTAL_PADDING;
  const maxColumns = Math.floor(availableWidth / MIN_POSTER_WIDTH);
  
  // Limit to reasonable number of columns (3-6)
  const numColumns = Math.min(Math.max(maxColumns, 3), 6);
  
  // Calculate actual poster width
  const posterWidth = Math.min(availableWidth / numColumns, MAX_POSTER_WIDTH);
  
  return {
    numColumns,
    posterWidth,
    spacing: 12 // Space between posters
  };
};

const posterLayout = calculatePosterLayout(width);
const POSTER_WIDTH = posterLayout.posterWidth;

const ContentItem = ({ item: initialItem, onPress }: ContentItemProps) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [localItem, setLocalItem] = useState(initialItem);
  const [isWatched, setIsWatched] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { currentTheme } = useTheme();

  const handleLongPress = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handlePress = useCallback(() => {
    onPress(localItem.id, localItem.type);
  }, [localItem.id, localItem.type, onPress]);

  const handleOptionSelect = useCallback((option: string) => {
    switch (option) {
      case 'library':
        if (localItem.inLibrary) {
          catalogService.removeFromLibrary(localItem.type, localItem.id);
        } else {
          catalogService.addToLibrary(localItem);
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
  }, [localItem]);

  const handleMenuClose = useCallback(() => {
    setMenuVisible(false);
  }, []);

  useEffect(() => {
    setLocalItem(initialItem);
  }, [initialItem]);

  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates((libraryItems) => {
      const isInLibrary = libraryItems.some(
        libraryItem => libraryItem.id === localItem.id && libraryItem.type === localItem.type
      );
      setLocalItem(prev => ({ ...prev, inLibrary: isInLibrary }));
    });

    return () => unsubscribe();
  }, [localItem.id, localItem.type]);

  return (
    <>
      <TouchableOpacity
        style={styles.contentItem}
        activeOpacity={0.7}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={300}
      >
        <View style={styles.contentItemContainer}>
          <ExpoImage
            source={{ uri: localItem.poster }}
            style={styles.poster}
            contentFit="cover"
            transition={300}
            cachePolicy="memory-disk"
            recyclingKey={`poster-${localItem.id}`}
            onLoadStart={() => {
              setImageLoaded(false);
              setImageError(false);
            }}
            onLoadEnd={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
          {(!imageLoaded || imageError) && (
            <View style={[styles.loadingOverlay, { backgroundColor: currentTheme.colors.elevation2 }]}>
              {!imageError ? (
                <ActivityIndicator color={currentTheme.colors.primary} size="small" />
              ) : (
                <MaterialIcons name="broken-image" size={24} color={currentTheme.colors.lightGray} />
              )}
            </View>
          )}
          {isWatched && (
            <View style={styles.watchedIndicator}>
              <MaterialIcons name="check-circle" size={22} color={currentTheme.colors.success} />
            </View>
          )}
          {localItem.inLibrary && (
            <View style={styles.libraryBadge}>
              <MaterialIcons name="bookmark" size={16} color={currentTheme.colors.white} />
            </View>
          )}
        </View>
      </TouchableOpacity>
      
      <DropUpMenu
        visible={menuVisible}
        onClose={handleMenuClose}
        item={localItem}
        onOptionSelect={handleOptionSelect}
      />
    </>
  );
};

const styles = StyleSheet.create({
  contentItem: {
    width: POSTER_WIDTH,
    aspectRatio: 2/3,
    margin: 0,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contentItemContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
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
});

export default ContentItem; 