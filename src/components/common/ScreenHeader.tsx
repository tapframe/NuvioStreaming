import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialIcons } from '@expo/vector-icons';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

interface ScreenHeaderProps {
    /**
     * The main title displayed in the header
     */
    title: string;
    /**
     * Optional right action button (icon name from Feather icons)
     */
    rightActionIcon?: string;
    /**
     * Optional callback for right action button press
     */
    onRightActionPress?: () => void;
    /**
     * Optional custom right action component (overrides rightActionIcon)
     */
    rightActionComponent?: React.ReactNode;
    /**
     * Optional back button (shows arrow back icon)
     */
    showBackButton?: boolean;
    /**
     * Optional callback for back button press
     */
    onBackPress?: () => void;
    /**
     * Whether this screen is displayed on a tablet layout
     */
    isTablet?: boolean;
    /**
     * Optional extra top padding for tablet navigation offset
     */
    tabletNavOffset?: number;
    /**
     * Optional custom title component (overrides title text)
     */
    titleComponent?: React.ReactNode;
    /**
     * Optional children to render below the title row (e.g., filters, search bar)
     */
    children?: React.ReactNode;
    /**
     * Whether to hide the header title row (useful when showing only children)
     */
    hideTitleRow?: boolean;
    /**
     * Use MaterialIcons instead of Feather for icons
     */
    useMaterialIcons?: boolean;
    /**
     * Optional custom style for title
     */
    titleStyle?: object;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({
    title,
    rightActionIcon,
    onRightActionPress,
    rightActionComponent,
    showBackButton = false,
    onBackPress,
    isTablet = false,
    tabletNavOffset = 64,
    titleComponent,
    children,
    hideTitleRow = false,
    useMaterialIcons = false,
    titleStyle,
}) => {
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();

    // Calculate header spacing
    const topSpacing =
        (Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT : insets.top) +
        (isTablet ? tabletNavOffset : 0);

    const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
    const titleRowHeight = headerBaseHeight + topSpacing;

    const IconComponent = useMaterialIcons ? MaterialIcons : Feather;
    const backIconName = useMaterialIcons ? 'arrow-back' : 'arrow-left';

    return (
        <>
            {/* Fixed position header background to prevent shifts */}
            <View
                style={[
                    styles.headerBackground,
                    {
                        backgroundColor: currentTheme.colors.darkBackground,
                    },
                ]}
            />

            {/* Header Section */}
            <View
                style={[
                    styles.header,
                    {
                        paddingTop: topSpacing,
                        backgroundColor: 'transparent',
                    },
                ]}
            >
                {/* Title Row */}
                {!hideTitleRow && (
                    <View
                        style={[
                            styles.titleRow,
                            {
                                height: headerBaseHeight,
                            },
                        ]}
                    >
                        <View style={styles.headerContent}>
                            {showBackButton ? (
                                <TouchableOpacity
                                    style={styles.backButton}
                                    onPress={onBackPress}
                                    activeOpacity={0.7}
                                >
                                    <IconComponent
                                        name={backIconName as any}
                                        size={24}
                                        color={currentTheme.colors.text}
                                    />
                                </TouchableOpacity>
                            ) : null}

                            {titleComponent ? (
                                titleComponent
                            ) : (
                                <Text
                                    style={[
                                        styles.headerTitle,
                                        { color: currentTheme.colors.text },
                                        isTablet && { fontSize: 48 }, // Increase font size for tablet
                                        showBackButton && styles.headerTitleWithBack,
                                        titleStyle,
                                    ]}
                                >
                                    {title}
                                </Text>
                            )}

                            {/* Right Action */}
                            {rightActionComponent ? (
                                <View style={styles.rightActionContainer}>{rightActionComponent}</View>
                            ) : rightActionIcon && onRightActionPress ? (
                                <TouchableOpacity
                                    style={styles.rightActionButton}
                                    onPress={onRightActionPress}
                                    activeOpacity={0.7}
                                >
                                    <IconComponent
                                        name={rightActionIcon as any}
                                        size={24}
                                        color={currentTheme.colors.text}
                                    />
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.rightActionPlaceholder} />
                            )}
                        </View>
                    </View>
                )}

                {/* Children (filters, search bar, etc.) */}
                {children}
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    headerBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    header: {
        paddingHorizontal: 20,
        zIndex: 11,
    },
    titleRow: {
        justifyContent: 'flex-end',
        paddingBottom: 8,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
        marginRight: 8,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '800',
        letterSpacing: 0.5,
        flex: 1,
    },
    headerTitleWithBack: {
        fontSize: 24,
        flex: 0,
    },
    rightActionContainer: {
        minWidth: 40,
        alignItems: 'flex-end',
    },
    rightActionButton: {
        padding: 8,
        marginRight: -8,
    },
    rightActionPlaceholder: {
        width: 40,
    },
});

export default ScreenHeader;
