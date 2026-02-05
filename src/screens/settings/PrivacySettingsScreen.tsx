import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    StatusBar,
    Dimensions,
    Linking,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import { SettingsCard, SettingItem, CustomSwitch, ChevronRight } from './SettingsComponents';
import { useTranslation } from 'react-i18next';
import { telemetryService, TelemetrySettings } from '../../services/telemetryService';

const { width } = Dimensions.get('window');

interface PrivacySettingsContentProps {
    isTablet?: boolean;
}

/**
 * Privacy Settings Content Component
 * 
 * Provides user control over telemetry, analytics, and error reporting.
 * 
 * Data Collection Summary:
 * - Analytics (PostHog): Usage patterns, screen views, interactions
 * - Error Reporting (Sentry): Crash reports and errors for app stability
 * - Session Replay: Screen recordings when errors occur
 * - PII: Personal identifiable information (IP, device info, etc.)
 */
export const PrivacySettingsContent: React.FC<PrivacySettingsContentProps> = ({
    isTablet = false,
}) => {
    const { t } = useTranslation();
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();

    // Telemetry settings state
    const [settings, setSettings] = useState<TelemetrySettings>({
        analyticsEnabled: false,
        errorReportingEnabled: true,
        sessionReplayEnabled: false,
        piiEnabled: false,
    });
    const [isLoading, setIsLoading] = useState(true);

    const showAlert = useCallback((
        title: string,
        message: string,
        actions?: Array<{ label: string; onPress: () => void; style?: object }>
    ) => {
        const alertActions = (actions || [{ label: 'OK', onPress: () => { } }]).map(action => ({
            text: action.label,
            onPress: action.onPress,
            style: undefined as 'default' | 'cancel' | 'destructive' | undefined,
        }));

        Alert.alert(title, message, alertActions, { cancelable: true });
    }, []);

    // Load settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                await telemetryService.initialize();
                setSettings(telemetryService.getSettings());
            } catch (error) {
                console.error('Failed to load telemetry settings:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadSettings();
    }, []);

    // Handle analytics toggle
    const handleAnalyticsToggle = async (enabled: boolean) => {
        try {
            await telemetryService.setAnalyticsEnabled(enabled);
            setSettings(prev => ({ ...prev, analyticsEnabled: enabled }));
            
            if (enabled) {
                showAlert(
                    t('privacy.analytics_enabled_title', 'Analytics Enabled'),
                    t('privacy.analytics_enabled_message', 'Usage data will be collected to help improve the app. You can disable this at any time.')
                );
            }
        } catch (error) {
            console.error('Failed to update analytics setting:', error);
        }
    };

    // Handle error reporting toggle
    const handleErrorReportingToggle = async (enabled: boolean) => {
        if (!enabled) {
            showAlert(
                t('privacy.disable_error_reporting_title', 'Disable Error Reporting?'),
                t('privacy.disable_error_reporting_message', 'Disabling error reporting means we won\'t be notified of crashes or issues you experience. This may affect our ability to fix bugs.'),
                [
                    { label: t('common.cancel', 'Cancel'), onPress: () => { } },
                    {
                        label: t('common.disable', 'Disable'),
                        onPress: async () => {
                            await telemetryService.setErrorReportingEnabled(false);
                            setSettings(prev => ({ ...prev, errorReportingEnabled: false }));
                        }
                    }
                ]
            );
        } else {
            await telemetryService.setErrorReportingEnabled(true);
            setSettings(prev => ({ ...prev, errorReportingEnabled: true }));
        }
    };

    // Handle session replay toggle
    const handleSessionReplayToggle = async (enabled: boolean) => {
        if (enabled) {
            showAlert(
                t('privacy.enable_session_replay_title', 'Enable Session Replay?'),
                t('privacy.enable_session_replay_message', 'Session replay records your screen when errors occur to help us understand what happened. This may capture visible content on your screen.'),
                [
                    { label: t('common.cancel', 'Cancel'), onPress: () => { } },
                    {
                        label: t('common.enable', 'Enable'),
                        onPress: async () => {
                            await telemetryService.setSessionReplayEnabled(true);
                            setSettings(prev => ({ ...prev, sessionReplayEnabled: true }));
                        }
                    }
                ]
            );
        } else {
            await telemetryService.setSessionReplayEnabled(false);
            setSettings(prev => ({ ...prev, sessionReplayEnabled: false }));
        }
    };

    // Handle PII toggle
    const handlePiiToggle = async (enabled: boolean) => {
        if (enabled) {
            showAlert(
                t('privacy.enable_pii_title', 'Enable PII Collection?'),
                t('privacy.enable_pii_message', 'This allows collection of personally identifiable information like IP address and device details. This data helps diagnose issues but increases privacy exposure.'),
                [
                    { label: t('common.cancel', 'Cancel'), onPress: () => { } },
                    {
                        label: t('common.enable', 'Enable'),
                        onPress: async () => {
                            await telemetryService.setPiiEnabled(true);
                            setSettings(prev => ({ ...prev, piiEnabled: true }));
                        }
                    }
                ]
            );
        } else {
            await telemetryService.setPiiEnabled(false);
            setSettings(prev => ({ ...prev, piiEnabled: false }));
        }
    };

    // Disable all telemetry
    const handleDisableAll = () => {
        showAlert(
            t('privacy.disable_all_title', 'Disable All Telemetry?'),
            t('privacy.disable_all_message', 'This will disable all analytics, error reporting, and session replay. We won\'t receive any data about app usage or crashes.'),
            [
                { label: t('common.cancel', 'Cancel'), onPress: () => { } },
                {
                    label: t('privacy.disable_all_button', 'Disable All'),
                    onPress: async () => {
                        await telemetryService.disableAllTelemetry();
                        setSettings({
                            analyticsEnabled: false,
                            errorReportingEnabled: false,
                            sessionReplayEnabled: false,
                            piiEnabled: false,
                        });
                        // Delay showing the next alert to avoid Reanimated conflicts
                        setTimeout(() => {
                            showAlert(
                                t('privacy.all_disabled_title', 'All Telemetry Disabled'),
                                t('privacy.all_disabled_message', 'All data collection has been disabled. Changes take effect on next app restart.')
                            );
                        }, 300);
                    }
                }
            ]
        );
    };

    // Reset to recommended defaults
    const handleResetToRecommended = async () => {
        await telemetryService.enableRecommendedTelemetry();
        setSettings({
            analyticsEnabled: false,
            errorReportingEnabled: true,
            sessionReplayEnabled: false,
            piiEnabled: false,
        });
        // No chained alert here, this is direct so it's fine
        showAlert(
            t('privacy.reset_title', 'Reset to Recommended'),
            t('privacy.reset_message', 'Privacy settings have been reset to recommended defaults (error reporting enabled, analytics disabled).')
        );
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={[styles.loadingText, { color: currentTheme.colors.mediumEmphasis }]}>
                    {t('common.loading', 'Loading...')}
                </Text>
            </View>
        );
    }

    return (
        <>
            {/* Info Card */}
            <View style={[styles.infoCard, { backgroundColor: currentTheme.colors.elevation1, borderColor: currentTheme.colors.elevation2 }]}>
                <Text style={[styles.infoTitle, { color: currentTheme.colors.highEmphasis }]}>
                    {t('privacy.info_title', 'Your Privacy Matters')}
                </Text>
                <Text style={[styles.infoText, { color: currentTheme.colors.mediumEmphasis }]}>
                    {t('privacy.info_description', 'Control what data is collected and shared. All settings take effect on the next app restart. By default, only anonymous error reporting is enabled to help us fix crashes.')}
                </Text>
            </View>

            {/* Analytics Section */}
            <SettingsCard title={t('privacy.section_analytics', 'ANALYTICS')} isTablet={isTablet}>
                <SettingItem
                    title={t('privacy.analytics_title', 'Usage Analytics')}
                    description={t('privacy.analytics_description', 'Collect anonymous usage patterns and screen views')}
                    icon="bar-chart-2"
                    renderControl={() => (
                        <CustomSwitch
                            value={settings.analyticsEnabled}
                            onValueChange={handleAnalyticsToggle}
                        />
                    )}
                    isLast
                    isTablet={isTablet}
                />
            </SettingsCard>

            {/* Error Reporting Section */}
            <SettingsCard title={t('privacy.section_error_reporting', 'ERROR REPORTING')} isTablet={isTablet}>
                <SettingItem
                    title={t('privacy.error_reporting_title', 'Crash Reports')}
                    description={t('privacy.error_reporting_description', 'Send anonymous crash reports to improve stability')}
                    icon="alert-circle"
                    renderControl={() => (
                        <CustomSwitch
                            value={settings.errorReportingEnabled}
                            onValueChange={handleErrorReportingToggle}
                        />
                    )}
                    isTablet={isTablet}
                />
                <SettingItem
                    title={t('privacy.session_replay_title', 'Session Replay')}
                    description={t('privacy.session_replay_description', 'Record screen when errors occur')}
                    icon="video"
                    renderControl={() => (
                        <CustomSwitch
                            value={settings.sessionReplayEnabled}
                            onValueChange={handleSessionReplayToggle}
                        />
                    )}
                    isTablet={isTablet}
                />
                <SettingItem
                    title={t('privacy.pii_title', 'Include Device Info')}
                    description={t('privacy.pii_description', 'Send IP address and device details with reports')}
                    icon="user"
                    renderControl={() => (
                        <CustomSwitch
                            value={settings.piiEnabled}
                            onValueChange={handlePiiToggle}
                        />
                    )}
                    isLast
                    isTablet={isTablet}
                />
            </SettingsCard>

            {/* Quick Actions */}
            <SettingsCard title={t('privacy.section_quick_actions', 'QUICK ACTIONS')} isTablet={isTablet}>
                <SettingItem
                    title={t('privacy.disable_all', 'Disable All Telemetry')}
                    description={t('privacy.disable_all_desc', 'Turn off all data collection')}
                    icon="shield-off"
                    onPress={handleDisableAll}
                    renderControl={() => <ChevronRight />}
                    isTablet={isTablet}
                />
                <SettingItem
                    title={t('privacy.reset_recommended', 'Reset to Recommended')}
                    description={t('privacy.reset_recommended_desc', 'Privacy-first defaults with error reporting')}
                    icon="refresh-cw"
                    onPress={handleResetToRecommended}
                    renderControl={() => <ChevronRight />}
                    isLast
                    isTablet={isTablet}
                />
            </SettingsCard>

            {/* Learn More */}
            <SettingsCard title={t('privacy.section_learn_more', 'LEARN MORE')} isTablet={isTablet}>
                <SettingItem
                    title={t('privacy.privacy_policy', 'Privacy Policy')}
                    icon="file-text"
                    onPress={() => Linking.openURL('https://tapframe.github.io/NuvioStreaming/#privacy-policy')}
                    renderControl={() => <ChevronRight />}
                    isTablet={isTablet}
                />
            </SettingsCard>

            {/* Data Summary */}
            <View style={[styles.summaryCard, { backgroundColor: currentTheme.colors.elevation1, borderColor: currentTheme.colors.elevation2 }]}>
                <Text style={[styles.summaryTitle, { color: currentTheme.colors.highEmphasis }]}>
                    {t('privacy.current_settings', 'Current Settings Summary')}
                </Text>
                <View style={styles.summaryRow}>
                    <View style={[styles.statusDot, { backgroundColor: settings.analyticsEnabled ? '#4CAF50' : '#9E9E9E' }]} />
                    <Text style={[styles.summaryText, { color: currentTheme.colors.mediumEmphasis }]}>
                        {t('privacy.summary_analytics', 'Analytics')}: {settings.analyticsEnabled ? t('common.on', 'On') : t('common.off', 'Off')}
                    </Text>
                </View>
                <View style={styles.summaryRow}>
                    <View style={[styles.statusDot, { backgroundColor: settings.errorReportingEnabled ? '#4CAF50' : '#9E9E9E' }]} />
                    <Text style={[styles.summaryText, { color: currentTheme.colors.mediumEmphasis }]}>
                        {t('privacy.summary_errors', 'Error Reports')}: {settings.errorReportingEnabled ? t('common.on', 'On') : t('common.off', 'Off')}
                    </Text>
                </View>
                <View style={styles.summaryRow}>
                    <View style={[styles.statusDot, { backgroundColor: settings.sessionReplayEnabled ? '#FF9800' : '#9E9E9E' }]} />
                    <Text style={[styles.summaryText, { color: currentTheme.colors.mediumEmphasis }]}>
                        {t('privacy.summary_replay', 'Session Replay')}: {settings.sessionReplayEnabled ? t('common.on', 'On') : t('common.off', 'Off')}
                    </Text>
                </View>
                <View style={styles.summaryRow}>
                    <View style={[styles.statusDot, { backgroundColor: settings.piiEnabled ? '#FF9800' : '#9E9E9E' }]} />
                    <Text style={[styles.summaryText, { color: currentTheme.colors.mediumEmphasis }]}>
                        {t('privacy.summary_pii', 'Device Info')}: {settings.piiEnabled ? t('common.on', 'On') : t('common.off', 'Off')}
                    </Text>
                </View>
                <Text style={[styles.restartNote, { color: currentTheme.colors.mediumEmphasis }]}>
                    {t('privacy.restart_note_detailed', '* Analytics and error reporting changes take effect immediately. Session replay and PII settings require app restart.')}
                </Text>
            </View>

        </>
    );
};

/**
 * PrivacySettingsScreen - Wrapper for mobile navigation
 */
const PrivacySettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const screenIsTablet = width >= 768;

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader
                title={t('privacy.title', 'Privacy & Data')}
                showBackButton
                onBackPress={() => navigation.goBack()}
            />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                <PrivacySettingsContent isTablet={screenIsTablet} />
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
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 16,
    },
    infoCard: {
        marginHorizontal: 16,
        marginBottom: 20,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    infoTitle: {
        fontSize: 17,
        fontWeight: '600',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        lineHeight: 20,
    },
    summaryCard: {
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 20,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    summaryTitle: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 10,
    },
    summaryText: {
        fontSize: 14,
    },
    restartNote: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 8,
    },
});

export default PrivacySettingsScreen;
