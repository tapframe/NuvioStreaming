import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  StatusBar,
  Switch,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettings } from '../hooks/useSettings';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

interface SettingItemProps {
  title: string;
  description?: string;
  icon: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
  badge?: string;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  value,
  onValueChange,
  isLast,
  badge,
}) => {
  const { currentTheme } = useTheme();
  
  return (
    <View
      style={[
        styles.settingItem,
        !isLast && styles.settingItemBorder,
        { borderBottomColor: 'rgba(255,255,255,0.08)' },
      ]}
    >
      <View style={styles.settingContent}>
        <View style={[
          styles.settingIconContainer,
          { backgroundColor: 'rgba(255,255,255,0.1)' }
        ]}>
          <MaterialIcons
            name={icon}
            size={20}
            color={currentTheme.colors.primary}
          />
        </View>
        <View style={styles.settingText}>
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.settingTitle,
                { color: currentTheme.colors.text },
              ]}
            >
              {title}
            </Text>
            {badge && (
              <View style={[styles.badge, { backgroundColor: currentTheme.colors.primary }]}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
          </View>
          {description && (
            <Text
              style={[
                styles.settingDescription,
                { color: currentTheme.colors.textMuted },
              ]}
            >
              {description}
            </Text>
          )}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: 'rgba(255,255,255,0.1)', true: currentTheme.colors.primary }}
          thumbColor={Platform.OS === 'android' ? (value ? currentTheme.colors.white : currentTheme.colors.white) : ''}
          ios_backgroundColor={'rgba(255,255,255,0.1)'}
        />
      </View>
    </View>
  );
};

const InternalProvidersSettings: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const { currentTheme } = useTheme();
  const navigation = useNavigation();
  
  // Individual provider states
  const [xprimeEnabled, setXprimeEnabled] = useState(true);
  const [hdrezkaEnabled, setHdrezkaEnabled] = useState(true);
  
  // Load individual provider settings
  useEffect(() => {
    const loadProviderSettings = async () => {
      try {
        const xprimeSettings = await AsyncStorage.getItem('xprime_settings');
        const hdrezkaSettings = await AsyncStorage.getItem('hdrezka_settings');
        
        if (xprimeSettings) {
          const parsed = JSON.parse(xprimeSettings);
          setXprimeEnabled(parsed.enabled !== false);
        }
        
        if (hdrezkaSettings) {
          const parsed = JSON.parse(hdrezkaSettings);
          setHdrezkaEnabled(parsed.enabled !== false);
        }
      } catch (error) {
        console.error('Error loading provider settings:', error);
      }
    };
    
    loadProviderSettings();
  }, []);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleMasterToggle = useCallback((enabled: boolean) => {
    if (!enabled) {
      Alert.alert(
        'Disable Internal Providers',
        'This will disable all built-in streaming providers (XPRIME, HDRezka). You can still use external Stremio addons.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => {
              updateSetting('enableInternalProviders', false);
            }
          }
        ]
      );
    } else {
      updateSetting('enableInternalProviders', true);
    }
  }, [updateSetting]);

  const handleXprimeToggle = useCallback(async (enabled: boolean) => {
    setXprimeEnabled(enabled);
    try {
      await AsyncStorage.setItem('xprime_settings', JSON.stringify({ enabled }));
    } catch (error) {
      console.error('Error saving XPRIME settings:', error);
    }
  }, []);

  const handleHdrezkaToggle = useCallback(async (enabled: boolean) => {
    setHdrezkaEnabled(enabled);
    try {
      await AsyncStorage.setItem('hdrezka_settings', JSON.stringify({ enabled }));
    } catch (error) {
      console.error('Error saving HDRezka settings:', error);
    }
  }, []);

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: currentTheme.colors.darkBackground },
      ]}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name="arrow-back"
            size={24}
            color={currentTheme.colors.text}
          />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: currentTheme.colors.text },
          ]}
        >
          Internal Providers
        </Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Master Toggle Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: currentTheme.colors.textMuted },
            ]}
          >
            MASTER CONTROL
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: currentTheme.colors.elevation2 },
            ]}
          >
            <SettingItem
              title="Enable Internal Providers"
              description="Toggle all built-in streaming providers on/off"
              icon="toggle-on"
              value={settings.enableInternalProviders}
              onValueChange={handleMasterToggle}
              isLast={true}
            />
          </View>
        </View>

        {/* Individual Providers Section */}
        {settings.enableInternalProviders && (
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: currentTheme.colors.textMuted },
              ]}
            >
              INDIVIDUAL PROVIDERS
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: currentTheme.colors.elevation2 },
              ]}
            >
              <SettingItem
                title="XPRIME"
                description="High-quality streams with various resolutions"
                icon="star"
                value={xprimeEnabled}
                onValueChange={handleXprimeToggle}
                badge="NEW"
              />
              <SettingItem
                title="HDRezka"
                description="Popular streaming service with multiple quality options"
                icon="hd"
                value={hdrezkaEnabled}
                onValueChange={handleHdrezkaToggle}
                isLast={true}
              />
            </View>
          </View>
        )}

        {/* Information Section */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: currentTheme.colors.textMuted },
            ]}
          >
            INFORMATION
          </Text>
          <View
            style={[
              styles.infoCard,
              { 
                backgroundColor: currentTheme.colors.elevation2,
                borderColor: `${currentTheme.colors.primary}30`
              },
            ]}
          >
            <MaterialIcons
              name="info-outline"
              size={24}
              color={currentTheme.colors.primary}
              style={styles.infoIcon}
            />
            <View style={styles.infoContent}>
              <Text
                style={[
                  styles.infoTitle,
                  { color: currentTheme.colors.text },
                ]}
              >
                About Internal Providers
              </Text>
              <Text
                style={[
                  styles.infoDescription,
                  { color: currentTheme.colors.textMuted },
                ]}
              >
                Internal providers are built directly into the app and don't require separate addon installation. They complement your Stremio addons by providing additional streaming sources.
              </Text>
              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <MaterialIcons
                    name="check-circle"
                    size={16}
                    color={currentTheme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.featureText,
                      { color: currentTheme.colors.textMuted },
                    ]}
                  >
                    No addon installation required
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons
                    name="check-circle"
                    size={16}
                    color={currentTheme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.featureText,
                      { color: currentTheme.colors.textMuted },
                    ]}
                  >
                    Multiple quality options
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons
                    name="check-circle"
                    size={16}
                    color={currentTheme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.featureText,
                      { color: currentTheme.colors.textMuted },
                    ]}
                  >
                    Fast and reliable streaming
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
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
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 16 : 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingItem: {
    padding: 16,
    borderBottomWidth: 0.5,
  },
  settingItemBorder: {
    borderBottomWidth: 0.5,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIconContainer: {
    marginRight: 16,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 14,
    opacity: 0.8,
    lineHeight: 20,
  },
  badge: {
    height: 18,
    minWidth: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  featureList: {
    gap: 6,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
  },
});

export default InternalProvidersSettings;