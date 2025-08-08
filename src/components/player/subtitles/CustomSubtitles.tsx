import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../utils/playerStyles';

interface CustomSubtitlesProps {
  useCustomSubtitles: boolean;
  currentSubtitle: string;
  subtitleSize: number;
  subtitleBackground: boolean;
  zoomScale?: number; // current video zoom scale; defaults to 1
  // New customization props
  fontFamily?: string;
  textColor?: string;
  backgroundOpacity?: number; // 0..1
  textShadow?: boolean;
  outline?: boolean;
  outlineColor?: string;
  outlineWidth?: number; // px
  align?: 'center' | 'left' | 'right';
  bottomOffset?: number; // px from bottom
  letterSpacing?: number;
  lineHeightMultiplier?: number; // multiplies subtitleSize
}

export const CustomSubtitles: React.FC<CustomSubtitlesProps> = ({
  useCustomSubtitles,
  currentSubtitle,
  subtitleSize,
  subtitleBackground,
  zoomScale = 1,
  fontFamily,
  textColor = '#FFFFFF',
  backgroundOpacity = 0.7,
  textShadow = true,
  outline = false,
  outlineColor = '#000000',
  outlineWidth = 2,
  align = 'center',
  bottomOffset = 20,
  letterSpacing = 0,
  lineHeightMultiplier = 1.2,
}) => {
  if (!useCustomSubtitles || !currentSubtitle) return null;
  
  const inverseScale = 1 / zoomScale;
  const bgColor = subtitleBackground ? `rgba(0, 0, 0, ${Math.min(Math.max(backgroundOpacity, 0), 1)})` : 'transparent';

  // Outline via textShadow for multi-direction pass
  const outlineStyle = outline
    ? {
        textShadowColor: outlineColor,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: outlineWidth,
      }
    : {};

  const shadowStyle = textShadow
    ? {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
      }
    : {};

  return (
    <View
      style={[
        styles.customSubtitleContainer,
        { bottom: bottomOffset },
      ]}
      pointerEvents="none"
    >
      <View style={[
        styles.customSubtitleWrapper,
        {
          backgroundColor: bgColor,
          alignSelf: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
        }
      ]}>
        <Text style={[
          styles.customSubtitleText,
          {
            color: textColor,
            fontFamily,
            textAlign: align,
            letterSpacing,
            fontSize: subtitleSize * inverseScale,
            lineHeight: subtitleSize * lineHeightMultiplier * inverseScale,
            transform: [{ scale: inverseScale }],
          },
          shadowStyle,
          outlineStyle,
        ]}>
          {currentSubtitle}
        </Text>
      </View>
    </View>
  );
};

export default CustomSubtitles; 