import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { Category } from '../../constants/discover';

interface CategorySelectorProps {
  categories: Category[];
  selectedCategory: Category;
  onSelectCategory: (category: Category) => void;
}

const CategorySelector = ({ 
  categories, 
  selectedCategory, 
  onSelectCategory 
}: CategorySelectorProps) => {
  const { currentTheme } = useTheme();
  
  const renderCategoryButton = useCallback((category: Category) => {
    const isSelected = selectedCategory.id === category.id;
    
    return (
      <TouchableOpacity
        key={category.id}
        style={[
          styles.categoryButton,
          isSelected && { backgroundColor: currentTheme.colors.primary }
        ]}
        onPress={() => onSelectCategory(category)}
        activeOpacity={0.7}
      >
        <MaterialIcons 
          name={category.icon} 
          size={24} 
          color={isSelected ? currentTheme.colors.white : currentTheme.colors.mediumGray} 
        />
        <Text
          style={[
            styles.categoryText,
            isSelected && { color: currentTheme.colors.white, fontWeight: '700' }
          ]}
        >
          {category.name}
        </Text>
      </TouchableOpacity>
    );
  }, [selectedCategory, onSelectCategory, currentTheme]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {categories.map(renderCategoryButton)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  categoryButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    maxWidth: 160,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryText: {
    color: '#9e9e9e', // Default medium gray
    fontWeight: '600',
    fontSize: 16,
  },
});

export default React.memo(CategorySelector); 