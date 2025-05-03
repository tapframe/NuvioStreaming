import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../../styles';
import { StreamingContent } from '../../services/catalogService';

const { width } = Dimensions.get('window');
const HORIZONTAL_ITEM_WIDTH = width * 0.3;
const HORIZONTAL_POSTER_HEIGHT = HORIZONTAL_ITEM_WIDTH * 1.5;

const PLACEHOLDER_POSTER = 'https://placehold.co/300x450/222222/CCCCCC?text=No+Poster';

interface SearchResultItemProps {
  item: StreamingContent;
  onPress: (item: StreamingContent) => void;
  isDarkMode?: boolean;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ 
  item, 
  onPress,
  isDarkMode = true 
}) => {
  return (
    <TouchableOpacity
      style={styles.horizontalItem}
      onPress={() => onPress(item)}
    >
      <View style={styles.horizontalItemPosterContainer}>
        <Image
          source={{ uri: item.poster || PLACEHOLDER_POSTER }}
          style={styles.horizontalItemPoster}
          contentFit="cover"
          transition={300}
        />
      </View>
      <Text 
        style={[
          styles.horizontalItemTitle, 
          { color: isDarkMode ? colors.white : colors.black }
        ]}
        numberOfLines={2}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  horizontalItem: {
    width: HORIZONTAL_ITEM_WIDTH,
    marginRight: 12,
  },
  horizontalItemPosterContainer: {
    width: HORIZONTAL_ITEM_WIDTH,
    height: HORIZONTAL_POSTER_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.darkBackground,
    marginBottom: 8,
  },
  horizontalItemPoster: {
    width: '100%',
    height: '100%',
  },
  horizontalItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'left',
  },
});

export default SearchResultItem; 