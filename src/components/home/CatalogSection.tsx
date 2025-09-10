import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CatalogContent, StreamingContent } from '../../services/catalogService';
import { useTheme } from '../../contexts/ThemeContext';
import ContentItem from './ContentItem';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RootStackParamList } from '../../navigation/AppNavigator';

interface CatalogSectionProps {
  catalog: CatalogContent;
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

const CatalogSection = ({ catalog }: CatalogSectionProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  // Simplified visibility tracking to reduce state updates and re-renders
  const [visibleIndexSet, setVisibleIndexSet] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
  const viewabilityConfig = useMemo(() => ({
    itemVisiblePercentThreshold: 15,
    minimumViewTime: 100,
  }), []);
  
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
    const next = new Set<number>();
    viewableItems.forEach(v => { if (typeof v.index === 'number') next.add(v.index); });
    // Only pre-warm immediate neighbors to reduce overhead
    const neighbors: number[] = [];
    next.forEach(i => {
      neighbors.push(i - 1, i + 1);
    });
    neighbors.forEach(i => { if (i >= 0) next.add(i); });
    setVisibleIndexSet(next);
  });

  const [minVisible, maxVisible] = useMemo(() => {
    if (visibleIndexSet.size === 0) return [0, 7];
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    visibleIndexSet.forEach(i => { if (i < min) min = i; if (i > max) max = i; });
    return [min, max];
  }, [visibleIndexSet]);

  const handleContentPress = useCallback((id: string, type: string) => {
    navigation.navigate('Metadata', { id, type, addonId: catalog.addon });
  }, [navigation, catalog.addon]);

  const renderContentItem = useCallback(({ item, index }: { item: StreamingContent, index: number }) => {
    // Simplify visibility logic to reduce re-renders
    const isVisible = visibleIndexSet.has(index) || index < 8;
    return (
      <ContentItem 
        item={item} 
        onPress={handleContentPress}
        shouldLoadImage={isVisible}
        deferMs={0}
      />
    );
  }, [handleContentPress, visibleIndexSet]);

  // Memoize the ItemSeparatorComponent to prevent re-creation
  const ItemSeparator = useCallback(() => <View style={{ width: 8 }} />, []);

  // Memoize the keyExtractor to prevent re-creation
  const keyExtractor = useCallback((item: StreamingContent) => `${item.id}-${item.type}`, []);

  return (
    <Animated.View style={styles.catalogContainer} entering={FadeIn.duration(350)}>
      <View style={styles.catalogHeader}>
        <View style={styles.titleContainer}>
          <Text style={[styles.catalogTitle, { color: currentTheme.colors.text }]} numberOfLines={1}>{catalog.name}</Text>
          <View style={[styles.titleUnderline, { backgroundColor: currentTheme.colors.primary }]} />
        </View>
        <TouchableOpacity
          onPress={() => 
            navigation.navigate('Catalog', {
              id: catalog.id,
              type: catalog.type,
              addonId: catalog.addon
            })
          }
          style={styles.viewAllButton}
        >
          <Text style={[styles.viewAllText, { color: currentTheme.colors.textMuted }]}>View All</Text>
          <MaterialIcons name="chevron-right" size={20} color={currentTheme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      
      <FlashList
        data={catalog.items}
        renderItem={renderContentItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={StyleSheet.flatten([styles.catalogList, { paddingRight: 16 - posterLayout.partialPosterWidth }])}
        ItemSeparatorComponent={ItemSeparator}
        onEndReachedThreshold={0.7}
        onEndReached={() => {}}
        scrollEventThrottle={64}
        viewabilityConfig={viewabilityConfig as any}
        onViewableItemsChanged={onViewableItemsChanged.current as any}
        removeClippedSubviews={true}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  catalogContainer: {
    marginBottom: 28,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  titleContainer: {
    position: 'relative',
    flex: 1,
    marginRight: 16,
  },
  catalogTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    width: 40,
    height: 3,
    borderRadius: 2,
    opacity: 0.8,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  catalogList: {
    paddingHorizontal: 16,
  },
});

export default React.memo(CatalogSection, (prevProps, nextProps) => {
  // Only re-render if the catalog data actually changes
  return (
    prevProps.catalog.addon === nextProps.catalog.addon &&
    prevProps.catalog.id === nextProps.catalog.id &&
    prevProps.catalog.name === nextProps.catalog.name &&
    prevProps.catalog.items.length === nextProps.catalog.items.length &&
    // Deep compare the first few items to detect changes
    prevProps.catalog.items.slice(0, 3).every((item, index) => 
      nextProps.catalog.items[index] && 
      item.id === nextProps.catalog.items[index].id &&
      item.poster === nextProps.catalog.items[index].poster
    )
  );
});