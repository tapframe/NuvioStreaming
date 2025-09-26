import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';

interface PluginIconProps {
  size?: number;
  color?: string;
}

const PluginIcon: React.FC<PluginIconProps> = ({ size = 24, color = '#FFFFFF' }) => {
  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
      >
        <Path
          d="M16,22L16,22c-2.2,0-4-1.8-4-4v-4h8v4C20,20.2,18.2,22,16,22z"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
        />
        <Line
          x1="14"
          y1="10"
          x2="14"
          y2="14"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
        />
        <Line
          x1="18"
          y1="10"
          x2="18"
          y2="14"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
        />
        <Path
          d="M16,22v3.1c0,2.3-2.3,4-4.4,3.2C6.4,26.4,2.8,21.3,3,15.5C3.3,8.8,8.8,3.3,15.5,3C22.9,2.7,29,8.7,29,16c0,5.6-3.5,10.3-8.4,12.2"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit="10"
        />
      </Svg>
    </View>
  );
};

export default PluginIcon;
