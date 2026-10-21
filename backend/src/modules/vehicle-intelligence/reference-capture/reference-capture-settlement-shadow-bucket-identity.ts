/**
 * EXP-021 canonical bucket identity — stable across settlement ages for identical [from,to].
 *
 * CANONICAL_EXP021_BUCKET_IDENTITY = FIELD_PIPE_CANONICAL_ISO_MS
 *
 * Uses provider aggregate bucket timestamp normalized to canonical ISO milliseconds.
 * Does NOT mix floor-second keys or raw sub-ms variants across ages.
 */
import { createHash } from 'crypto';
import { canonicalizeBucketTimestamp } from './reference-capture-hf-aggregate-bucket-analysis';

export const CANONICAL_EXP021_BUCKET_IDENTITY = 'FIELD_PIPE_CANONICAL_ISO_MS';

export function buildExp021BucketIdentity(providerField: string, providerTimestamp: string | Date): string {
  const canonicalTs = canonicalizeBucketTimestamp(providerTimestamp);
  return `${providerField}|${canonicalTs}`;
}

export function buildExp021BucketFingerprint(providerField: string, providerTimestamp: string | Date): string {
  return createHash('sha256')
    .update([CANONICAL_EXP021_BUCKET_IDENTITY, buildExp021BucketIdentity(providerField, providerTimestamp)].join('|'))
    .digest('hex');
}

export function areSameSecondDifferentSubMs(a: string, b: string): boolean {
  const aMs = Date.parse(canonicalizeBucketTimestamp(a));
  const bMs = Date.parse(canonicalizeBucketTimestamp(b));
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return false;
  return Math.floor(aMs / 1000) === Math.floor(bMs / 1000) && aMs !== bMs;
}

export function bucketIdentitiesEqual(a: string, b: string): boolean {
  return a === b;
}
