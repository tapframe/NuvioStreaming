import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    Platform,
    Linking,
    ScrollView,
    KeyboardAvoidingView,
    Image,
    Switch,
    ActivityIndicator,
    RefreshControl
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { stremioService } from '../services/stremioService';
import { logger } from '../utils/logger';
import CustomAlert from '../components/CustomAlert';
import { mmkvStorage } from '../services/mmkvStorage';
import axios from 'axios';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;
const TORBOX_STORAGE_KEY = 'torbox_debrid_config';
const TORBOX_API_BASE = 'https://api.torbox.app/v1';

interface TorboxConfig {
    apiKey: string;
    isConnected: boolean;
    isEnabled: boolean;
    addonId?: string;
}

interface TorboxUserData {
    id: number;
    email: string;
    plan: number;
    total_downloaded: number;
    is_subscribed: boolean;
    premium_expires_at: string | null;
    base_email: string;
}

const getPlanName = (plan: number): string => {
    switch (plan) {
        case 0: return 'Free';
        case 1: return 'Essential ($3/mo)';
        case 2: return 'Pro ($10/mo)';
        case 3: return 'Standard ($5/mo)';
        default: return 'Unknown';
    }
};
const createStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.darkBackground,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 8 : 8,
        paddingBottom: 8,
    },
    backButton: {
        padding: 8,
        marginRight: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.white,
        letterSpacing: 0.3,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },
    description: {
        fontSize: 14,
        color: colors.mediumEmphasis,
        marginBottom: 16,
        lineHeight: 20,
        opacity: 0.9,
    },
    statusCard: {
        backgroundColor: colors.elevation2,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    statusLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.mediumEmphasis,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    statusValue: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.white,
    },
    statusConnected: {
        color: colors.success || '#4CAF50',
    },
    statusDisconnected: {
        color: colors.error || '#F44336',
    },
    divider: {
        height: 1,
        backgroundColor: colors.elevation3,
        marginVertical: 10,
    },
    actionButton: {
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    primaryButton: {
        backgroundColor: colors.primary,
    },
    dangerButton: {
        backgroundColor: colors.error || '#F44336',
    },
    buttonText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.white,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: colors.elevation2,
        borderRadius: 10,
        padding: 12,
        color: colors.white,
        fontSize: 14,
        borderWidth: 1,
        borderColor: colors.elevation3,
    },
    connectButton: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    connectButtonText: {
        color: colors.white,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    disabledButton: {
        opacity: 0.5,
    },
    section: {
        marginTop: 16,
        backgroundColor: colors.elevation1,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.white,
        marginBottom: 6,
        letterSpacing: 0.3,
    },
    sectionText: {
        fontSize: 13,
        color: colors.mediumEmphasis,
        textAlign: 'center',
        marginBottom: 12,
        lineHeight: 18,
        opacity: 0.9,
    },
    subscribeButton: {
        backgroundColor: colors.elevation3,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
    },
    subscribeButtonText: {
        color: colors.primary,
        fontWeight: '700',
        fontSize: 13,
        letterSpacing: 0.3,
    },
    logoContainer: {
        alignItems: 'center',
        marginTop: 'auto',
        paddingBottom: 16,
        paddingTop: 16,
    },
    poweredBy: {
        fontSize: 10,
        color: colors.mediumGray,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 1,
        opacity: 0.6,
    },
    logo: {
        width: 48,
        height: 48,
        marginBottom: 4,
    },
    logoRow: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    logoText: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.white,
        letterSpacing: 0.5,
    },
    userDataCard: {
        backgroundColor: colors.elevation2,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    userDataRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    userDataLabel: {
        fontSize: 13,
        color: colors.mediumEmphasis,
        flex: 1,
        letterSpacing: 0.2,
    },
    userDataValue: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.white,
        flex: 1,
        textAlign: 'right',
        letterSpacing: 0.2,
    },
    planBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    planBadgeFree: {
        backgroundColor: colors.elevation3,
    },
    planBadgePaid: {
        backgroundColor: colors.primary + '20',
    },
    planBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    planBadgeTextFree: {
        color: colors.mediumEmphasis,
    },
    planBadgeTextPaid: {
        color: colors.primary,
    },
    userDataHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.elevation3,
    },
    userDataTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.white,
        letterSpacing: 0.3,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    guideLink: {
        marginBottom: 16,
        alignSelf: 'flex-start',
    },
    guideLinkText: {
        color: colors.primary,
        fontSize: 13,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    disclaimer: {
        fontSize: 10,
        color: colors.mediumGray,
        textAlign: 'center',
        marginTop: 8,
        opacity: 0.6,
    }
});

