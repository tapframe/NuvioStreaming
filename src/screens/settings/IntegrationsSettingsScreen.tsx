import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, StatusBar } from 'react-native';
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

const IntegrationsSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();

    const [mdblistKeySet, setMdblistKeySet] = useState<boolean>(false);
    const [openRouterKeySet, setOpenRouterKeySet] = useState<boolean>(false);
    const config = useRealtimeConfig();

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
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Integrations" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                {hasVisibleItems(['mdblist', 'tmdb']) && (
                    <SettingsCard title="METADATA">
                        {isItemVisible('mdblist') && (
                            <SettingItem
                                title="MDBList"
                                description={mdblistKeySet ? "Connected" : "Enable to add ratings & reviews"}
                                customIcon={<MDBListIcon size={18} colorPrimary={currentTheme.colors.primary} colorSecondary={currentTheme.colors.white} />}
                                renderControl={() => <ChevronRight />}
                                onPress={() => navigation.navigate('MDBListSettings')}
                            />
                        )}
                        {isItemVisible('tmdb') && (
                            <SettingItem
                                title="TMDB"
                                description="Metadata & logo source provider"
                                customIcon={<TMDBIcon size={18} color={currentTheme.colors.primary} />}
                                renderControl={() => <ChevronRight />}
                                onPress={() => navigation.navigate('TMDBSettings')}
                                isLast
                            />
                        )}
                    </SettingsCard>
                )}

                {hasVisibleItems(['openrouter']) && (
                    <SettingsCard title="AI ASSISTANT">
                        {isItemVisible('openrouter') && (
                            <SettingItem
                                title="OpenRouter API"
                                description={openRouterKeySet ? "Connected" : "Add your API key to enable AI chat"}
                                icon="cpu"
                                renderControl={() => <ChevronRight />}
                                onPress={() => navigation.navigate('AISettings')}
                                isLast
                            />
                        )}
                    </SettingsCard>
                )}
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
