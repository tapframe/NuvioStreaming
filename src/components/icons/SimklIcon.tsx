import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface SimklIconProps {
    size?: number;
    color?: string;
    style?: any;
}

const SimklIcon: React.FC<SimklIconProps> = ({ size = 24, color = '#000000', style }) => {
    return (
        <Image
            source={require('../../../assets/simkl-favicon.png')}
            style={[
                { width: size, height: size, flex: 1 },
                style
            ]}
            resizeMode="cover"
        />
    );
};

export default SimklIcon;
