import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Platform,
  Linking
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { traktService, TraktUser } from '../services/traktService';
import { colors } from '../styles/colors';
import { useSettings } from '../hooks/useSettings';
import { logger } from '../utils/logger';
import TraktIcon from '../../assets/rating-icons/trakt.svg';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

// For use with deep linking
const redirectUri = makeRedirectUri({
  scheme: 'stremioexpo',
  path: 'auth/trakt',
});

const TraktSettingsScreen: React.FC = () => {
  const { settings } = useSettings();
  const isDarkMode = settings.enableDarkMode;
  const navigation = useNavigation();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<TraktUser | null>(null);

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const authenticated = await traktService.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        const profile = await traktService.getUserProfile();
        setUserProfile(profile);
      }
    } catch (error) {
      logger.error('[TraktSettingsScreen] Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Handle deep linking when returning from Trakt authorization
  useEffect(() => {
    const handleRedirect = async (event: { url: string }) => {
      const { url } = event;
      if (url.includes('auth/trakt')) {
        setIsAuthenticating(true);
        try {
          const code = url.split('code=')[1].split('&')[0];
          const success = await traktService.exchangeCodeForToken(code);
          if (success) {
            checkAuthStatus();
          } else {
            Alert.alert('Authentication Error', 'Failed to complete authentication with Trakt.');
          }
        } catch (error) {
          logger.error('[TraktSettingsScreen] Authentication error:', error);
          Alert.alert('Authentication Error', 'An error occurred during authentication.');
        } finally {
          setIsAuthenticating(false);
        }
      }
    };

    // Add event listener for deep linking
    const subscription = Linking.addEventListener('url', handleRedirect);

    return () => {
      subscription.remove();
    };
  }, [checkAuthStatus]);

  const handleSignIn = async () => {
    try {
      const authUrl = traktService.getAuthUrl();
      await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    } catch (error) {
      logger.error('[TraktSettingsScreen] Error opening auth session:', error);
      Alert.alert('Authentication Error', 'Could not open Trakt authentication page.');
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your Trakt account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await traktService.logout();
              setIsAuthenticated(false);
              setUserProfile(null);
            } catch (error) {
              logger.error('[TraktSettingsScreen] Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out of Trakt.');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: isDarkMode ? colors.darkBackground : '#F2F2F7' }
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
            color={isDarkMode ? colors.highEmphasis : colors.textDark} 
          />
        </TouchableOpacity>
        <Text style={[
          styles.headerTitle,
          { color: isDarkMode ? colors.highEmphasis : colors.textDark }
        ]}>
          Trakt Settings
        </Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[
          styles.card,
          { backgroundColor: isDarkMode ? colors.elevation2 : colors.white }
        ]}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : isAuthenticated && userProfile ? (
            <View style={styles.profileContainer}>
              <View style={styles.profileHeader}>
                {userProfile.avatar ? (
                  <Image 
                    source={{ uri: userProfile.avatar }} 
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarText}>
                      {userProfile.name?.charAt(0) || userProfile.username.charAt(0)}
                    </Text>
                  </View>
                )}
                <View style={styles.profileInfo}>
                  <Text style={[
                    styles.profileName,
                    { color: isDarkMode ? colors.highEmphasis : colors.textDark }
                  ]}>
                    {userProfile.name || userProfile.username}
                  </Text>
                  <Text style={[
                    styles.profileUsername,
                    { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
                  ]}>
                    @{userProfile.username}
                  </Text>
                  {userProfile.vip && (
                    <View style={styles.vipBadge}>
                      <Text style={styles.vipText}>VIP</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.statsContainer}>
                <Text style={[
                  styles.joinedDate,
                  { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
                ]}>
                  Joined {new Date(userProfile.joined_at).toLocaleDateString()}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.signOutButton,
                  { backgroundColor: isDarkMode ? 'rgba(255,59,48,0.1)' : 'rgba(255,59,48,0.08)' }
                ]}
                onPress={handleSignOut}
              >
                <Text style={[styles.buttonText, { color: '#FF3B30' }]}>
                  Sign Out
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.signInContainer}>
              <TraktIcon 
                width={120}
                height={120}
                style={styles.traktLogo}
              />
              <Text style={[
                styles.signInTitle,
                { color: isDarkMode ? colors.highEmphasis : colors.textDark }
              ]}>
                Connect with Trakt
              </Text>
              <Text style={[
                styles.signInDescription,
                { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
              ]}>
                Sync your watch history, watchlist, and collection with Trakt.tv
              </Text>
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: isDarkMode ? colors.primary : colors.primary }
                ]}
                onPress={handleSignIn}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.buttonText}>
                    Sign In with Trakt
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isAuthenticated && (
          <View style={[
            styles.card,
            { backgroundColor: isDarkMode ? colors.elevation2 : colors.white }
          ]}>
            <View style={styles.settingsSection}>
              <Text style={[
                styles.sectionTitle,
                { color: isDarkMode ? colors.highEmphasis : colors.textDark }
              ]}>
                Sync Settings
              </Text>
              <View style={styles.settingItem}>
                <Text style={[
                  styles.settingLabel,
                  { color: isDarkMode ? colors.highEmphasis : colors.textDark }
                ]}>
                  Auto-sync playback progress
                </Text>
                <Text style={[
                  styles.settingDescription,
                  { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
                ]}>
                  Coming soon
                </Text>
              </View>
              <View style={styles.settingItem}>
                <Text style={[
                  styles.settingLabel,
                  { color: isDarkMode ? colors.highEmphasis : colors.textDark }
                ]}>
                  Import watched history
                </Text>
                <Text style={[
                  styles.settingDescription,
                  { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
                ]}>
                  Coming soon
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: isDarkMode ? 'rgba(120,120,128,0.2)' : 'rgba(120,120,128,0.1)' }
                ]}
                disabled={true}
              >
                <Text style={[
                  styles.buttonText,
                  { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
                ]}>
                  Sync Now (Coming Soon)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
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
    paddingVertical: 16,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 16 : 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginLeft: 16,
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
  traktLogo: {
    width: 120,
    height: 120,
    marginBottom: 20,
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
  vipBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FFD700',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  vipText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000',
  },
  statsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  joinedDate: {
    fontSize: 14,
  },
  settingsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  settingItem: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
  },
});

export default TraktSettingsScreen; 