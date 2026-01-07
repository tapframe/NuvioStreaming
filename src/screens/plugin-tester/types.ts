export type RepoScraper = {
    id: string;
    name?: string;
    filename?: string;
    enabled?: boolean;
    [key: string]: any;
};

export type RepoManifest = {
    name?: string;
    scrapers?: RepoScraper[];
    [key: string]: any;
};

export type RepoTestStatus = 'idle' | 'running' | 'ok' | 'ok-empty' | 'fail';

export type RepoTestResult = {
    status: RepoTestStatus;
    streamsCount?: number;
    error?: string;
    triedUrl?: string;
    logs?: string[];
    durationMs?: number;
};
