import { useRef, useState, useEffect } from 'react';
import { Animated, InteractionManager } from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { logger } from '../../../../utils/logger';

export const useOpeningAnimation = (backdrop: string | undefined, metadata: any) => {
    // Animation Values
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const openingFadeAnim = useRef(new Animated.Value(0)).current;
    const openingScaleAnim = useRef(new Animated.Value(0.8)).current;
    const backgroundFadeAnim = useRef(new Animated.Value(1)).current;
    const backdropImageOpacityAnim = useRef(new Animated.Value(0)).current;
    const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
    const logoOpacityAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] = useState(false);
    const [shouldHideOpeningOverlay, setShouldHideOpeningOverlay] = useState(false);
    const [isBackdropLoaded, setIsBackdropLoaded] = useState(false);

    // Prefetch Background
    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            if (backdrop && typeof backdrop === 'string') {
                setIsBackdropLoaded(false);
                backdropImageOpacityAnim.setValue(0);
                try {
                    FastImage.preload([{ uri: backdrop }]);
                    setIsBackdropLoaded(true);
                    Animated.timing(backdropImageOpacityAnim, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }).start();
                } catch (error) {
                    setIsBackdropLoaded(true);
                    backdropImageOpacityAnim.setValue(1);
                }
            } else {
                setIsBackdropLoaded(true);
                backdropImageOpacityAnim.setValue(0);
            }
        });
        return () => task.cancel();
    }, [backdrop]);

    // Prefetch Logo
    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => {
            const logoUrl = metadata?.logo;
            if (logoUrl && typeof logoUrl === 'string') {
                try {
                    FastImage.preload([{ uri: logoUrl }]);
                } catch (error) { }
            }
        });
        return () => task.cancel();
    }, [metadata]);

    const startOpeningAnimation = () => {
        Animated.parallel([
            Animated.timing(logoOpacityAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.spring(logoScaleAnim, {
                toValue: 1,
                tension: 80,
                friction: 8,
                useNativeDriver: true,
            }),
        ]).start();

        const createPulseAnimation = () => {
            return Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ]);
        };

        const loopPulse = () => {
            createPulseAnimation().start(() => {
                if (!isOpeningAnimationComplete) {
                    loopPulse();
                }
            });
        };
        loopPulse();
    };

    const completeOpeningAnimation = () => {
        pulseAnim.stopAnimation();

        Animated.parallel([
            Animated.timing(openingFadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.timing(openingScaleAnim, {
                toValue: 1,
                duration: 350,
                useNativeDriver: true,
            }),
            Animated.timing(backgroundFadeAnim, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setIsOpeningAnimationComplete(true);
            setTimeout(() => {
                setShouldHideOpeningOverlay(true);
            }, 450);
        });

        setTimeout(() => {
            if (!isOpeningAnimationComplete) {
                // logger.warn('[VideoPlayer] Opening animation fallback triggered');
                setIsOpeningAnimationComplete(true);
            }
        }, 1000);
    };

    return {
        fadeAnim,
        openingFadeAnim,
        openingScaleAnim,
        backgroundFadeAnim,
        backdropImageOpacityAnim,
        logoScaleAnim,
        logoOpacityAnim,
        pulseAnim,
        isOpeningAnimationComplete,
        shouldHideOpeningOverlay,
        isBackdropLoaded,
        startOpeningAnimation,
        completeOpeningAnimation
    };
};
