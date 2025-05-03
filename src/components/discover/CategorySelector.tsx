import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../styles';
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
  
  const renderCategoryButton = useCallback((category: Category) => {
    const isSelected = selectedCategory.id === category.id;
    
    return (
      <TouchableOpacity
        key={category.id}
        style={[
          styles.categoryButton,
          isSelected && styles.selectedCategoryButton
        ]}
        onPress={() => onSelectCategory(category)}
        activeOpacity={0.7}
      >
        <MaterialIcons 
          name={category.icon} 
          size={24} 
          color={isSelected ? colors.white : colors.mediumGray} 
        />
        <Text
          style={[
            styles.categoryText,
            isSelected && styles.selectedCategoryText
          ]}
        >
          {category.name}
        </Text>
      </TouchableOpacity>
    );
  }, [selectedCategory, onSelectCategory]);

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
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedCategoryButton: {
    backgroundColor: colors.primary,
  },
  categoryText: {
    color: colors.mediumGray,
    fontWeight: '600',
    fontSize: 16,
  },
  selectedCategoryText: {
    color: colors.white,
    fontWeight: '700',
  },
});

export default React.memo(CategorySelector); 