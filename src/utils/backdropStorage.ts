import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_BACKDROP_KEY = 'selected_custom_backdrop';

export interface SelectedBackdrop {
  file_path: string;
  width: number;
  height: number;
  aspect_ratio: number;
}

export const getSelectedBackdrop = async (): Promise<SelectedBackdrop | null> => {
  try {
    const saved = await AsyncStorage.getItem(SELECTED_BACKDROP_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return null;
  } catch (error) {
    console.error('Failed to load selected backdrop:', error);
    return null;
  }
};

export const getSelectedBackdropUrl = async (size: 'original' | 'w1280' | 'w780' = 'original'): Promise<string | null> => {
  const backdrop = await getSelectedBackdrop();
  if (backdrop) {
    return `https://image.tmdb.org/t/p/${size}${backdrop.file_path}`;
  }
  return null;
};
