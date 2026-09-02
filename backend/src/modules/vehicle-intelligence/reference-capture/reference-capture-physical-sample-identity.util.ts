import { createHash } from 'crypto';
import { canonicalizeBucketTimestamp } from './reference-capture-hf-aggregate-bucket-analysis';
import {
  HF_AGGREGATION_TYPE,
  HF_REQUESTED_INTERVAL,
} from './reference-capture-hf-watermark-policy';

export type PhysicalSampleIdentityInput = {
  providerField: string;
  providerTimestamp: string | null;
  normalizedValue: unknown;
};

export type AggregateBucketIdentityInput = {
  providerField: string;
  providerTimestamp: string | null;
  interval?: string;
  aggregation?: string;
};

/**
 * Canonical aggregate bucket identity — field + bucket timestamp + aggregation contract.
 * Does NOT include normalizedValue (value revisions are payload, not identity).
 */
export function buildAggregateBucketFingerprint(input: AggregateBucketIdentityInput): string {
  const ts = input.providerTimestamp ? canonicalizeBucketTimestamp(input.providerTimestamp) : '';
  const interval = input.interval ?? HF_REQUESTED_INTERVAL;
  const aggregation = input.aggregation ?? HF_AGGREGATION_TYPE;
  return createHash('sha256')
    .update([input.providerField, ts, interval, aggregation].join('|'))
    .digest('hex');
}

/** @deprecated Use buildAggregateBucketFingerprint — value-inclusive legacy fingerprint. */
export function buildLegacyValueInclusiveFingerprint(input: PhysicalSampleIdentityInput): string {
  const ts = input.providerTimestamp ?? '';
  const value =
    input.normalizedValue === undefined || input.normalizedValue === null
      ? ''
      : typeof input.normalizedValue === 'object'
        ? JSON.stringify(input.normalizedValue)
        : String(input.normalizedValue);

  return createHash('sha256').update([input.providerField, ts, value].join('|')).digest('hex');
}

/** Stable identity of a persisted HF_HISTORICAL aggregate bucket. */
export function buildPhysicalSampleFingerprint(input: PhysicalSampleIdentityInput): string {
  return buildAggregateBucketFingerprint({
    providerField: input.providerField,
    providerTimestamp: input.providerTimestamp,
  });
}

export type HfRetrievalObservation = {
  physicalSampleFingerprint: string;
  provenance?: { duplicateRetrieval?: boolean } | null;
};

/** Collapse HF retrieval observations to unique aggregate buckets for analysis. */
export function collapseToUniquePhysicalSamples<T extends HfRetrievalObservation>(
  observations: T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const obs of observations) {
    if (seen.has(obs.physicalSampleFingerprint)) continue;
    seen.add(obs.physicalSampleFingerprint);
    unique.push(obs);
  }
  return unique;
}
