import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  FadeInDown,
  FadeInUp,
  useAnimatedScrollHandler,
  runOnJS,
  interpolateColor,
  interpolate,
  Extrapolation,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { mmkvStorage } from '../services/mmkvStorage';

const { width, height } = Dimensions.get('window');

// Animation configuration
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 1,
};

const SLIDE_TIMING = {
  duration: 400,
};

// Animated Button Component
const AnimatedButton = ({
  onPress,
  backgroundColor,
  text,
  icon,
}: {
  onPress: () => void;
  backgroundColor: string;
  text: string;
  icon: string;
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View
        style={[
          styles.button,
          styles.nextButton,
          { backgroundColor },
          animatedStyle,
        ]}
      >
        <Text style={[styles.buttonText, { color: 'white' }]}>{text}</Text>
        <MaterialIcons
          name={icon as any}
          size={20}
          color="white"
          style={styles.buttonIcon}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

// Slide Content Component with animations
const SlideContent = ({ item, isActive }: { item: OnboardingSlide; isActive: boolean }) => {
  // Premium icon animations: scale, floating, rotation, and glow
  const iconScale = useSharedValue(isActive ? 1 : 0.8);
  const iconOpacity = useSharedValue(isActive ? 1 : 0);
  const iconTranslateY = useSharedValue(isActive ? 0 : 20);
  const iconRotation = useSharedValue(0);
  const glowIntensity = useSharedValue(isActive ? 1 : 0);
  
  React.useEffect(() => {
    if (isActive) {
      iconScale.value = withSpring(1.1, SPRING_CONFIG);
      iconOpacity.value = withTiming(1, SLIDE_TIMING);
      iconTranslateY.value = withSpring(0, SPRING_CONFIG);
      iconRotation.value = withSpring(0, SPRING_CONFIG);
      glowIntensity.value = withSpring(1, SPRING_CONFIG);
    } else {
      iconScale.value = 0.8;
      iconOpacity.value = 0;
      iconTranslateY.value = 20;
      iconRotation.value = -15;
      glowIntensity.value = 0;
    }
  }, [isActive]);

  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: iconScale.value },
        { translateY: iconTranslateY.value },
        { rotate: `${iconRotation.value}deg` },
      ],
      opacity: iconOpacity.value,
    };
  });

  // Premium floating animation for active icon
  const floatAnim = useSharedValue(0);
  React.useEffect(() => {
    if (isActive) {
      floatAnim.value = withRepeat(
        withSequence(
          withTiming(10, { duration: 2500 }),
          withTiming(-10, { duration: 2500 })
        ),
        -1,
        true
      );
    } else {
      floatAnim.value = 0;
    }
  }, [isActive]);

  const floatingIconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatAnim.value }],
  }));

  // Glow animation with pulse effect
  const pulseAnim = useSharedValue(1);
  React.useEffect(() => {
    if (isActive) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 2000 }),
          withTiming(1.1, { duration: 2000 })
        ),
        -1,
        true
      );
    }
  }, [isActive]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowIntensity.value * 0.5,
    transform: [{ scale: pulseAnim.value * 1.2 + iconScale.value * 0.3 }],
  }));
  
  return (
    <View style={styles.slide}>
      {/* Premium glow effect */}
      <Animated.View 
        style={[
          styles.glowContainer,
          animatedGlowStyle,
        ]}
      >
        <LinearGradient
          colors={item.gradient}
          style={styles.glowCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      <LinearGradient
        colors={item.gradient}
        style={styles.iconContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View style={[styles.iconWrapper, animatedIconStyle, floatingIconStyle]}>
          <MaterialIcons 
            name={item.icon} 
            size={95} 
            color="white" 
          />
        </Animated.View>
      </LinearGradient>

      <Animated.View
        entering={FadeInUp.delay(300).duration(600)}
        style={styles.textContainer}
      >
        <Animated.Text 
          entering={FadeInUp.delay(400).duration(500)}
          style={[styles.title, { color: 'white' }]}
        >
          {item.title}
        </Animated.Text>
        <Animated.Text 
          entering={FadeInUp.delay(500).duration(500)}
          style={[styles.subtitle, { color: 'rgba(255,255,255,0.9)' }]}
        >
          {item.subtitle}
        </Animated.Text>
        <Animated.Text 
          entering={FadeInUp.delay(600).duration(500)}
          style={[styles.description, { color: 'rgba(255,255,255,0.85)' }]}
        >
          {item.description}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

interface OnboardingSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  gradient: [string, string];
}

const onboardingData: OnboardingSlide[] = [
  {
    id: '1',
    title: 'Welcome to Nuvio',
    subtitle: 'Your Ultimate Content Hub',
    description: 'Discover, organize, and manage your favorite movies and TV shows from multiple sources in one beautiful app.',
    icon: 'play-circle-filled',
    gradient: ['#667eea', '#764ba2'],
  },
  {
    id: '2',
    title: 'Powerful Addons',
    subtitle: 'Extend Your Experience',
    description: 'Install addons to access content from various platforms and services. Choose what works best for you.',
    icon: 'extension',
    gradient: ['#f093fb', '#f5576c'],
  },
  {
    id: '3',
    title: 'Smart Discovery',
    subtitle: 'Find What You Love',
    description: 'Browse trending content, search across all your sources, and get personalized recommendations.',
    icon: 'explore',
    gradient: ['#4facfe', '#00f2fe'],
  },
  {
    id: '4',
    title: 'Your Library',
    subtitle: 'Track & Organize',
    description: 'Save favorites, track your progress, and sync with Trakt to keep everything organized across devices.',
    icon: 'library-books',
    gradient: ['#43e97b', '#38f9d7'],
  },
];

const OnboardingScreen = () => {
  const { currentTheme } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const progressValue = useSharedValue(0);
  const scrollX = useSharedValue(0);
  const currentSlide = onboardingData[currentIndex];

  // Update progress when index changes
  React.useEffect(() => {
    progressValue.value = withSpring(
      (currentIndex + 1) / onboardingData.length,
      SPRING_CONFIG
    );
  }, [currentIndex]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%`,
  }));

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      progressValue.value = (nextIndex + 1) / onboardingData.length;
    } else {
      handleGetStarted();
    }
  };

  const handleSkip = () => {
    // Skip login: proceed to app and show a one-time hint toast
    (async () => {
      try {
        await mmkvStorage.setItem('hasCompletedOnboarding', 'true');
        await mmkvStorage.setItem('showLoginHintToastOnce', 'true');
      } catch {}
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    })();
  };

  const handleGetStarted = async () => {
    try {
      await mmkvStorage.setItem('hasCompletedOnboarding', 'true');
      // After onboarding, go directly to main app
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (error) {
      if (__DEV__) console.error('Error saving onboarding status:', error);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    }
  };

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => {
    const isActive = index === currentIndex;
    
    return (
      <SlideContent 
        item={item} 
        isActive={isActive} 
      />
    );
  };

  const renderPaginationDot = (index: number) => {
    const scale = useSharedValue(index === currentIndex ? 1 : 0.8);
    const opacity = useSharedValue(index === currentIndex ? 1 : 0.4);
    
    React.useEffect(() => {
      scale.value = withSpring(
        index === currentIndex ? 1.3 : 0.8,
        SPRING_CONFIG
      );
      opacity.value = withTiming(
        index === currentIndex ? 1 : 0.4,
        SLIDE_TIMING
      );
    }, [currentIndex, index]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    }));

    return (
      <Animated.View
        key={index}
        style={[
          styles.paginationDot,
          {
            backgroundColor: index === currentIndex 
              ? currentTheme.colors.primary 
              : currentTheme.colors.elevation2,
          },
          animatedStyle,
        ]}
      />
    );
  };

  const renderPagination = () => (
    <View style={styles.pagination}>
      {onboardingData.map((_, index) => renderPaginationDot(index))}
    </View>
  );

  // Background slide styles
  const getBackgroundSlideStyle = (index: number) => {
    'worklet';
    return useAnimatedStyle(() => {
      const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
      const slideOpacity = interpolate(
        scrollX.value,
        inputRange,
        [0, 1, 0],
        Extrapolation.CLAMP
      );
      
      return { opacity: slideOpacity };
    });
  };

  return (
    <View style={styles.container}>
      {/* Animated gradient background that transitions between slides */}
      <Animated.View style={StyleSheet.absoluteFill}>
        {onboardingData.map((slide, index) => (
          <Animated.View 
            key={`bg-${index}`} 
            style={[StyleSheet.absoluteFill, getBackgroundSlideStyle(index)]}
          >
            <LinearGradient
              colors={slide.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
          </Animated.View>
        ))}
      </Animated.View>
      
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Content container with status bar padding */}
      <View style={styles.fullScreenContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: currentTheme.colors.mediumEmphasis }]}>
              Skip
            </Text>
          </TouchableOpacity>

          {/* Progress Bar */}
          <View style={[styles.progressContainer, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Animated.View
              style={[
                styles.progressBar,
                { backgroundColor: currentTheme.colors.primary },
                animatedProgressStyle
              ]}
            />
          </View>
        </View>

        {/* Content */}
        <Animated.FlatList
          ref={flatListRef}
          data={onboardingData}
          renderItem={renderSlide}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => {
            const slideIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentIndex(slideIndex);
          }}
          style={{ flex: 1 }}
        />

        {/* Footer */}
        <View style={styles.footer}>
          {renderPagination()}

          <View style={styles.buttonContainer}>
            <AnimatedButton
              onPress={handleNext}
              backgroundColor={currentTheme.colors.primary}
              text={currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
              icon={currentIndex === onboardingData.length - 1 ? 'check' : 'arrow-forward'}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  skipButton: {
    padding: 10,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '500',
  },
  progressContainer: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  slide: {
    width,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  fullScreenContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 24,
  },
  glowContainer: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    top: '35%',
  },
  glowCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
    opacity: 0.4,
  },
  iconContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 15,
    },
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 20,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  paginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 6,
  },
  buttonContainer: {
    alignItems: 'center',
  },
  button: {
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  nextButton: {},
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    marginLeft: 8,
  },
});

export default OnboardingScreen; 