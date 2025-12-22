import { useState } from 'react';
import {
    DEFAULT_SUBTITLE_SIZE,
    SubtitleCue,
    SubtitleSegment,
    WyzieSubtitle
} from '../../utils/playerTypes';

export const useCustomSubtitles = () => {
    // Data State
    const [customSubtitles, setCustomSubtitles] = useState<SubtitleCue[]>([]);
    const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
    const [currentFormattedSegments, setCurrentFormattedSegments] = useState<SubtitleSegment[][]>([]);
    const [availableSubtitles, setAvailableSubtitles] = useState<WyzieSubtitle[]>([]);
    const [useCustomSubtitles, setUseCustomSubtitles] = useState<boolean>(false);

    // Loading State
    const [isLoadingSubtitles, setIsLoadingSubtitles] = useState<boolean>(false);
    const [isLoadingSubtitleList, setIsLoadingSubtitleList] = useState<boolean>(false);

    // Styling State
    const [subtitleSize, setSubtitleSize] = useState<number>(DEFAULT_SUBTITLE_SIZE);
    const [subtitleBackground, setSubtitleBackground] = useState<boolean>(false);
    const [subtitleTextColor, setSubtitleTextColor] = useState<string>('#FFFFFF');
    const [subtitleBgOpacity, setSubtitleBgOpacity] = useState<number>(0.7);
    const [subtitleTextShadow, setSubtitleTextShadow] = useState<boolean>(true);
    const [subtitleOutline, setSubtitleOutline] = useState<boolean>(true);
    const [subtitleOutlineColor, setSubtitleOutlineColor] = useState<string>('#000000');
    const [subtitleOutlineWidth, setSubtitleOutlineWidth] = useState<number>(4);
    const [subtitleAlign, setSubtitleAlign] = useState<'center' | 'left' | 'right'>('center');
    const [subtitleBottomOffset, setSubtitleBottomOffset] = useState<number>(10);
    const [subtitleLetterSpacing, setSubtitleLetterSpacing] = useState<number>(0);
    const [subtitleLineHeightMultiplier, setSubtitleLineHeightMultiplier] = useState<number>(1.2);
    const [subtitleOffsetSec, setSubtitleOffsetSec] = useState<number>(0);

    return {
        customSubtitles, setCustomSubtitles,
        currentSubtitle, setCurrentSubtitle,
        currentFormattedSegments, setCurrentFormattedSegments,
        availableSubtitles, setAvailableSubtitles,
        useCustomSubtitles, setUseCustomSubtitles,
        isLoadingSubtitles, setIsLoadingSubtitles,
        isLoadingSubtitleList, setIsLoadingSubtitleList,
        subtitleSize, setSubtitleSize,
        subtitleBackground, setSubtitleBackground,
        subtitleTextColor, setSubtitleTextColor,
        subtitleBgOpacity, setSubtitleBgOpacity,
        subtitleTextShadow, setSubtitleTextShadow,
        subtitleOutline, setSubtitleOutline,
        subtitleOutlineColor, setSubtitleOutlineColor,
        subtitleOutlineWidth, setSubtitleOutlineWidth,
        subtitleAlign, setSubtitleAlign,
        subtitleBottomOffset, setSubtitleBottomOffset,
        subtitleLetterSpacing, setSubtitleLetterSpacing,
        subtitleLineHeightMultiplier, setSubtitleLineHeightMultiplier,
        subtitleOffsetSec, setSubtitleOffsetSec
    };
};
