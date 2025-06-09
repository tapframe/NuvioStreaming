import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import {
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
  useAnimatedScrollHandler,
  runOnUI,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Highly optimized animation configurations
const fastSpring = {
  damping: 15,
  mass: 0.8,
  stiffness: 150,
};

const ultraFastSpring = {
  damping: 12,
  mass: 0.6,
  stiffness: 200,
};

// Ultra-optimized easing functions
const easings = {
  fast: Easing.out(Easing.quad),
  ultraFast: Easing.out(Easing.linear),
  natural: Easing.bezier(0.2, 0, 0.2, 1),
};

export const useMetadataAnimations = (safeAreaTop: number, watchProgress: any) => {
  // Consolidated entrance animations - fewer shared values
  const screenOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  
  // Combined hero animations 
  const heroOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.95); // Combined scale for micro-animation
  const heroHeightValue = useSharedValue(height * 0.5);
  
  // Combined UI element animations
  const uiElementsOpacity = useSharedValue(0);
  const uiElementsTranslateY = useSharedValue(10);
  
  // Progress animation - simplified to single value
  const progressOpacity = useSharedValue(0);
  
  // Scroll values - minimal
  const scrollY = useSharedValue(0);
  const headerProgress = useSharedValue(0); // Single value for all header animations
  
  // Static header elements Y for performance
  const staticHeaderElementsY = useSharedValue(0);
  
  // Ultra-fast entrance sequence - batch animations for better performance
  useEffect(() => {
    'worklet';
    
    // Batch all entrance animations to run simultaneously
    const enterAnimations = () => {
      screenOpacity.value = withTiming(1, { 
        duration: 250, 
        easing: easings.fast 
      });
      
      heroOpacity.value = withTiming(1, { 
        duration: 300, 
        easing: easings.fast 
      });
      
      heroScale.value = withSpring(1, ultraFastSpring);
      
      uiElementsOpacity.value = withTiming(1, { 
        duration: 400, 
        easing: easings.natural 
      });
      
      uiElementsTranslateY.value = withSpring(0, fastSpring);
      
      contentOpacity.value = withTiming(1, { 
        duration: 350, 
        easing: easings.fast 
      });
    };

    // Use runOnUI for better performance
    runOnUI(enterAnimations)();
  }, []);
  
  // Optimized watch progress animation
  useEffect(() => {
    'worklet';
    
    const hasProgress = watchProgress && watchProgress.duration > 0;
    
    progressOpacity.value = withTiming(hasProgress ? 1 : 0, {
      duration: hasProgress ? 200 : 150,
      easing: easings.fast
    });
  }, [watchProgress]);
  
  // Ultra-optimized scroll handler with minimal calculations
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      
      const rawScrollY = event.contentOffset.y;
      scrollY.value = rawScrollY;

      // Single calculation for header threshold
      const threshold = height * 0.4 - safeAreaTop;
      const progress = rawScrollY > threshold ? 1 : 0;
      
      // Use single progress value for all header animations
      if (headerProgress.value !== progress) {
        headerProgress.value = withTiming(progress, { 
          duration: progress ? 200 : 150, 
          easing: easings.ultraFast 
        });
      }
    },
  });

  return {
    // Optimized shared values - reduced count
    screenOpacity,
    contentOpacity,
    heroOpacity,
    heroScale,
    uiElementsOpacity,
    uiElementsTranslateY,
    progressOpacity,
    scrollY,
    headerProgress,
    
    // Computed values for compatibility (derived from optimized values)
    get heroHeight() { return heroHeightValue; },
    get logoOpacity() { return uiElementsOpacity; },
    get buttonsOpacity() { return uiElementsOpacity; },
    get buttonsTranslateY() { return uiElementsTranslateY; },
    get contentTranslateY() { return uiElementsTranslateY; },
    get watchProgressOpacity() { return progressOpacity; },
    get watchProgressWidth() { return progressOpacity; }, // Reuse for width animation
    get headerOpacity() { return headerProgress; },
    get headerElementsY() { 
      return staticHeaderElementsY; // Use pre-created shared value
    },
    get headerElementsOpacity() { return headerProgress; },
    
    // Functions
    scrollHandler,
    animateLogo: () => {}, // Simplified - no separate logo animation
  };
}; 