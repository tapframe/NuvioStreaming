import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, StackActions } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent } from '../../types/metadata';
import { useTheme } from '../../contexts/ThemeContext';
import { TMDBService } from '../../services/tmdbService';
import { catalogService } from '../../services/catalogService';

const { width } = Dimensions.get('window');

// Dynamic poster calculation based on screen width for More Like This section
const calculatePosterLayout = (screenWidth: number) => {
  const MIN_POSTER_WIDTH = 100; // Slightly smaller for more items in this section
  const MAX_POSTER_WIDTH = 130; // Maximum poster width
  const HORIZONTAL_PADDING = 48; // Total horizontal padding/margins
  
  // Calculate how many posters can fit (aim for slightly more items than main sections)
  const availableWidth = screenWidth - HORIZONTAL_PADDING;
  const maxColumns = Math.floor(availableWidth / MIN_POSTER_WIDTH);
  
  // Limit to reasonable number of columns (3-7 for this section)
  const numColumns = Math.min(Math.max(maxColumns, 3), 7);
  
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
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

interface MoreLikeThisSectionProps {
  recommendations: StreamingContent[];
  loadingRecommendations: boolean;
}

export const MoreLikeThisSection: React.FC<MoreLikeThisSectionProps> = ({ 
  recommendations, 
  loadingRecommendations 
}) => {
  const { currentTheme } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handleItemPress = async (item: StreamingContent) => {
    try {
      // Extract TMDB ID from the tmdb:123456 format
      const tmdbId = item.id.replace('tmdb:', '');
      
      // Get Stremio ID directly using catalogService
      // The catalogService.getStremioId method already handles the conversion internally
      const stremioId = await catalogService.getStremioId(item.type, tmdbId);
      
      if (stremioId) {
        navigation.dispatch(
          StackActions.push('Metadata', { 
            id: stremioId, 
            type: item.type 
          })
        );
      } else {
        throw new Error('Could not find Stremio ID');
      }
    } catch (error) {
      console.error('Error navigating to recommendation:', error);
      Alert.alert(
        'Error',
        'Unable to load this content. Please try again later.',
        [{ text: 'OK' }]
      );
    }
  };

  const renderItem = ({ item }: { item: StreamingContent }) => (
    <TouchableOpacity 
      style={styles.itemContainer}
      onPress={() => handleItemPress(item)}
    >
      <Image
        source={{ uri: item.poster }}
        style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1 }]}
        contentFit="cover"
        transition={200}
      />
      <Text style={[styles.title, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={2}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  if (loadingRecommendations) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={currentTheme.colors.primary} />
      </View>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return null; // Don't render anything if there are no recommendations
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>More Like This</Text>
      <FlatList
        data={recommendations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContentContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 16,
    paddingLeft: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingRight: 32, // Ensure last item has padding
  },
  itemContainer: {
    marginRight: 12,
    width: POSTER_WIDTH,
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  loadingContainer: {
    height: POSTER_HEIGHT + 40, // Approximate height to prevent layout shifts
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 