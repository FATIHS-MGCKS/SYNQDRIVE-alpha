import { useCallback, useMemo, useRef } from 'react';

/** Monotonic request id guard — stale async responses are ignored when seq !== current. */
export function useRequestGuard() {
  const seqRef = useRef(0);

  const next = useCallback(() => {
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const isCurrent = useCallback((seq: number) => seq === seqRef.current, []);

  const current = useCallback(() => seqRef.current, []);

  // Stable object reference across renders — consumers depend on this guard in
  // useCallback/useEffect deps (e.g. useVehicleTrips.loadTrips). A fresh object
  // each render would make those callbacks unstable and loop the load effect.
  return useMemo(() => ({ next, isCurrent, current }), [next, isCurrent, current]);
}
