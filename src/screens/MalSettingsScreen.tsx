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
import FastImage from '@d11/react-native-fast-image';
import { malService } from '../services/malService';
import { useMalContext } from '../contexts/MalContext';
import { useSettings } from '../hooks/useSettings';
import { logger } from '../utils/logger';
import MalIcon from '../components/icons/MalIcon';
import { useTheme } from '../contexts/ThemeContext';
import CustomAlert from '../components/CustomAlert';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// MAL configuration
const MAL_CLIENT_ID = '4631b11b52008b79c9a05d63996fc5f8';
// const MAL_CLIENT_ID = process.env.EXPO_PUBLIC_MAL_CLIENT_ID as string;

const discovery = {
  authorizationEndpoint: 'https://myanimelist.net/v1/oauth2/authorize',
  tokenEndpoint: 'https://myanimelist.net/v1/oauth2/token',
};

const redirectUri = makeRedirectUri({
  scheme: 'nuvio',
  path: 'auth/mal',
});

const MalSettingsScreen: React.FC = () => {
  const { settings } = useSettings();
  const isDarkMode = settings.enableDarkMode;
  const navigation = useNavigation();
  const { currentTheme } = useTheme();
  
  const {
    isAuthenticated,
    isLoading: isContextLoading,
    userProfile,
    refreshAuthStatus,
    logout
  } = useMalContext();

  const [isExchangingCode, setIsExchangingCode] = useState(false);
  
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertActions, setAlertActions] = useState<Array<{ label: string; onPress: () => void; style?: object }>>([
    { label: 'OK', onPress: () => setAlertVisible(false) },
  ]);

  const openAlert = (
    title: string,
    message: string,
    actions?: Array<{ label: string; onPress?: () => void; style?: object }>
  ) => {
    setAlertTitle(title);
    setAlertMessage(message);
    if (actions && actions.length > 0) {
      setAlertActions(
        actions.map(a => ({
          label: a.label,
          style: a.style,
          onPress: () => { a.onPress?.(); },
        }))
      );
    } else {
      setAlertActions([{ label: 'OK', onPress: () => setAlertVisible(false) }]);
    }
    setAlertVisible(true);
  };

  // Setup expo-auth-session hook with PKCE
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: MAL_CLIENT_ID,
      scopes: [], // MAL API v2 often works with default, but some apps use specific strings if configured in dashboard
      redirectUri: redirectUri,
      responseType: ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: CodeChallengeMethod.S256,
    },
    discovery
  );

  useEffect(() => {
    if (response) {
      if (response.type === 'success' && request?.codeVerifier) {
        setIsExchangingCode(true);
        const { code } = response.params;
        logger.log('[MalSettingsScreen] Auth code received');
        
        malService.exchangeCodeForToken(code, request.codeVerifier)
          .then(success => {
            if (success) {
              logger.log('[MalSettingsScreen] Token exchange successful');
              refreshAuthStatus().then(() => {
                openAlert(
                  'Successfully Connected',
                  'Your MyAnimeList account has been connected successfully.',
                  [{ label: 'OK', onPress: () => {} }]
                );
              });
            } else {
              logger.error('[MalSettingsScreen] Token exchange failed');
              openAlert('Authentication Error', 'Failed to complete authentication with MyAnimeList.');
            }
          })
          .catch(error => {
            logger.error('[MalSettingsScreen] Token exchange error:', error);
            openAlert('Authentication Error', 'An error occurred during authentication.');
          })
          .finally(() => {
            setIsExchangingCode(false);
          });
      } else if (response.type === 'error') {
        logger.error('[MalSettingsScreen] Authentication error:', response.error);
        openAlert('Authentication Error', response.error?.message || 'An error occurred during authentication.');
      }
    }
  }, [response, request?.codeVerifier, refreshAuthStatus]);

  const handleSignIn = () => {
    if (!MAL_CLIENT_ID) {
      openAlert('Configuration Error', 'Missing EXPO_PUBLIC_MAL_CLIENT_ID environment variable.');
      return;
    }
    promptAsync();
  };

  const handleSignOut = () => {
    openAlert(
      'Sign Out',
      'Are you sure you want to sign out of your MyAnimeList account?',
      [
        { label: 'Cancel', onPress: () => {} },
        { 
          label: 'Sign Out', 
          onPress: async () => {
            await logout();
          }
        }
      ]
    );
  };

  const isLoading = isContextLoading || isExchangingCode;

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
        MyAnimeList
      </Text>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[
          styles.card,
          { backgroundColor: currentTheme.colors.elevation2 }
        ]}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={currentTheme.colors.primary} />
            </View>
          ) : isAuthenticated && userProfile ? (
            <View style={styles.profileContainer}>
              <View style={styles.profileHeader}>
                {userProfile.picture ? (
                  <FastImage 
                    source={{ uri: userProfile.picture }} 
                    style={styles.avatar}
                    resizeMode={FastImage.resizeMode.cover}
                  />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: currentTheme.colors.primary }]}>
                    <Text style={styles.avatarText}>
                      {userProfile.name?.charAt(0)}
                    </Text>
                  </View>
                )}
                <View style={styles.profileInfo}>
                  <Text style={[
                    styles.profileName,
                    { color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }
                  ]}>
                    {userProfile.name}
                  </Text>
                  <Text style={[
                    styles.profileUsername,
                    { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }
                  ]}>
                    Joined {new Date(userProfile.joined_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <View style={styles.statsContainer}>
                {/* Statistics could go here */}
              </View>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.signOutButton,
                  { backgroundColor: currentTheme.colors.error }
                ]}
                onPress={handleSignOut}
              >
                <Text style={styles.buttonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.signInContainer}>
              <MalIcon 
                size={120}
                color={'#2E51A2'}
              />
              <View style={{ height: 20 }} />
              <Text style={[
                styles.signInTitle,
                { color: isDarkMode ? currentTheme.colors.highEmphasis : currentTheme.colors.textDark }
              ]}>
                Connect with MyAnimeList
              </Text>
              <Text style={[
                styles.signInDescription,
                { color: isDarkMode ? currentTheme.colors.mediumEmphasis : currentTheme.colors.textMutedDark }
              ]}>
                Sync your anime list and tracking with MyAnimeList
              </Text>
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: '#2E51A2' }
                ]}
                onPress={handleSignIn}
                disabled={!request || isExchangingCode}
              >
                {isExchangingCode ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.buttonText}>
                    Sign In with MyAnimeList
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isAuthenticated && (
          <View style={[
             styles.card,
             { backgroundColor: isDarkMode ? currentTheme.colors.elevation2 : currentTheme.colors.white, padding: 20 }
          ]}>
             <Text style={[styles.sectionTitle, { color: currentTheme.colors.highEmphasis }]}>
                 Info
             </Text>
             <Text style={{ color: currentTheme.colors.mediumEmphasis }}>
                 MyAnimeList integration allows you to track your anime progress. Currently, basic account connection is supported. List syncing features will be added in future updates.
             </Text>
          </View>
        )}

      </ScrollView>
      
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
        actions={alertActions}
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
    justifyContent: 'space-between',
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
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInContainer: {
    padding: 24,
    alignItems: 'center',
  },
  signInTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  signInDescription: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  button: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  signOutButton: {
    marginTop: 20,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
  },
  profileContainer: {
    padding: 20,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: 'white',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileUsername: {
    fontSize: 14,
  },
  statsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
});

export default MalSettingsScreen;
