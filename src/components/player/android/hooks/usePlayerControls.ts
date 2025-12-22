import { useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { logger } from '../../../../utils/logger';

const DEBUG_MODE = false;
const END_EPSILON = 0.3;

export const usePlayerControls = (
    videoRef: any,
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

        if (useVLC) {
            if (vlcPlayerRef.current && duration > 0) {
                if (DEBUG_MODE) logger.log(`[usePlayerControls][VLC] Seeking to ${timeInSeconds}`);
                vlcPlayerRef.current.seek(timeInSeconds);
            }
        } else {
            if (videoRef.current && duration > 0 && !isSeeking.current) {
                if (DEBUG_MODE) logger.log(`[usePlayerControls] Seeking to ${timeInSeconds}`);

                isSeeking.current = true;

                if (Platform.OS === 'ios') {
                    iosWasPausedDuringSeekRef.current = paused;
                    if (!paused) setPaused(true);
                }

                // Actually perform the seek
                videoRef.current.seek(timeInSeconds);

                setTimeout(() => {
                    if (isMounted.current && isSeeking.current) {
                        isSeeking.current = false;
                        if (Platform.OS === 'ios' && iosWasPausedDuringSeekRef.current === false) {
                            setPaused(false);
                            iosWasPausedDuringSeekRef.current = null;
                        }
                    }
                }, 500);
            }
        }
    }, [useVLC, duration, paused, setPaused, videoRef, vlcPlayerRef, isSeeking, isMounted]);

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
