export { type Point3D } from './types';
export { N_POINTS } from './constants';

import { N_POINTS } from './constants';
import { STAR_POINTS } from './star';       // Welcome to Nuvio
import { PLUGIN_POINTS } from './plugin';   // Powerful Addons  
import { SEARCH_POINTS } from './search';   // Smart Discovery
import { HEART_POINTS } from './heart';     // Your Library (favorites)

// Array of all shapes - ordered to match onboarding slides
export const ALL_SHAPES = [
    STAR_POINTS,    // Slide 1: Welcome
    PLUGIN_POINTS,  // Slide 2: Addons
    SEARCH_POINTS,  // Slide 3: Discovery
    HEART_POINTS,   // Slide 4: Library
];

export const POINTS_ARRAY = new Array(N_POINTS).fill(0);

export const ALL_SHAPES_X = POINTS_ARRAY.map((_, pointIndex) =>
    ALL_SHAPES.map(shape => shape[pointIndex].x),
);
export const ALL_SHAPES_Y = POINTS_ARRAY.map((_, pointIndex) =>
    ALL_SHAPES.map(shape => shape[pointIndex].y),
);
export const ALL_SHAPES_Z = POINTS_ARRAY.map((_, pointIndex) =>
    ALL_SHAPES.map(shape => shape[pointIndex].z),
);
