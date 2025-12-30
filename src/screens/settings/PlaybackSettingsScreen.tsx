import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, StatusBar, Platform, Text, TouchableOpacity, Modal, FlatList } from 'react-native';
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

interface LanguagePickerModalProps {
    visible: boolean;
    onClose: () => void;
    selectedLanguage: string;
    onSelectLanguage: (code: string) => void;
    title: string;
}

const LanguagePickerModal: React.FC<LanguagePickerModalProps> = ({
    visible,
    onClose,
    selectedLanguage,
    onSelectLanguage,
    title,
}) => {
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();

    const renderItem = ({ item }: { item: { code: string; name: string } }) => {
        const isSelected = item.code === selectedLanguage;
        return (
            <TouchableOpacity
                style={[
                    styles.languageItem,
                    isSelected && { backgroundColor: currentTheme.colors.primary + '20' }
                ]}
                onPress={() => {
                    onSelectLanguage(item.code);
                    onClose();
                }}
            >
                <Text style={[styles.languageName, { color: isSelected ? currentTheme.colors.primary : '#fff' }]}>
                    {item.name}
                </Text>
                <Text style={[styles.languageCode, { color: 'rgba(255,255,255,0.5)' }]}>
                    {item.code.toUpperCase()}
                </Text>
                {isSelected && (
                    <MaterialIcons name="check" size={20} color={currentTheme.colors.primary} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: '#1a1a1a', paddingBottom: insets.bottom }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{title}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <MaterialIcons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <FlatList
                        data={AVAILABLE_LANGUAGES}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.code}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.languageList}
                    />
                </View>
            </View>
        </Modal>
    );
};

interface SubtitleSourceModalProps {
    visible: boolean;
    onClose: () => void;
    selectedSource: string;
    onSelectSource: (value: 'internal' | 'external' | 'any') => void;
}

const SubtitleSourceModal: React.FC<SubtitleSourceModalProps> = ({
    visible,
    onClose,
    selectedSource,
    onSelectSource,
}) => {
    const { currentTheme } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: '#1a1a1a', paddingBottom: insets.bottom, maxHeight: 400 }]}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Subtitle Source Priority</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <MaterialIcons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.languageList}>
                        {SUBTITLE_SOURCE_OPTIONS.map((option) => {
                            const isSelected = option.value === selectedSource;
                            return (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[
                                        styles.sourceItem,
                                        isSelected && { backgroundColor: currentTheme.colors.primary + '20', borderColor: currentTheme.colors.primary }
                                    ]}
                                    onPress={() => {
                                        onSelectSource(option.value as 'internal' | 'external' | 'any');
                                        onClose();
                                    }}
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
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const PlaybackSettingsScreen: React.FC = () => {
    const navigation = useNavigation<NavigationProp<RootStackParamList>>();
    const { currentTheme } = useTheme();
    const { settings, updateSetting } = useSettings();
    const insets = useSafeAreaInsets();
    const config = useRealtimeConfig();

    // Modal states
    const [showAudioLanguageModal, setShowAudioLanguageModal] = useState(false);
    const [showSubtitleLanguageModal, setShowSubtitleLanguageModal] = useState(false);
    const [showSubtitleSourceModal, setShowSubtitleSourceModal] = useState(false);

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

    return (
        <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
            <StatusBar barStyle="light-content" />
            <ScreenHeader title="Playback" showBackButton onBackPress={() => navigation.goBack()} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                {hasVisibleItems(['video_player']) && (
                    <SettingsCard title="VIDEO PLAYER">
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
                            />
                        )}
                    </SettingsCard>
                )}

                {/* Audio & Subtitle Preferences */}
                <SettingsCard title="AUDIO & SUBTITLES">
                    <SettingItem
                        title="Preferred Audio Language"
                        description={getLanguageName(settings?.preferredAudioLanguage || 'en')}
                        icon="volume-2"
                        renderControl={() => <ChevronRight />}
                        onPress={() => setShowAudioLanguageModal(true)}
                    />
                    <SettingItem
                        title="Preferred Subtitle Language"
                        description={getLanguageName(settings?.preferredSubtitleLanguage || 'en')}
                        icon="type"
                        renderControl={() => <ChevronRight />}
                        onPress={() => setShowSubtitleLanguageModal(true)}
                    />
                    <SettingItem
                        title="Subtitle Source Priority"
                        description={getSourceLabel(settings?.subtitleSourcePreference || 'internal')}
                        icon="layers"
                        renderControl={() => <ChevronRight />}
                        onPress={() => setShowSubtitleSourceModal(true)}
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
                    />
                </SettingsCard>

                {hasVisibleItems(['show_trailers', 'enable_downloads']) && (
                    <SettingsCard title="MEDIA">
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
                            />
                        )}
                    </SettingsCard>
                )}

                {hasVisibleItems(['notifications']) && (
                    <SettingsCard title="NOTIFICATIONS">
                        {isItemVisible('notifications') && (
                            <SettingItem
                                title="Notifications"
                                description="Episode reminders"
                                icon="bell"
                                renderControl={() => <ChevronRight />}
                                onPress={() => navigation.navigate('NotificationSettings')}
                                isLast
                            />
                        )}
                    </SettingsCard>
                )}
            </ScrollView>

            {/* Language Picker Modals */}
            <LanguagePickerModal
                visible={showAudioLanguageModal}
                onClose={() => setShowAudioLanguageModal(false)}
                selectedLanguage={settings?.preferredAudioLanguage || 'en'}
                onSelectLanguage={(code) => updateSetting('preferredAudioLanguage', code)}
                title="Preferred Audio Language"
            />
            <LanguagePickerModal
                visible={showSubtitleLanguageModal}
                onClose={() => setShowSubtitleLanguageModal(false)}
                selectedLanguage={settings?.preferredSubtitleLanguage || 'en'}
                onSelectLanguage={(code) => updateSetting('preferredSubtitleLanguage', code)}
                title="Preferred Subtitle Language"
            />
            <SubtitleSourceModal
                visible={showSubtitleSourceModal}
                onClose={() => setShowSubtitleSourceModal(false)}
                selectedSource={settings?.subtitleSourcePreference || 'internal'}
                onSelectSource={(value) => updateSetting('subtitleSourcePreference', value)}
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    closeButton: {
        padding: 4,
    },
    languageList: {
        paddingHorizontal: 16,
        paddingBottom: 16,
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
