import { useState, useMemo, useCallback } from 'react';
import { AudioTrack, TextTrack } from '../../utils/playerTypes';

export const usePlayerTracks = () => {
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
    const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
    const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);

    const [ksAudioTracks, setKsAudioTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);
    const [ksTextTracks, setKsTextTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);

    // Derived states or logic
    const hasAudioTracks = audioTracks.length > 0;
    const hasTextTracks = textTracks.length > 0;

    // Track selection functions
    const selectAudioTrack = useCallback((trackId: number) => {
        setSelectedAudioTrack(trackId);
    }, []);

    const selectTextTrack = useCallback((trackId: number) => {
        setSelectedTextTrack(trackId);
    }, []);

    return {
        audioTracks, setAudioTracks,
        selectedAudioTrack, setSelectedAudioTrack,
        textTracks, setTextTracks,
        selectedTextTrack, setSelectedTextTrack,
        ksAudioTracks, setKsAudioTracks,
        ksTextTracks, setKsTextTracks,
        hasAudioTracks,
        hasTextTracks,
        selectAudioTrack,
        selectTextTrack
    };
};
