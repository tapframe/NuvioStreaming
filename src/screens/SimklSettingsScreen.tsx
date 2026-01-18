import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    SafeAreaView,
    ScrollView,
    StatusBar,
    Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { makeRedirectUri, useAuthRequest, ResponseType, CodeChallengeMethod } from 'expo-auth-session';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { SimklService } from '../services/simklService';
import { useSettings } from '../hooks/useSettings';
import { logger } from '../utils/logger';
import { useTheme } from '../contexts/ThemeContext';
import { useSimklIntegration } from '../hooks/useSimklIntegration';
import { useTraktIntegration } from '../hooks/useTraktIntegration';
import CustomAlert from '../components/CustomAlert';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// Simkl configuration
const SIMKL_CLIENT_ID = process.env.EXPO_PUBLIC_SIMKL_CLIENT_ID as string;
const SIMKL_REDIRECT_URI = process.env.EXPO_PUBLIC_SIMKL_REDIRECT_URI || 'nuvio://auth/simkl';

const discovery = {
    authorizationEndpoint: 'https://simkl.com/oauth/authorize',
    tokenEndpoint: 'https://api.simkl.com/oauth/token',
};

// For use with deep linking
const redirectUri = makeRedirectUri({
    scheme: 'nuvio',
    path: 'auth/simkl',
});

const simklService = SimklService.getInstance();

const SimklSettingsScreen: React.FC = () => {
    const { settings } = useSettings();
    const isDarkMode = settings.enableDarkMode;
    const navigation = useNavigation();
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');

    const { currentTheme } = useTheme();

    const {
        isAuthenticated,
        isLoading,
        checkAuthStatus,
        refreshAuthStatus
    } = useSimklIntegration();
    const { isAuthenticated: isTraktAuthenticated } = useTraktIntegration();

    const [isExchangingCode, setIsExchangingCode] = useState(false);

    const openAlert = (title: string, message: string) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertVisible(true);
    };

    // Setup expo-auth-session hook
    const [request, response, promptAsync] = useAuthRequest(
        {
            clientId: SIMKL_CLIENT_ID,
            scopes: [], // Simkl doesn't strictly use scopes for basic access
            redirectUri: SIMKL_REDIRECT_URI, // Must match what is set in Simkl Dashboard
            responseType: ResponseType.Code,
            // codeChallengeMethod: CodeChallengeMethod.S256, // Simkl might not verify PKCE, but standard compliant
        },
        discovery
    );

    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    // Handle the response from the auth request
    useEffect(() => {
        if (response) {
            if (response.type === 'success') {
                const { code } = response.params;
                setIsExchangingCode(true);
                logger.log('[SimklSettingsScreen] Auth code received, exchanging...');

                simklService.exchangeCodeForToken(code)
                    .then(success => {
                        if (success) {
                            refreshAuthStatus();
                            openAlert('Success', 'Connected to Simkl successfully!');
                        } else {
                            openAlert('Error', 'Failed to connect to Simkl.');
                        }
                    })
                    .catch(err => {
                        logger.error('[SimklSettingsScreen] Token exchange error:', err);
                        openAlert('Error', 'An error occurred during connection.');
                    })
                    .finally(() => setIsExchangingCode(false));
            } else if (response.type === 'error') {
                openAlert('Error', 'Authentication error: ' + (response.error?.message || 'Unknown'));
            }
        }
    }, [response, refreshAuthStatus]);

    const handleSignIn = () => {
        if (!SIMKL_CLIENT_ID) {
            openAlert('Configuration Error', 'Simkl Client ID is missing in environment variables.');
            return;
        }

        if (isTraktAuthenticated) {
            openAlert('Conflict', 'You cannot connect to Simkl while Trakt is connected. Please disconnect Trakt first.');
            return;
        }

        promptAsync();
    };

    const handleSignOut = async () => {
        await simklService.logout();
        refreshAuthStatus();
        openAlert('Signed Out', 'You have disconnected from Simkl.');
    };

    return (
        <SafeAreaView style={[
            styles.container,
            { backgroundColor: isDarkMode ? currentTheme.colors.darkBackground : '#F2F2F7' }
        ]}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                >
                    <MaterialIcons
                        name="arrow-back"
                        size={24}
                        color={isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark}
                    />
                    <Text style={[styles.backText, { color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }]}>
                        Settings
                    </Text>
                </TouchableOpacity>
            </View>

            <Text style={[styles.headerTitle, { color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }]}>
                Simkl Integration
            </Text>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={[
                    styles.card,
                    { backgroundColor: isDarkMode ? currentTheme.colors.elevation2 : currentTheme.colors.white }
                ]}>
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={currentTheme.colors.primary} />
                        </View>
                    ) : isAuthenticated ? (
                        <View style={styles.profileContainer}>
                            <Text style={[styles.statusTitle, { color: currentTheme.colors.highEmphasis }]}>
                                Connected
                            </Text>
                            <Text style={[styles.statusDesc, { color: currentTheme.colors.mediumEmphasis }]}>
                                Your watched items are syncing with Simkl.
                            </Text>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: currentTheme.colors.error, marginTop: 20 }]}
                                onPress={handleSignOut}
                            >
                                <Text style={styles.buttonText}>Disconnect</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.signInContainer}>
                            <Text style={[styles.signInTitle, { color: currentTheme.colors.highEmphasis }]}>
                                Connect Simkl
                            </Text>
                            <Text style={[styles.signInDescription, { color: currentTheme.colors.mediumEmphasis }]}>
                                Sync your watch history and track what you're watching.
                            </Text>
                            <TouchableOpacity
                                style={[
                                    styles.button,
                                    { backgroundColor: currentTheme.colors.primary }
                                ]}
                                onPress={handleSignIn}
                                disabled={!request || isExchangingCode}
                            >
                                {isExchangingCode ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.buttonText}>Sign In with Simkl</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <Text style={[styles.disclaimer, { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }]}>
                    Nuvio is not affiliated with Simkl.
                </Text>
            </ScrollView>

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={() => setAlertVisible(false)}
                actions={[{ label: 'OK', onPress: () => setAlertVisible(false) }]}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 8 : 8,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
    },
    backText: {
        fontSize: 17,
        marginLeft: 8,
    },
    headerTitle: {
        fontSize: 34,
        fontWeight: 'bold',
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    card: {
        borderRadius: 12,
        overflow: 'hidden',
        padding: 20,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    signInContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    signInTitle: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 8,
    },
    signInDescription: {
        textAlign: 'center',
        marginBottom: 20,
        fontSize: 15,
    },
    profileContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    statusTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    statusDesc: {
        fontSize: 15,
        marginBottom: 10,
    },
    button: {
        width: '100%',
        height: 48,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
    },
    disclaimer: {
        fontSize: 12,
        textAlign: 'center',
        marginTop: 20,
    },
});

export default SimklSettingsScreen;
