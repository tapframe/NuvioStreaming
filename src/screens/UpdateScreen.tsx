import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import UpdateService from '../services/updateService';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

// Card component with minimalistic style
interface SettingsCardProps {
  children: React.ReactNode;
  title?: string;
  isTablet?: boolean;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, title, isTablet = false }) => {
  const { currentTheme } = useTheme();
  
  return (
    <View 
      style={[
        styles.cardContainer,
        isTablet && styles.tabletCardContainer
      ]}
    >
      {title && (
        <Text style={[
          styles.cardTitle,
          { color: currentTheme.colors.mediumEmphasis },
          isTablet && styles.tabletCardTitle
        ]}>
          {title}
        </Text>
      )}
      <View style={[
        styles.card,
        { backgroundColor: currentTheme.colors.elevation1 },
        isTablet && styles.tabletCard
      ]}>
        {children}
      </View>
    </View>
  );
};

const UpdateScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [currentInfo, setCurrentInfo] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  // Logs removed
  const [lastOperation, setLastOperation] = useState<string>('');
  const [updateProgress, setUpdateProgress] = useState<number>(0);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'success' | 'error'>('idle');

  const checkForUpdates = async () => {
    try {
      setIsChecking(true);
      setUpdateStatus('checking');
      setUpdateProgress(0);
      setLastOperation('Checking for updates...');
      
      const info = await UpdateService.checkForUpdates();
      setUpdateInfo(info);
      setLastChecked(new Date());
      
      // Logs disabled
      
      if (info.isAvailable) {
        setUpdateStatus('available');
        setLastOperation(`Update available: ${info.manifest?.id || 'unknown'}`);
      } else {
        setUpdateStatus('idle');
        setLastOperation('No updates available');
      }
    } catch (error) {
      if (__DEV__) console.error('Error checking for updates:', error);
      setUpdateStatus('error');
      setLastOperation(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', 'Failed to check for updates');
    } finally {
      setIsChecking(false);
    }
  };

  const installUpdate = async () => {
    try {
      setIsInstalling(true);
      setUpdateStatus('downloading');
      setUpdateProgress(0);
      setLastOperation('Downloading update...');
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUpdateProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 500);
      
      const success = await UpdateService.downloadAndInstallUpdate();
      
      clearInterval(progressInterval);
      setUpdateProgress(100);
      setUpdateStatus('installing');
      setLastOperation('Installing update...');
      
      // Logs disabled
      
      if (success) {
        setUpdateStatus('success');
        setLastOperation('Update installed successfully');
        Alert.alert('Success', 'Update will be applied on next app restart');
      } else {
        setUpdateStatus('error');
        setLastOperation('No update available to install');
        Alert.alert('No Update', 'No update available to install');
      }
    } catch (error) {
      if (__DEV__) console.error('Error installing update:', error);
      setUpdateStatus('error');
      setLastOperation(`Installation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', 'Failed to install update');
    } finally {
      setIsInstalling(false);
    }
  };

  const getCurrentUpdateInfo = async () => {
    const info = await UpdateService.getCurrentUpdateInfo();
    setCurrentInfo(info);
    // Logs disabled
  };

  // Extract release notes from various possible manifest fields
  const getReleaseNotes = () => {
    const manifest: any = updateInfo?.manifest || {};
    return (
      manifest.description ||
      manifest.releaseNotes ||
      manifest.extra?.releaseNotes ||
      manifest.metadata?.releaseNotes ||
      ''
    );
  };

  // Extract release notes for the currently running version
  const getCurrentReleaseNotes = () => {
    const manifest: any = currentInfo?.manifest || {};
    return (
      manifest.description ||
      manifest.releaseNotes ||
      manifest.extra?.releaseNotes ||
      manifest.metadata?.releaseNotes ||
      ''
    );
  };

  // Logs disabled: remove actions

  const testConnectivity = async () => {
    try {
      setLastOperation('Testing connectivity...');
      const isReachable = await UpdateService.testUpdateConnectivity();
      
      if (isReachable) {
        setLastOperation('Update server is reachable');
      } else {
        setLastOperation('Update server is not reachable');
      }
    } catch (error) {
      if (__DEV__) console.error('Error testing connectivity:', error);
      setLastOperation(`Connectivity test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Logs disabled
    }
  };

  const testAssetUrls = async () => {
    try {
      setLastOperation('Testing asset URLs...');
      await UpdateService.testAllAssetUrls();
      setLastOperation('Asset URL testing completed');
    } catch (error) {
      if (__DEV__) console.error('Error testing asset URLs:', error);
      setLastOperation(`Asset URL test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Logs disabled
    }
  };

  // Load current update info on mount
  useEffect(() => {
    const loadInitialData = async () => {
      await getCurrentUpdateInfo();
    };
    loadInitialData();
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleString();
  };

  const getStatusIcon = () => {
    switch (updateStatus) {
      case 'checking':
        return <MaterialIcons name="refresh" size={20} color={currentTheme.colors.primary} />;
      case 'available':
        return <MaterialIcons name="new-releases" size={20} color={currentTheme.colors.success || '#4CAF50'} />;
      case 'downloading':
        return <MaterialIcons name="cloud-download" size={20} color={currentTheme.colors.primary} />;
      case 'installing':
        return <MaterialIcons name="install-mobile" size={20} color={currentTheme.colors.primary} />;
      case 'success':
        return <MaterialIcons name="check-circle" size={20} color={currentTheme.colors.success || '#4CAF50'} />;
      case 'error':
        return <MaterialIcons name="error" size={20} color={currentTheme.colors.error || '#ff4444'} />;
      default:
        return <MaterialIcons name="system-update" size={20} color={currentTheme.colors.mediumEmphasis} />;
    }
  };

  const getStatusText = () => {
    switch (updateStatus) {
      case 'checking':
        return 'Checking for updates...';
      case 'available':
        return 'Update available!';
      case 'downloading':
        return 'Downloading update...';
      case 'installing':
        return 'Installing update...';
      case 'success':
        return 'Update installed successfully!';
      case 'error':
        return 'Update failed';
      default:
        return 'Ready to check for updates';
    }
  };

  const getStatusColor = () => {
    switch (updateStatus) {
      case 'available':
      case 'success':
        return currentTheme.colors.success || '#4CAF50';
      case 'error':
        return currentTheme.colors.error || '#ff4444';
      case 'checking':
      case 'downloading':
      case 'installing':
        return currentTheme.colors.primary;
      default:
        return currentTheme.colors.mediumEmphasis;
    }
  };


  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: currentTheme.colors.darkBackground }
    ]}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.highEmphasis} />
          <Text style={[styles.backText, { color: currentTheme.colors.highEmphasis }]}>
            Settings
          </Text>
        </TouchableOpacity>
        
        <View style={styles.headerActions}>
          {/* Empty for now, but ready for future actions */}
        </View>
      </View>
      
      <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
        App Updates
      </Text>

        <View style={styles.contentContainer}>
          <ScrollView 
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <SettingsCard title="APP UPDATES" isTablet={isTablet}>
              {/* Main Update Card */}
              <View style={styles.updateMainCard}>
                {/* Status Section */}
                <View style={styles.updateStatusSection}>
                  <View style={[styles.statusIndicator, { backgroundColor: `${getStatusColor()}20` }]}>
                    {getStatusIcon()}
                  </View>
                  <View style={styles.statusContent}>
                    <Text style={[styles.statusMainText, { color: currentTheme.colors.highEmphasis }]}>
                      {getStatusText()}
                    </Text>
                    <Text style={[styles.statusDetailText, { color: currentTheme.colors.mediumEmphasis }]}>
                      {lastOperation || 'Ready to check for updates'}
                    </Text>
                  </View>
                </View>

                {/* Progress Section */}
                {(updateStatus === 'downloading' || updateStatus === 'installing') && (
                  <View style={styles.progressSection}>
                    <View style={styles.progressHeader}>
                      <Text style={[styles.progressLabel, { color: currentTheme.colors.mediumEmphasis }]}>
                        {updateStatus === 'downloading' ? 'Downloading' : 'Installing'}
                      </Text>
                      <Text style={[styles.progressPercentage, { color: currentTheme.colors.primary }]}>
                        {Math.round(updateProgress)}%
                      </Text>
                    </View>
                    <View style={[styles.modernProgressBar, { backgroundColor: `${currentTheme.colors.primary}15` }]}>
                      <View 
                        style={[
                          styles.modernProgressFill, 
                          { 
                            backgroundColor: currentTheme.colors.primary,
                            width: `${updateProgress}%`
                          }
                        ]} 
                      />
                    </View>
                  </View>
                )}

                {/* Action Section */}
                <View style={styles.actionSection}>
                  <TouchableOpacity
                    style={[
                      styles.modernButton,
                      styles.primaryAction,
                      { backgroundColor: currentTheme.colors.primary },
                      (isChecking || isInstalling) && styles.disabledAction
                    ]}
                    onPress={checkForUpdates}
                    disabled={isChecking || isInstalling}
                    activeOpacity={0.8}
                  >
                    {isChecking ? (
                      <MaterialIcons name="refresh" size={18} color="white" />
                    ) : (
                      <MaterialIcons name="system-update" size={18} color="white" />
                    )}
                    <Text style={styles.modernButtonText}>
                      {isChecking ? 'Checking...' : 'Check for Updates'}
                    </Text>
                  </TouchableOpacity>

                  {updateInfo?.isAvailable && updateStatus !== 'success' && (
                    <TouchableOpacity
                      style={[
                        styles.modernButton,
                        styles.installAction,
                        { backgroundColor: currentTheme.colors.success || '#34C759' },
                        (isInstalling) && styles.disabledAction
                      ]}
                      onPress={installUpdate}
                      disabled={isInstalling}
                      activeOpacity={0.8}
                    >
                      {isInstalling ? (
                        <MaterialIcons name="install-mobile" size={18} color="white" />
                      ) : (
                        <MaterialIcons name="download" size={18} color="white" />
                      )}
                      <Text style={styles.modernButtonText}>
                        {isInstalling ? 'Installing...' : 'Install Update'}
                      </Text>
                    </TouchableOpacity>
                  )}

                </View>
              </View>

              {/* Release Notes */}
              {updateInfo?.isAvailable && !!getReleaseNotes() && (
                <View style={styles.infoSection}>
                  <View style={styles.infoItem}>
                    <View style={[styles.infoIcon, { backgroundColor: `${currentTheme.colors.primary}15` }]}>
                      <MaterialIcons name="notes" size={14} color={currentTheme.colors.primary} />
                    </View>
                    <Text style={[styles.infoLabel, { color: currentTheme.colors.mediumEmphasis }]}>Release notes:</Text>
                  </View>
                  <Text style={[styles.infoValue, { color: currentTheme.colors.highEmphasis }]}>{getReleaseNotes()}</Text>
                </View>
              )}

              {/* Info Section */}
              <View style={styles.infoSection}>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: `${currentTheme.colors.primary}15` }]}>
                    <MaterialIcons name="info-outline" size={14} color={currentTheme.colors.primary} />
                  </View>
                  <Text style={[styles.infoLabel, { color: currentTheme.colors.mediumEmphasis }]}>Version:</Text>
                  <Text style={[styles.infoValue, { color: currentTheme.colors.highEmphasis }]}>
                    {updateInfo?.manifest?.id ? `${updateInfo.manifest.id.substring(0, 8)}...` : 'Unknown'}
                  </Text>
                </View>
                
                {lastChecked && (
                  <View style={styles.infoItem}>
                    <View style={[styles.infoIcon, { backgroundColor: `${currentTheme.colors.primary}15` }]}>
                      <MaterialIcons name="schedule" size={14} color={currentTheme.colors.primary} />
                    </View>
                    <Text style={[styles.infoLabel, { color: currentTheme.colors.mediumEmphasis }]}>Last checked:</Text>
                    <Text style={[styles.infoValue, { color: currentTheme.colors.highEmphasis }]}>
                      {formatDate(lastChecked)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Current Version Section */}
              <View style={styles.infoSection}>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: `${currentTheme.colors.primary}15` }]}>
                    <MaterialIcons name="verified" size={14} color={currentTheme.colors.primary} />
                  </View>
                  <Text style={[styles.infoLabel, { color: currentTheme.colors.mediumEmphasis }]}>Current version:</Text>
                  <Text style={[styles.infoValue, { color: currentTheme.colors.highEmphasis }]}
                    selectable>
                    {currentInfo?.manifest?.id || (currentInfo?.isEmbeddedLaunch === false ? 'Unknown' : 'Embedded')}
                  </Text>
                </View>

                {!!getCurrentReleaseNotes() && (
                  <View style={{ marginTop: 8 }}>
                    <View style={[styles.infoItem, { alignItems: 'flex-start' }]}>
                      <View style={[styles.infoIcon, { backgroundColor: `${currentTheme.colors.primary}15` }]}>
                        <MaterialIcons name="notes" size={14} color={currentTheme.colors.primary} />
                      </View>
                      <Text style={[styles.infoLabel, { color: currentTheme.colors.mediumEmphasis }]}>Current release notes:</Text>
                    </View>
                    <Text style={[styles.infoValue, { color: currentTheme.colors.highEmphasis }]}>
                      {getCurrentReleaseNotes()}
                    </Text>
                  </View>
                )}
              </View>

              {/* Developer Logs removed */}
            </SettingsCard>

            {false && (
              <SettingsCard title="UPDATE LOGS" isTablet={isTablet}>
                <View style={styles.logsContainer}>
                  <View style={styles.logsHeader}>
                    <Text style={[styles.logsHeaderText, { color: currentTheme.colors.highEmphasis }]}>
                      Update Service Logs
                    </Text>
                    <View style={styles.logsActions}>
                      <TouchableOpacity
                        style={[styles.logActionButton, { backgroundColor: currentTheme.colors.elevation2 }]}
                        onPress={testConnectivity}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="wifi" size={16} color={currentTheme.colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.logActionButton, { backgroundColor: currentTheme.colors.elevation2 }]}
                        onPress={testAssetUrls}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="link" size={16} color={currentTheme.colors.primary} />
                      </TouchableOpacity>
                      {/* Test log removed */}
                      {/* Copy all logs removed */}
                      {/* Refresh logs removed */}
                      {/* Clear logs removed */}
                    </View>
                  </View>
                  
                  <ScrollView 
                    style={[styles.logsScrollView, { backgroundColor: currentTheme.colors.elevation2 }]}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  >
                    {false ? (
                      <Text style={[styles.noLogsText, { color: currentTheme.colors.mediumEmphasis }]}>No logs available</Text>
                    ) : (
                      ([] as string[]).map((log, index) => {
                        const isError = log.indexOf('[ERROR]') !== -1;
                        const isWarning = log.indexOf('[WARN]') !== -1;
                        
                        return (
                          <TouchableOpacity 
                            key={index} 
                            style={[
                              styles.logEntry,
                              { backgroundColor: 'rgba(255,255,255,0.05)' }
                            ]}
                            onPress={() => {}}
                            activeOpacity={0.7}
                          >
                            <View style={styles.logEntryContent}>
                              <Text style={[
                                styles.logText,
                                { 
                                  color: isError 
                                    ? (currentTheme.colors.error || '#ff4444')
                                    : isWarning 
                                    ? (currentTheme.colors.warning || '#ffaa00')
                                    : currentTheme.colors.mediumEmphasis 
                                }
                              ]}>
                                {log}
                              </Text>
                              <MaterialIcons 
                                name="content-copy" 
                                size={14} 
                                color={currentTheme.colors.mediumEmphasis}
                                style={styles.logCopyIcon}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </SettingsCard>
            )}
          </ScrollView>
        </View>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 8,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  contentContainer: {
    flex: 1,
    zIndex: 1,
    width: '100%',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    paddingBottom: 90,
  },
  
  // Common card styles
  cardContainer: {
    width: '100%',
    marginBottom: 20,
  },
  tabletCardContainer: {
    marginBottom: 32,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginLeft: Math.max(12, width * 0.04),
    marginBottom: 8,
  },
  tabletCardTitle: {
    fontSize: 14,
    marginLeft: 0,
    marginBottom: 12,
  },
  card: {
    marginHorizontal: Math.max(12, width * 0.04),
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: undefined,
  },
  tabletCard: {
    marginHorizontal: 0,
    borderRadius: 20,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  
  // Update UI Styles
  updateMainCard: {
    padding: 20,
    marginBottom: 16,
  },
  updateStatusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  statusContent: {
    flex: 1,
  },
  statusMainText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  statusDetailText: {
    fontSize: 14,
    opacity: 0.8,
    lineHeight: 20,
  },
  progressSection: {
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
  },
  modernProgressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  modernProgressFill: {
     height: '100%',
     borderRadius: 4,
   },
  actionSection: {
    gap: 12,
  },
  modernButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryAction: {
    marginBottom: 8,
  },
  installAction: {
    // Additional styles for install button
  },
  disabledAction: {
    opacity: 0.6,
  },
  modernButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 80,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '400',
    flex: 1,
  },
  modernAdvancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 8,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  advancedToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  advancedToggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  logsBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  logsBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  
  // Logs styles
  logsContainer: {
    padding: 20,
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logsHeaderText: {
    fontSize: 16,
    fontWeight: '600',
  },
  logsActions: {
    flexDirection: 'row',
    gap: 8,
  },
  logActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logsScrollView: {
    maxHeight: 200,
    borderRadius: 8,
    padding: 12,
  },
  logEntry: {
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  logEntryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
    flex: 1,
    marginRight: 8,
  },
  logCopyIcon: {
    opacity: 0.6,
  },
  noLogsText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default UpdateScreen;
