import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../../styles/colors';

interface ProviderFilterProps {
  selectedProvider: string;
  providers: Array<{ id: string; name: string; }>;
  onSelect: (id: string) => void;
}

const ProviderFilter = ({ selectedProvider, providers, onSelect }: ProviderFilterProps) => {
  const renderItem = useCallback(({ item }: { item: { id: string; name: string } }) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.filterChip,
        selectedProvider === item.id && styles.filterChipSelected
      ]}
      onPress={() => onSelect(item.id)}
    >
      <Text style={[
        styles.filterChipText,
        selectedProvider === item.id && styles.filterChipTextSelected
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  ), [selectedProvider, onSelect]);

  return (
    <FlatList
      data={providers}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      bounces={true}
      overScrollMode="never"
      decelerationRate="fast"
      initialNumToRender={5}
      maxToRenderPerBatch={3}
      windowSize={3}
      getItemLayout={(data, index) => ({
        length: 100, // Approximate width of each item
        offset: 100 * index,
        index,
      })}
    />
  );
};

const styles = StyleSheet.create({
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    backgroundColor: colors.transparentLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.transparent,
  },
  filterChipSelected: {
    backgroundColor: colors.transparentLight,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.text,
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: colors.primary,
    fontWeight: 'bold',
  },
});

export default React.memo(ProviderFilter); 