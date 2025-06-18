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
        contentContainerStyle={styles.catalogList}
        snapToInterval={POSTER_WIDTH + 12}
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        getItemLayout={(data, index) => ({
          length: POSTER_WIDTH + 12,
          offset: (POSTER_WIDTH + 12) * index,
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
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    width: 60,
    height: 3,
    borderRadius: 1.5,
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