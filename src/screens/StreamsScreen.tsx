/**
 * StreamsScreen - Re-exports from refactored module
 * 
 * The screen has been refactored into separate manageable files:
 * - ./streams/StreamsScreen.tsx - Main component
 * - ./streams/useStreamsScreen.ts - Custom hook with all logic
 * - ./streams/types.ts - TypeScript types
 * - ./streams/constants.ts - Constants and config
 * - ./streams/utils.ts - Utility functions
 * - ./streams/styles.ts - StyleSheet definitions
 * - ./streams/components/ - Sub-components (EpisodeHero, MovieHero, StreamsList, MobileStreamsLayout)
 */

export { StreamsScreen, default } from './streams';
