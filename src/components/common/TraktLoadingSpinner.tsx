import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import TraktIcon from '../../../assets/rating-icons/trakt.svg';

export const TraktLoadingSpinner = () => {
    const spinValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const spin = Animated.loop(
            Animated.timing(spinValue, {
                toValue: 1,
                duration: 1500,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        spin.start();
        return () => spin.stop();
    }, [spinValue]);

    const rotation = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    return (
        <View style={styles.container}>
            <Animated.View style={{ transform: [{ rotate: rotation }] }}>
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