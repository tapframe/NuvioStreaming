import { N_POINTS } from './constants';
import { type Point3D } from './types';
import { normalizeShape, scaleShape } from './utils';

// LEGO Brick shape - perfectly represents "Addons" or "Plugins"
const generateLegoPoints = (): Point3D[] => {
    const points: Point3D[] = [];

    // Dimensions
    const width = 160;
    const depth = 80;
    const height = 48;
    const studRadius = 12;
    const studHeight = 16;

    // Distribute points: 70% body, 30% studs
    const bodyPoints = Math.floor(N_POINTS * 0.7);
    const studPoints = N_POINTS - bodyPoints;
    const pointsPerStud = Math.floor(studPoints / 8); // 8 studs (2x4 brick)

    // 1. Main Brick Body (Rectangular Prism)
    for (let i = 0; i < bodyPoints; i++) {
        const t1 = Math.random();
        const t2 = Math.random();
        const t3 = Math.random();

        // Create density concentration on edges for better definition
        const x = (Math.pow(t1, 0.5) * (Math.random() > 0.5 ? 1 : -1)) * width / 2;
        const y = (Math.pow(t2, 0.5) * (Math.random() > 0.5 ? 1 : -1)) * height / 2;
        const z = (Math.pow(t3, 0.5) * (Math.random() > 0.5 ? 1 : -1)) * depth / 2;

        // Snapping to faces to make it look solid
        const face = Math.floor(Math.random() * 6);
        let px = x, py = y, pz = z;

        if (face === 0) px = width / 2;
        else if (face === 1) px = -width / 2;
        else if (face === 2) py = height / 2;
        else if (face === 3) py = -height / 2;
        else if (face === 4) pz = depth / 2;
        else if (face === 5) pz = -depth / 2;

        // Add some random noise inside/surface
        if (Math.random() > 0.8) {
            points.push({ x: x, y: y, z: z });
        } else {
            points.push({ x: px, y: py, z: pz });
        }
    }

    // 2. Studs (Cylinders on top)
    // 2x4 Grid positions
    const studPositions = [
        { x: -width * 0.375, z: -depth * 0.25 }, { x: -width * 0.125, z: -depth * 0.25 },
        { x: width * 0.125, z: -depth * 0.25 }, { x: width * 0.375, z: -depth * 0.25 },
        { x: -width * 0.375, z: depth * 0.25 }, { x: -width * 0.125, z: depth * 0.25 },
        { x: width * 0.125, z: depth * 0.25 }, { x: width * 0.375, z: depth * 0.25 },
    ];

    studPositions.forEach((pos, studIndex) => {
        for (let j = 0; j < pointsPerStud; j++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * studRadius;

            // Top face of stud
            if (Math.random() > 0.5) {
                points.push({
                    x: pos.x + r * Math.cos(angle),
                    y: -height / 2 - studHeight, // Top
                    z: pos.z + r * Math.sin(angle),
                });
            } else {
                // Side of stud
                const h = Math.random() * studHeight;
                points.push({
                    x: pos.x + studRadius * Math.cos(angle),
                    y: -height / 2 - h,
                    z: pos.z + studRadius * Math.sin(angle),
                });
            }
        }
    });

    // FILL remaining points to prevent "undefined" errors
    while (points.length < N_POINTS) {
        points.push(points[points.length - 1] || { x: 0, y: 0, z: 0 });
    }

    // Slice to guarantee exact count
    return points.slice(0, N_POINTS);
};

export const PLUGIN_POINTS = scaleShape(
    normalizeShape(generateLegoPoints()),
    0.4,
);
