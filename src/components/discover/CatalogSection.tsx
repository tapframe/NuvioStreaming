import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { colors } from '../../styles';
import { GenreCatalog, Category } from '../../constants/discover';
import { StreamingContent } from '../../services/catalogService';
import { RootStackParamList } from '../../navigation/AppNavigator';
import ContentItem from './ContentItem';

interface CatalogSectionProps {
  catalog: GenreCatalog;
  selectedCategory: Category;
}

const CatalogSection = ({ catalog, selectedCategory }: CatalogSectionProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { width } = Dimensions.get('window');
  const itemWidth = (width - 48) / 2.2; // 2 items per row with spacing
  
  // Only display first 3 items in each section
  const displayItems = useMemo(() => 
    catalog.items.slice(0, 3), 
    [catalog.items]
  );
  
  const handleContentPress = useCallback((item: StreamingContent) => {
    navigation.navigate('Metadata', { id: item.id, type: item.type });
  }, [navigation]);
  
  const handleSeeMorePress = useCallback(() => {
    navigation.navigate('Catalog', {
      id: catalog.genre, 
      type: selectedCategory.type,
      name: `${catalog.genre} ${selectedCategory.name}`,
      genreFilter: catalog.genre
    });
  }, [navigation, selectedCategory, catalog.genre]);
  
  const renderItem = useCallback(({ item }: { item: StreamingContent }) => (
    <ContentItem 
      item={item} 
      onPress={() => handleContentPress(item)} 
      width={itemWidth}
    />
  ), [handleContentPress, itemWidth]);
  
  const keyExtractor = useCallback((item: StreamingContent) => item.id, []);
  
  const ItemSeparator = useCallback(() => (
    <View style={{ width: 16 }} />
  ), []);
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{catalog.genre}</Text>
          <View style={styles.titleBar} />
        </View>
        <TouchableOpacity
          onPress={handleSeeMorePress}
          style={styles.seeAllButton}
          activeOpacity={0.6}
        >
          <Text style={styles.seeAllText}>See All</Text>
          <MaterialIcons name="arrow-forward-ios" color={colors.primary} size={14} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={displayItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        snapToInterval={itemWidth + 16}
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={ItemSeparator}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  titleContainer: {
    flexDirection: 'column',
  },
  titleBar: {
    width: 32,
    height: 3,
    backgroundColor: colors.primary,
    marginTop: 6,
    borderRadius: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  seeAllText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
});

export default React.memo(CatalogSection); 