import { N_POINTS } from './constants';
import { type Point3D } from './types';
import { normalizeShape, scaleShape } from './utils';

// Magnifying glass/search shape - for "Discovery" page
const generateSearchPoints = (radius: number): Point3D[] => {
    const points: Point3D[] = [];
    const handleLength = radius * 0.8;
    const handleWidth = radius * 0.15;

    // Split points between ring and handle
    const ringPoints = Math.floor(N_POINTS * 0.7);
    const handlePoints = N_POINTS - ringPoints;

    // Create the circular ring (lens)
    for (let i = 0; i < ringPoints; i++) {
        const t = i / ringPoints;
        const mainAngle = t * Math.PI * 2;
        const tubeAngle = (i * 17) % 20 / 20 * Math.PI * 2; // Distribute around tube

        const tubeRadius = radius * 0.12;
        const centerRadius = radius;

        const cx = centerRadius * Math.cos(mainAngle);
        const cy = centerRadius * Math.sin(mainAngle);

        points.push({
            x: cx + tubeRadius * Math.cos(tubeAngle) * Math.cos(mainAngle),
            y: cy + tubeRadius * Math.cos(tubeAngle) * Math.sin(mainAngle),
            z: tubeRadius * Math.sin(tubeAngle),
        });
    }

    // Create the handle
    for (let i = 0; i < handlePoints; i++) {
        const t = i / handlePoints;
        const handleAngle = (i * 13) % 12 / 12 * Math.PI * 2;

        // Handle position (extends from bottom-right of ring)
        const handleStart = radius * 0.7;
        const hx = handleStart + t * handleLength;
        const hy = handleStart + t * handleLength;

        points.push({
            x: hx + handleWidth * Math.cos(handleAngle) * 0.3,
            y: hy + handleWidth * Math.cos(handleAngle) * 0.3,
            z: handleWidth * Math.sin(handleAngle),
        });
    }

    return points;
};

export const SEARCH_POINTS = scaleShape(
    normalizeShape(generateSearchPoints(80)),
    1.0,
);
