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
    RefreshControl,
    Dimensions
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Feather, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { stremioService } from '../services/stremioService';
import { logger } from '../utils/logger';
import CustomAlert from '../components/CustomAlert';
import { mmkvStorage } from '../services/mmkvStorage';
import axios from 'axios';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;
const TORBOX_STORAGE_KEY = 'torbox_debrid_config';
const TORBOX_API_BASE = 'https://api.torbox.app/v1';
const TORRENTIO_CONFIG_KEY = 'torrentio_config';

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

// Torrentio Configuration Types
interface TorrentioConfig {
    providers: string[];
    sort: string;
    qualityFilter: string[];
    priorityLanguages: string[];
    maxResults: string;
    debridService: string;
    debridApiKey: string;
    noDownloadLinks: boolean;
    noCatalog: boolean;
    isInstalled: boolean;
    manifestUrl?: string;
}

// Torrentio Options Data
const TORRENTIO_PROVIDERS = [
    { id: 'yts', name: 'YTS' },
    { id: 'eztv', name: 'EZTV' },
    { id: 'rarbg', name: 'RARBG' },
    { id: '1337x', name: '1337x' },
    { id: 'thepiratebay', name: 'ThePirateBay' },
    { id: 'kickasstorrents', name: 'KickassTorrents' },
    { id: 'torrentgalaxy', name: 'TorrentGalaxy' },
    { id: 'magnetdl', name: 'MagnetDL' },
    { id: 'horriblesubs', name: 'HorribleSubs' },
    { id: 'nyaasi', name: 'NyaaSi' },
    { id: 'tokyotosho', name: 'TokyoTosho' },
    { id: 'anidex', name: 'AniDex' },
    { id: 'rutor', name: '🇷🇺 Rutor' },
    { id: 'rutracker', name: '🇷🇺 Rutracker' },
    { id: 'comando', name: '🇵🇹 Comando' },
    { id: 'bludv', name: '🇧🇷 BluDV' },
    { id: 'torrent9', name: '🇫🇷 Torrent9' },
    { id: 'ilcorsaronero', name: '🇮🇹 ilCorSaRoNeRo' },
    { id: 'mejortorrent', name: '🇪🇸 MejorTorrent' },
    { id: 'wolfmax4k', name: '🇪🇸 Wolfmax4k' },
    { id: 'cinecalidad', name: '🇲🇽 Cinecalidad' },
];

const TORRENTIO_SORT_OPTIONS = [
    { id: 'quality', name: 'By quality then seeders' },
    { id: 'qualitysize', name: 'By quality then size' },
    { id: 'seeders', name: 'By seeders' },
    { id: 'size', name: 'By size' },
];

const TORRENTIO_QUALITY_FILTERS = [
    { id: 'brremux', name: 'BluRay REMUX' },
    { id: 'hdrall', name: 'HDR/HDR10+/Dolby Vision' },
    { id: 'dolbyvision', name: 'Dolby Vision' },
    { id: '4k', name: '4K' },
    { id: '1080p', name: '1080p' },
    { id: '720p', name: '720p' },
    { id: '480p', name: '480p' },
    { id: 'scr', name: 'Screener' },
    { id: 'cam', name: 'CAM' },
    { id: 'unknown', name: 'Unknown' },
];

const TORRENTIO_LANGUAGES = [
    { id: 'english', name: '🇬🇧 English' },
    { id: 'russian', name: '🇷🇺 Russian' },
    { id: 'italian', name: '🇮🇹 Italian' },
    { id: 'portuguese', name: '🇵🇹 Portuguese' },
    { id: 'spanish', name: '🇪🇸 Spanish' },
    { id: 'latino', name: '🇲🇽 Latino' },
    { id: 'korean', name: '🇰🇷 Korean' },
    { id: 'chinese', name: '🇨🇳 Chinese' },
    { id: 'french', name: '🇫🇷 French' },
    { id: 'german', name: '🇩🇪 German' },
    { id: 'dutch', name: '🇳🇱 Dutch' },
    { id: 'hindi', name: '🇮🇳 Hindi' },
    { id: 'japanese', name: '🇯🇵 Japanese' },
    { id: 'polish', name: '🇵🇱 Polish' },
    { id: 'arabic', name: '🇸🇦 Arabic' },
    { id: 'turkish', name: '🇹🇷 Turkish' },
];

