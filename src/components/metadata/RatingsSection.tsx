import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, Animated } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
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
  const { currentTheme } = useTheme();

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
  if (!isMDBEnabled) return null;
  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="small" color={currentTheme.colors.primary} /></View>;
  if (error || !ratings || Object.keys(ratings).length === 0) return null;

  // Define the order and icons/colors for the ratings
  const ratingConfig = {
    imdb: {
      icon: require('../../../assets/rating-icons/imdb.png'),
      isImage: true,
      color: '#F5C518',
      transform: (value: number) => value.toFixed(1)
    },
    tmdb: {
      icon: TMDBIcon,
      isImage: false,
      color: '#01B4E4',
      transform: (value: number) => value.toFixed(0)
    },
    trakt: {
      icon: TraktIcon,
      isImage: false,
      color: '#ED1C24',
      transform: (value: number) => value.toFixed(0)
    },
    letterboxd: {
      icon: LetterboxdIcon,
      isImage: false,
      color: '#00E054',
      transform: (value: number) => value.toFixed(1)
    },
    tomatoes: {
      icon: RottenTomatoesIcon,
      isImage: false,
      color: '#FA320A',
      transform: (value: number) => Math.round(value).toString() + '%'
    },
    audience: {
      icon: AudienceScoreIcon,
      isImage: true,
      color: '#FA320A',
      transform: (value: number) => Math.round(value).toString() + '%'
    },
    metacritic: {
      icon: MetacriticIcon,
      isImage: true,
      color: '#FFCC33',
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
      <View style={styles.compactRatingsContainer}>
        {displayRatings.map(([source, value]) => {
          const config = ratingConfig[source as keyof typeof ratingConfig];
          const displayValue = config.transform(parseFloat(value as string));
          
          return (
            <View key={source} style={styles.compactRatingItem}>
              {config.isImage ? (
                <Image 
                  source={config.icon as any}
                  style={styles.compactRatingIcon}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.compactSvgContainer}>
                  {React.createElement(config.icon as any, {
                    width: 16,
                    height: 16,
                  })}
                </View>
              )}
              <Text style={[styles.compactRatingValue, { color: config.color }]}>
                {displayValue}
              </Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactRatingsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  compactRatingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  compactRatingIcon: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  compactSvgContainer: {
    marginRight: 4,
  },
  compactRatingValue: {
    fontSize: 14,
    fontWeight: '600',
  },
}); 