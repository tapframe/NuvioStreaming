import { Dimensions } from 'react-native';

export interface PosterLayoutConfig {
  minPosterWidth: number;
  maxPosterWidth: number;
  horizontalPadding: number;
  minColumns: number;
  maxColumns: number;
  spacing: number;
}

export interface PosterLayout {
  numColumns: number;
  posterWidth: number;
  spacing: number;
}

// Default configuration for main home sections
export const DEFAULT_POSTER_CONFIG: PosterLayoutConfig = {
  minPosterWidth: 110,
  maxPosterWidth: 140,
  horizontalPadding: 50,
  minColumns: 3,
  maxColumns: 6,
  spacing: 12
};

// Configuration for More Like This section (smaller posters, more items)
export const MORE_LIKE_THIS_CONFIG: PosterLayoutConfig = {
  minPosterWidth: 100,
  maxPosterWidth: 130,
  horizontalPadding: 48,
  minColumns: 3,
  maxColumns: 7,
  spacing: 12
};

// Configuration for Continue Watching section (larger posters, fewer items)
export const CONTINUE_WATCHING_CONFIG: PosterLayoutConfig = {
  minPosterWidth: 120,
  maxPosterWidth: 160,
  horizontalPadding: 40,
  minColumns: 2,
  maxColumns: 5,
  spacing: 12
};

export const calculatePosterLayout = (
  screenWidth: number, 
  config: PosterLayoutConfig = DEFAULT_POSTER_CONFIG
): PosterLayout => {
  const {
    minPosterWidth,
    maxPosterWidth,
    horizontalPadding,
    minColumns,
    maxColumns,
    spacing
  } = config;
  
  // Calculate how many posters can fit
  const availableWidth = screenWidth - horizontalPadding;
  const maxColumnsBasedOnWidth = Math.floor(availableWidth / minPosterWidth);
  
  // Limit to reasonable number of columns
  const numColumns = Math.min(Math.max(maxColumnsBasedOnWidth, minColumns), maxColumns);
  
  // Calculate actual poster width
  const posterWidth = Math.min(availableWidth / numColumns, maxPosterWidth);
  
  return {
    numColumns,
    posterWidth,
    spacing
  };
};

// Helper function to get current screen dimensions
export const getCurrentPosterLayout = (config?: PosterLayoutConfig): PosterLayout => {
  const { width } = Dimensions.get('window');
  return calculatePosterLayout(width, config);
}; 