import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions, DeviceEventEmitter } from 'react-native';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import FastImage from '@d11/react-native-fast-image';
import { StreamingContent, catalogService } from '../../services/catalogService';
import { mmkvStorage } from '../../services/mmkvStorage';
import { useSettings } from '../../hooks/useSettings';
import {
    isTablet,
    isLargeTablet,
    isTV,
    HORIZONTAL_ITEM_WIDTH,
    HORIZONTAL_POSTER_HEIGHT,
    PLACEHOLDER_POSTER,
} from './searchUtils';
import { searchStyles as styles } from './searchStyles';

const { width } = Dimensions.get('window');

interface DiscoverResultItemProps {
    item: StreamingContent;
    index: number;
    navigation: any;
    setSelectedItem: (item: StreamingContent) => void;
    setMenuVisible: (visible: boolean) => void;
    currentTheme: any;
    isGrid?: boolean;
}

export const DiscoverResultItem = React.memo(({
    item,
    index,
    navigation,
    setSelectedItem,
    setMenuVisible,
    currentTheme,
    isGrid = false
}: DiscoverResultItemProps) => {
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
            // Grid Calculation: (Window Width - Padding) / Columns
            const columns = isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 3;
            const totalPadding = 32;
            const totalGap = 12 * (Math.max(3, columns) - 1);
            const availableWidth = width - totalPadding - totalGap;
            w = availableWidth / Math.max(3, columns);
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

    return (
        <TouchableOpacity
            style={[
                styles.horizontalItem,
                { width: itemWidth },
                isGrid && styles.discoverGridItem
            ]}
            onPress={() => {
                navigation.navigate('Metadata', {
                    id: item.id,
                    type: item.type,
                    addonId: item.addonId
                });
            }}
            onLongPress={() => {
                setSelectedItem(item);
                setMenuVisible(true);
            }}
            delayLongPress={300}
            activeOpacity={0.7}
        >
            <View style={[styles.horizontalItemPosterContainer, {
                width: itemWidth,
                height: undefined,
                aspectRatio: aspectRatio,
                backgroundColor: currentTheme.colors.darkBackground,
                borderRadius: settings.posterBorderRadius ?? 12,
            }]}>
                <FastImage
                    source={{
                        uri: item.poster || PLACEHOLDER_POSTER,
                        priority: FastImage.priority.low,
                        cache: FastImage.cacheControl.immutable,
                    }}
                    style={[styles.horizontalItemPoster, { borderRadius: settings.posterBorderRadius ?? 12 }]}
                    resizeMode={FastImage.resizeMode.cover}
                />
                {/* Bookmark icon */}
                {inLibrary && (
                    <View style={[styles.libraryBadge, { position: 'absolute', top: 8, right: 36, backgroundColor: 'transparent', zIndex: 2 }]}>
                        <Feather name="bookmark" size={16} color={currentTheme.colors.white} />
                    </View>
                )}
                {/* Watched icon */}
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

DiscoverResultItem.displayName = 'DiscoverResultItem';
