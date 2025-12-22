import React from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from '../../utils/playerStyles';

interface SpeedActivatedOverlayProps {
    visible: boolean;
    opacity: Animated.Value;
    speed: number;
}

export const SpeedActivatedOverlay: React.FC<SpeedActivatedOverlayProps> = ({
    visible,
    opacity,
    speed
}) => {
    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.speedActivatedOverlay,
                { opacity: opacity }
            ]}
        >
            <View style={styles.speedActivatedContainer}>
                <MaterialIcons name="fast-forward" size={32} color="#FFFFFF" />
                <Text style={styles.speedActivatedText}>{speed}x Speed</Text>
            </View>
        </Animated.View>
    );
};
