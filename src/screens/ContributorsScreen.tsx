import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Platform,
  Dimensions,
  Linking,
  RefreshControl,
  FlatList,
  ActivityIndicator
} from 'react-native';
import { mmkvStorage } from '../services/mmkvStorage';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import FastImage from '@d11/react-native-fast-image';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchContributors, GitHubContributor } from '../services/githubReleaseService';
import { RootStackParamList } from '../navigation/AppNavigator';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;
const isLargeTablet = width >= 1024;

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

interface ContributorCardProps {
  contributor: GitHubContributor;
  currentTheme: any;
  isTablet: boolean;
  isLargeTablet: boolean;
}

const ContributorCard: React.FC<ContributorCardProps> = ({ contributor, currentTheme, isTablet, isLargeTablet }) => {
  const handlePress = useCallback(() => {
    Linking.openURL(contributor.html_url);
  }, [contributor.html_url]);

  return (
    <TouchableOpacity
      style={[
        styles.contributorCard,
        { backgroundColor: currentTheme.colors.elevation1 },
        isTablet && styles.tabletContributorCard
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <FastImage
        source={{ uri: contributor.avatar_url }}
        style={[
          styles.avatar,
          isTablet && styles.tabletAvatar
        ]}
        resizeMode={FastImage.resizeMode.cover}
      />
      <View style={styles.contributorInfo}>
        <Text style={[
          styles.username,
          { color: currentTheme.colors.highEmphasis },
          isTablet && styles.tabletUsername
        ]}>
          {contributor.login}
        </Text>
        <Text style={[
          styles.contributions,
          { color: currentTheme.colors.mediumEmphasis },
          isTablet && styles.tabletContributions
        ]}>
          {contributor.contributions} contributions
        </Text>
      </View>
      <Feather
        name="external-link"
        size={isTablet ? 20 : 16}
        color={currentTheme.colors.mediumEmphasis}
        style={styles.externalIcon}
      />
    </TouchableOpacity>
  );
};

const ContributorsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [contributors, setContributors] = useState<GitHubContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContributors = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      
      // Check cache first (unless refreshing)
      if (!isRefresh) {
        try {
          const cachedData = await mmkvStorage.getItem('github_contributors');
          const cacheTimestamp = await mmkvStorage.getItem('github_contributors_timestamp');
          const now = Date.now();
          const ONE_HOUR = 60 * 60 * 1000; // 1 hour cache
          
          if (cachedData && cacheTimestamp) {
            const timestamp = parseInt(cacheTimestamp, 10);
            if (now - timestamp < ONE_HOUR) {
              const parsedData = JSON.parse(cachedData);
              // Only use cache if it has actual contributors data
              if (parsedData && Array.isArray(parsedData) && parsedData.length > 0) {
                setContributors(parsedData);
                setLoading(false);
                return;
              } else {
                // Remove invalid cache
                await mmkvStorage.removeItem('github_contributors');
                await mmkvStorage.removeItem('github_contributors_timestamp');
                if (__DEV__) console.log('Removed invalid contributors cache');
              }
            }
          }
        } catch (cacheError) {
          if (__DEV__) console.error('Cache read error:', cacheError);
          // Remove corrupted cache
          try {
            await mmkvStorage.removeItem('github_contributors');
            await mmkvStorage.removeItem('github_contributors_timestamp');
          } catch {}
        }
      }
      
      const data = await fetchContributors();
      if (data && Array.isArray(data) && data.length > 0) {
        setContributors(data);
        // Only cache valid data
        try {
          await mmkvStorage.setItem('github_contributors', JSON.stringify(data));
          await mmkvStorage.setItem('github_contributors_timestamp', Date.now().toString());
        } catch (cacheError) {
          if (__DEV__) console.error('Cache write error:', cacheError);
        }
      } else {
        // Clear any existing cache if we get invalid data
        try {
          await mmkvStorage.removeItem('github_contributors');
          await mmkvStorage.removeItem('github_contributors_timestamp');
        } catch {}
        setError('Unable to load contributors. This might be due to GitHub API rate limits.');
      }
    } catch (err) {
      setError('Failed to load contributors. Please check your internet connection.');
      if (__DEV__) console.error('Error loading contributors:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Clear any invalid cache on mount
    const clearInvalidCache = async () => {
      try {
        const cachedData = await mmkvStorage.getItem('github_contributors');
        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          if (!parsedData || !Array.isArray(parsedData) || parsedData.length === 0) {
            await mmkvStorage.removeItem('github_contributors');
            await mmkvStorage.removeItem('github_contributors_timestamp');
            if (__DEV__) console.log('Cleared invalid cache on mount');
          }
        }
      } catch (error) {
        if (__DEV__) console.error('Error checking cache on mount:', error);
      }
    };
    
    clearInvalidCache();
    loadContributors();
  }, [loadContributors]);

  const handleRefresh = useCallback(() => {
    loadContributors(true);
  }, [loadContributors]);

  const renderContributor = useCallback(({ item }: { item: GitHubContributor }) => (
    <ContributorCard
      contributor={item}
      currentTheme={currentTheme}
      isTablet={isTablet}
      isLargeTablet={isLargeTablet}
    />
  ), [currentTheme]);

  const keyExtractor = useCallback((item: GitHubContributor) => item.id.toString(), []);

  const topSpacing = (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top);

  if (loading && !refreshing) {
    return (
      <View style={[
        styles.container,
        { backgroundColor: currentTheme.colors.darkBackground }
      ]}>
        <StatusBar barStyle={'light-content'} />
        <View style={[styles.headerContainer, { paddingTop: topSpacing }]}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Feather name="chevron-left" size={24} color={currentTheme.colors.primary} />
              <Text style={[styles.backText, { color: currentTheme.colors.primary }]}>Settings</Text>
            </TouchableOpacity>
          </View>
          <Text style={[
            styles.headerTitle,
            { color: currentTheme.colors.text },
            isTablet && styles.tabletHeaderTitle
          ]}>
            Contributors
          </Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
          <Text style={[styles.loadingText, { color: currentTheme.colors.mediumEmphasis }]}>
            Loading contributors...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[
      styles.container,
      { backgroundColor: currentTheme.colors.darkBackground }
    ]}>
      <StatusBar barStyle={'light-content'} />
      
      <View style={[styles.headerContainer, { paddingTop: topSpacing }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Feather name="chevron-left" size={24} color={currentTheme.colors.primary} />
            <Text style={[styles.backText, { color: currentTheme.colors.primary }]}>Settings</Text>
          </TouchableOpacity>
        </View>
        <Text style={[
          styles.headerTitle,
          { color: currentTheme.colors.text },
          isTablet && styles.tabletHeaderTitle
        ]}>
          Contributors
        </Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.contentContainer, isTablet && styles.tabletContentContainer]}>
          {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={48} color={currentTheme.colors.mediumEmphasis} />
            <Text style={[styles.errorText, { color: currentTheme.colors.mediumEmphasis }]}>
              {error}
            </Text>
            <Text style={[styles.errorSubtext, { color: currentTheme.colors.mediumEmphasis }]}>
              GitHub API rate limit exceeded. Please try again later or pull to refresh.
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: currentTheme.colors.primary }]}
              onPress={() => loadContributors()}
            >
              <Text style={[styles.retryText, { color: currentTheme.colors.white }]}>
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : contributors.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="users" size={48} color={currentTheme.colors.mediumEmphasis} />
            <Text style={[styles.emptyText, { color: currentTheme.colors.mediumEmphasis }]}>
              No contributors found
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.listContent,
              isTablet && styles.tabletListContent
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={currentTheme.colors.primary}
                colors={[currentTheme.colors.primary]}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <View style={[
              styles.gratitudeCard,
              { backgroundColor: currentTheme.colors.elevation1 },
              isTablet && styles.tabletGratitudeCard
            ]}>
              <View style={styles.gratitudeContent}>
                <Feather name="heart" size={isTablet ? 32 : 24} color={currentTheme.colors.primary} />
                <Text style={[
                  styles.gratitudeText,
                  { color: currentTheme.colors.highEmphasis },
                  isTablet && styles.tabletGratitudeText
                ]}>
                  We're grateful for every contribution
                </Text>
                <Text style={[
                  styles.gratitudeSubtext,
                  { color: currentTheme.colors.mediumEmphasis },
                  isTablet && styles.tabletGratitudeSubtext
                ]}>
                  Each line of code, bug report, and suggestion helps make Nuvio better for everyone
                </Text>
              </View>
            </View>
            
            <FlatList
              data={contributors}
              renderItem={renderContributor}
              keyExtractor={keyExtractor}
              numColumns={isTablet ? 2 : 1}
              key={isTablet ? 'tablet' : 'mobile'}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={isTablet ? styles.tabletRow : undefined}
            />
          </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.3,
    paddingLeft: 4,
  },
  tabletHeaderTitle: {
    fontSize: 40,
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    width: '100%',
  },
  tabletContentContainer: {
    maxWidth: 1000,
    width: '100%',
  },
  scrollView: {
    flex: 1,
  },
  gratitudeCard: {
    padding: 20,
    marginBottom: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabletGratitudeCard: {
    padding: 32,
    marginBottom: 32,
    borderRadius: 24,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  gratitudeContent: {
    alignItems: 'center',
  },
  gratitudeText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  tabletGratitudeText: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 12,
  },
  gratitudeSubtext: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    textAlign: 'center',
  },
  tabletGratitudeSubtext: {
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 600,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  tabletListContent: {
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  tabletRow: {
    justifyContent: 'space-between',
  },
  contributorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabletContributorCard: {
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 6,
    borderRadius: 20,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    width: '48%',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  tabletAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 20,
  },
  contributorInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  tabletUsername: {
    fontSize: 18,
    fontWeight: '700',
  },
  contributions: {
    fontSize: 14,
    opacity: 0.8,
  },
  tabletContributions: {
    fontSize: 16,
  },
  externalIcon: {
    marginLeft: 8,
  },
});

export default ContributorsScreen;
