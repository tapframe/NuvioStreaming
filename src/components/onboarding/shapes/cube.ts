import { N_POINTS } from './constants';
import { type Point3D } from './types';
import { fibonacciPoint, normalizeShape, scaleShape } from './utils';

// Cube - map sphere to cube
const generateCubePoints = (size: number): Point3D[] => {
    const points: Point3D[] = [];
    const s = size / 2;

    for (let i = 0; i < N_POINTS; i++) {
        const { theta, phi } = fibonacciPoint(i, N_POINTS);
        // Point on unit sphere
        const sx = Math.sin(phi) * Math.cos(theta);
        const sy = Math.sin(phi) * Math.sin(theta);
        const sz = Math.cos(phi);

        // Map to cube (cube mapping)
        const absX = Math.abs(sx);
        const absY = Math.abs(sy);
        const absZ = Math.abs(sz);
        const max = Math.max(absX, absY, absZ);

        points.push({
            x: (sx / max) * s,
            y: (sy / max) * s,
            z: (sz / max) * s,
        });
    }
    return points;
};

export const CUBE_POINTS = scaleShape(
    normalizeShape(generateCubePoints(150)),
    0.75,
);
