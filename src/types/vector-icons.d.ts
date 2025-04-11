declare module 'react-native-vector-icons/MaterialIcons' {
  import { Component } from 'react';
  import { TextStyle, StyleProp, ViewProps } from 'react-native';

  export interface IconProps extends ViewProps {
    allowFontScaling?: boolean;
    name: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle>;
  }

  export default class Icon extends Component<IconProps> {
    static getImageSource(
      name: string,
      size?: number,
      color?: string,
    ): Promise<any>;
    static getFontFamily(): string;
    static loadFont(file?: string): Promise<void>;
    static hasIcon(name: string): boolean;
  }
} 