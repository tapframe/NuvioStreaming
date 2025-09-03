import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ViewStyle, TextStyle, ImageStyle, FlatList, StyleProp } from 'react-native';
import Animated, { FadeIn, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { StreamingContent } from '../../services/catalogService';
import { useTheme } from '../../contexts/ThemeContext';

interface HeroCarouselProps {
  items: StreamingContent[];
}

const { width } = Dimensions.get('window');

const CARD_WIDTH = Math.min(width * 0.88, 520);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 9 / 16) + 160; // increased extra space for text/actions

const HeroCarousel: React.FC<HeroCarouselProps> = ({ items }) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();

  const data = useMemo(() => (items && items.length ? items.slice(0, 10) : []), [items]);

  if (data.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn.duration(350).easing(Easing.out(Easing.cubic))}>
      <View style={styles.container as ViewStyle}>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + 16}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: (width - CARD_WIDTH) / 2 }}
          renderItem={({ item }) => (
            <View style={{ width: CARD_WIDTH + 16 }}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('Metadata', { id: item.id, type: item.type })}
              >
                <View style={[styles.card, { backgroundColor: currentTheme.colors.elevation1 }] as StyleProp<ViewStyle>}>
                  <View style={styles.bannerContainer as ViewStyle}>
                    <ExpoImage
                      source={{ uri: item.banner || item.poster }}
                      style={styles.banner as ImageStyle}
                      contentFit="cover"
                      transition={300}
                      cachePolicy="memory-disk"
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.7)"]}
                      locations={[0.55, 1]}
                      style={styles.bannerGradient as ViewStyle}
                    />
                  </View>
                  <View style={styles.info as ViewStyle}>
                    <Text style={[styles.title as TextStyle, { color: currentTheme.colors.highEmphasis }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.genres && (
                      <Text style={[styles.genres as TextStyle, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={1}>
                        {item.genres.slice(0, 3).join(' • ')}
                      </Text>
                    )}
                    <View style={styles.actions as ViewStyle}>
                      <TouchableOpacity
                        style={[styles.playButton as ViewStyle, { backgroundColor: currentTheme.colors.white }]}
                        onPress={() => navigation.navigate('Streams', { id: item.id, type: item.type })}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons name="play-arrow" size={22} color={currentTheme.colors.black} />
                        <Text style={[styles.playText as TextStyle, { color: currentTheme.colors.black }]}>Play</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.secondaryButton as ViewStyle, { borderColor: 'rgba(255,255,255,0.25)' }]}
                        onPress={() => navigation.navigate('Metadata', { id: item.id, type: item.type })}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="info-outline" size={18} color={currentTheme.colors.white} />
                        <Text style={[styles.secondaryText as TextStyle, { color: currentTheme.colors.white }]}>Info</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  bannerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  banner: {
    width: '100%',
    height: '100%',
  },
  bannerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  genres: {
    marginTop: 2,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  playText: {
    fontWeight: '700',
    marginLeft: 6,
    fontSize: 14,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
  },
  secondaryText: {
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 14,
  },
});

export default React.memo(HeroCarousel);


