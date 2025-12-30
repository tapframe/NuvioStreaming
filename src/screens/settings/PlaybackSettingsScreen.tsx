import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, StatusBar, Platform, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../hooks/useSettings';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ScreenHeader from '../../components/common/ScreenHeader';
import { SettingsCard, SettingItem, CustomSwitch, ChevronRight } from './SettingsComponents';
import { useRealtimeConfig } from '../../hooks/useRealtimeConfig';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

const { width } = Dimensions.get('window');

// Available languages for audio/subtitle selection
const AVAILABLE_LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ar', name: 'Arabic' },
    { code: 'nl', name: 'Dutch' },
    { code: 'sv', name: 'Swedish' },
    { code: 'no', name: 'Norwegian' },
    { code: 'fi', name: 'Finnish' },
    { code: 'da', name: 'Danish' },
    { code: 'pl', name: 'Polish' },
    { code: 'tr', name: 'Turkish' },
    { code: 'cs', name: 'Czech' },
    { code: 'hu', name: 'Hungarian' },
    { code: 'el', name: 'Greek' },
    { code: 'th', name: 'Thai' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'ms', name: 'Malay' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'bn', name: 'Bengali' },
    { code: 'uk', name: 'Ukrainian' },
    { code: 'he', name: 'Hebrew' },
    { code: 'fa', name: 'Persian' },
];

const SUBTITLE_SOURCE_OPTIONS = [
    { value: 'internal', label: 'Internal First', description: 'Prefer embedded subtitles, then external' },
    { value: 'external', label: 'External First', description: 'Prefer addon subtitles, then embedded' },
    { value: 'any', label: 'Any Available', description: 'Use first available subtitle track' },
];

// Props for the reusable content component
interface PlaybackSettingsContentProps {
    isTablet?: boolean;
}

/**
 * Reusable PlaybackSettingsContent component
 * Can be used inline (tablets) or wrapped in a screen (mobile)
 */
