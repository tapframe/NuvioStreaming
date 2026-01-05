import React, { useEffect, useMemo } from 'react';
import { useWindowDimensions, StyleSheet } from 'react-native';
import {
    Blur,
    BlurMask,
    Canvas,
    Circle,
    Extrapolate,
    interpolate,
    LinearGradient,
    Path,
    RadialGradient,
    usePathValue,
    vec,
    Group,
} from '@shopify/react-native-skia';
import {
    Easing,
    useSharedValue,
    withRepeat,
    withTiming,
    SharedValue,
} from 'react-native-reanimated';

import {
    type Point3D,
    N_POINTS,
    ALL_SHAPES,
    ALL_SHAPES_X,
    ALL_SHAPES_Y,
    ALL_SHAPES_Z,
} from './shapes';

// Number of shapes
const SHAPES_COUNT = ALL_SHAPES.length;

// Color palettes for each shape (gradient: start, middle, end)
const COLOR_PALETTES = [
    ['#FFD700', '#FFA500', '#FF6B00'], // Star: Gold → Orange
    ['#7C3AED', '#A855F7', '#EC4899'], // Plugin: Purple → Pink
    ['#00D9FF', '#06B6D4', '#0EA5E9'], // Search: Cyan → Blue
    ['#FF006E', '#F43F5E', '#FB7185'], // Heart: Pink → Rose
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

// Single colored path component
const ColoredPath = ({
    morphPath,
    colorIndex,
    scrollX,
    windowWidth,
    windowHeight,
}: {
    morphPath: any;
    colorIndex: number;
    scrollX: SharedValue<number>;
    windowWidth: number;
    windowHeight: number;
}) => {
    const colors = COLOR_PALETTES[colorIndex];

    // Create opacity value using Skia's interpolate inside usePathValue pattern
    const opacityPath = usePathValue((skPath) => {
        'worklet';
        // Calculate opacity based on scroll position
        const shapeWidth = windowWidth;
        const slideStart = colorIndex * shapeWidth;
        const slideMid = slideStart;
        const slideEnd = (colorIndex + 1) * shapeWidth;
        const prevSlideEnd = (colorIndex - 1) * shapeWidth;

        // Opacity peaks at 1 when on this slide, fades to 0 on adjacent slides
        let opacity = 0;
        if (colorIndex === 0) {
            // First slide: 1 at start, fade out to next
            opacity = interpolate(
                scrollX.value,
                [0, shapeWidth],
                [1, 0],
                Extrapolate.CLAMP
            );
        } else if (colorIndex === COLOR_PALETTES.length - 1) {
            // Last slide: fade in from previous, stay at 1
            opacity = interpolate(
                scrollX.value,
                [prevSlideEnd, slideMid],
                [0, 1],
                Extrapolate.CLAMP
            );
        } else {
            // Middle slides: fade in from previous, fade out to next
            opacity = interpolate(
                scrollX.value,
                [prevSlideEnd, slideMid, slideEnd],
                [0, 1, 0],
                Extrapolate.CLAMP
            );
        }

        // Store opacity in path for use - we'll read it via a trick
        // This is a workaround since we can't directly animate opacity
        skPath.addCircle(-1000 - opacity * 100, -1000, 1); // Hidden marker
        return skPath;
    });

    return (
        <Group opacity={1}>
            <Path path={morphPath} style="fill">
                <LinearGradient
                    start={vec(0, windowHeight * 0.4)}
                    end={vec(windowWidth, windowHeight * 0.9)}
                    colors={colors}
                />
                <BlurMask blur={5} style="solid" />
            </Path>
        </Group>
    );
};

export const ShapeAnimation: React.FC<ShapeAnimationProps> = ({ scrollX }) => {
    const iTime = useSharedValue(0.0);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();

    // Create paths for each color layer with opacity baked in
    const createPathForIndex = (colorIndex: number) => {
        return usePathValue(skPath => {
            'worklet';
            const centerX = windowWidth / 2;
            const centerY = windowHeight * 0.65;
            const distance = 350;

            // Calculate opacity for this color layer
            const shapeWidth = windowWidth;
            const slideStart = colorIndex * shapeWidth;
            const prevSlideEnd = (colorIndex - 1) * shapeWidth;
            const nextSlideStart = (colorIndex + 1) * shapeWidth;

            let opacity = 0;
            if (colorIndex === 0) {
                opacity = interpolate(scrollX.value, [0, shapeWidth], [1, 0], Extrapolate.CLAMP);
            } else if (colorIndex === COLOR_PALETTES.length - 1) {
                opacity = interpolate(scrollX.value, [prevSlideEnd, slideStart], [0, 1], Extrapolate.CLAMP);
            } else {
                opacity = interpolate(scrollX.value, [prevSlideEnd, slideStart, nextSlideStart], [0, 1, 0], Extrapolate.CLAMP);
            }

            // Skip drawing if not visible
            if (opacity < 0.01) return skPath;

            // Input range for all shapes
            const inputRange = new Array(ALL_SHAPES.length)
                .fill(0)
                .map((_, idx) => shapeWidth * idx);

            for (let i = 0; i < N_POINTS; i++) {
                const baseX = interpolate(scrollX.value, inputRange, ALL_SHAPES_X[i], Extrapolate.CLAMP);
                const baseY = interpolate(scrollX.value, inputRange, ALL_SHAPES_Y[i], Extrapolate.CLAMP);
                const baseZ = interpolate(scrollX.value, inputRange, ALL_SHAPES_Z[i], Extrapolate.CLAMP);

                let p: Point3D = { x: baseX, y: baseY, z: baseZ };
                p = rotateX(p, 0.2);
                p = rotateY(p, iTime.value);

                const scale = distance / (distance + p.z);
                const screenX = centerX + p.x * scale;
                const screenY = centerY + p.y * scale;

                // Scale radius by opacity for smooth color transition
                const radius = Math.max(0.1, 0.5 * scale * opacity);
                skPath.addCircle(screenX, screenY, radius);
            }

            return skPath;
        });
    };

    // Create all 4 color layer paths
    const path0 = createPathForIndex(0);
    const path1 = createPathForIndex(1);
    const path2 = createPathForIndex(2);
    const path3 = createPathForIndex(3);

    // Rotation animation
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
            {/* Background radial gradient blurred */}
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

            {/* Layer 0: Gold (Star) */}
            <Path path={path0} style="fill">
                <LinearGradient
                    start={vec(0, windowHeight * 0.4)}
                    end={vec(windowWidth, windowHeight * 0.9)}
                    colors={COLOR_PALETTES[0]}
                />
                <BlurMask blur={5} style="solid" />
            </Path>

            {/* Layer 1: Purple (Plugin) */}
            <Path path={path1} style="fill">
                <LinearGradient
                    start={vec(0, windowHeight * 0.4)}
                    end={vec(windowWidth, windowHeight * 0.9)}
                    colors={COLOR_PALETTES[1]}
                />
                <BlurMask blur={5} style="solid" />
            </Path>

            {/* Layer 2: Cyan (Search) */}
            <Path path={path2} style="fill">
                <LinearGradient
                    start={vec(0, windowHeight * 0.4)}
                    end={vec(windowWidth, windowHeight * 0.9)}
                    colors={COLOR_PALETTES[2]}
                />
                <BlurMask blur={5} style="solid" />
            </Path>

            {/* Layer 3: Pink (Heart) */}
            <Path path={path3} style="fill">
                <LinearGradient
                    start={vec(0, windowHeight * 0.4)}
                    end={vec(windowWidth, windowHeight * 0.9)}
                    colors={COLOR_PALETTES[3]}
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
