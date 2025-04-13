import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  useColorScheme,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  Dimensions,
  Pressable
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { colors } from '../styles/colors';
import { useSettings, DEFAULT_SETTINGS } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';
import { stremioService } from '../services/stremioService';

const { width } = Dimensions.get('window');

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

interface SettingItemProps {
  title: string;
  description: string;
  icon: string;
  renderControl: () => React.ReactNode;
  isLast?: boolean;
  onPress?: () => void;
  isDarkMode: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  renderControl,
  isLast = false,
  onPress,
  isDarkMode
}) => {
  return (
    <View 
      style={[
        styles.settingItem,
        !isLast && styles.settingItemBorder,
        { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }
      ]}
    >
      <Pressable
        style={styles.settingTouchable}
        onPress={onPress}
        android_ripple={{ 
          color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderless: true
        }}
      >
        <View style={[
          styles.settingIconContainer,
          { backgroundColor: isDarkMode ? colors.elevation2 : 'rgba(147, 51, 234, 0.08)' }
        ]}>
          <MaterialIcons name={icon} size={24} color={colors.primary} />
        </View>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>
            {title}
          </Text>
          <Text style={[styles.settingDescription, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>
            {description}
          </Text>
        </View>
        <View style={styles.settingControl}>
          {renderControl()}
        </View>
      </Pressable>
    </View>
  );
};

const SettingsScreen: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const systemColorScheme = useColorScheme();
  const isDarkMode = systemColorScheme === 'dark' || settings.enableDarkMode;
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handleResetSettings = useCallback(() => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to reset all settings to default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            (Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>).forEach(key => {
              updateSetting(key, DEFAULT_SETTINGS[key]);
            });
          }
        }
      ]
    );
  }, [updateSetting]);

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={[
        styles.sectionHeaderText,
        { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
      ]}>
        {title}
      </Text>
    </View>
  );

  const CustomSwitch = ({ value, onValueChange }: { value: boolean, onValueChange: (value: boolean) => void }) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: isDarkMode ? colors.elevation2 : colors.surfaceVariant, true: `${colors.primary}80` }}
      thumbColor={value ? colors.primary : (isDarkMode ? colors.white : colors.white)}
      ios_backgroundColor={isDarkMode ? colors.elevation2 : colors.surfaceVariant}
      style={Platform.select({ ios: { transform: [{ scale: 0.8 }] } })}
    />
  );

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: isDarkMode ? colors.darkBackground : colors.lightBackground }
    ]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { 
        borderBottomColor: isDarkMode ? colors.border : 'rgba(0,0,0,0.08)'
      }]}>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>
            Settings
          </Text>
        </View>
      </View>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderSectionHeader('Playback')}
        <SettingItem
          title="External Player"
          description="Use external video player when available"
          icon="open-in-new"
          isDarkMode={isDarkMode}
          renderControl={() => (
            <CustomSwitch
              value={settings.useExternalPlayer}
              onValueChange={(value) => updateSetting('useExternalPlayer', value)}
            />
          )}
        />

        {renderSectionHeader('Content')}
        <SettingItem
          title="Catalog Settings"
          description="Customize which catalogs appear on your home screen"
          icon="view-list"
          isDarkMode={isDarkMode}
          renderControl={() => (
            <View style={[styles.actionButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.actionButtonText}>Configure</Text>
            </View>
          )}
          onPress={() => navigation.navigate('CatalogSettings')}
        />
        <SettingItem
          title="Calendar & Upcoming"
          description="View and manage your upcoming episode schedule"
          icon="calendar-today"
          isDarkMode={isDarkMode}
          renderControl={() => (
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={isDarkMode ? colors.lightGray : colors.mediumGray}
              style={styles.chevronIcon}
            />
          )}
          onPress={() => navigation.navigate('Calendar')}
        />
        <SettingItem
          title="Notifications"
          description="Configure notifications for new episodes"
          icon="notifications"
          isDarkMode={isDarkMode}
          renderControl={() => (
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={isDarkMode ? colors.lightGray : colors.mediumGray}
              style={styles.chevronIcon}
            />
          )}
          onPress={() => navigation.navigate('NotificationSettings')}
        />

        {renderSectionHeader('Advanced')}
        <SettingItem
          title="Manage Addons"
          description="Configure and update your addons"
          icon="extension"
          isDarkMode={isDarkMode}
          renderControl={() => (
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={isDarkMode ? colors.lightGray : colors.mediumGray}
              style={styles.chevronIcon}
            />
          )}
          onPress={() => navigation.navigate('Addons')}
        />
        <SettingItem
          title="Check TMDB Addon"
          description="Verify TMDB Embed Streams addon installation"
          icon="bug-report"
          isDarkMode={isDarkMode}
          renderControl={() => (
            <View style={[styles.actionButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.actionButtonText}>Check</Text>
            </View>
          )}
          onPress={() => {
            // Check if the addon is installed
            const installedAddons = stremioService.getInstalledAddons();
            const tmdbAddon = installedAddons.find(addon => addon.id === 'org.tmdbembedapi');
            
            if (tmdbAddon) {
              // Addon is installed, check its configuration
              Alert.alert(
                'TMDB Embed Streams Addon',
                `Addon is installed:\n\nName: ${tmdbAddon.name}\nID: ${tmdbAddon.id}\nURL: ${tmdbAddon.url}\n\nResources: ${JSON.stringify(tmdbAddon.resources)}\n\nTypes: ${JSON.stringify(tmdbAddon.types)}`,
                [
                  { 
                    text: 'Reinstall', 
                    onPress: async () => {
                      try {
                        // Remove and reinstall the addon
                        stremioService.removeAddon('org.tmdbembedapi');
                        await stremioService.installAddon('https://http-addon-production.up.railway.app/manifest.json');
                        Alert.alert('Success', 'Addon was reinstalled successfully');
                      } catch (error) {
                        Alert.alert('Error', `Failed to reinstall addon: ${error}`);
                      }
                    } 
                  },
                  { text: 'Close', style: 'cancel' }
                ]
              );
            } else {
              // Addon is not installed, offer to install it
              Alert.alert(
                'TMDB Embed Streams Addon',
                'Addon is not installed. Would you like to install it now?',
                [
                  { 
                    text: 'Install', 
                    onPress: async () => {
                      try {
                        await stremioService.installAddon('https://http-addon-production.up.railway.app/manifest.json');
                        Alert.alert('Success', 'Addon was installed successfully');
                      } catch (error) {
                        Alert.alert('Error', `Failed to install addon: ${error}`);
                      }
                    } 
                  },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            }
          }}
        />
        <SettingItem
          title="Reset All Settings"
          description="Restore default settings"
          icon="settings-backup-restore"
          isDarkMode={isDarkMode}
          renderControl={() => (
            <View style={[styles.actionButton, { backgroundColor: colors.warning }]}>
              <Text style={styles.actionButtonText}>Reset</Text>
            </View>
          )}
          isLast={true}
          onPress={handleResetSettings}
        />

        {renderSectionHeader('About')}
        <SettingItem
          title="App Version"
          description="HuHuMobile v1.0.0"
          icon="info"
          isDarkMode={isDarkMode}
          renderControl={() => null}
          isLast={true}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 12 : 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: colors.darkBackground,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settingItem: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 16,
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
  },
  settingItemBorder: {
    marginBottom: 8,
  },
  settingTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingIconContainer: {
    marginRight: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.15,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.25,
  },
  settingControl: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 50,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectButtonText: {
    fontWeight: '600',
    marginRight: 4,
    fontSize: 14,
    letterSpacing: 0.25,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  chevronIcon: {
    opacity: 0.8,
  },
});

export default SettingsScreen;