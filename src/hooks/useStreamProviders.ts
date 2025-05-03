import { useState, useEffect, useMemo, useCallback } from 'react';
import { stremioService } from '../services/stremioService';
import { Stream } from '../types/metadata';
import { logger } from '../utils/logger';

interface StreamGroups {
  [addonId: string]: {
    addonName: string;
    streams: Stream[];
  };
}

export const useStreamProviders = (
  groupedStreams: StreamGroups,
  episodeStreams: StreamGroups,
  type: string,
  loadingStreams: boolean,
  loadingEpisodeStreams: boolean
) => {
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [availableProviders, setAvailableProviders] = useState<Set<string>>(new Set());
  const [loadingProviders, setLoadingProviders] = useState<{[key: string]: boolean}>({});
  const [providerStatus, setProviderStatus] = useState<{
    [key: string]: {
      loading: boolean;
      success: boolean;
      error: boolean;
      message: string;
      timeStarted: number;
      timeCompleted: number;
    }
  }>({});
  const [providerLoadTimes, setProviderLoadTimes] = useState<{[key: string]: number}>({});
  const [loadStartTime, setLoadStartTime] = useState(0);
  
  // Update available providers when streams change - converted to useEffect
  useEffect(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    const providers = new Set(Object.keys(streams));
    setAvailableProviders(providers);
  }, [type, groupedStreams, episodeStreams]);
  
  // Start tracking load time when loading begins - converted to useEffect
  useEffect(() => {
    if (loadingStreams || loadingEpisodeStreams) {
      logger.log("⏱️ Stream loading started");
      const now = Date.now();
      setLoadStartTime(now);
      setProviderLoadTimes({});
      
      // Reset provider status - only for stremio addons
      setProviderStatus({
        'stremio': {
          loading: true,
          success: false,
          error: false,
          message: 'Loading...',
          timeStarted: now,
          timeCompleted: 0
        }
      });
      
      // Also update the simpler loading state - only for stremio
      setLoadingProviders({
        'stremio': true
      });
    }
  }, [loadingStreams, loadingEpisodeStreams]);
  
  // Generate filter items for the provider selector
  const filterItems = useMemo(() => {
    const installedAddons = stremioService.getInstalledAddons();
    const streams = type === 'series' ? episodeStreams : groupedStreams;

    return [
      { id: 'all', name: 'All Providers' },
      ...Array.from(availableProviders)
        .sort((a, b) => {
          const indexA = installedAddons.findIndex(addon => addon.id === a);
          const indexB = installedAddons.findIndex(addon => addon.id === b);
          
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        })
        .map(provider => {
          const addonInfo = streams[provider];
          const installedAddon = installedAddons.find(addon => addon.id === provider);
          
          let displayName = provider;
          if (installedAddon) displayName = installedAddon.name;
          else if (addonInfo?.addonName) displayName = addonInfo.addonName;
          
          return { id: provider, name: displayName };
        })
    ];
  }, [availableProviders, type, episodeStreams, groupedStreams]);
  
  // Filter streams to show only selected provider (or all)
  const filteredSections = useMemo(() => {
    const streams = type === 'series' ? episodeStreams : groupedStreams;
    const installedAddons = stremioService.getInstalledAddons();

    return Object.entries(streams)
      .filter(([addonId]) => {
        // If "all" is selected, show all providers
        if (selectedProvider === 'all') {
          return true;
        }
        // Otherwise only show the selected provider
        return addonId === selectedProvider;
      })
      .sort(([addonIdA], [addonIdB]) => {
        const indexA = installedAddons.findIndex(addon => addon.id === addonIdA);
        const indexB = installedAddons.findIndex(addon => addon.id === addonIdB);
        
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      })
      .map(([addonId, { addonName, streams }]) => ({
        title: addonName,
        addonId,
        data: streams
      }));
  }, [selectedProvider, type, episodeStreams, groupedStreams]);
  
  // Handler for changing the selected provider
  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
  }, []);
  
  return {
    selectedProvider,
    availableProviders,
    loadingProviders,
    providerStatus,
    filterItems,
    filteredSections,
    handleProviderChange,
    setLoadingProviders,
    setProviderStatus
  };
}; 