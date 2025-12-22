import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { logger } from '../../../../utils/logger';
import { VlcPlayerRef } from '../../VlcVideoPlayer';

interface Track {
    id: number;
    name: string;
    language?: string;
}

const DEBUG_MODE = false;

export const useVlcPlayer = (useVLC: boolean, paused: boolean, currentTime: number) => {
    const [vlcAudioTracks, setVlcAudioTracks] = useState<Track[]>([]);
    const [vlcSubtitleTracks, setVlcSubtitleTracks] = useState<Track[]>([]);
    const [vlcSelectedAudioTrack, setVlcSelectedAudioTrack] = useState<number | undefined>(undefined);
    const [vlcSelectedSubtitleTrack, setVlcSelectedSubtitleTrack] = useState<number | undefined>(undefined);
    const [vlcRestoreTime, setVlcRestoreTime] = useState<number | undefined>(undefined);
    const [forceVlcRemount, setForceVlcRemount] = useState(false);
    const [vlcKey, setVlcKey] = useState('vlc-initial');

    const vlcPlayerRef = useRef<VlcPlayerRef>(null);
    const vlcLoadedRef = useRef<boolean>(false);
    const trackUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Handle VLC pause/play interactions
    useEffect(() => {
        if (useVLC && vlcLoadedRef.current && vlcPlayerRef.current) {
            if (paused) {
                vlcPlayerRef.current.pause();
            } else {
                vlcPlayerRef.current.play();
            }
        }
    }, [useVLC, paused]);

    // Reset forceVlcRemount when VLC becomes inactive
    useEffect(() => {
        if (!useVLC && forceVlcRemount) {
            setForceVlcRemount(false);
        }
    }, [useVLC, forceVlcRemount]);

    // Track selection
    const selectVlcAudioTrack = useCallback((trackId: number | null) => {
        setVlcSelectedAudioTrack(trackId ?? undefined);
        logger.log('[AndroidVideoPlayer][VLC] Audio track selected:', trackId);
    }, []);

    const selectVlcSubtitleTrack = useCallback((trackId: number | null) => {
        setVlcSelectedSubtitleTrack(trackId ?? undefined);
        logger.log('[AndroidVideoPlayer][VLC] Subtitle track selected:', trackId);
    }, []);

    // Track updates handler
    const handleVlcTracksUpdate = useCallback((tracks: { audio: any[], subtitle: any[] }) => {
        if (!tracks) return;

        if (trackUpdateTimeoutRef.current) {
            clearTimeout(trackUpdateTimeoutRef.current);
        }

        trackUpdateTimeoutRef.current = setTimeout(() => {
            const { audio = [], subtitle = [] } = tracks;
            let hasUpdates = false;

            // Process Audio
            if (Array.isArray(audio) && audio.length > 0) {
                const formattedAudio = audio.map(track => ({
                    id: track.id,
                    name: track.name || `Track ${track.id + 1}`,
                    language: track.language
                }));

                const audioChanged = formattedAudio.length !== vlcAudioTracks.length ||
                    formattedAudio.some((track, index) => {
                        const existing = vlcAudioTracks[index];
                        return !existing || track.id !== existing.id || track.name !== existing.name;
                    });

                if (audioChanged) {
                    setVlcAudioTracks(formattedAudio);
                    hasUpdates = true;
                }
            }

            // Process Subtitles
            if (Array.isArray(subtitle) && subtitle.length > 0) {
                const formattedSubs = subtitle.map(track => ({
                    id: track.id,
                    name: track.name || `Track ${track.id + 1}`,
                    language: track.language
                }));

                const subsChanged = formattedSubs.length !== vlcSubtitleTracks.length ||
                    formattedSubs.some((track, index) => {
                        const existing = vlcSubtitleTracks[index];
                        return !existing || track.id !== existing.id || track.name !== existing.name;
                    });

                if (subsChanged) {
                    setVlcSubtitleTracks(formattedSubs);
                    hasUpdates = true;
                }
            }

            trackUpdateTimeoutRef.current = null;
        }, 100);
    }, [vlcAudioTracks, vlcSubtitleTracks]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (trackUpdateTimeoutRef.current) {
                clearTimeout(trackUpdateTimeoutRef.current);
            }
        };
    }, []);

    const remountVlc = useCallback((reason: string) => {
        if (useVLC) {
            logger.log(`[VLC] Forcing complete remount: ${reason}`);
            setVlcRestoreTime(currentTime);
            setForceVlcRemount(true);
            vlcLoadedRef.current = false;
            setTimeout(() => {
                setForceVlcRemount(false);
                setVlcKey(`vlc-${reason}-${Date.now()}`);
            }, 100);
        }
    }, [useVLC, currentTime]);

    return {
        vlcAudioTracks,
        vlcSubtitleTracks,
        vlcSelectedAudioTrack,
        vlcSelectedSubtitleTrack,
        selectVlcAudioTrack,
        selectVlcSubtitleTrack,
        vlcPlayerRef,
        vlcLoadedRef,
        forceVlcRemount,
        vlcRestoreTime,
        vlcKey,
        handleVlcTracksUpdate,
        remountVlc,
    };
};
