import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { useNavigation, StackActions } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent } from '../../services/catalogService';
import { useTheme } from '../../contexts/ThemeContext';
import { TMDBService } from '../../services/tmdbService';
import { catalogService } from '../../services/catalogService';
import CustomAlert from '../../components/CustomAlert';

const { width } = Dimensions.get('window');

// Breakpoints for responsive sizing
const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  largeTablet: 1024,
  tv: 1440,
} as const;

interface CollectionSectionProps {
  collectionName: string;
  collectionMovies: StreamingContent[];
  loadingCollection: boolean;
}

export const CollectionSection: React.FC<CollectionSectionProps> = ({ 
  collectionName, 
  collectionMovies, 
  loadingCollection 
}) => {
  const { currentTheme } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // Determine device type
  const deviceWidth = Dimensions.get('window').width;
  const getDeviceType = React.useCallback(() => {
    if (deviceWidth >= BREAKPOINTS.tv) return 'tv';
    if (deviceWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
    if (deviceWidth >= BREAKPOINTS.tablet) return 'tablet';
    return 'phone';
  }, [deviceWidth]);
  const deviceType = getDeviceType();
  const isTablet = deviceType === 'tablet';
  const isLargeTablet = deviceType === 'largeTablet';
  const isTV = deviceType === 'tv';

  // Responsive spacing & sizes
  const horizontalPadding = React.useMemo(() => {
    switch (deviceType) {
      case 'tv': return 32;
      case 'largeTablet': return 28;
      case 'tablet': return 24;
      default: return 16;
    }
  }, [deviceType]);

  const itemSpacing = React.useMemo(() => {
    switch (deviceType) {
      case 'tv': return 14;
      case 'largeTablet': return 12;
      case 'tablet': return 12;
      default: return 12;
    }
  }, [deviceType]);

  const backdropWidth = React.useMemo(() => {
    switch (deviceType) {
      case 'tv': return 240;
      case 'largeTablet': return 220;
      case 'tablet': return 200;
      default: return 180;
    }
  }, [deviceType]);
  const backdropHeight = React.useMemo(() => backdropWidth * (9/16), [backdropWidth]); // 16:9 aspect ratio

  const [alertVisible, setAlertVisible] = React.useState(false);
  const [alertTitle, setAlertTitle] = React.useState('');
  const [alertMessage, setAlertMessage] = React.useState('');
  const [alertActions, setAlertActions] = React.useState<any[]>([]);

  const handleItemPress = async (item: StreamingContent) => {
    try {
      // Extract TMDB ID from the tmdb:123456 format
      const tmdbId = item.id.replace('tmdb:', '');
      
      // Get Stremio ID directly using catalogService
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
      if (__DEV__) console.error('Error navigating to collection item:', error);
      setAlertTitle('Error');
      setAlertMessage('Unable to load this content. Please try again later.');
      setAlertActions([{ label: 'OK', onPress: () => {} }]);
      setAlertVisible(true);
    }
  };

  // Sort collection movies by year (oldest to newest)
  const sortedCollectionMovies = React.useMemo(() => {
    if (!collectionMovies) return [];
    
    return [...collectionMovies].sort((a, b) => {
      const yearA = a.year ? parseInt(a.year.toString()) : 0;
      const yearB = b.year ? parseInt(b.year.toString()) : 0;
      return yearA - yearB; // Oldest to newest
    });
  }, [collectionMovies]);

  const renderItem = ({ item }: { item: StreamingContent }) => (
    <TouchableOpacity 
      style={[styles.itemContainer, { width: backdropWidth, marginRight: itemSpacing }]}
      onPress={() => handleItemPress(item)}
    >
      <FastImage
        source={{ uri: item.banner || item.poster }}
        style={[styles.backdrop, { 
          backgroundColor: currentTheme.colors.elevation1, 
          width: backdropWidth, 
          height: backdropHeight, 
          borderRadius: isTV ? 12 : isLargeTablet ? 10 : isTablet ? 10 : 8 
        }]}
        resizeMode={FastImage.resizeMode.cover}
      />
      <Text style={[styles.title, { 
        color: currentTheme.colors.mediumEmphasis, 
        fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 13 : 13, 
        lineHeight: isTV ? 20 : 18 
      }]} numberOfLines={2}>
        {item.name}
      </Text>
      {item.year && (
        <Text style={[styles.year, { 
          color: currentTheme.colors.textMuted, 
          fontSize: isTV ? 12 : isLargeTablet ? 11 : isTablet ? 11 : 11 
        }]}>
          {item.year}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (loadingCollection) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={currentTheme.colors.primary} />
      </View>
    );
  }

  if (!collectionMovies || collectionMovies.length === 0) {
    return null; // Don't render anything if there are no collection movies
  }

  return (
    <View style={[styles.container, { paddingLeft: 0 }] }>
      <Text style={[styles.sectionTitle, { 
        color: currentTheme.colors.highEmphasis, 
        fontSize: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20, 
        paddingHorizontal: horizontalPadding 
      }]}>
        {collectionName}
      </Text>
      <FlatList
        data={sortedCollectionMovies}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.listContentContainer, { 
          paddingHorizontal: horizontalPadding, 
          paddingRight: horizontalPadding + itemSpacing 
        }]}
      />
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        actions={alertActions}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 8,
  },
  listContentContainer: {
    paddingRight: 32, // Will be overridden responsively
  },
  itemContainer: {
    marginRight: 12, // will be overridden responsively
  },
  backdrop: {
    borderRadius: 8, // overridden responsively
    marginBottom: 8,
  },
  title: {
    fontSize: 13, // overridden responsively
    fontWeight: '500',
    lineHeight: 18, // overridden responsively
    marginBottom: 2,
  },
  year: {
    fontSize: 11, // overridden responsively
    fontWeight: '400',
    opacity: 0.8,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
});

export default CollectionSection;
