import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface TraktIconProps {
  size?: number;
  color?: string;
}

const TraktIcon: React.FC<TraktIconProps> = ({ size = 24, color = '#ed2224' }) => {
  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 144.8 144.8"
      >
        <Path
          d="m29.5 111.8c10.6 11.6 25.9 18.8 42.9 18.8 8.7 0 16.9-1.9 24.3-5.3l-40.4-40.3z"
          fill={color}
        />
        <Path
          d="m56.1 60.6-30.6 30.5-4.1-4.1 32.2-32.2 37.6-37.6c-5.9-2-12.2-3.1-18.8-3.1-32.2 0-58.3 26.1-58.3 58.3 0 13.1 4.3 25.2 11.7 35l30.5-30.5 2.1 2 43.7 43.7c.9-.5 1.7-1 2.5-1.6l-48.3-48.3-29.3 29.3-4.1-4.1 33.4-33.4 2.1 2 51 50.9c.8-.6 1.5-1.3 2.2-1.9l-55-55z"
          fill={color}
        />
        <Path
          d="m115.7 111.4c9.3-10.3 15-24 15-39 0-23.4-13.8-43.5-33.6-52.8l-36.7 36.6zm-41.2-44.6-4.1-4.1 28.9-28.9 4.1 4.1zm27.4-39.7-33.3 33.3-4.1-4.1 33.3-33.3z"
          fill={color}
        />
        <Path
          d="m72.4 144.8c-39.9 0-72.4-32.5-72.4-72.4s32.5-72.4 72.4-72.4 72.4 32.5 72.4 72.4-32.5 72.4-72.4 72.4zm0-137.5c-35.9 0-65.1 29.2-65.1 65.1s29.2 65.1 65.1 65.1 65.1-29.2 65.1-65.1-29.2-65.1-65.1-65.1z"
          fill={color}
        />
      </Svg>
    </View>
  );
};

export default TraktIcon;
