import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { RepoTester } from './plugin-tester/RepoTester';
import { IndividualTester } from './plugin-tester/IndividualTester';
import { Header, MainTabBar } from './plugin-tester/components';
import { getPluginTesterStyles, useIsLargeScreen } from './plugin-tester/styles';

const PluginTesterScreen = () => {
    const [mainTab, setMainTab] = useState<'individual' | 'repo'>('individual');
    const { t } = useTranslation();
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const isLargeScreen = useIsLargeScreen();
    const styles = getPluginTesterStyles(currentTheme, isLargeScreen);

    if (mainTab === 'individual') {
        return <IndividualTester onSwitchTab={setMainTab} />;
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <Header
                title={t('plugin_tester.title')}
                subtitle={t('plugin_tester.subtitle')}
                onBack={() => navigation.goBack()}
            />
            <MainTabBar activeTab="repo" onTabChange={setMainTab} />
            <RepoTester />
        </View>
    );
};

export default PluginTesterScreen;
