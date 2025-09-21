import React from 'react';
import { Platform } from 'react-native';
import AndroidVideoPlayer from './AndroidVideoPlayer';
import KSPlayerCore from './KSPlayerCore';

// Simple platform-based player selection
const KSPlayer: React.FC = () => {
  return Platform.OS === 'ios' ? <KSPlayerCore /> : <AndroidVideoPlayer />;
};

export default KSPlayer;