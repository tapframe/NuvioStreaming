import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Platform } from 'react-native';
import { GenreCatalog, Category } from '../../constants/discover';
import CatalogSection from './CatalogSection';

interface CatalogsListProps {
  catalogs: GenreCatalog[];
  selectedCategory: Category;
}

const CatalogsList = ({ catalogs, selectedCategory }: CatalogsListProps) => {
  const renderCatalogItem = useCallback(({ item }: { item: GenreCatalog }) => (
    <CatalogSection 
      catalog={item} 
      selectedCategory={selectedCategory}
    />
  ), [selectedCategory]);

  // Memoize list key extractor
  const catalogKeyExtractor = useCallback((item: GenreCatalog) => item.genre, []);

  return (
    <FlatList
      data={catalogs}
      renderItem={renderCatalogItem}
      keyExtractor={catalogKeyExtractor}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      removeClippedSubviews={Platform.OS === 'android'}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
});

export default React.memo(CatalogsList); 