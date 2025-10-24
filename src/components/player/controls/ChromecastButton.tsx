import React from 'react';
import { Platform, ViewStyle, TouchableOpacity, View } from 'react-native';
import { CastButton } from 'react-native-google-cast';
import { MaterialIcons } from '@expo/vector-icons';

interface ChromecastButtonProps {
  size?: number;
  color?: string;
  activeColor?: string;
  style?: ViewStyle;
  isConnected?: boolean;
  onPress?: () => void;
}

export const ChromecastButton: React.FC<ChromecastButtonProps> = ({
  size = 24,
  color = 'white',
  activeColor = '#E50914',
  style,
  isConnected = false,
  onPress
}) => {

  const currentColor = isConnected ? activeColor : color;

  return (
    <TouchableOpacity
      style={[
        {
          padding: 8,
          justifyContent: 'center',
          alignItems: 'center',
        },
        style
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ width: size, height: size }}>
        <CastButton
          style={{
            width: size,
            height: size,
            tintColor: currentColor,
          }}
        />
      </View>
    </TouchableOpacity>
  );
};

export default ChromecastButton;
