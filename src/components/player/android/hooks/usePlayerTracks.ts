import { useState, useMemo } from 'react';
import { SelectedTrack, TextTrack, AudioTrack } from '../../utils/playerTypes';

interface Track {
    id: number;
    name: string;
    language?: string;
}

export const usePlayerTracks = (
    useVLC: boolean,
    vlcAudioTracks: Track[],
    vlcSubtitleTracks: Track[],
    vlcSelectedAudioTrack: number | undefined,
    vlcSelectedSubtitleTrack: number | undefined
) => {
    // React Native Video Tracks
    const [rnVideoAudioTracks, setRnVideoAudioTracks] = useState<Track[]>([]);
    const [rnVideoTextTracks, setRnVideoTextTracks] = useState<Track[]>([]);

    // Selected Tracks State
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack | null>({ type: 'system' });
    const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);

    // Unified Tracks
    const ksAudioTracks = useMemo(() =>
        useVLC ? vlcAudioTracks : rnVideoAudioTracks,
        [useVLC, vlcAudioTracks, rnVideoAudioTracks]
    );

    const ksTextTracks = useMemo(() =>
        useVLC ? vlcSubtitleTracks : rnVideoTextTracks,
        [useVLC, vlcSubtitleTracks, rnVideoTextTracks]
    );

    // Unified Selection
    const computedSelectedAudioTrack = useMemo(() =>
        useVLC
            ? (vlcSelectedAudioTrack ?? null)
            : (selectedAudioTrack?.type === 'index' && selectedAudioTrack?.value !== undefined
                ? Number(selectedAudioTrack?.value)
                : null),
        [useVLC, vlcSelectedAudioTrack, selectedAudioTrack]
    );

    const computedSelectedTextTrack = useMemo(() =>
        useVLC ? (vlcSelectedSubtitleTrack ?? -1) : selectedTextTrack,
        [useVLC, vlcSelectedSubtitleTrack, selectedTextTrack]
    );

    return {
        rnVideoAudioTracks, setRnVideoAudioTracks,
        rnVideoTextTracks, setRnVideoTextTracks,
        selectedAudioTrack, setSelectedAudioTrack,
        selectedTextTrack, setSelectedTextTrack,
        ksAudioTracks,
        ksTextTracks,
        computedSelectedAudioTrack,
        computedSelectedTextTrack
    };
};
