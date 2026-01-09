import React from 'react';
import { Platform, requireNativeComponent, ViewStyle, View } from 'react-native';

type Props = {
  style?: ViewStyle;
};

const NativeAirPlayRoutePickerView =
  Platform.OS === 'ios'
    ? requireNativeComponent<Props>('AirPlayRoutePickerView')
    : null;

export const AirPlayRoutePicker: React.FC<Props> = (props) => {
  if (!NativeAirPlayRoutePickerView) return <View style={props.style} />;
  return <NativeAirPlayRoutePickerView {...props} />;
};

export default AirPlayRoutePicker;

