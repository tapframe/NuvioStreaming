import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ColorPicker from 'react-native-wheel-color-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../styles/colors';
import { useTheme, Theme, DEFAULT_THEMES } from '../contexts/ThemeContext';
import { RootStackParamList } from '../navigation/AppNavigator';

const { width } = Dimensions.get('window');

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
        { borderColor: theme.colors.primary }
      ]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={styles.themeCardHeader}>
        <Text style={[styles.themeCardTitle, { color: theme.colors.text }]}>
          {theme.name}
        </Text>
        {isSelected && (
          <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
        )}
      </View>
      
      <View style={styles.colorPreviewContainer}>
        <View style={[styles.colorPreview, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.colorPreviewLabel}>Primary</Text>
        </View>
        <View style={[styles.colorPreview, { backgroundColor: theme.colors.secondary }]}>
          <Text style={styles.colorPreviewLabel}>Secondary</Text>
        </View>
        <View style={[styles.colorPreview, { backgroundColor: theme.colors.darkBackground }]}>
          <Text style={styles.colorPreviewLabel}>Background</Text>
        </View>
      </View>
      
      {theme.isEditable && (
        <View style={styles.themeCardActions}>
          {onEdit && (
            <TouchableOpacity style={styles.themeCardAction} onPress={onEdit}>
              <MaterialIcons name="edit" size={18} color={theme.colors.primary} />
              <Text style={[styles.themeCardActionText, { color: theme.colors.primary }]}>Edit</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity style={styles.themeCardAction} onPress={onDelete}>
              <MaterialIcons name="delete" size={18} color={theme.colors.error} />
              <Text style={[styles.themeCardActionText, { color: theme.colors.error }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

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

  return (
    <View style={styles.editorContainer}>
      <Text style={styles.editorTitle}>Custom Theme</Text>
      
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Theme Name</Text>
        <TextInput
          style={styles.textInput}
          value={themeName}
          onChangeText={setThemeName}
          placeholder="Enter theme name"
          placeholderTextColor="rgba(255,255,255,0.5)"
        />
      </View>
      
      <View style={styles.colorSelectorContainer}>
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
      
      <View style={styles.colorPickerContainer}>
        <ColorPicker
          color={themeColors[selectedColorKey]}
          onColorChange={handleColorChange}
          thumbSize={30}
          sliderSize={30}
          noSnap={true}
          row={false}
        />
      </View>
      
      <View style={styles.editorActions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Theme</Text>
        </TouchableOpacity>
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
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  
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
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>App Themes</Text>
      </View>
      
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.sectionTitle, { color: currentTheme.colors.textMuted }]}>
          SELECT THEME
        </Text>
        
        <View style={styles.themeGrid}>
          {availableThemes.map(theme => (
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
          style={[styles.createButton, { backgroundColor: currentTheme.colors.primary }]} 
          onPress={handleCreateTheme}
        >
          <MaterialIcons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.createButtonText}>Create Custom Theme</Text>
        </TouchableOpacity>
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
    padding: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  themeCard: {
    width: (width - 48) / 2,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedThemeCard: {
    borderWidth: 2,
  },
  themeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  themeCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  colorPreviewContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  colorPreview: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorPreviewLabel: {
    fontSize: 6,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  themeCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  themeCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  themeCardActionText: {
    fontSize: 12,
    marginLeft: 4,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  editorContainer: {
    flex: 1,
    padding: 16,
  },
  editorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  colorSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  colorSelectorButton: {
    width: (width - 64) / 3,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedColorButton: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  colorButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  colorPickerContainer: {
    height: 300,
    marginBottom: 24,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    width: (width - 48) / 2,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  saveButton: {
    width: (width - 48) / 2,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});

export default ThemeScreen; 