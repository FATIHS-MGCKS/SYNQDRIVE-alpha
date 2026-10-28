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
  return `${front}/${100 - front}`;
}

export function parseFrontWeightDistributionPct(input: string | number | null | undefined): number | null {
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

export function parsePositiveIntegerField(input: string | number | null | undefined): number | null {
  if (input == null || input === '') return null;
  const n = typeof input === 'number' ? input : Number(String(input).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
