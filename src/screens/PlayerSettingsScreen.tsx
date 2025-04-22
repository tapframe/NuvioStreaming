import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
  useColorScheme,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettings, AppSettings } from '../hooks/useSettings';
import { colors } from '../styles/colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const ANDROID_STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

interface SettingItemProps {
  title: string;
  description?: string;
  icon: string;
  isDarkMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  isLast?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  icon,
  isDarkMode,
  isSelected,
  onPress,
  isLast,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[
      styles.settingItem,
      !isLast && styles.settingItemBorder,
      { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
    ]}
  >
    <View style={styles.settingContent}>
      <View style={[
        styles.settingIconContainer,
        { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
      ]}>
        <MaterialIcons
          name={icon}
          size={20}
          color={colors.primary}
        />
      </View>
      <View style={styles.settingText}>
        <Text
          style={[
            styles.settingTitle,
            { color: isDarkMode ? colors.highEmphasis : colors.textDark },
          ]}
        >
          {title}
        </Text>
        {description && (
          <Text
            style={[
              styles.settingDescription,
              { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark },
            ]}
          >
            {description}
          </Text>
        )}
      </View>
      {isSelected && (
        <MaterialIcons
          name="check"
          size={24}
          color={colors.primary}
          style={styles.checkIcon}
        />
      )}
    </View>
  </TouchableOpacity>
);

const PlayerSettingsScreen: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const systemColorScheme = useColorScheme();
  const isDarkMode = systemColorScheme === 'dark' || settings.enableDarkMode;
  const navigation = useNavigation();

  const playerOptions = [
    {
      id: 'internal',
      title: 'Built-in Player',
      description: 'Use the app\'s default video player',
      icon: 'play-circle-outline',
    },
    ...(Platform.OS === 'ios' ? [
      {
        id: 'vlc',
        title: 'VLC',
        description: 'Open streams in VLC media player',
        icon: 'video-library',
      },
      {
        id: 'infuse',
        title: 'Infuse',
        description: 'Open streams in Infuse player',
        icon: 'smart-display',
      },
      {
        id: 'outplayer',
        title: 'OutPlayer',
        description: 'Open streams in OutPlayer',
        icon: 'slideshow',
      },
      {
        id: 'vidhub',
        title: 'VidHub',
        description: 'Open streams in VidHub player',
        icon: 'ondemand-video',
      },
    ] : [
      {
        id: 'external',
        title: 'External Player',
        description: 'Open streams in your preferred video player',
        icon: 'open-in-new',
      },
    ]),
  ];

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? colors.darkBackground : '#F2F2F7' },
      ]}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDarkMode ? "light-content" : "dark-content"}
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
            color={isDarkMode ? colors.highEmphasis : colors.textDark}
          />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: isDarkMode ? colors.highEmphasis : colors.textDark },
          ]}
        >
          Video Player
        </Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: isDarkMode ? colors.mediumEmphasis : colors.textMutedDark },
            ]}
          >
            PLAYER SELECTION
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDarkMode
                  ? colors.elevation2
                  : colors.white,
              },
            ]}
          >
            {playerOptions.map((option, index) => (
              <SettingItem
                key={option.id}
                title={option.title}
                description={option.description}
                icon={option.icon}
                isDarkMode={isDarkMode}
                isSelected={
                  Platform.OS === 'ios'
                    ? settings.preferredPlayer === option.id
                    : settings.useExternalPlayer === (option.id === 'external')
                }
                onPress={() => {
                  if (Platform.OS === 'ios') {
                    updateSetting('preferredPlayer', option.id as AppSettings['preferredPlayer'], false);
                  } else {
                    updateSetting('useExternalPlayer', option.id === 'external', false);
                  }
                }}
                isLast={index === playerOptions.length - 1}
              />
            ))}
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
    paddingBottom: 8,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 4,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  settingItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    marginTop: 2,
  },
  checkIcon: {
    marginLeft: 16,
  },
});

export default PlayerSettingsScreen; 