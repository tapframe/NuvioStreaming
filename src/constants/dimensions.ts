import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Hero section height - 85% of screen height (matching Apple TV style)
export const HERO_HEIGHT = height * 0.65;

// Screen dimensions
export const SCREEN_WIDTH = width;
export const SCREEN_HEIGHT = height;

// Tablet detection
export const IS_TABLET = width >= 768;
