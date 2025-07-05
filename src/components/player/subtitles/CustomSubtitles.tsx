import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../utils/playerStyles';

interface CustomSubtitlesProps {
  useCustomSubtitles: boolean;
  currentSubtitle: string;
  subtitleSize: number;
  zoomScale?: number; // current video zoom scale; defaults to 1
}

export const CustomSubtitles: React.FC<CustomSubtitlesProps> = ({
  useCustomSubtitles,
  currentSubtitle,
  subtitleSize,
  zoomScale = 1,
}) => {
  if (!useCustomSubtitles || !currentSubtitle) return null;
  
  const inverseScale = 1 / zoomScale;
  return (
    <View
      style={[
        styles.customSubtitleContainer,
        {
          transform: [{ scale: inverseScale }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.customSubtitleWrapper}>
        <Text style={[styles.customSubtitleText, { fontSize: subtitleSize }]}>
          {currentSubtitle}
        </Text>
      </View>
    </View>
  );
};

export default CustomSubtitles; 