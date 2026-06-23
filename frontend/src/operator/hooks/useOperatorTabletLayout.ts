import { useEffect, useState } from 'react';
import { useIsOperatorDevice } from './useIsOperatorDevice';

const TABLET_MIN_WIDTH = 768;

/**
 * Tablet split layout: operator device + at least md breakpoint.
 */
export function useOperatorTabletLayout(): boolean {
  const isOperatorDevice = useIsOperatorDevice();
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${TABLET_MIN_WIDTH}px)`).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${TABLET_MIN_WIDTH}px)`);
    const update = () => setIsWide(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isOperatorDevice && isWide;
}