const DebridIntegrationScreen = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const colors = currentTheme.colors;
    const styles = createStyles(colors);

    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [config, setConfig] = useState<TorboxConfig | null>(null);
    const [userData, setUserData] = useState<TorboxUserData | null>(null);
    const [userDataLoading, setUserDataLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Alert state
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');
    const [alertActions, setAlertActions] = useState<any[]>([]);

    const loadConfig = useCallback(async () => {
        try {
            const storedConfig = await mmkvStorage.getItem(TORBOX_STORAGE_KEY);
            if (storedConfig) {
                const parsedConfig = JSON.parse(storedConfig);
                setConfig(parsedConfig);

                // Check if addon is actually installed
                const addons = await stremioService.getInstalledAddonsAsync();
                const torboxAddon = addons.find(addon =>
                    addon.id?.includes('torbox') ||
                    addon.url?.includes('torbox') ||
                    (addon as any).transport?.includes('torbox')
                );

                if (torboxAddon && !parsedConfig.isConnected) {
                    // Update config if addon exists but config says not connected
                    const updatedConfig = { ...parsedConfig, isConnected: true, addonId: torboxAddon.id };
                    setConfig(updatedConfig);
                    await mmkvStorage.setItem(TORBOX_STORAGE_KEY, JSON.stringify(updatedConfig));
                } else if (!torboxAddon && parsedConfig.isConnected) {
                    // Update config if addon doesn't exist but config says connected
                    const updatedConfig = { ...parsedConfig, isConnected: false, addonId: undefined };
                    setConfig(updatedConfig);
                    await mmkvStorage.setItem(TORBOX_STORAGE_KEY, JSON.stringify(updatedConfig));
                }
            }
        } catch (error) {
            logger.error('Failed to load Torbox config:', error);
        } finally {
            setInitialLoading(false);
        }
    }, []);

    const fetchUserData = useCallback(async () => {
        if (!config?.apiKey || !config?.isConnected) return;

        setUserDataLoading(true);
        try {
            const response = await axios.get(`${TORBOX_API_BASE}/api/user/me`, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`
                },
                params: {
                    settings: false
                }
            });

            if (response.data.success && response.data.data) {
                setUserData(response.data.data);
            }
        } catch (error) {
            logger.error('Failed to fetch Torbox user data:', error);
            // Don't show error to user, just log it
        } finally {
            setUserDataLoading(false);
        }
    }, [config]);

    useFocusEffect(
        useCallback(() => {
            loadConfig();
        }, [loadConfig])
    );

    useEffect(() => {
        if (config?.isConnected) {
            fetchUserData();
        }
    }, [config?.isConnected, fetchUserData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([loadConfig(), fetchUserData()]);
        setRefreshing(false);
    }, [loadConfig, fetchUserData]);

    const handleConnect = async () => {
        if (!apiKey.trim()) {
            setAlertTitle('Error');
            setAlertMessage('Please enter a valid API Key');
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
            return;
        }

        setLoading(true);
        try {
            const manifestUrl = `https://stremio.torbox.app/${apiKey.trim()}/manifest.json`;

            // Install the addon using stremioService
            await stremioService.installAddon(manifestUrl);

            // Get the installed addon ID
            const addons = await stremioService.getInstalledAddonsAsync();
            const torboxAddon = addons.find(addon =>
                addon.id?.includes('torbox') ||
                addon.url?.includes('torbox') ||
                (addon as any).transport?.includes('torbox')
            );

            // Save config
            const newConfig: TorboxConfig = {
                apiKey: apiKey.trim(),
                isConnected: true,
                isEnabled: true,
                addonId: torboxAddon?.id
            };
            await mmkvStorage.setItem(TORBOX_STORAGE_KEY, JSON.stringify(newConfig));
            setConfig(newConfig);
            setApiKey('');

            setAlertTitle('Success');
            setAlertMessage('Torbox addon connected successfully!');
            setAlertActions([{
                label: 'OK',
                onPress: () => setAlertVisible(false)
            }]);
            setAlertVisible(true);
        } catch (error) {
            logger.error('Failed to install Torbox addon:', error);
            setAlertTitle('Error');
            setAlertMessage('Failed to connect addon. Please check your API Key and try again.');
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleEnabled = async (enabled: boolean) => {
        if (!config) return;

        try {
            const updatedConfig = { ...config, isEnabled: enabled };
            await mmkvStorage.setItem(TORBOX_STORAGE_KEY, JSON.stringify(updatedConfig));
            setConfig(updatedConfig);

            // Note: Since we can't disable/enable addons in the current stremioService,
            // we'll just track the state. The addon filtering will happen in AddonsScreen
        } catch (error) {
            logger.error('Failed to toggle Torbox addon:', error);
        }
    };

    const handleDisconnect = async () => {
        setAlertTitle('Disconnect Torbox');
        setAlertMessage('Are you sure you want to disconnect Torbox? This will remove the addon and clear your saved API key.');
        setAlertActions([
            { label: 'Cancel', onPress: () => setAlertVisible(false), style: { color: colors.mediumGray } },
            {
                label: 'Disconnect',
                onPress: async () => {
                    setAlertVisible(false);
                    setLoading(true);
                    try {
                        // Find and remove the torbox addon
                        const addons = await stremioService.getInstalledAddonsAsync();
                        const torboxAddon = addons.find(addon =>
                            addon.id?.includes('torbox') ||
                            addon.url?.includes('torbox') ||
                            (addon as any).transport?.includes('torbox')
                        );

                        if (torboxAddon) {
                            await stremioService.removeAddon(torboxAddon.id);
                        }

                        // Clear config
                        await mmkvStorage.removeItem(TORBOX_STORAGE_KEY);
                        setConfig(null);

                        setAlertTitle('Success');
                        setAlertMessage('Torbox disconnected successfully');
                        setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
                        setAlertVisible(true);
                    } catch (error) {
                        logger.error('Failed to disconnect Torbox:', error);
                        setAlertTitle('Error');
                        setAlertMessage('Failed to disconnect Torbox');
                        setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
                        setAlertVisible(true);
                    } finally {
                        setLoading(false);
                    }
                },
                style: { color: colors.error || '#F44336' }
            }
        ]);
        setAlertVisible(true);
    };

    const openSubscription = () => {
        Linking.openURL('https://torbox.app/subscription?referral=493192f2-6403-440f-b414-768f72222ec7');
    };

    if (initialLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor={colors.darkBackground} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={colors.darkBackground} />

            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                >
                    <Feather name="arrow-left" size={24} color={colors.white} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Debrid Integration</Text>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                            colors={[colors.primary]}
                        />
                    }
                >
                    {config?.isConnected ? (
                        // Connected state
                        <>
                            <View style={styles.statusCard}>
                                <View style={styles.statusRow}>
                                    <Text style={styles.statusLabel}>Status</Text>
                                    <Text style={[styles.statusValue, styles.statusConnected]}>Connected</Text>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.statusRow}>
                                    <Text style={styles.statusLabel}>Enable Addon</Text>
                                    <Switch
                                        value={config.isEnabled}
                                        onValueChange={handleToggleEnabled}
                                        trackColor={{ false: colors.elevation2, true: colors.primary }}
                                        thumbColor={config.isEnabled ? colors.white : colors.mediumEmphasis}
                                        ios_backgroundColor={colors.elevation2}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.actionButton, styles.dangerButton, loading && styles.disabledButton]}
                                onPress={handleDisconnect}
                                disabled={loading}
                            >
                                <Text style={styles.buttonText}>
                                    {loading ? 'Disconnecting...' : 'Disconnect & Remove'}
                                </Text>
                            </TouchableOpacity>

                            {/* User Data Card */}
                            {userData && (
                                <View style={styles.userDataCard}>
                                    <View style={styles.userDataHeader}>
                                        <Text style={styles.userDataTitle}>Account Information</Text>
                                        {userDataLoading && (
                                            <ActivityIndicator size="small" color={colors.primary} />
                                        )}
                                    </View>

                                    <View style={styles.userDataRow}>
                                        <Text style={styles.userDataLabel}>Email</Text>
                                        <Text style={styles.userDataValue} numberOfLines={1}>
                                            {userData.base_email || userData.email}
                                        </Text>
                                    </View>

                                    <View style={styles.userDataRow}>
                                        <Text style={styles.userDataLabel}>Plan</Text>
                                        <View style={[
                                            styles.planBadge,
                                            userData.plan === 0 ? styles.planBadgeFree : styles.planBadgePaid
                                        ]}>
                                            <Text style={[
                                                styles.planBadgeText,
                                                userData.plan === 0 ? styles.planBadgeTextFree : styles.planBadgeTextPaid
                                            ]}>
                                                {getPlanName(userData.plan)}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.userDataRow}>
                                        <Text style={styles.userDataLabel}>Status</Text>
                                        <Text style={[
                                            styles.userDataValue,
                                            { color: userData.is_subscribed ? (colors.success || '#4CAF50') : colors.mediumEmphasis }
                                        ]}>
                                            {userData.is_subscribed ? 'Active' : 'Free'}
                                        </Text>
                                    </View>

                                    {userData.premium_expires_at && (
                                        <View style={styles.userDataRow}>
                                            <Text style={styles.userDataLabel}>Expires</Text>
                                            <Text style={styles.userDataValue}>
                                                {new Date(userData.premium_expires_at).toLocaleDateString()}
                                            </Text>
                                        </View>
                                    )}

                                    <View style={styles.userDataRow}>
                                        <Text style={styles.userDataLabel}>Downloaded</Text>
                                        <Text style={styles.userDataValue}>
                                            {(userData.total_downloaded / (1024 * 1024 * 1024)).toFixed(2)} GB
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>✓ Connected to TorBox</Text>
                                <Text style={styles.sectionText}>
                                    Your TorBox addon is active and providing premium streams.{config.isEnabled ? '' : ' (Currently disabled)'}
                                </Text>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Configure Addon</Text>
                                <Text style={styles.sectionText}>
                                    Customize your streaming experience. Sort by quality, filter file sizes, and manage other integration settings.
                                </Text>
                                <TouchableOpacity
                                    style={styles.subscribeButton}
                                    onPress={() => Linking.openURL('https://torbox.app/settings?section=integration-settings')}
                                >
                                    <Text style={styles.subscribeButtonText}>Open Settings</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        // Not connected state
                        <>
                            <Text style={styles.description}>
                                Unlock 4K high-quality streams and lightning-fast speeds by integrating Torbox. Enter your API Key below to instantly upgrade your streaming experience.
                            </Text>

                            <TouchableOpacity onPress={() => Linking.openURL('https://guides.viren070.me/stremio/technical-details#debrid-services')} style={styles.guideLink}>
                                <Text style={styles.guideLinkText}>What is a Debrid Service?</Text>
                            </TouchableOpacity>

                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Torbox API Key</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your API Key"
                                    placeholderTextColor={colors.mediumGray}
                                    value={apiKey}
                                    onChangeText={setApiKey}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    secureTextEntry
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.connectButton, loading && styles.disabledButton]}
                                onPress={handleConnect}
                                disabled={loading}
                            >
                                <Text style={styles.connectButtonText}>
                                    {loading ? 'Connecting...' : 'Connect & Install'}
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Unlock Premium Speeds</Text>
                                <Text style={styles.sectionText}>
                                    Get a Torbox subscription to access cached high-quality streams with zero buffering.
                                </Text>
                                <TouchableOpacity style={styles.subscribeButton} onPress={openSubscription}>
                                    <Text style={styles.subscribeButtonText}>Get Subscription</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    <View style={[styles.logoContainer, { marginTop: 60 }]}>
                        <Text style={styles.poweredBy}>Powered by</Text>
                        <View style={styles.logoRow}>
                            <Image
                                source={{ uri: 'https://torbox.app/assets/logo-57adbf99.svg' }}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                            <Text style={styles.logoText}>TorBox</Text>
                        </View>
                        <Text style={styles.disclaimer}>Nuvio is not affiliated with Torbox in any way.</Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                actions={alertActions}
                onClose={() => setAlertVisible(false)}
            />
        </SafeAreaView>
    );
};

export default DebridIntegrationScreen;
