import { useEffect, useState } from 'react';

function computeIsOperatorDevice(): boolean {
  if (import.meta.env.VITE_ALLOW_OPERATOR_DESKTOP === 'true') {
    return true;
  }
  if (typeof window === 'undefined') return false;

  const narrowViewport = window.matchMedia('(max-width: 1280px)').matches;
  const touchPrimary = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return narrowViewport || touchPrimary;
}

/**
 * UX-only device guard for Operator surfaces (not a security boundary).
 */
export function useIsOperatorDevice(): boolean {
  const [isOperatorDevice, setIsOperatorDevice] = useState(computeIsOperatorDevice);

  useEffect(() => {
    const update = () => setIsOperatorDevice(computeIsOperatorDevice());
    const queries = [
      window.matchMedia('(max-width: 1280px)'),
      window.matchMedia('(hover: none) and (pointer: coarse)'),
    ];
    queries.forEach((mq) => mq.addEventListener('change', update));
    window.addEventListener('resize', update);
    return () => {
      queries.forEach((mq) => mq.removeEventListener('change', update));
      window.removeEventListener('resize', update);
    };
  }, []);

  return isOperatorDevice;
}
