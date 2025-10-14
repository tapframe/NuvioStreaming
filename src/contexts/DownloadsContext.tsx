import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../services/notificationService';

export type DownloadStatus = 'downloading' | 'completed' | 'paused' | 'error' | 'queued';

export interface DownloadItem {
  id: string; // unique id for this download (content id + episode if any)
  contentId: string; // base id (e.g., tt0903747 for series, tt0499549 for movies)
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
  // Additional metadata for progress tracking
  imdbId?: string; // IMDb ID for better tracking
  tmdbId?: number; // TMDB ID if available
}

type StartDownloadInput = {
  id: string; // Base content ID (e.g., tt0903747)
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
  // Additional metadata for progress tracking
  imdbId?: string;
  tmdbId?: number;
};

type DownloadsContextValue = {
  downloads: DownloadItem[];
  startDownload: (input: StartDownloadInput) => Promise<void>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  isDownloadingUrl: (url: string) => boolean;
};

const DownloadsContext = createContext<DownloadsContextValue | undefined>(undefined);

const STORAGE_KEY = 'downloads_state_v1';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9\-_.()\s]/gi, '_').slice(0, 120).trim();
}

async function getExtensionFromHeaders(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const response = await fetch(url, { method: 'HEAD', headers });
    const contentType = response.headers.get('content-type');
    
    if (contentType) {
      // Map common content types to extensions
      if (contentType.includes('video/mp4')) return 'mp4';
      if (contentType.includes('video/x-matroska')) return 'mkv';
      if (contentType.includes('video/avi')) return 'avi';
      if (contentType.includes('video/quicktime')) return 'mov';
      if (contentType.includes('video/webm')) return 'webm';
      if (contentType.includes('video/x-flv')) return 'flv';
      if (contentType.includes('video/x-ms-wmv')) return 'wmv';
      if (contentType.includes('video/x-m4v')) return 'm4v';
    }
  } catch (error) {
    console.warn('[DownloadsContext] Could not get content-type from HEAD request', error);
  }
  
  return null;
}

function isDownloadableUrl(url: string): boolean {
  if (!url) return false;
  
  const lower = url.toLowerCase();
  
  // Check for streaming formats that should NOT be downloadable (only m3u8 and DASH)
  const streamingFormats = [
    '.m3u8',           // HLS streaming
    '.mpd',            // DASH streaming
    'm3u8',            // HLS without extension
    'mpd',             // DASH without extension
  ];
  
  // Check if URL contains streaming format indicators
  const isStreamingFormat = streamingFormats.some(format => 
    lower.includes(format) || 
    lower.includes(`ext=${format}`) ||
    lower.includes(`format=${format}`) ||
    lower.includes(`container=${format}`)
  );
  
  // Return true if it's NOT a streaming format (m3u8 or DASH)
  return !isStreamingFormat;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  // Convert to unsigned and hex
  return (hash >>> 0).toString(16);
}

