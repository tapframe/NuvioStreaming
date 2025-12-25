import { useState, useEffect, useRef } from 'react';
import { storageService } from '../../../services/storageService';
import { logger } from '../../../utils/logger';
import { useSettings } from '../../../hooks/useSettings';

export const useWatchProgress = (
    id: string | undefined,
    type: string | undefined,
    episodeId: string | undefined,
    currentTime: number,
    duration: number,
    paused: boolean,
    traktAutosync: any,
    seekToTime: (time: number) => void
) => {
    const [resumePosition, setResumePosition] = useState<number | null>(null);
    const [savedDuration, setSavedDuration] = useState<number | null>(null);
    const [initialPosition, setInitialPosition] = useState<number | null>(null);
    const [showResumeOverlay, setShowResumeOverlay] = useState(false);
    const [progressSaveInterval, setProgressSaveInterval] = useState<NodeJS.Timeout | null>(null);

    const { settings: appSettings } = useSettings();
    const initialSeekTargetRef = useRef<number | null>(null);

    // Values refs for unmount cleanup
    const currentTimeRef = useRef(currentTime);
    const durationRef = useRef(duration);

    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
        durationRef.current = duration;
    }, [duration]);

    // Load Watch Progress
    useEffect(() => {
        const loadWatchProgress = async () => {
            if (id && type) {
                try {
                    const savedProgress = await storageService.getWatchProgress(id, type, episodeId);
                    console.log('[useWatchProgress] Loaded saved progress:', savedProgress);

                    if (savedProgress) {
                        const progressPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
                        console.log('[useWatchProgress] Progress percent:', progressPercent);

                        if (progressPercent < 85) {
                            setResumePosition(savedProgress.currentTime);
                            setSavedDuration(savedProgress.duration);

                            if (appSettings.alwaysResume) {
                                console.log('[useWatchProgress] Always resume enabled, setting initial position:', savedProgress.currentTime);
                                setInitialPosition(savedProgress.currentTime);
                                initialSeekTargetRef.current = savedProgress.currentTime;
                                // Don't call seekToTime here - duration is 0
                                // The seek will be handled in handleLoad callback
                            } else {
                                setShowResumeOverlay(true);
                            }
                        }
                    }
                } catch (error) {
                    logger.error('[useWatchProgress] Error loading watch progress:', error);
                }
            }
        };
        loadWatchProgress();
    }, [id, type, episodeId, appSettings.alwaysResume]);

    const saveWatchProgress = async () => {
        if (id && type && currentTimeRef.current > 0 && durationRef.current > 0) {
            const progress = {
                currentTime: currentTimeRef.current,
                duration: durationRef.current,
                lastUpdated: Date.now()
            };
            try {
                await storageService.setWatchProgress(id, type, progress, episodeId);
                await traktAutosync.handleProgressUpdate(currentTimeRef.current, durationRef.current);
            } catch (error) {
                logger.error('[useWatchProgress] Error saving watch progress:', error);
            }
        }
    };

    // Save Interval
    useEffect(() => {
        if (id && type && !paused && duration > 0) {
            if (progressSaveInterval) clearInterval(progressSaveInterval);

            const interval = setInterval(() => {
                saveWatchProgress();
            }, 10000);

            setProgressSaveInterval(interval);
            return () => {
                clearInterval(interval);
                setProgressSaveInterval(null);
            };
        }
    }, [id, type, paused, currentTime, duration]);

    // Unmount Save - deferred to allow navigation to complete first
    useEffect(() => {
        return () => {
            // Use setTimeout(0) to defer save operations to next event loop tick
            // This allows navigation animations to complete smoothly
            setTimeout(() => {
                if (id && type && durationRef.current > 0) {
                    saveWatchProgress();
                    traktAutosync.handlePlaybackEnd(currentTimeRef.current, durationRef.current, 'unmount');
                }
            }, 0);
        };
    }, [id, type]);

    return {
        resumePosition,
        savedDuration,
        initialPosition,
        setInitialPosition,
        showResumeOverlay,
        setShowResumeOverlay,
        saveWatchProgress,
        initialSeekTargetRef
    };
};
