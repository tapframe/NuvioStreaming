import { useEffect, useRef, useCallback } from 'react';
import { StatusBar, Dimensions, AppState, InteractionManager } from 'react-native';
import * as Brightness from 'expo-brightness';
import * as ScreenOrientation from 'expo-screen-orientation';
import { logger } from '../../../../utils/logger';
import { useFocusEffect } from '@react-navigation/native';

export const usePlayerSetup = (
    setScreenDimensions: (dim: any) => void,
    setVolume: (vol: number) => void,
    setBrightness: (bri: number) => void,
    isOpeningAnimationComplete: boolean
) => {
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

        // Initialize volume (KSPlayer uses 0-100)
        setVolume(100);

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

    // Handle Orientation (Lock to Landscape after opening)
    useEffect(() => {
        if (isOpeningAnimationComplete) {
            const task = InteractionManager.runAfterInteractions(() => {
                ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
                    .then(() => {
                        if (__DEV__) logger.log('[VideoPlayer] Locked to landscape orientation');
                    })
                    .catch((error) => {
                        logger.warn('[VideoPlayer] Failed to lock orientation:', error);
                    });
            });
            return () => task.cancel();
        }
    }, [isOpeningAnimationComplete]);

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
