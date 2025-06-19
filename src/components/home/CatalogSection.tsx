import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, Dimensions } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CatalogContent, StreamingContent } from '../../services/catalogService';
import { useTheme } from '../../contexts/ThemeContext';
import ContentItem from './ContentItem';
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
    
    console.log(`[CatalogSection] Testing ${n} posters: width=${posterWidth.toFixed(1)}px, screen=${screenWidth}px`);
    
    if (posterWidth >= MIN_POSTER_WIDTH && posterWidth <= MAX_POSTER_WIDTH) {
      bestLayout = { numFullPosters: n, posterWidth };
      console.log(`[CatalogSection] Selected layout: ${n} full posters at ${posterWidth.toFixed(1)}px each`);
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

  const handleContentPress = (id: string, type: string) => {
    navigation.navigate('Metadata', { id, type });
  };

  const renderContentItem = ({ item, index }: { item: StreamingContent, index: number }) => {
    return (
      <Animated.View
        entering={FadeIn.duration(300).delay(100 + (index * 40))}
      >
        <ContentItem 
          item={item} 
          onPress={handleContentPress}
        />
      </Animated.View>
    );
  };

  return (
    <Animated.View 
      style={styles.catalogContainer}
      entering={FadeIn.duration(400).delay(50)}
    >
      <View style={styles.catalogHeader}>
        <View style={styles.titleContainer}>
          <Text style={[styles.catalogTitle, { color: currentTheme.colors.highEmphasis }]}>{catalog.name}</Text>
          <LinearGradient
            colors={[currentTheme.colors.primary, currentTheme.colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.titleUnderline}
          />
        </View>
        <TouchableOpacity
          onPress={() => 
            navigation.navigate('Catalog', {
              id: catalog.id,
              type: catalog.type,
              addonId: catalog.addon
            })
          }
          style={styles.seeAllButton}
        >
          <Text style={[styles.seeAllText, { color: currentTheme.colors.primary }]}>See More</Text>
          <MaterialIcons name="arrow-forward" color={currentTheme.colors.primary} size={16} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={catalog.items}
        renderItem={renderContentItem}
        keyExtractor={(item) => `${item.id}-${item.type}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.catalogList, { paddingRight: 16 - posterLayout.partialPosterWidth }]}
        snapToInterval={POSTER_WIDTH + 8}
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        getItemLayout={(data, index) => ({
          length: POSTER_WIDTH + 8,
          offset: (POSTER_WIDTH + 8) * index,
          index,
        })}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  catalogContainer: {
    marginBottom: 24,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  titleContainer: {
    position: 'relative',
  },
  catalogTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    width: 35,
    height: 2,
    borderRadius: 1,
    opacity: 0.8,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  catalogList: {
    paddingHorizontal: 16,
  },
});

export default CatalogSection; 