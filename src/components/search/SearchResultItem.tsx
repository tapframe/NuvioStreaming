import React, { useMemo, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    DeviceEventEmitter,
    Dimensions,
    Platform,
} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { StreamingContent, catalogService } from '../../services/catalogService';
import { mmkvStorage } from '../../services/mmkvStorage';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import {
    HORIZONTAL_ITEM_WIDTH,
    HORIZONTAL_POSTER_HEIGHT,
    PLACEHOLDER_POSTER,
    isTablet,
    isLargeTablet,
    isTV,
} from './searchUtils';

const { width } = Dimensions.get('window');

interface SearchResultItemProps {
    item: StreamingContent;
    index: number;
    onPress: (item: StreamingContent) => void;
    onLongPress: (item: StreamingContent) => void;
    isGrid?: boolean;
}

/**
 * Individual search result item with poster, title, and badges
 */
export const SearchResultItem: React.FC<SearchResultItemProps> = React.memo(({
    item,
    index,
    onPress,
    onLongPress,
    isGrid = false,
}) => {
    const { currentTheme } = useTheme();
    const { settings } = useSettings();
    const [inLibrary, setInLibrary] = useState(!!item.inLibrary);
    const [watched, setWatched] = useState(false);

    // Calculate dimensions based on poster shape
    const { itemWidth, aspectRatio } = useMemo(() => {
        const shape = item.posterShape || 'poster';
        const baseHeight = HORIZONTAL_POSTER_HEIGHT;

        let w = HORIZONTAL_ITEM_WIDTH;
        let r = 2 / 3;

        if (isGrid) {
            // Ensure minimum 3 columns on all devices
            const columns = isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 3;
            const minColumns = Math.max(3, columns);
            const totalPadding = 32;
            const totalGap = 12 * (minColumns - 1);
            const availableWidth = width - totalPadding - totalGap;
            w = availableWidth / minColumns;
        } else {
            if (shape === 'landscape') {
                r = 16 / 9;
                w = baseHeight * r;
            } else if (shape === 'square') {
                r = 1;
                w = baseHeight;
            }
        }
        return { itemWidth: w, aspectRatio: r };
    }, [item.posterShape, isGrid]);

    useEffect(() => {
        const updateWatched = () => {
            mmkvStorage.getItem(`watched:${item.type}:${item.id}`).then(val => setWatched(val === 'true'));
        };
        updateWatched();
        const sub = DeviceEventEmitter.addListener('watchedStatusChanged', updateWatched);
        return () => sub.remove();
    }, [item.id, item.type]);

    useEffect(() => {
        const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
            const found = items.find((libItem) => libItem.id === item.id && libItem.type === item.type);
            setInLibrary(!!found);
        });
        return () => unsubscribe();
    }, [item.id, item.type]);

    const borderRadius = settings.posterBorderRadius ?? 12;

    return (
        <TouchableOpacity
            style={[
                styles.horizontalItem,
                { width: itemWidth },
                isGrid && styles.discoverGridItem
            ]}
            onPress={() => onPress(item)}
            onLongPress={() => onLongPress(item)}
            delayLongPress={300}
            activeOpacity={0.7}
        >
            <View style={[styles.horizontalItemPosterContainer, {
                width: itemWidth,
                height: undefined,
                aspectRatio: aspectRatio,
                backgroundColor: currentTheme.colors.darkBackground,
                borderRadius,
            }]}>
                <FastImage
                    source={{
                        uri: item.poster || PLACEHOLDER_POSTER,
                        priority: FastImage.priority.low,
                        cache: FastImage.cacheControl.immutable,
                    }}
                    style={[styles.horizontalItemPoster, { borderRadius }]}
                    resizeMode={FastImage.resizeMode.cover}
                />
                {inLibrary && (
                    <View style={[styles.libraryBadge, { position: 'absolute', top: 8, right: 36, backgroundColor: 'transparent', zIndex: 2 }]}>
                        <Feather name="bookmark" size={16} color={currentTheme.colors.white} />
                    </View>
                )}
                {watched && (
                    <View style={[styles.watchedIndicator, { position: 'absolute', top: 8, right: 8, backgroundColor: 'transparent', zIndex: 2 }]}>
                        <MaterialIcons name="check-circle" size={20} color={currentTheme.colors.success || '#4CAF50'} />
                    </View>
                )}
            </View>
            <Text
                style={[
                    styles.horizontalItemTitle,
                    {
                        color: currentTheme.colors.white,
                        fontSize: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 14,
                        lineHeight: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 18,
                    }
                ]}
                numberOfLines={2}
            >
                {item.name}
            </Text>
            {item.year && (
                <Text style={[styles.yearText, { color: currentTheme.colors.mediumGray, fontSize: isTV ? 12 : isLargeTablet ? 11 : isTablet ? 10 : 12 }]}>
                    {item.year}
                </Text>
            )}
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    horizontalItem: {
        marginRight: 16,
    },
    discoverGridItem: {
        marginRight: 0,
        marginBottom: 0,
    },
    horizontalItemPosterContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 8,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
        elevation: Platform.OS === 'android' ? 1 : 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
    },
    horizontalItemPoster: {
        width: '100%',
        height: '100%',
    },
    horizontalItemTitle: {
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 18,
        textAlign: 'left',
    },
    yearText: {
        fontSize: 12,
        marginTop: 2,
    },
    libraryBadge: {},
    watchedIndicator: {},
});

export default SearchResultItem;
