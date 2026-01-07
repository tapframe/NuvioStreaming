import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getPluginTesterStyles } from './styles';

interface HeaderProps {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    backIcon?: keyof typeof Ionicons.glyphMap;
    rightElement?: React.ReactNode;
}

export const Header = ({ title, subtitle, onBack, backIcon = 'arrow-back', rightElement }: HeaderProps) => {
    const { currentTheme } = useTheme();
    const styles = getPluginTesterStyles(currentTheme);

    return (
        <View style={styles.header}>
            <TouchableOpacity onPress={onBack}>
                <Ionicons name={backIcon} size={24} color={currentTheme.colors.primary} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.headerTitle}>{title}</Text>
                {subtitle && (
                    <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
                )}
            </View>
            {rightElement || <View style={{ width: 24 }} />}
        </View>
    );
};

interface MainTabBarProps {
    activeTab: 'individual' | 'repo';
    onTabChange: (tab: 'individual' | 'repo') => void;
}

export const MainTabBar = ({ activeTab, onTabChange }: MainTabBarProps) => {
    const { currentTheme } = useTheme();
    const styles = getPluginTesterStyles(currentTheme);

    return (
        <View style={styles.tabBar}>
            <TouchableOpacity
                style={[styles.tab, activeTab === 'individual' && styles.activeTab]}
                onPress={() => onTabChange('individual')}
            >
                <Ionicons name="person-outline" size={16} color={activeTab === 'individual' ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis} />
                <Text style={[styles.tabText, activeTab === 'individual' && styles.activeTabText]}>Individual</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.tab, activeTab === 'repo' && styles.activeTab]}
                onPress={() => onTabChange('repo')}
            >
                <Ionicons name="git-branch-outline" size={16} color={activeTab === 'repo' ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis} />
                <Text style={[styles.tabText, activeTab === 'repo' && styles.activeTabText]}>Repo Tester</Text>
            </TouchableOpacity>
        </View>
    );
};
