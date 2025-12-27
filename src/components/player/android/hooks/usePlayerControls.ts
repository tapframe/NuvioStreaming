import { useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { VideoRef } from 'react-native-video';
import { logger } from '../../../../utils/logger';

const DEBUG_MODE = true; // Temporarily enable for debugging seek
const END_EPSILON = 0.3;

export const usePlayerControls = (
    mpvPlayerRef: any,
    paused: boolean,
    setPaused: (paused: boolean) => void,
    currentTime: number,
    duration: number,
    isSeeking: React.MutableRefObject<boolean>,
    isMounted: React.MutableRefObject<boolean>,
    // Dual engine support
    exoPlayerRef?: React.RefObject<VideoRef>,
    useExoPlayer?: boolean
) => {
    // iOS seeking helpers
    const iosWasPausedDuringSeekRef = useRef<boolean | null>(null);

    const togglePlayback = useCallback(() => {
        setPaused(!paused);
    }, [paused, setPaused]);

    const seekToTime = useCallback((rawSeconds: number) => {
        const timeInSeconds = Math.max(0, Math.min(rawSeconds, duration > 0 ? duration - END_EPSILON : rawSeconds));

        console.log('[usePlayerControls] seekToTime called:', {
            rawSeconds,
            timeInSeconds,
            hasMpvRef: !!mpvPlayerRef?.current,
            hasExoRef: !!exoPlayerRef?.current,
            useExoPlayer,
            duration,
            isSeeking: isSeeking.current
        });

        // ExoPlayer
        if (useExoPlayer && exoPlayerRef?.current && duration > 0) {
            console.log(`[usePlayerControls][ExoPlayer] Seeking to ${timeInSeconds}`);

            isSeeking.current = true;
            exoPlayerRef.current.seek(timeInSeconds);

            // Reset seeking flag after a delay
            setTimeout(() => {
                if (isMounted.current) {
                    isSeeking.current = false;
                }
            }, 500);
            return;
        }

        // MPV Player (fallback or when useExoPlayer is false)
        if (mpvPlayerRef?.current && duration > 0) {
            console.log(`[usePlayerControls][MPV] Seeking to ${timeInSeconds}`);

            isSeeking.current = true;
            mpvPlayerRef.current.seek(timeInSeconds);

            // Reset seeking flag after a delay
            setTimeout(() => {
                if (isMounted.current) {
                    isSeeking.current = false;
                }
            }, 500);
            return;
        }

        console.log('[usePlayerControls] Cannot seek - no valid ref:', {
            hasExoRef: !!exoPlayerRef?.current,
            hasMpvRef: !!mpvPlayerRef?.current,
            useExoPlayer,
            duration
        });
    }, [duration, paused, setPaused, mpvPlayerRef, exoPlayerRef, useExoPlayer, isSeeking, isMounted]);

    const skip = useCallback((seconds: number) => {
        console.log('[usePlayerControls] skip called:', { seconds, currentTime, newTime: currentTime + seconds });
        seekToTime(currentTime + seconds);
    }, [currentTime, seekToTime]);

    return {
        togglePlayback,
        seekToTime,
        skip,
        iosWasPausedDuringSeekRef
    };
};
