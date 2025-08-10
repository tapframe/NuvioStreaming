import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  Dimensions,
  StatusBar,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ColorPicker from 'react-native-wheel-color-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../styles/colors';
import { useTheme, Theme, DEFAULT_THEMES } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings } from '../hooks/useSettings';

const { width } = Dimensions.get('window');

// Theme categories for organization
const THEME_CATEGORIES = [
  { id: 'all', name: 'All Themes' },
  { id: 'dark', name: 'Dark Themes' },
  { id: 'colorful', name: 'Colorful' },
  { id: 'custom', name: 'My Themes' },
];

interface ThemeCardProps {
  theme: Theme;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ThemeCard: React.FC<ThemeCardProps> = ({ 
  theme, 
  isSelected, 
  onSelect,
  onEdit,
  onDelete
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.themeCard,
        isSelected && styles.selectedThemeCard,
        { 
          borderColor: isSelected ? theme.colors.primary : 'transparent',
          backgroundColor: Platform.OS === 'ios' 
            ? `${theme.colors.darkBackground}60` 
            : 'rgba(255, 255, 255, 0.07)'
        }
      ]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={styles.themeCardHeader}>
        <Text style={[styles.themeCardTitle, { color: theme.colors.text }]}>
          {theme.name}
        </Text>
        {isSelected && (
          <MaterialIcons name="check-circle" size={18} color={theme.colors.primary} />
        )}
      </View>
      
      <View style={styles.colorPreviewContainer}>
        <View style={[styles.colorPreview, { backgroundColor: theme.colors.primary }, styles.colorPreviewShadow]} />
        <View style={[styles.colorPreview, { backgroundColor: theme.colors.secondary }, styles.colorPreviewShadow]} />
        <View style={[styles.colorPreview, { backgroundColor: theme.colors.darkBackground }, styles.colorPreviewShadow]} />
      </View>
      
      {theme.isEditable && (
        <View style={styles.themeCardActions}>
          {onEdit && (
            <TouchableOpacity 
              style={[styles.themeCardAction, styles.buttonShadow]} 
              onPress={onEdit}
            >
              <MaterialIcons name="edit" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity 
              style={[styles.themeCardAction, styles.buttonShadow]} 
              onPress={onDelete}
            >
              <MaterialIcons name="delete" size={16} color={theme.colors.error} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// Filter tab component
interface FilterTabProps {
  category: { id: string; name: string };
  isActive: boolean;
  onPress: () => void;
  primaryColor: string;
}

const FilterTab: React.FC<FilterTabProps> = ({ 
  category, 
  isActive, 
  onPress,
  primaryColor 
}) => (
  <TouchableOpacity
    style={[
      styles.filterTab,
      isActive && { backgroundColor: primaryColor },
      styles.buttonShadow
    ]}
    onPress={onPress}
  >
    <Text 
      style={[
        styles.filterTabText, 
        isActive && { color: '#FFFFFF' }
      ]}
    >
      {category.name}
    </Text>
  </TouchableOpacity>
);

type ColorKey = 'primary' | 'secondary' | 'darkBackground';

interface ThemeColorEditorProps {
  initialColors: {
    primary: string;
    secondary: string;
    darkBackground: string;
  };
  onSave: (colors: {
    primary: string;
    secondary: string;
    darkBackground: string;
    name: string;
  }) => void;
  onCancel: () => void;
}

const ThemeColorEditor: React.FC<ThemeColorEditorProps> = ({
  initialColors,
  onSave,
  onCancel
}) => {
  const [themeName, setThemeName] = useState('Custom Theme');
  const [selectedColorKey, setSelectedColorKey] = useState<ColorKey>('primary');
  const [themeColors, setThemeColors] = useState({
    primary: initialColors.primary,
    secondary: initialColors.secondary,
    darkBackground: initialColors.darkBackground,
  });

  const handleColorChange = useCallback((color: string) => {
    setThemeColors(prev => ({
      ...prev,
      [selectedColorKey]: color,
    }));
  }, [selectedColorKey]);

  const handleSave = () => {
    if (!themeName.trim()) {
      Alert.alert('Invalid Name', 'Please enter a valid theme name');
      return;
    }
    onSave({ 
      ...themeColors,
      name: themeName 
    });
  };

  // Compact preview component
  const ThemePreview = () => (
    <View style={[styles.previewContainer, { backgroundColor: themeColors.darkBackground }]}>
      <View style={styles.previewContent}>
        {/* App header */}
        <View style={styles.previewHeader}>
          <View style={styles.previewHeaderTitle} />
          <View style={styles.previewIconGroup}>
            <View style={styles.previewIcon} />
            <View style={styles.previewIcon} />
          </View>
        </View>
        
        {/* Content area */}
        <View style={styles.previewBody}>
          {/* Featured content poster */}
          <View style={styles.previewFeatured}>
            <View style={styles.previewPosterGradient} />
            <View style={styles.previewTitle} />
            <View style={styles.previewButtonRow}>
              <View style={[styles.previewPlayButton, { backgroundColor: themeColors.primary }]} />
              <View style={styles.previewActionButton} />
            </View>
          </View>
          
          {/* Content row */}
          <View style={styles.previewSectionHeader}>
            <View style={styles.previewSectionTitle} />
          </View>
          <View style={styles.previewPosterRow}>
            <View style={styles.previewPoster} />
            <View style={styles.previewPoster} />
            <View style={styles.previewPoster} />
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.editorContainer}>
      <View style={styles.editorHeader}>
        <TouchableOpacity
          style={styles.editorBackButton}
          onPress={onCancel}
        >
          <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TextInput
          style={styles.editorTitleInput}
          value={themeName}
          onChangeText={setThemeName}
          placeholder="Theme name"
          placeholderTextColor="rgba(255,255,255,0.5)"
        />
        <TouchableOpacity
          style={styles.editorSaveButton}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.editorBody}>
        <View style={styles.colorSectionRow}>
          <ThemePreview />
          
          <View style={styles.colorButtonsColumn}>
            <TouchableOpacity
              style={[
                styles.colorSelectorButton,
                selectedColorKey === 'primary' && styles.selectedColorButton,
                { backgroundColor: themeColors.primary }
              ]}
              onPress={() => setSelectedColorKey('primary')}
            >
              <Text style={styles.colorButtonText}>Primary</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.colorSelectorButton,
                selectedColorKey === 'secondary' && styles.selectedColorButton,
                { backgroundColor: themeColors.secondary }
              ]}
              onPress={() => setSelectedColorKey('secondary')}
            >
              <Text style={styles.colorButtonText}>Secondary</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.colorSelectorButton,
                selectedColorKey === 'darkBackground' && styles.selectedColorButton,
                { backgroundColor: themeColors.darkBackground }
              ]}
              onPress={() => setSelectedColorKey('darkBackground')}
            >
              <Text style={styles.colorButtonText}>Background</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.colorPickerContainer}>
          <ColorPicker
            color={themeColors[selectedColorKey]}
            onColorChange={handleColorChange}
            thumbSize={22}
            sliderSize={22}
            noSnap={true}
            row={false}
          />
        </View>
      </View>
    </View>
  );
};

