import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Switch,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useSettings } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';

const ContinueWatchingSettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { settings, updateSetting } = useSettings();
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  // Prevent iOS entrance flicker by restoring a non-translucent StatusBar
  useEffect(() => {
    try {
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor(colors.darkBackground);
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'ios') {
        StatusBar.setHidden(false);
      }
    } catch {}
  }, [colors.darkBackground]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Fade in/out animation for the "Changes saved" indicator
  useEffect(() => {
    if (showSavedIndicator) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true
        }),
        Animated.delay(1000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true
        })
      ]).start(() => setShowSavedIndicator(false));
    }
  }, [showSavedIndicator, fadeAnim]);

  const handleUpdateSetting = useCallback(<K extends keyof typeof settings>(
    key: K,
    value: typeof settings[K]
  ) => {
    updateSetting(key, value);
    setShowSavedIndicator(true);
  }, [updateSetting]);

  const CustomSwitch = ({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.elevation2, true: colors.primary }}
      thumbColor={value ? colors.white : colors.mediumEmphasis}
      ios_backgroundColor={colors.elevation2}
    />
  );

  const SettingItem = ({ 
    title, 
    description, 
    value, 
    onValueChange, 
    isLast = false 
  }: { 
    title: string; 
    description: string; 
    value: boolean; 
    onValueChange: (value: boolean) => void;
    isLast?: boolean;
  }) => (
    <View style={[
      styles.settingItem,
      { 
        borderBottomColor: isLast ? 'transparent' : colors.border,
        backgroundColor: colors.elevation1 
      }
    ]}>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: colors.highEmphasis }]}>
          {title}
        </Text>
        <Text style={[styles.settingDescription, { color: colors.mediumEmphasis }]}>
          {description}
        </Text>
      </View>
      <CustomSwitch value={value} onValueChange={onValueChange} />
    </View>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.darkBackground }]}>
      <Text style={[styles.sectionTitle, { color: colors.highEmphasis }]}>
        {title}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.darkBackground }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
        >
          <MaterialIcons name="chevron-left" size={28} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Settings</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.highEmphasis }]}>
          Continue Watching
        </Text>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <SectionHeader title="PLAYBACK BEHAVIOR" />
        
        <View style={[styles.settingsCard, { backgroundColor: colors.elevation1 }]}>
          <SettingItem
            title="Use Cached Streams"
            description="When enabled, clicking Continue Watching items will open the player directly using previously played streams. When disabled, opens a content screen instead."
            value={settings.useCachedStreams}
            onValueChange={(value) => handleUpdateSetting('useCachedStreams', value)}
            isLast={!settings.useCachedStreams}
          />
          {!settings.useCachedStreams && (
            <SettingItem
              title="Open Metadata Screen"
              description="When cached streams are disabled, open the Metadata screen instead of the Streams screen. This shows content details and allows manual stream selection."
              value={settings.openMetadataScreenWhenCacheDisabled}
              onValueChange={(value) => handleUpdateSetting('openMetadataScreenWhenCacheDisabled', value)}
              isLast={true}
            />
          )}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.elevation1 }]}>
          <View style={styles.infoHeader}>
            <MaterialIcons name="info" size={20} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.highEmphasis }]}>
              How it works
            </Text>
          </View>
          <Text style={[styles.infoText, { color: colors.mediumEmphasis }]}>
            • Streams are cached for 1 hour after playing{'\n'}
            • Cached streams are validated before use{'\n'}
            • If cache is invalid or expired, falls back to content screen{'\n'}
            • "Use Cached Streams" controls direct player vs screen navigation{'\n'}
            • "Open Metadata Screen" appears only when cached streams are disabled
          </Text>
        </View>
      </ScrollView>

      {/* Saved indicator */}
      <Animated.View 
        style={[
          styles.savedIndicator,
          { 
            backgroundColor: colors.primary,
            opacity: fadeAnim 
          }
        ]}
      >
        <MaterialIcons name="check" size={20} color={colors.white} />
        <Text style={styles.savedText}>Changes saved</Text>
      </Animated.View>
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
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 0 : 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  settingsCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  savedIndicator: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  savedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default ContinueWatchingSettingsScreen;
