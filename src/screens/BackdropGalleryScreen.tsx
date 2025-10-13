import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMDBService } from '../services/tmdbService';

const { width } = Dimensions.get('window');
const BACKDROP_WIDTH = width * 0.9;
const BACKDROP_HEIGHT = (BACKDROP_WIDTH * 9) / 16; // 16:9 aspect ratio

const SELECTED_BACKDROP_KEY = 'selected_custom_backdrop';

interface BackdropItem {
  file_path: string;
  width: number;
  height: number;
  aspect_ratio: number;
}

interface RouteParams {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
}

const BackdropGalleryScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { tmdbId, type, title } = route.params as RouteParams;

  const [backdrops, setBackdrops] = useState<BackdropItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBackdrop, setSelectedBackdrop] = useState<BackdropItem | null>(null);

  useEffect(() => {
    const fetchBackdrops = async () => {
      try {
        setLoading(true);
        const tmdbService = TMDBService.getInstance();

        let images;
        if (type === 'movie') {
          images = await tmdbService.getMovieImagesFull(tmdbId);
        } else {
          images = await tmdbService.getTvShowImagesFull(tmdbId);
        }

        if (__DEV__) {
          console.log('[BackdropGallery] TMDB response:', {
            tmdbId,
            type,
            hasImages: !!images,
            backdropsCount: images?.backdrops?.length || 0,
            images
          });
        }

        if (images && images.backdrops && images.backdrops.length > 0) {
          setBackdrops(images.backdrops);
        } else {
          setError('No backdrops found');
        }
      } catch (err) {
        setError('Failed to load backdrops');
        console.error('Backdrop fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (tmdbId) {
      fetchBackdrops();
    }
  }, [tmdbId, type]);

  // Load selected backdrop from storage
  useEffect(() => {
    const loadSelectedBackdrop = async () => {
      try {
        const saved = await AsyncStorage.getItem(SELECTED_BACKDROP_KEY);
        if (saved) {
          const backdrop = JSON.parse(saved);
          setSelectedBackdrop(backdrop);
        }
      } catch (error) {
        console.error('Failed to load selected backdrop:', error);
      }
    };

    loadSelectedBackdrop();
  }, []);

  const saveSelectedBackdrop = async (backdrop: BackdropItem) => {
    try {
      await AsyncStorage.setItem(SELECTED_BACKDROP_KEY, JSON.stringify(backdrop));
      setSelectedBackdrop(backdrop);
      Alert.alert('Success', 'Custom backdrop set successfully!');
    } catch (error) {
      console.error('Failed to save selected backdrop:', error);
      Alert.alert('Error', 'Failed to save backdrop');
    }
  };

  const resetSelectedBackdrop = async () => {
    try {
      await AsyncStorage.removeItem(SELECTED_BACKDROP_KEY);
      setSelectedBackdrop(null);
      Alert.alert('Success', 'Custom backdrop reset to default!');
    } catch (error) {
      console.error('Failed to reset selected backdrop:', error);
      Alert.alert('Error', 'Failed to reset backdrop');
    }
  };

  const renderBackdrop = ({ item, index }: { item: BackdropItem; index: number }) => {
    const imageUrl = `https://image.tmdb.org/t/p/w1280${item.file_path}`;
    const isSelected = selectedBackdrop?.file_path === item.file_path;

    return (
      <TouchableOpacity
        style={styles.backdropContainer}
        onLongPress={() => {
          Alert.alert(
            'Set as Default Backdrop',
            'Use this backdrop for metadata screens and player loading?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Set as Default', onPress: () => saveSelectedBackdrop(item) }
            ]
          );
        }}
        delayLongPress={500}
      >
        <FastImage
          source={{ uri: imageUrl }}
          style={styles.backdropImage}
          resizeMode={FastImage.resizeMode.cover}
        />
        {isSelected && (
          <View style={styles.selectedIndicator}>
            <MaterialIcons name="check-circle" size={24} color="#fff" />
          </View>
        )}
        <View style={styles.backdropInfo}>
          <Text style={styles.backdropResolution}>
            {item.width} × {item.height}
          </Text>
          <Text style={styles.backdropAspect}>
            {item.aspect_ratio.toFixed(2)}:1
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <MaterialIcons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle}>
          {backdrops.length} Backdrop{backdrops.length !== 1 ? 's' : ''}
        </Text>
      </View>
      {selectedBackdrop && (
        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => {
            Alert.alert(
              'Reset Backdrop',
              'Remove custom backdrop and use default?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: resetSelectedBackdrop }
              ]
            );
          }}
        >
          <MaterialIcons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading backdrops...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || backdrops.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        {renderHeader()}
        <View style={styles.errorContainer}>
          <MaterialIcons name="image-not-supported" size={64} color="rgba(255,255,255,0.5)" />
          <Text style={styles.errorText}>
            {error || 'No backdrops available'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      {renderHeader()}

      {/* Explanatory note */}
      <View style={styles.noteContainer}>
        <Text style={styles.noteText}>
          Long press any backdrop to set it as your default for metadata screens and player loading overlay.
        </Text>
      </View>

      <FlatList
        data={backdrops}
        keyExtractor={(item, index) => `${item.file_path}-${index}`}
        renderItem={renderBackdrop}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  listContainer: {
    padding: 16,
  },
  backdropContainer: {
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  backdropImage: {
    width: BACKDROP_WIDTH,
    height: BACKDROP_HEIGHT,
    alignSelf: 'center',
  },
  backdropInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  backdropResolution: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  backdropAspect: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 123, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  resetButton: {
    padding: 8,
    marginLeft: 12,
  },
  noteContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  noteText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
});

export default BackdropGalleryScreen;
