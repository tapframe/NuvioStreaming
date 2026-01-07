import React from 'react';
import { View, StyleSheet, ScrollView, StatusBar, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import { SettingsCard, SettingItem, CustomSwitch, ChevronRight } from './SettingsComponents';
import { useRealtimeConfig } from '../../hooks/useRealtimeConfig';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');

interface AppearanceSettingsContentProps {
    isTablet?: boolean;
}

/**
 * Reusable AppearanceSettingsContent component
 * Can be used inline (tablets) or wrapped in a screen (mobile)
 */
export const AppearanceSettingsContent: React.FC<AppearanceSettingsContentProps> = ({ isTablet = false }) => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const { t } = useTranslation();
    const config = useRealtimeConfig();

    const isItemVisible = (itemId: string) => {
        if (!config?.items) return true;
        const item = config.items[itemId];
        if (item && item.visible === false) return false;
        return true;
    };

    const hasVisibleItems = (itemIds: string[]) => {
        return itemIds.some(id => {
            if (id === 'streams_backdrop' && isTablet) return false;
            return isItemVisible(id);
        });
    };

    return (
        <>
            {hasVisibleItems(['theme']) && (
                <SettingsCard title={t('settings.sections.theme')} isTablet={isTablet}>
                    {isItemVisible('theme') && (
                        <SettingItem
                            title={t('settings.items.theme')}
                            description={currentTheme.name}
                            icon="sliders"
                            renderControl={() => <ChevronRight />}
                            onPress={() => navigation.navigate('ThemeSettings')}
                            isLast
                            isTablet={isTablet}
                        />
                    )}
                </SettingsCard>
            )}

            {hasVisibleItems(['episode_layout', 'streams_backdrop']) && (
                <SettingsCard title={t('settings.sections.layout')} isTablet={isTablet}>
                    {isItemVisible('episode_layout') && (
                        <SettingItem
                            title={t('settings.items.episode_layout')}
                            description={settings?.episodeLayoutStyle === 'horizontal' ? t('settings.options.horizontal') : t('settings.options.vertical')}
                            icon="grid"
                            renderControl={() => (
                                <CustomSwitch
                                    value={settings?.episodeLayoutStyle === 'horizontal'}
                                    onValueChange={(value) => updateSetting('episodeLayoutStyle', value ? 'horizontal' : 'vertical')}
                                />
                            )}
                            isLast={isTablet || !isItemVisible('streams_backdrop')}
                            isTablet={isTablet}
                        />
                    )}
                    {!isTablet && isItemVisible('streams_backdrop') && (
                        <SettingItem
                            title={t('settings.items.streams_backdrop')}
                            description={t('settings.items.streams_backdrop_desc')}
                            icon="image"
                            renderControl={() => (
                                <CustomSwitch
                                    value={settings?.enableStreamsBackdrop ?? true}
                                    onValueChange={(value) => updateSetting('enableStreamsBackdrop', value)}
                                />
                            )}
                            isLast
                            isTablet={isTablet}
                        />
                    )}
                </SettingsCard>
            )}
        </>
    );
};

/**
 * AppearanceSettingsScreen - Wrapper for mobile navigation
 */
const AppearanceSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const screenIsTablet = width >= 768;

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title={t('settings.appearance')} showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                <AppearanceSettingsContent isTablet={screenIsTablet} />
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

export default AppearanceSettingsScreen;
