import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Platform, Linking, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FastImage from '@d11/react-native-fast-image';
import LottieView from 'lottie-react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Sentry from '@sentry/react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { fetchTotalDownloads } from '../../services/githubReleaseService';
import { getDisplayedAppVersion } from '../../utils/version';
import ScreenHeader from '../../components/common/ScreenHeader';
import { SettingsCard, SettingItem, ChevronRight } from './SettingsComponents';

const { width } = Dimensions.get('window');

interface AboutSettingsContentProps {
    isTablet?: boolean;
    displayDownloads?: number | null;
}

/**
 * Reusable AboutSettingsContent component
 * Can be used inline (tablets) or wrapped in a screen (mobile)
 */
export const AboutSettingsContent: React.FC<AboutSettingsContentProps> = ({
    isTablet = false,
    displayDownloads: externalDisplayDownloads
}) => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();

    const [internalDisplayDownloads, setInternalDisplayDownloads] = useState<number | null>(null);

    // Use external downloads if provided (for tablet inline use), otherwise load internally
    const displayDownloads = externalDisplayDownloads ?? internalDisplayDownloads;

    useEffect(() => {
        // Only load downloads internally if not provided externally
        if (externalDisplayDownloads === undefined) {
            const loadDownloads = async () => {
                const downloads = await fetchTotalDownloads();
                if (downloads !== null) {
                    setInternalDisplayDownloads(downloads);
                }
            };
            loadDownloads();
        }
    }, [externalDisplayDownloads]);

    return (
        <>
            <SettingsCard title="INFORMATION" isTablet={isTablet}>
                <SettingItem
                    title="Privacy Policy"
                    icon="lock"
                    onPress={() => Linking.openURL('https://tapframe.github.io/NuvioStreaming/#privacy-policy')}
                    renderControl={() => <ChevronRight />}
                    isTablet={isTablet}
                />
                <SettingItem
                    title="Report Issue"
                    icon="alert-triangle"
                    onPress={() => Sentry.showFeedbackWidget()}
                    renderControl={() => <ChevronRight />}
                    isTablet={isTablet}
                />
                <SettingItem
                    title="Version"
                    description={getDisplayedAppVersion()}
                    icon="info"
                    isTablet={isTablet}
                />
                <SettingItem
                    title="Contributors"
                    description="View all contributors"
                    icon="users"
                    renderControl={() => <ChevronRight />}
                    onPress={() => navigation.navigate('Contributors')}
                    isLast
                    isTablet={isTablet}
                />
            </SettingsCard>
        </>
    );
};

/**
 * Reusable AboutFooter component - Downloads counter, social links, branding
 */
export const AboutFooter: React.FC<{ displayDownloads: number | null }> = ({ displayDownloads }) => {
    const { currentTheme } = useTheme();

    return (
        <>
            {displayDownloads !== null && (
                <View style={styles.downloadsContainer}>
                    <Text style={[styles.downloadsNumber, { color: currentTheme.colors.primary }]}>
                        {displayDownloads.toLocaleString()}
                    </Text>
                    <Text style={[styles.downloadsLabel, { color: currentTheme.colors.mediumEmphasis }]}>
                        downloads and counting
                    </Text>
                </View>
            )}

            <View style={styles.communityContainer}>
                <TouchableOpacity
                    style={styles.supportButton}
                    onPress={() => WebBrowser.openBrowserAsync('https://ko-fi.com/tapframe', {
                        presentationStyle: Platform.OS === 'ios' ? WebBrowser.WebBrowserPresentationStyle.FORM_SHEET : WebBrowser.WebBrowserPresentationStyle.FORM_SHEET
                    })}
                    activeOpacity={0.7}
                >
                    <FastImage
                        source={require('../../../assets/support_me_on_kofi_red.png')}
                        style={styles.kofiImage}
                        resizeMode={FastImage.resizeMode.contain}
                    />
                </TouchableOpacity>

                <View style={styles.socialRow}>
                    <TouchableOpacity
                        style={[styles.socialButton, { backgroundColor: currentTheme.colors.elevation1 }]}
                        onPress={() => Linking.openURL('https://discord.gg/KVgDTjhA4H')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.socialButtonContent}>
                            <FastImage
                                source={{ uri: 'https://pngimg.com/uploads/discord/discord_PNG3.png' }}
                                style={styles.socialLogo}
                                resizeMode={FastImage.resizeMode.contain}
                            />
                            <Text style={[styles.socialButtonText, { color: currentTheme.colors.highEmphasis }]}>
                                Discord
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.socialButton, { backgroundColor: '#FF4500' + '15' }]}
                        onPress={() => Linking.openURL('https://www.reddit.com/r/Nuvio/')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.socialButtonContent}>
                            <FastImage
                                source={{ uri: 'https://www.iconpacks.net/icons/2/free-reddit-logo-icon-2436-thumb.png' }}
                                style={styles.socialLogo}
                                resizeMode={FastImage.resizeMode.contain}
                            />
                            <Text style={[styles.socialButtonText, { color: '#FF4500' }]}>
                                Reddit
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Monkey Animation */}
            <View style={styles.monkeyContainer}>
                <LottieView
                    source={require('../../assets/lottie/monito.json')}
                    autoPlay
                    loop
                    style={styles.monkeyAnimation}
                    resizeMode="contain"
                />
            </View>

            <View style={styles.brandLogoContainer}>
                <FastImage
                    source={require('../../../assets/nuviotext.png')}
                    style={styles.brandLogo}
                    resizeMode={FastImage.resizeMode.contain}
                />
            </View>

            <View style={styles.footer}>
                <Text style={[styles.footerText, { color: currentTheme.colors.mediumEmphasis }]}>
                    Made with ❤️ by Tapframe and Friends
                </Text>
            </View>
        </>
    );
};

/**
 * AboutSettingsScreen - Wrapper for mobile navigation
 */
const AboutSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const screenIsTablet = width >= 768;

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="About" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                <AboutSettingsContent isTablet={screenIsTablet} />
                <View style={{ height: 24 }} />
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 16,
    },
    downloadsContainer: {
        alignItems: 'center',
        marginTop: 24,
        marginBottom: 16,
    },
    downloadsNumber: {
        fontSize: 48,
        fontWeight: '700',
        letterSpacing: -1,
    },
    downloadsLabel: {
        fontSize: 16,
        marginTop: 4,
    },
    communityContainer: {
        alignItems: 'center',
        marginTop: 16,
        paddingHorizontal: 16,
    },
    supportButton: {
        marginBottom: 16,
    },
    kofiImage: {
        width: 200,
        height: 50,
    },
    socialRow: {
        flexDirection: 'row',
        gap: 12,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    socialButton: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    socialButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    socialLogo: {
        width: 24,
        height: 24,
    },
    socialButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
    monkeyContainer: {
        alignItems: 'center',
        marginTop: 32,
    },
    monkeyAnimation: {
        width: 150,
        height: 150,
    },
    brandLogoContainer: {
        alignItems: 'center',
        marginTop: 16,
    },
    brandLogo: {
        width: 120,
        height: 40,
    },
    footer: {
        alignItems: 'center',
        marginTop: 24,
    },
    footerText: {
        fontSize: 14,
    },
});

export default AboutSettingsScreen;
