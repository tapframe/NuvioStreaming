/**
 * Shared Player Controls Hook
 * Used by both Android (VLC) and iOS (KSPlayer) players
 */
import { useRef, useCallback, MutableRefObject } from 'react';
import { Platform } from 'react-native';
import { logger } from '../../../utils/logger';

const DEBUG_MODE = false;
const END_EPSILON = 0.3;

interface PlayerControlsConfig {
    playerRef: MutableRefObject<any>;
    paused: boolean;
    setPaused: (paused: boolean) => void;
    currentTime: number;
    duration: number;
    isSeeking: MutableRefObject<boolean>;
    isMounted: MutableRefObject<boolean>;
}

export const usePlayerControls = (config: PlayerControlsConfig) => {
    const {
        playerRef,
        paused,
        setPaused,
        currentTime,
        duration,
        isSeeking,
        isMounted
    } = config;

    // iOS seeking helpers
    const iosWasPausedDuringSeekRef = useRef<boolean | null>(null);

    const togglePlayback = useCallback(() => {
        setPaused(!paused);
    }, [paused, setPaused]);

    const seekToTime = useCallback((rawSeconds: number) => {
        const timeInSeconds = Math.max(0, Math.min(rawSeconds, duration > 0 ? duration - END_EPSILON : rawSeconds));

        if (playerRef.current && duration > 0 && !isSeeking.current) {
            if (DEBUG_MODE) logger.log(`[usePlayerControls] Seeking to ${timeInSeconds}`);

            isSeeking.current = true;

            // iOS optimization: pause while seeking for smoother experience
            if (Platform.OS === 'ios') {
                iosWasPausedDuringSeekRef.current = paused;
                if (!paused) setPaused(true);
            }

            // Actually perform the seek
            playerRef.current.seek(timeInSeconds);

            // Debounce the seeking state reset
            setTimeout(() => {
                if (isMounted.current && isSeeking.current) {
                    isSeeking.current = false;
                    // Resume if it was playing (iOS specific)
                    if (Platform.OS === 'ios' && iosWasPausedDuringSeekRef.current === false) {
                        setPaused(false);
                        iosWasPausedDuringSeekRef.current = null;
                    }
                }
            }, 500);
        }
    }, [duration, paused, setPaused, playerRef, isSeeking, isMounted]);

    const skip = useCallback((seconds: number) => {
        seekToTime(currentTime + seconds);
    }, [currentTime, seekToTime]);

    return {
        togglePlayback,
        seekToTime,
        skip,
        iosWasPausedDuringSeekRef
    };
};
