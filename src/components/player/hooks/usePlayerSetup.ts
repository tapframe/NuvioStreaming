/**
 * Shared Player Setup Hook
 * Used by both Android (VLC) and iOS (KSPlayer) players
 * Handles StatusBar, orientation, brightness, and app state
 */
import { useEffect, useRef, useCallback } from 'react';
import { StatusBar, Dimensions, AppState, InteractionManager, Platform } from 'react-native';
import * as Brightness from 'expo-brightness';
import * as ScreenOrientation from 'expo-screen-orientation';
import { logger } from '../../../utils/logger';
import { useFocusEffect } from '@react-navigation/native';

interface PlayerSetupConfig {
    setScreenDimensions: (dim: any) => void;
    setVolume: (vol: number) => void;
    setBrightness: (bri: number) => void;
    isOpeningAnimationComplete: boolean;
}

export const usePlayerSetup = (config: PlayerSetupConfig) => {
    const {
        setScreenDimensions,
        setVolume,
        setBrightness,
        isOpeningAnimationComplete
    } = config;

    const isAppBackgrounded = useRef(false);

    const enableImmersiveMode = () => {
        StatusBar.setHidden(true, 'none');
    };

    const disableImmersiveMode = () => {
        StatusBar.setHidden(false, 'fade');
    };

    useFocusEffect(
        useCallback(() => {
            if (isOpeningAnimationComplete) {
                enableImmersiveMode();
            }
            return () => { };
        }, [isOpeningAnimationComplete])
    );

    useEffect(() => {
        // Initial Setup
        const subscription = Dimensions.addEventListener('change', ({ screen }) => {
            setScreenDimensions(screen);
            if (isOpeningAnimationComplete) {
                enableImmersiveMode();
            }
        });

        StatusBar.setHidden(true, 'none');
        if (isOpeningAnimationComplete) {
            enableImmersiveMode();
        }

        // Initialize volume (normalized 0-1 for cross-platform)
        setVolume(1.0);

        // Initialize Brightness
        const initBrightness = () => {
            InteractionManager.runAfterInteractions(async () => {
                try {
                    const currentBrightness = await Brightness.getBrightnessAsync();
                    setBrightness(currentBrightness);
                } catch (error) {
                    logger.warn('[usePlayerSetup] Error getting initial brightness:', error);
                    setBrightness(1.0);
                }
            });
        };
        initBrightness();

        return () => {
            subscription?.remove();
            disableImmersiveMode();
        };
    }, [isOpeningAnimationComplete]);

    const orientationLocked = useRef(false);

    useEffect(() => {
        if (isOpeningAnimationComplete && !orientationLocked.current) {
            const task = InteractionManager.runAfterInteractions(() => {
                ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
                    .then(() => {
                        orientationLocked.current = true;
                    })
                    .catch(() => { });
            });
            return () => task.cancel();
        }
    }, [isOpeningAnimationComplete]);

    useEffect(() => {
        return () => {
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT)
                .then(() => ScreenOrientation.unlockAsync())
                .catch(() => { });
        };
    }, []);

    // Handle App State
    useEffect(() => {
        const onAppStateChange = (state: string) => {
            if (state === 'active') {
                isAppBackgrounded.current = false;
                if (isOpeningAnimationComplete) {
                    enableImmersiveMode();
                }
            } else if (state === 'background' || state === 'inactive') {
                isAppBackgrounded.current = true;
            }
        };
        const sub = AppState.addEventListener('change', onAppStateChange);
        return () => sub.remove();
    }, [isOpeningAnimationComplete]);

    return { isAppBackgrounded };
};
