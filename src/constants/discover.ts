import { MaterialIcons } from '@expo/vector-icons';
import { StreamingContent } from '../services/catalogService';

export interface Category {
  id: string;
  name: string;
  type: 'movie' | 'series' | 'channel' | 'tv';
  icon: keyof typeof MaterialIcons.glyphMap;
}

export interface GenreCatalog {
  genre: string;
  items: StreamingContent[];
}

export const CATEGORIES: Category[] = [
  { id: 'movie', name: 'Movies', type: 'movie', icon: 'local-movies' },
  { id: 'series', name: 'TV Shows', type: 'series', icon: 'live-tv' }
];

// Common genres for movies and TV shows
export const COMMON_GENRES = [
  'All',
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western'
]; 