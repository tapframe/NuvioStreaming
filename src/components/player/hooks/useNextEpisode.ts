/**
 * Shared Next Episode Hook
 * Used by both Android (VLC) and iOS (KSPlayer) players
 */
import { useMemo } from 'react';

interface NextEpisodeConfig {
    type: string | undefined;
    season: number | undefined;
    episode: number | undefined;
    groupedEpisodes: Record<string, any[]> | undefined;
    episodeId?: string;
}

export const useNextEpisode = (config: NextEpisodeConfig) => {
    const { type, season, episode, groupedEpisodes, episodeId } = config;

    // Current description
    const currentEpisodeDescription = useMemo(() => {
        try {
            if (type !== 'series') return '';
            const allEpisodes = Object.values(groupedEpisodes || {}).flat() as any[];
            if (!allEpisodes || allEpisodes.length === 0) return '';

            let match: any | null = null;
            if (episodeId) {
                match = allEpisodes.find(ep => ep?.stremioId === episodeId || String(ep?.id) === String(episodeId));
            }
            if (!match && season && episode) {
                match = allEpisodes.find(ep => ep?.season_number === season && ep?.episode_number === episode);
            }
            return (match?.overview || '').trim();
        } catch {
            return '';
        }
    }, [type, groupedEpisodes, episodeId, season, episode]);

    // Next Episode
    const nextEpisode = useMemo(() => {
        try {
            if (type !== 'series' || !season || !episode) return null;
            const sourceGroups = groupedEpisodes || {};

            const allEpisodes = Object.values(sourceGroups).flat() as any[];
            if (!allEpisodes || allEpisodes.length === 0) return null;

            // Try to find next episode in same season
            let nextEp = allEpisodes.find((ep: any) =>
                ep.season_number === season && ep.episode_number === episode + 1
            );

            // If not found, try first episode of next season
            if (!nextEp) {
                nextEp = allEpisodes.find((ep: any) =>
                    ep.season_number === season + 1 && ep.episode_number === 1
                );
            }
            return nextEp;
        } catch {
            return null;
        }
    }, [type, season, episode, groupedEpisodes]);

    return { currentEpisodeDescription, nextEpisode };
};
