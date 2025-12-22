import { useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { logger } from '../../../../utils/logger';

const DEBUG_MODE = true; // Temporarily enable for debugging seek
const END_EPSILON = 0.3;

export const usePlayerControls = (
    mpvPlayerRef: any,
    vlcPlayerRef: any,
    useVLC: boolean,
    paused: boolean,
    setPaused: (paused: boolean) => void,
    currentTime: number,
    duration: number,
    isSeeking: React.MutableRefObject<boolean>,
    isMounted: React.MutableRefObject<boolean>
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
            useVLC,
            hasMpvRef: !!mpvPlayerRef?.current,
            hasVlcRef: !!vlcPlayerRef?.current,
            duration,
            isSeeking: isSeeking.current
        });

        if (useVLC) {
            if (vlcPlayerRef.current && duration > 0) {
                logger.log(`[usePlayerControls][VLC] Seeking to ${timeInSeconds}`);
                vlcPlayerRef.current.seek(timeInSeconds);
            }
        } else {
            // MPV Player
            if (mpvPlayerRef.current && duration > 0) {
                console.log(`[usePlayerControls][MPV] Seeking to ${timeInSeconds}`);

                isSeeking.current = true;
                mpvPlayerRef.current.seek(timeInSeconds);

                // Reset seeking flag after a delay
                setTimeout(() => {
                    if (isMounted.current) {
                        isSeeking.current = false;
                    }
                }, 500);
            } else {
                console.log('[usePlayerControls][MPV] Cannot seek - ref or duration invalid:', {
                    hasRef: !!mpvPlayerRef?.current,
                    duration
                });
            }
        }
    }, [useVLC, duration, paused, setPaused, mpvPlayerRef, vlcPlayerRef, isSeeking, isMounted]);

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
