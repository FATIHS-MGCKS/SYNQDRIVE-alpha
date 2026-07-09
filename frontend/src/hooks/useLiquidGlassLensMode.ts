import { useEffect, useState } from 'react';
import { ENABLE_LIQUID_GLASS_LENS } from '../lib/liquid-glass-lens-flag';

export interface LiquidGlassLensMode {
  /** Flag on and not explicitly disabled by caller. */
  spikeEnabled: boolean;
  /** Prefer @samasante/liquid-glass over CSS-only fallback. */
  useLibraryLens: boolean;
  prefersReducedTransparency: boolean;
  prefersReducedMotion: boolean;
}

function readMedia(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

/**
 * Resolves whether the liquid-glass library path is allowed for this session.
 * Map HUD spike only — does not affect L1/L2 surfaces.
 */
export function useLiquidGlassLensMode(disabled = false): LiquidGlassLensMode {
  const [prefersReducedTransparency, setPrefersReducedTransparency] = useState(() =>
    readMedia('(prefers-reduced-transparency: reduce)'),
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    readMedia('(prefers-reduced-motion: reduce)'),
  );

  useEffect(() => {
    const transparencyMq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const onTransparency = () => setPrefersReducedTransparency(transparencyMq.matches);
    const onMotion = () => setPrefersReducedMotion(motionMq.matches);

    transparencyMq.addEventListener('change', onTransparency);
    motionMq.addEventListener('change', onMotion);
    return () => {
      transparencyMq.removeEventListener('change', onTransparency);
      motionMq.removeEventListener('change', onMotion);
    };
  }, []);

  const spikeEnabled = ENABLE_LIQUID_GLASS_LENS && !disabled;
  const useLibraryLens = spikeEnabled && !prefersReducedTransparency;

  return {
    spikeEnabled,
    useLibraryLens,
    prefersReducedTransparency,
    prefersReducedMotion,
  };
}
