import { useEffect, useRef } from 'react';

import { BackHandler } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

export function useBottomSheetBackHandler() {
  const activeSheetRef =
    useRef<React.RefObject<BottomSheetModal> | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (activeSheetRef.current?.current) {
          activeSheetRef.current.current.dismiss();
          return true;
        }
        return false;
      }
    );

    return () => sub.remove();
  }, []);

  const onChange =
    (ref: React.RefObject<BottomSheetModal>) =>
    (index: number) => {
      if (index >= 0) {
        activeSheetRef.current = ref;
      }
    };

  const onDismiss =
    (ref: React.RefObject<BottomSheetModal>) => () => {
      if (activeSheetRef.current === ref) {
        activeSheetRef.current = null;
      }
    };

  return { onChange, onDismiss };
}