import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Platform,
    Alert,
    KeyboardAvoidingView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { pluginService } from '../services/pluginService';
import axios from 'axios';

const PluginTesterScreen = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { currentTheme } = useTheme();

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

    // Styles
    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: currentTheme.colors.darkBackground,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: currentTheme.colors.elevation3,
        },
        headerTitle: {
            fontSize: 20,
            fontWeight: 'bold',
            color: currentTheme.colors.text,
        },
        headerSubtitle: {
            fontSize: 12,
            color: currentTheme.colors.mediumEmphasis,
            marginTop: 2,
        },
        tabBar: {
            flexDirection: 'row',
            backgroundColor: currentTheme.colors.elevation1,
            padding: 6,
            marginHorizontal: 16,
            marginTop: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        tab: {
            flex: 1,
            paddingVertical: 10,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            flexDirection: 'row',
            gap: 6,
        },
        activeTab: {
            backgroundColor: currentTheme.colors.primary + '20',
        },
        tabText: {
            fontSize: 14,
            fontWeight: '600',
            color: currentTheme.colors.mediumEmphasis,
        },
        activeTabText: {
            color: currentTheme.colors.primary,
        },
        tabBadge: {
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: currentTheme.colors.elevation3,
        },
        tabBadgeText: {
            fontSize: 11,
            fontWeight: '700',
            color: currentTheme.colors.highEmphasis,
        },
        content: {
            flex: 1,
            paddingHorizontal: 16,
            paddingTop: 12,
        },
        card: {
            backgroundColor: currentTheme.colors.elevation2,
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
            marginBottom: 12,
        },
        cardTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
        },
        cardTitle: {
            fontSize: 15,
            fontWeight: '700',
            color: currentTheme.colors.white,
            letterSpacing: 0.2,
        },
        helperText: {
            fontSize: 12,
            color: currentTheme.colors.mediumEmphasis,
            lineHeight: 16,
        },
        input: {
            backgroundColor: currentTheme.colors.elevation1,
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 12,
            color: currentTheme.colors.white,
            fontSize: 14,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
            minHeight: 48,
        },
        codeInput: {
            backgroundColor: currentTheme.colors.elevation1,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 12,
            color: currentTheme.colors.highEmphasis,
            fontSize: 13,
            lineHeight: 18,
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
            minHeight: 240,
            textAlignVertical: 'top',
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        focusedEditorShell: {
            borderRadius: 12,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
            backgroundColor: currentTheme.colors.elevation1,
            overflow: 'hidden',
        },
        highlightLayer: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            paddingVertical: 12,
            paddingHorizontal: 12,
        },
        highlightText: {
            color: currentTheme.colors.highEmphasis,
            fontSize: 13,
            lineHeight: 18,
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        },
        highlightActive: {
            backgroundColor: '#FFD400',
            color: currentTheme.colors.black,
        },
        codeInputTransparent: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            paddingVertical: 12,
            paddingHorizontal: 12,
            color: 'transparent',
            backgroundColor: 'transparent',
            fontSize: 13,
            lineHeight: 18,
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        },
        row: {
            flexDirection: 'row',
            gap: 12,
        },
        fieldLabel: {
            fontSize: 12,
            fontWeight: '600',
            color: currentTheme.colors.mediumEmphasis,
            marginBottom: 6,
        },
        segment: {
            flexDirection: 'row',
            backgroundColor: currentTheme.colors.elevation1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
            overflow: 'hidden',
        },
        segmentItem: {
            flex: 1,
            paddingVertical: 10,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
        },
        segmentItemActive: {
            backgroundColor: currentTheme.colors.primary + '20',
        },
        segmentText: {
            fontSize: 14,
            fontWeight: '700',
            color: currentTheme.colors.highEmphasis,
        },
        segmentTextActive: {
            color: currentTheme.colors.primary,
        },
        button: {
            backgroundColor: currentTheme.colors.primary,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
        },
        buttonText: {
            color: currentTheme.colors.white,
            fontWeight: '700',
            fontSize: 15,
        },
        secondaryButton: {
            backgroundColor: currentTheme.colors.elevation1,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        secondaryButtonText: {
            color: currentTheme.colors.highEmphasis,
        },
        stickyFooter: {
            paddingHorizontal: 16,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: currentTheme.colors.elevation3,
            backgroundColor: currentTheme.colors.darkBackground,
        },
        footerCard: {
            backgroundColor: currentTheme.colors.elevation2,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
            padding: 12,
            marginBottom: 10,
        },
        footerTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
        },
        footerTitle: {
            fontSize: 13,
            fontWeight: '700',
            color: currentTheme.colors.white,
        },
        headerRightButton: {
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: currentTheme.colors.elevation2,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        headerRightButtonText: {
            fontSize: 13,
            fontWeight: '700',
            color: currentTheme.colors.highEmphasis,
        },
        codeInputFocused: {
            flex: 1,
            minHeight: 0,
        },
        cardActionsRow: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        cardActionButton: {
            padding: 6,
            marginRight: 6,
            borderRadius: 10,
            backgroundColor: currentTheme.colors.elevation1,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        findToolbar: {
            backgroundColor: currentTheme.colors.elevation2,
            borderBottomWidth: 1,
            borderBottomColor: currentTheme.colors.elevation3,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        findInput: {
            flex: 1,
            backgroundColor: currentTheme.colors.elevation1,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            color: currentTheme.colors.white,
            fontSize: 13,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        findCounter: {
            fontSize: 12,
            color: currentTheme.colors.mediumEmphasis,
            minWidth: 40,
            textAlign: 'right',
            fontWeight: '600',
        },
        findButton: {
            padding: 8,
            borderRadius: 8,
            backgroundColor: currentTheme.colors.elevation1,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        findButtonActive: {
            backgroundColor: currentTheme.colors.primary + '20',
            borderColor: currentTheme.colors.primary,
        },
        logItem: {
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
            fontSize: 12,
            marginBottom: 4,
            color: currentTheme.colors.mediumEmphasis,
        },
        logError: {
            color: currentTheme.colors.error,
        },
        logWarn: {
            color: currentTheme.colors.warning,
        },
        logInfo: {
            color: currentTheme.colors.info,
        },
        logDebug: {
            color: currentTheme.colors.lightGray,
        },
        logContainer: {
            backgroundColor: currentTheme.colors.elevation2,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
            padding: 12,
        },
        resultItem: {
            backgroundColor: currentTheme.colors.elevation2,
            borderRadius: 12,
            padding: 12,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        resultTitle: {
            fontSize: 16,
            fontWeight: '600',
            color: currentTheme.colors.white,
            marginBottom: 4,
        },
        resultMeta: {
            fontSize: 12,
            color: currentTheme.colors.mediumGray,
            marginBottom: 2,
        },
        resultUrl: {
            fontSize: 12,
            color: currentTheme.colors.mediumEmphasis,
            marginBottom: 2,
        },
        emptyState: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
        },
        emptyText: {
            color: currentTheme.colors.mediumGray,
            marginTop: 8,
        },
    });

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

    const renderCodeTab = () => (
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

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => (isEditorFocused ? setIsEditorFocused(false) : navigation.goBack())}>
                    <Ionicons name={isEditorFocused ? "close" : "arrow-back"} size={24} color={currentTheme.colors.primary} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={styles.headerTitle}>{isEditorFocused ? 'Edit Code' : 'Plugin Tester'}</Text>
                    {!isEditorFocused && (
                        <Text style={styles.headerSubtitle} numberOfLines={1}>Run scrapers and inspect logs in real-time</Text>
                    )}
                </View>
                {isEditorFocused ? (
                    <TouchableOpacity style={styles.headerRightButton} onPress={() => {
                        setIsEditorFocused(false);
                        setSearchQuery('');
                        setMatches([]);
                        setCurrentMatchIndex(0);
                    }}>
                        <Text style={styles.headerRightButtonText}>Done</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            {isEditorFocused ? (
                renderFocusedEditor()
            ) : (
                <>
                    <View style={styles.tabBar}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'code' && styles.activeTab]}
                            onPress={() => setActiveTab('code')}
                        >
                            <Ionicons name="code-slash-outline" size={16} color={activeTab === 'code' ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis} />
                            <Text style={[styles.tabText, activeTab === 'code' && styles.activeTabText]}>Code</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'logs' && styles.activeTab]}
                            onPress={() => setActiveTab('logs')}
                        >
                            <Ionicons name="terminal-outline" size={16} color={activeTab === 'logs' ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis} />
                            <Text style={[styles.tabText, activeTab === 'logs' && styles.activeTabText]}>Logs</Text>
                            <View style={styles.tabBadge}>
                                <Text style={styles.tabBadgeText}>{logs.length}</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'results' && styles.activeTab]}
                            onPress={() => setActiveTab('results')}
                        >
                            <Ionicons name="list-outline" size={16} color={activeTab === 'results' ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis} />
                            <Text style={[styles.tabText, activeTab === 'results' && styles.activeTabText]}>Results</Text>
                            <View style={styles.tabBadge}>
                                <Text style={styles.tabBadgeText}>{streams.length}</Text>
                            </View>
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

export default PluginTesterScreen;
