import { useCallback, useRef } from 'react';

/**
 * Monotonic request identity for async hooks.
 * A stale in-flight response must not commit when `generation !== currentGeneration()`.
 */
export function useRequestGeneration() {
  const generationRef = useRef(0);

  const nextGeneration = useCallback(() => {
    generationRef.current += 1;
    return generationRef.current;
  }, []);

  const currentGeneration = useCallback(() => generationRef.current, []);

  const isCurrent = useCallback(
    (generation: number) => generation === generationRef.current,
    [],
  );

  const invalidateInFlight = useCallback(() => {
    generationRef.current += 1;
  }, []);

  return { nextGeneration, currentGeneration, isCurrent, invalidateInFlight };
}
