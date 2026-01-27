import { Platform } from 'react-native';

type LiveActivityModule = {
  startActivity: (state: any, config?: any) => string | undefined;
  updateActivity: (id: string, state: any) => void;
  stopActivity: (id: string, state: any) => void;
};

function getLiveActivityModule(): LiveActivityModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-live-activity') as LiveActivityModule;
  } catch {
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export async function startOrUpdateDownloadLiveActivity(params: {
  activityId?: string;
  title: string;
  progressPercent: number;
  subtitle?: string;
  deepLinkUrl?: string;
}): Promise<string | undefined> {
  const mod = getLiveActivityModule();
  if (!mod) return undefined;

  const progress01 = clamp01(params.progressPercent / 100);
  const state = {
    title: params.title,
    subtitle: params.subtitle,
    progressBar: {
      progress: progress01,
    },
  };

  const config = params.deepLinkUrl ? { deepLinkUrl: params.deepLinkUrl } : undefined;

  try {
    if (params.activityId) {
      mod.updateActivity(params.activityId, state);
      return params.activityId;
    }

    const id = mod.startActivity(state, config);
    if (!id) {
      console.warn(
        '[LiveActivity] startActivity returned undefined. Live Activities require a physical iOS device on iOS 16.2+ and a clean prebuild after enabling the expo-live-activity plugin.'
      );
    }
    return id;
  } catch {
    return undefined;
  }
}

export async function stopDownloadLiveActivity(params: {
  activityId: string;
  title: string;
  progressPercent?: number;
  subtitle?: string;
}): Promise<void> {
  const mod = getLiveActivityModule();
  if (!mod) return;

  const progress01 = clamp01((params.progressPercent ?? 0) / 100);
  const state = {
    title: params.title,
    subtitle: params.subtitle,
    progressBar: {
      progress: progress01,
    },
  };

  try {
    mod.stopActivity(params.activityId, state);
  } catch {
    // ignore
  }
}
