import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Text as SvgText, TSpan } from 'react-native-svg';
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
  // Controls overlay awareness
  controlsVisible?: boolean;
  controlsExtraOffset?: number; // additional px to push up when controls are visible
  controlsFixedOffset?: number; // fixed px when controls visible (ignores user offset)
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
  controlsVisible = false,
  controlsExtraOffset = 0,
  controlsFixedOffset,
  letterSpacing = 0,
  lineHeightMultiplier = 1.2,
}) => {
  if (!useCustomSubtitles || !currentSubtitle) return null;
  
  const inverseScale = 1 / zoomScale;
  const bgColor = subtitleBackground ? `rgba(0, 0, 0, ${Math.min(Math.max(backgroundOpacity, 0), 1)})` : 'transparent';
  let effectiveBottom = bottomOffset;
  if (controlsVisible) {
    effectiveBottom = controlsFixedOffset !== undefined
      ? controlsFixedOffset
      : bottomOffset + controlsExtraOffset;
  }
  effectiveBottom = Math.max(0, effectiveBottom);

  // When using crisp outline, prefer SVG text with real stroke instead of blur shadow
  const useCrispSvgOutline = outline === true;

  const shadowStyle = (textShadow && !useCrispSvgOutline)
    ? {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
      }
    : {};

  // Prepare content lines
  const lines = String(currentSubtitle).split(/\r?\n/);
  const displayFontSize = subtitleSize * inverseScale;
  const displayLineHeight = subtitleSize * lineHeightMultiplier * inverseScale;
  const svgHeight = lines.length * displayLineHeight;

  return (
    <View
      style={[
        styles.customSubtitleContainer,
        { bottom: effectiveBottom },
      ]}
      pointerEvents="none"
    >
      <View style={[
        styles.customSubtitleWrapper,
        {
          backgroundColor: bgColor,
          position: 'relative',
          width: '100%',
          alignItems: 'center',
        }
      ]}>
        {useCrispSvgOutline ? (
          // Crisp outline using react-native-svg (stroke under, fill on top)
          <Svg
            width={'100%'}
            height={svgHeight}
            viewBox={`0 0 1000 ${svgHeight}`}
            preserveAspectRatio="xMidYMax meet"
          >
            {(() => {
              const anchor = align === 'center' ? 'middle' : align === 'left' ? 'start' : 'end';
              const x = align === 'center' ? 500 : (align === 'left' ? 0 : 1000);
              const baseFontSize = displayFontSize;
              const lineHeightPx = displayLineHeight;
              const strokeWidth = Math.max(0.5, outlineWidth);
              // Position text from bottom up - last line should be at svgHeight - small margin
              // Add descender buffer so letters like y/g/p/q/j aren't clipped
              const descenderBuffer = baseFontSize * 0.35 + (strokeWidth * 0.5);
              const lastLineBaselineY = svgHeight - descenderBuffer;
              const startY = lastLineBaselineY - (lines.length - 1) * lineHeightPx;
              return (
                <>
                  {/* Stroke layer */}
                  <SvgText
                    x={x}
                    y={startY}
                    textAnchor={anchor}
                    fill="none"
                    stroke={outlineColor}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeMiterlimit={2}
                    fontFamily={fontFamily}
                    fontSize={baseFontSize}
                    letterSpacing={letterSpacing}
                  >
                    {lines.map((line, idx) => (
                      <TSpan key={idx} x={x} dy={idx === 0 ? 0 : lineHeightPx}>
                        {line}
                      </TSpan>
                    ))}
                  </SvgText>
                  {/* Fill layer */}
                  <SvgText
                    x={x}
                    y={startY}
                    textAnchor={anchor}
                    fill={textColor}
                    fontFamily={fontFamily}
                    fontSize={baseFontSize}
                    letterSpacing={letterSpacing}
                  >
                    {lines.map((line, idx) => (
                      <TSpan key={idx} x={x} dy={idx === 0 ? 0 : lineHeightPx}>
                        {line}
                      </TSpan>
                    ))}
                  </SvgText>
                </>
              );
            })()}
          </Svg>
        ) : (
          // No outline: use RN Text with (optional) shadow
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
          ]}>
            {currentSubtitle}
          </Text>
        )}
      </View>
    </View>
  );
};

export default CustomSubtitles; 