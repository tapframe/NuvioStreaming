import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');
export const POSTER_WIDTH = (width - 50) / 3;
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