const TORRENTIO_DEBRID_SERVICES = [
    { id: 'torbox', name: 'TorBox', keyParam: 'torbox' },
    { id: 'realdebrid', name: 'RealDebrid', keyParam: 'realdebrid' },
    { id: 'alldebrid', name: 'AllDebrid', keyParam: 'alldebrid' },
    { id: 'premiumize', name: 'Premiumize', keyParam: 'premiumize' },
    { id: 'debridlink', name: 'DebridLink', keyParam: 'debridlink' },
    { id: 'offcloud', name: 'Offcloud', keyParam: 'offcloud' },
];

const TORRENTIO_MAX_RESULTS = [
    { id: '', name: 'All results' },
    { id: '1', name: '1 per quality' },
    { id: '2', name: '2 per quality' },
    { id: '3', name: '3 per quality' },
    { id: '5', name: '5 per quality' },
    { id: '10', name: '10 per quality' },
];

const DEFAULT_TORRENTIO_CONFIG: TorrentioConfig = {
    providers: TORRENTIO_PROVIDERS.map(p => p.id), // All providers by default
    sort: 'quality',
    qualityFilter: ['scr', 'cam'],
    priorityLanguages: [],
    maxResults: '',
    debridService: 'torbox', // Default to TorBox
    debridApiKey: '',
    noDownloadLinks: false,
    noCatalog: false,
    isInstalled: false,
};

const getPlanName = (plan: number, t: any): string => {
    switch (plan) {
        case 0: return t('debrid.plan_free');
        case 1: return t('debrid.plan_essential');
        case 2: return t('debrid.plan_pro');
        case 3: return t('debrid.plan_standard');
        default: return t('debrid.plan_unknown');
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
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: colors.elevation1,
        borderRadius: 12,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: colors.primary,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.mediumEmphasis,
    },
    activeTabText: {
        color: colors.white,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },
    description: {
        fontSize: 14,
        color: colors.mediumEmphasis,
        marginBottom: 12,
        lineHeight: 20,
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
    },
    // Torrentio specific styles
    configSection: {
        backgroundColor: colors.elevation2,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    configSectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.white,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: colors.elevation3,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    chipSelected: {
        backgroundColor: colors.primary + '30',
        borderColor: colors.primary,
    },
    chipText: {
        fontSize: 13,
        color: colors.mediumEmphasis,
    },
    chipTextSelected: {
        color: colors.primary,
        fontWeight: '600',
    },
    pickerContainer: {
        backgroundColor: colors.elevation3,
        borderRadius: 10,
        overflow: 'hidden',
    },
    pickerItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.elevation2,
    },
    pickerItemSelected: {
        backgroundColor: colors.primary + '20',
    },
    pickerItemText: {
        fontSize: 14,
        color: colors.white,
    },
    pickerItemTextSelected: {
        color: colors.primary,
        fontWeight: '600',
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    switchLabel: {
        fontSize: 14,
        color: colors.white,
        flex: 1,
    },
    warningCard: {
        backgroundColor: colors.warning + '20',
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    warningText: {
        fontSize: 13,
        color: colors.warning || '#FFC107',
        marginLeft: 12,
        flex: 1,
        lineHeight: 18,
    },
    manifestPreview: {
        backgroundColor: colors.elevation3,
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
    },
    manifestUrl: {
        fontSize: 11,
        color: colors.mediumEmphasis,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    installedBadge: {
        backgroundColor: colors.success + '20',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginBottom: 12,
    },
    installedBadgeText: {
        color: colors.success || '#4CAF50',
        fontSize: 12,
        fontWeight: '700',
    },
    selectAllButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: colors.elevation3,
        borderRadius: 6,
        marginBottom: 8,
        alignSelf: 'flex-start',
    },
    selectAllText: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '600',
    },
    // Accordion styles
    accordionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.elevation2,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    accordionHeaderText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.white,
    },
    accordionSubtext: {
        fontSize: 12,
        color: colors.mediumEmphasis,
        marginTop: 2,
    },
    accordionContent: {
        backgroundColor: colors.elevation2,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        marginTop: -16,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
    },
    promoCard: {
        backgroundColor: colors.primary + '15',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.primary + '30',
    },
    promoTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.white,
        marginBottom: 6,
    },
    promoText: {
        fontSize: 13,
        color: colors.mediumEmphasis,
        lineHeight: 18,
        marginBottom: 12,
    },
    promoButton: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    promoButtonText: {
        color: colors.white,
        fontWeight: '700',
        fontSize: 13,
    },
    recommendedBadge: {
        backgroundColor: colors.primary,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    recommendedText: {
        fontSize: 10,
        color: colors.white,
        fontWeight: '700',
    },
});

