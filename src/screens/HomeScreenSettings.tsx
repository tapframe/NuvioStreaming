import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Platform,
  useColorScheme,
  Animated,
  Dimensions
} from 'react-native';
import { useSettings } from '../hooks/useSettings';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

interface SettingsCardProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  colors: any;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, isDarkMode, colors }) => (
  <View style={[
    styles.card,
    { backgroundColor: isDarkMode ? colors.elevation2 : colors.white }
  ]}>
    {children}
  </View>
);

// Restrict icon names to those available in MaterialIcons
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface SettingItemProps {
  title: string;
  description?: string;
  icon: MaterialIconName;
  renderControl: () => React.ReactNode;
  isLast?: boolean;
  onPress?: () => void;
  isDarkMode: boolean;
  colors: any;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  renderControl,
  isLast = false,
  onPress,
  isDarkMode,
  colors
}) => {
  const isTabletDevice = Platform.OS !== 'web' && (Dimensions.get('window').width >= 768);

  return (
    <TouchableOpacity 
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      style={[
        styles.settingItem, 
        !isLast && styles.settingItemBorder,
        { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }
      ]}
    >
      <View style={styles.settingIconContainer}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTitleRow}>
          <Text style={[styles.settingTitle, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>
            {title}
          </Text>
          {description && (
            <Text style={[styles.settingDescription, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>
              {description}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.settingControl}>
        {renderControl()}
      </View>
    </TouchableOpacity>
  );
};

const SectionHeader: React.FC<{ title: string; isDarkMode: boolean; colors: any }> = ({ title, isDarkMode, colors }) => (
  <View style={styles.sectionHeader}>
    <Text style={[
      styles.sectionHeaderText,
      { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
    ]}>
      {title}
    </Text>
  </View>
);

const HomeScreenSettings: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const systemColorScheme = useColorScheme();
  const { currentTheme } = useTheme();
  const colors = currentTheme.colors;
  const isDarkMode = systemColorScheme === 'dark' || settings.enableDarkMode;
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

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

  const CustomSwitch = ({ value, onValueChange }: { value: boolean, onValueChange: (value: boolean) => void }) => (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', true: colors.primary }}
      thumbColor={Platform.OS === 'android' ? (value ? colors.white : colors.white) : ''}
      ios_backgroundColor={isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
    />
  );

  // Radio button component for content source selection
  const RadioOption = ({ selected, onPress, label }: { selected: boolean, onPress: () => void, label: string }) => (
    <TouchableOpacity 
      style={styles.radioOption} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.radioContainer}>
        <View style={[
          styles.radio, 
          { borderColor: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }
        ]}>
          {selected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
        </View>
        <Text style={[
          styles.radioLabel, 
          { color: isDarkMode ? colors.highEmphasis : colors.textDark }
        ]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Compact segmented control for nicer toggles
  const SegmentedControl = ({
    options,
    value,
    onChange
  }: {
    options: { label: string; value: string }[];
    value: string;
    onChange: (val: string) => void;
  }) => (
    <View style={[styles.segmentContainer, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
      {options.map((opt, idx) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.85}
            style={[
              styles.segment,
              idx === 0 && styles.segmentFirst,
              idx === options.length - 1 && styles.segmentLast,
              selected && { backgroundColor: colors.primary },
            ]}
          >
            <Text style={{
              color: selected ? colors.white : (isDarkMode ? colors.highEmphasis : colors.textDark),
              fontWeight: '700',
              fontSize: 13,
            }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // Format selected catalogs text
  const getSelectedCatalogsText = useCallback(() => {
    if (!settings.selectedHeroCatalogs || settings.selectedHeroCatalogs.length === 0) {
      return "All catalogs";
    } else {
      return `${settings.selectedHeroCatalogs.length} selected`;
    }
  }, [settings.selectedHeroCatalogs]);

  const ChevronRight = () => (
    <MaterialIcons 
      name="chevron-right" 
      size={24} 
      color={isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}
    />
  );

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: isDarkMode ? colors.darkBackground : '#F2F2F7' }
    ]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons 
            name="arrow-back" 
            size={24} 
            color={isDarkMode ? colors.highEmphasis : colors.textDark} 
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>
          Home Screen Settings
        </Text>
      </View>

      {/* Saved indicator */}
      <Animated.View 
        style={[
          styles.savedIndicator, 
          { 
            opacity: fadeAnim,
            backgroundColor: isDarkMode ? 'rgba(0, 180, 150, 0.9)' : 'rgba(0, 180, 150, 0.9)'
          }
        ]}
        pointerEvents="none"
      >
        <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
        <Text style={styles.savedIndicatorText}>Changes Applied</Text>
      </Animated.View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <SectionHeader title="DISPLAY OPTIONS" isDarkMode={isDarkMode} colors={colors} />
        <SettingsCard isDarkMode={isDarkMode} colors={colors}>
          <SettingItem
            title="Show Hero Section"
            description="Featured content at the top"
            icon="movie-filter"
            isDarkMode={isDarkMode}
            colors={colors}
            renderControl={() => (
              <CustomSwitch 
                value={settings.showHeroSection} 
                onValueChange={(value) => handleUpdateSetting('showHeroSection', value)} 
              />
            )}
          />
          <SettingItem
            title="Featured Content Source"
            description={settings.featuredContentSource === 'tmdb' ? 'TMDB Trending' : 'From Catalogs'}
            icon="settings-input-component"
            isDarkMode={isDarkMode}
            colors={colors}
            renderControl={() => <View />}
            isLast={!settings.showHeroSection || settings.featuredContentSource !== 'catalogs'}
          />
          {settings.showHeroSection && settings.featuredContentSource === 'catalogs' && (
            <SettingItem
              title="Select Catalogs"
              description={getSelectedCatalogsText()}
              icon="list"
              isDarkMode={isDarkMode}
              colors={colors}
              renderControl={ChevronRight}
              onPress={() => navigation.navigate('HeroCatalogs')}
              isLast={true}
            />
          )}
        </SettingsCard>

        {settings.showHeroSection && !(Dimensions.get('window').width >= 768) && (
          <>
            <View style={styles.segmentCard}>
              <Text style={[styles.segmentTitle, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>Hero Layout</Text>
              <SegmentedControl
                options={[{ label: 'Legacy', value: 'legacy' }, { label: 'Carousel', value: 'carousel' }]}
                value={settings.heroStyle}
                onChange={(val) => handleUpdateSetting('heroStyle', val as any)}
              />
              <Text style={[styles.segmentHint, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>Full-width banner or swipeable cards</Text>
            </View>

            <View style={styles.segmentCard}>
              <Text style={[styles.segmentTitle, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>Featured Source</Text>
              <SegmentedControl
                options={[{ label: 'TMDB', value: 'tmdb' }, { label: 'Catalogs', value: 'catalogs' }]}
                value={settings.featuredContentSource}
                onChange={(val) => handleUpdateSetting('featuredContentSource', val as any)}
              />
              {settings.featuredContentSource === 'catalogs' && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('HeroCatalogs')}
                  style={[styles.manageLink, { backgroundColor: isDarkMode ? colors.elevation1 : 'rgba(0,0,0,0.04)' }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: isDarkMode ? colors.highEmphasis : colors.textDark, fontWeight: '600' }}>Manage selected catalogs</Text>
                  <MaterialIcons name="chevron-right" size={20} color={isDarkMode ? colors.mediumEmphasis : colors.textMutedDark} />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <SettingsCard isDarkMode={isDarkMode} colors={colors}>
          <Text style={[styles.cardHeader, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>Posters</Text>
          <View style={styles.settingsRowInline}>
            <Text style={[styles.rowLabel, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>Show Titles</Text>
            <CustomSwitch 
              value={settings.showPosterTitles}
              onValueChange={(value) => handleUpdateSetting('showPosterTitles', value)}
            />
          </View>
          <View style={styles.settingsRow}>
            <Text style={[styles.rowLabel, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>Poster Size</Text>
            <SegmentedControl
              options={[{ label: 'Small', value: 'small' }, { label: 'Medium', value: 'medium' }, { label: 'Large', value: 'large' }]}
              value={settings.posterSize}
              onChange={(val) => handleUpdateSetting('posterSize', val as any)}
            />
          </View>

          <View style={styles.settingsRow}>
            <Text style={[styles.rowLabel, { color: isDarkMode ? colors.highEmphasis : colors.textDark }]}>Poster Corners</Text>
            <SegmentedControl
              options={[{ label: 'Square', value: '0' }, { label: 'Rounded', value: '12' }, { label: 'Pill', value: '20' }]}
              value={String(settings.posterBorderRadius)}
              onChange={(val) => handleUpdateSetting('posterBorderRadius', Number(val) as any)}
            />
          </View>
        </SettingsCard>

        <SectionHeader title="ABOUT THESE SETTINGS" isDarkMode={isDarkMode} colors={colors} />
        <View style={[styles.infoCard, { backgroundColor: isDarkMode ? colors.elevation1 : 'rgba(0,0,0,0.03)' }]}>
          <Text style={[styles.infoText, { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark }]}>
            These settings control how content is displayed on your Home screen. Changes are applied immediately without requiring an app restart.
          </Text>
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
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? ANDROID_STATUSBAR_HEIGHT + 12 : 8,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    minHeight: 44,
  },
  settingItemBorder: {
    // Border styling handled directly in the component with borderBottomWidth
  },
  settingIconContainer: {
    marginRight: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    marginRight: 8,
  },
  settingTitleRow: {
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 14,
    opacity: 0.7,
  },
  settingControl: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 12,
  },
  radioCardContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  radioOption: {
    padding: 16,
  },
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  radioLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  radioDescription: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  radioDescriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    gap: 6,
    marginTop: 8,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentFirst: {
  },
  segmentLast: {
  },
  segmentCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  segmentTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    opacity: 0.9,
  },
  segmentHint: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  manageLink: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  settingsRowInline: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    opacity: 0.9,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 12,
    opacity: 0.9,
  },
  savedIndicator: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 60 : 90,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  savedIndicatorText: {
    color: '#FFFFFF',
    marginLeft: 6,
    fontWeight: '600',
  },
});

export default HomeScreenSettings; 