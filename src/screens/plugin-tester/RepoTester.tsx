import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { pluginService } from '../../services/pluginService';
import axios from 'axios';
import { getPluginTesterStyles } from './styles';
import { RepoManifest, RepoScraper, RepoTestResult, RepoTestStatus } from './types';

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

export const RepoTester = () => {
    const { currentTheme } = useTheme();
    const styles = getPluginTesterStyles(currentTheme);

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

    // Repo tester parameters
    const [repoTmdbId, setRepoTmdbId] = useState('550');
    const [repoMediaType, setRepoMediaType] = useState<'movie' | 'tv'>('movie');
    const [repoSeason, setRepoSeason] = useState('1');
    const [repoEpisode, setRepoEpisode] = useState('1');

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

    return (
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

                    <View style={[styles.segment, { marginTop: 10 }]}>
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

                    <View style={[styles.row, { marginTop: 10, alignItems: 'flex-start' }]}>
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
};
