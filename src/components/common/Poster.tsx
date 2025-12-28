import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    Dimensions,
    ViewStyle,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';

const { width } = Dimensions.get('window');

// Enhanced responsive breakpoints
const BREAKPOINTS = {
    phone: 0,
    tablet: 768,
    largeTablet: 1024,
    tv: 1440,
};

const getDeviceType = (screenWidth: number) => {
    if (screenWidth >= BREAKPOINTS.tv) return 'tv';
    if (screenWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
    if (screenWidth >= BREAKPOINTS.tablet) return 'tablet';
    return 'phone';
};

export type PosterShape = 'poster' | 'landscape' | 'square';

export interface PosterProps {
    /** The poster image URL */
    uri?: string | null;
    /** Width of the poster */
    width: number;
    /** Shape of the poster - determines aspect ratio */
    shape?: PosterShape;
    /** Optional custom aspect ratio override */
    aspectRatio?: number;
    /** Optional custom border radius (uses settings.posterBorderRadius by default) */
    borderRadius?: number;
    /** Optional title to display below the poster */
    title?: string;
    /** Whether to show the title */
    showTitle?: boolean;
    /** Fallback text to show when no poster is available */
    fallbackText?: string;
    /** Additional styles for the container */
    style?: ViewStyle;
    /** Additional styles for the poster container */
    posterStyle?: ViewStyle;
}

/**
 * Shared Poster component with consistent styling across the app.
 * Matches the design from ContentItem.tsx with:
 * - Border: 1.5px solid rgba(255,255,255,0.15)
 * - Border Radius: settings.posterBorderRadius (default 12)
 * - Shadow: elevation 1 on Android, subtle shadow on iOS
 * - Aspect Ratio: 2/3 for poster, 16/9 for landscape, 1/1 for square
 */
export const Poster: React.FC<PosterProps> = ({
    uri,
    width: posterWidth,
    shape = 'poster',
    aspectRatio: customAspectRatio,
    borderRadius: customBorderRadius,
    title,
    showTitle = false,
    fallbackText,
    style,
    posterStyle,
}) => {
    const { currentTheme } = useTheme();
    const { settings, isLoaded } = useSettings();
    const [imageError, setImageError] = useState(false);

    // Reset error state when URI changes
    useEffect(() => {
        setImageError(false);
    }, [uri]);

    // Determine aspect ratio based on shape
    const aspectRatio = useMemo(() => {
        if (customAspectRatio) return customAspectRatio;
        switch (shape) {
            case 'landscape':
                return 16 / 9;
            case 'square':
                return 1;
            case 'poster':
            default:
                return 2 / 3;
        }
    }, [shape, customAspectRatio]);

    // Border radius from settings or custom
    const borderRadius = customBorderRadius ??
        (typeof settings.posterBorderRadius === 'number' ? settings.posterBorderRadius : 12);

    // Device type for responsive title sizing
    const deviceType = getDeviceType(width);

    // Title font size based on device type
    const titleFontSize = useMemo(() => {
        switch (deviceType) {
            case 'tv':
                return 16;
            case 'largeTablet':
                return 15;
            case 'tablet':
                return 14;
            default:
                return 13;
        }
    }, [deviceType]);

    // Optimize poster URL for TMDB
    const optimizedUrl = useMemo(() => {
        if (!uri || uri.includes('placeholder')) {
            return null;
        }
        if (uri.includes('image.tmdb.org')) {
            return uri.replace(/\/w\d+\//, '/w154/');
        }
        return uri;
    }, [uri]);

    // Placeholder while settings load
    if (!isLoaded) {
        return (
            <View style={[styles.container, { width: posterWidth }, style]}>
                <View
                    style={[
                        styles.posterContainer,
                        {
                            width: posterWidth,
                            aspectRatio,
                            borderRadius,
                            backgroundColor: currentTheme.colors.elevation1,
                        },
                        posterStyle,
                    ]}
                />
                {showTitle && <View style={{ height: 18, marginTop: 4 }} />}
            </View>
        );
    }

    return (
        <View style={[styles.container, { width: posterWidth }, style]}>
            <View
                style={[
                    styles.posterContainer,
                    {
                        width: posterWidth,
                        aspectRatio,
                        borderRadius,
                        backgroundColor: currentTheme.colors.elevation1,
                    },
                    posterStyle,
                ]}
            >
                {optimizedUrl && !imageError ? (
                    <FastImage
                        source={{
                            uri: optimizedUrl,
                            priority: FastImage.priority.normal,
                            cache: FastImage.cacheControl.immutable,
                        }}
                        style={[styles.poster, { borderRadius }]}
                        resizeMode={FastImage.resizeMode.cover}
                        onLoad={() => setImageError(false)}
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <View
                        style={[
                            styles.poster,
                            styles.fallbackContainer,
                            {
                                backgroundColor: currentTheme.colors.elevation1,
                                borderRadius,
                            },
                        ]}
                    >
                        {imageError ? (
                            <MaterialIcons
                                name="broken-image"
                                size={24}
                                color={currentTheme.colors.textMuted}
                            />
                        ) : fallbackText ? (
                            <Text
                                style={[styles.fallbackText, { color: currentTheme.colors.textMuted }]}
                                numberOfLines={2}
                            >
                                {fallbackText.length > 20 ? `${fallbackText.substring(0, 20)}...` : fallbackText}
                            </Text>
                        ) : (
                            <MaterialIcons
                                name="image"
                                size={24}
                                color={currentTheme.colors.textMuted}
                            />
                        )}
                    </View>
                )}
            </View>

            {showTitle && title && (
                <Text
                    style={[
                        styles.title,
                        {
                            color: currentTheme.colors.mediumEmphasis,
                            fontSize: titleFontSize,
                        },
                    ]}
                    numberOfLines={2}
                >
                    {title}
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {},
    posterContainer: {
        overflow: 'hidden',
        position: 'relative',
        // Consistent shadow/elevation matching ContentItem
        elevation: Platform.OS === 'android' ? 1 : 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
        // Consistent border styling
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
        marginBottom: 8,
    },
    poster: {
        width: '100%',
        height: '100%',
    },
    fallbackContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        fontSize: 10,
        textAlign: 'center',
        paddingHorizontal: 4,
    },
    title: {
        fontWeight: '500',
        marginTop: 4,
        textAlign: 'center',
    },
});

export default Poster;
