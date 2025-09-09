import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import {
  useSharedValue,
  withTiming,
  withSpring,
  Easing,
  useAnimatedScrollHandler,
  runOnUI,
  cancelAnimation,
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
  // Consolidated entrance animations - start with visible values for Android compatibility
  const screenOpacity = useSharedValue(1);
  const contentOpacity = useSharedValue(1);
  
  // Combined hero animations 
  const heroOpacity = useSharedValue(1);
  const heroScale = useSharedValue(1); // Start at 1 for Android compatibility
  const heroHeightValue = useSharedValue(height * 0.5);
  
  // Combined UI element animations
  const uiElementsOpacity = useSharedValue(1);
  const uiElementsTranslateY = useSharedValue(0);
  
  // Progress animation - simplified to single value
  const progressOpacity = useSharedValue(0);
  
  // Scroll values - minimal
  const scrollY = useSharedValue(0);
  const headerProgress = useSharedValue(0); // Single value for all header animations
  
  // Static header elements Y for performance
  const staticHeaderElementsY = useSharedValue(0);
  
  // Ultra-fast entrance sequence - batch animations for better performance
  useEffect(() => {
    // Batch all entrance animations to run simultaneously with safety
    const enterAnimations = () => {
      'worklet';
      
      try {
      // Start with slightly reduced values and animate to full visibility
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
      } catch (error) {
        // Silently handle any animation errors
        if (__DEV__) console.warn('Animation error in enterAnimations:', error);
      }
    };

    // Use runOnUI for better performance with error handling
    try {
    runOnUI(enterAnimations)();
    } catch (error) {
      if (__DEV__) console.warn('Failed to run enter animations:', error);
    }
  }, []);
  
  // Optimized watch progress animation with safety
  useEffect(() => {
    const hasProgress = watchProgress && watchProgress.duration > 0;
    
    const updateProgress = () => {
      'worklet';
      
      try {
    progressOpacity.value = withTiming(hasProgress ? 1 : 0, {
      duration: hasProgress ? 200 : 150,
      easing: easings.fast
    });
      } catch (error) {
        if (__DEV__) console.warn('Animation error in updateProgress:', error);
      }
    };
    
    try {
    runOnUI(updateProgress)();
    } catch (error) {
      if (__DEV__) console.warn('Failed to run progress animation:', error);
    }
  }, [watchProgress]);
  
  // Cleanup function to cancel animations
  useEffect(() => {
    return () => {
      try {
        cancelAnimation(screenOpacity);
        cancelAnimation(contentOpacity);
        cancelAnimation(heroOpacity);
        cancelAnimation(heroScale);
        cancelAnimation(uiElementsOpacity);
        cancelAnimation(uiElementsTranslateY);
        cancelAnimation(progressOpacity);
        cancelAnimation(scrollY);
        cancelAnimation(headerProgress);
        cancelAnimation(staticHeaderElementsY);
      } catch (error) {
        if (__DEV__) console.warn('Error canceling animations:', error);
      }
    };
  }, []);
  
  // Ultra-optimized scroll handler with minimal calculations and safety
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      
      try {
      const rawScrollY = event.contentOffset.y;
      scrollY.value = rawScrollY;

      // Single calculation for header threshold
      const threshold = height * 0.4 - safeAreaTop;
      const progress = rawScrollY > threshold ? 1 : 0;
      
      // Use single progress value for all header animations
      if (headerProgress.value !== progress) {
        headerProgress.value = withTiming(progress, { 
          duration: progress ? 150 : 100, 
          easing: easings.ultraFast 
        });
        }
      } catch (error) {
        if (__DEV__) console.warn('Animation error in scroll handler:', error);
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