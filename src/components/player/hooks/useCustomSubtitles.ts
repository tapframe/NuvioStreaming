/**
 * Shared Custom Subtitles Hook
 * Used by both Android (VLC) and iOS (KSPlayer) players
 */
import { useState, useEffect } from 'react';
import {
    DEFAULT_SUBTITLE_SIZE,
    SubtitleCue,
    SubtitleSegment,
    WyzieSubtitle
} from '../utils/playerTypes';
import { storageService } from '../../../services/storageService';

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
    const [subtitleBottomOffset, setSubtitleBottomOffset] = useState<number>(20);
    const [subtitleLetterSpacing, setSubtitleLetterSpacing] = useState<number>(0);
    const [subtitleLineHeightMultiplier, setSubtitleLineHeightMultiplier] = useState<number>(1.2);
    const [subtitleOffsetSec, setSubtitleOffsetSec] = useState<number>(0);

    // Load subtitle settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            const settings = await storageService.getSubtitleSettings();
            if (settings) {
                if (settings.subtitleSize !== undefined) setSubtitleSize(settings.subtitleSize);
                if (settings.subtitleBackground !== undefined) setSubtitleBackground(settings.subtitleBackground);
                if (settings.subtitleTextColor !== undefined) setSubtitleTextColor(settings.subtitleTextColor);
                if (settings.subtitleBgOpacity !== undefined) setSubtitleBgOpacity(settings.subtitleBgOpacity);
                if (settings.subtitleTextShadow !== undefined) setSubtitleTextShadow(settings.subtitleTextShadow);
                if (settings.subtitleOutline !== undefined) setSubtitleOutline(settings.subtitleOutline);
                if (settings.subtitleOutlineColor !== undefined) setSubtitleOutlineColor(settings.subtitleOutlineColor);
                if (settings.subtitleOutlineWidth !== undefined) setSubtitleOutlineWidth(settings.subtitleOutlineWidth);
                if (settings.subtitleAlign !== undefined) setSubtitleAlign(settings.subtitleAlign);
                if (settings.subtitleBottomOffset !== undefined) setSubtitleBottomOffset(settings.subtitleBottomOffset);
                if (settings.subtitleLetterSpacing !== undefined) setSubtitleLetterSpacing(settings.subtitleLetterSpacing);
                if (settings.subtitleLineHeightMultiplier !== undefined) setSubtitleLineHeightMultiplier(settings.subtitleLineHeightMultiplier);
            }
        };
        loadSettings();
    }, []);

    // Save subtitle settings when they change
    useEffect(() => {
        const saveSettings = async () => {
            await storageService.saveSubtitleSettings({
                subtitleSize,
                subtitleBackground,
                subtitleTextColor,
                subtitleBgOpacity,
                subtitleTextShadow,
                subtitleOutline,
                subtitleOutlineColor,
                subtitleOutlineWidth,
                subtitleAlign,
                subtitleBottomOffset,
                subtitleLetterSpacing,
                subtitleLineHeightMultiplier,
            });
        };
        saveSettings();
    }, [
        subtitleSize, subtitleBackground, subtitleTextColor, subtitleBgOpacity,
        subtitleTextShadow, subtitleOutline, subtitleOutlineColor, subtitleOutlineWidth,
        subtitleAlign, subtitleBottomOffset, subtitleLetterSpacing, subtitleLineHeightMultiplier
    ]);

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
