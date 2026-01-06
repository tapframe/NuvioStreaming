import { N_POINTS } from './constants';
import { type Point3D } from './types';
import { fibonacciPoint, normalizeShape } from './utils';

// Heart - starts from Fibonacci sphere, deforms into heart
const generateHeartPoints = (scale: number): Point3D[] => {
    const points: Point3D[] = [];
    for (let i = 0; i < N_POINTS; i++) {
        const { theta, phi } = fibonacciPoint(i, N_POINTS);

        // Use same angular coordinates as sphere
        const u = theta;
        const v = phi;
        const sinV = Math.sin(v);

        // Heart surface with same angular correspondence
        const hx = sinV * (15 * Math.sin(u) - 4 * Math.sin(3 * u));
        const hz = 8 * Math.cos(v);
        const hy =
            sinV *
            (15 * Math.cos(u) -
                5 * Math.cos(2 * u) -
                2 * Math.cos(3 * u) -
                Math.cos(4 * u));

        points.push({
            x: hx * scale * 0.06,
            y: -hy * scale * 0.06,
            z: hz * scale * 0.06,
        });
    }
    return points;
};

export const HEART_POINTS = normalizeShape(generateHeartPoints(120));
