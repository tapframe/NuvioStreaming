import { StyleSheet, Dimensions, Platform } from 'react-native';
import { colors } from './colors';

const { width, height } = Dimensions.get('window');
export const POSTER_WIDTH = (width - 50) / 3;

export const homeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingMainContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  emptyCatalog: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: colors.elevation1,
    margin: 16,
    borderRadius: 16,
  },
  addCatalogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    marginTop: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  addCatalogButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default homeStyles; 