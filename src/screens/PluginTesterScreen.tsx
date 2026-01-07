import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { RepoTester } from './plugin-tester/RepoTester';
import { IndividualTester } from './plugin-tester/IndividualTester';
import { Header, MainTabBar } from './plugin-tester/components';
import { getPluginTesterStyles } from './plugin-tester/styles';

const PluginTesterScreen = () => {
    const [mainTab, setMainTab] = useState<'individual' | 'repo'>('individual');
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const styles = getPluginTesterStyles(currentTheme);

    if (mainTab === 'individual') {
        return <IndividualTester onSwitchTab={setMainTab} />;
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <Header
                title="Plugin Tester"
                subtitle="Run scrapers and inspect logs in real-time"
                onBack={() => navigation.goBack()}
            />
            <MainTabBar activeTab="repo" onTabChange={setMainTab} />
            <RepoTester />
        </View>
    );
};

export default PluginTesterScreen;
