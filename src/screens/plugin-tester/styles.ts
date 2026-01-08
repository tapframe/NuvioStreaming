import { StyleSheet, Platform, useWindowDimensions } from 'react-native';

// Breakpoint for the two-column "large screen" layout.
// 768px wide tablets in portrait are usually too narrow for side-by-side columns,
// so we enable the large layout only on wider screens (e.g., tablet landscape).
export const LARGE_SCREEN_BREAKPOINT = 900;

export const useIsLargeScreen = () => {
    const { width } = useWindowDimensions();
    return width >= LARGE_SCREEN_BREAKPOINT;
};

export const getPluginTesterStyles = (theme: any, isLargeScreen: boolean = false) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.darkBackground,
    },
    // Large screen wrapper for centering content
    largeScreenWrapper: {
        flex: 1,
        // Allow tablet/desktop to use more horizontal space while still
        // keeping content comfortably contained.
        maxWidth: isLargeScreen ? 1200 : undefined,
        alignSelf: isLargeScreen ? 'center' : undefined,
        width: isLargeScreen ? '100%' : undefined,
        paddingHorizontal: isLargeScreen ? 24 : 0,
    },
    // Two-column layout for large screens
    twoColumnContainer: {
        flex: isLargeScreen ? 1 : undefined,
        flexDirection: isLargeScreen ? 'row' : 'column',
        gap: isLargeScreen ? 16 : 0,
    },
    leftColumn: {
        flex: isLargeScreen ? 1 : undefined,
    },
    rightColumn: {
        flex: isLargeScreen ? 1 : undefined,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.elevation3,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    headerSubtitle: {
        fontSize: 12,
        color: theme.colors.mediumEmphasis,
        marginTop: 2,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: theme.colors.elevation1,
        padding: 6,
        marginHorizontal: 16,
        marginVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        flexDirection: 'row',
        gap: 6,
    },
    activeTab: {
        backgroundColor: theme.colors.primary + '20',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.mediumEmphasis,
    },
    activeTabText: {
        color: theme.colors.primary,
    },
    tabBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: theme.colors.elevation3,
    },
    tabBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: theme.colors.highEmphasis,
    },
    content: {
        flex: 1,
        // On large screens the wrapper already adds horizontal padding.
        // Avoid "double padding" that makes columns feel cramped.
        paddingHorizontal: isLargeScreen ? 0 : 16,
        paddingTop: 12,
    },
    card: {
        backgroundColor: theme.colors.elevation2,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        marginBottom: 12,
    },
    repoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: theme.colors.elevation3,
    },
    repoRowLeft: {
        flex: 1,
        paddingRight: 10,
    },
    repoRowTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.highEmphasis,
    },
    repoRowSub: {
        marginTop: 2,
        fontSize: 12,
        color: theme.colors.mediumEmphasis,
    },
    statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    statusPillText: {
        fontSize: 11,
        fontWeight: '800',
    },
    statusIdle: {
        backgroundColor: theme.colors.elevation1,
        borderColor: theme.colors.elevation3,
    },
    statusRunning: {
        backgroundColor: theme.colors.primary + '20',
        borderColor: theme.colors.primary,
    },
    statusOk: {
        backgroundColor: theme.colors.success + '20',
        borderColor: theme.colors.success,
    },
    statusOkEmpty: {
        backgroundColor: theme.colors.warning + '20',
        borderColor: theme.colors.warning,
    },
    statusFail: {
        backgroundColor: theme.colors.error + '20',
        borderColor: theme.colors.error,
    },
    repoMiniButton: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: theme.colors.elevation1,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    repoMiniButtonText: {
        fontSize: 12,
        fontWeight: '800',
        color: theme.colors.highEmphasis,
    },
    repoLogsPanel: {
        marginTop: 10,
        backgroundColor: theme.colors.elevation1,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        padding: 10,
    },
    repoLogsTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: theme.colors.highEmphasis,
        marginBottom: 8,
    },
    cardTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: theme.colors.white,
        letterSpacing: 0.2,
    },
    helperText: {
        fontSize: 12,
        color: theme.colors.mediumEmphasis,
        lineHeight: 16,
    },
    input: {
        backgroundColor: theme.colors.elevation1,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 12,
        color: theme.colors.white,
        fontSize: 14,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        minHeight: 48,
    },
    codeInput: {
        backgroundColor: theme.colors.elevation1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        color: theme.colors.highEmphasis,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        minHeight: 240,
        textAlignVertical: 'top',
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    focusedEditorShell: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        backgroundColor: theme.colors.elevation1,
        overflow: 'hidden',
    },
    highlightLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    highlightText: {
        color: theme.colors.highEmphasis,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    highlightActive: {
        backgroundColor: '#FFD400',
        color: theme.colors.black,
    },
    codeInputTransparent: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingVertical: 12,
        paddingHorizontal: 12,
        color: 'transparent',
        backgroundColor: 'transparent',
        fontSize: 13,
        lineHeight: 18,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    fieldLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.mediumEmphasis,
        marginBottom: 6,
    },
    segment: {
        flexDirection: 'row',
        backgroundColor: theme.colors.elevation1,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        overflow: 'hidden',
    },
    segmentItem: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    segmentItemActive: {
        backgroundColor: theme.colors.primary + '20',
    },
    segmentText: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.highEmphasis,
    },
    segmentTextActive: {
        color: theme.colors.primary,
    },
    button: {
        backgroundColor: theme.colors.primary,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    buttonText: {
        color: theme.colors.white,
        fontWeight: '700',
        fontSize: 15,
    },
    secondaryButton: {
        backgroundColor: theme.colors.elevation1,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    secondaryButtonText: {
        color: theme.colors.highEmphasis,
    },
    stickyFooter: {
        paddingHorizontal: 16,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: theme.colors.elevation3,
        backgroundColor: theme.colors.darkBackground,
    },
    footerCard: {
        backgroundColor: theme.colors.elevation2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        padding: 12,
        marginBottom: 10,
    },
    footerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    footerTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.white,
    },
    headerRightButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: theme.colors.elevation2,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    headerRightButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.highEmphasis,
    },
    codeInputFocused: {
        flex: 1,
        minHeight: 0,
    },
    cardActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardActionButton: {
        padding: 6,
        marginRight: 6,
        borderRadius: 10,
        backgroundColor: theme.colors.elevation1,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    findToolbar: {
        backgroundColor: theme.colors.elevation2,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.elevation3,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    findInput: {
        flex: 1,
        backgroundColor: theme.colors.elevation1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: theme.colors.white,
        fontSize: 13,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    findCounter: {
        fontSize: 12,
        color: theme.colors.mediumEmphasis,
        minWidth: 40,
        textAlign: 'right',
        fontWeight: '600',
    },
    findButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: theme.colors.elevation1,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    findButtonActive: {
        backgroundColor: theme.colors.primary + '20',
        borderColor: theme.colors.primary,
    },
    logItem: {
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        fontSize: 12,
        marginBottom: 4,
        color: theme.colors.mediumEmphasis,
    },
    logError: {
        color: theme.colors.error,
    },
    logWarn: {
        color: theme.colors.warning,
    },
    logInfo: {
        color: theme.colors.info,
    },
    logDebug: {
        color: theme.colors.lightGray,
    },
    logContainer: {
        backgroundColor: theme.colors.elevation2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        padding: 12,
    },
    resultItem: {
        backgroundColor: theme.colors.elevation2,
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.white,
        marginBottom: 4,
    },
    resultMeta: {
        fontSize: 12,
        color: theme.colors.mediumGray,
        marginBottom: 2,
    },
    resultUrl: {
        fontSize: 12,
        color: theme.colors.mediumEmphasis,
        marginBottom: 2,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyText: {
        color: theme.colors.mediumGray,
        marginTop: 8,
    },
    // New styles added for i18n
    smallTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        backgroundColor: theme.colors.elevation1,
    },
    smallTabActive: {
        backgroundColor: theme.colors.primary + '20',
        borderColor: theme.colors.primary,
    },
    smallTabText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.mediumEmphasis,
    },
    smallTabTextActive: {
        color: theme.colors.primary,
    },
    listContainer: {
        flex: 1,
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.highEmphasis,
        marginBottom: 4,
    },
    sectionSubHeader: {
        fontSize: 12,
        color: theme.colors.mediumEmphasis,
        marginBottom: 10,
    },
    streamInfo: {
        flex: 1,
        marginRight: 10,
    },
    streamName: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.white,
        marginBottom: 2,
    },
    streamMeta: {
        fontSize: 12,
        color: theme.colors.mediumEmphasis,
        marginTop: 2,
    },
    playButton: {
        backgroundColor: theme.colors.primary,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    playButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.white,
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.elevation1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.elevation3,
        paddingHorizontal: 10,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 8,
        color: theme.colors.highEmphasis,
        fontSize: 14,
    },
    modalContainer: {
        flex: 1,
    },
    mobileTabBar: {
        flexDirection: 'row',
        backgroundColor: theme.colors.elevation2,
        borderTopWidth: 1,
        borderTopColor: theme.colors.elevation3,
        paddingTop: 10,
    },
    mobileTabItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 6,
        gap: 4,
    },
    mobileTabItemActive: {
        // Active styles
    },
    mobileTabText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.mediumEmphasis,
    },
    mobileTabTextActive: {
        color: theme.colors.primary,
    },
});
