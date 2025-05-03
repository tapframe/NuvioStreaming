import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as defaultColors } from '../styles/colors';

// Define the Theme interface
export interface Theme {
  id: string;
  name: string;
  colors: typeof defaultColors;
  isEditable: boolean;
}

// Default built-in themes
export const DEFAULT_THEMES: Theme[] = [
  {
    id: 'default',
    name: 'Default Dark',
    colors: defaultColors,
    isEditable: false,
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    colors: {
      ...defaultColors,
      primary: '#3498db',
      secondary: '#2ecc71',
      darkBackground: '#0a192f',
    },
    isEditable: false,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: {
      ...defaultColors,
      primary: '#ff7e5f',
      secondary: '#feb47b',
      darkBackground: '#1a0f0b',
    },
    isEditable: false,
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    colors: {
      ...defaultColors,
      primary: '#a786df',
      secondary: '#5e72e4',
      darkBackground: '#0f0f1a',
    },
    isEditable: false,
  },
];

// Theme context props
interface ThemeContextProps {
  currentTheme: Theme;
  availableThemes: Theme[];
  setCurrentTheme: (themeId: string) => void;
  addCustomTheme: (theme: Omit<Theme, 'id' | 'isEditable'>) => void;
  updateCustomTheme: (theme: Theme) => void;
  deleteCustomTheme: (themeId: string) => void;
}

// Create the context
const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

// Storage keys
const CURRENT_THEME_KEY = 'current_theme';
const CUSTOM_THEMES_KEY = 'custom_themes';

// Provider component
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentThemeState] = useState<Theme>(DEFAULT_THEMES[0]);
  const [availableThemes, setAvailableThemes] = useState<Theme[]>(DEFAULT_THEMES);

  // Load themes from AsyncStorage on mount
  useEffect(() => {
    const loadThemes = async () => {
      try {
        // Load current theme ID
        const savedThemeId = await AsyncStorage.getItem(CURRENT_THEME_KEY);
        
        // Load custom themes
        const customThemesJson = await AsyncStorage.getItem(CUSTOM_THEMES_KEY);
        const customThemes = customThemesJson ? JSON.parse(customThemesJson) : [];
        
        // Combine default and custom themes
        const allThemes = [...DEFAULT_THEMES, ...customThemes];
        setAvailableThemes(allThemes);
        
        // Set current theme
        if (savedThemeId) {
          const theme = allThemes.find(t => t.id === savedThemeId);
          if (theme) {
            setCurrentThemeState(theme);
          }
        }
      } catch (error) {
        console.error('Failed to load themes:', error);
      }
    };
    
    loadThemes();
  }, []);

  // Set current theme
  const setCurrentTheme = async (themeId: string) => {
    const theme = availableThemes.find(t => t.id === themeId);
    if (theme) {
      setCurrentThemeState(theme);
      await AsyncStorage.setItem(CURRENT_THEME_KEY, themeId);
    }
  };

  // Add custom theme
  const addCustomTheme = async (themeData: Omit<Theme, 'id' | 'isEditable'>) => {
    try {
      // Generate unique ID
      const id = `custom_${Date.now()}`;
      
      // Create new theme object
      const newTheme: Theme = {
        id,
        ...themeData,
        isEditable: true,
      };
      
      // Add to available themes
      const customThemes = availableThemes.filter(t => t.isEditable);
      const updatedCustomThemes = [...customThemes, newTheme];
      const updatedAllThemes = [...DEFAULT_THEMES, ...updatedCustomThemes];
      
      // Save to storage
      await AsyncStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updatedCustomThemes));
      
      // Update state
      setAvailableThemes(updatedAllThemes);
      
      // Set as current theme
      setCurrentThemeState(newTheme);
      await AsyncStorage.setItem(CURRENT_THEME_KEY, id);
    } catch (error) {
      console.error('Failed to add custom theme:', error);
    }
  };

  // Update custom theme
  const updateCustomTheme = async (updatedTheme: Theme) => {
    try {
      if (!updatedTheme.isEditable) {
        throw new Error('Cannot edit built-in themes');
      }
      
      // Find and update the theme
      const customThemes = availableThemes.filter(t => t.isEditable);
      const updatedCustomThemes = customThemes.map(t => 
        t.id === updatedTheme.id ? updatedTheme : t
      );
      
      // Update available themes
      const updatedAllThemes = [...DEFAULT_THEMES, ...updatedCustomThemes];
      
      // Save to storage
      await AsyncStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updatedCustomThemes));
      
      // Update state
      setAvailableThemes(updatedAllThemes);
      
      // Update current theme if needed
      if (currentTheme.id === updatedTheme.id) {
        setCurrentThemeState(updatedTheme);
      }
    } catch (error) {
      console.error('Failed to update custom theme:', error);
    }
  };

  // Delete custom theme
  const deleteCustomTheme = async (themeId: string) => {
    try {
      // Find theme to delete
      const themeToDelete = availableThemes.find(t => t.id === themeId);
      
      if (!themeToDelete || !themeToDelete.isEditable) {
        throw new Error('Cannot delete built-in themes or theme not found');
      }
      
      // Filter out the theme
      const customThemes = availableThemes.filter(t => t.isEditable && t.id !== themeId);
      const updatedAllThemes = [...DEFAULT_THEMES, ...customThemes];
      
      // Save to storage
      await AsyncStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes));
      
      // Update state
      setAvailableThemes(updatedAllThemes);
      
      // Reset to default theme if current theme was deleted
      if (currentTheme.id === themeId) {
        setCurrentThemeState(DEFAULT_THEMES[0]);
        await AsyncStorage.setItem(CURRENT_THEME_KEY, DEFAULT_THEMES[0].id);
      }
    } catch (error) {
      console.error('Failed to delete custom theme:', error);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        availableThemes,
        setCurrentTheme,
        addCustomTheme,
        updateCustomTheme,
        deleteCustomTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook to use the theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
} 