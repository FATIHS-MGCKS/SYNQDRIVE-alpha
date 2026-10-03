import { P25_APD_PROFILE_CLASSIFIER_V1 } from './p25-apd-policy-versions';

export type P25ApdCadenceProfileClass =
  | 'STABLE_PERIODIC'
  | 'MULTIMODAL'
  | 'INSUFFICIENT_EVIDENCE'
  | 'SPARSE_IRREGULAR'
  | 'PROVIDER_OBSERVABILITY_GAP';

export interface P25ApdProfileStats {
  medianIntervalMs: number;
  gapCount: number;
}

function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/**
 * Mirrors `classifyProfile` in `backend/scripts/ops/p25-apd-replay-policy-core.mjs`.
 * `gapsSec` = consecutive strict-rest LV provider_timestamp gaps (seconds).
 */
export function classifyP25ApdCadenceProfile(
  gapsSec: number[],
  medianSec: number,
): P25ApdCadenceProfileClass {
  if (gapsSec.length < 5) return 'INSUFFICIENT_EVIDENCE';
  const sorted = [...gapsSec].sort((a, b) => a - b);
  const p95 = quantile(sorted, 0.95) ?? 0;
  const in79 =
    gapsSec.filter((g) => g >= 7 * 3600 && g <= 9 * 3600).length / gapsSec.length;
  const in610 =
    gapsSec.filter((g) => g >= 6 * 3600 && g <= 10 * 3600).length / gapsSec.length;
  if (medianSec >= 7 * 3600 && medianSec <= 9 * 3600 && in79 >= 0.4) {
    return 'STABLE_PERIODIC';
  }
  if (medianSec < 6 * 3600 && in610 >= 0.15) return 'MULTIMODAL';
  if (in610 >= 0.15 && p95 > 12 * 3600) return 'MULTIMODAL';
  if (medianSec < 4 * 3600) return 'SPARSE_IRREGULAR';
  return 'MULTIMODAL';
}

export const p25ApdProfileClassifierMeta = {
  version: P25_APD_PROFILE_CLASSIFIER_V1,
};
