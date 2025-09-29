import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../services/notificationService';

export type DownloadStatus = 'downloading' | 'completed' | 'paused' | 'error' | 'queued';

export interface DownloadItem {
  id: string; // unique id for this download (content id + episode if any)
  contentId: string; // base id
  type: 'movie' | 'series';
  title: string; // movie title or show name
  providerName?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  quality?: string;
  size?: number; // total bytes if known
  downloadedBytes: number;
  totalBytes: number;
  progress: number; // 0-100
  status: DownloadStatus;
  speedBps?: number;
  etaSeconds?: number;
  posterUrl?: string | null;
  sourceUrl: string; // stream url
  headers?: Record<string, string>;
  fileUri?: string; // local file uri once downloading/finished
  createdAt: number;
  updatedAt: number;
}

type StartDownloadInput = {
  id: string;
  type: 'movie' | 'series';
  title: string;
  providerName?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  quality?: string;
  posterUrl?: string | null;
  url: string;
  headers?: Record<string, string>;
};

type DownloadsContextValue = {
  downloads: DownloadItem[];
  startDownload: (input: StartDownloadInput) => Promise<void>;
  // pauseDownload: (id: string) => Promise<void>;
  // resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
};

const DownloadsContext = createContext<DownloadsContextValue | undefined>(undefined);

const STORAGE_KEY = 'downloads_state_v1';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9\-_.()\s]/gi, '_').slice(0, 120).trim();
}

function getExtensionFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (/(\.|ext=)(m3u8)(\b|$)/i.test(lower)) return 'm3u8';
  if (/(\.|ext=)(mp4)(\b|$)/i.test(lower)) return 'mp4';
  if (/(\.|ext=)(mkv)(\b|$)/i.test(lower)) return 'mkv';
  if (/(\.|ext=)(mpd)(\b|$)/i.test(lower)) return 'mpd';
  return 'mp4';
}

