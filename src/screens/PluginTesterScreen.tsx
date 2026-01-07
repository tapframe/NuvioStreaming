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

type RepoScraper = {
    id: string;
    name?: string;
    filename?: string;
    enabled?: boolean;
    [key: string]: any;
};

type RepoManifest = {
    name?: string;
    scrapers?: RepoScraper[];
    [key: string]: any;
};

type RepoTestStatus = 'idle' | 'running' | 'ok' | 'ok-empty' | 'fail';

type RepoTestResult = {
    status: RepoTestStatus;
    streamsCount?: number;
    error?: string;
    triedUrl?: string;
    logs?: string[];
    durationMs?: number;
};

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
    const [mainTab, setMainTab] = useState<'individual' | 'repo'>('individual');
    const [activeTab, setActiveTab] = useState<'code' | 'logs' | 'results'>('code');
    const [isEditorFocused, setIsEditorFocused] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [matches, setMatches] = useState<Array<{ start: number; end: number }>>([]);
    const focusedEditorScrollRef = useRef<ScrollView | null>(null);

    // Repo tester state
    const [repoUrl, setRepoUrl] = useState('');
    const [repoResolvedBaseUrl, setRepoResolvedBaseUrl] = useState<string | null>(null);
    const [repoManifest, setRepoManifest] = useState<RepoManifest | null>(null);
    const [repoScrapers, setRepoScrapers] = useState<RepoScraper[]>([]);
    const [repoIsFetching, setRepoIsFetching] = useState(false);
    const [repoFetchError, setRepoFetchError] = useState<string | null>(null);
    const [repoFetchTriedUrl, setRepoFetchTriedUrl] = useState<string | null>(null);
    const [repoResults, setRepoResults] = useState<Record<string, RepoTestResult>>({});
    const [repoIsTestingAll, setRepoIsTestingAll] = useState(false);
    const [repoOpenLogsForId, setRepoOpenLogsForId] = useState<string | null>(null);

    // Repo tester parameters (separate from single-plugin tester)
    const [repoTmdbId, setRepoTmdbId] = useState('550');
    const [repoMediaType, setRepoMediaType] = useState<'movie' | 'tv'>('movie');
    const [repoSeason, setRepoSeason] = useState('1');
    const [repoEpisode, setRepoEpisode] = useState('1');

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

    const extractRepositoryName = (url: string) => {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            if (pathParts.length >= 2) return `${pathParts[0]}/${pathParts[1]}`;
            return urlObj.hostname || 'Repository';
        } catch {
            return 'Repository';
        }
    };

    const getRepositoryBaseUrl = (input: string) => {
        const trimmed = input.trim();
        if (!trimmed) return '';

        // Remove query/fragment
        const noHash = trimmed.split('#')[0];
        const noQuery = noHash.split('?')[0];

        // If user provided manifest.json directly, strip it to get base.
        const withoutManifest = noQuery.replace(/\/manifest\.json$/i, '');
        return withoutManifest.replace(/\/+$/, '');
    };

    const addCacheBust = (url: string) => {
        const hasQuery = url.includes('?');
        const sep = hasQuery ? '&' : '?';
        return `${url}${sep}t=${Date.now()}&v=${Math.random()}`;
    };

    const stripQueryAndHash = (url: string) => url.split('#')[0].split('?')[0];

    const buildManifestCandidates = (input: string) => {
        const trimmed = input.trim();
        const candidates: string[] = [];
        if (!trimmed) return candidates;

        const noQuery = stripQueryAndHash(trimmed);

        // If input already looks like a manifest URL, try it first.
        if (/\/manifest\.json$/i.test(noQuery)) {
            candidates.push(noQuery);
            candidates.push(addCacheBust(noQuery));
        }

        const base = getRepositoryBaseUrl(trimmed);
        if (base) {
            const manifestUrl = `${base}/manifest.json`;
            candidates.push(manifestUrl);
            candidates.push(addCacheBust(manifestUrl));
        }

        // De-dup while preserving order
        return candidates.filter((u, idx) => candidates.indexOf(u) === idx);
    };

    const buildScraperCandidates = (baseRepoUrl: string, filename: string) => {
        const candidates: string[] = [];
        const cleanFilename = String(filename || '').trim();
        if (!cleanFilename) return candidates;

        // If manifest provides an absolute URL, respect it.
        if (cleanFilename.startsWith('http://') || cleanFilename.startsWith('https://')) {
            const noQuery = stripQueryAndHash(cleanFilename);
            candidates.push(noQuery);
            candidates.push(addCacheBust(noQuery));
            return candidates.filter((u, idx) => candidates.indexOf(u) === idx);
        }

        const base = (baseRepoUrl || '').replace(/\/+$/, '');
        const rel = cleanFilename.replace(/^\/+/, '');
        const full = base ? `${base}/${rel}` : rel;
        candidates.push(full);
        candidates.push(addCacheBust(full));
        return candidates.filter((u, idx) => candidates.indexOf(u) === idx);
    };

    const fetchRepository = async () => {
        const input = repoUrl.trim();
        if (!input) {
            Alert.alert('Error', 'Please enter a repository URL');
            return;
        }

        if (!input.startsWith('https://raw.githubusercontent.com/') && !input.startsWith('http://') && !input.startsWith('https://')) {
            Alert.alert(
                'Invalid URL',
                'Use a GitHub raw URL or a local http(s) URL.\n\nExample:\nhttps://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main'
            );
            return;
        }

        setRepoIsFetching(true);
        setRepoFetchError(null);
        setRepoFetchTriedUrl(null);
        setRepoManifest(null);
        setRepoScrapers([]);
        setRepoResults({});
        setRepoResolvedBaseUrl(null);

        try {
            const candidates = buildManifestCandidates(input);
            if (candidates.length === 0) {
                throw new Error('Could not build a manifest URL from the input');
            }

            let response: any = null;
            let usedUrl: string | null = null;
            let lastError: any = null;

            for (const candidate of candidates) {
                try {
                    setRepoFetchTriedUrl(candidate);
                    response = await axios.get(candidate, {
                        timeout: 15000,
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                        },
                    });
                    usedUrl = candidate;
                    break;
                } catch (e) {
                    lastError = e;
                }
            }

            if (!response) {
                throw lastError || new Error('Failed to fetch manifest');
            }

            const manifest: RepoManifest = response.data;
            const scrapers = Array.isArray(manifest?.scrapers) ? manifest.scrapers : [];

            const resolvedBase = getRepositoryBaseUrl(usedUrl || input);
            setRepoResolvedBaseUrl(resolvedBase || null);

            setRepoManifest({
                ...manifest,
                name: manifest?.name || extractRepositoryName(resolvedBase || input),
            });
            setRepoScrapers(scrapers);

            const initialResults: Record<string, RepoTestResult> = {};
            for (const scraper of scrapers) {
                if (!scraper?.id) continue;
                initialResults[scraper.id] = { status: 'idle' };
            }
            setRepoResults(initialResults);
        } catch (error: any) {
            const status = error?.response?.status;
            const statusText = error?.response?.statusText;
            const messageBase = error?.message ? String(error.message) : 'Failed to fetch repository manifest';
            const message = status ? `${messageBase} (HTTP ${status}${statusText ? ` ${statusText}` : ''})` : messageBase;
            setRepoFetchError(message);
            Alert.alert('Error', message);
        } finally {
            setRepoIsFetching(false);
        }
    };

    const testRepoScraper = async (scraper: RepoScraper) => {
        const manifestBase = repoResolvedBaseUrl || getRepositoryBaseUrl(repoUrl);
        const effectiveBase = manifestBase;
        if (!effectiveBase) return;
        if (!scraper?.id) return;

        const filename = scraper.filename;
        if (!filename) {
            setRepoResults(prev => ({
                ...prev,
                [scraper.id]: {
                    status: 'fail',
                    error: 'Missing filename in manifest',
                },
            }));
            return;
        }

        setRepoResults(prev => ({
            ...prev,
            [scraper.id]: {
                ...(prev[scraper.id] || { status: 'idle' }),
                status: 'running',
                error: undefined,
                triedUrl: undefined,
                logs: [],
            },
        }));

        const startedAt = Date.now();

        try {
            const candidates = buildScraperCandidates(effectiveBase, filename);
            if (candidates.length === 0) throw new Error('Could not build a scraper URL');

            let res: any = null;
            let usedUrl: string | null = null;
            let lastError: any = null;

            for (const candidate of candidates) {
                try {
                    usedUrl = candidate;
                    res = await axios.get(candidate, {
                        timeout: 20000,
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                        },
                    });
                    break;
                } catch (e) {
                    // Keep the latest URL so the UI can show what was attempted.
                    setRepoResults(prev => ({
                        ...prev,
                        [scraper.id]: {
                            ...(prev[scraper.id] || { status: 'running' as const }),
                            triedUrl: candidate,
                        },
                    }));
                    lastError = e;
                }
            }

            if (!res) {
                throw lastError || new Error('Failed to download scraper');
            }

            const scraperCode = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);

            const params = {
                tmdbId: repoTmdbId,
                mediaType: repoMediaType,
                season: repoMediaType === 'tv' ? parseInt(repoSeason) || 1 : undefined,
                episode: repoMediaType === 'tv' ? parseInt(repoEpisode) || 1 : undefined,
            };

            const MAX_LOG_LINES = 400;
            const result = await pluginService.testPlugin(scraperCode, params, {
                onLog: (line) => {
                    setRepoResults(prev => {
                        const current = prev[scraper.id] || { status: 'running' as const };
                        const nextLogs = [...(current.logs || []), line];
                        const capped = nextLogs.length > MAX_LOG_LINES ? nextLogs.slice(-MAX_LOG_LINES) : nextLogs;
                        return {
                            ...prev,
                            [scraper.id]: {
                                ...current,
                                logs: capped,
                            },
                        };
                    });
                },
            });

            const streamsCount = Array.isArray(result?.streams) ? result.streams.length : 0;
            const status: RepoTestStatus = streamsCount > 0 ? 'ok' : 'ok-empty';

            setRepoResults(prev => ({
                ...prev,
                [scraper.id]: {
                    status,
                    streamsCount,
                    triedUrl: usedUrl || undefined,
                    logs: prev[scraper.id]?.logs,
                    durationMs: Date.now() - startedAt,
                },
            }));
        } catch (error: any) {
            const status = error?.response?.status;
            const statusText = error?.response?.statusText;
            const messageBase = error?.message ? String(error.message) : 'Test failed';
            const message = status ? `${messageBase} (HTTP ${status}${statusText ? ` ${statusText}` : ''})` : messageBase;
            setRepoResults(prev => ({
                ...prev,
                [scraper.id]: {
                    status: 'fail',
                    error: message,
                    triedUrl: prev[scraper.id]?.triedUrl,
                    logs: prev[scraper.id]?.logs,
                    durationMs: Date.now() - startedAt,
                },
            }));
        }
    };

    const runWithConcurrency = async <T,>(items: T[], limit: number, worker: (item: T) => Promise<void>) => {
        const queue = [...items];
        const runners: Promise<void>[] = [];

        const runOne = async () => {
            while (queue.length > 0) {
                const item = queue.shift();
                if (!item) return;
                await worker(item);
            }
        };

        const count = Math.max(1, Math.min(limit, items.length));
        for (let i = 0; i < count; i++) runners.push(runOne());
        await Promise.all(runners);
    };

    const testAllRepoScrapers = async () => {
        if (repoScrapers.length === 0) return;
        setRepoIsTestingAll(true);
        try {
            await runWithConcurrency(repoScrapers, 3, async (scraper) => {
                await testRepoScraper(scraper);
            });
        } finally {
            setRepoIsTestingAll(false);
        }
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
        repoRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: currentTheme.colors.elevation3,
        },
        repoRowLeft: {
            flex: 1,
            paddingRight: 10,
        },
        repoRowTitle: {
            fontSize: 13,
            fontWeight: '700',
            color: currentTheme.colors.highEmphasis,
        },
        repoRowSub: {
            marginTop: 2,
            fontSize: 12,
            color: currentTheme.colors.mediumEmphasis,
        },
        statusPill: {
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            borderWidth: 1,
            alignSelf: 'flex-start',
        },
        statusPillText: {
            fontSize: 11,
            fontWeight: '800',
        },
        statusIdle: {
            backgroundColor: currentTheme.colors.elevation1,
            borderColor: currentTheme.colors.elevation3,
        },
        statusRunning: {
            backgroundColor: currentTheme.colors.primary + '20',
            borderColor: currentTheme.colors.primary,
        },
        statusOk: {
            backgroundColor: currentTheme.colors.success + '20',
            borderColor: currentTheme.colors.success,
        },
        statusOkEmpty: {
            backgroundColor: currentTheme.colors.warning + '20',
            borderColor: currentTheme.colors.warning,
        },
        statusFail: {
            backgroundColor: currentTheme.colors.error + '20',
            borderColor: currentTheme.colors.error,
        },
        repoMiniButton: {
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: currentTheme.colors.elevation1,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
        },
        repoMiniButtonText: {
            fontSize: 12,
            fontWeight: '800',
            color: currentTheme.colors.highEmphasis,
        },
        repoLogsPanel: {
            marginTop: 10,
            backgroundColor: currentTheme.colors.elevation1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: currentTheme.colors.elevation3,
            padding: 10,
        },
        repoLogsTitle: {
            fontSize: 12,
            fontWeight: '800',
            color: currentTheme.colors.highEmphasis,
            marginBottom: 8,
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

    const renderRepoTab = () => (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>Repo Tester</Text>
                        <Ionicons name="git-branch-outline" size={18} color={currentTheme.colors.mediumEmphasis} />
                    </View>
                    <Text style={styles.helperText}>
                        Fetch a repository (local URL or GitHub raw) and test each provider.
                    </Text>

                    <View style={[styles.row, { marginTop: 10 }]}> 
                        <TextInput
                            style={[styles.input, { flex: 1 }]}
                            value={repoUrl}
                            onChangeText={setRepoUrl}
                            placeholder="https://raw.githubusercontent.com/…/refs/heads/main (or /manifest.json)"
                            placeholderTextColor={currentTheme.colors.mediumEmphasis}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            style={[styles.button, styles.secondaryButton, { paddingHorizontal: 12, minHeight: 48, opacity: repoIsFetching ? 0.75 : 1 }]}
                            onPress={fetchRepository}
                            disabled={repoIsFetching || repoIsTestingAll}
                        >
                            {repoIsFetching ? (
                                <ActivityIndicator color={currentTheme.colors.white} />
                            ) : (
                                <Ionicons name="cloud-download-outline" size={20} color={currentTheme.colors.white} />
                            )}
                        </TouchableOpacity>
                    </View>

                    {!!repoFetchError && (
                        <Text style={[styles.helperText, { marginTop: 8, color: currentTheme.colors.error }]}>
                            {repoFetchError}
                        </Text>
                    )}

                    {!!repoFetchTriedUrl && (
                        <Text style={[styles.helperText, { marginTop: 6 }]} numberOfLines={2}>
                            Trying: {repoFetchTriedUrl}
                        </Text>
                    )}
                </View>

                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>Repo Test Parameters</Text>
                        <Ionicons name="options-outline" size={18} color={currentTheme.colors.mediumEmphasis} />
                    </View>
                    <Text style={styles.helperText}>These parameters are used only for Repo Tester.</Text>

                    <View style={[styles.segment, { marginTop: 10 }]}
                    >
                        <TouchableOpacity
                            style={[styles.segmentItem, repoMediaType === 'movie' && styles.segmentItemActive]}
                            onPress={() => setRepoMediaType('movie')}
                        >
                            <Ionicons name="film-outline" size={18} color={repoMediaType === 'movie' ? currentTheme.colors.primary : currentTheme.colors.highEmphasis} />
                            <Text style={[styles.segmentText, repoMediaType === 'movie' && styles.segmentTextActive]}>Movie</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.segmentItem, repoMediaType === 'tv' && styles.segmentItemActive]}
                            onPress={() => setRepoMediaType('tv')}
                        >
                            <Ionicons name="tv-outline" size={18} color={repoMediaType === 'tv' ? currentTheme.colors.primary : currentTheme.colors.highEmphasis} />
                            <Text style={[styles.segmentText, repoMediaType === 'tv' && styles.segmentTextActive]}>TV</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.row, { marginTop: 10, alignItems: 'flex-start' }]}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldLabel}>TMDB ID</Text>
                            <TextInput
                                style={styles.input}
                                value={repoTmdbId}
                                onChangeText={setRepoTmdbId}
                                keyboardType="numeric"
                            />
                        </View>

                        {repoMediaType === 'tv' && (
                            <>
                                <View style={{ width: 110 }}>
                                    <Text style={styles.fieldLabel}>Season</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={repoSeason}
                                        onChangeText={setRepoSeason}
                                        keyboardType="numeric"
                                    />
                                </View>
                                <View style={{ width: 110 }}>
                                    <Text style={styles.fieldLabel}>Episode</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={repoEpisode}
                                        onChangeText={setRepoEpisode}
                                        keyboardType="numeric"
                                    />
                                </View>
                            </>
                        )}
                    </View>

                    <Text style={[styles.helperText, { marginTop: 10 }]}>
                        Using: {repoMediaType.toUpperCase()} • TMDB {repoTmdbId}{repoMediaType === 'tv' ? ` • S${repoSeason}E${repoEpisode}` : ''}
                    </Text>
                </View>

                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>Providers</Text>
                        <Ionicons name="list-outline" size={18} color={currentTheme.colors.mediumEmphasis} />
                    </View>
                    {repoManifest ? (
                        <Text style={styles.helperText}>
                            {repoManifest.name || 'Repository'} • {repoScrapers.length} providers
                        </Text>
                    ) : (
                        <Text style={styles.helperText}>Fetch a repo to list providers.</Text>
                    )}

                    {repoScrapers.length > 0 && (
                        <View style={[styles.row, { marginTop: 10, alignItems: 'center', justifyContent: 'space-between' }]}>
                            <TouchableOpacity
                                style={[styles.button, { flex: 1, opacity: repoIsTestingAll ? 0.75 : 1 }]}
                                onPress={testAllRepoScrapers}
                                disabled={repoIsTestingAll || repoIsFetching}
                            >
                                {repoIsTestingAll ? (
                                    <ActivityIndicator color={currentTheme.colors.white} />
                                ) : (
                                    <Ionicons name="play" size={18} color={currentTheme.colors.white} />
                                )}
                                <Text style={styles.buttonText}>{repoIsTestingAll ? 'Testing…' : 'Test All'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.button, styles.secondaryButton, { paddingHorizontal: 14 }]}
                                onPress={() => {
                                    setRepoManifest(null);
                                    setRepoScrapers([]);
                                    setRepoResults({});
                                    setRepoFetchError(null);
                                    setRepoFetchTriedUrl(null);
                                    setRepoResolvedBaseUrl(null);
                                }}
                                disabled={repoIsTestingAll || repoIsFetching}
                            >
                                <Ionicons name="trash-outline" size={18} color={currentTheme.colors.white} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {repoScrapers.map((scraper, idx) => {
                        const result = repoResults[scraper.id] || { status: 'idle' as const };

                        const getStatusStyle = () => {
                            switch (result.status) {
                                case 'running':
                                    return styles.statusRunning;
                                case 'ok':
                                    return styles.statusOk;
                                case 'ok-empty':
                                    return styles.statusOkEmpty;
                                case 'fail':
                                    return styles.statusFail;
                                default:
                                    return styles.statusIdle;
                            }
                        };

                        const getStatusText = () => {
                            switch (result.status) {
                                case 'running':
                                    return 'RUNNING';
                                case 'ok':
                                    return `OK (${result.streamsCount ?? 0})`;
                                case 'ok-empty':
                                    return 'OK (0)';
                                case 'fail':
                                    return 'FAILED';
                                default:
                                    return 'IDLE';
                            }
                        };

                        const statusColor = (() => {
                            switch (result.status) {
                                case 'running':
                                    return currentTheme.colors.primary;
                                case 'ok':
                                    return currentTheme.colors.success;
                                case 'ok-empty':
                                    return currentTheme.colors.warning;
                                case 'fail':
                                    return currentTheme.colors.error;
                                default:
                                    return currentTheme.colors.mediumEmphasis;
                            }
                        })();

                        return (
                            <View key={scraper.id} style={[styles.repoRow, idx === 0 ? { borderTopWidth: 0 } : null]}>
                                <View style={styles.repoRowLeft}>
                                    <Text style={styles.repoRowTitle}>{scraper.name || scraper.id}</Text>
                                    <Text style={styles.repoRowSub} numberOfLines={1}>
                                        {scraper.id}{scraper.filename ? ` • ${scraper.filename}` : ''}
                                    </Text>
                                    {!!result.triedUrl && result.status === 'fail' && (
                                        <Text style={styles.repoRowSub} numberOfLines={1}>
                                            Tried: {result.triedUrl}
                                        </Text>
                                    )}
                                    {!!result.error && (
                                        <Text style={[styles.repoRowSub, { color: currentTheme.colors.error }]} numberOfLines={2}>
                                            {result.error}
                                        </Text>
                                    )}

                                    {repoOpenLogsForId === scraper.id && (
                                        <View style={styles.repoLogsPanel}>
                                            <Text style={styles.repoLogsTitle}>Provider Logs</Text>
                                            <ScrollView style={{ maxHeight: 180 }}>
                                                <Text style={styles.logItem} selectable>
                                                    {(result.logs && result.logs.length > 0) ? result.logs.join('\n') : 'No logs captured.'}
                                                </Text>
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>

                                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                                    <View style={[styles.statusPill, getStatusStyle()]}> 
                                        <Text style={[styles.statusPillText, { color: statusColor }]}>{getStatusText()}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            style={[styles.repoMiniButton, { opacity: (result.status === 'running' || repoIsTestingAll) ? 0.7 : 1 }]}
                                            onPress={() => testRepoScraper(scraper)}
                                            disabled={result.status === 'running' || repoIsTestingAll}
                                        >
                                            <Text style={styles.repoMiniButtonText}>Test</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.repoMiniButton, { opacity: (result.status === 'idle' || result.status === 'running') ? 0.7 : 1 }]}
                                            onPress={() => setRepoOpenLogsForId(prev => (prev === scraper.id ? null : scraper.id))}
                                            disabled={result.status === 'idle' || result.status === 'running'}
                                        >
                                            <Text style={styles.repoMiniButtonText}>Logs</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
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
                            style={[styles.tab, mainTab === 'individual' && styles.activeTab]}
                            onPress={() => {
                                setMainTab('individual');
                                setActiveTab('code');
                            }}
                        >
                            <Ionicons name="person-outline" size={16} color={mainTab === 'individual' ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis} />
                            <Text style={[styles.tabText, mainTab === 'individual' && styles.activeTabText]}>Individual</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, mainTab === 'repo' && styles.activeTab]}
                            onPress={() => setMainTab('repo')}
                        >
                            <Ionicons name="git-branch-outline" size={16} color={mainTab === 'repo' ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis} />
                            <Text style={[styles.tabText, mainTab === 'repo' && styles.activeTabText]}>Repo</Text>
                        </TouchableOpacity>
                    </View>

                    {mainTab === 'individual' && (
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
                    )}

                    {mainTab === 'repo' ? (
                        renderRepoTab()
                    ) : (
                        <>
                            {activeTab === 'code' && renderCodeTab()}
                            {activeTab === 'logs' && renderLogsTab()}
                            {activeTab === 'results' && renderResultsTab()}
                        </>
                    )}
                </>
            )}
        </View>
    );
};

export default PluginTesterScreen;
