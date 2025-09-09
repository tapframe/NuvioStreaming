import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StreamingContent } from '../services/catalogService';
import { catalogService } from '../services/catalogService';

const LEGACY_LIBRARY_STORAGE_KEY = 'stremio-library';

export const useLibrary = () => {
  const [libraryItems, setLibraryItems] = useState<StreamingContent[]>([]);
  const [loading, setLoading] = useState(true);

  // Load library items from storage
  const loadLibraryItems = useCallback(async () => {
    try {
      setLoading(true);
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const scopedKey = `@user:${scope}:stremio-library`;
      let storedItems = await AsyncStorage.getItem(scopedKey);
      if (!storedItems) {
        // migrate legacy into scoped
        const legacy = await AsyncStorage.getItem(LEGACY_LIBRARY_STORAGE_KEY);
        if (legacy) {
          await AsyncStorage.setItem(scopedKey, legacy);
          storedItems = legacy;
        }
      }
      
      if (storedItems) {
        const parsedItems = JSON.parse(storedItems);
        // Handle both array and object formats
        if (Array.isArray(parsedItems)) {
          setLibraryItems(parsedItems);
        } else if (typeof parsedItems === 'object') {
          // Convert object format to array format
          setLibraryItems(Object.values(parsedItems));
        }
      }
    } catch (error) {
      if (__DEV__) console.error('Error loading library items:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save library items to storage
  const saveLibraryItems = useCallback(async (items: StreamingContent[]) => {
    try {
      // Convert array to object format for compatibility with CatalogService
      const itemsObject = items.reduce((acc, item) => {
        acc[`${item.type}:${item.id}`] = item;
        return acc;
      }, {} as Record<string, StreamingContent>);
      const scope = (await AsyncStorage.getItem('@user:current')) || 'local';
      const scopedKey = `@user:${scope}:stremio-library`;
      await AsyncStorage.setItem(scopedKey, JSON.stringify(itemsObject));
      // keep legacy for backward-compat
      await AsyncStorage.setItem(LEGACY_LIBRARY_STORAGE_KEY, JSON.stringify(itemsObject));
    } catch (error) {
      if (__DEV__) console.error('Error saving library items:', error);
    }
  }, []);

  // Add item to library
  const addToLibrary = useCallback(async (item: StreamingContent) => {
    try {
      await catalogService.addToLibrary({ ...item, inLibrary: true });
      return true;
    } catch (e) {
      if (__DEV__) console.error('Error adding to library via catalogService:', e);
      // Fallback local write
      const updatedItems = [...libraryItems, { ...item, inLibrary: true }];
      setLibraryItems(updatedItems);
      await saveLibraryItems(updatedItems);
      return true;
    }
  }, [libraryItems, saveLibraryItems]);

  // Remove item from library
  const removeFromLibrary = useCallback(async (id: string) => {
    try {
      const type = libraryItems.find(i => i.id === id)?.type || 'movie';
      await catalogService.removeFromLibrary(type, id);
      return true;
    } catch (e) {
      if (__DEV__) console.error('Error removing from library via catalogService:', e);
      // Fallback local write
      const updatedItems = libraryItems.filter(item => item.id !== id);
      setLibraryItems(updatedItems);
      await saveLibraryItems(updatedItems);
      return true;
    }
  }, [libraryItems, saveLibraryItems]);

  // Toggle item in library
  const toggleLibrary = useCallback(async (item: StreamingContent) => {
    const exists = libraryItems.some(i => i.id === item.id);
    
    if (exists) {
      return await removeFromLibrary(item.id);
    } else {
      return await addToLibrary(item);
    }
  }, [libraryItems, addToLibrary, removeFromLibrary]);

  // Check if item is in library
  const isInLibrary = useCallback((id: string) => {
    return libraryItems.some(item => item.id === id);
  }, [libraryItems]);

  // Load library items on mount
  useEffect(() => {
    loadLibraryItems();
  }, [loadLibraryItems]);

  // Subscribe to catalogService library updates
  useEffect(() => {
    const unsubscribe = catalogService.subscribeToLibraryUpdates((items) => {
      if (__DEV__) console.log('[useLibrary] Received library update from catalogService:', items.length, 'items');
      setLibraryItems(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return {
    libraryItems,
    loading,
    addToLibrary,
    removeFromLibrary,
    toggleLibrary,
    isInLibrary,
    loadLibraryItems
  };
}; 