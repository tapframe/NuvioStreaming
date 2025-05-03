import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  Layout,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';

interface CastSectionProps {
  cast: any[];
  loadingCast: boolean;
  onSelectCastMember: (castMember: any) => void;
}

export const CastSection: React.FC<CastSectionProps> = ({
  cast,
  loadingCast,
  onSelectCastMember,
}) => {
  const { currentTheme } = useTheme();

  if (loadingCast) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={currentTheme.colors.primary} />
      </View>
    );
  }

  if (!cast || cast.length === 0) {
    return null;
  }

  return (
    <Animated.View 
      style={styles.castSection}
      entering={FadeIn.duration(500).delay(300)}
      layout={Layout}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>Cast</Text>
      </View>
      <FlatList
        horizontal
        data={cast}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.castList}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item, index }) => (
          <Animated.View 
            entering={FadeIn.duration(500).delay(100 + index * 50)} 
            layout={Layout}
          >
            <TouchableOpacity 
              style={styles.castCard}
              onPress={() => onSelectCastMember(item)}
              activeOpacity={0.7}
            >
              <View style={styles.castImageContainer}>
                {item.profile_path ? (
                  <Image
                    source={{
                      uri: `https://image.tmdb.org/t/p/w185${item.profile_path}`,
                    }}
                    style={styles.castImage}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.castImagePlaceholder, { backgroundColor: currentTheme.colors.cardBackground }]}>
                    <Text style={[styles.placeholderText, { color: currentTheme.colors.textMuted }]}>
                      {item.name.split(' ').reduce((prev: string, current: string) => prev + current[0], '').substring(0, 2)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.castName, { color: currentTheme.colors.text }]} numberOfLines={1}>{item.name}</Text>
              {item.character && (
                <Text style={[styles.characterName, { color: currentTheme.colors.textMuted }]} numberOfLines={1}>{item.character}</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  castSection: {
    marginBottom: 24,
    paddingHorizontal: 0,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  castList: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  castCard: {
    marginRight: 16,
    width: 90,
    alignItems: 'center',
  },
  castImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginBottom: 8,
  },
  castImage: {
    width: '100%',
    height: '100%',
  },
  castImagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: '600',
  },
  castName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    width: 90,
  },
  characterName: {
    fontSize: 12,
    textAlign: 'center',
    width: 90,
    marginTop: 2,
  },
}); 