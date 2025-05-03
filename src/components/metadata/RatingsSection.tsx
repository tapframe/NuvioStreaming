import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, Animated } from 'react-native';
import { colors } from '../../styles/colors';
import { useMDBListRatings } from '../../hooks/useMDBListRatings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMDBListEnabled, RATING_PROVIDERS_STORAGE_KEY } from '../../screens/MDBListSettingsScreen';

// Import SVG icons
import LetterboxdIcon from '../../../assets/rating-icons/letterboxd.svg';
import MetacriticIcon from '../../../assets/rating-icons/Metacritic.png';
import RottenTomatoesIcon from '../../../assets/rating-icons/RottenTomatoes.svg';
import TMDBIcon from '../../../assets/rating-icons/tmdb.svg';
import TraktIcon from '../../../assets/rating-icons/trakt.svg';
import AudienceScoreIcon from '../../../assets/rating-icons/audienscore.png';

export const RATING_PROVIDERS = {
  imdb: {
    name: 'IMDb',
    color: '#F5C518',
  },
  tmdb: {
    name: 'TMDB',
    color: '#01B4E4',
  },
  trakt: {
    name: 'Trakt',
    color: '#ED1C24',
  },
  letterboxd: {
    name: 'Letterboxd',
    color: '#00E054',
  },
  tomatoes: {
    name: 'Rotten Tomatoes',
    color: '#FA320A',
  },
  audience: {
    name: 'Audience Score',
    color: '#FA320A',
  },
  metacritic: {
    name: 'Metacritic',
    color: '#FFCC33',
  }
} as const;

interface RatingsSectionProps {
  imdbId: string;
  type: 'movie' | 'show';
}

export const RatingsSection: React.FC<RatingsSectionProps> = ({ imdbId, type }) => {
  const { ratings, loading, error } = useMDBListRatings(imdbId, type);
  const [enabledProviders, setEnabledProviders] = useState<Record<string, boolean>>({});
  const [isMDBEnabled, setIsMDBEnabled] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProviderSettings();
    checkMDBListEnabled();
  }, []);

  const checkMDBListEnabled = async () => {
    try {
      const enabled = await isMDBListEnabled();
      setIsMDBEnabled(enabled);
    } catch (error) {
      setIsMDBEnabled(true); // Default to enabled
    }
  };

  const loadProviderSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem(RATING_PROVIDERS_STORAGE_KEY);
      if (savedSettings) {
        setEnabledProviders(JSON.parse(savedSettings));
      } else {
        // Default all providers to enabled
        const defaultSettings = Object.keys(RATING_PROVIDERS).reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setEnabledProviders(defaultSettings);
      }
    } catch (error) {
    }
  };

  useEffect(() => {
    return () => {
    };
  }, [imdbId, type]);

  useEffect(() => {
    if (error) {
    }
  }, [error]);

  useEffect(() => {
    if (ratings) {
    }
  }, [ratings]);

  useEffect(() => {
    if (ratings && Object.keys(ratings).length > 0) {
      // Start fade-in animation when ratings are loaded
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [ratings, fadeAnim]);

  // If MDBList is disabled, don't show anything
  if (!isMDBEnabled) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (error || !ratings || Object.keys(ratings).length === 0) {
    return null;
  }

  // Define the order and icons/colors for the ratings
  const ratingConfig = {
    imdb: {
      icon: require('../../../assets/rating-icons/imdb.png'),
      isImage: true,
      color: '#F5C518',
      prefix: '',
      suffix: '',
      transform: (value: number) => value.toFixed(1)
    },
    tmdb: {
      icon: TMDBIcon,
      isImage: false,
      color: '#01B4E4',
      prefix: '',
      suffix: '',
      transform: (value: number) => value.toFixed(0)
    },
    trakt: {
      icon: TraktIcon,
      isImage: false,
      color: '#ED1C24',
      prefix: '',
      suffix: '',
      transform: (value: number) => value.toFixed(0)
    },
    letterboxd: {
      icon: LetterboxdIcon,
      isImage: false,
      color: '#00E054',
      prefix: '',
      suffix: '',
      transform: (value: number) => value.toFixed(1)
    },
    tomatoes: {
      icon: RottenTomatoesIcon,
      isImage: false,
      color: '#FA320A',
      prefix: '',
      suffix: '%',
      transform: (value: number) => Math.round(value).toString()
    },
    audience: {
      icon: AudienceScoreIcon,
      isImage: true,
      color: '#FA320A',
      prefix: '',
      suffix: '%',
      transform: (value: number) => Math.round(value).toString()
    },
    metacritic: {
      icon: MetacriticIcon,
      isImage: true,
      color: '#FFCC33',
      prefix: '',
      suffix: '',
      transform: (value: number) => Math.round(value).toString()
    }
  };

  // Priority: IMDB, TMDB, Tomatoes, Metacritic 
  const priorityOrder = ['imdb', 'tmdb', 'tomatoes', 'metacritic', 'trakt', 'letterboxd', 'audience'];
  const displayRatings = priorityOrder
    .filter(source => 
      source in ratings && 
      ratings[source as keyof typeof ratings] !== undefined &&
      (enabledProviders[source] ?? true) // Show by default if setting not found
    )
    .map(source => [source, ratings[source as keyof typeof ratings]!]);

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{
            translateY: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          }],
        },
      ]}
    >
      {displayRatings.map(([source, value]) => {
        const config = ratingConfig[source as keyof typeof ratingConfig];
        const numericValue = typeof value === 'string' ? parseFloat(value) : value;
        const displayValue = config.transform(numericValue);
        
        // Get a short display name for the rating source
        const getSourceLabel = (src: string): string => {
          switch(src) {
            case 'imdb': return 'IMDb';
            case 'tmdb': return 'TMDB';
            case 'tomatoes': return 'RT';
            case 'audience': return 'Aud';
            case 'metacritic': return 'Meta';
            case 'letterboxd': return 'LBXD';
            case 'trakt': return 'Trakt';
            default: return src;
          }
        };
        
        return (
          <View key={source} style={styles.ratingItem}>
            {config.isImage ? (
              <Image 
                source={config.icon} 
                style={styles.ratingIcon} 
                resizeMode="contain"
              />
            ) : (
              <config.icon 
                width={16} 
                height={16} 
                style={styles.ratingIcon}
              />
            )}
            <Text style={[styles.ratingValue, {color: config.color}]}>
              {displayValue}{config.suffix}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
    gap: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    marginVertical: 16,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  ratingIcon: {
    width: 16,
    height: 16,
    marginRight: 3,
    alignSelf: 'center',
  },
  ratingValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  ratingLabel: {
    fontSize: 11,
    opacity: 0.9,
  },
}); 