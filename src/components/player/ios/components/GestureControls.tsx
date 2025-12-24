import React from 'react';
import { View, Text, Animated } from 'react-native';
import {
    TapGestureHandler,
    PanGestureHandler,
    LongPressGestureHandler,
} from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';

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
    controlsTimeout
}) => {
    // Helper to get dimensions (using passed screenDimensions)
    const getDimensions = () => screenDimensions;

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

            {/* Volume Overlay */}
            {gestureControls.showVolumeOverlay && (
                <Animated.View
                    style={{
                        position: 'absolute',
                        left: getDimensions().width / 2 - 60,
                        top: getDimensions().height / 2 - 60,
                        opacity: gestureControls.volumeOverlayOpacity,
                        zIndex: 1000,
                    }}
                >
                    <View style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        borderRadius: 12,
                        padding: 16,
                        alignItems: 'center',
                        width: 120,
                        height: 120,
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.5,
                        shadowRadius: 8,
                        elevation: 10,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                    }}>
                        <MaterialIcons
                            name={volume === 0 ? "volume-off" : volume < 30 ? "volume-mute" : volume < 70 ? "volume-down" : "volume-up"}
                            size={24}
                            color={volume === 0 ? "#FF6B6B" : "#FFFFFF"}
                            style={{ marginBottom: 8 }}
                        />

                        {/* Horizontal Dotted Progress Bar */}
                        <View style={{
                            width: 80,
                            height: 6,
                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                            borderRadius: 3,
                            position: 'relative',
                            overflow: 'hidden',
                            marginBottom: 8,
                        }}>
                            {/* Dotted background */}
                            <View style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 1,
                            }}>
                                {Array.from({ length: 16 }, (_, i) => (
                                    <View
                                        key={i}
                                        style={{
                                            width: 1.5,
                                            height: 1.5,
                                            backgroundColor: 'rgba(255, 255, 255, 0.3)',
                                            borderRadius: 0.75,
                                        }}
                                    />
                                ))}
                            </View>

                            {/* Progress fill */}
                            <View style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: `${volume}%`,
                                height: 6,
                                backgroundColor: volume === 0 ? '#FF6B6B' : '#E50914',
                                borderRadius: 3,
                                shadowColor: volume === 0 ? '#FF6B6B' : '#E50914',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.6,
                                shadowRadius: 2,
                            }} />
                        </View>

                        <Text style={{
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontWeight: '600',
                            letterSpacing: 0.5,
                        }}>
                            {Math.round(volume)}%
                        </Text>
                    </View>
                </Animated.View>
            )}

            {/* Brightness Overlay */}
            {gestureControls.showBrightnessOverlay && (
                <Animated.View
                    style={{
                        position: 'absolute',
                        left: getDimensions().width / 2 - 60,
                        top: getDimensions().height / 2 - 60,
                        opacity: gestureControls.brightnessOverlayOpacity,
                        zIndex: 1000,
                    }}
                >
                    <View style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        borderRadius: 12,
                        padding: 16,
                        alignItems: 'center',
                        width: 120,
                        height: 120,
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.5,
                        shadowRadius: 8,
                        elevation: 10,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                    }}>
                        <MaterialIcons
                            name={brightness < 0.2 ? "brightness-low" : brightness < 0.5 ? "brightness-medium" : brightness < 0.8 ? "brightness-high" : "brightness-auto"}
                            size={24}
                            color={brightness < 0.2 ? "#FFD700" : "#FFFFFF"}
                            style={{ marginBottom: 8 }}
                        />

                        {/* Horizontal Dotted Progress Bar */}
                        <View style={{
                            width: 80,
                            height: 6,
                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                            borderRadius: 3,
                            position: 'relative',
                            overflow: 'hidden',
                            marginBottom: 8,
                        }}>
                            {/* Dotted background */}
                            <View style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingHorizontal: 1,
                            }}>
                                {Array.from({ length: 16 }, (_, i) => (
                                    <View
                                        key={i}
                                        style={{
                                            width: 1.5,
                                            height: 1.5,
                                            backgroundColor: 'rgba(255, 255, 255, 0.3)',
                                            borderRadius: 0.75,
                                        }}
                                    />
                                ))}
                            </View>

                            {/* Progress fill */}
                            <View style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: `${brightness * 100}%`,
                                height: 6,
                                backgroundColor: brightness < 0.2 ? '#FFD700' : '#FFA500',
                                borderRadius: 3,
                                shadowColor: brightness < 0.2 ? '#FFD700' : '#FFA500',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.6,
                                shadowRadius: 2,
                            }} />
                        </View>

                        <Text style={{
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontWeight: '600',
                            letterSpacing: 0.5,
                        }}>
                            {Math.round(brightness * 100)}%
                        </Text>
                    </View>
                </Animated.View>
            )}
        </>
    );
};
