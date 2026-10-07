/**
 * Frozen PS1 profileStats median semantics (APD offline replay authority).
 * Empirical median uses eligible gaps (>60s); when medianSec * 1000 is absent, PS1 uses 8h.
 */
export const P25_APD_PROFILE_ELIGIBLE_GAP_MIN_SECONDS = 60;

/** PS1: `medianSec * 1000 || 8 * 3600 * 1000` in profileStats / simulatePolicy. */
export const P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS = 8 * 3600 * 1000;

export function resolveP25ApdProfileMedianCadenceMs(medianSec: number): number {
  const empiricalMs = medianSec * 1000;
  return empiricalMs > 0
    ? empiricalMs
    : P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS;
}
