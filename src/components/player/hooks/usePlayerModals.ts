/**
 * Shared Player Modals Hook
 * Used by both Android (VLC) and iOS (KSPlayer) players
 */
import { useState } from 'react';
import { Episode } from '../../../types/metadata';

export const usePlayerModals = () => {
    const [showAudioModal, setShowAudioModal] = useState(false);
    const [showSubtitleModal, setShowSubtitleModal] = useState(false);
    const [showSpeedModal, setShowSpeedModal] = useState(false);
    const [showSourcesModal, setShowSourcesModal] = useState(false);
    const [showEpisodesModal, setShowEpisodesModal] = useState(false);
    const [showEpisodeStreamsModal, setShowEpisodeStreamsModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [showSubtitleLanguageModal, setShowSubtitleLanguageModal] = useState(false);
    const [showCastDetails, setShowCastDetails] = useState(false);

    // Some modals have associated data
    const [selectedEpisodeForStreams, setSelectedEpisodeForStreams] = useState<Episode | null>(null);
    const [errorDetails, setErrorDetails] = useState<string>('');
    const [selectedCastMember, setSelectedCastMember] = useState<any>(null);

    return {
        showAudioModal, setShowAudioModal,
        showSubtitleModal, setShowSubtitleModal,
        showSpeedModal, setShowSpeedModal,
        showSourcesModal, setShowSourcesModal,
        showEpisodesModal, setShowEpisodesModal,
        showEpisodeStreamsModal, setShowEpisodeStreamsModal,
        showErrorModal, setShowErrorModal,
        showSubtitleLanguageModal, setShowSubtitleLanguageModal,
        showCastDetails, setShowCastDetails,
        selectedEpisodeForStreams, setSelectedEpisodeForStreams,
        errorDetails, setErrorDetails,
        selectedCastMember, setSelectedCastMember
    };
};
