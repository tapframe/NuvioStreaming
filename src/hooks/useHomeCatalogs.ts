import { useState, useCallback, useRef, useEffect } from 'react';
import { CatalogContent, catalogService } from '../services/catalogService';
import { logger } from '../utils/logger';
import { useCatalogContext } from '../contexts/CatalogContext';

export function useHomeCatalogs() {
  const [catalogs, setCatalogs] = useState<CatalogContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { lastUpdate } = useCatalogContext();

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const loadCatalogs = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    
    cleanup();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const homeCatalogs = await catalogService.getHomeCatalogs();
      
      if (signal.aborted) return;

      if (!homeCatalogs?.length) {
        logger.warn('No home catalogs found.');
        setCatalogs([]); // Ensure catalogs is empty if none found
        return;
      }

      const uniqueCatalogsMap = new Map();
      homeCatalogs.forEach(catalog => {
        const contentKey = catalog.items.map(item => item.id).sort().join(',');
        if (!uniqueCatalogsMap.has(contentKey)) {
          uniqueCatalogsMap.set(contentKey, catalog);
        }
      });

      if (signal.aborted) return;

      const uniqueCatalogs = Array.from(uniqueCatalogsMap.values());
      setCatalogs(uniqueCatalogs);

    } catch (error) {
      if (signal.aborted) {
        logger.info('Catalog fetch aborted');
      } else {
        logger.error('Error in loadCatalogs:', error);
      }
      setCatalogs([]); // Clear catalogs on error
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cleanup]);

  // Initial load and reload on lastUpdate change
  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs, lastUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const refreshCatalogs = useCallback(() => {
    return loadCatalogs(true);
  }, [loadCatalogs]);

  return { catalogs, loading, refreshing, refreshCatalogs };
} 