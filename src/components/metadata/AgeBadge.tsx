import React from 'react';
import TVPGSvg from '../../assets/agerating/TV-PG.svg';
import PGSvg from '../../assets/agerating/PG.svg';
import TVGSvg from '../../assets/agerating/TV-G.svg';
import NC17Svg from '../../assets/agerating/NC-17.svg';
import GSvg from '../../assets/agerating/G.svg';
import TVMASvg from '../../assets/agerating/TV-MA.svg';
import TV13Svg from '../../assets/agerating/TV-13.svg';
import TVY7Svg from '../../assets/agerating/TV-Y7.svg';
import RSvg from '../../assets/agerating/R.svg';
import PG13Svg from '../../assets/agerating/PG-13.svg';
import TVYSvg from '../../assets/agerating/TV-Y.svg';

interface AgeBadgeProps {
  rating: string;
}

const AgeBadge: React.FC<AgeBadgeProps> = ({ rating }) => {
  // Normalize the rating to match our file names
  const normalizeRating = (rating: string): string => {
    // Convert to uppercase and remove any spaces
    const normalized = rating.toUpperCase().replace(/\s+/g, '');
    
    // Map some common variations
    const ratingMap: { [key: string]: string } = {
      'TVPG': 'TV-PG',
      'TVG': 'TV-G',
      'TVMA': 'TV-MA',
      'TV14': 'TV-13',
      'TVY7': 'TV-Y7',
      'TVY': 'TV-Y',
      'PG13': 'PG-13',
      'NC17': 'NC-17',
    };

    return ratingMap[normalized] || normalized;
  };

  const getRatingComponent = (normalizedRating: string) => {
    const svgProps = {
      width: 32,
      height: 32,
      preserveAspectRatio: "xMidYMid meet"
    };

    switch (normalizedRating) {
      case 'TV-PG':
        return <TVPGSvg {...svgProps} />;
      case 'PG':
        return <PGSvg {...svgProps} />;
      case 'TV-G':
        return <TVGSvg {...svgProps} />;
      case 'NC-17':
        return <NC17Svg {...svgProps} />;
      case 'G':
        return <GSvg {...svgProps} />;
      case 'TV-MA':
        return <TVMASvg {...svgProps} />;
      case 'TV-13':
        return <TV13Svg {...svgProps} />;
      case 'TV-Y7':
        return <TVY7Svg {...svgProps} />;
      case 'R':
        return <RSvg {...svgProps} />;
      case 'PG-13':
        return <PG13Svg {...svgProps} />;
      case 'TV-Y':
        return <TVYSvg {...svgProps} />;
      default:
        return null;
    }
  };

  const normalizedRating = normalizeRating(rating);
  const RatingComponent = getRatingComponent(normalizedRating);

  if (!RatingComponent) {
    return null;
  }

  return RatingComponent;
};

export default AgeBadge; 