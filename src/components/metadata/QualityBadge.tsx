import React from 'react';
import HDSvg from '../../assets/qualitybadge/HD.svg';
import VISIONSvg from '../../assets/qualitybadge/VISION.svg';
import ADSvg from '../../assets/qualitybadge/AD.svg';

interface QualityBadgeProps {
  type: 'HD' | 'VISION' | 'AD';
}

const QualityBadge: React.FC<QualityBadgeProps> = ({ type }) => {
  const svgProps = {
    width: 32,
    height: 32,
    preserveAspectRatio: "xMidYMid meet"
  };

  switch (type) {
    case 'HD':
      return <HDSvg {...svgProps} />;
    case 'VISION':
      return <VISIONSvg {...svgProps} />;
    case 'AD':
      return <ADSvg {...svgProps} />;
    default:
      return null;
  }
};

export default QualityBadge; 