export const DownloadsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  // Keep active resumables in memory (not persisted)
  const resumablesRef = useRef<Map<string, FileSystem.DownloadResumable>>(new Map());
  const lastBytesRef = useRef<Map<string, { bytes: number; time: number }>>(new Map());

  // Persist and restore
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const list = JSON.parse(raw) as Array<Partial<DownloadItem>>;
          // Mark any in-progress as paused on restore (cannot resume across sessions reliably)
          const restored: DownloadItem[] = list.map((d) => {
            const status = (d.status as DownloadStatus) || 'paused';
            const safe: DownloadItem = {
              id: String(d.id),
              contentId: String(d.contentId ?? d.id),
              type: (d.type as 'movie' | 'series') ?? 'movie',
              title: String(d.title ?? 'Content'),
              providerName: d.providerName,
              season: typeof d.season === 'number' ? d.season : undefined,
              episode: typeof d.episode === 'number' ? d.episode : undefined,
              episodeTitle: d.episodeTitle ? String(d.episodeTitle) : undefined,
              quality: d.quality ? String(d.quality) : undefined,
              size: typeof d.size === 'number' ? d.size : undefined,
              downloadedBytes: typeof d.downloadedBytes === 'number' ? d.downloadedBytes : 0,
              totalBytes: typeof d.totalBytes === 'number' ? d.totalBytes : 0,
              progress: typeof d.progress === 'number' ? d.progress : 0,
              status: status === 'downloading' || status === 'queued' ? 'paused' : status,
              speedBps: undefined,
              etaSeconds: undefined,
              posterUrl: (d.posterUrl as any) ?? null,
              sourceUrl: String(d.sourceUrl ?? ''),
              headers: (d.headers as any) ?? undefined,
              fileUri: d.fileUri ? String(d.fileUri) : undefined,
              createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
              updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
            };
            return safe;
          });
          setDownloads(restored);
        }
      } catch {}
    })();
  }, []);

  // Notifications are configured globally by notificationService

  // Track app state to know foreground/background
  const appStateRef = useRef<string>('active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s;
    });
    return () => sub.remove();
  }, []);

  // Cache last notified progress to reduce spam
  const lastNotifyRef = useRef<Map<string, number>>(new Map());

  const maybeNotifyProgress = useCallback(async (d: DownloadItem) => {
    try {
      if (appStateRef.current === 'active') return;
      if (d.status !== 'downloading') return;
      const prev = lastNotifyRef.current.get(d.id) ?? -1;
      if (d.progress <= prev || d.progress - prev < 2) return; // notify every 2%
      lastNotifyRef.current.set(d.id, d.progress);
      await notificationService.notifyDownloadProgress(d.title, d.progress, d.downloadedBytes, d.totalBytes);
    } catch {}
  }, []);

  const notifyCompleted = useCallback(async (d: DownloadItem) => {
    try {
      if (appStateRef.current === 'active') return;
      await notificationService.notifyDownloadComplete(d.title);
    } catch {}
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(downloads)).catch(() => {});
  }, [downloads]);

  const updateDownload = useCallback((id: string, updater: (d: DownloadItem) => DownloadItem) => {
    setDownloads(prev => prev.map(d => (d.id === id ? updater(d) : d)));
  }, []);

  const startDownload = useCallback(async (input: StartDownloadInput) => {
    const contentId = input.id;
    // Compose per-episode id for series
    const compoundId = input.type === 'series' && input.season && input.episode
      ? `${contentId}:S${input.season}E${input.episode}`
      : contentId;

    // If already exists and completed, do nothing
    const existing = downloads.find(d => d.id === compoundId);
    if (existing && (existing.status === 'completed' || existing.status === 'downloading' || existing.status === 'paused')) {
      return;
    }

    // Create file path
    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || FileSystem.documentDirectory;
    const ext = getExtensionFromUrl(input.url);
    const filenameBase = input.type === 'series'
      ? `${sanitizeFilename(input.title)}.S${String(input.season || 0).padStart(2, '0')}E${String(input.episode || 0).padStart(2, '0')}`
      : sanitizeFilename(input.title);
    const fileUri = `${baseDir}downloads/${filenameBase}.${ext}`;

    // Ensure directory exists
    await FileSystem.makeDirectoryAsync(`${baseDir}downloads`, { intermediates: true }).catch(() => {});

    const createdAt = Date.now();
    const newItem: DownloadItem = {
      id: compoundId,
      contentId,
      type: input.type,
      title: input.title,
      providerName: input.providerName,
      season: input.season,
      episode: input.episode,
      episodeTitle: input.episodeTitle,
      quality: input.quality,
      size: undefined,
      downloadedBytes: 0,
      totalBytes: 0,
      progress: 0,
      status: 'downloading',
      speedBps: 0,
      etaSeconds: undefined,
      posterUrl: input.posterUrl || null,
      sourceUrl: input.url,
      headers: input.headers,
      fileUri,
      createdAt,
      updatedAt: createdAt,
    };

    setDownloads(prev => [newItem, ...prev]);

    const progressCallback: FileSystem.DownloadProgressCallback = (data) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = data;
      const now = Date.now();
      const last = lastBytesRef.current.get(compoundId);
      let speedBps = 0;
      if (last) {
        const deltaBytes = totalBytesWritten - last.bytes;
        const deltaTime = Math.max(1, now - last.time) / 1000;
        speedBps = deltaBytes / deltaTime;
      }
      lastBytesRef.current.set(compoundId, { bytes: totalBytesWritten, time: now });

      updateDownload(compoundId, (d) => ({
        ...d,
        downloadedBytes: totalBytesWritten,
        totalBytes: totalBytesExpectedToWrite || d.totalBytes,
        progress: totalBytesExpectedToWrite ? Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100) : d.progress,
        speedBps,
        updatedAt: now,
      }));
      // Fire background progress notification (throttled)
      const current = downloads.find(x => x.id === compoundId);
      if (current) {
        maybeNotifyProgress({ ...current, downloadedBytes: totalBytesWritten, totalBytes: totalBytesExpectedToWrite || current.totalBytes, progress: totalBytesExpectedToWrite ? Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100) : current.progress });
      }
    };

    // Create resumable
    const resumable = FileSystem.createDownloadResumable(
      input.url,
      fileUri,
      { headers: input.headers || {} },
      progressCallback
    );
    resumablesRef.current.set(compoundId, resumable);
    lastBytesRef.current.set(compoundId, { bytes: 0, time: Date.now() });

    try {
      const result = await resumable.downloadAsync();
      if (!result) throw new Error('Download failed');
      updateDownload(compoundId, (d) => ({ ...d, status: 'completed', progress: 100, updatedAt: Date.now(), fileUri: result.uri }));
      const done = downloads.find(x => x.id === compoundId);
      if (done) notifyCompleted({ ...done, status: 'completed', progress: 100, fileUri: result.uri } as DownloadItem);
      resumablesRef.current.delete(compoundId);
      lastBytesRef.current.delete(compoundId);
    } catch (e) {
      // If user paused, keep paused state, else error
      const current = downloads.find(d => d.id === compoundId);
      if (current && current.status === 'paused') {
        return;
      }
      updateDownload(compoundId, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
      resumablesRef.current.delete(compoundId);
      lastBytesRef.current.delete(compoundId);
    }
  }, [downloads, updateDownload]);

  // const pauseDownload = useCallback(async (id: string) => {
  //   const resumable = resumablesRef.current.get(id);
  //   if (resumable) {
  //     try {
  //       await resumable.pauseAsync();
  //     } catch {}
  //   }
  //   updateDownload(id, (d) => ({ ...d, status: 'paused', updatedAt: Date.now() }));
  // }, [updateDownload]);

  // const resumeDownload = useCallback(async (id: string) => {
  //   const item = downloads.find(d => d.id === id);
  //   if (!item) return;
  //   const progressCallback: FileSystem.DownloadProgressCallback = (data) => {
  //     const { totalBytesWritten, totalBytesExpectedToWrite } = data;
  //     const now = Date.now();
  //     const last = lastBytesRef.current.get(id);
  //     let speedBps = 0;
  //     if (last) {
  //       const deltaBytes = totalBytesWritten - last.bytes;
  //       const deltaTime = Math.max(1, now - last.time) / 1000;
  //       speedBps = deltaBytes / deltaTime;
  //     }
  //     lastBytesRef.current.set(id, { bytes: totalBytesWritten, time: now });

  //     updateDownload(id, (d) => ({
  //       ...d,
  //       downloadedBytes: totalBytesWritten,
  //       totalBytes: totalBytesExpectedToWrite || d.totalBytes,
  //       progress: totalBytesExpectedToWrite ? Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100) : d.progress,
  //       speedBps,
  //       status: 'downloading',
  //       updatedAt: now,
  //     }));
  //   };

  //   let resumable = resumablesRef.current.get(id);
  //   if (!resumable) {
  //     resumable = FileSystem.createDownloadResumable(
  //       item.sourceUrl,
  //       item.fileUri || `${FileSystem.documentDirectory}downloads/${sanitizeFilename(item.title)}.mp4`,
  //       { headers: item.headers || {} },
  //       progressCallback
  //     );
  //     resumablesRef.current.set(id, resumable);
  //   }
  //   try {
  //     const result = await resumable.resumeAsync();
  //     if (!result) throw new Error('Resume failed');
  //     updateDownload(id, (d) => ({ ...d, status: 'completed', progress: 100, updatedAt: Date.now(), fileUri: result.uri }));
  //     resumablesRef.current.delete(id);
  //     lastBytesRef.current.delete(id);
  //   } catch (e) {
  //     updateDownload(id, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
  //     resumablesRef.current.delete(id);
  //     lastBytesRef.current.delete(id);
  //   }
  // }, [downloads, updateDownload]);

  const cancelDownload = useCallback(async (id: string) => {
    const resumable = resumablesRef.current.get(id);
    try {
      if (resumable) {
        try { await resumable.pauseAsync(); } catch {}
      }
    } finally {
      resumablesRef.current.delete(id);
      lastBytesRef.current.delete(id);
    }

    const item = downloads.find(d => d.id === id);
    if (item?.fileUri) {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => {});
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  }, [downloads]);

  const removeDownload = useCallback(async (id: string) => {
    const item = downloads.find(d => d.id === id);
    if (item?.fileUri && item.status === 'completed') {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => {});
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  }, [downloads]);

  const value = useMemo<DownloadsContextValue>(() => ({
    downloads,
    startDownload,
    // pauseDownload,
    // resumeDownload,
    cancelDownload,
    removeDownload,
  }), [downloads, startDownload, /*pauseDownload, resumeDownload,*/ cancelDownload, removeDownload]);

  return (
    <DownloadsContext.Provider value={value}>
      {children}
    </DownloadsContext.Provider>
  );
};

export function useDownloads(): DownloadsContextValue {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error('useDownloads must be used within DownloadsProvider');
  return ctx;
}


