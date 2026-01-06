import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, StatusBar, Dimensions } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { mmkvStorage } from '../../services/mmkvStorage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import MDBListIcon from '../../components/icons/MDBListIcon';
import TMDBIcon from '../../components/icons/TMDBIcon';
import { SettingsCard, SettingItem, ChevronRight } from './SettingsComponents';
import { useRealtimeConfig } from '../../hooks/useRealtimeConfig';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');

interface IntegrationsSettingsContentProps {
    isTablet?: boolean;
}

/**
 * Reusable IntegrationsSettingsContent component
 * Can be used inline (tablets) or wrapped in a screen (mobile)
 */
export const IntegrationsSettingsContent: React.FC<IntegrationsSettingsContentProps> = ({ isTablet = false }) => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const config = useRealtimeConfig();
    const { t } = useTranslation();

    const [mdblistKeySet, setMdblistKeySet] = useState<boolean>(false);
    const [openRouterKeySet, setOpenRouterKeySet] = useState<boolean>(false);

    const loadData = useCallback(async () => {
        try {
            const mdblistKey = await mmkvStorage.getItem('mdblist_api_key');
            setMdblistKeySet(!!mdblistKey);

            const openRouterKey = await mmkvStorage.getItem('openrouter_api_key');
            setOpenRouterKeySet(!!openRouterKey);
        } catch (error) {
            if (__DEV__) console.error('Error loading integration data:', error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const isItemVisible = (itemId: string) => {
        if (!config?.items) return true;
        const item = config.items[itemId];
        if (item && item.visible === false) return false;
        return true;
    };

    const hasVisibleItems = (itemIds: string[]) => {
        return itemIds.some(id => isItemVisible(id));
    };

    return (
        <>
            {hasVisibleItems(['mdblist', 'tmdb']) && (
                <SettingsCard title={t('settings.sections.metadata')} isTablet={isTablet}>
                    {isItemVisible('mdblist') && (
                        <SettingItem
                            title={t('settings.items.mdblist')}
                            description={mdblistKeySet ? t('settings.items.mdblist_connected') : t('settings.items.mdblist_desc')}
                            customIcon={<MDBListIcon size={isTablet ? 22 : 18} colorPrimary={currentTheme.colors.primary} colorSecondary={currentTheme.colors.white} />}
                            renderControl={() => <ChevronRight />}
                            onPress={() => navigation.navigate('MDBListSettings')}
                            isTablet={isTablet}
                        />
                    )}
                    {isItemVisible('tmdb') && (
                        <SettingItem
                            title={t('settings.items.tmdb')}
                            description={t('settings.items.tmdb_desc')}
                            customIcon={<TMDBIcon size={isTablet ? 22 : 18} color={currentTheme.colors.primary} />}
                            renderControl={() => <ChevronRight />}
                            onPress={() => navigation.navigate('TMDBSettings')}
                            isLast
                            isTablet={isTablet}
                        />
                    )}
                </SettingsCard>
            )}

            {hasVisibleItems(['openrouter']) && (
                <SettingsCard title={t('settings.sections.ai_assistant')} isTablet={isTablet}>
                    {isItemVisible('openrouter') && (
                        <SettingItem
                            title={t('settings.items.openrouter')}
                            description={openRouterKeySet ? t('settings.items.openrouter_connected') : t('settings.items.openrouter_desc')}
                            icon="cpu"
                            renderControl={() => <ChevronRight />}
                            onPress={() => navigation.navigate('AISettings')}
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
 * IntegrationsSettingsScreen - Wrapper for mobile navigation
 */
const IntegrationsSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const screenIsTablet = width >= 768;

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title={t('settings.integrations')} showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                <IntegrationsSettingsContent isTablet={screenIsTablet} />
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

export default IntegrationsSettingsScreen;
