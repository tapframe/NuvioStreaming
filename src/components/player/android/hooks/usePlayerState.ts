import { useState, useRef } from 'react';
import { Dimensions } from 'react-native';
import { ResizeModeType, SelectedTrack } from '../../utils/playerTypes';

export const usePlayerState = () => {
    const [paused, setPaused] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);

    // UI State
    const [showControls, setShowControls] = useState(true);
    const [resizeMode, setResizeMode] = useState<ResizeModeType>('contain');
    const [isBuffering, setIsBuffering] = useState(false);
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);

    // Layout State
    const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
    const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('screen'));

    // Logic State
    const isSeeking = useRef(false);
    const isDragging = useRef(false);
    const isMounted = useRef(true);

    return {
        paused, setPaused,
        currentTime, setCurrentTime,
        duration, setDuration,
        buffered, setBuffered,
        showControls, setShowControls,
        resizeMode, setResizeMode,
        isBuffering, setIsBuffering,
        isVideoLoaded, setIsVideoLoaded,
        videoAspectRatio, setVideoAspectRatio,
        screenDimensions, setScreenDimensions,
        isSeeking,
        isDragging,
        isMounted,
    };
};
