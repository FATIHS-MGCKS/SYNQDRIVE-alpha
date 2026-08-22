import { useCallback, useEffect, useRef } from 'react';

export function useOrgScopedGeneration(orgId: string | null | undefined): number {
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
  }, [orgId]);

  return generationRef.current;
}

export function useOrgScopedGenerationRef(orgId: string | null | undefined) {
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
  }, [orgId]);

  const isCurrent = useCallback(
    (requestOrgId: string, generation: number) =>
      requestOrgId === orgId && generation === generationRef.current,
    [orgId],
  );

  const nextGeneration = useCallback(() => ++generationRef.current, []);

  return { generationRef, isCurrent, nextGeneration };
}
