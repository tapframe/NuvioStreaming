import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import {
  useSharedValue,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  Easing,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Refined animation configurations
const springConfig = {
  damping: 25,
  mass: 0.8,
  stiffness: 120,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

const microSpringConfig = {
  damping: 20,
  mass: 0.5,
  stiffness: 150,
  overshootClamping: true,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
};

// Sophisticated easing curves
const easings = {
  // Smooth entrance with slight overshoot
  entrance: Easing.bezier(0.34, 1.56, 0.64, 1),
  // Gentle bounce for micro-interactions
  microBounce: Easing.bezier(0.68, -0.55, 0.265, 1.55),
  // Smooth exit
  exit: Easing.bezier(0.25, 0.46, 0.45, 0.94),
  // Natural movement
  natural: Easing.bezier(0.25, 0.1, 0.25, 1),
  // Subtle emphasis
  emphasis: Easing.bezier(0.19, 1, 0.22, 1),
};

// Refined timing constants for orchestrated entrance
const TIMING = {
  // Quick initial setup
  SCREEN_PREP: 50,
  // Staggered content appearance
  HERO_BASE: 150,
  LOGO: 280,
  PROGRESS: 380,
  GENRES: 450,
  BUTTONS: 520,
  CONTENT: 650,
  // Micro-delays for polish
  MICRO_DELAY: 50,
};

export const useMetadataAnimations = (safeAreaTop: number, watchProgress: any) => {
  // Enhanced screen entrance with micro-animations
  const screenScale = useSharedValue(0.96);
  const screenOpacity = useSharedValue(0);
  const screenBlur = useSharedValue(5);
  
  // Refined hero section animations
  const heroHeight = useSharedValue(height * 0.5);
  const heroScale = useSharedValue(1.08);
  const heroOpacity = useSharedValue(0);
  const heroRotate = useSharedValue(-0.5);
  
  // Enhanced content animations
  const contentTranslateY = useSharedValue(40);
  const contentScale = useSharedValue(0.98);
  
  // Sophisticated logo animations
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.85);
  const logoRotate = useSharedValue(2);
  
  // Enhanced progress animations
  const watchProgressOpacity = useSharedValue(0);
  const watchProgressScaleY = useSharedValue(0);
  const watchProgressWidth = useSharedValue(0);
  
  // Refined genre animations
  const genresOpacity = useSharedValue(0);
  const genresTranslateY = useSharedValue(15);
  const genresScale = useSharedValue(0.95);
  
  // Enhanced button animations
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(20);
  const buttonsScale = useSharedValue(0.95);
  
  // Scroll values with enhanced parallax
  const scrollY = useSharedValue(0);
  const dampedScrollY = useSharedValue(0);
  const velocityY = useSharedValue(0);
  
  // Sophisticated header animations
  const headerOpacity = useSharedValue(0);
  const headerElementsY = useSharedValue(-15);
  const headerElementsOpacity = useSharedValue(0);
  const headerBlur = useSharedValue(10);

  // Orchestrated entrance animation sequence
  useEffect(() => {
    const startAnimation = setTimeout(() => {
      // Phase 1: Screen preparation with subtle bounce
      screenScale.value = withSequence(
        withTiming(1.02, { duration: 200, easing: easings.entrance }),
        withTiming(1, { duration: 150, easing: easings.natural })
      );
      screenOpacity.value = withTiming(1, { 
        duration: 300, 
        easing: easings.emphasis 
      });
      screenBlur.value = withTiming(0, { 
        duration: 400, 
        easing: easings.natural 
      });
      
      // Phase 2: Hero section with parallax feel
      setTimeout(() => {
        heroOpacity.value = withSequence(
          withTiming(0.8, { duration: 200, easing: easings.entrance }),
          withTiming(1, { duration: 100, easing: easings.natural })
        );
        heroScale.value = withSequence(
          withTiming(1.02, { duration: 300, easing: easings.entrance }),
          withTiming(1, { duration: 200, easing: easings.natural })
        );
        heroRotate.value = withTiming(0, { 
          duration: 500, 
          easing: easings.emphasis 
        });
      }, TIMING.HERO_BASE);
      
      // Phase 3: Logo with micro-bounce
      setTimeout(() => {
        logoOpacity.value = withTiming(1, { 
          duration: 300, 
          easing: easings.entrance 
        });
        logoScale.value = withSequence(
          withTiming(1.05, { duration: 150, easing: easings.microBounce }),
          withTiming(1, { duration: 100, easing: easings.natural })
        );
        logoRotate.value = withTiming(0, { 
          duration: 300, 
          easing: easings.emphasis 
        });
      }, TIMING.LOGO);
      
      // Phase 4: Progress bar with width animation
      setTimeout(() => {
        if (watchProgress && watchProgress.duration > 0) {
          watchProgressOpacity.value = withTiming(1, { 
            duration: 250, 
            easing: easings.entrance 
          });
          watchProgressScaleY.value = withSpring(1, microSpringConfig);
          watchProgressWidth.value = withDelay(
            100,
            withTiming(1, { duration: 600, easing: easings.emphasis })
          );
        }
      }, TIMING.PROGRESS);
      
      // Phase 5: Genres with staggered scale
      setTimeout(() => {
        genresOpacity.value = withTiming(1, { 
          duration: 250, 
          easing: easings.entrance 
        });
        genresTranslateY.value = withSpring(0, microSpringConfig);
        genresScale.value = withSequence(
          withTiming(1.02, { duration: 150, easing: easings.microBounce }),
          withTiming(1, { duration: 100, easing: easings.natural })
        );
      }, TIMING.GENRES);
      
      // Phase 6: Buttons with sophisticated bounce
      setTimeout(() => {
        buttonsOpacity.value = withTiming(1, { 
          duration: 300, 
          easing: easings.entrance 
        });
        buttonsTranslateY.value = withSpring(0, springConfig);
        buttonsScale.value = withSequence(
          withTiming(1.03, { duration: 200, easing: easings.microBounce }),
          withTiming(1, { duration: 150, easing: easings.natural })
        );
      }, TIMING.BUTTONS);
      
      // Phase 7: Content with layered entrance
      setTimeout(() => {
        contentTranslateY.value = withSpring(0, {
          ...springConfig,
          damping: 30,
          stiffness: 100,
        });
        contentScale.value = withSequence(
          withTiming(1.01, { duration: 200, easing: easings.entrance }),
          withTiming(1, { duration: 150, easing: easings.natural })
        );
      }, TIMING.CONTENT);
    }, TIMING.SCREEN_PREP);
    
    return () => clearTimeout(startAnimation);
  }, []);
  
  // Enhanced watch progress animation with width effect
  useEffect(() => {
    if (watchProgress && watchProgress.duration > 0) {
      watchProgressOpacity.value = withTiming(1, {
        duration: 300,
        easing: easings.entrance
      });
      watchProgressScaleY.value = withSpring(1, microSpringConfig);
      watchProgressWidth.value = withDelay(
        150,
        withTiming(1, { duration: 800, easing: easings.emphasis })
      );
    } else {
      watchProgressOpacity.value = withTiming(0, {
        duration: 200,
        easing: easings.exit
      });
      watchProgressScaleY.value = withTiming(0, {
        duration: 200,
        easing: easings.exit
      });
      watchProgressWidth.value = withTiming(0, {
        duration: 150,
        easing: easings.exit
      });
    }
  }, [watchProgress, watchProgressOpacity, watchProgressScaleY, watchProgressWidth]);
  
  // Enhanced logo animation with micro-interactions
  const animateLogo = (hasLogo: boolean) => {
    if (hasLogo) {
      logoOpacity.value = withTiming(1, {
        duration: 400,
        easing: easings.entrance
      });
      logoScale.value = withSequence(
        withTiming(1.05, { duration: 200, easing: easings.microBounce }),
        withTiming(1, { duration: 150, easing: easings.natural })
      );
    } else {
      logoOpacity.value = withTiming(0, {
        duration: 250,
        easing: easings.exit
      });
      logoScale.value = withTiming(0.9, {
        duration: 250,
        easing: easings.exit
      });
    }
  };
  
  // Enhanced scroll handler with velocity tracking
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const rawScrollY = event.contentOffset.y;
      const lastScrollY = scrollY.value;
      
      scrollY.value = rawScrollY;
      velocityY.value = rawScrollY - lastScrollY;
      
      // Enhanced damped scroll with velocity-based easing
      const dynamicDuration = Math.min(400, Math.max(200, Math.abs(velocityY.value) * 10));
      dampedScrollY.value = withTiming(rawScrollY, {
        duration: dynamicDuration,
        easing: easings.natural,
      });

      // Sophisticated header animation with blur effect
      const headerThreshold = height * 0.5 - safeAreaTop - 60;
      const progress = Math.min(1, Math.max(0, (rawScrollY - headerThreshold + 50) / 100));
      
      if (rawScrollY > headerThreshold) {
        headerOpacity.value = withTiming(1, { 
          duration: 300, 
          easing: easings.entrance 
        });
        headerElementsY.value = withSpring(0, microSpringConfig);
        headerElementsOpacity.value = withTiming(1, { 
          duration: 400, 
          easing: easings.emphasis 
        });
        headerBlur.value = withTiming(0, { 
          duration: 300, 
          easing: easings.natural 
        });
      } else {
        headerOpacity.value = withTiming(0, { 
          duration: 200, 
          easing: easings.exit 
        });
        headerElementsY.value = withTiming(-15, { 
          duration: 200, 
          easing: easings.exit 
        });
        headerElementsOpacity.value = withTiming(0, { 
          duration: 150, 
          easing: easings.exit 
        });
        headerBlur.value = withTiming(5, { 
          duration: 200, 
          easing: easings.natural 
        });
      }
    },
  });

  return {
    // Enhanced animated values
    screenScale,
    screenOpacity,
    screenBlur,
    heroHeight,
    heroScale,
    heroOpacity,
    heroRotate,
    contentTranslateY,
    contentScale,
    logoOpacity,
    logoScale,
    logoRotate,
    watchProgressOpacity,
    watchProgressScaleY,
    watchProgressWidth,
    genresOpacity,
    genresTranslateY,
    genresScale,
    buttonsOpacity,
    buttonsTranslateY,
    buttonsScale,
    scrollY,
    dampedScrollY,
    velocityY,
    headerOpacity,
    headerElementsY,
    headerElementsOpacity,
    headerBlur,
    
    // Functions
    scrollHandler,
    animateLogo,
  };
}; 