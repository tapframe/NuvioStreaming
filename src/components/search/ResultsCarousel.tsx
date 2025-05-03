import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { colors } from '../../styles';
import { StreamingContent } from '../../services/catalogService';
import SearchResultItem from './SearchResultItem';

interface ResultsCarouselProps {
  title: string;
  items: StreamingContent[];
  onItemPress: (item: StreamingContent) => void;
  isDarkMode?: boolean;
}

const ResultsCarousel: React.FC<ResultsCarouselProps> = ({
  title,
  items,
  onItemPress,
  isDarkMode = true,
}) => {
  if (items.length === 0) return null;

  return (
    <View style={styles.carouselContainer}>
      <Text style={styles.carouselTitle}>
        {title} ({items.length})
      </Text>
      <FlatList
        data={items}
        renderItem={({ item }) => (
          <SearchResultItem
            item={item}
            onPress={onItemPress}
            isDarkMode={isDarkMode}
          />
        )}
        keyExtractor={item => `${item.type}-${item.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalListContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  carouselContainer: {
    marginBottom: 24,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  horizontalListContent: {
    paddingHorizontal: 16,
    paddingRight: 8,
  },
});

export default ResultsCarousel; 