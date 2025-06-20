import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

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
export const POSTER_WIDTH = posterLayout.posterWidth;
export const POSTER_HEIGHT = POSTER_WIDTH * 1.5;
export const HORIZONTAL_PADDING = 16;

export const sharedStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllText: {
    fontSize: 14,
    marginRight: 4,
  },
});

export default {
  POSTER_WIDTH,
  POSTER_HEIGHT,
  HORIZONTAL_PADDING,
}; 