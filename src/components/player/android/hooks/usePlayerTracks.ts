import { useState, useMemo } from 'react';
import { SelectedTrack, TextTrack, AudioTrack } from '../../utils/playerTypes';

interface Track {
    id: number;
    name: string;
    language?: string;
}

export const usePlayerTracks = () => {
    // Tracks from native player (MPV/RN-Video)
    const [rnVideoAudioTracks, setRnVideoAudioTracks] = useState<Track[]>([]);
    const [rnVideoTextTracks, setRnVideoTextTracks] = useState<Track[]>([]);

    // Selected Tracks State
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack | null>({ type: 'system' });
    const [selectedTextTrack, setSelectedTextTrack] = useState<number>(-1);

    // Unified Tracks (now just returns native tracks)
    const ksAudioTracks = useMemo(() => rnVideoAudioTracks, [rnVideoAudioTracks]);
    const ksTextTracks = useMemo(() => rnVideoTextTracks, [rnVideoTextTracks]);

    // Unified Selection
    const computedSelectedAudioTrack = useMemo(() =>
        selectedAudioTrack?.type === 'index' && selectedAudioTrack?.value !== undefined
            ? Number(selectedAudioTrack?.value)
            : null,
        [selectedAudioTrack]
    );

    const computedSelectedTextTrack = useMemo(() => selectedTextTrack, [selectedTextTrack]);

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
