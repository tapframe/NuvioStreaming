import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { getDisplayedAppVersion } from '../utils/version';
import { fetchLatestGithubRelease, isAnyUpgrade } from '../services/githubReleaseService';

const DISMISSED_KEY = '@github_major_update_dismissed_version';

export interface MajorUpdateData {
  visible: boolean;
  latestTag?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  onDismiss: () => void;
  onLater: () => void;
  refresh: () => void;
}

export function useGithubMajorUpdate(): MajorUpdateData {
  const [visible, setVisible] = useState(false);
  const [latestTag, setLatestTag] = useState<string | undefined>();
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>();
  const [releaseUrl, setReleaseUrl] = useState<string | undefined>();

  const check = useCallback(async () => {
    try {
      // Always compare with Settings screen version
      const current = getDisplayedAppVersion() || Updates.runtimeVersion || '0.0.0';
      const info = await fetchLatestGithubRelease();
      if (!info?.tag_name) return;

      const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
      if (dismissed === info.tag_name) return;

      // "Later" is session-only now, no persisted snooze

      const shouldShow = isAnyUpgrade(current, info.tag_name);
      if (shouldShow) {
        setLatestTag(info.tag_name);
        setReleaseNotes(info.body);
        setReleaseUrl(info.html_url);
        setVisible(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const onDismiss = useCallback(async () => {
    if (latestTag) await AsyncStorage.setItem(DISMISSED_KEY, latestTag);
    setVisible(false);
  }, [latestTag]);

  const onLater = useCallback(async () => {
    setVisible(false);
  }, []);

  return { visible, latestTag, releaseNotes, releaseUrl, onDismiss, onLater, refresh: check };
}


