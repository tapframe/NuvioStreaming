import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, StatusBar, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { stremioService } from '../../services/stremioService';
import { mmkvStorage } from '../../services/mmkvStorage';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import PluginIcon from '../../components/icons/PluginIcon';
import { SettingsCard, SettingItem, CustomSwitch, ChevronRight } from './SettingsComponents';

const ContentDiscoverySettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const insets = useSafeAreaInsets();

    const [addonCount, setAddonCount] = useState<number>(0);
    const [catalogCount, setCatalogCount] = useState<number>(0);

    const loadData = useCallback(async () => {
        try {
            const addons = await stremioService.getInstalledAddonsAsync();
            setAddonCount(addons.length);

            let totalCatalogs = 0;
            addons.forEach(addon => {
                if (addon.catalogs && addon.catalogs.length > 0) {
                    totalCatalogs += addon.catalogs.length;
                }
            });

            const catalogSettingsJson = await mmkvStorage.getItem('catalog_settings');
            if (catalogSettingsJson) {
                const catalogSettings = JSON.parse(catalogSettingsJson);
                const disabledCount = Object.entries(catalogSettings)
                    .filter(([key, value]) => key !== '_lastUpdate' && value === false)
                    .length;
                setCatalogCount(totalCatalogs - disabledCount);
            } else {
                setCatalogCount(totalCatalogs);
            }
        } catch (error) {
            if (__DEV__) console.error('Error loading content data:', error);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadData();
        });
        return unsubscribe;
    }, [navigation, loadData]);

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Content & Discovery" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                <SettingsCard title="SOURCES">
                    <SettingItem
                        title="Addons"
                        description={`${addonCount} installed`}
                        icon="layers"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('Addons')}
                    />
                    <SettingItem
                        title="Debrid Integration"
                        description="Connect Torbox for premium streams"
                        icon="link"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('DebridIntegration')}
                    />
                    <SettingItem
                        title="Plugins"
                        description="Manage plugins and repositories"
                        customIcon={<PluginIcon size={18} color={currentTheme.colors.primary} />}
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('ScraperSettings')}
                        isLast
                    />
                </SettingsCard>

                <SettingsCard title="CATALOGS">
                    <SettingItem
                        title="Catalogs"
                        description={`${catalogCount} active`}
                        icon="list"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('CatalogSettings')}
                    />
                    <SettingItem
                        title="Home Screen"
                        description="Layout and content"
                        icon="home"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('HomeScreenSettings')}
                    />
                    <SettingItem
                        title="Continue Watching"
                        description="Cache and playback behavior"
                        icon="play-circle"
                        renderControl={() => <ChevronRight />}
                        onPress={() => navigation.navigate('ContinueWatchingSettings')}
                        isLast
                    />
                </SettingsCard>

                <SettingsCard title="DISCOVERY">
                    <SettingItem
                        title="Show Discover Section"
                        description="Display discover content in Search"
                        icon="compass"
                        renderControl={() => (
                            <CustomSwitch
                                value={settings?.showDiscover ?? true}
                                onValueChange={(value) => updateSetting('showDiscover', value)}
                            />
                        )}
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

export default ContentDiscoverySettingsScreen;
