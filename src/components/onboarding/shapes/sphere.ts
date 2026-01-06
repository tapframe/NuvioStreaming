import { N_POINTS } from './constants';
import { type Point3D } from './types';
import { fibonacciPoint, normalizeShape } from './utils';

// Sphere
const generateSpherePoints = (radius: number): Point3D[] => {
    const points: Point3D[] = [];
    for (let i = 0; i < N_POINTS; i++) {
        const { theta, phi } = fibonacciPoint(i, N_POINTS);
        points.push({
            x: radius * Math.sin(phi) * Math.cos(theta),
            y: radius * Math.sin(phi) * Math.sin(theta),
            z: radius * Math.cos(phi),
        });
    }
    return points;
};

export const SPHERE_POINTS = normalizeShape(generateSpherePoints(100));
