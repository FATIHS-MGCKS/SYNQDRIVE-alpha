/**
 * Deterministic recursive canonical JSON for fingerprinting.
 * Object keys sorted at every nesting level; array order preserved.
 */
export function canonicalizeForFingerprint(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => canonicalizeForFingerprint(entry));
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(6));
  }
  if (typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const canonical: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    canonical[key] = canonicalizeForFingerprint(record[key]);
  }
  return canonical;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeForFingerprint(value));
}
