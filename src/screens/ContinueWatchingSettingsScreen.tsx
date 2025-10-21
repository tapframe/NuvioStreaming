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

// TTL options in milliseconds - organized in rows
const TTL_OPTIONS = [
  [
    { label: '15 min', value: 15 * 60 * 1000 },
    { label: '30 min', value: 30 * 60 * 1000 },
    { label: '1 hour', value: 60 * 60 * 1000 },
  ],
  [
    { label: '2 hours', value: 2 * 60 * 60 * 1000 },
    { label: '6 hours', value: 6 * 60 * 60 * 1000 },
    { label: '12 hours', value: 12 * 60 * 60 * 1000 },
  ],
  [
    { label: '24 hours', value: 24 * 60 * 60 * 1000 },
  ],
];

const ContinueWatchingSettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { settings, updateSetting } = useSettings();
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const styles = createStyles(colors);
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


  const TTLPickerItem = ({ option }: { option: { label: string; value: number } }) => {
    const isSelected = settings.streamCacheTTL === option.value;
    return (
      <TouchableOpacity
        style={[
          styles.ttlOption,
          {
            backgroundColor: isSelected ? colors.primary : colors.elevation1,
            borderColor: isSelected ? colors.primary : colors.border,
          }
        ]}
        onPress={() => handleUpdateSetting('streamCacheTTL', option.value)}
        activeOpacity={0.7}
      >
        <Text style={[
          styles.ttlOptionText,
          { color: isSelected ? colors.white : colors.highEmphasis }
        ]}>
          {option.label}
        </Text>
        {isSelected && (
          <MaterialIcons name="check" size={20} color={colors.white} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleBack}
        >
          <MaterialIcons name="chevron-left" size={28} color={colors.white} />
          <Text style={styles.backText}>Settings</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.headerTitle}>
        Continue Watching
      </Text>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PLAYBACK BEHAVIOR</Text>
          <View style={styles.settingsCard}>
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
        </View>

        {settings.useCachedStreams && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CACHE SETTINGS</Text>
            <View style={styles.settingsCard}>
            <View style={[styles.settingItem, { borderBottomWidth: 0, flexDirection: 'column', alignItems: 'flex-start' }]}>
              <Text style={[styles.settingTitle, { color: colors.highEmphasis, marginBottom: 8 }]}>
                Stream Cache Duration
              </Text>
              <Text style={[styles.settingDescription, { color: colors.mediumEmphasis, marginBottom: 16 }]}>
                How long to keep cached stream links before they expire
              </Text>
              <View style={styles.ttlOptionsContainer}>
                {TTL_OPTIONS.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.ttlRow}>
                    {row.map((option) => (
                      <TTLPickerItem key={option.value} option={option} />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
          </View>
        )}

        {settings.useCachedStreams && (
          <View style={styles.section}>
            <View style={[styles.warningCard, { borderColor: colors.warning }]}>
            <View style={styles.warningHeader}>
              <MaterialIcons name="warning" size={20} color={colors.warning} />
              <Text style={[styles.warningTitle, { color: colors.warning }]}>
                Important Note
              </Text>
            </View>
            <Text style={[styles.warningText, { color: colors.mediumEmphasis }]}>
              Not all stream links may remain active for the full cache duration. Longer cache times may result in expired links. If a cached link fails, the app will fall back to fetching fresh streams.
            </Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <MaterialIcons name="info" size={20} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.highEmphasis }]}>
              How it works
            </Text>
          </View>
          <Text style={[styles.infoText, { color: colors.mediumEmphasis }]}>
            {settings.useCachedStreams ? (
              <>
                • Streams are cached for your selected duration after playing{'\n'}
                • Cached streams are validated before use{'\n'}
                • If cache is invalid or expired, falls back to content screen{'\n'}
                • "Use Cached Streams" controls direct player vs screen navigation{'\n'}
                • "Open Metadata Screen" appears only when cached streams are disabled
              </>
            ) : (
              <>
                • When cached streams are disabled, clicking Continue Watching items opens content screens{'\n'}
                • "Open Metadata Screen" option controls which screen to open{'\n'}
                • Metadata screen shows content details and allows manual stream selection{'\n'}
                • Streams screen shows available streams for immediate playback
              </>
            )}
          </Text>
          </View>
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

// Create a styles creator function that accepts the theme colors
const createStyles = (colors: any) => StyleSheet.create({
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
    fontWeight: '400',
    color: colors.primary,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.white,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mediumGray,
    marginHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  settingsCard: {
    marginHorizontal: 16,
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
  ttlOptionsContainer: {
    width: '100%',
    gap: 8,
  },
  ttlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  ttlOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  ttlOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  warningCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export default ContinueWatchingSettingsScreen;
