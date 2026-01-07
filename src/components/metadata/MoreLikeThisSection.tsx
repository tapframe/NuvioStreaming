import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import FastImage from '@d11/react-native-fast-image';
import { useNavigation, StackActions } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent } from '../../services/catalogService';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
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

interface MoreLikeThisSectionProps {
  recommendations: StreamingContent[];
  loadingRecommendations: boolean;
}

export const MoreLikeThisSection: React.FC<MoreLikeThisSectionProps> = ({
  recommendations,
  loadingRecommendations
}) => {
  const { t } = useTranslation();
  const { currentTheme } = useTheme();
  const { settings } = useSettings();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const borderRadius = settings.posterBorderRadius ?? 12;

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

  const posterWidth = React.useMemo(() => {
    switch (deviceType) {
      case 'tv': return 180;
      case 'largeTablet': return 160;
      case 'tablet': return 140;
      default: return 120;
    }
  }, [deviceType]);
  const posterHeight = React.useMemo(() => posterWidth * 1.5, [posterWidth]);

  const [alertVisible, setAlertVisible] = React.useState(false);
  const [alertTitle, setAlertTitle] = React.useState('');
  const [alertMessage, setAlertMessage] = React.useState('');
  const [alertActions, setAlertActions] = React.useState<any[]>([]);

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
      if (__DEV__) console.error('Error navigating to recommendation:', error);
      setAlertTitle(t('common.error'));
      setAlertMessage(t('metadata.something_went_wrong'));
      setAlertActions([{ label: t('common.ok'), onPress: () => { } }]);
      setAlertVisible(true);
    }
  };

  const renderItem = ({ item }: { item: StreamingContent }) => (
    <TouchableOpacity
      style={[styles.itemContainer, { width: posterWidth, marginRight: itemSpacing }]}
      onPress={() => handleItemPress(item)}
    >
      <FastImage
        source={{ uri: item.poster }}
        style={[styles.poster, { backgroundColor: currentTheme.colors.elevation1, width: posterWidth, height: posterHeight, borderRadius }]}
        resizeMode={FastImage.resizeMode.cover}
      />
      <Text style={[styles.title, { color: currentTheme.colors.mediumEmphasis, fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 13 : 13, lineHeight: isTV ? 20 : 18 }]} numberOfLines={2}>
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
    <View style={[styles.container, { paddingLeft: 0 }]}>
      <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis, fontSize: isTV ? 24 : isLargeTablet ? 22 : isTablet ? 20 : 20, paddingHorizontal: horizontalPadding }]}>{t('metadata.more_like_this')}</Text>
      <FlatList
        data={recommendations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.listContentContainer, { paddingHorizontal: horizontalPadding, paddingRight: horizontalPadding + itemSpacing }]}
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
  poster: {
    borderRadius: 12,
    marginBottom: 8,
    // Consistent border styling matching ContentItem
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    // Consistent shadow/elevation
    elevation: Platform.OS === 'android' ? 1 : 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  title: {
    fontSize: 13, // overridden responsively
    fontWeight: '500',
    lineHeight: 18, // overridden responsively
  },
  loadingContainer: {
    // Approximate height to prevent layout shifts; not used in responsive version
    justifyContent: 'center',
    alignItems: 'center',
  },
});