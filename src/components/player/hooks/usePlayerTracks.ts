/**
 * Shared Player Tracks Hook
 * Used by both Android (VLC) and iOS (KSPlayer) players
 */
import { useState, useCallback } from 'react';
import { AudioTrack, TextTrack } from '../utils/playerTypes';

export const usePlayerTracks = () => {
    // React-native-video style tracks
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(null);
    const [textTracks, setTextTracks] = useState<TextTrack[]>([]);
    const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);

    // KS/VLC style tracks (simpler format)
    const [ksAudioTracks, setKsAudioTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);
    const [ksTextTracks, setKsTextTracks] = useState<Array<{ id: number, name: string, language?: string }>>([]);

    // Derived states
    const hasAudioTracks = audioTracks.length > 0 || ksAudioTracks.length > 0;
    const hasTextTracks = textTracks.length > 0 || ksTextTracks.length > 0;

    // Track selection functions
    const selectAudioTrack = useCallback((trackId: number) => {
        setSelectedAudioTrack(trackId);
    }, []);

    const selectTextTrack = useCallback((trackId: number) => {
        setSelectedTextTrack(trackId);
    }, []);

    return {
        // Standard tracks
        audioTracks, setAudioTracks,
        selectedAudioTrack, setSelectedAudioTrack,
        textTracks, setTextTracks,
        selectedTextTrack, setSelectedTextTrack,
        // KS/VLC tracks
        ksAudioTracks, setKsAudioTracks,
        ksTextTracks, setKsTextTracks,
        // Helpers
        hasAudioTracks,
        hasTextTracks,
        selectAudioTrack,
        selectTextTrack
    };
};
