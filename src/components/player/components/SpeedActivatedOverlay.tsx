import React from 'react';
import { View, Text, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SpeedActivatedOverlayProps {
    visible: boolean;
    opacity: Animated.Value | number;
    speed: number;
    screenDimensions: { width: number; height: number };
}

export const SpeedActivatedOverlay: React.FC<SpeedActivatedOverlayProps> = ({
    visible,
    opacity,
    speed,
    screenDimensions
}) => {
    // Safety check to prevent the 'height' of undefined error
    if (!visible || !screenDimensions) return null;

    return (
        <Animated.View
            style={{
                position: 'absolute',
                top: screenDimensions.height * 0.06,
                left: 0,
                right: 0,
                alignItems: 'center',
                opacity: opacity,
                zIndex: 1000,
            }}
        >
            <View style={{
                flexDirection: 'row',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: 35,
                paddingHorizontal: 16,
                paddingVertical: 10,
                alignItems: 'center',
                elevation: 5,
            }}>
                <MaterialIcons
                    name="fast-forward"
                    size={20}
                    color="white"
                    style={{ marginRight: 6 }}
                />
                <Text style={{
                    color: 'white',
                    fontSize: 15,
                    fontWeight: '600',
                }}>
                    {speed}x
                </Text>
            </View>
        </Animated.View>
    );
};

export default SpeedActivatedOverlay;
