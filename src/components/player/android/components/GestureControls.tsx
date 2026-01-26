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

    // Create refs for all gesture handlers to enable cross-referencing
    const leftPanRef = React.useRef(null);
    const rightPanRef = React.useRef(null);
    const leftTapRef = React.useRef(null);
    const rightTapRef = React.useRef(null);
    const centerTapRef = React.useRef(null);
    const leftLongPressRef = React.useRef(null);
    const rightLongPressRef = React.useRef(null);

    // Shared style for left side gesture area
    const leftSideStyle = {
        position: 'absolute' as const,
        top: screenDimensions.height * 0.15,
        left: 0,
        width: screenDimensions.width * 0.4,
        height: screenDimensions.height * 0.7,
        zIndex: 10,
    };

    // Shared style for right side gesture area
    const rightSideStyle = {
        position: 'absolute' as const,
        top: screenDimensions.height * 0.15,
        right: 0,
        width: screenDimensions.width * 0.4,
        height: screenDimensions.height * 0.7,
        zIndex: 10,
    };

    return (
        <>
            {/* Left side gestures - brightness + tap + long press (flat structure) */}
            <LongPressGestureHandler
                ref={leftLongPressRef}
                onActivated={onLongPressActivated}
                onEnded={onLongPressEnd}
                onHandlerStateChange={onLongPressStateChange}
                minDurationMs={500}
                shouldCancelWhenOutside={false}
            >
                <View style={leftSideStyle} />
            </LongPressGestureHandler>

            <PanGestureHandler
                ref={leftPanRef}
                onGestureEvent={gestureControls.onBrightnessGestureEvent}
                activeOffsetY={[-15, 15]}
                failOffsetX={[-60, 60]}
                shouldCancelWhenOutside={false}
                maxPointers={1}
            >
                <View style={leftSideStyle} />
            </PanGestureHandler>

            <TapGestureHandler
                ref={leftTapRef}
                onActivated={toggleControls}
                shouldCancelWhenOutside={false}
                waitFor={[leftPanRef, leftLongPressRef]}
            >
                <View style={leftSideStyle} />
            </TapGestureHandler>

            {/* Right side gestures - volume + tap + long press (flat structure) */}
            <LongPressGestureHandler
                ref={rightLongPressRef}
                onActivated={onLongPressActivated}
                onEnded={onLongPressEnd}
                onHandlerStateChange={onLongPressStateChange}
                minDurationMs={500}
                shouldCancelWhenOutside={false}
            >
                <View style={rightSideStyle} />
            </LongPressGestureHandler>

            <PanGestureHandler
                ref={rightPanRef}
                onGestureEvent={gestureControls.onVolumeGestureEvent}
                activeOffsetY={[-15, 15]}
                failOffsetX={[-60, 60]}
                shouldCancelWhenOutside={false}
                maxPointers={1}
            >
                <View style={rightSideStyle} />
            </PanGestureHandler>

            <TapGestureHandler
                ref={rightTapRef}
                onActivated={toggleControls}
                shouldCancelWhenOutside={false}
                waitFor={[rightPanRef, rightLongPressRef]}
            >
                <View style={rightSideStyle} />
            </TapGestureHandler>

            {/* Center area tap handler */}
            <TapGestureHandler
                ref={centerTapRef}
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
            >
                <View style={{
                    position: 'absolute',
                    top: screenDimensions.height * 0.15,
                    left: screenDimensions.width * 0.4,
                    width: screenDimensions.width * 0.2,
                    height: screenDimensions.height * 0.7,
                    zIndex: 10,
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
