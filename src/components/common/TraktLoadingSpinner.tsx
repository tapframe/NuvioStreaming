import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import TraktIcon from '../../../assets/rating-icons/trakt.svg';

export const TraktLoadingSpinner = () => {
    const pulseValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseValue, {
                    toValue: 1,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseValue, {
                    toValue: 0,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                })
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [pulseValue]);

    const opacity = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.65, 1],
    });

    const scale = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.95, 1.05],
    });

    return (
        <View style={styles.container}>
            <Animated.View style={{ opacity, transform: [{ scale }] }}>
                <TraktIcon width={80} height={80} />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        transform: [{ translateY: -60 }],
    },
}); 