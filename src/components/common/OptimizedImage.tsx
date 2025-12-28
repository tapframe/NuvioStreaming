import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import FastImage, { priority as FIPriority, cacheControl as FICacheControl, resizeMode as FIResizeMode, preload as FIPreload } from '../../utils/FastImageCompat';
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
  transition = 0,
  cachePolicy = 'memory'
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isVisible, setIsVisible] = useState(!lazy);
  const [optimizedUrl, setOptimizedUrl] = useState<string>('');
  const mountedRef = useRef(true);

  // Extract URL from source
  const sourceUrl = typeof source === 'string' ? source : source?.uri || '';

  // Calculate container dimensions from style
  const containerWidth = style?.width || (style?.aspectRatio ? screenWidth * 0.3 : 300);
  const containerHeight = style?.height || (containerWidth / (style?.aspectRatio || 0.67));

  useEffect(() => {
    return () => {
      mountedRef.current = false;
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
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          setIsVisible(true);
        }
      }, priority === 'high' ? 200 : priority === 'normal' ? 500 : 1000);

      return () => clearTimeout(timer);
    }
  }, [lazy, isVisible, priority]);

  // Preload image via FastImage
  const preloadImage = useCallback(async () => {
    if (!optimizedUrl || !isVisible) return;

    try {
      FIPreload([{ uri: optimizedUrl }]);
      if (!mountedRef.current) return;
      setIsLoaded(true);
      onLoad?.();
    } catch (error) {
      if (!mountedRef.current) return;
      logger.error(`[OptimizedImage] Failed to preload: ${optimizedUrl.substring(0, 50)}...`, error);
      setHasError(true);
      onError?.(error);
    }
  }, [optimizedUrl, isVisible, onLoad, onError]);

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
      <FastImage
        source={{ uri: placeholder }}
        style={style}
        resizeMode={FIResizeMode.cover}
      />
    );
  }

  return (
    <FastImage
      source={{
        uri: optimizedUrl,
        priority: priority === 'high' ? FIPriority.high : priority === 'low' ? FIPriority.low : FIPriority.normal,
        cache: FICacheControl.immutable
      }}
      style={style}
      resizeMode={contentFit === 'contain' ? FIResizeMode.contain : contentFit === 'cover' ? FIResizeMode.cover : FIResizeMode.cover}
      onLoad={() => {
        setIsLoaded(true);
        onLoad?.();
      }}
      onError={(error: any) => {
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