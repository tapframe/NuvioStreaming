import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface PulsingChipProps {
  text: string;
  delay: number;
}

const PulsingChip = memo(({ text, delay }: PulsingChipProps) => {
  const { currentTheme } = useTheme();
  const styles = React.useMemo(() => createStyles(currentTheme.colors), [currentTheme.colors]);
  // Make chip static to avoid continuous animation load
  return (
    <View style={styles.activeScraperChip}>
      <Text style={styles.activeScraperText}>{text}</Text>
    </View>
  );
});

const createStyles = (colors: any) => StyleSheet.create({
  activeScraperChip: {
    backgroundColor: colors.elevation2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0,
  },
  activeScraperText: {
    color: colors.mediumEmphasis,
    fontSize: 11,
    fontWeight: '400',
  },
});

export default PulsingChip;
