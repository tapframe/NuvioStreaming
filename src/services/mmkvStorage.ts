import { Platform } from 'react-native';
import { logger } from '../utils/logger';

// Platform-specific storage implementation
let createMMKV: any = null;
if (Platform.OS !== 'web') {
  try {
    createMMKV = require('react-native-mmkv').createMMKV;
  } catch (e) {
    logger.warn('[MMKVStorage] react-native-mmkv not available, using fallback');
  }
}

// Web fallback storage interface
class WebStorage {
  getString(key: string): string | undefined {
    try {
      const value = localStorage.getItem(key);
      return value ?? undefined;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string | number | boolean): void {
    try {
      localStorage.setItem(key, String(value));
    } catch (e) {
      logger.error('[WebStorage] Error setting item:', e);
    }
  }

  getNumber(key: string): number | undefined {
    try {
      const value = localStorage.getItem(key);
      return value ? Number(value) : undefined;
    } catch {
      return undefined;
    }
  }

  getBoolean(key: string): boolean | undefined {
    try {
      const value = localStorage.getItem(key);
      return value === 'true' ? true : value === 'false' ? false : undefined;
    } catch {
      return undefined;
    }
  }

  contains(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      logger.error('[WebStorage] Error removing item:', e);
    }
  }

  clearAll(): void {
    try {
      localStorage.clear();
    } catch (e) {
      logger.error('[WebStorage] Error clearing storage:', e);
    }
  }

  getAllKeys(): string[] {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  }
}

class MMKVStorage {
  private static instance: MMKVStorage;
  private storage: any;
  // In-memory cache for frequently accessed data
  private cache = new Map<string, { value: any; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds
  private readonly MAX_CACHE_SIZE = 100; // Limit cache size to prevent memory issues

  private constructor() {
    // Use MMKV on native platforms, localStorage on web
    if (createMMKV) {
      this.storage = createMMKV();
    } else {
      this.storage = new WebStorage();
    }
  }

  public static getInstance(): MMKVStorage {
    if (!MMKVStorage.instance) {
      MMKVStorage.instance = new MMKVStorage();
    }
    return MMKVStorage.instance;
  }

  // Cache management methods
  private getCached(key: string): string | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCached(key: string, value: any): void {
    // Implement LRU-style eviction if cache is too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  private invalidateCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  // AsyncStorage-compatible API
  async getItem(key: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.getCached(key);
      if (cached !== null) {
        return cached;
      }

      // Read from storage
      const value = this.storage.getString(key);
      const result = value ?? null;

      // Cache the result
      if (result !== null) {
        this.setCached(key, result);
      }

      return result;
    } catch (error) {
      logger.error(`[MMKVStorage] Error getting item ${key}:`, error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      this.storage.set(key, value);
      // Update cache immediately
      this.setCached(key, value);
    } catch (error) {
      logger.error(`[MMKVStorage] Error setting item ${key}:`, error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      // MMKV V4 uses 'remove' method, not 'delete'
      if (this.storage.contains(key)) {
        this.storage.remove(key);
      }
      // Invalidate cache
      this.invalidateCache(key);
    } catch (error) {
      logger.error(`[MMKVStorage] Error removing item ${key}:`, error);
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const keys = this.storage.getAllKeys();
      return Array.from(keys) as string[];
    } catch (error) {
      logger.error('[MMKVStorage] Error getting all keys:', error);
      return [];
    }
  }

  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    try {
      const results: [string, string | null][] = [];
      for (const key of keys) {
        const value = this.storage.getString(key);
        results.push([key, value ?? null]);
      }
      return results;
    } catch (error) {
      logger.error('[MMKVStorage] Error in multiGet:', error);
      return keys.map(key => [key, null] as [string, string | null]);
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage.clearAll();
      this.cache.clear();
    } catch (error) {
      logger.error('[MMKVStorage] Error clearing storage:', error);
    }
  }

  // Direct MMKV access methods (for performance-critical operations)
  getString(key: string): string | undefined {
    return this.storage.getString(key);
  }

  setString(key: string, value: string): void {
    this.storage.set(key, value);
  }

  getNumber(key: string): number | undefined {
    return this.storage.getNumber(key);
  }

  setNumber(key: string, value: number): void {
    this.storage.set(key, value);
  }

  getBoolean(key: string): boolean | undefined {
    return this.storage.getBoolean(key);
  }

  setBoolean(key: string, value: boolean): void {
    this.storage.set(key, value);
  }

  contains(key: string): boolean {
    return this.storage.contains(key);
  }

  delete(key: string): void {
    if (this.storage.contains(key)) {
      this.storage.remove(key);
    }
  }

  // Additional AsyncStorage-compatible methods
  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    try {
      for (const [key, value] of keyValuePairs) {
        this.storage.set(key, value);
      }
    } catch (error) {
      logger.error('[MMKVStorage] Error in multiSet:', error);
    }
  }

  async multiRemove(keys: string[]): Promise<void> {
    try {
      for (const key of keys) {
        if (this.storage.contains(key)) {
          this.storage.remove(key);
        }
      }
    } catch (error) {
      logger.error('[MMKVStorage] Error in multiRemove:', error);
    }
  }
}

export const mmkvStorage = MMKVStorage.getInstance();
