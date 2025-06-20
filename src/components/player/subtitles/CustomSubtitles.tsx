import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../utils/playerStyles';

interface CustomSubtitlesProps {
  useCustomSubtitles: boolean;
  currentSubtitle: string;
  subtitleSize: number;
}

export const CustomSubtitles: React.FC<CustomSubtitlesProps> = ({
  useCustomSubtitles,
  currentSubtitle,
  subtitleSize,
}) => {
  if (!useCustomSubtitles || !currentSubtitle) return null;
  
  return (
    <View style={styles.customSubtitleContainer} pointerEvents="none">
      <View style={styles.customSubtitleWrapper}>
        <Text style={[styles.customSubtitleText, { fontSize: subtitleSize }]}>
          {currentSubtitle}
        </Text>
      </View>
    </View>
  );
};

export default CustomSubtitles; 