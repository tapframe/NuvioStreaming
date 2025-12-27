import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { introService, IntroTimestamps } from '../../../services/introService';
import { useTheme } from '../../../contexts/ThemeContext';
import { logger } from '../../../utils/logger';

interface SkipIntroButtonProps {
    imdbId: string | undefined;
    type: 'movie' | 'series' | string;
    season?: number;
    episode?: number;
    currentTime: number;
    onSkip: (endTime: number) => void;
    controlsVisible?: boolean;
    controlsFixedOffset?: number;
}

export const SkipIntroButton: React.FC<SkipIntroButtonProps> = ({
    imdbId,
    type,
    season,
    episode,
    currentTime,
    onSkip,
    controlsVisible = false,
    controlsFixedOffset = 100,
}) => {
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const [introData, setIntroData] = useState<IntroTimestamps | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [hasSkipped, setHasSkipped] = useState(false);
    const fetchedRef = useRef(false);
    const lastEpisodeRef = useRef<string>('');

    // Animation values
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.8);
    const translateY = useSharedValue(0);

    // Fetch intro data when episode changes
    useEffect(() => {
        const episodeKey = `${imdbId}-${season}-${episode}`;

        // Skip if not a series or missing required data
        if (type !== 'series' || !imdbId || !season || !episode) {
            logger.log(`[SkipIntroButton] Skipping fetch - type: ${type}, imdbId: ${imdbId}, season: ${season}, episode: ${episode}`);
            setIntroData(null);
            fetchedRef.current = false;
            return;
        }

        // Skip if already fetched for this episode
        if (lastEpisodeRef.current === episodeKey && fetchedRef.current) {
            return;
        }

        lastEpisodeRef.current = episodeKey;
        fetchedRef.current = true;
        setHasSkipped(false);

        const fetchIntroData = async () => {
            logger.log(`[SkipIntroButton] Fetching intro data for ${imdbId} S${season}E${episode}...`);
            try {
                const data = await introService.getIntroTimestamps(imdbId, season, episode);
                setIntroData(data);

                if (data) {
                    logger.log(`[SkipIntroButton] ✓ Found intro: ${data.start_sec}s - ${data.end_sec}s (confidence: ${data.confidence})`);
                } else {
                    logger.log(`[SkipIntroButton] ✗ No intro data available for this episode`);
                }
            } catch (error) {
                logger.error('[SkipIntroButton] Error fetching intro data:', error);
                setIntroData(null);
            }
        };

        fetchIntroData();
    }, [imdbId, type, season, episode]);

    // Determine if button should show based on current playback position
    const shouldShowButton = useCallback(() => {
        if (!introData || hasSkipped) return false;
        // Show when within intro range, with a small buffer at the end
        return currentTime >= introData.start_sec && currentTime < (introData.end_sec - 0.5);
    }, [introData, currentTime, hasSkipped]);

    // Handle visibility animations
    useEffect(() => {
        const shouldShow = shouldShowButton();

        if (shouldShow && !isVisible) {
            logger.log(`[SkipIntroButton] Showing button - currentTime: ${currentTime.toFixed(1)}s, intro: ${introData?.start_sec}s - ${introData?.end_sec}s`);
            setIsVisible(true);
            opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
            scale.value = withSpring(1, { damping: 15, stiffness: 150 });
        } else if (!shouldShow && isVisible) {
            logger.log(`[SkipIntroButton] Hiding button - currentTime: ${currentTime.toFixed(1)}s, hasSkipped: ${hasSkipped}`);
            opacity.value = withTiming(0, { duration: 200 });
            scale.value = withTiming(0.8, { duration: 200 });
            // Delay hiding to allow animation to complete
            setTimeout(() => setIsVisible(false), 250);
        }
    }, [shouldShowButton, isVisible]);

    // Animate position based on controls visibility
    useEffect(() => {
        const target = controlsVisible ? -(controlsFixedOffset / 2) : 0;
        translateY.value = withTiming(target, { duration: 220, easing: Easing.out(Easing.cubic) });
    }, [controlsVisible, controlsFixedOffset]);

    // Handle skip action
    const handleSkip = useCallback(() => {
        if (!introData) return;

        logger.log(`[SkipIntroButton] User pressed Skip Intro - seeking to ${introData.end_sec}s (from ${currentTime.toFixed(1)}s)`);
        setHasSkipped(true);
        onSkip(introData.end_sec);
    }, [introData, onSkip, currentTime]);

    // Animated styles
    const containerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }, { translateY: translateY.value }],
    }));

    // Don't render if not visible or no intro data
    if (!isVisible || !introData) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                containerStyle,
                {
                    bottom: 24 + insets.bottom,
                    left: (Platform.OS === 'android' ? 12 : 4) + insets.left,
                },
            ]}
            pointerEvents="box-none"
        >
            <TouchableOpacity
                style={styles.button}
                onPress={handleSkip}
                activeOpacity={0.85}
            >
                <BlurView
                    intensity={60}
                    tint="dark"
                    style={styles.blurContainer}
                >
                    <MaterialIcons
                        name="skip-next"
                        size={20}
                        color="#FFFFFF"
                        style={styles.icon}
                    />
                    <Text style={styles.text}>Skip Intro</Text>
                    <Animated.View
                        style={[
                            styles.accentBar,
                            { backgroundColor: currentTheme.colors.primary }
                        ]}
                    />
                </BlurView>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        zIndex: 55,
    },
    button: {
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    blurContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 18,
        backgroundColor: 'rgba(30, 30, 30, 0.7)',
    },
    icon: {
        marginRight: 8,
    },
    text: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    accentBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
    },
});

export default SkipIntroButton;
