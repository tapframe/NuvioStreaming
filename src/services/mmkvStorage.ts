import { createMMKV } from 'react-native-mmkv';
import { logger } from '../utils/logger';

class MMKVStorage {
  private static instance: MMKVStorage;
  private storage = createMMKV();

  private constructor() {}

  public static getInstance(): MMKVStorage {
    if (!MMKVStorage.instance) {
      MMKVStorage.instance = new MMKVStorage();
    }
    return MMKVStorage.instance;
  }

  // AsyncStorage-compatible API
  async getItem(key: string): Promise<string | null> {
    try {
      const value = this.storage.getString(key);
      return value ?? null;
    } catch (error) {
      logger.error(`[MMKVStorage] Error getting item ${key}:`, error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      this.storage.set(key, value);
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
