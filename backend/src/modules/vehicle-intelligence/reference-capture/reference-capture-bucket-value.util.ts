import { createHash } from 'crypto';

/** Stable hash for provider bucket value revision detection (not identity). */
export function hashNormalizedBucketValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  const serialized =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  return createHash('sha256').update(serialized).digest('hex');
}

export function bucketValuesEqual(a: unknown, b: unknown): boolean {
  return hashNormalizedBucketValue(a) === hashNormalizedBucketValue(b);
}
