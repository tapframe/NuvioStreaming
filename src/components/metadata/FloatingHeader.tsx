import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Dimensions,
} from 'react-native';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';

const { width } = Dimensions.get('window');

interface FloatingHeaderProps {
  metadata: any;
  logoLoadError: boolean;
  handleBack: () => void;
  handleToggleLibrary: () => void;
  inLibrary: boolean;
  headerOpacity: Animated.SharedValue<number>;
  headerElementsY: Animated.SharedValue<number>;
  headerElementsOpacity: Animated.SharedValue<number>;
  safeAreaTop: number;
  setLogoLoadError: (error: boolean) => void;
}

const FloatingHeader: React.FC<FloatingHeaderProps> = ({
  metadata,
  logoLoadError,
  handleBack,
  handleToggleLibrary,
  inLibrary,
  headerOpacity,
  headerElementsY,
  headerElementsOpacity,
  safeAreaTop,
  setLogoLoadError,
}) => {
  const { currentTheme } = useTheme();
  const [isHeaderInteractive, setIsHeaderInteractive] = React.useState(false);
  
  // Animated styles for the header
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [
      { translateY: interpolate(headerOpacity.value, [0, 1], [-20, 0], Extrapolate.CLAMP) }
    ]
  }));
  
  // Disable touches when header is transparent (Android can still register touches at opacity 0)
  useAnimatedReaction(
    () => headerOpacity.value,
    (opacity) => {
      const interactive = opacity > 0.05;
      runOnJS(setIsHeaderInteractive)(interactive);
    }
  );

  // Animated style for header elements
  const headerElementsStyle = useAnimatedStyle(() => ({
    opacity: headerElementsOpacity.value,
    transform: [{ translateY: headerElementsY.value }]
  }));
  
  return (
    <Animated.View style={[styles.floatingHeader, headerAnimatedStyle]} pointerEvents={isHeaderInteractive ? 'auto' : 'none'}>
      {Platform.OS === 'ios' ? (
        <ExpoBlurView
          intensity={50}
          tint="dark"
          style={[styles.blurContainer, { paddingTop: Math.max(safeAreaTop * 0.8, safeAreaTop - 6) }]}
        >
          <Animated.View style={[styles.floatingHeaderContent, headerElementsStyle]}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={handleBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons 
                name="arrow-back" 
                size={24} 
                color={currentTheme.colors.highEmphasis}
              />
            </TouchableOpacity>
            
            <View style={styles.headerTitleContainer}>
              {metadata.logo && !logoLoadError ? (
                <Image
                  source={{ uri: metadata.logo }}
                  style={styles.floatingHeaderLogo}
                  contentFit="contain"
                  transition={150}
                  onError={() => {
                    logger.warn(`[FloatingHeader] Logo failed to load: ${metadata.logo}`);
                    setLogoLoadError(true);
                  }}
                />
              ) : (
                <Text style={[styles.floatingHeaderTitle, { color: currentTheme.colors.highEmphasis }]} numberOfLines={1}>{metadata.name}</Text>
              )}
            </View>
            
            <TouchableOpacity 
              style={styles.headerActionButton}
              onPress={handleToggleLibrary}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons 
                name={inLibrary ? 'bookmark' : 'bookmark-border'} 
                size={22} 
                color={currentTheme.colors.highEmphasis}
              />
            </TouchableOpacity>
          </Animated.View>
        </ExpoBlurView>
      ) : (
        <View
          style={[
            styles.blurContainer,
            { paddingTop: Math.max(safeAreaTop * 0.8, safeAreaTop - 6), backgroundColor: currentTheme.colors.darkBackground }
          ]}
        >
          <Animated.View style={[styles.floatingHeaderContent, headerElementsStyle]}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={handleBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons 
                name="arrow-back" 
                size={24} 
                color={currentTheme.colors.highEmphasis}
              />
            </TouchableOpacity>
            
            <View style={styles.headerTitleContainer}>
              {metadata.logo && !logoLoadError ? (
                <Image
                  source={{ uri: metadata.logo }}
                  style={styles.floatingHeaderLogo}
                  contentFit="contain"
                  transition={150}
                  onError={() => {
                    logger.warn(`[FloatingHeader] Logo failed to load: ${metadata.logo}`);
                    setLogoLoadError(true);
                  }}
                />
              ) : (
                <Text style={[styles.floatingHeaderTitle, { color: currentTheme.colors.highEmphasis }]} numberOfLines={1}>{metadata.name}</Text>
              )}
            </View>
            
            <TouchableOpacity 
              style={styles.headerActionButton}
              onPress={handleToggleLibrary}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons 
                name={inLibrary ? 'bookmark' : 'bookmark-border'} 
                size={22} 
                color={currentTheme.colors.highEmphasis}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
      {Platform.OS === 'ios' && <View style={[styles.headerBottomBorder, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
    elevation: 4, // for Android shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  blurContainer: {
    width: '100%',
  },
  floatingHeaderContent: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerBottomBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 0.5,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  floatingHeaderLogo: {
    height: 42,
    width: width * 0.6,
    maxWidth: 240,
  },
  floatingHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default React.memo(FloatingHeader); 