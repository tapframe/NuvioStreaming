import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Platform, Linking } from 'react-native';
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

const AboutSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();

    const [totalDownloads, setTotalDownloads] = useState<number | null>(null);
    const [displayDownloads, setDisplayDownloads] = useState<number | null>(null);

    useEffect(() => {
        const loadDownloads = async () => {
            const downloads = await fetchTotalDownloads();
            if (downloads !== null) {
                setTotalDownloads(downloads);
                setDisplayDownloads(downloads);
            }
        };
        loadDownloads();
    }, []);

    // Animate counting up when totalDownloads changes
    useEffect(() => {
        if (totalDownloads === null || displayDownloads === null) return;
        if (totalDownloads === displayDownloads) return;

        const start = displayDownloads;
        const end = totalDownloads;
        const duration = 2000;
        const startTime = Date.now();

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 2);
            const current = Math.floor(start + (end - start) * easeProgress);

            setDisplayDownloads(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                setDisplayDownloads(end);
            }
        };

        requestAnimationFrame(animate);
    }, [totalDownloads]);

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="About" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                <SettingsCard title="INFORMATION">
                    <SettingItem
                        title="Privacy Policy"
                        icon="lock"
                        onPress={() => Linking.openURL('https://tapframe.github.io/NuvioStreaming/#privacy-policy')}
                        renderControl={() => <ChevronRight />}
                    />
                    <SettingItem
                        title="Report Issue"
                        icon="alert-triangle"
                        onPress={() => Sentry.showFeedbackWidget()}
                        renderControl={() => <ChevronRight />}
                    />
                    <SettingItem
                        title="Version"
                        description={getDisplayedAppVersion()}
                        icon="info"
                    />
                    <SettingItem
                        title="Contributors"
                        description="View all contributors"
                        icon="users"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('Contributors')}
                        isLast
                    />
                </SettingsCard>

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
