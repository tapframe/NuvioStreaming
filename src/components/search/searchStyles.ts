import { StyleSheet, Platform, Dimensions } from 'react-native';
import { isTablet, isTV, isLargeTablet, HORIZONTAL_ITEM_WIDTH, HORIZONTAL_POSTER_HEIGHT, POSTER_WIDTH, POSTER_HEIGHT } from './searchUtils';

const { width } = Dimensions.get('window');

export const searchStyles = StyleSheet.create({
    container: {
        flex: 1,
    },
    contentContainer: {
        flex: 1,
        paddingTop: 0,
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        height: 48,
    },
    searchBarWrapper: {
        flex: 1,
        height: 48,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: '100%',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        height: '100%',
    },
    clearButton: {
        padding: 4,
    },
    scrollView: {
        flex: 1,
    },
    scrollViewContent: {
        paddingBottom: isTablet ? 120 : 100,
        paddingHorizontal: 0,
    },
    carouselContainer: {
        marginBottom: isTablet ? 32 : 24,
    },
    carouselTitle: {
        fontSize: isTablet ? 20 : 18,
        fontWeight: '700',
        marginBottom: isTablet ? 16 : 12,
        paddingHorizontal: 16,
    },
    carouselSubtitle: {
        fontSize: isTablet ? 16 : 14,
        fontWeight: '600',
        marginBottom: isTablet ? 12 : 8,
        paddingHorizontal: 16,
    },
    addonHeaderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: isTablet ? 16 : 12,
        marginTop: isTablet ? 24 : 16,
        marginBottom: isTablet ? 8 : 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    addonHeaderIcon: {
        // removed icon
    },
    addonHeaderText: {
        fontSize: isTablet ? 18 : 16,
        fontWeight: '700',
        flex: 1,
    },
    addonHeaderBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    addonHeaderBadgeText: {
        fontSize: isTablet ? 12 : 11,
        fontWeight: '600',
    },
    horizontalListContent: {
        paddingHorizontal: 16,
    },
    horizontalItem: {
        width: HORIZONTAL_ITEM_WIDTH,
        marginRight: 16,
    },
    horizontalItemPosterContainer: {
        width: HORIZONTAL_ITEM_WIDTH,
        height: HORIZONTAL_POSTER_HEIGHT,
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
        fontSize: isTablet ? 12 : 14,
        fontWeight: '600',
        lineHeight: isTablet ? 16 : 18,
        textAlign: 'left',
    },
    yearText: {
        fontSize: isTablet ? 10 : 12,
        marginTop: 2,
    },
    recentSearchesContainer: {
        paddingHorizontal: 16,
        paddingBottom: isTablet ? 24 : 16,
        paddingTop: isTablet ? 12 : 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        marginBottom: isTablet ? 16 : 8,
    },
    recentSearchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: isTablet ? 12 : 10,
        paddingHorizontal: 16,
        marginVertical: 1,
    },
    recentSearchIcon: {
        marginRight: 12,
    },
    recentSearchText: {
        fontSize: 16,
        flex: 1,
    },
    recentSearchDeleteButton: {
        padding: 4,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: isTablet ? 64 : 32,
        paddingBottom: isTablet ? 120 : 100,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    skeletonContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
        paddingTop: 16,
        justifyContent: 'space-between',
    },
    skeletonVerticalItem: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    skeletonPoster: {
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        borderRadius: 12,
    },
    skeletonItemDetails: {
        flex: 1,
        marginLeft: 16,
        justifyContent: 'center',
    },
    skeletonMetaRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    skeletonTitle: {
        height: 20,
        width: '80%',
        marginBottom: 8,
        borderRadius: 4,
    },
    skeletonMeta: {
        height: 14,
        width: '30%',
        borderRadius: 4,
    },
    skeletonSectionHeader: {
        height: 24,
        width: '40%',
        marginBottom: 16,
        borderRadius: 4,
    },
    ratingContainer: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
    },
    ratingText: {
        fontSize: isTablet ? 9 : 10,
        fontWeight: '700',
        marginLeft: 2,
    },
    simpleAnimationContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    simpleAnimationContent: {
        alignItems: 'center',
    },
    spinnerContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    simpleAnimationText: {
        fontSize: 16,
        fontWeight: '600',
    },
    watchedIndicator: {
        position: 'absolute',
        top: 8,
        right: 8,
        borderRadius: 12,
        padding: 2,
        zIndex: 2,
        backgroundColor: 'transparent',
    },
    libraryBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        borderRadius: 8,
        padding: 4,
        zIndex: 2,
        backgroundColor: 'transparent',
    },
    // Discover section styles
    discoverContainer: {
        paddingTop: isTablet ? 16 : 12,
        paddingBottom: isTablet ? 24 : 16,
    },
    discoverHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: isTablet ? 16 : 12,
        gap: 8,
    },
    discoverTitle: {
        fontSize: isTablet ? 22 : 20,
        fontWeight: '700',
    },
    discoverTypeContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: isTablet ? 16 : 12,
        gap: 12,
    },
    discoverTypeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        gap: 6,
    },
    discoverTypeText: {
        fontSize: isTablet ? 15 : 14,
        fontWeight: '600',
    },
    discoverGenreScroll: {
        marginBottom: isTablet ? 20 : 16,
    },
    discoverGenreContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    discoverGenreChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginRight: 8,
    },
    discoverGenreChipActive: {
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    discoverGenreText: {
        fontSize: isTablet ? 14 : 13,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.7)',
    },
    discoverGenreTextActive: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    discoverLoadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    discoverLoadingText: {
        marginTop: 12,
        fontSize: 14,
    },
    discoverAddonSection: {
        marginBottom: isTablet ? 28 : 20,
    },
    discoverAddonHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: isTablet ? 12 : 8,
    },
    discoverAddonName: {
        fontSize: isTablet ? 16 : 15,
        fontWeight: '600',
        flex: 1,
    },
    discoverAddonBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    discoverAddonBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    discoverEmptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
    },
    discoverEmptyText: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 12,
        textAlign: 'center',
    },
    discoverEmptySubtext: {
        fontSize: 14,
        marginTop: 4,
        textAlign: 'center',
    },
    discoverGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 16,
        gap: 12,
    },
    discoverGridRow: {
        justifyContent: 'flex-start',
        gap: 12,
    },
    discoverGridContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    discoverGridItem: {
        marginRight: 0,
        marginBottom: 12,
    },
    loadingMoreContainer: {
        width: '100%',
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // New chip-based discover styles
    discoverChipsScroll: {
        marginBottom: isTablet ? 12 : 10,
        flexGrow: 0,
    },
    discoverChipsContent: {
        paddingHorizontal: 16,
        flexDirection: 'row',
        gap: 8,
    },
    discoverSelectorChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    discoverSelectorText: {
        fontSize: isTablet ? 14 : 13,
        fontWeight: '600',
    },
    discoverFilterSummary: {
        paddingHorizontal: 16,
        marginBottom: isTablet ? 16 : 12,
    },
    discoverFilterSummaryText: {
        fontSize: 12,
        fontWeight: '500',
    },
    // Bottom sheet styles
    bottomSheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    bottomSheetTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    bottomSheetContent: {
        paddingHorizontal: 12,
        paddingBottom: 40,
    },
    bottomSheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginVertical: 2,
    },
    bottomSheetItemSelected: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    bottomSheetItemIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    bottomSheetItemContent: {
        flex: 1,
    },
    bottomSheetItemTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    bottomSheetItemSubtitle: {
        fontSize: 13,
        marginTop: 2,
    },
    showMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 8,
        marginVertical: 20,
        alignSelf: 'center',
    },
    showMoreButtonText: {
        fontSize: 14,
        fontWeight: '600',
        marginRight: 8,
    },
});
