import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import { Asset } from 'expo-asset';

// We require the bundled mappings as a fallback.
// This ensures the app works immediately upon install without internet.
const BUNDLED_MAPPINGS = require('../assets/mappings.json');
const MAPPINGS_FILE_URI = FileSystem.documentDirectory + 'mappings.json';
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/eliasbenb/PlexAniBridge-Mappings/master/mappings.json';

interface MappingEntry {
  anidb_id?: number;
  imdb_id?: string | string[];
  mal_id?: number | number[];
  tmdb_show_id?: number;
  tmdb_movie_id?: number | number[];
  tvdb_id?: number;
  tvdb_mappings?: { [key: string]: string };
}

interface Mappings {
  [anilist_id: string]: MappingEntry;
}

class MappingService {
  private mappings: Mappings = {};
  private imdbIndex: { [imdbId: string]: string[] } = {}; // Maps IMDb ID to array of AniList IDs
  private isInitialized = false;

  /**
   * Initialize the service. Loads mappings from local storage if available,
   * otherwise falls back to the bundled JSON.
   */
  async init() {
    if (this.isInitialized) return;

    try {
      const fileInfo = await FileSystem.getInfoAsync(MAPPINGS_FILE_URI);

      if (fileInfo.exists) {
        console.log('Loading mappings from local storage...');
        const content = await FileSystem.readAsStringAsync(MAPPINGS_FILE_URI);
        this.mappings = JSON.parse(content);
      } else {
        console.log('Loading bundled mappings...');
        this.mappings = BUNDLED_MAPPINGS;
      }
    } catch (error) {
      console.error('Failed to load mappings, falling back to bundled:', error);
      this.mappings = BUNDLED_MAPPINGS;
    }

    this.buildIndex();
    this.isInitialized = true;
    console.log(`MappingService initialized with ${Object.keys(this.mappings).length} entries.`);
    
    // Trigger background update
    this.checkForUpdates().catch(err => console.warn('Background mapping update failed:', err));
  }

  /**
   * Build a reverse index for fast IMDb lookups.
   */
  private buildIndex() {
    this.imdbIndex = {};
    for (const [anilistId, entry] of Object.entries(this.mappings)) {
      if (entry.imdb_id) {
        const imdbIds = Array.isArray(entry.imdb_id) ? entry.imdb_id : [entry.imdb_id];
        for (const id of imdbIds) {
          if (!this.imdbIndex[id]) {
            this.imdbIndex[id] = [];
          }
          this.imdbIndex[id].push(anilistId);
        }
      }
    }
  }

  /**
   * Convert a MAL ID to an IMDb ID.
   * This is a reverse lookup used by Stremio services.
   */
  getImdbIdFromMalId(malId: number): string | null {
    if (!this.isInitialized) {
        console.warn('MappingService not initialized. Call init() first.');
    }

    // Since we don't have a direct index for MAL IDs yet, we iterate (inefficient but works for now)
    // Optimization: In a real app, we should build a malIndex similar to imdbIndex during init()
    for (const entry of Object.values(this.mappings)) {
        if (entry.mal_id) {
            const malIds = Array.isArray(entry.mal_id) ? entry.mal_id : [entry.mal_id];
            if (malIds.includes(malId)) {
                if (entry.imdb_id) {
                    return Array.isArray(entry.imdb_id) ? entry.imdb_id[0] : entry.imdb_id;
                }
            }
        }
    }
    return null;
  }

  /**
   * Check for updates from the GitHub repository and save to local storage.
   */
  async checkForUpdates() {
    try {
      console.log('Checking for mapping updates...');
      const response = await axios.get(GITHUB_RAW_URL);
      
      if (response.data && typeof response.data === 'object') {
        const newMappings = response.data;
        const newCount = Object.keys(newMappings).length;
        const currentCount = Object.keys(this.mappings).length;

        // Basic sanity check: ensure we didn't download an empty or drastically smaller file
        if (newCount > 1000) {
            await FileSystem.writeAsStringAsync(MAPPINGS_FILE_URI, JSON.stringify(newMappings));
            console.log(`Mappings updated successfully. New count: ${newCount} (Old: ${currentCount})`);
            
            // Optional: Hot-reload the mappings immediately?
            // For stability, usually better to wait for next app restart, 
            // but we can update in memory too.
            this.mappings = newMappings;
            this.buildIndex();
        }
      }
    } catch (error) {
      console.warn('Failed to update mappings:', error);
    }
  }

