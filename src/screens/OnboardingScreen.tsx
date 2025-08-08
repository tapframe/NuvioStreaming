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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useAccount } from '../contexts/AccountContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

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
  const { user } = useAccount();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const progressValue = useSharedValue(0);

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: withSpring(`${((currentIndex + 1) / onboardingData.length) * 100}%`),
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
        await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
        await AsyncStorage.setItem('showLoginHintToastOnce', 'true');
      } catch {}
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    })();
  };

  const handleGetStarted = async () => {
    try {
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      // After onboarding, route to login if no user; otherwise go to app
      if (!user) {
        navigation.reset({ index: 0, routes: [{ name: 'Account' }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      }
    } catch (error) {
      console.error('Error saving onboarding status:', error);
      navigation.reset({ index: 0, routes: [{ name: user ? 'MainTabs' : 'Account' }] });
    }
  };

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => {
    const isActive = index === currentIndex;
    
    return (
      <View style={styles.slide}>
        <LinearGradient
          colors={item.gradient}
          style={styles.iconContainer}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Animated.View
            entering={FadeInDown.delay(300).duration(800)}
            style={styles.iconWrapper}
          >
            <MaterialIcons 
              name={item.icon} 
              size={80} 
              color="white" 
            />
          </Animated.View>
        </LinearGradient>

        <Animated.View
          entering={FadeInUp.delay(500).duration(800)}
          style={styles.textContainer}
        >
          <Text style={[styles.title, { color: currentTheme.colors.highEmphasis }]}>
            {item.title}
          </Text>
          <Text style={[styles.subtitle, { color: currentTheme.colors.primary }]}>
            {item.subtitle}
          </Text>
          <Text style={[styles.description, { color: currentTheme.colors.mediumEmphasis }]}>
            {item.description}
          </Text>
        </Animated.View>
      </View>
    );
  };

  const renderPagination = () => (
    <View style={styles.pagination}>
      {onboardingData.map((_, index) => (
        <View
          key={index}
          style={[
            styles.paginationDot,
            {
              backgroundColor: index === currentIndex 
                ? currentTheme.colors.primary 
                : currentTheme.colors.elevation2,
              opacity: index === currentIndex ? 1 : 0.4,
            },
          ]}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" backgroundColor={currentTheme.colors.darkBackground} />
      
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
      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
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
          <TouchableOpacity
            style={[
              styles.button,
              styles.nextButton,
              { backgroundColor: currentTheme.colors.primary }
            ]}
            onPress={handleNext}
          >
            <Text style={[styles.buttonText, { color: 'white' }]}>
              {currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <MaterialIcons 
              name={currentIndex === onboardingData.length - 1 ? 'check' : 'arrow-forward'} 
              size={20} 
              color="white" 
              style={styles.buttonIcon}
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
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
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
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
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
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
  nextButton: {
    // Additional styles for next button can go here
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    marginLeft: 8,
  },
});

export default OnboardingScreen; 