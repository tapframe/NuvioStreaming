import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../utils/playerStyles';

interface CustomSubtitlesProps {
  useCustomSubtitles: boolean;
  currentSubtitle: string;
  subtitleSize: number;
  subtitleBackground: boolean;
  zoomScale?: number; // current video zoom scale; defaults to 1
}

export const CustomSubtitles: React.FC<CustomSubtitlesProps> = ({
  useCustomSubtitles,
  currentSubtitle,
  subtitleSize,
  subtitleBackground,
  zoomScale = 1,
}) => {
  if (!useCustomSubtitles || !currentSubtitle) return null;
  
  const inverseScale = 1 / zoomScale;
  return (
    <View
      style={styles.customSubtitleContainer}
      pointerEvents="none"
    >
      <View style={[
        styles.customSubtitleWrapper,
        {
          backgroundColor: subtitleBackground ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
        }
      ]}>
        <Text style={[
          styles.customSubtitleText, 
          { 
            fontSize: subtitleSize * inverseScale,
            transform: [{ scale: inverseScale }],
          }
        ]}>
          {currentSubtitle}
        </Text>
      </View>
    </View>
  );
};

export default CustomSubtitles; 