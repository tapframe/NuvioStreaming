import { useMemo } from 'react';
import { logger } from '../../../../utils/logger';

export const useNextEpisode = (
    type: string | undefined,
    season: number | undefined,
    episode: number | undefined,
    groupedEpisodes: any,
    metadataGroupedEpisodes: any,
    episodeId: string | undefined
) => {
    // Current description
    const currentEpisodeDescription = useMemo(() => {
        try {
            if ((type as any) !== 'series') return '';
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
            if ((type as any) !== 'series' || !season || !episode) return null;
            const sourceGroups = groupedEpisodes && Object.keys(groupedEpisodes || {}).length > 0
                ? groupedEpisodes
                : (metadataGroupedEpisodes || {});

            const allEpisodes = Object.values(sourceGroups || {}).flat() as any[];
            if (!allEpisodes || allEpisodes.length === 0) return null;

            let nextEp = allEpisodes.find((ep: any) =>
                ep.season_number === season && ep.episode_number === episode + 1
            );

            if (!nextEp) {
                nextEp = allEpisodes.find((ep: any) =>
                    ep.season_number === season + 1 && ep.episode_number === 1
                );
            }
            return nextEp;
        } catch {
            return null;
        }
    }, [type, season, episode, groupedEpisodes, metadataGroupedEpisodes]);

    return { currentEpisodeDescription, nextEpisode };
};
