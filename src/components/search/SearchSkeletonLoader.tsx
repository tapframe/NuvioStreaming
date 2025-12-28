import React from 'react';
import {
    View,
    StyleSheet,
    Animated as RNAnimated,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { isTablet } from './searchUtils';

/**
 * Skeleton loader component for search results
 */
export const SearchSkeletonLoader: React.FC = () => {
    const pulseAnim = React.useRef(new RNAnimated.Value(0)).current;
    const { currentTheme } = useTheme();

    React.useEffect(() => {
        const pulse = RNAnimated.loop(
            RNAnimated.sequence([
                RNAnimated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                RNAnimated.timing(pulseAnim, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [pulseAnim]);

    const opacity = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.7],
    });

    const renderSkeletonItem = () => (
        <View style={styles.skeletonVerticalItem}>
            <RNAnimated.View style={[
                styles.skeletonPoster,
                { opacity, backgroundColor: currentTheme.colors.darkBackground }
            ]} />
            <View style={styles.skeletonItemDetails}>
                <RNAnimated.View style={[
                    styles.skeletonTitle,
                    { opacity, backgroundColor: currentTheme.colors.darkBackground }
                ]} />
                <View style={styles.skeletonMetaRow}>
                    <RNAnimated.View style={[
                        styles.skeletonMeta,
                        { opacity, backgroundColor: currentTheme.colors.darkBackground }
                    ]} />
                    <RNAnimated.View style={[
                        styles.skeletonMeta,
                        { opacity, backgroundColor: currentTheme.colors.darkBackground }
                    ]} />
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.skeletonContainer}>
            {[...Array(5)].map((_, index) => (
                <View key={index}>
                    {index === 0 && (
                        <RNAnimated.View style={[
                            styles.skeletonSectionHeader,
                            { opacity, backgroundColor: currentTheme.colors.darkBackground }
                        ]} />
                    )}
                    {renderSkeletonItem()}
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    skeletonContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    skeletonVerticalItem: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'center',
    },
    skeletonPoster: {
        width: isTablet ? 60 : 80,
        height: isTablet ? 90 : 120,
        borderRadius: 8,
        marginRight: 12,
    },
    skeletonItemDetails: {
        flex: 1,
        justifyContent: 'center',
    },
    skeletonTitle: {
        height: 16,
        borderRadius: 4,
        marginBottom: 8,
        width: '80%',
    },
    skeletonMetaRow: {
        flexDirection: 'row',
        gap: 8,
    },
    skeletonMeta: {
        height: 12,
        borderRadius: 4,
        width: 60,
    },
    skeletonSectionHeader: {
        height: 20,
        width: 120,
        borderRadius: 4,
        marginBottom: 16,
    },
});

export default SearchSkeletonLoader;
