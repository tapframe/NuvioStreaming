import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { imageCacheService } from '../../services/imageCacheService';
import { logger } from '../../utils/logger';

interface OptimizedImageProps {
  source: { uri: string } | string;
  style?: any;
  placeholder?: string;
  priority?: 'low' | 'normal' | 'high';
  lazy?: boolean;
  onLoad?: () => void;
  onError?: (error: any) => void;
  contentFit?: 'cover' | 'contain' | 'fill' | 'scale-down';
  transition?: number;
  cachePolicy?: 'memory' | 'disk' | 'memory-disk' | 'none';
}

const { width: screenWidth } = Dimensions.get('window');

// Image size optimization based on container size
const getOptimizedImageUrl = (originalUrl: string, containerWidth?: number, containerHeight?: number): string => {
  if (!originalUrl || originalUrl.includes('placeholder')) {
    return originalUrl;
  }

  // For TMDB images, we can request specific sizes
  if (originalUrl.includes('image.tmdb.org')) {
    const width = containerWidth || 300;
    let size = 'w300';
    
    if (width <= 92) size = 'w92';
    else if (width <= 154) size = 'w154';
    else if (width <= 185) size = 'w185';
    else if (width <= 342) size = 'w342';
    else if (width <= 500) size = 'w500';
    else if (width <= 780) size = 'w780';
    else size = 'w1280';
    
    // Replace the size in the URL
    return originalUrl.replace(/\/w\d+\//, `/${size}/`);
  }

  // For other image services, add query parameters if supported
  if (originalUrl.includes('?')) {
    return `${originalUrl}&w=${containerWidth || 300}&h=${containerHeight || 450}&q=80`;
  } else {
    return `${originalUrl}?w=${containerWidth || 300}&h=${containerHeight || 450}&q=80`;
  }
};

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  source,
  style,
  placeholder = 'https://via.placeholder.com/300x450/1a1a1a/666666?text=Loading',
  priority = 'normal',
  lazy = true,
  onLoad,
  onError,
  contentFit = 'cover',
  transition = 200,
  cachePolicy = 'memory-disk'
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isVisible, setIsVisible] = useState(!lazy);
  const [recyclingKey] = useState(() => `${Math.random().toString(36).slice(2)}-${Date.now()}`);
  const [optimizedUrl, setOptimizedUrl] = useState<string>('');
  const mountedRef = useRef(true);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Extract URL from source
  const sourceUrl = typeof source === 'string' ? source : source?.uri || '';

  // Calculate container dimensions from style
  const containerWidth = style?.width || (style?.aspectRatio ? screenWidth * 0.3 : 300);
  const containerHeight = style?.height || (containerWidth / (style?.aspectRatio || 0.67));

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  // Optimize image URL based on container size
  useEffect(() => {
    if (sourceUrl) {
      const optimized = getOptimizedImageUrl(sourceUrl, containerWidth, containerHeight);
      setOptimizedUrl(optimized);
    }
  }, [sourceUrl, containerWidth, containerHeight]);

  // Lazy loading intersection observer simulation
  useEffect(() => {
    if (lazy && !isVisible) {
      // Simple lazy loading - load after a short delay to simulate intersection
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          setIsVisible(true);
        }
      }, priority === 'high' ? 100 : priority === 'normal' ? 300 : 500);

      return () => clearTimeout(timer);
    }
  }, [lazy, isVisible, priority]);

  // Preload image with caching
  const preloadImage = useCallback(async () => {
    if (!optimizedUrl || !isVisible) return;

    try {
      // Use our cache service to manage the image
      const cachedUrl = await imageCacheService.getCachedImageUrl(optimizedUrl);
      
      // Set a timeout for loading
      loadTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && !isLoaded) {
          logger.warn(`[OptimizedImage] Load timeout for: ${optimizedUrl.substring(0, 50)}...`);
          setHasError(true);
        }
      }, 10000); // 10 second timeout

      // Prefetch the image
      await ExpoImage.prefetch(cachedUrl);
      
      if (mountedRef.current) {
        setIsLoaded(true);
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        onLoad?.();
      }
    } catch (error) {
      if (mountedRef.current) {
        logger.error(`[OptimizedImage] Failed to load: ${optimizedUrl.substring(0, 50)}...`, error);
        setHasError(true);
        onError?.(error);
      }
    }
  }, [optimizedUrl, isVisible, isLoaded, onLoad, onError]);

  useEffect(() => {
    if (isVisible && optimizedUrl && !isLoaded && !hasError) {
      preloadImage();
    }
  }, [isVisible, optimizedUrl, isLoaded, hasError, preloadImage]);

  // Don't render anything if not visible (lazy loading)
  if (!isVisible) {
    return <View style={[style, styles.placeholder]} />;
  }

  // Show placeholder while loading or on error
  if (!isLoaded || hasError) {
    return (
      <ExpoImage
        source={{ uri: placeholder }}
        style={style}
        contentFit={contentFit}
        transition={0}
        cachePolicy="memory"
      />
    );
  }

  return (
      <ExpoImage
      source={{ uri: optimizedUrl }}
      style={style}
      contentFit={contentFit}
      transition={transition}
      cachePolicy={cachePolicy}
        // Use a stable recycling key per component instance to keep textures alive between reuses
        // This mitigates flicker on fast horizontal scrolls
        recyclingKey={recyclingKey}
      onLoad={() => {
        setIsLoaded(true);
        onLoad?.();
      }}
      onError={(error) => {
        setHasError(true);
        onError?.(error);
      }}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#1a1a1a',
  },
});

export default OptimizedImage;