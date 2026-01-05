import { GOLDEN_RATIO, TARGET_HEIGHT } from './constants';
import { type Point3D } from './types';

// Generate Fibonacci points on unit sphere, then map to shape
export const fibonacciPoint = (
    i: number,
    total: number,
): { theta: number; phi: number; t: number } => {
    const t = i / total;
    const theta = (2 * Math.PI * i) / GOLDEN_RATIO;
    const phi = Math.acos(1 - 2 * t);
    return { theta, phi, t };
};

export const normalizeShape = (points: Point3D[]): Point3D[] => {
    // Find min/max for each axis
    let minX = Infinity,
        maxX = -Infinity;
    let minY = Infinity,
        maxY = -Infinity;
    let minZ = Infinity,
        maxZ = -Infinity;

    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    }

    // Calculate current dimensions
    const currentHeight = maxY - minY;
    const scale = TARGET_HEIGHT / currentHeight;

    // Center and scale uniformly
    const centerY = (minY + maxY) / 2;

    return points.map(p => ({
        x: (p.x - (minX + maxX) / 2) * scale,
        y: (p.y - centerY) * scale,
        z: (p.z - (minZ + maxZ) / 2) * scale,
    }));
};

// Additional scale for single shape
export const scaleShape = (points: Point3D[], factor: number): Point3D[] => {
    return points.map(p => ({
        x: p.x * factor,
        y: p.y * factor,
        z: p.z * factor,
    }));
};
