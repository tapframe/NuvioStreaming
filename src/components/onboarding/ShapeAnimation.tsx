import React, { useEffect } from 'react';
import { useWindowDimensions, StyleSheet } from 'react-native';
import {
    Blur,
    BlurMask,
    Canvas,
    Circle,
    Extrapolate,
    interpolate,
    interpolateColors,
    LinearGradient,
    Path,
    RadialGradient,
    usePathValue,
    vec,
} from '@shopify/react-native-skia';
import {
    Easing,
    useSharedValue,
    withRepeat,
    withTiming,
    SharedValue,
    useDerivedValue,
} from 'react-native-reanimated';

import {
    type Point3D,
    N_POINTS,
    ALL_SHAPES,
    ALL_SHAPES_X,
    ALL_SHAPES_Y,
    ALL_SHAPES_Z,
} from './shapes';

// Color palettes for each shape (gradient stops)
const COLOR_STOPS = [
    { start: '#FFD700', end: '#FF6B00' }, // Star: Gold → Orange
    { start: '#7C3AED', end: '#EC4899' }, // Plugin: Purple → Pink
    { start: '#00D9FF', end: '#0EA5E9' }, // Search: Cyan → Blue
    { start: '#FF006E', end: '#FB7185' }, // Heart: Pink → Rose
];

// ============ 3D UTILITIES ============
const rotateX = (p: Point3D, angle: number): Point3D => {
    'worklet';
    return {
        x: p.x,
        y: p.y * Math.cos(angle) - p.z * Math.sin(angle),
        z: p.y * Math.sin(angle) + p.z * Math.cos(angle),
    };
};

const rotateY = (p: Point3D, angle: number): Point3D => {
    'worklet';
    return {
        x: p.x * Math.cos(angle) + p.z * Math.sin(angle),
        y: p.y,
        z: -p.x * Math.sin(angle) + p.z * Math.cos(angle),
    };
};

interface ShapeAnimationProps {
    scrollX: SharedValue<number>;
}

export const ShapeAnimation: React.FC<ShapeAnimationProps> = ({ scrollX }) => {
    const iTime = useSharedValue(0.0);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();

    // Pre-compute input range once
    const shapeWidth = windowWidth;
    const inputRange = ALL_SHAPES.map((_, idx) => shapeWidth * idx);

    // Single optimized path - all 4 shapes batched into one Skia Path
    const morphPath = usePathValue(skPath => {
        'worklet';
        const centerX = windowWidth / 2;
        const centerY = windowHeight * 0.65;
        const distance = 350;

        for (let i = 0; i < N_POINTS; i++) {
            // Interpolate 3D coordinates between all shapes
            const baseX = interpolate(scrollX.value, inputRange, ALL_SHAPES_X[i], Extrapolate.CLAMP);
            const baseY = interpolate(scrollX.value, inputRange, ALL_SHAPES_Y[i], Extrapolate.CLAMP);
            const baseZ = interpolate(scrollX.value, inputRange, ALL_SHAPES_Z[i], Extrapolate.CLAMP);

            // Apply 3D rotation
            let p: Point3D = { x: baseX, y: baseY, z: baseZ };
            p = rotateX(p, 0.2); // Fixed X tilt
            p = rotateY(p, iTime.value); // Animated Y rotation

            // Perspective projection
            const scale = distance / (distance + p.z);
            const screenX = centerX + p.x * scale;
            const screenY = centerY + p.y * scale;

            // Depth-based radius for parallax effect
            const radius = Math.max(0.2, 0.5 * scale);
            skPath.addCircle(screenX, screenY, radius);
        }

        return skPath;
    });

    // Interpolate gradient colors based on scroll position
    const gradientColors = useDerivedValue(() => {
        const startColors = COLOR_STOPS.map(c => c.start);
        const endColors = COLOR_STOPS.map(c => c.end);

        const start = interpolateColors(scrollX.value, inputRange, startColors);
        const end = interpolateColors(scrollX.value, inputRange, endColors);

        return [start, end];
    });

    // Rotation animation - infinite loop
    useEffect(() => {
        iTime.value = 0;
        iTime.value = withRepeat(
            withTiming(2 * Math.PI, {
                duration: 12000,
                easing: Easing.linear,
            }),
            -1,
            false
        );
    }, []);

    return (
        <Canvas
            style={[
                styles.canvas,
                {
                    width: windowWidth,
                    height: windowHeight,
                },
            ]}>
            {/* Background glow */}
            <Circle
                cx={windowWidth / 2}
                cy={windowHeight * 0.65}
                r={windowWidth * 0.6}>
                <RadialGradient
                    c={vec(windowWidth / 2, windowHeight * 0.65)}
                    r={windowWidth * 0.6}
                    colors={['#ffffff20', 'transparent']}
                />
                <Blur blur={60} />
            </Circle>

            {/* Single optimized path with interpolated gradient */}
            <Path path={morphPath} style="fill">
                <LinearGradient
                    start={vec(0, windowHeight * 0.4)}
                    end={vec(windowWidth, windowHeight * 0.9)}
                    colors={gradientColors}
                />
                <BlurMask blur={5} style="solid" />
            </Path>
        </Canvas>
    );
};

const styles = StyleSheet.create({
    canvas: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
});

export default ShapeAnimation;
