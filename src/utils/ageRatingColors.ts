/**
 * Premium color mapping for age ratings
 * Provides consistent, visually appealing colors for different age rating systems
 */

// Movie Ratings (MPA) - Premium Colors
export const MOVIE_RATING_COLORS = {
  'G': '#00C851',        // Vibrant Green - General Audiences
  'PG': '#FFBB33',       // Golden Yellow - Parental Guidance Suggested
  'PG-13': '#FF8800',    // Premium Orange - Parents Strongly Cautioned
  'R': '#FF4444',        // Premium Red - Restricted
  'NC-17': '#CC0000',    // Deep Crimson - No One 17 and Under Admitted
  'UNRATED': '#666666',  // Neutral Gray - Unrated content
  'NOT RATED': '#666666', // Neutral Gray - Not Rated content
} as const;

// TV Ratings (TV Parental Guidelines) - Premium Colors
export const TV_RATING_COLORS = {
  'TV-Y': '#00C851',       // Vibrant Green - All Children
  'TV-Y7': '#66BB6A',      // Light Green - Directed to Older Children
  'TV-G': '#00C851',       // Vibrant Green - General Audience
  'TV-PG': '#FFBB33',      // Golden Yellow - Parental Guidance Suggested
  'TV-14': '#FF8800',      // Premium Orange - Parents Strongly Cautioned
  'TV-MA': '#FF4444',      // Premium Red - Mature Audience Only
  'NR': '#666666',         // Neutral Gray - Not Rated
  'UNRATED': '#666666',    // Neutral Gray - Unrated content
} as const;

// Common/Generic age rating patterns that might appear
export const COMMON_RATING_PATTERNS = {
  // Movie patterns
  'G': '#00C851',
  'PG': '#FFBB33',
  'PG-13': '#FF8800',
  'R': '#FF4444',
  'NC-17': '#CC0000',
  'UNRATED': '#666666',
  'NOT RATED': '#666666',

  // TV patterns
  'TV-Y': '#00C851',
  'TV-Y7': '#66BB6A',
  'TV-G': '#00C851',
  'TV-PG': '#FFBB33',
  'TV-14': '#FF8800',
  'TV-MA': '#FF4444',
  'NR': '#666666',

  // International/common patterns
  'U': '#00C851',          // Universal (UK) - Green
  'U/A': '#00C851',        // Universal/Adult (India) - Green
  'A': '#FF8800',          // Adult (India) - Orange
  'S': '#FF4444',          // Restricted (India) - Red
  'UA': '#FFBB33',         // Parental Guidance (India) - Yellow
  '12': '#FF8800',         // 12+ (Various countries) - Orange
  '12A': '#FFBB33',        // 12A (UK) - Yellow
  '15': '#FF4444',         // 15+ (Various countries) - Red
  '18': '#CC0000',         // 18+ (Various countries) - Dark Red
  '18+': '#CC0000',        // 18+ - Dark Red
  'R18': '#CC0000',        // R18 (Australia) - Dark Red
  'X': '#CC0000',          // X (Adult) - Dark Red
} as const;

/**
 * Get the appropriate color for a movie rating
 * @param rating - The movie rating (e.g., 'PG-13', 'R', 'G')
 * @returns Hex color code for the rating
 */
export function getMovieRatingColor(rating: string | null | undefined): string {
  if (!rating) return '#666666'; // Default gray for no rating

  const normalizedRating = rating.toUpperCase().trim();

  // Direct lookup in movie ratings
  if (normalizedRating in MOVIE_RATING_COLORS) {
    return MOVIE_RATING_COLORS[normalizedRating as keyof typeof MOVIE_RATING_COLORS];
  }

  // Check common patterns
  if (normalizedRating in COMMON_RATING_PATTERNS) {
    return COMMON_RATING_PATTERNS[normalizedRating as keyof typeof COMMON_RATING_PATTERNS];
  }

  // Special handling for some common variations
  if (normalizedRating.includes('PG') && normalizedRating.includes('13')) {
    return '#FF8800'; // PG-13 variations
  }

  if (normalizedRating.includes('TV') && normalizedRating.includes('MA')) {
    return '#FF4444'; // TV-MA variations
  }

  // Default fallback
  return '#666666';
}

/**
 * Get the appropriate color for a TV rating
 * @param rating - The TV rating (e.g., 'TV-14', 'TV-MA', 'TV-Y')
 * @returns Hex color code for the rating
 */