export const DownloadsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const downloadsRef = useRef(downloads);
  useEffect(() => {
    downloadsRef.current = downloads;
  }, [downloads]);
  // Keep active resumables in memory (not persisted)
  const resumablesRef = useRef<Map<string, any>>(new Map());
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
              // Restore metadata for progress tracking
              imdbId: (d as any).imdbId ? String((d as any).imdbId) : undefined,
              tmdbId: typeof (d as any).tmdbId === 'number' ? (d as any).tmdbId : undefined,
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

  const resumeDownload = useCallback(async (id: string) => {
    console.log(`[DownloadsContext] Resuming download: ${id}`);
    const item = downloadsRef.current.find(d => d.id === id); // Use ref
    if (!item) {
      console.log(`[DownloadsContext] No item found for download: ${id}`);
      return;
    }

    // Update status to downloading immediately
    updateDownload(id, (d) => ({ ...d, status: 'downloading', updatedAt: Date.now() }));

    // Always try to use existing resumable first - this is crucial for proper resume
    let resumable = resumablesRef.current.get(id);

    if (resumable) {
      console.log(`[DownloadsContext] Using existing resumable for download: ${id}`);
      // Existing resumable should already have the correct progress callback and file URI
      // No need to recreate it
    } else {
      console.log(`[DownloadsContext] Creating new resumable for download: ${id}`);
      // Only create new resumable if none exists (should be rare for resume operations)

      const progressCallback = (data: any) => {
        const { totalBytesWritten, totalBytesExpectedToWrite } = data;
        const now = Date.now();
        const last = lastBytesRef.current.get(id);
        let speedBps = 0;
        if (last) {
          const deltaBytes = totalBytesWritten - last.bytes;
          const deltaTime = Math.max(1, now - last.time) / 1000;
          speedBps = deltaBytes / deltaTime;
        }
        lastBytesRef.current.set(id, { bytes: totalBytesWritten, time: now });

        updateDownload(id, (d) => ({
          ...d,
          downloadedBytes: totalBytesWritten,
          totalBytes: totalBytesExpectedToWrite || d.totalBytes,
          progress: totalBytesExpectedToWrite ? Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100) : d.progress,
          speedBps,
          status: 'downloading',
          updatedAt: now,
        }));

        // Fire background progress notification (throttled)
        const current = downloadsRef.current.find(x => x.id === id);
        if (current) {
          maybeNotifyProgress({ ...current, downloadedBytes: totalBytesWritten, totalBytes: totalBytesExpectedToWrite || current.totalBytes, progress: totalBytesExpectedToWrite ? Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100) : current.progress });
        }
      };

      // Use the exact same file URI that was used initially
      const fileUri = item.fileUri;
      if (!fileUri) {
        console.error(`[DownloadsContext] No fileUri found for download: ${id}`);
        updateDownload(id, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
        return;
      }

      resumable = FileSystem.createDownloadResumable(
        item.sourceUrl,
        fileUri,
        { headers: item.headers || {} },
        progressCallback
      );
      resumablesRef.current.set(id, resumable);
      lastBytesRef.current.set(id, { bytes: item.downloadedBytes, time: Date.now() });
    }

    try {
      console.log(`[DownloadsContext] Calling resumeAsync for download: ${id}`);
      const result = await resumable.resumeAsync();

      // Check if download was paused during resume
      const currentItem = downloadsRef.current.find(d => d.id === id);
      if (currentItem && currentItem.status === 'paused') {
        console.log(`[DownloadsContext] Download was paused during resume, keeping paused state: ${id}`);
        // Keep resumable for next resume attempt - DO NOT DELETE
        return;
      }

      if (!result) throw new Error('Resume failed');

      console.log(`[DownloadsContext] Resume successful for download: ${id}`);

      // Validate the downloaded file
      try {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (!fileInfo.exists || fileInfo.size === 0) {
          throw new Error('Downloaded file is empty or missing');
        }
        console.log(`[DownloadsContext] File validation passed: ${result.uri} (${fileInfo.size} bytes)`);
      } catch (validationError) {
        console.error(`[DownloadsContext] File validation failed: ${validationError}`);
        throw new Error('Downloaded file validation failed');
      }

      // Ensure we use the correct file URI from the result
      const finalFileUri = result.uri;
      updateDownload(id, (d) => ({ ...d, status: 'completed', progress: 100, updatedAt: Date.now(), fileUri: finalFileUri }));

      const done = downloadsRef.current.find(x => x.id === id);
      if (done) notifyCompleted({ ...done, status: 'completed', progress: 100, fileUri: finalFileUri } as DownloadItem);

      // Clean up only after successful completion
      resumablesRef.current.delete(id);
      lastBytesRef.current.delete(id);
    } catch (e: any) {
      console.log(`[DownloadsContext] Resume threw error for download: ${id}`, e);

      // Check if the error was due to pause
      const currentItem = downloadsRef.current.find(d => d.id === id);
      if (currentItem && currentItem.status === 'paused') {
        console.log(`[DownloadsContext] Error was due to pause, keeping paused state and resumable: ${id}`);
        // Keep resumable for next resume attempt - DO NOT DELETE
        return;
      }

      // Only mark as error and clean up if it's a real error (not pause-related)
      console.log(`[DownloadsContext] Marking download as error: ${id}`);
      // Don't clean up resumable for validation errors - allow retry
      if (e.message.includes('validation failed')) {
        console.log(`[DownloadsContext] Keeping resumable for potential retry: ${id}`);
        updateDownload(id, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
      } else {
        // Clean up for other errors
        updateDownload(id, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
        resumablesRef.current.delete(id);
        lastBytesRef.current.delete(id);
      }
    }
  }, [updateDownload, maybeNotifyProgress, notifyCompleted]);

  const startDownload = useCallback(async (input: StartDownloadInput) => {
    // Validate that the URL is downloadable (not m3u8 or DASH)
    if (!isDownloadableUrl(input.url)) {
      throw new Error('This stream format cannot be downloaded. M3U8 (HLS) and DASH streaming formats are not supported for download.');
    }

    const contentId = input.id;
    // Create unique ID per URL - allows same episode/movie from different sources
    const urlHash = hashString(input.url);
    const baseId = input.type === 'series' && input.season && input.episode
      ? `${contentId}:S${input.season}E${input.episode}`
      : contentId;
    const compoundId = `${baseId}:${urlHash}`;

    // Check if this exact URL is already being downloaded
    const existing = downloadsRef.current.find(d => d.sourceUrl === input.url);
    if (existing) {
      if (existing.status === 'completed') {
        return; // Already completed, do nothing
      } else if (existing.status === 'downloading') {
        return; // Already downloading, do nothing
      } else if (existing.status === 'paused' || existing.status === 'error') {
        // Resume the paused or errored download instead of starting new one
        await resumeDownload(existing.id);
        return;
      }
    }

    // Create file path - use a simple unique identifier with extension from HEAD request
    const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '/tmp/';
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const extension = await getExtensionFromHeaders(input.url, input.headers);
    const fileUri = extension ? `${baseDir}downloads/${uniqueId}.${extension}` : `${baseDir}downloads/${uniqueId}`;

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
      // Store metadata for progress tracking
      imdbId: input.imdbId,
      tmdbId: input.tmdbId,
    };

    setDownloads(prev => [newItem, ...prev]);

    const progressCallback = (data: any) => {
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
      const current = downloadsRef.current.find(x => x.id === compoundId);
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
      
      // Check if download was paused during download
      const currentItem = downloadsRef.current.find(d => d.id === compoundId);
      if (currentItem && currentItem.status === 'paused') {
        console.log(`[DownloadsContext] Download was paused during initial download, keeping paused state: ${compoundId}`);
        // Don't delete resumable - keep it for resume
        return;
      }
      
      if (!result) throw new Error('Download failed');

      // Validate the downloaded file
      try {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (!fileInfo.exists || fileInfo.size === 0) {
          throw new Error('Downloaded file is empty or missing');
        }
        console.log(`[DownloadsContext] File validation passed: ${result.uri} (${fileInfo.size} bytes)`);
      } catch (validationError) {
        console.error(`[DownloadsContext] File validation failed: ${validationError}`);
        throw new Error('Downloaded file validation failed');
      }

      updateDownload(compoundId, (d) => ({ ...d, status: 'completed', progress: 100, updatedAt: Date.now(), fileUri: result.uri }));
      const done = downloadsRef.current.find(x => x.id === compoundId);
      if (done) notifyCompleted({ ...done, status: 'completed', progress: 100, fileUri: result.uri } as DownloadItem);
      resumablesRef.current.delete(compoundId);
      lastBytesRef.current.delete(compoundId);
    } catch (e: any) {
      // If user paused, keep paused state, else error
      const current = downloadsRef.current.find(d => d.id === compoundId);
      if (current && current.status === 'paused') {
        console.log(`[DownloadsContext] Error was due to pause during initial download, keeping paused state and resumable: ${compoundId}`);
        // Don't delete resumable - keep it for resume
        return;
      }

      console.log(`[DownloadsContext] Marking initial download as error: ${compoundId}`);
      // Don't clean up resumable for validation errors - allow retry
      if (e.message.includes('validation failed')) {
        console.log(`[DownloadsContext] Keeping resumable for potential retry: ${compoundId}`);
        updateDownload(compoundId, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
      } else {
        // Clean up for other errors
        updateDownload(compoundId, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
        resumablesRef.current.delete(compoundId);
        lastBytesRef.current.delete(compoundId);
      }
    }
  }, [updateDownload, resumeDownload]);

  const pauseDownload = useCallback(async (id: string) => {
    console.log(`[DownloadsContext] Pausing download: ${id}`);
    
    // First, update the status to 'paused' immediately
    // This will cause any ongoing download/resume operations to check status and exit gracefully
    updateDownload(id, (d) => ({ ...d, status: 'paused', updatedAt: Date.now() }));
    
    const resumable = resumablesRef.current.get(id);
    if (resumable) {
      try {
        await resumable.pauseAsync();
        console.log(`[DownloadsContext] Successfully paused download: ${id}`);
        // Keep the resumable in memory for resume - DO NOT DELETE
      } catch (error) {
        console.log(`[DownloadsContext] Pause async failed (this is normal if already paused): ${id}`, error);
        // Keep resumable even if pause fails - we still want to be able to resume
      }
    } else {
      console.log(`[DownloadsContext] No resumable found for download: ${id}, just marked as paused`);
    }
  }, [updateDownload]);

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

    const item = downloadsRef.current.find(d => d.id === id);
    if (item?.fileUri) {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => {});
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  }, []);

  const removeDownload = useCallback(async (id: string) => {
    const item = downloadsRef.current.find(d => d.id === id);
    if (item?.fileUri && item.status === 'completed') {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => {});
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  }, []);

  const value = useMemo<DownloadsContextValue>(() => ({
    downloads,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    removeDownload,
    isDownloadingUrl: (url: string) => {
      return downloadsRef.current.some(d => d.sourceUrl === url && (d.status === 'queued' || d.status === 'downloading' || d.status === 'paused'));
    },
  }), [downloads, startDownload, pauseDownload, resumeDownload, cancelDownload, removeDownload]);

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


