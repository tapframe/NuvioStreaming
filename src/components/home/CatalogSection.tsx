import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, Dimensions } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CatalogContent, StreamingContent } from '../../services/catalogService';
import { colors } from '../../styles/colors';
import ContentItem from './ContentItem';
import { RootStackParamList } from '../../navigation/AppNavigator';

interface CatalogSectionProps {
  catalog: CatalogContent;
}

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 50) / 3;

const CatalogSection = ({ catalog }: CatalogSectionProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handleContentPress = (id: string, type: string) => {
    navigation.navigate('Metadata', { id, type });
  };

  const renderContentItem = ({ item, index }: { item: StreamingContent, index: number }) => {
    return (
      <Animated.View
        entering={FadeIn.duration(300).delay(100 + (index * 40))}
      >
        <ContentItem 
          item={item} 
          onPress={handleContentPress}
        />
      </Animated.View>
    );
  };

  return (
    <Animated.View 
      style={styles.catalogContainer}
      entering={FadeIn.duration(400).delay(50)}
    >
      <View style={styles.catalogHeader}>
        <View style={styles.titleContainer}>
          <Text style={styles.catalogTitle}>{catalog.name}</Text>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.titleUnderline}
          />
        </View>
        <TouchableOpacity
          onPress={() => 
            navigation.navigate('Catalog', {
              id: catalog.id,
              type: catalog.type,
              addonId: catalog.addon
            })
          }
          style={styles.seeAllButton}
        >
          <Text style={styles.seeAllText}>See More</Text>
          <MaterialIcons name="arrow-forward" color={colors.primary} size={16} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={catalog.items}
        renderItem={renderContentItem}
        keyExtractor={(item) => `${item.id}-${item.type}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catalogList}
        snapToInterval={POSTER_WIDTH + 12}
        decelerationRate="fast"
        snapToAlignment="start"
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        getItemLayout={(data, index) => ({
          length: POSTER_WIDTH + 12,
          offset: (POSTER_WIDTH + 12) * index,
          index,
        })}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  catalogContainer: {
    marginBottom: 24,
    paddingTop: 0,
    marginTop: 16,
  },
  catalogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  titleContainer: {
    position: 'relative',
  },
  catalogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.highEmphasis,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    width: 60,
    height: 3,
    borderRadius: 1.5,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevation1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  seeAllText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 4,
  },
  catalogList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 6,
  },
});

export default CatalogSection; 