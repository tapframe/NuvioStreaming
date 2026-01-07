import React, { useMemo } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AddonSearchResults, StreamingContent } from '../../services/catalogService';
import { SearchResultItem } from './SearchResultItem';
import { isTablet, isLargeTablet, isTV } from './searchUtils';
import { searchStyles as styles } from './searchStyles';

interface AddonSectionProps {
    addonGroup: AddonSearchResults;
    addonIndex: number;
    onItemPress: (item: StreamingContent) => void;
    onItemLongPress: (item: StreamingContent) => void;
    currentTheme: any;
}

export const AddonSection = React.memo(({
    addonGroup,
    addonIndex,
    onItemPress,
    onItemLongPress,
    currentTheme,
}: AddonSectionProps) => {
    const { t } = useTranslation();

    const movieResults = useMemo(() =>
        addonGroup.results.filter(item => item.type === 'movie'),
        [addonGroup.results]
    );
    const seriesResults = useMemo(() =>
        addonGroup.results.filter(item => item.type === 'series'),
        [addonGroup.results]
    );
    const otherResults = useMemo(() =>
        addonGroup.results.filter(item => item.type !== 'movie' && item.type !== 'series'),
        [addonGroup.results]
    );

    return (
        <View>
            {/* Addon Header */}
            <View style={styles.addonHeaderContainer}>
                <Text style={[styles.addonHeaderText, { color: currentTheme.colors.white }]}>
                    {addonGroup.addonName}
                </Text>
                <View style={[styles.addonHeaderBadge, { backgroundColor: currentTheme.colors.elevation2 }]}>
                    <Text style={[styles.addonHeaderBadgeText, { color: currentTheme.colors.lightGray }]}>
                        {addonGroup.results.length}
                    </Text>
                </View>
            </View>

            {/* Movies */}
            {movieResults.length > 0 && (
                <View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]}>
                    <Text style={[
                        styles.carouselSubtitle,
                        {
                            color: currentTheme.colors.lightGray,
                            fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14,
                            marginBottom: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 8,
                            paddingHorizontal: isTV ? 24 : isLargeTablet ? 20 : isTablet ? 16 : 16
                        }
                    ]}>
                        {t('search.movies')} ({movieResults.length})
                    </Text>
                    <FlatList
                        data={movieResults}
                        renderItem={({ item, index }) => (
                            <SearchResultItem
                                item={item}
                                index={index}
                                onPress={onItemPress}
                                onLongPress={onItemLongPress}
                            />
                        )}
                        keyExtractor={item => `${addonGroup.addonId}-movie-${item.id}`}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalListContent}
                    />
                </View>
            )}

            {/* TV Shows */}
            {seriesResults.length > 0 && (
                <View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]}>
                    <Text style={[
                        styles.carouselSubtitle,
                        {
                            color: currentTheme.colors.lightGray,
                            fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14,
                            marginBottom: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 8,
                            paddingHorizontal: isTV ? 24 : isLargeTablet ? 20 : isTablet ? 16 : 16
                        }
                    ]}>
                        {t('search.tv_shows')} ({seriesResults.length})
                    </Text>
                    <FlatList
                        data={seriesResults}
                        renderItem={({ item, index }) => (
                            <SearchResultItem
                                item={item}
                                index={index}
                                onPress={onItemPress}
                                onLongPress={onItemLongPress}
                            />
                        )}
                        keyExtractor={item => `${addonGroup.addonId}-series-${item.id}`}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalListContent}
                    />
                </View>
            )}

            {/* Other types */}
            {otherResults.length > 0 && (
                <View style={[styles.carouselContainer, { marginBottom: isTV ? 40 : isLargeTablet ? 36 : isTablet ? 32 : 24 }]}>
                    <Text style={[
                        styles.carouselSubtitle,
                        {
                            color: currentTheme.colors.lightGray,
                            fontSize: isTV ? 18 : isLargeTablet ? 17 : isTablet ? 16 : 14,
                            marginBottom: isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 8,
                            paddingHorizontal: isTV ? 24 : isLargeTablet ? 20 : isTablet ? 16 : 16
                        }
                    ]}>
                        {otherResults[0].type.charAt(0).toUpperCase() + otherResults[0].type.slice(1)} ({otherResults.length})
                    </Text>
                    <FlatList
                        data={otherResults}
                        renderItem={({ item, index }) => (
                            <SearchResultItem
                                item={item}
                                index={index}
                                onPress={onItemPress}
                                onLongPress={onItemLongPress}
                            />
                        )}
                        keyExtractor={item => `${addonGroup.addonId}-${item.type}-${item.id}`}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalListContent}
                    />
                </View>
            )}
        </View>
    );
}, (prev, next) => {
    // Only re-render if this section's reference changed
    return prev.addonGroup === next.addonGroup && prev.addonIndex === next.addonIndex;
});

AddonSection.displayName = 'AddonSection';
