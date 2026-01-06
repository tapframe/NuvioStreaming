import { N_POINTS } from './constants';
import { type Point3D } from './types';
import { normalizeShape, scaleShape } from './utils';

// Torus - uniform grid with same index correspondence
const generateTorusPoints = (major: number, minor: number): Point3D[] => {
    const points: Point3D[] = [];

    // Calculate approximate grid dimensions
    const ratio = major / minor;
    const minorSegments = Math.round(Math.sqrt(N_POINTS / ratio));
    const majorSegments = Math.round(N_POINTS / minorSegments);

    let idx = 0;
    for (let i = 0; i < majorSegments && idx < N_POINTS; i++) {
        const u = (i / majorSegments) * Math.PI * 2;

        for (let j = 0; j < minorSegments && idx < N_POINTS; j++) {
            const v = (j / minorSegments) * Math.PI * 2;

            points.push({
                x: (major + minor * Math.cos(v)) * Math.cos(u),
                y: (major + minor * Math.cos(v)) * Math.sin(u),
                z: minor * Math.sin(v),
            });
            idx++;
        }
    }

    // Fill missing points if necessary
    while (points.length < N_POINTS) {
        const t = points.length / N_POINTS;
        const u = t * Math.PI * 2 * majorSegments;
        const v = t * Math.PI * 2 * minorSegments;
        points.push({
            x: (major + minor * Math.cos(v)) * Math.cos(u),
            y: (major + minor * Math.cos(v)) * Math.sin(u),
            z: minor * Math.sin(v),
        });
    }

    return points.slice(0, N_POINTS);
};

export const TORUS_POINTS = scaleShape(
    normalizeShape(generateTorusPoints(50, 25)),
    1.2,
);
