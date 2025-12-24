import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg';

interface MalIconProps {
  size?: number;
  color?: string;
}

const MalIcon: React.FC<MalIconProps> = ({ size = 24, color = '#2E51A2' }) => {
  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
      >
        <Circle cx="50" cy="50" r="50" fill={color} />
        <Path
          d="M20 35 L20 65 L30 65 L30 45 L40 65 L50 45 L50 65 L60 65 L60 35 L50 35 L40 55 L30 35 Z"
          fill="white"
        />
        <Path
          d="M65 65 L75 35 L85 65 Z"
          fill="none"
          stroke="white"
          strokeWidth="5"
        />
        <Path
           d="M68 55 L82 55"
           stroke="white"
           strokeWidth="5"
        />
      </Svg>
    </View>
  );
};

export default MalIcon;
