import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, StatusBar, Platform, Dimensions } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import { SettingsCard, SettingItem, CustomSwitch, ChevronRight } from './SettingsComponents';
import { useRealtimeConfig } from '../../hooks/useRealtimeConfig';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

const AppearanceSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const insets = useSafeAreaInsets();
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
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Appearance" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                {hasVisibleItems(['theme']) && (
                    <SettingsCard title="THEME">
                        {isItemVisible('theme') && (
                            <SettingItem
                                title="Theme"
                                description={currentTheme.name}
                                icon="sliders"
                                renderControl={() => <ChevronRight />}
                                onPress={() => navigation.navigate('ThemeSettings')}
                                isLast
                            />
                        )}
                    </SettingsCard>
                )}

                {hasVisibleItems(['episode_layout', 'streams_backdrop']) && (
                    <SettingsCard title="LAYOUT">
                        {isItemVisible('episode_layout') && (
                            <SettingItem
                                title="Episode Layout"
                                description={settings?.episodeLayoutStyle === 'horizontal' ? 'Horizontal' : 'Vertical'}
                                icon="grid"
                                renderControl={() => (
                                    <CustomSwitch
                                        value={settings?.episodeLayoutStyle === 'horizontal'}
                                        onValueChange={(value) => updateSetting('episodeLayoutStyle', value ? 'horizontal' : 'vertical')}
                                    />
                                )}
                                isLast={isTablet || !isItemVisible('streams_backdrop')}
                            />
                        )}
                        {!isTablet && isItemVisible('streams_backdrop') && (
                            <SettingItem
                                title="Streams Backdrop"
                                description="Show blurred backdrop on mobile streams"
                                icon="image"
                                renderControl={() => (
                                    <CustomSwitch
                                        value={settings?.enableStreamsBackdrop ?? true}
                                        onValueChange={(value) => updateSetting('enableStreamsBackdrop', value)}
                                    />
                                )}
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

export default AppearanceSettingsScreen;