export const PlaybackSettingsContent: React.FC<PlaybackSettingsContentProps> = ({ isTablet = false }) => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const config = useRealtimeConfig();

    // Bottom sheet refs
    const audioLanguageSheetRef = useRef<BottomSheetModal>(null);
    const subtitleLanguageSheetRef = useRef<BottomSheetModal>(null);
    const subtitleSourceSheetRef = useRef<BottomSheetModal>(null);

    // Snap points
    const languageSnapPoints = useMemo(() => ['70%'], []);
    const sourceSnapPoints = useMemo(() => ['45%'], []);

    // Handlers to present sheets - ensure only one is open at a time
    const openAudioLanguageSheet = useCallback(() => {
        subtitleLanguageSheetRef.current?.dismiss();
        subtitleSourceSheetRef.current?.dismiss();
        setTimeout(() => audioLanguageSheetRef.current?.present(), 100);
    }, []);

    const openSubtitleLanguageSheet = useCallback(() => {
        audioLanguageSheetRef.current?.dismiss();
        subtitleSourceSheetRef.current?.dismiss();
        setTimeout(() => subtitleLanguageSheetRef.current?.present(), 100);
    }, []);

    const openSubtitleSourceSheet = useCallback(() => {
        audioLanguageSheetRef.current?.dismiss();
        subtitleLanguageSheetRef.current?.dismiss();
        setTimeout(() => subtitleSourceSheetRef.current?.present(), 100);
    }, []);

    const isItemVisible = (itemId: string) => {
        if (!config?.items) return true;
        const item = config.items[itemId];
        if (item && item.visible === false) return false;
        return true;
    };

    const hasVisibleItems = (itemIds: string[]) => {
        return itemIds.some(id => isItemVisible(id));
    };

    const getLanguageName = (code: string) => {
        const lang = AVAILABLE_LANGUAGES.find(l => l.code === code);
        return lang ? lang.name : code.toUpperCase();
    };

    const getSourceLabel = (value: string) => {
        const option = SUBTITLE_SOURCE_OPTIONS.find(o => o.value === value);
        return option ? option.label : 'Internal First';
    };

    // Render backdrop for bottom sheets
    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
            />
        ),
        []
    );

    const handleSelectAudioLanguage = (code: string) => {
        updateSetting('preferredAudioLanguage', code);
        audioLanguageSheetRef.current?.dismiss();
    };

    const handleSelectSubtitleLanguage = (code: string) => {
        updateSetting('preferredSubtitleLanguage', code);
        subtitleLanguageSheetRef.current?.dismiss();
    };

    const handleSelectSubtitleSource = (value: 'internal' | 'external' | 'any') => {
        updateSetting('subtitleSourcePreference', value);
        subtitleSourceSheetRef.current?.dismiss();
    };

    return (
        <>
            {hasVisibleItems(['video_player']) && (
                <SettingsCard title="VIDEO PLAYER" isTablet={isTablet}>
                    {isItemVisible('video_player') && (
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
                            isTablet={isTablet}
                        />
                    )}
                </SettingsCard>
            )}

            {/* Audio & Subtitle Preferences */}
            <SettingsCard title="AUDIO & SUBTITLES" isTablet={isTablet}>
                <SettingItem
                    title="Preferred Audio Language"
                    description={getLanguageName(settings?.preferredAudioLanguage || 'en')}
                    icon="volume-2"
                    renderControl={() => <ChevronRight />}
                    onPress={openAudioLanguageSheet}
                    isTablet={isTablet}
                />
                <SettingItem
                    title="Preferred Subtitle Language"
                    description={getLanguageName(settings?.preferredSubtitleLanguage || 'en')}
                    icon="type"
                    renderControl={() => <ChevronRight />}
                    onPress={openSubtitleLanguageSheet}
                    isTablet={isTablet}
                />
                <SettingItem
                    title="Subtitle Source Priority"
                    description={getSourceLabel(settings?.subtitleSourcePreference || 'internal')}
                    icon="layers"
                    renderControl={() => <ChevronRight />}
                    onPress={openSubtitleSourceSheet}
                    isTablet={isTablet}
                />
                <SettingItem
                    title="Auto-Select Subtitles"
                    description="Automatically select subtitles matching your preferences"
                    icon="zap"
                    renderControl={() => (
                        <CustomSwitch
                            value={settings?.enableSubtitleAutoSelect ?? true}
                            onValueChange={(value) => updateSetting('enableSubtitleAutoSelect', value)}
                        />
                    )}
                    isLast
                    isTablet={isTablet}
                />
            </SettingsCard>

            {hasVisibleItems(['show_trailers', 'enable_downloads']) && (
                <SettingsCard title="MEDIA" isTablet={isTablet}>
                    {isItemVisible('show_trailers') && (
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
                            isTablet={isTablet}
                        />
                    )}
                    {isItemVisible('enable_downloads') && (
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
                            isTablet={isTablet}
                        />
                    )}
                </SettingsCard>
            )}

            {hasVisibleItems(['notifications']) && (
                <SettingsCard title="NOTIFICATIONS" isTablet={isTablet}>
                    {isItemVisible('notifications') && (
                        <SettingItem
                            title="Notifications"
                            description="Episode reminders"
                            icon="bell"
                            renderControl={() => <ChevronRight />}
                            onPress={() => navigation.navigate('NotificationSettings')}
                            isLast
                            isTablet={isTablet}
                        />
                    )}
                </SettingsCard>
            )}

            {/* Audio Language Bottom Sheet */}
            <BottomSheetModal
                ref={audioLanguageSheetRef}
                index={0}
                snapPoints={languageSnapPoints}
                enableDynamicSizing={false}
                enablePanDownToClose={true}
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: '#1a1a1a' }}
                handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
            >
                <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Preferred Audio Language</Text>
                </View>
                <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
                    {AVAILABLE_LANGUAGES.map((lang) => {
                        const isSelected = lang.code === (settings?.preferredAudioLanguage || 'en');
                        return (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.languageItem,
                                    isSelected && { backgroundColor: currentTheme.colors.primary + '20' }
                                ]}
                                onPress={() => handleSelectAudioLanguage(lang.code)}
                            >
                                <Text style={[styles.languageName, { color: isSelected ? currentTheme.colors.primary : '#fff' }]}>
                                    {lang.name}
                                </Text>
                                <Text style={styles.languageCode}>
                                    {lang.code.toUpperCase()}
                                </Text>
                                {isSelected && (
                                    <MaterialIcons name="check" size={20} color={currentTheme.colors.primary} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </BottomSheetScrollView>
            </BottomSheetModal>

            {/* Subtitle Language Bottom Sheet */}
            <BottomSheetModal
                ref={subtitleLanguageSheetRef}
                index={0}
                snapPoints={languageSnapPoints}
                enableDynamicSizing={false}
                enablePanDownToClose={true}
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: '#1a1a1a' }}
                handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
            >
                <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Preferred Subtitle Language</Text>
                </View>
                <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
                    {AVAILABLE_LANGUAGES.map((lang) => {
                        const isSelected = lang.code === (settings?.preferredSubtitleLanguage || 'en');
                        return (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.languageItem,
                                    isSelected && { backgroundColor: currentTheme.colors.primary + '20' }
                                ]}
                                onPress={() => handleSelectSubtitleLanguage(lang.code)}
                            >
                                <Text style={[styles.languageName, { color: isSelected ? currentTheme.colors.primary : '#fff' }]}>
                                    {lang.name}
                                </Text>
                                <Text style={styles.languageCode}>
                                    {lang.code.toUpperCase()}
                                </Text>
                                {isSelected && (
                                    <MaterialIcons name="check" size={20} color={currentTheme.colors.primary} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </BottomSheetScrollView>
            </BottomSheetModal>

            {/* Subtitle Source Priority Bottom Sheet */}
            <BottomSheetModal
                ref={subtitleSourceSheetRef}
                index={0}
                snapPoints={sourceSnapPoints}
                enableDynamicSizing={false}
                enablePanDownToClose={true}
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: '#1a1a1a' }}
                handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
            >
                <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Subtitle Source Priority</Text>
                </View>
                <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
                    {SUBTITLE_SOURCE_OPTIONS.map((option) => {
                        const isSelected = option.value === (settings?.subtitleSourcePreference || 'internal');
                        return (
                            <TouchableOpacity
                                key={option.value}
                                style={[
                                    styles.sourceItem,
                                    isSelected && { backgroundColor: currentTheme.colors.primary + '20', borderColor: currentTheme.colors.primary }
                                ]}
                                onPress={() => handleSelectSubtitleSource(option.value as 'internal' | 'external' | 'any')}
                            >
                                <View style={styles.sourceItemContent}>
                                    <Text style={[styles.sourceLabel, { color: isSelected ? currentTheme.colors.primary : '#fff' }]}>
                                        {option.label}
                                    </Text>
                                    <Text style={styles.sourceDescription}>
                                        {option.description}
                                    </Text>
                                </View>
                                {isSelected && (
                                    <MaterialIcons name="check" size={20} color={currentTheme.colors.primary} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </BottomSheetScrollView>
            </BottomSheetModal>
        </>
    );
};

/**
 * PlaybackSettingsScreen - Wrapper for mobile navigation
 * Uses PlaybackSettingsContent internally
 */
const PlaybackSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();
    const screenIsTablet = width >= 768;

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Playback" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                <PlaybackSettingsContent isTablet={screenIsTablet} />
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
    sheetHeader: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        marginBottom: 8,
    },
    sheetTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    sheetContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 24,
    },
    languageItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginVertical: 2,
    },
    languageName: {
        flex: 1,
        fontSize: 16,
        fontWeight: '500',
    },
    languageCode: {
        fontSize: 12,
        marginRight: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    sourceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginVertical: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    sourceItemContent: {
        flex: 1,
    },
    sourceLabel: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    sourceDescription: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
});

export default PlaybackSettingsScreen;
