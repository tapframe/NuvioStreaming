import { useState, useEffect, useCallback } from 'react';
import { getColors } from 'react-native-image-colors';
import type { ImageColorsResult } from 'react-native-image-colors';

interface DominantColorResult {
  dominantColor: string | null;
  loading: boolean;
  error: string | null;
}

// Simple in-memory cache for extracted colors
const colorCache = new Map<string, string>();

// Preload function to start extraction early
export const preloadDominantColor = async (imageUri: string | null) => {
  if (!imageUri || colorCache.has(imageUri)) return;
  
  console.log('[useDominantColor] Preloading color for URI:', imageUri);
  
  try {
    const result = await getColors(imageUri, {
      fallback: '#1a1a1a',
      cache: true,
      key: imageUri,
      quality: 'low',
    });

    let extractedColor = '#1a1a1a';
    
    if (result.platform === 'android') {
      extractedColor = result.darkMuted || result.muted || result.darkVibrant || result.dominant || '#1a1a1a';
    } else if (result.platform === 'ios') {
      extractedColor = result.background || result.primary || '#1a1a1a';
    } else if (result.platform === 'web') {
      extractedColor = result.darkMuted || result.muted || result.dominant || '#1a1a1a';
    }

    // Apply darkening logic
    const hex = extractedColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    if (brightness > 50) {
      const darkenFactor = 0.15;
      const newR = Math.floor(r * darkenFactor);
      const newG = Math.floor(g * darkenFactor);
      const newB = Math.floor(b * darkenFactor);
      extractedColor = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }

    colorCache.set(imageUri, extractedColor);
  } catch (err) {
    console.warn('[preloadDominantColor] Failed to preload color:', err);
    colorCache.set(imageUri, '#1a1a1a');
  }
};

export const useDominantColor = (imageUri: string | null): DominantColorResult => {
  // Start with cached color if available, otherwise use fallback immediately
  const [dominantColor, setDominantColor] = useState<string | null>(() => {
    if (imageUri && colorCache.has(imageUri)) {
      return colorCache.get(imageUri) || '#1a1a1a';
    }
    // Never return null - always provide immediate fallback
    return '#1a1a1a';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractColor = useCallback(async (uri: string) => {
    if (!uri) {
      setDominantColor('#1a1a1a');
      setLoading(false);
      return;
    }

    // Check cache first
    if (colorCache.has(uri)) {
      const cachedColor = colorCache.get(uri)!;
      setDominantColor(cachedColor);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result: ImageColorsResult = await getColors(uri, {
        fallback: '#1a1a1a',
        cache: true,
        key: uri,
        quality: 'low', // Use low quality for better performance
      });

      let extractedColor = '#1a1a1a'; // Default fallback

      // Handle different platform results
      if (result.platform === 'android') {
        // Prefer darker, more muted colors for background
        extractedColor = result.darkMuted || result.muted || result.darkVibrant || result.dominant || '#1a1a1a';
      } else if (result.platform === 'ios') {
        // Use background color from iOS, or fallback to primary
        extractedColor = result.background || result.primary || '#1a1a1a';
      } else if (result.platform === 'web') {
        // Use muted colors for web
        extractedColor = result.darkMuted || result.muted || result.dominant || '#1a1a1a';
      }

      // Ensure the color is dark enough for a background
      // Convert hex to RGB to check brightness
      const hex = extractedColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      
      // Calculate brightness (0-255)
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      
      // If too bright, darken it significantly
      if (brightness > 50) {
        const darkenFactor = 0.15;
        const newR = Math.floor(r * darkenFactor);
        const newG = Math.floor(g * darkenFactor);
        const newB = Math.floor(b * darkenFactor);
        extractedColor = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
      }

      // Cache the extracted color for future use
      colorCache.set(uri, extractedColor);
      setDominantColor(extractedColor);
    } catch (err) {
      console.warn('[useDominantColor] Failed to extract color:', err);
      setError(err instanceof Error ? err.message : 'Failed to extract color');
      const fallbackColor = '#1a1a1a';
      colorCache.set(uri, fallbackColor); // Cache fallback to avoid repeated failures
      setDominantColor(fallbackColor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (imageUri) {
      // If we have a cached color, use it immediately, but still extract in background for accuracy
      if (colorCache.has(imageUri)) {
        setDominantColor(colorCache.get(imageUri)!);
        setLoading(false);
      } else {
        // No cache, extract color
        extractColor(imageUri);
      }
    } else {
      setDominantColor('#1a1a1a');
      setLoading(false);
      setError(null);
    }
  }, [imageUri, extractColor]);

  return {
    dominantColor,
    loading,
    error,
  };
};

export default useDominantColor;