  /**
   * Convert an IMDb ID + Season/Episode to a MAL ID.
   * Handles complex mapping logic (split seasons, episode offsets).
   */
  getMalId(imdbId: string, season: number, episode: number): number | null {
    if (!this.isInitialized) {
        console.warn('MappingService not initialized. Call init() first.');
    }

    const anilistIds = this.imdbIndex[imdbId];
    if (!anilistIds || anilistIds.length === 0) return null;

    // Iterate through all potential matches (usually just 1, but sometimes splits)
    for (const anilistId of anilistIds) {
      const entry = this.mappings[anilistId];
      if (!entry) continue;

      // If there are no specific mappings, assumes 1:1 match if it's the only entry
      // But usually, we look for 'tvdb_mappings' (which this repo uses for seasons)
      // or 'tmdb_mappings'. This repo uses 'tvdb_mappings' for structure.
      
      if (this.isMatch(entry, season, episode)) {
        return this.extractMalId(entry);
      }
    }

    // Fallback: If we have exactly one match and no mapping rules defined, return it.
    if (anilistIds.length === 1) {
        const entry = this.mappings[anilistIds[0]];
        // Only return if it doesn't have restrictive mapping rules that failed above
        if (!entry.tvdb_mappings) {
             return this.extractMalId(entry);
        }
    }

    return null;
  }

  private extractMalId(entry: MappingEntry): number | null {
      if (!entry.mal_id) return null;
      if (Array.isArray(entry.mal_id)) return entry.mal_id[0];
      return entry.mal_id;
  }

  /**
   * Logic to check if a specific Season/Episode fits within the entry's mapping rules.
   */
  private isMatch(entry: MappingEntry, targetSeason: number, targetEpisode: number): boolean {
    const mappings = entry.tvdb_mappings;
    if (!mappings) {
        // If no mappings exist, we can't be sure, but usually strict matching requires them.
        // However, some entries might be simple movies or single seasons.
        return true; 
    }

    const seasonKey = `s${targetSeason}`;
    const rule = mappings[seasonKey];

    if (rule === undefined) return false; // Season not in this entry

    // Empty string means "matches whole season 1:1"
    if (rule === "") return true;

    // Parse rules: "e1-e12|2,e13-"
    const parts = rule.split(',');
    for (const part of parts) {
        if (this.checkRulePart(part, targetEpisode)) {
            return true;
        }
    }

    return false;
  }

  private checkRulePart(part: string, targetEpisode: number): boolean {
      // Format: e{start}-e{end}|{ratio}
      // Examples: "e1-e12", "e13-", "e1", "e1-e12|2"
      
      let [range, ratioStr] = part.split('|');
      
      // We currently ignore ratio for *matching* purposes (just checking if it's in range)
      // Ratio is used for calculating the absolute episode number if we were converting TO absolute.
      
      const [startStr, endStr] = range.split('-');
      
      const start = parseInt(startStr.replace('e', ''), 10);
      
      // Single episode mapping: "e5"
      if (!endStr && !range.includes('-')) {
          return targetEpisode === start;
      }

      // Range
      if (targetEpisode < start) return false;

      // Open ended range: "e13-"
      if (endStr === '') {
          return true;
      }

      // Closed range: "e1-e12"
      if (endStr) {
          const end = parseInt(endStr.replace('e', ''), 10);
          if (targetEpisode > end) return false;
      }

      return true;
  }
}

export const mappingService = new MappingService();
