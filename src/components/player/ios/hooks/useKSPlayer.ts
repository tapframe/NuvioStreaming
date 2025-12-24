import { useRef } from 'react';
import { KSPlayerRef } from '../../KSPlayerComponent';

export const useKSPlayer = () => {
    const ksPlayerRef = useRef<KSPlayerRef>(null);

    const seek = (time: number) => {
        ksPlayerRef.current?.seek(time);
    };

    return {
        ksPlayerRef,
        seek
    };
};
