import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import {
    TapGestureHandler,
    PanGestureHandler,
    LongPressGestureHandler,
    State
} from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import { styles as localStyles } from '../../utils/playerStyles';

interface GestureControlsProps {
    screenDimensions: { width: number, height: number };
    gestureControls: any;
    onLongPressActivated: () => void;
    onLongPressEnd: () => void;
    onLongPressStateChange: (event: any) => void;
    toggleControls: () => void;
    showControls: boolean;
    hideControls: () => void;
    volume: number;
    brightness: number;
    controlsTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
    resizeMode?: string;
}

export const GestureControls: React.FC<GestureControlsProps> = ({
    screenDimensions,
    gestureControls,
    onLongPressActivated,
    onLongPressEnd,
    onLongPressStateChange,
    toggleControls,
    showControls,
    hideControls,
    volume,
    brightness,
    controlsTimeout,
    resizeMode = 'contain'
}) => {

    const getVolumeIcon = (value: number) => {
        if (value === 0) return 'volume-off';
        if (value < 0.3) return 'volume-mute';
        if (value < 0.6) return 'volume-down';
        return 'volume-up';
    };

    const getBrightnessIcon = (value: number) => {
        if (value < 0.3) return 'brightness-low';
        if (value < 0.7) return 'brightness-medium';
        return 'brightness-high';
    };

    return (
        <>
            {/* Left side gesture handler - brightness + tap + long press */}
            <LongPressGestureHandler
                onActivated={onLongPressActivated}
                onEnded={onLongPressEnd}
                onHandlerStateChange={onLongPressStateChange}
                minDurationMs={500}
                shouldCancelWhenOutside={false}
                simultaneousHandlers={[]}
            >
                <PanGestureHandler
                    onGestureEvent={gestureControls.onBrightnessGestureEvent}
                    activeOffsetY={[-10, 10]}
                    failOffsetX={[-30, 30]}
                    shouldCancelWhenOutside={false}
                    simultaneousHandlers={[]}
                    maxPointers={1}
                >
                    <TapGestureHandler
                        onActivated={toggleControls}
                        shouldCancelWhenOutside={false}
                        simultaneousHandlers={[]}
                    >
                        <View style={{
                            position: 'absolute',
                            top: screenDimensions.height * 0.15,
                            left: 0,
                            width: screenDimensions.width * 0.4,
                            height: screenDimensions.height * 0.7,
                            zIndex: 10,
                        }} />
                    </TapGestureHandler>
                </PanGestureHandler>
            </LongPressGestureHandler>

            {/* Right side gesture handler - volume + tap + long press */}
            <LongPressGestureHandler
                onActivated={onLongPressActivated}
                onEnded={onLongPressEnd}
                onHandlerStateChange={onLongPressStateChange}
                minDurationMs={500}
                shouldCancelWhenOutside={false}
                simultaneousHandlers={[]}
            >
                <PanGestureHandler
                    onGestureEvent={gestureControls.onVolumeGestureEvent}
                    activeOffsetY={[-10, 10]}
                    failOffsetX={[-30, 30]}
                    shouldCancelWhenOutside={false}
                    simultaneousHandlers={[]}
                    maxPointers={1}
                >
                    <TapGestureHandler
                        onActivated={toggleControls}
                        shouldCancelWhenOutside={false}
                        simultaneousHandlers={[]}
                    >
                        <View style={{
                            position: 'absolute',
                            top: screenDimensions.height * 0.15,
                            right: 0,
                            width: screenDimensions.width * 0.4,
                            height: screenDimensions.height * 0.7,
                            zIndex: 10,
                        }} />
                    </TapGestureHandler>
                </PanGestureHandler>
            </LongPressGestureHandler>

            {/* Center area tap handler */}
            <TapGestureHandler
                onActivated={() => {
                    if (showControls) {
                        const timeoutId = setTimeout(() => {
                            hideControls();
                        }, 0);
                        if (controlsTimeout.current) {
                            clearTimeout(controlsTimeout.current);
                        }
                        controlsTimeout.current = timeoutId;
                    } else {
                        toggleControls();
                    }
                }}
                shouldCancelWhenOutside={false}
                simultaneousHandlers={[]}
            >
                <View style={{
                    position: 'absolute',
                    top: screenDimensions.height * 0.15,
                    left: screenDimensions.width * 0.4,
                    width: screenDimensions.width * 0.2,
                    height: screenDimensions.height * 0.7,
                    zIndex: 5,
                }} />
            </TapGestureHandler>

            {/* Volume/Brightness Pill Overlay */}
            {(gestureControls.showVolumeOverlay || gestureControls.showBrightnessOverlay) && (
                <View style={localStyles.gestureIndicatorContainer}>
                    <View style={localStyles.gestureIndicatorPill}>
                        <View
                            style={[
                                localStyles.iconWrapper,
                                {
                                    backgroundColor: gestureControls.showVolumeOverlay && volume === 0
                                        ? 'rgba(242, 184, 181)'
                                        : 'rgba(59, 59, 59)'
                                }
                            ]}
                        >
                            <MaterialIcons
                                name={
                                    gestureControls.showVolumeOverlay
                                        ? getVolumeIcon(volume)
                                        : getBrightnessIcon(brightness)
                                }
                                size={24}
                                color={
                                    gestureControls.showVolumeOverlay && volume === 0
                                        ? 'rgba(96, 20, 16)'
                                        : 'rgba(255, 255, 255)'
                                }
                            />
                        </View>

                        <Text
                            style={[
                                localStyles.gestureText,
                                gestureControls.showVolumeOverlay && volume === 0 && { color: 'rgba(242, 184, 181)' }
                            ]}
                        >
                            {gestureControls.showVolumeOverlay && volume === 0
                                ? "Muted"
                                : `${Math.round((gestureControls.showVolumeOverlay ? volume : brightness) * 100)}%`
                            }
                        </Text>
                    </View>
                </View>
            )}

            {/* Aspect Ratio Overlay */}
            {gestureControls.showResizeModeOverlay && (
                <View style={localStyles.gestureIndicatorContainer}>
                    <Animated.View
                        style={[
                            localStyles.gestureIndicatorPill,
                            { opacity: gestureControls.resizeModeOverlayOpacity }
                        ]}
                    >
                        <View
                            style={[
                                localStyles.iconWrapper,
                                {
                                    backgroundColor: 'rgba(59, 59, 59)'
                                }
                            ]}
                        >
                            <MaterialIcons
                                name="aspect-ratio"
                                size={24}
                                color="rgba(255, 255, 255)"
                            />
                        </View>

                        <Text
                            style={localStyles.gestureText}
                        >
                            {resizeMode.charAt(0).toUpperCase() + resizeMode.slice(1)}
                        </Text>
                    </Animated.View>
                </View>
            )}
        </>
    );
};
