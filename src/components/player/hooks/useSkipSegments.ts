import { useState, useEffect, useRef } from 'react';
import { introService, SkipInterval } from '../../../services/introService';
import { logger } from '../../../utils/logger';

interface UseSkipSegmentsProps {
    imdbId?: string;
    type?: string;
    season?: number;
    episode?: number;
    malId?: string;
    kitsuId?: string;
    enabled: boolean;
}

export const useSkipSegments = ({
    imdbId,
    type,
    season,
    episode,
    malId,
    kitsuId,
    enabled
}: UseSkipSegmentsProps) => {
    const [segments, setSegments] = useState<SkipInterval[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const fetchedRef = useRef(false);
    const lastKeyRef = useRef('');

    useEffect(() => {
        const key = `${imdbId}-${season}-${episode}-${malId}-${kitsuId}`;
        
        if (!enabled || type !== 'series' || (!imdbId && !malId && !kitsuId) || !season || !episode) {
            setSegments([]);
            fetchedRef.current = false;
            return;
        }

        if (lastKeyRef.current === key && fetchedRef.current) {
            return;
        }

        lastKeyRef.current = key;
        fetchedRef.current = true;
        setIsLoading(true);

        const fetchSegments = async () => {
            try {
                const intervals = await introService.getSkipTimes(imdbId, season, episode, malId, kitsuId);
                setSegments(intervals);
            } catch (error) {
                logger.error('[useSkipSegments] Error fetching skip data:', error);
                setSegments([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSegments();
    }, [imdbId, type, season, episode, malId, kitsuId, enabled]);

    const getActiveSegment = (currentTime: number) => {
        return segments.find(
            s => currentTime >= s.startTime && currentTime < (s.endTime - 0.5)
        );
    };

    const outroSegment = segments.find(s => ['ed', 'outro', 'mixed-ed'].includes(s.type));

    return {
        segments,
        getActiveSegment,
        outroSegment,
        isLoading
    };
};
