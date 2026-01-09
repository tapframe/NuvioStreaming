import { useRef } from 'react';
import type { MPVPlayerRef } from '../../MPVPlayerComponent';

export const useMPVPlayer = () => {
  const mpvPlayerRef = useRef<MPVPlayerRef>(null);

  const seek = (time: number) => {
    mpvPlayerRef.current?.seek(time);
  };

  return {
    mpvPlayerRef,
    seek,
  };
};