export function getTVRatingColor(rating: string | null | undefined): string {
  if (!rating) return '#666666'; // Default gray for no rating

  const normalizedRating = rating.toUpperCase().trim();

  // Direct lookup in TV ratings
  if (normalizedRating in TV_RATING_COLORS) {
    return TV_RATING_COLORS[normalizedRating as keyof typeof TV_RATING_COLORS];
  }

  // Check common patterns
  if (normalizedRating in COMMON_RATING_PATTERNS) {
    return COMMON_RATING_PATTERNS[normalizedRating as keyof typeof COMMON_RATING_PATTERNS];
  }

  // Special handling for TV rating variations
  if (normalizedRating.startsWith('TV-')) {
    const tvRating = normalizedRating as keyof typeof TV_RATING_COLORS;
    if (tvRating in TV_RATING_COLORS) {
      return TV_RATING_COLORS[tvRating];
    }
  }

  // Default fallback
  return '#666666';
}

/**
 * Get the appropriate color for any content rating based on content type
 * @param rating - The rating string
 * @param contentType - 'movie' or 'series' to determine which rating system to use
 * @returns Hex color code for the rating
 */
export function getAgeRatingColor(rating: string | null | undefined, contentType: 'movie' | 'series' = 'movie'): string {
  if (!rating) return '#666666';

  // For movies, prioritize movie rating system
  if (contentType === 'movie') {
    return getMovieRatingColor(rating);
  }

  // For series/TV shows, check TV ratings first, then fall back to movie ratings
  const tvColor = getTVRatingColor(rating);
  if (tvColor !== '#666666') {
    return tvColor;
  }

  // Fallback to movie rating system for series
  return getMovieRatingColor(rating);
}

/**
 * Get a human-readable description for an age rating
 * @param rating - The rating string
 * @param contentType - Content type for context
 * @returns Description of what the rating means
 */
export function getAgeRatingDescription(rating: string | null | undefined, contentType: 'movie' | 'series' = 'movie'): string {
  if (!rating) return 'Not Rated';

  const normalizedRating = rating.toUpperCase().trim();

  // Movie rating descriptions
  const movieDescriptions: Record<string, string> = {
    'G': 'General Audiences - All ages admitted',
    'PG': 'Parental Guidance Suggested - Some material may not be suitable for children',
    'PG-13': 'Parents Strongly Cautioned - Some material may be inappropriate for children under 13',
    'R': 'Restricted - Under 17 requires accompanying parent or adult guardian',
    'NC-17': 'No One 17 and Under Admitted - Clearly adult content',
    'UNRATED': 'Unrated - Content rating not assigned',
    'NOT RATED': 'Not Rated - Content rating not assigned',
  };

  // TV rating descriptions
  const tvDescriptions: Record<string, string> = {
    'TV-Y': 'All Children - Designed to be appropriate for all children',
    'TV-Y7': 'Directed to Older Children - Designed for children age 7 and above',
    'TV-G': 'General Audience - Most parents would find suitable for all ages',
    'TV-PG': 'Parental Guidance Suggested - May contain material unsuitable for younger children',
    'TV-14': 'Parents Strongly Cautioned - May contain material unsuitable for children under 14',
    'TV-MA': 'Mature Audience Only - Specifically designed for adults',
    'NR': 'Not Rated - Content rating not assigned',
    'UNRATED': 'Unrated - Content rating not assigned',
  };

  if (contentType === 'movie' && normalizedRating in movieDescriptions) {
    return movieDescriptions[normalizedRating];
  }

  if (contentType === 'series' && normalizedRating in tvDescriptions) {
    return tvDescriptions[normalizedRating];
  }

  // Fallback descriptions for common international ratings
  const commonDescriptions: Record<string, string> = {
    'U': 'Universal - Suitable for all ages',
    'U/A': 'Universal with Adult guidance - Parental discretion advised',
    'A': 'Adults only - Not suitable for children',
    'S': 'Restricted - Not suitable for children',
    'UA': 'Parental Guidance - Parental discretion advised',
    '12': 'Suitable for ages 12 and above',
    '12A': 'Suitable for ages 12 and above when accompanied by an adult',
    '15': 'Suitable for ages 15 and above',
    '18': 'Suitable for ages 18 and above only',
    '18+': 'Adult content - 18 and above only',
    'R18': 'Restricted 18 - Adult content only',
    'X': 'Adult content - Explicit material',
  };

  if (normalizedRating in commonDescriptions) {
    return commonDescriptions[normalizedRating];
  }

  return `${rating} - Rating information not available`;
}