const DebridIntegrationScreen = () => {
    const { t } = useTranslation();
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const colors = currentTheme.colors;
    const styles = createStyles(colors);

    // Tab state
    const [activeTab, setActiveTab] = useState<'torbox' | 'torrentio'>('torbox');

    // Torbox state
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [config, setConfig] = useState<TorboxConfig | null>(null);
    const [userData, setUserData] = useState<TorboxUserData | null>(null);
    const [userDataLoading, setUserDataLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Torrentio state
    const [torrentioConfig, setTorrentioConfig] = useState<TorrentioConfig>(DEFAULT_TORRENTIO_CONFIG);
    const [torrentioLoading, setTorrentioLoading] = useState(false);

    // Accordion states for collapsible sections
    const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
        sorting: false,
        qualityFilter: false,
        languages: false,
        maxResults: false,
        options: false,
    });

    // Alert state
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');
    const [alertActions, setAlertActions] = useState<any[]>([]);

    // Load Torbox config
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
                    const updatedConfig = { ...parsedConfig, isConnected: true, addonId: torboxAddon.id };
                    setConfig(updatedConfig);
                    await mmkvStorage.setItem(TORBOX_STORAGE_KEY, JSON.stringify(updatedConfig));
                } else if (!torboxAddon && parsedConfig.isConnected) {
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

    // Load Torrentio config
    const loadTorrentioConfig = useCallback(async () => {
        try {
            const storedConfig = await mmkvStorage.getItem(TORRENTIO_CONFIG_KEY);
            if (storedConfig) {
                const parsedConfig = JSON.parse(storedConfig);
                setTorrentioConfig(parsedConfig);
            }

            // Check if Torrentio addon is installed
            const addons = await stremioService.getInstalledAddonsAsync();
            const torrentioAddon = addons.find(addon =>
                addon.id?.includes('torrentio') ||
                addon.url?.includes('torrentio.strem.fun') ||
                (addon as any).transport?.includes('torrentio.strem.fun')
            );

            if (torrentioAddon) {
                setTorrentioConfig(prev => ({
                    ...prev,
                    isInstalled: true,
                    manifestUrl: (torrentioAddon as any).transport || torrentioAddon.url
                }));
            }
        } catch (error) {
            logger.error('Failed to load Torrentio config:', error);
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
        } finally {
            setUserDataLoading(false);
        }
    }, [config]);

    useFocusEffect(
        useCallback(() => {
            loadConfig();
            loadTorrentioConfig();
        }, [loadConfig, loadTorrentioConfig])
    );

    useEffect(() => {
        if (config?.isConnected) {
            fetchUserData();
        }
    }, [config?.isConnected, fetchUserData]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([loadConfig(), loadTorrentioConfig(), fetchUserData()]);
        setRefreshing(false);
    }, [loadConfig, loadTorrentioConfig, fetchUserData]);

    // Torbox handlers
    const handleConnect = async () => {
        if (!apiKey.trim()) {
            setAlertTitle(t('common.error'));
            setAlertMessage(t('debrid.error_api_required')); // Reusing key or common error
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
            return;
        }

        setLoading(true);
        try {
            const manifestUrl = `https://stremio.torbox.app/${apiKey.trim()}/manifest.json`;
            await stremioService.installAddon(manifestUrl);

            const addons = await stremioService.getInstalledAddonsAsync();
            const torboxAddon = addons.find(addon =>
                addon.id?.includes('torbox') ||
                addon.url?.includes('torbox') ||
                (addon as any).transport?.includes('torbox')
            );

            const newConfig: TorboxConfig = {
                apiKey: apiKey.trim(),
                isConnected: true,
                isEnabled: true,
                addonId: torboxAddon?.id
            };
            await mmkvStorage.setItem(TORBOX_STORAGE_KEY, JSON.stringify(newConfig));
            setConfig(newConfig);
            setApiKey('');

            setAlertTitle(t('common.success'));
            setAlertMessage(t('debrid.connected_title')); // Or similar success message
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
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
        } catch (error) {
            logger.error('Failed to toggle Torbox addon:', error);
        }
    };

    const handleDisconnect = async () => {
        setAlertTitle(t('debrid.alert_disconnect_title'));
        setAlertMessage(t('debrid.alert_disconnect_msg'));
        setAlertActions([
            { label: 'Cancel', onPress: () => setAlertVisible(false), style: { color: colors.mediumGray } },
            {
                label: t('debrid.disconnect_button'),
                onPress: async () => {
                    setAlertVisible(false);
                    setLoading(true);
                    try {
                        const addons = await stremioService.getInstalledAddonsAsync();
                        const torboxAddon = addons.find(addon =>
                            addon.id?.includes('torbox') ||
                            addon.url?.includes('torbox') ||
                            (addon as any).transport?.includes('torbox')
                        );

                        if (torboxAddon) {
                            await stremioService.removeAddon(torboxAddon.id);
                        }

                        await mmkvStorage.removeItem(TORBOX_STORAGE_KEY);
                        setConfig(null);
                        setUserData(null);

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

    // Torrentio handlers
    const generateTorrentioManifestUrl = useCallback((): string => {
        const parts: string[] = [];

        // Providers (only if not all selected)
        if (torrentioConfig.providers.length > 0 && torrentioConfig.providers.length < TORRENTIO_PROVIDERS.length) {
            parts.push(`providers=${torrentioConfig.providers.join(',')}`);
        }

        // Sort (only if not default)
        if (torrentioConfig.sort && torrentioConfig.sort !== 'quality') {
            parts.push(`sort=${torrentioConfig.sort}`);
        }

        // Quality filter
        if (torrentioConfig.qualityFilter.length > 0) {
            parts.push(`qualityfilter=${torrentioConfig.qualityFilter.join(',')}`);
        }

        // Priority languages
        if (torrentioConfig.priorityLanguages.length > 0) {
            parts.push(`language=${torrentioConfig.priorityLanguages.join(',')}`);
        }

        // Max results
        if (torrentioConfig.maxResults) {
            parts.push(`limit=${torrentioConfig.maxResults}`);
        }

        // Debrid service and API key
        if (torrentioConfig.debridService !== 'none' && torrentioConfig.debridApiKey) {
            const debridInfo = TORRENTIO_DEBRID_SERVICES.find(d => d.id === torrentioConfig.debridService);
            if (debridInfo) {
                parts.push(`${debridInfo.keyParam}=${torrentioConfig.debridApiKey}`);
            }
        }

        // Options
        if (torrentioConfig.noDownloadLinks) {
            parts.push('nodownloadlinks=true');
        }
        if (torrentioConfig.noCatalog) {
            parts.push('nocatalog=true');
        }

        const configString = parts.length > 0 ? parts.join('|') + '/' : '';
        return `https://torrentio.strem.fun/${configString}manifest.json`;
    }, [torrentioConfig]);

    const toggleQualityFilter = (qualityId: string) => {
        setTorrentioConfig(prev => {
            const newFilters = prev.qualityFilter.includes(qualityId)
                ? prev.qualityFilter.filter(q => q !== qualityId)
                : [...prev.qualityFilter, qualityId];
            return { ...prev, qualityFilter: newFilters };
        });
    };

    const toggleLanguage = (langId: string) => {
        setTorrentioConfig(prev => {
            const newLangs = prev.priorityLanguages.includes(langId)
                ? prev.priorityLanguages.filter(l => l !== langId)
                : [...prev.priorityLanguages, langId];
            return { ...prev, priorityLanguages: newLangs };
        });
    };

    const handleInstallTorrentio = async () => {
        // Check if API key is provided
        if (!torrentioConfig.debridApiKey.trim()) {
            setAlertTitle(t('debrid.error_api_required'));
            setAlertMessage(t('debrid.error_api_required_desc'));
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
            return;
        }

        setTorrentioLoading(true);
        try {
            const manifestUrl = generateTorrentioManifestUrl();

            // Check if already installed
            const addons = await stremioService.getInstalledAddonsAsync();
            const existingTorrentio = addons.find(addon =>
                addon.id?.includes('torrentio') ||
                addon.url?.includes('torrentio.strem.fun') ||
                (addon as any).transport?.includes('torrentio.strem.fun')
            );

            if (existingTorrentio) {
                // Remove existing and reinstall with new config
                await stremioService.removeAddon(existingTorrentio.id);
            }

            await stremioService.installAddon(manifestUrl);

            // Save config
            const newConfig = {
                ...torrentioConfig,
                isInstalled: true,
                manifestUrl
            };
            await mmkvStorage.setItem(TORRENTIO_CONFIG_KEY, JSON.stringify(newConfig));
            setTorrentioConfig(newConfig);

            setAlertTitle(t('common.success'));
            setAlertMessage(t('debrid.success_installed'));
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
        } catch (error) {
            logger.error('Failed to install Torrentio addon:', error);
            setAlertTitle('Error');
            setAlertMessage('Failed to install Torrentio addon. Please try again.');
            setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
            setAlertVisible(true);
        } finally {
            setTorrentioLoading(false);
        }
    };

    const handleRemoveTorrentio = async () => {
        setAlertTitle('Remove Torrentio');
        setAlertMessage('Are you sure you want to remove the Torrentio addon?');
        setAlertActions([
            { label: t('common.cancel'), onPress: () => setAlertVisible(false), style: { color: colors.mediumGray } },
            {
                label: t('debrid.remove_button'),
                onPress: async () => {
                    setAlertVisible(false);
                    setTorrentioLoading(true);
                    try {
                        const addons = await stremioService.getInstalledAddonsAsync();
                        const torrentioAddon = addons.find(addon =>
                            addon.id?.includes('torrentio') ||
                            addon.url?.includes('torrentio.strem.fun') ||
                            (addon as any).transport?.includes('torrentio.strem.fun')
                        );

                        if (torrentioAddon) {
                            await stremioService.removeAddon(torrentioAddon.id);
                        }

                        const newConfig = {
                            ...torrentioConfig,
                            isInstalled: false,
                            manifestUrl: undefined
                        };
                        await mmkvStorage.setItem(TORRENTIO_CONFIG_KEY, JSON.stringify(newConfig));
                        setTorrentioConfig(newConfig);

                        setAlertTitle(t('common.success'));
                        setAlertMessage(t('debrid.success_removed'));
                        setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
                        setAlertVisible(true);
                    } catch (error) {
                        logger.error('Failed to remove Torrentio:', error);
                        setAlertTitle('Error');
                        setAlertMessage('Failed to remove Torrentio addon');
                        setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
                        setAlertVisible(true);
                    } finally {
                        setTorrentioLoading(false);
                    }
                },
                style: { color: colors.error || '#F44336' }
            }
        ]);
        setAlertVisible(true);
    };

    // Render Torbox Tab
    const renderTorboxTab = () => (
        <>
            {config?.isConnected ? (
                <>
                    <View style={styles.statusCard}>
                        <View style={styles.statusRow}>
                            <Text style={styles.statusLabel}>{t('common.status')}</Text>
                            <Text style={[styles.statusValue, styles.statusConnected]}>{t('debrid.status_connected')}</Text>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.statusRow}>
                            <Text style={styles.statusLabel}>{t('debrid.enable_addon')}</Text>
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
                            {loading ? t('debrid.disconnect_loading') : t('debrid.disconnect_button')}
                        </Text>
                    </TouchableOpacity>

                    {userData && (
                        <View style={styles.userDataCard}>
                            <View style={styles.userDataHeader}>
                                <Text style={styles.userDataTitle}>{t('debrid.account_info')}</Text>
                                {userDataLoading && (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                )}
                            </View>

                            <View style={styles.userDataRow}>
                                <Text style={styles.userDataLabel}>{t('common.email')}</Text>
                                <Text style={styles.userDataValue} numberOfLines={1}>
                                    {userData.base_email || userData.email}
                                </Text>
                            </View>

                            <View style={styles.userDataRow}>
                                <Text style={styles.userDataLabel}>{t('debrid.plan')}</Text>
                                <View style={[
                                    styles.planBadge,
                                    userData.plan === 0 ? styles.planBadgeFree : styles.planBadgePaid
                                ]}>
                                    <Text style={[
                                        styles.planBadgeText,
                                        userData.plan === 0 ? styles.planBadgeTextFree : styles.planBadgeTextPaid
                                    ]}>
                                        {getPlanName(userData.plan, t)}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.userDataRow}>
                                <Text style={styles.userDataLabel}>{t('common.status')}</Text>
                                <Text style={[
                                    styles.userDataValue,
                                    { color: userData.is_subscribed ? (colors.success || '#4CAF50') : colors.mediumEmphasis }
                                ]}>
                                    {userData.is_subscribed ? t('debrid.status_active') : t('debrid.plan_free')}
                                </Text>
                            </View>

                            {userData.premium_expires_at && (
                                <View style={styles.userDataRow}>
                                    <Text style={styles.userDataLabel}>{t('debrid.expires')}</Text>
                                    <Text style={styles.userDataValue}>
                                        {new Date(userData.premium_expires_at).toLocaleDateString()}
                                    </Text>
                                </View>
                            )}

                            <View style={styles.userDataRow}>
                                <Text style={styles.userDataLabel}>{t('debrid.downloaded')}</Text>
                                <Text style={styles.userDataValue}>
                                    {(userData.total_downloaded / (1024 * 1024 * 1024)).toFixed(2)} GB
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t('debrid.connected_title')}</Text>
                        <Text style={styles.sectionText}>
                            {t('debrid.connected_desc')}
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t('debrid.configure_title')}</Text>
                        <Text style={styles.sectionText}>
                            {t('debrid.configure_desc')}
                        </Text>
                        <TouchableOpacity
                            style={styles.subscribeButton}
                            onPress={() => Linking.openURL('https://torbox.app/settings?section=integration-settings')}
                        >
                            <Text style={styles.subscribeButtonText}>{t('debrid.open_settings')}</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : (
                <>
                    <Text style={styles.description}>
                        {t('debrid.description_torbox')}
                    </Text>

                    <TouchableOpacity onPress={() => Linking.openURL('https://guides.viren070.me/stremio/technical-details#debrid-services')} style={styles.guideLink}>
                        <Text style={styles.guideLinkText}>{t('debrid.what_is_debrid')}</Text>
                    </TouchableOpacity>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>{t('debrid.api_key_label')}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t('debrid.enter_api_key')}
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
                            {loading ? t('debrid.connecting') : t('debrid.connect_button')}
                        </Text>
                    </TouchableOpacity>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t('debrid.unlock_speeds_title')}</Text>
                        <Text style={styles.sectionText}>
                            {t('debrid.unlock_speeds_desc')}
                        </Text>
                        <TouchableOpacity style={styles.subscribeButton} onPress={openSubscription}>
                            <Text style={styles.subscribeButtonText}>{t('debrid.get_subscription')}</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            <View style={[styles.logoContainer, { marginTop: 60 }]}>
                <Text style={styles.poweredBy}>{t('debrid.powered_by')}</Text>
                <View style={styles.logoRow}>
                    <Image
                        source={{ uri: 'https://torbox.app/assets/logo-bb7a9579.svg' }}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.logoText}>TorBox</Text>
                </View>
                <Text style={styles.disclaimer}>{t('debrid.disclaimer_torbox')}</Text>
            </View>
        </>
    );

    // Render Torrentio Tab
    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const renderTorrentioTab = () => (
        <>
            <Text style={styles.description}>
                {t('debrid.description_torrentio')}
            </Text>

            {torrentioConfig.isInstalled && (
                <View style={styles.installedBadge}>
                    <Text style={styles.installedBadgeText}>{t('debrid.installed_badge')}</Text>
                </View>
            )}

            {/* TorBox Promotion Card */}
            {!torrentioConfig.debridApiKey && (
                <View style={styles.promoCard}>
                    <Text style={styles.promoTitle}>{t('debrid.promo_title')}</Text>
                    <Text style={styles.promoText}>
                        {t('debrid.promo_desc')}
                    </Text>
                    <TouchableOpacity
                        style={styles.promoButton}
                        onPress={() => Linking.openURL('https://torbox.app/subscription?referral=493192f2-6403-440f-b414-768f72222ec7')}
                    >
                        <Text style={styles.promoButtonText}>{t('debrid.promo_button')}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Debrid Service Selection */}
            <View style={styles.configSection}>
                <Text style={styles.configSectionTitle}>{t('debrid.service_label')}</Text>
                <View style={styles.pickerContainer}>
                    {TORRENTIO_DEBRID_SERVICES.map((service: any) => (
                        <TouchableOpacity
                            key={service.id}
                            style={[
                                styles.pickerItem,
                                torrentioConfig.debridService === service.id && styles.pickerItemSelected
                            ]}
                            onPress={() => setTorrentioConfig(prev => ({ ...prev, debridService: service.id }))}
                        >
                            <Text style={[
                                styles.pickerItemText,
                                torrentioConfig.debridService === service.id && styles.pickerItemTextSelected
                            ]}>
                                {service.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Debrid API Key */}
            <View style={styles.configSection}>
                <Text style={styles.configSectionTitle}>{t('debrid.api_key_label')}</Text>
                <TextInput
                    style={styles.input}
                    placeholder={`Enter your ${TORRENTIO_DEBRID_SERVICES.find((d: any) => d.id === torrentioConfig.debridService)?.name || 'Debrid'} API Key`}
                    placeholderTextColor={colors.mediumGray}
                    value={torrentioConfig.debridApiKey}
                    onChangeText={(text) => setTorrentioConfig(prev => ({ ...prev, debridApiKey: text }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                />
            </View>

            {/* Sorting - Accordion */}
            <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.sorting && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}
                onPress={() => toggleSection('sorting')}
            >
                <View>
                    <Text style={styles.accordionHeaderText}>{t('debrid.sorting_label')}</Text>
                    <Text style={styles.accordionSubtext}>
                        {TORRENTIO_SORT_OPTIONS.find(o => o.id === torrentioConfig.sort)?.name || 'By quality'}
                    </Text>
                </View>
                <Feather name={expandedSections.sorting ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mediumEmphasis} />
            </TouchableOpacity>
            {expandedSections.sorting && (
                <View style={styles.accordionContent}>
                    <View style={styles.pickerContainer}>
                        {TORRENTIO_SORT_OPTIONS.map(option => (
                            <TouchableOpacity
                                key={option.id}
                                style={[styles.pickerItem, torrentioConfig.sort === option.id && styles.pickerItemSelected]}
                                onPress={() => setTorrentioConfig(prev => ({ ...prev, sort: option.id }))}
                            >
                                <Text style={[styles.pickerItemText, torrentioConfig.sort === option.id && styles.pickerItemTextSelected]}>
                                    {option.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Quality Filter - Accordion */}
            <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.qualityFilter && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}
                onPress={() => toggleSection('qualityFilter')}
            >
                <View>
                    <Text style={styles.accordionHeaderText}>{t('debrid.exclude_qualities')}</Text>
                    <Text style={styles.accordionSubtext}>
                        {torrentioConfig.qualityFilter.length > 0 ? `${torrentioConfig.qualityFilter.length} excluded` : 'None excluded'}
                    </Text>
                </View>
                <Feather name={expandedSections.qualityFilter ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mediumEmphasis} />
            </TouchableOpacity>
            {expandedSections.qualityFilter && (
                <View style={styles.accordionContent}>
                    <View style={styles.chipContainer}>
                        {TORRENTIO_QUALITY_FILTERS.map(quality => (
                            <TouchableOpacity
                                key={quality.id}
                                style={[styles.chip, torrentioConfig.qualityFilter.includes(quality.id) && styles.chipSelected]}
                                onPress={() => toggleQualityFilter(quality.id)}
                            >
                                <Text style={[styles.chipText, torrentioConfig.qualityFilter.includes(quality.id) && styles.chipTextSelected]}>
                                    {quality.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Priority Languages - Accordion */}
            <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.languages && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}
                onPress={() => toggleSection('languages')}
            >
                <View>
                    <Text style={styles.accordionHeaderText}>{t('debrid.priority_languages')}</Text>
                    <Text style={styles.accordionSubtext}>
                        {torrentioConfig.priorityLanguages.length > 0 ? `${torrentioConfig.priorityLanguages.length} ${t('home_screen.selected')}` : 'No preference'}
                    </Text>
                </View>
                <Feather name={expandedSections.languages ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mediumEmphasis} />
            </TouchableOpacity>
            {expandedSections.languages && (
                <View style={styles.accordionContent}>
                    <View style={styles.chipContainer}>
                        {TORRENTIO_LANGUAGES.map(lang => (
                            <TouchableOpacity
                                key={lang.id}
                                style={[styles.chip, torrentioConfig.priorityLanguages.includes(lang.id) && styles.chipSelected]}
                                onPress={() => toggleLanguage(lang.id)}
                            >
                                <Text style={[styles.chipText, torrentioConfig.priorityLanguages.includes(lang.id) && styles.chipTextSelected]}>
                                    {lang.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Max Results - Accordion */}
            <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.maxResults && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}
                onPress={() => toggleSection('maxResults')}
            >
                <View>
                    <Text style={styles.accordionHeaderText}>{t('debrid.max_results')}</Text>
                    <Text style={styles.accordionSubtext}>
                        {TORRENTIO_MAX_RESULTS.find(o => o.id === torrentioConfig.maxResults)?.name || 'All results'}
                    </Text>
                </View>
                <Feather name={expandedSections.maxResults ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mediumEmphasis} />
            </TouchableOpacity>
            {expandedSections.maxResults && (
                <View style={styles.accordionContent}>
                    <View style={styles.pickerContainer}>
                        {TORRENTIO_MAX_RESULTS.map(option => (
                            <TouchableOpacity
                                key={option.id || 'all'}
                                style={[styles.pickerItem, torrentioConfig.maxResults === option.id && styles.pickerItemSelected]}
                                onPress={() => setTorrentioConfig(prev => ({ ...prev, maxResults: option.id }))}
                            >
                                <Text style={[styles.pickerItemText, torrentioConfig.maxResults === option.id && styles.pickerItemTextSelected]}>
                                    {option.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Additional Options - Accordion */}
            <TouchableOpacity
                style={[styles.accordionHeader, expandedSections.options && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}
                onPress={() => toggleSection('options')}
            >
                <View>
                    <Text style={styles.accordionHeaderText}>{t('debrid.additional_options')}</Text>
                    <Text style={styles.accordionSubtext}>Catalog & download settings</Text>
                </View>
                <Feather name={expandedSections.options ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mediumEmphasis} />
            </TouchableOpacity>
            {expandedSections.options && (
                <View style={styles.accordionContent}>
                    <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>{t('debrid.no_download_links')}</Text>
                        <Switch
                            value={torrentioConfig.noDownloadLinks}
                            onValueChange={(val) => setTorrentioConfig(prev => ({ ...prev, noDownloadLinks: val }))}
                            trackColor={{ false: colors.elevation3, true: colors.primary }}
                            thumbColor={colors.white}
                        />
                    </View>
                    <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>{t('debrid.no_debrid_catalog')}</Text>
                        <Switch
                            value={torrentioConfig.noCatalog}
                            onValueChange={(val) => setTorrentioConfig(prev => ({ ...prev, noCatalog: val }))}
                            trackColor={{ false: colors.elevation3, true: colors.primary }}
                            thumbColor={colors.white}
                        />
                    </View>
                </View>
            )}

            {/* Manifest URL Preview */}
            <View style={styles.configSection}>
                <Text style={styles.configSectionTitle}>Manifest URL</Text>
                <View style={styles.manifestPreview}>
                    <Text style={styles.manifestUrl} numberOfLines={3}>
                        {generateTorrentioManifestUrl()}
                    </Text>
                </View>
            </View>

            {/* Install/Update/Remove Buttons */}
            <View style={{ marginTop: 8 }}>
                {torrentioConfig.isInstalled ? (
                    <>
                        <TouchableOpacity
                            style={[styles.connectButton, torrentioLoading && styles.disabledButton]}
                            onPress={handleInstallTorrentio}
                            disabled={torrentioLoading}
                        >
                            <Text style={styles.connectButtonText}>
                                {torrentioLoading ? t('debrid.updating') : t('debrid.update_button')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.dangerButton, torrentioLoading && styles.disabledButton]}
                            onPress={handleRemoveTorrentio}
                            disabled={torrentioLoading}
                        >
                            <Text style={styles.buttonText}>{t('debrid.remove_button')}</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <TouchableOpacity
                        style={[styles.connectButton, torrentioLoading && styles.disabledButton]}
                        onPress={handleInstallTorrentio}
                        disabled={torrentioLoading}
                    >
                        <Text style={styles.connectButtonText}>
                            {torrentioLoading ? t('debrid.installing') : t('debrid.install_button')}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <Text style={[styles.disclaimer, { marginTop: 24, marginBottom: 40 }]}>
                {t('debrid.disclaimer_torrentio')}
            </Text>
        </>
    );

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
                <Text style={styles.headerTitle}>{t('debrid.title')}</Text>
            </View>

            {/* Tab Selector */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'torbox' && styles.activeTab]}
                    onPress={() => setActiveTab('torbox')}
                >
                    <Text style={[styles.tabText, activeTab === 'torbox' && styles.activeTabText]}>
                        {t('debrid.tab_torbox')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'torrentio' && styles.activeTab]}
                    onPress={() => setActiveTab('torrentio')}
                >
                    <Text style={[styles.tabText, activeTab === 'torrentio' && styles.activeTabText]}>
                        {t('debrid.tab_torrentio')}
                    </Text>
                </TouchableOpacity>
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
                    {activeTab === 'torbox' ? renderTorboxTab() : renderTorrentioTab()}
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