const ThemeScreen: React.FC = () => {
  const { 
    currentTheme, 
    availableThemes, 
    setCurrentTheme,
    addCustomTheme,
    updateCustomTheme,
    deleteCustomTheme
  } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { settings, updateSetting } = useSettings();
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  
  // Force consistent status bar settings
  useEffect(() => {
    const applyStatusBarConfig = () => {
      if (Platform.OS === 'android') {
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
      }
    };
    
    applyStatusBarConfig();
    
    // Re-apply on focus
    const unsubscribe = navigation.addListener('focus', applyStatusBarConfig);
    return unsubscribe;
  }, [navigation]);

  // Filter themes based on selected category
  const filteredThemes = useMemo(() => {
    switch (activeFilter) {
      case 'dark':
        // Themes with darker colors
        return availableThemes.filter(theme => 
          !theme.isEditable && 
          theme.id !== 'neon' && 
          theme.id !== 'retro'
        );
      case 'colorful':
        // Themes with vibrant colors
        return availableThemes.filter(theme => 
          !theme.isEditable && 
          (theme.id === 'neon' || 
           theme.id === 'retro' || 
           theme.id === 'sunset' || 
           theme.id === 'amber')
        );
      case 'custom':
        // User's custom themes
        return availableThemes.filter(theme => theme.isEditable);
      default:
        // All themes
        return availableThemes;
    }
  }, [availableThemes, activeFilter]);

  const handleThemeSelect = useCallback((themeId: string) => {
    setCurrentTheme(themeId);
  }, [setCurrentTheme]);

  const handleEditTheme = useCallback((theme: Theme) => {
    setEditingTheme(theme);
    setIsEditMode(true);
  }, []);

  const handleDeleteTheme = useCallback((theme: Theme) => {
    Alert.alert(
      'Delete Theme',
      `Are you sure you want to delete "${theme.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteCustomTheme(theme.id)
        }
      ]
    );
  }, [deleteCustomTheme]);

  const handleCreateTheme = useCallback(() => {
    setEditingTheme(null);
    setIsEditMode(true);
  }, []);

  const handleSaveTheme = useCallback((themeData: any) => {
    if (editingTheme) {
      // Update existing theme
      updateCustomTheme({
        ...editingTheme,
        name: themeData.name || editingTheme.name,
        colors: {
          ...editingTheme.colors,
          primary: themeData.primary,
          secondary: themeData.secondary,
          darkBackground: themeData.darkBackground,
        }
      });
    } else {
      // Create new theme
      addCustomTheme({
        name: themeData.name || 'Custom Theme',
        colors: {
          ...currentTheme.colors,
          primary: themeData.primary,
          secondary: themeData.secondary,
          darkBackground: themeData.darkBackground,
        }
      });
    }
    
    setIsEditMode(false);
    setEditingTheme(null);
  }, [editingTheme, updateCustomTheme, addCustomTheme, currentTheme]);

  const handleCancelEdit = useCallback(() => {
    setIsEditMode(false);
    setEditingTheme(null);
  }, []);

  if (isEditMode) {
    const initialColors = editingTheme ? {
      primary: editingTheme.colors.primary,
      secondary: editingTheme.colors.secondary,
      darkBackground: editingTheme.colors.darkBackground,
    } : {
      primary: currentTheme.colors.primary,
      secondary: currentTheme.colors.secondary,
      darkBackground: currentTheme.colors.darkBackground,
    };

    return (
      <View style={[
        styles.container, 
        { 
          backgroundColor: currentTheme.colors.darkBackground,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }
      ]}>
        <ThemeColorEditor
          initialColors={initialColors}
          onSave={handleSaveTheme}
          onCancel={handleCancelEdit}
        />
      </View>
    );
  }

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: currentTheme.colors.darkBackground,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }
    ]}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={[styles.backButton, styles.buttonShadow]}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>App Themes</Text>
      </View>
      
      {/* Category filter */}
      <View style={styles.filterContainer}>
        <FlatList
          data={THEME_CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FilterTab
              category={item}
              isActive={activeFilter === item.id}
              onPress={() => setActiveFilter(item.id)}
              primaryColor={currentTheme.colors.primary}
            />
          )}
          contentContainerStyle={styles.filterList}
        />
      </View>
      
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: currentTheme.colors.textMuted }]}>
          SELECT THEME
        </Text>
        
        <View style={styles.themeGrid}>
          {filteredThemes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isSelected={currentTheme.id === theme.id}
              onSelect={() => handleThemeSelect(theme.id)}
              onEdit={theme.isEditable ? () => handleEditTheme(theme) : undefined}
              onDelete={theme.isEditable ? () => handleDeleteTheme(theme) : undefined}
            />
          ))}
        </View>
        
        <TouchableOpacity 
          style={[
            styles.createButton, 
            { backgroundColor: currentTheme.colors.primary },
            styles.buttonShadow
          ]} 
          onPress={handleCreateTheme}
        >
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.createButtonText}>Create Custom Theme</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: currentTheme.colors.textMuted, marginTop: 24 }]}>
          OPTIONS
        </Text>

        <View style={styles.optionRow}>
          <Text style={[styles.optionLabel, { color: currentTheme.colors.text }]}>
            Use Dominant Color from Artwork
          </Text>
          <Switch
            value={settings.useDominantBackgroundColor}
            onValueChange={(value) => updateSetting('useDominantBackgroundColor', value)}
            trackColor={{ false: '#767577', true: currentTheme.colors.primary }}
            thumbColor={Platform.OS === 'android' ? currentTheme.colors.primary : '#f4f3f4'}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
    paddingBottom: 24,
  },
  filterContainer: {
    marginBottom: 8,
  },
  filterList: {
    paddingHorizontal: 12,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  themeCard: {
    width: (width - 36) / 2,
    marginBottom: 12,
    borderRadius: 12,
    padding: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectedThemeCard: {
    borderWidth: 2,
  },
  themeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  themeCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  colorPreviewContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorPreviewShadow: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  themeCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  themeCardAction: {
    padding: 6,
    marginLeft: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
  },
  buttonShadow: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 8,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 14,
  },
  
  // Editor styles
  editorContainer: {
    flex: 1,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  editorBackButton: {
    padding: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  editorTitleInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 10,
    padding: 0,
    height: 28,
  },
  editorSaveButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  editorBody: {
    flex: 1,
    padding: 10,
  },
  colorSectionRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  colorButtonsColumn: {
    width: width * 0.4 - 20, // 40% minus padding
    marginLeft: 10,
    justifyContent: 'space-between',
  },
  previewContainer: {
    width: width * 0.6,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    padding: 4,
  },
  previewContent: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  previewHeader: {
    height: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  previewHeaderTitle: {
    width: 40,
    height: 8,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  previewIconGroup: {
    flexDirection: 'row',
  },
  previewIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginLeft: 4,
  },
  previewBody: {
    flex: 1,
    padding: 2,
  },
  previewFeatured: {
    height: 50,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    marginBottom: 4,
    justifyContent: 'flex-end',
    padding: 4,
  },
  previewPosterGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  previewTitle: {
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  previewButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewPlayButton: {
    width: 35,
    height: 12,
    borderRadius: 3,
    marginRight: 4,
  },
  previewActionButton: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  previewSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  previewSectionTitle: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  previewPosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewPoster: {
    width: '30%',
    height: 30,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  colorSelectorButton: {
    height: 36,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  selectedColorButton: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  colorButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  colorPickerContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  
  // Legacy styles - keep for backward compatibility
  editorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  cancelButton: {
    width: (width - 36) / 2,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  saveButton: {
    width: (width - 36) / 2,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default ThemeScreen; 