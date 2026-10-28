/**
 * Canonical vehicle technical specification helpers (displacement, cylinders, F/R weight).
 */

export function formatFrontRearWeightDistribution(
  frontWeightDistributionPct: number | null | undefined,
): string {
  if (frontWeightDistributionPct == null || !Number.isFinite(frontWeightDistributionPct)) {
    return '';
  }
  const front = Math.round(frontWeightDistributionPct);
  if (front <= 0 || front >= 100) {
    return String(front);
  }
  const rear = 100 - front;
  return `${front}/${rear}`;
}

/**
 * Parses Master form values such as "58/42", "58", or "58% front" into front axle percent.
 */
export function parseFrontWeightDistributionPct(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }
  const raw = String(input).trim();
  if (!raw) return null;
  const slash = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slash) {
    const front = Number(slash[1]);
    if (!Number.isFinite(front) || front <= 0 || front >= 100) return null;
    return front;
  }
  const leading = raw.match(/^(\d+(?:\.\d+)?)/);
  if (!leading) return null;
  const front = Number(leading[1]);
  if (!Number.isFinite(front) || front <= 0 || front >= 100) return null;
  return front;
}

export function parsePositiveIntegerField(input: unknown): number | null {
  if (input == null || input === '') return null;
  const n = typeof input === 'number' ? input : Number(String(input).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function valuesEqualScalar(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}
