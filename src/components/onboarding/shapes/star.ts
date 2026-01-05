import { N_POINTS } from './constants';
import { type Point3D } from './types';
import { fibonacciPoint, normalizeShape, scaleShape } from './utils';

// Star shape - for "Welcome" page
const generateStarPoints = (outerRadius: number, innerRadius: number): Point3D[] => {
    const points: Point3D[] = [];
    const numPoints = 5; // 5-pointed star

    for (let i = 0; i < N_POINTS; i++) {
        const { theta, phi, t } = fibonacciPoint(i, N_POINTS);

        // Create star cross-section
        const angle = theta * numPoints;
        const radiusFactor = 0.5 + 0.5 * Math.cos(angle);
        const radius = innerRadius + (outerRadius - innerRadius) * radiusFactor;

        const sinPhi = Math.sin(phi);
        points.push({
            x: radius * sinPhi * Math.cos(theta),
            y: radius * sinPhi * Math.sin(theta),
            z: radius * Math.cos(phi) * 0.3, // Flatten z for star shape
        });
    }
    return points;
};

export const STAR_POINTS = scaleShape(
    normalizeShape(generateStarPoints(100, 40)),
    0.9,
);
