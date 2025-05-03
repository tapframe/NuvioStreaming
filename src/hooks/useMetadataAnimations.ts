import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import {
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Animation constants
const springConfig = {
  damping: 20,
  mass: 1,
  stiffness: 100
};

// Animation timing constants for staggered appearance
const ANIMATION_DELAY_CONSTANTS = {
  HERO: 100,
  LOGO: 250,
  PROGRESS: 350,
  GENRES: 400,
  BUTTONS: 450,
  CONTENT: 500
};

export const useMetadataAnimations = (safeAreaTop: number, watchProgress: any) => {
  // Animation values for screen entrance
  const screenScale = useSharedValue(0.92);
  const screenOpacity = useSharedValue(0);
  
  // Animation values for hero section
  const heroHeight = useSharedValue(height * 0.5);
  const heroScale = useSharedValue(1.05);
  const heroOpacity = useSharedValue(0);

  // Animation values for content
  const contentTranslateY = useSharedValue(60);
  
  // Animation values for logo
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.9);
  
  // Animation values for progress
  const watchProgressOpacity = useSharedValue(0);
  const watchProgressScaleY = useSharedValue(0);
  
  // Animation values for genres
  const genresOpacity = useSharedValue(0);
  const genresTranslateY = useSharedValue(20);
  
  // Animation values for buttons
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(30);
  
  // Scroll values for parallax effect
  const scrollY = useSharedValue(0);
  const dampedScrollY = useSharedValue(0);
  
  // Header animation values
  const headerOpacity = useSharedValue(0);
  const headerElementsY = useSharedValue(-10);
  const headerElementsOpacity = useSharedValue(0);

  // Start entrance animation
  useEffect(() => {
    // Use a timeout to ensure the animations starts after the component is mounted
    const animationTimeout = setTimeout(() => {
      // 1. First animate the container
      screenScale.value = withSpring(1, springConfig);
      screenOpacity.value = withSpring(1, springConfig);
      
      // 2. Then animate the hero section with a slight delay
      setTimeout(() => {
        heroOpacity.value = withSpring(1, {
          damping: 14,
          stiffness: 80
        });
        heroScale.value = withSpring(1, {
          damping: 18,
          stiffness: 100
        });
      }, ANIMATION_DELAY_CONSTANTS.HERO);
      
      // 3. Then animate the logo
      setTimeout(() => {
        logoOpacity.value = withSpring(1, {
          damping: 12,
          stiffness: 100
        });
        logoScale.value = withSpring(1, {
          damping: 14,
          stiffness: 90
        });
      }, ANIMATION_DELAY_CONSTANTS.LOGO);
      
      // 4. Then animate the watch progress if applicable
      setTimeout(() => {
        if (watchProgress && watchProgress.duration > 0) {
          watchProgressOpacity.value = withSpring(1, {
            damping: 14,
            stiffness: 100
          });
          watchProgressScaleY.value = withSpring(1, {
            damping: 18,
            stiffness: 120
          });
        }
      }, ANIMATION_DELAY_CONSTANTS.PROGRESS);
      
      // 5. Then animate the genres
      setTimeout(() => {
        genresOpacity.value = withSpring(1, {
          damping: 14,
          stiffness: 100
        });
        genresTranslateY.value = withSpring(0, {
          damping: 18,
          stiffness: 120
        });
      }, ANIMATION_DELAY_CONSTANTS.GENRES);
      
      // 6. Then animate the buttons
      setTimeout(() => {
        buttonsOpacity.value = withSpring(1, {
          damping: 14,
          stiffness: 100
        });
        buttonsTranslateY.value = withSpring(0, {
          damping: 18,
          stiffness: 120
        });
      }, ANIMATION_DELAY_CONSTANTS.BUTTONS);
      
      // 7. Finally animate the content section
      setTimeout(() => {
        contentTranslateY.value = withSpring(0, {
          damping: 25,
          mass: 1,
          stiffness: 100
        });
      }, ANIMATION_DELAY_CONSTANTS.CONTENT);
    }, 50); // Small timeout to ensure component is fully mounted
    
    return () => clearTimeout(animationTimeout);
  }, []);
  
  // Effect to animate watch progress when it changes
  useEffect(() => {
    if (watchProgress && watchProgress.duration > 0) {
      watchProgressOpacity.value = withSpring(1, {
        mass: 0.2,
        stiffness: 100,
        damping: 14
      });
      watchProgressScaleY.value = withSpring(1, {
        mass: 0.3,
        stiffness: 120,
        damping: 18
      });
    } else {
      watchProgressOpacity.value = withSpring(0, {
        mass: 0.2,
        stiffness: 100,
        damping: 14
      });
      watchProgressScaleY.value = withSpring(0, {
        mass: 0.3,
        stiffness: 120,
        damping: 18
      });
    }
  }, [watchProgress, watchProgressOpacity, watchProgressScaleY]);
  
  // Effect to animate logo when it's available
  const animateLogo = (hasLogo: boolean) => {
    if (hasLogo) {
      logoOpacity.value = withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.ease)
      });
    } else {
      logoOpacity.value = withTiming(0, {
        duration: 200,
        easing: Easing.in(Easing.ease)
      });
    }
  };
  
  // Scroll handler
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const rawScrollY = event.contentOffset.y;
      scrollY.value = rawScrollY;
      
      // Apply spring-like damping for smoother transitions
      dampedScrollY.value = withTiming(rawScrollY, {
        duration: 300,
        easing: Easing.bezier(0.16, 1, 0.3, 1), // Custom spring-like curve
      });

      // Update header opacity based on scroll position
      const headerThreshold = height * 0.5 - safeAreaTop - 70; // Hero height - inset - buffer
      if (rawScrollY > headerThreshold) {
        headerOpacity.value = withTiming(1, { duration: 200 });
        headerElementsY.value = withTiming(0, { duration: 300 });
        headerElementsOpacity.value = withTiming(1, { duration: 450 });
      } else {
        headerOpacity.value = withTiming(0, { duration: 150 });
        headerElementsY.value = withTiming(-10, { duration: 200 });
        headerElementsOpacity.value = withTiming(0, { duration: 200 });
      }
    },
  });

  return {
    // Animated values
    screenScale,
    screenOpacity,
    heroHeight,
    heroScale,
    heroOpacity,
    contentTranslateY,
    logoOpacity,
    logoScale,
    watchProgressOpacity,
    watchProgressScaleY,
    genresOpacity,
    genresTranslateY,
    buttonsOpacity,
    buttonsTranslateY,
    scrollY,
    dampedScrollY,
    headerOpacity,
    headerElementsY,
    headerElementsOpacity,
    
    // Functions
    scrollHandler,
    animateLogo,
  };
}; 