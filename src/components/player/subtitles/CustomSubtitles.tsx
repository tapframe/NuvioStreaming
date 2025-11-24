import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Text as SvgText, TSpan } from 'react-native-svg';
import { styles } from '../utils/playerStyles';
import { SubtitleSegment } from '../utils/playerTypes';
import { detectRTL } from '../utils/playerUtils';

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
  // New: support for formatted subtitle segments
  formattedSegments?: SubtitleSegment[][]; // Segments per line
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
  formattedSegments,
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

  // Prepare content lines
  const lines = String(currentSubtitle).split(/\r?\n/);

  // Detect RTL for each line
  const lineRTLStatus = lines.map(line => detectRTL(line));
  const hasRTL = lineRTLStatus.some(status => status);

  // When using crisp outline, prefer SVG text with real stroke instead of blur shadow
  // However, SVG text does not support complex text shaping (required for Arabic/RTL),
  // so we must fallback to standard Text component for RTL languages.
  const useCrispSvgOutline = outline === true && !hasRTL;

  const shadowStyle = (textShadow && !useCrispSvgOutline)
    ? {
      textShadowColor: 'rgba(0, 0, 0, 0.9)',
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 4,
    }
    : {};

  const displayFontSize = subtitleSize * inverseScale;
  const displayLineHeight = subtitleSize * lineHeightMultiplier * inverseScale;
  const svgHeight = lines.length * displayLineHeight;

  // Helper to render formatted segments
  const renderFormattedText = (segments: SubtitleSegment[], lineIndex: number, keyPrefix: string, isRTL?: boolean, customLetterSpacing?: number) => {
    if (!segments || segments.length === 0) return null;

    // For RTL, use a very small negative letter spacing to stretch words slightly
    // This helps with proper diacritic spacing while maintaining ligatures
    const effectiveLetterSpacing = isRTL ? (displayFontSize * -0.02) : (customLetterSpacing ?? letterSpacing);

    // For RTL, adjust text alignment
    const effectiveAlign = isRTL && align === 'left' ? 'right' : (isRTL && align === 'right' ? 'left' : align);

    return (
      <Text key={`${keyPrefix}-line-${lineIndex}`} style={{
        color: textColor,
        fontFamily,
        textAlign: effectiveAlign,
        letterSpacing: effectiveLetterSpacing,
        fontSize: displayFontSize,
        lineHeight: displayLineHeight,
      }}>
        {segments.map((segment, segIdx) => {
          const segmentStyle: any = {};
          if (segment.italic) segmentStyle.fontStyle = 'italic';
          if (segment.bold) segmentStyle.fontWeight = 'bold';
          if (segment.underline) segmentStyle.textDecorationLine = 'underline';
          if (segment.color) segmentStyle.color = segment.color;

          // Apply outline/shadow to individual segments if needed
          const mergedShadowStyle = (textShadow && !useCrispSvgOutline) ? shadowStyle : {};

          return (
            <Text key={`${keyPrefix}-seg-${segIdx}`} style={[segmentStyle, mergedShadowStyle]}>
              {segment.text}
            </Text>
          );
        })}
      </Text>
    );
  };

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
          alignItems: 'center',
        }
      ]}>
        {useCrispSvgOutline ? (
          // Crisp outline using react-native-svg (stroke under, fill on top)
          <Svg
            width={800}
            height={svgHeight}
            viewBox={`0 0 1000 ${svgHeight}`}
            preserveAspectRatio="xMidYMax meet"
          >
            {(() => {
              // Determine alignment and anchor for RTL or LTR
              // Only apply RTL styling if ALL lines are RTL, not just some
              const isRTL = lineRTLStatus.every(status => status);
              let anchor: 'start' | 'middle' | 'end';
              let x: number;

              if (isRTL) {
                // For RTL, always use 'end' anchor to position from right edge
                anchor = 'end';
                x = 1000;
              } else {
                anchor = align === 'center' ? 'middle' : align === 'left' ? 'start' : 'end';
                x = align === 'center' ? 500 : (align === 'left' ? 0 : 1000);
              }

              const baseFontSize = displayFontSize;
              const lineHeightPx = displayLineHeight;
              const strokeWidth = Math.max(0.5, outlineWidth);
              // For RTL, use a very small negative letter spacing to stretch words slightly
              // This helps with proper diacritic spacing while maintaining ligatures
              const effectiveLetterSpacing = isRTL ? (baseFontSize * -0.02) : letterSpacing;

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
                    letterSpacing={effectiveLetterSpacing}
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
                    letterSpacing={effectiveLetterSpacing}
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
          formattedSegments && formattedSegments.length > 0 ? (
            // Render formatted segments if available
            formattedSegments.map((lineSegments, lineIdx) => {
              const isLineRTL = lineRTLStatus[lineIdx];
              return renderFormattedText(lineSegments, lineIdx, 'formatted', isLineRTL, letterSpacing);
            })
          ) : (
            (() => {
              // Only apply RTL styling if ALL lines are RTL, not just some
              const isRTL = lineRTLStatus.every(status => status);
              // For RTL, use a very small negative letter spacing to stretch words slightly
              // This helps with proper diacritic spacing while maintaining ligatures
              const effectiveLetterSpacing = isRTL ? (subtitleSize * inverseScale * -0.02) : letterSpacing;
              // For RTL, adjust text alignment
              const effectiveAlign = isRTL && align === 'left' ? 'right' : (isRTL && align === 'right' ? 'left' : align);

              return (
                <Text style={[
                  styles.customSubtitleText,
                  {
                    color: textColor,
                    fontFamily,
                    textAlign: effectiveAlign,
                    letterSpacing: effectiveLetterSpacing,
                    fontSize: subtitleSize * inverseScale,
                    lineHeight: subtitleSize * lineHeightMultiplier * inverseScale,
                    transform: [{ scale: inverseScale }],
                  },
                  shadowStyle,
                ]}>
                  {currentSubtitle}
                </Text>
              );
            })()
          )
        )}
      </View>
    </View>
  );
};

export default CustomSubtitles; 