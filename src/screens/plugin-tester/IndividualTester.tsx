import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { pluginService } from '../../services/pluginService';
import axios from 'axios';
import { getPluginTesterStyles, useIsLargeScreen } from './styles';
import { Header, MainTabBar } from './components';

interface IndividualTesterProps {
    onSwitchTab: (tab: 'individual' | 'repo') => void;
}

export const IndividualTester = ({ onSwitchTab }: IndividualTesterProps) => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { currentTheme } = useTheme();
    const isLargeScreen = useIsLargeScreen();
    const styles = getPluginTesterStyles(currentTheme, isLargeScreen);

    // State
    const [code, setCode] = useState('');
    const [url, setUrl] = useState('');
    const [tmdbId, setTmdbId] = useState('550'); // Fight Club default
    const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
    const [season, setSeason] = useState('1');
    const [episode, setEpisode] = useState('1');
    const [logs, setLogs] = useState<string[]>([]);
    const [streams, setStreams] = useState<any[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [activeTab, setActiveTab] = useState<'code' | 'logs' | 'results'>('code');
    const [isEditorFocused, setIsEditorFocused] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [matches, setMatches] = useState<Array<{ start: number; end: number }>>([]);
    const focusedEditorScrollRef = useRef<ScrollView | null>(null);

    const CODE_LINE_HEIGHT = 18;
    const CODE_PADDING_V = 12;
    const MIN_EDITOR_HEIGHT = 240;

    const logsScrollRef = useRef<ScrollView | null>(null);
    const codeInputRefFocused = useRef<TextInput | null>(null);

    // Calculate matches when code or search query changes
    React.useEffect(() => {
        if (!searchQuery.trim()) {
            setMatches([]);
            setCurrentMatchIndex(0);
            return;
        }

        const query = searchQuery.toLowerCase();
        const codeToSearch = code.toLowerCase();
        const foundMatches: Array<{ start: number; end: number }> = [];
        let index = 0;

        while ((index = codeToSearch.indexOf(query, index)) !== -1) {
            foundMatches.push({ start: index, end: index + query.length });
            index += 1;
        }

        setMatches(foundMatches);
        setCurrentMatchIndex(0);
    }, [searchQuery, code]);

    const jumpToMatch = (matchIndex: number) => {
        if (!isEditorFocused) return;
        if (!searchQuery.trim()) return;
        if (matches.length === 0) return;

        const safeIndex = Math.min(Math.max(matchIndex, 0), matches.length - 1);
        const match = matches[safeIndex];

        requestAnimationFrame(() => {
            // Scroll the ScrollView so the highlighted match becomes visible.
            const before = code.slice(0, match.start);
            const lineIndex = before.split('\n').length - 1;
            const y = Math.max(0, (lineIndex - 2) * CODE_LINE_HEIGHT);
            focusedEditorScrollRef.current?.scrollTo({ y, animated: true });
        });
    };

    const getEditorHeight = () => {
        const lineCount = Math.max(1, code.split('\n').length);
        const contentHeight = lineCount * CODE_LINE_HEIGHT + CODE_PADDING_V * 2;
        return Math.max(MIN_EDITOR_HEIGHT, contentHeight);
    };

    const renderHighlightedCode = () => {
        if (!searchQuery.trim() || matches.length === 0) {
            return <Text style={styles.highlightText}>{code || ' '}</Text>;
        }

        const safeIndex = Math.min(Math.max(currentMatchIndex, 0), matches.length - 1);
        const match = matches[safeIndex];
        const start = Math.max(0, Math.min(match.start, code.length));
        const end = Math.max(start, Math.min(match.end, code.length));

        return (
            <Text style={styles.highlightText}>
                {code.slice(0, start)}
                <Text style={styles.highlightActive}>{code.slice(start, end) || ' '}</Text>
                {code.slice(end) || ' '}
            </Text>
        );
    };

    const fetchFromUrl = async () => {
        if (!url) {
            Alert.alert('Error', 'Please enter a URL');
            return;
        }

        try {
            const response = await axios.get(url, { headers: { 'Cache-Control': 'no-cache' } });
            const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
            setCode(content);
            Alert.alert('Success', 'Code loaded from URL');
        } catch (error: any) {
            Alert.alert('Error', `Failed to fetch: ${error.message}`);
        }
    };

    const runTest = async () => {
        if (!code.trim()) {
            Alert.alert('Error', 'No code to run');
            return;
        }

        setIsRunning(true);
        setLogs([]);
        setStreams([]);
        setActiveTab('logs');

        try {
            const params = {
                tmdbId,
                mediaType,
                season: mediaType === 'tv' ? parseInt(season) || 1 : undefined,
                episode: mediaType === 'tv' ? parseInt(episode) || 1 : undefined,
            };

            const result = await pluginService.testPlugin(code, params, {
                onLog: (line) => {
                    setLogs(prev => [...prev, line]);
                },
            });

            // Logs were already appended in real-time via onLog
            setStreams(result.streams);

            if (result.streams.length > 0) {
                setActiveTab('results');
            }
        } catch (error: any) {
            setLogs(prev => [...prev, `[FATAL] ${error.message}`]);
        } finally {
            setIsRunning(false);
        }
    };

    const renderCodeTab = () => {
        // On large screens, show code + logs/results side by side
        if (isLargeScreen) {
            return (
                <View style={styles.largeScreenWrapper}>
                    <View style={styles.twoColumnContainer}>
                        <View style={styles.leftColumn}>
                            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
                                <View style={styles.card}>
                                    <View style={styles.cardTitleRow}>
                                        <Text style={styles.cardTitle}>Load from URL</Text>
                                        <Ionicons name="link-outline" size={18} color={currentTheme.colors.mediumEmphasis} />
                                    </View>
                                    <Text style={styles.helperText}>
                                        Paste a raw GitHub URL or local IP and tap download.
                                    </Text>
                                    <View style={[styles.row, { marginTop: 10 }]}>
                                        <TextInput
                                            style={[styles.input, { flex: 1 }]}
                                            value={url}
                                            onChangeText={setUrl}
                                            placeholder="http://192.168.1.5:8000/provider.js"
                                            placeholderTextColor={currentTheme.colors.mediumEmphasis}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                        <TouchableOpacity
                                            style={[styles.button, styles.secondaryButton, { paddingHorizontal: 12, minHeight: 48 }]}
                                            onPress={fetchFromUrl}
                                        >
                                            <Ionicons name="download-outline" size={20} color={currentTheme.colors.white} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={[styles.card, { flex: 1, minHeight: 400 }]}>
                                    <View style={styles.cardTitleRow}>
                                        <Text style={styles.cardTitle}>Plugin Code</Text>
                                        <View style={styles.cardActionsRow}>
                                            <TouchableOpacity
                                                style={styles.cardActionButton}
                                                onPress={() => setIsEditorFocused(true)}
                                                accessibilityLabel="Focus code editor"
                                            >
                                                <Ionicons name="expand-outline" size={18} color={currentTheme.colors.highEmphasis} />
                                            </TouchableOpacity>
                                            <Ionicons name="code-slash-outline" size={18} color={currentTheme.colors.mediumEmphasis} />
                                        </View>
                                    </View>
                                    <TextInput
                                        style={[styles.codeInput, { minHeight: 350 }]}
                                        value={code}
                                        onChangeText={setCode}
                                        multiline
                                        placeholder="// Paste plugin code here..."
                                        placeholderTextColor={currentTheme.colors.mediumEmphasis}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </View>

                                {/* Test parameters on large screen */}
                                <View style={styles.card}>
                                    <View style={styles.cardTitleRow}>
                                        <Text style={styles.cardTitle}>Test Parameters</Text>
                                        <Ionicons name="options-outline" size={16} color={currentTheme.colors.mediumEmphasis} />
                                    </View>

                                    <View style={styles.segment}>
                                        <TouchableOpacity
                                            style={[styles.segmentItem, mediaType === 'movie' && styles.segmentItemActive]}
                                            onPress={() => setMediaType('movie')}
                                        >
                                            <Ionicons name="film-outline" size={18} color={mediaType === 'movie' ? currentTheme.colors.primary : currentTheme.colors.highEmphasis} />
                                            <Text style={[styles.segmentText, mediaType === 'movie' && styles.segmentTextActive]}>Movie</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.segmentItem, mediaType === 'tv' && styles.segmentItemActive]}
                                            onPress={() => setMediaType('tv')}
                                        >
                                            <Ionicons name="tv-outline" size={18} color={mediaType === 'tv' ? currentTheme.colors.primary : currentTheme.colors.highEmphasis} />
                                            <Text style={[styles.segmentText, mediaType === 'tv' && styles.segmentTextActive]}>TV</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={[styles.row, { marginTop: 10, alignItems: 'flex-start' }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.fieldLabel}>TMDB ID</Text>
                                            <TextInput
                                                style={styles.input}
                                                value={tmdbId}
                                                onChangeText={setTmdbId}
                                                keyboardType="numeric"
                                            />
                                        </View>

                                        {mediaType === 'tv' && (
                                            <>
                                                <View style={{ width: 110 }}>
                                                    <Text style={styles.fieldLabel}>Season</Text>
                                                    <TextInput
                                                        style={styles.input}
                                                        value={season}
                                                        onChangeText={setSeason}
                                                        keyboardType="numeric"
                                                    />
                                                </View>
                                                <View style={{ width: 110 }}>
                                                    <Text style={styles.fieldLabel}>Episode</Text>
                                                    <TextInput
                                                        style={styles.input}
                                                        value={episode}
                                                        onChangeText={setEpisode}
                                                        keyboardType="numeric"
                                                    />
                                                </View>
                                            </>
                                        )}
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.button, { marginTop: 12, opacity: isRunning ? 0.85 : 1 }]}
                                        onPress={runTest}
                                        disabled={isRunning}
                                    >
                                        {isRunning ? (
                                            <ActivityIndicator color={currentTheme.colors.white} />
                                        ) : (
                                            <Ionicons name="play" size={20} color={currentTheme.colors.white} />
                                        )}
                                        <Text style={styles.buttonText}>{isRunning ? 'Running…' : 'Run Test'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </View>

                        <View style={styles.rightColumn}>
                            {/* Right side: Logs and Results */}
                            <View style={[styles.content, { flex: 1 }]}>
                                <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
                                    <TouchableOpacity
                                        style={[
                                            styles.tab,
                                            activeTab === 'logs' && styles.activeTab,
                                            { paddingVertical: 8, borderWidth: 1, borderColor: currentTheme.colors.elevation3, borderRadius: 8, flex: 1 }
                                        ]}
                                        onPress={() => setActiveTab('logs')}
                                    >
                                        <Text style={[styles.tabText, activeTab === 'logs' && styles.activeTabText]}>Logs</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.tab,
                                            activeTab === 'results' && styles.activeTab,
                                            { paddingVertical: 8, borderWidth: 1, borderColor: currentTheme.colors.elevation3, borderRadius: 8, flex: 1 }
                                        ]}
                                        onPress={() => setActiveTab('results')}
                                    >
                                        <Text style={[styles.tabText, activeTab === 'results' && styles.activeTabText]}>Results ({streams.length})</Text>
                                    </TouchableOpacity>
                                </View>

                                {activeTab === 'logs' || activeTab === 'code' ? (
                                    <ScrollView
                                        ref={(r) => (logsScrollRef.current = r)}
                                        style={[styles.logContainer, { flex: 1, minHeight: 400 }]}
                                        contentContainerStyle={{ paddingBottom: 20 }}
                                        onContentSizeChange={() => {
                                            logsScrollRef.current?.scrollToEnd({ animated: true });
                                        }}
                                    >
                                        {logs.length === 0 ? (
                                            <View style={styles.emptyState}>
                                                <Ionicons name="terminal-outline" size={48} color={currentTheme.colors.mediumGray} />
                                                <Text style={styles.emptyText}>No logs yet. Run a test to see output.</Text>
                                            </View>
                                        ) : (
                                            logs.map((log, i) => {
                                                let style = styles.logItem;
                                                if (log.includes('[ERROR]') || log.includes('[FATAL')) style = { ...style, ...styles.logError };
                                                else if (log.includes('[WARN]')) style = { ...style, ...styles.logWarn };
                                                else if (log.includes('[INFO]')) style = { ...style, ...styles.logInfo };
                                                else if (log.includes('[DEBUG]')) style = { ...style, ...styles.logDebug };

                                                return (
                                                    <Text key={i} style={style}>
                                                        {log}
                                                    </Text>
                                                );
                                            })
                                        )}
                                    </ScrollView>
                                ) : (
                                    <ScrollView style={{ flex: 1, minHeight: 400 }} contentContainerStyle={{ paddingBottom: 20 }}>
                                        {streams.length === 0 ? (
                                            <View style={styles.emptyState}>
                                                <Ionicons name="list-outline" size={48} color={currentTheme.colors.mediumGray} />
                                                <Text style={styles.emptyText}>No streams found yet.</Text>
                                            </View>
                                        ) : (
                                            streams.map((stream, i) => (
                                                <View key={i} style={styles.resultItem}>
                                                    <Text style={styles.resultTitle}>{stream.title || stream.name}</Text>
                                                    <Text style={styles.resultMeta}>Quality: {stream.quality || 'Unknown'}</Text>
                                                    <Text style={styles.resultMeta}>Size: {stream.description || 'Unknown'}</Text>
                                                    <Text style={styles.resultUrl} numberOfLines={2}>URL: {stream.url}</Text>
                                                </View>
                                            ))
                                        )}
                                    </ScrollView>
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            );
        }

        // Original mobile layout
        return (
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
            >
                <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
                    <View style={styles.card}>
                        <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle}>Load from URL</Text>
                            <Ionicons name="link-outline" size={18} color={currentTheme.colors.mediumEmphasis} />
                        </View>
                        <Text style={styles.helperText}>
                            Paste a raw GitHub URL or local IP and tap download.
                        </Text>
                        <View style={[styles.row, { marginTop: 10 }]}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                value={url}
                                onChangeText={setUrl}
                                placeholder="http://192.168.1.5:8000/provider.js"
                                placeholderTextColor={currentTheme.colors.mediumEmphasis}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TouchableOpacity
                                style={[styles.button, styles.secondaryButton, { paddingHorizontal: 12, minHeight: 48 }]}
                                onPress={fetchFromUrl}
                            >
                                <Ionicons name="download-outline" size={20} color={currentTheme.colors.white} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardTitleRow}>
                            <Text style={styles.cardTitle}>Plugin Code</Text>
                            <View style={styles.cardActionsRow}>
                                <TouchableOpacity
                                    style={styles.cardActionButton}
                                    onPress={() => setIsEditorFocused(true)}
                                    accessibilityLabel="Focus code editor"
                                >
                                    <Ionicons name="expand-outline" size={18} color={currentTheme.colors.highEmphasis} />
                                </TouchableOpacity>
                                <Ionicons name="code-slash-outline" size={18} color={currentTheme.colors.mediumEmphasis} />
                            </View>
                        </View>
                        <TextInput
                            style={styles.codeInput}
                            value={code}
                            onChangeText={setCode}
                            multiline
                            placeholder="// Paste plugin code here..."
                            placeholderTextColor={currentTheme.colors.mediumEmphasis}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                </ScrollView>

                <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                    <View style={styles.footerCard}>
                        <View style={styles.footerTitleRow}>
                            <Text style={styles.footerTitle}>Test Parameters</Text>
                            <Ionicons name="options-outline" size={16} color={currentTheme.colors.mediumEmphasis} />
                        </View>

                        <View style={styles.segment}>
                            <TouchableOpacity
                                style={[styles.segmentItem, mediaType === 'movie' && styles.segmentItemActive]}
                                onPress={() => setMediaType('movie')}
                            >
                                <Ionicons name="film-outline" size={18} color={mediaType === 'movie' ? currentTheme.colors.primary : currentTheme.colors.highEmphasis} />
                                <Text style={[styles.segmentText, mediaType === 'movie' && styles.segmentTextActive]}>Movie</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.segmentItem, mediaType === 'tv' && styles.segmentItemActive]}
                                onPress={() => setMediaType('tv')}
                            >
                                <Ionicons name="tv-outline" size={18} color={mediaType === 'tv' ? currentTheme.colors.primary : currentTheme.colors.highEmphasis} />
                                <Text style={[styles.segmentText, mediaType === 'tv' && styles.segmentTextActive]}>TV</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.row, { marginTop: 10, alignItems: 'flex-start' }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.fieldLabel}>TMDB ID</Text>
                                <TextInput
                                    style={styles.input}
                                    value={tmdbId}
                                    onChangeText={setTmdbId}
                                    keyboardType="numeric"
                                />
                            </View>

                            {mediaType === 'tv' && (
                                <>
                                    <View style={{ width: 110 }}>
                                        <Text style={styles.fieldLabel}>Season</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={season}
                                            onChangeText={setSeason}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                    <View style={{ width: 110 }}>
                                        <Text style={styles.fieldLabel}>Episode</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={episode}
                                            onChangeText={setEpisode}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.button, { opacity: isRunning ? 0.85 : 1 }]}
                        onPress={runTest}
                        disabled={isRunning}
                    >
                        {isRunning ? (
                            <ActivityIndicator color={currentTheme.colors.white} />
                        ) : (
                            <Ionicons name="play" size={20} color={currentTheme.colors.white} />
                        )}
                        <Text style={styles.buttonText}>{isRunning ? 'Running…' : 'Run Test'}</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        );
    };

    const renderLogsTab = () => (
        <ScrollView
            ref={(r) => (logsScrollRef.current = r)}
            style={styles.content}
            onContentSizeChange={() => {
                if (activeTab === 'logs') {
                    logsScrollRef.current?.scrollToEnd({ animated: true });
                }
            }}
        >
            {logs.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="terminal-outline" size={48} color={currentTheme.colors.mediumGray} />
                    <Text style={styles.emptyText}>No logs yet. Run a test to see output.</Text>
                </View>
            ) : (
                <View style={styles.logContainer}>
                    {logs.map((log, i) => {
                        let style = styles.logItem;
                        if (log.includes('[ERROR]') || log.includes('[FATAL')) style = { ...style, ...styles.logError };
                        else if (log.includes('[WARN]')) style = { ...style, ...styles.logWarn };
                        else if (log.includes('[INFO]')) style = { ...style, ...styles.logInfo };
                        else if (log.includes('[DEBUG]')) style = { ...style, ...styles.logDebug };

                        return (
                            <Text key={i} style={style}>
                                {log}
                            </Text>
                        );
                    })}
                </View>
            )}
        </ScrollView>
    );

    const renderResultsTab = () => (
        <ScrollView style={styles.content}>
            {streams.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="list-outline" size={48} color={currentTheme.colors.mediumGray} />
                    <Text style={styles.emptyText}>No streams found yet.</Text>
                </View>
            ) : (
                streams.map((stream, i) => (
                    <View key={i} style={styles.resultItem}>
                        <Text style={styles.resultTitle}>{stream.title || stream.name}</Text>
                        <Text style={styles.resultMeta}>Quality: {stream.quality || 'Unknown'}</Text>
                        <Text style={styles.resultMeta}>Size: {stream.description || 'Unknown'}</Text>
                        <Text style={styles.resultUrl} numberOfLines={2}>URL: {stream.url}</Text>

                        <Text
                            style={[
                                styles.logItem,
                                {
                                    marginTop: 10,
                                    marginBottom: 0,
                                    color: currentTheme.colors.highEmphasis,
                                },
                            ]}
                            selectable
                        >
                            {(() => {
                                try {
                                    return JSON.stringify(stream, null, 2);
                                } catch {
                                    return String(stream);
                                }
                            })()}
                        </Text>
                    </View>
                ))
            )}
        </ScrollView>
    );

    const renderFocusedEditor = () => (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
            <View style={styles.findToolbar}>
                <TextInput
                    style={styles.findInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={() => jumpToMatch(currentMatchIndex)}
                    placeholder="Find in code…"
                    placeholderTextColor={currentTheme.colors.mediumEmphasis}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <Text style={styles.findCounter}>
                    {matches.length === 0 ? '–' : `${currentMatchIndex + 1}/${matches.length}`}
                </Text>
                <TouchableOpacity
                    style={[styles.findButton, matches.length > 0 && styles.findButtonActive]}
                    onPress={() => {
                        if (matches.length === 0) return;
                        const nextIndex = currentMatchIndex === 0 ? matches.length - 1 : currentMatchIndex - 1;
                        setCurrentMatchIndex(nextIndex);
                        jumpToMatch(nextIndex);
                    }}
                    disabled={matches.length === 0}
                >
                    <Ionicons
                        name="chevron-up"
                        size={18}
                        color={matches.length > 0 ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.findButton, matches.length > 0 && styles.findButtonActive]}
                    onPress={() => {
                        if (matches.length === 0) return;
                        const nextIndex = currentMatchIndex === matches.length - 1 ? 0 : currentMatchIndex + 1;
                        setCurrentMatchIndex(nextIndex);
                        jumpToMatch(nextIndex);
                    }}
                    disabled={matches.length === 0}
                >
                    <Ionicons
                        name="chevron-down"
                        size={18}
                        color={matches.length > 0 ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.findButton}
                    onPress={() => {
                        setSearchQuery('');
                        setMatches([]);
                        setCurrentMatchIndex(0);
                    }}
                >
                    <Ionicons name="close" size={18} color={currentTheme.colors.mediumEmphasis} />
                </TouchableOpacity>
            </View>

            <ScrollView
                ref={(r) => (focusedEditorScrollRef.current = r)}
                style={styles.content}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
            >
                <View style={[styles.focusedEditorShell, { height: getEditorHeight() }]}>
                    <View style={styles.highlightLayer} pointerEvents="none">
                        {renderHighlightedCode()}
                    </View>

                    <TextInput
                        ref={codeInputRefFocused}
                        style={[styles.codeInputTransparent, styles.codeInputFocused]}
                        value={code}
                        onChangeText={setCode}
                        multiline
                        scrollEnabled={false}
                        autoFocus
                        selectionColor={currentTheme.colors.primary}
                        placeholder="// Paste plugin code here..."
                        placeholderTextColor={currentTheme.colors.mediumEmphasis}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {isEditorFocused ? (
                <>
                    <Header
                        title="Edit Code"
                        backIcon="close"
                        onBack={() => setIsEditorFocused(false)}
                        rightElement={
                            <TouchableOpacity style={styles.headerRightButton} onPress={() => {
                                setIsEditorFocused(false);
                                setSearchQuery('');
                                setMatches([]);
                                setCurrentMatchIndex(0);
                            }}>
                                <Text style={styles.headerRightButtonText}>Done</Text>
                            </TouchableOpacity>
                        }
                    />
                    {renderFocusedEditor()}
                </>
            ) : (
                <>
                    <Header
                        title="Plugin Tester"
                        subtitle="Run scrapers and inspect logs in real-time"
                        onBack={() => navigation.goBack()}
                    />
                    <MainTabBar activeTab="individual" onTabChange={onSwitchTab} />

                    <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: 12, gap: 8 }}>
                        <TouchableOpacity
                            style={[
                                styles.tab,
                                activeTab === 'code' && styles.activeTab,
                                { paddingVertical: 8, borderWidth: 1, borderColor: currentTheme.colors.elevation3, borderRadius: 8, flex: 1 }
                            ]}
                            onPress={() => setActiveTab('code')}
                        >
                            <Text style={[styles.tabText, activeTab === 'code' && styles.activeTabText]}>Code</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.tab,
                                activeTab === 'logs' && styles.activeTab,
                                { paddingVertical: 8, borderWidth: 1, borderColor: currentTheme.colors.elevation3, borderRadius: 8, flex: 1 }
                            ]}
                            onPress={() => setActiveTab('logs')}
                        >
                            <Text style={[styles.tabText, activeTab === 'logs' && styles.activeTabText]}>Logs</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.tab,
                                activeTab === 'results' && styles.activeTab,
                                { paddingVertical: 8, borderWidth: 1, borderColor: currentTheme.colors.elevation3, borderRadius: 8, flex: 1 }
                            ]}
                            onPress={() => setActiveTab('results')}
                        >
                            <Text style={[styles.tabText, activeTab === 'results' && styles.activeTabText]}>Results</Text>
                        </TouchableOpacity>
                    </View>

                    {activeTab === 'code' && renderCodeTab()}
                    {activeTab === 'logs' && renderLogsTab()}
                    {activeTab === 'results' && renderResultsTab()}
                </>
            )}
        </View>
    );
};
