import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { mmkvStorage } from '../../services/mmkvStorage';
import { campaignService } from '../../services/campaignService';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import CustomAlert from '../../components/CustomAlert';
import { SettingsCard, SettingItem, ChevronRight } from './SettingsComponents';
import { useTranslation } from 'react-i18next';

const DeveloperSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');
    const [alertActions, setAlertActions] = useState<Array<{ label: string; onPress: () => void }>>([]);

    const openAlert = (
        title: string,
        message: string,
        actions?: Array<{ label: string; onPress: () => void }>
    ) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertActions(actions && actions.length > 0 ? actions : [{ label: 'OK', onPress: () => { } }]);
        setAlertVisible(true);
    };

    const handleResetOnboarding = async () => {
        try {
            await mmkvStorage.removeItem('hasCompletedOnboarding');
            openAlert('Success', 'Onboarding has been reset. Restart the app to see the onboarding flow.');
        } catch (error) {
            openAlert('Error', 'Failed to reset onboarding.');
        }
    };

    const handleResetAnnouncement = async () => {
        try {
            await mmkvStorage.removeItem('announcement_v1.0.0_shown');
            openAlert('Success', 'Announcement reset. Restart the app to see the announcement overlay.');
        } catch (error) {
            openAlert('Error', 'Failed to reset announcement.');
        }
    };

    const handleResetCampaigns = async () => {
        await campaignService.resetCampaigns();
        openAlert('Success', 'Campaign history reset. Restart app to see posters again.');
    };

    const handleClearAllData = () => {
        openAlert(
            'Clear All Data',
            'This will reset all settings and clear all cached data. Are you sure?',
            [
                { label: 'Cancel', onPress: () => { } },
                {
                    label: 'Clear',
                    onPress: async () => {
                        try {
                            await mmkvStorage.clear();
                            openAlert('Success', 'All data cleared. Please restart the app.');
                        } catch (error) {
                            openAlert('Error', 'Failed to clear data.');
                        }
                    }
                }
            ]
        );
    };

    // Only show in development mode
    if (!__DEV__) {
        return null;
    }

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title={t('settings.developer')} showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                <SettingsCard title={t('settings.sections.testing')}>
                    <SettingItem
                        title={t('settings.items.test_onboarding')}
                        icon="play-circle"
                        onPress={() => navigation.navigate('Onboarding')}
                        renderControl={() => <ChevronRight />}
                    />
                    <SettingItem
                        title={t('settings.items.reset_onboarding')}
                        icon="refresh-ccw"
                        onPress={handleResetOnboarding}
                        renderControl={() => <ChevronRight />}
                    />
                    <SettingItem
                        title={t('settings.items.test_announcement')}
                        icon="bell"
                        description={t('settings.items.test_announcement_desc')}
                        onPress={handleResetAnnouncement}
                        renderControl={() => <ChevronRight />}
                    />
                    <SettingItem
                        title={t('settings.items.reset_campaigns')}
                        description={t('settings.items.reset_campaigns_desc')}
                        icon="refresh-cw"
                        onPress={handleResetCampaigns}
                        renderControl={() => <ChevronRight />}
                        isLast
                    />
                </SettingsCard>

                <SettingsCard title={t('settings.sections.danger_zone')}>
                    <SettingItem
                        title={t('settings.items.clear_all_data')}
                        description={t('settings.items.clear_all_data_desc')}
                        icon="trash-2"
                        onPress={handleClearAllData}
                        isLast
                    />
                </SettingsCard>
            </ScrollView>

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                actions={alertActions}
                onClose={() => setAlertVisible(false)}
            />
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

export default DeveloperSettingsScreen;
