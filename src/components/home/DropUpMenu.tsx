import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  useColorScheme,
  Dimensions,
  Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import FastImage from '@d11/react-native-fast-image';
import { useTraktContext } from '../../contexts/TraktContext';
import { colors } from '../../styles/colors';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  interpolate,
  Extrapolate,
  runOnJS,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { StreamingContent } from '../../services/catalogService';

interface DropUpMenuProps {
  visible: boolean;
  onClose: () => void;
  item: StreamingContent;
  onOptionSelect: (option: string) => void;
  isSaved?: boolean; // allow parent to pass saved status directly
  isWatched?: boolean; // allow parent to pass watched status directly
}

export const DropUpMenu = ({ visible, onClose, item, onOptionSelect, isSaved: isSavedProp, isWatched: isWatchedProp }: DropUpMenuProps) => {
  const translateY = useSharedValue(300);
  const opacity = useSharedValue(0);
  const isDarkMode = useColorScheme() === 'dark';
  const SNAP_THRESHOLD = 100;

  // Trakt integration
  const { isAuthenticated, isInWatchlist, isInCollection } = useTraktContext();

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 300 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(300, { duration: 300 });
    }
  }, [visible]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      // Store initial position if needed
    })
    .onUpdate((event) => {
      if (event.translationY > 0) { // Only allow dragging downwards
        translateY.value = event.translationY;
        opacity.value = interpolate(
          event.translationY,
          [0, 300],
          [1, 0],
          Extrapolate.CLAMP
        );
      }
    })
    .onEnd((event) => {
      if (event.translationY > SNAP_THRESHOLD || event.velocityY > 500) {
        translateY.value = withTiming(300, { duration: 300 });
        opacity.value = withTiming(0, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 300 });
        opacity.value = withTiming(1, { duration: 200 });
      }
    });

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  }));

  // Robustly determine if the item is in the library (saved)
  const isSaved = typeof isSavedProp === 'boolean' ? isSavedProp : !!item.inLibrary;
  const isWatched = !!isWatchedProp;
  const inTraktWatchlist = isAuthenticated && isInWatchlist(item.id, item.type as 'movie' | 'show');
  const inTraktCollection = isAuthenticated && isInCollection(item.id, item.type as 'movie' | 'show');
  
  let menuOptions = [
    {
      icon: 'bookmark',
      label: isSaved ? 'Remove from Library' : 'Add to Library',
      action: 'library'
    },
    {
      icon: 'check-circle',
      label: isWatched ? 'Mark as Unwatched' : 'Mark as Watched',
      action: 'watched'
    },
    /*
    {
      icon: 'playlist-add',
      label: 'Add to Playlist',
      action: 'playlist'
    },
    */
    {
      icon: 'share',
      label: 'Share',
      action: 'share'
    }
  ];

  // Add Trakt options if authenticated
  if (isAuthenticated) {
    menuOptions.push(
      {
        icon: 'playlist-add-check',
        label: inTraktWatchlist ? 'Remove from Trakt Watchlist' : 'Add to Trakt Watchlist',
        action: 'trakt-watchlist'
      },
      {
        icon: 'video-library',
        label: inTraktCollection ? 'Remove from Trakt Collection' : 'Add to Trakt Collection',
        action: 'trakt-collection'
      }
    );
  }

  // If used in LibraryScreen, only show 'Remove from Library' if item is in library
  if (isSavedProp === true) {
    menuOptions = menuOptions.filter(opt => opt.action !== 'library' || isSaved);
  }

  const backgroundColor = isDarkMode ? '#1A1A1A' : '#FFFFFF';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, overlayStyle]}>
          <Pressable style={styles.modalOverlayPressable} onPress={onClose} />
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.menuContainer, menuStyle, { backgroundColor }]}>
              <View style={styles.dragHandle} />
              <View style={styles.menuHeader}>
                <FastImage
                  source={{ 
                    uri: item.poster,
                    priority: FastImage.priority.high,
                    cache: FastImage.cacheControl.immutable
                  }}
                  style={styles.menuPoster}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <View style={styles.menuTitleContainer}>
                  <Text style={[styles.menuTitle, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}>
                    {item.name}
                  </Text>
                  {item.year && (
                    <Text style={[styles.menuYear, { color: isDarkMode ? '#999999' : '#666666' }]}>
                      {item.year}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.menuOptions}>
                {menuOptions.map((option, index) => (
                  <TouchableOpacity
                    key={option.action}
                    style={[
                      styles.menuOption,
                      { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                      index === menuOptions.length - 1 && styles.lastMenuOption
                    ]}
                    onPress={() => {
                      onOptionSelect(option.action);
                      onClose();
                    }}
                  >
                    <MaterialIcons
                      name={option.icon as "bookmark" | "check-circle" | "playlist-add" | "share" | "bookmark-border"}
                      size={24}
                      color={colors.primary}
                    />
                    <Text style={[
                      styles.menuOptionText,
                      { color: isDarkMode ? '#FFFFFF' : '#000000' }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.transparentDark,
  },
  modalOverlayPressable: {
    flex: 1,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.transparentLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  menuContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.select({ ios: 40, android: 24 }),
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  menuHeader: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuPoster: {
    width: 60,
    height: 90,
    borderRadius: 12,
  },
  menuTitleContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuYear: {
    fontSize: 14,
  },
  menuOptions: {
    paddingTop: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastMenuOption: {
    borderBottomWidth: 0,
  },
  menuOptionText: {
    fontSize: 16,
    marginLeft: 16,
  },
});

export default DropUpMenu; 