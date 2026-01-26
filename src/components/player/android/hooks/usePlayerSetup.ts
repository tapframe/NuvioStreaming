import { useEffect, useRef } from 'react';
import { StatusBar, Platform, Dimensions, AppState } from 'react-native';
import RNImmersiveMode from 'react-native-immersive-mode';
import * as NavigationBar from 'expo-navigation-bar';

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { logger } from '../../../../utils/logger';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

const DEBUG_MODE = false;

export const usePlayerSetup = (
    setScreenDimensions: (dim: any) => void,
    setVolume: (vol: number) => void,

    paused: boolean
) => {

    const isAppBackgrounded = useRef(false);

    // Prevent screen sleep while playing
    // Prevent screen sleep while playing
    useEffect(() => {
        if (!paused) {
            activateKeepAwakeAsync();
        } else {
            deactivateKeepAwake();
        }
        return () => {
            deactivateKeepAwake();
        };
    }, [paused]);

    const enableImmersiveMode = async () => {
        if (Platform.OS === 'android') {
            // Standard immersive mode
            RNImmersiveMode.setBarTranslucent(true);
            RNImmersiveMode.fullLayout(true);
            StatusBar.setHidden(true, 'none');

            // Explicitly hide bottom navigation bar using Expo
            try {
                await NavigationBar.setVisibilityAsync("hidden");
                await NavigationBar.setBehaviorAsync("overlay-swipe");
            } catch (e) {
                // Ignore errors on non-supported devices
            }
        }
    };

    const disableImmersiveMode = async () => {
        if (Platform.OS === 'android') {
            RNImmersiveMode.setBarTranslucent(false);
            RNImmersiveMode.fullLayout(false);
            StatusBar.setHidden(false, 'fade');

            try {
                await NavigationBar.setVisibilityAsync("visible");
            } catch (e) {
                // Ignore
            }
        }
    };

    useFocusEffect(
        useCallback(() => {
            enableImmersiveMode();
            return () => { };
        }, [])
    );

    useEffect(() => {
        // Initial Setup
        const subscription = Dimensions.addEventListener('change', ({ screen }) => {
            setScreenDimensions(screen);
            enableImmersiveMode();
        });

        StatusBar.setHidden(true, 'none');
        enableImmersiveMode();

        // Initialize volume (default to 1.0)
        setVolume(1.0);

        return () => {
            subscription?.remove();
            disableImmersiveMode();
        };
    }, []);

    // Handle App State
    useEffect(() => {
        const onAppStateChange = (state: string) => {
            if (state === 'active') {
                isAppBackgrounded.current = false;
                enableImmersiveMode();
            } else if (state === 'background' || state === 'inactive') {
                isAppBackgrounded.current = true;
            }
        };
        const sub = AppState.addEventListener('change', onAppStateChange);
        return () => sub.remove();
    }, []);

    return { isAppBackgrounded };
};
