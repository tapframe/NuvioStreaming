import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../index';

const useDiscoverStyles = () => {
  const { width } = Dimensions.get('window');
  
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.darkBackground,
    },
    headerBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.darkBackground,
      zIndex: 1,
    },
    contentContainer: {
      flex: 1,
      backgroundColor: colors.darkBackground,
    },
    header: {
      paddingHorizontal: 20,
      justifyContent: 'flex-end',
      paddingBottom: 8,
      backgroundColor: 'transparent',
      zIndex: 2,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.white,
      letterSpacing: 0.3,
    },
    searchButton: {
      padding: 10,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyText: {
      color: colors.mediumGray,
      fontSize: 16,
      textAlign: 'center',
      paddingHorizontal: 32,
    },
  });
};

export default useDiscoverStyles; 