/**
 * FastImage compatibility wrapper
 * Handles both Web and Native platforms in a single file to ensure consistent module resolution
 */
import React from 'react';
import { Image as RNImage, Platform, ImageProps, ImageStyle, StyleProp } from 'react-native';

// Define types for FastImage properties
export interface FastImageSource {
    uri?: string;
    priority?: string;
    cache?: string;
    headers?: { [key: string]: string };
}

export interface FastImageProps {
    source: FastImageSource | number;
    style?: StyleProp<ImageStyle>;
    resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
    onError?: (error?: any) => void;
    onLoad?: () => void;
    onLoadStart?: () => void;
    onLoadEnd?: () => void;
    [key: string]: any;
}

let NativeFastImage: any = null;
const isWeb = Platform.OS === 'web';

if (!isWeb) {
    try {
        NativeFastImage = require('@d11/react-native-fast-image').default;
    } catch (e) {
        console.warn('FastImageCompat: Failed to load @d11/react-native-fast-image', e);
    }
}

// Define constants with fallbacks
export const priority = (NativeFastImage?.priority) || {
    low: 'low',
    normal: 'normal',
    high: 'high',
};

export const cacheControl = (NativeFastImage?.cacheControl) || {
    immutable: 'immutable',
    web: 'web',
    cacheOnly: 'cacheOnly',
};

export const resizeMode = (NativeFastImage?.resizeMode) || {
    contain: 'contain',
    cover: 'cover',
    stretch: 'stretch',
    center: 'center',
};

// Preload helper
export const preload = (sources: { uri: string }[]) => {
    if (isWeb) {
        sources.forEach(({ uri }) => {
            if (typeof window !== 'undefined') {
                const img = new window.Image();
                img.src = uri;
            }
        });
    } else if (NativeFastImage?.preload) {
        NativeFastImage.preload(sources);
    }
};

// Clear cache helpers
export const clearMemoryCache = () => {
    if (!isWeb && NativeFastImage?.clearMemoryCache) {
        NativeFastImage.clearMemoryCache();
    }
};

export const clearDiskCache = () => {
    if (!isWeb && NativeFastImage?.clearDiskCache) {
        NativeFastImage.clearDiskCache();
    }
};

// Web Image Component - a simple wrapper that uses a standard img tag
const WebImage = React.forwardRef<HTMLImageElement, FastImageProps>(({ source, style, resizeMode: resizeModeProp, onError, onLoad, onLoadStart, onLoadEnd, ...rest }, ref) => {
    // Handle source - can be an object with uri or a require'd number
    let uri: string | undefined;
    if (typeof source === 'object' && source !== null && 'uri' in source) {
        uri = source.uri;
    }
    
    // If no valid URI, render nothing
    if (!uri) {
        return null;
    }
    
    // Convert React Native style to web-compatible style
    const objectFitValue = resizeModeProp === 'contain' ? 'contain' : 
                           resizeModeProp === 'cover' ? 'cover' : 
                           resizeModeProp === 'stretch' ? 'fill' : 
                           resizeModeProp === 'center' ? 'none' : 'cover';

    // Flatten style if it's an array and merge with webStyle
    const flattenedStyle = Array.isArray(style) 
        ? Object.assign({}, ...style.filter(Boolean)) 
        : (style || {});

    // Clean up React Native specific style props that don't work on web
    const { 
        resizeMode: _rm, // Remove resizeMode from styles
        ...cleanedStyle 
    } = flattenedStyle as any;

    return (
        <img
            ref={ref}
            src={uri}
            alt=""
            style={{ 
                ...cleanedStyle, 
                objectFit: objectFitValue,
            } as React.CSSProperties}
            onError={onError ? () => onError() : undefined}
            onLoad={onLoad}
        />
    );
});

WebImage.displayName = 'WebImage';

// Component Implementation
const FastImageComponent = React.forwardRef<any, FastImageProps>((props, ref) => {
    if (isWeb) {
        return <WebImage {...props} ref={ref} />;
    }

    // On Native, use FastImage if available, otherwise fallback to RNImage
    const Comp = NativeFastImage || RNImage;
    return <Comp {...props} ref={ref} />;
});

FastImageComponent.displayName = 'FastImage';

// Attach static properties to the component
(FastImageComponent as any).priority = priority;
(FastImageComponent as any).cacheControl = cacheControl;
(FastImageComponent as any).resizeMode = resizeMode;
(FastImageComponent as any).preload = preload;
(FastImageComponent as any).clearMemoryCache = clearMemoryCache;
(FastImageComponent as any).clearDiskCache = clearDiskCache;

// Define the type for the component with statics
type FastImageType = React.ForwardRefExoticComponent<FastImageProps & React.RefAttributes<any>> & {
    priority: typeof priority;
    cacheControl: typeof cacheControl;
    resizeMode: typeof resizeMode;
    preload: typeof preload;
    clearMemoryCache: typeof clearMemoryCache;
    clearDiskCache: typeof clearDiskCache;
};

// Export the component with the correct type
export default FastImageComponent as unknown as FastImageType;

// Also export named for flexibility
export const FastImage = FastImageComponent as unknown as FastImageType;
