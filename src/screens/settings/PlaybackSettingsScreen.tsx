import React from 'react';
import { View, StyleSheet, ScrollView, StatusBar, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import { SettingsCard, SettingItem, CustomSwitch, ChevronRight } from './SettingsComponents';

const PlaybackSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Playback" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                <SettingsCard title="VIDEO PLAYER">
                    <SettingItem
                        title="Video Player"
                        description={Platform.OS === 'ios'
                            ? (settings?.preferredPlayer === 'internal' ? 'Built-in' : settings?.preferredPlayer?.toUpperCase() || 'Built-in')
                            : (settings?.useExternalPlayer ? 'External' : 'Built-in')
                        }
                        icon="play-circle"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('PlayerSettings')}
                        isLast
                    />
                </SettingsCard>

                <SettingsCard title="MEDIA">
                    <SettingItem
                        title="Show Trailers"
                        description="Display trailers in hero section"
                        icon="film"
                        renderControl={() => (
                            <CustomSwitch
                                value={settings?.showTrailers ?? true}
                                onValueChange={(value) => updateSetting('showTrailers', value)}
                            />
                        )}
                    />
                    <SettingItem
                        title="Enable Downloads (Beta)"
                        description="Show Downloads tab and enable saving streams"
                        icon="download"
                        renderControl={() => (
                            <CustomSwitch
                                value={settings?.enableDownloads ?? false}
                                onValueChange={(value) => updateSetting('enableDownloads', value)}
                            />
                        )}
                        isLast
                    />
                </SettingsCard>

                <SettingsCard title="NOTIFICATIONS">
                    <SettingItem
                        title="Notifications"
                        description="Episode reminders"
                        icon="bell"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('NotificationSettings')}
                        isLast
                    />
                </SettingsCard>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 16,
    },
});

export default PlaybackSettingsScreen;
