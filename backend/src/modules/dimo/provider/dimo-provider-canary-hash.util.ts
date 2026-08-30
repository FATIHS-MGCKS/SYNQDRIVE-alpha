/**
 * Deterministic FNV-1a 32-bit hash — stable across processes/replicas (P1.3-S4).
 */
export function stableCanaryHashPercent(stableKey: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < stableKey.length; i += 1) {
    hash ^= stableKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

/** True when stableKey falls into the [0, percent) canary bucket. */
export function isInCanaryPercentBucket(stableKey: string, percent: number): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return stableCanaryHashPercent(stableKey) < percent;
}
