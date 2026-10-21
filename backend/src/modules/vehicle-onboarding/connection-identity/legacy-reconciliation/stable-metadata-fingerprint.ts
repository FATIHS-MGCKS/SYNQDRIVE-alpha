import { createHash } from 'node:crypto';

/** Recursively sort object keys for deterministic JSON fingerprints (JSONB-safe comparisons). */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => canonicalizeJsonValue(item));
  if (typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalizeJsonValue(obj[key]);
  }
  return sorted;
}

export function fingerprintLinkMetadata(metadata: unknown): string {
  const canonical = canonicalizeJsonValue(metadata ?? null);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
