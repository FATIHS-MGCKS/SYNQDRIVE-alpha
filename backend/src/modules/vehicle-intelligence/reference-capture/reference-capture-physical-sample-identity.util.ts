import { createHash } from 'crypto';
import { canonicalizeBucketTimestamp } from './reference-capture-hf-aggregate-bucket-analysis';
import { hashNormalizedBucketValue } from './reference-capture-bucket-value.util';
import {
  HF_AGGREGATION_TYPE,
  HF_REQUESTED_INTERVAL,
} from './reference-capture-hf-watermark-policy';

export const HF_PHYSICAL_IDENTITY_VERSION = {
  LEGACY_VALUE_V1: 'LEGACY_VALUE_V1',
  AGGREGATE_BUCKET_V2: 'AGGREGATE_BUCKET_V2',
} as const;

export type HfPhysicalIdentityVersion =
  (typeof HF_PHYSICAL_IDENTITY_VERSION)[keyof typeof HF_PHYSICAL_IDENTITY_VERSION];

export type PhysicalSampleIdentityInput = {
  providerField: string;
  providerTimestamp: string | null;
  normalizedValue: unknown;
  interval?: string;
  aggregation?: string;
  identityVersion?: HfPhysicalIdentityVersion;
};

export type AggregateBucketIdentityInput = {
  providerField: string;
  providerTimestamp: string | null;
  interval?: string;
  aggregation?: string;
  identityVersion?: HfPhysicalIdentityVersion;
};

/**
 * Canonical aggregate bucket identity — version + field + bucket timestamp + aggregation contract.
 * Does NOT include normalizedValue (value revisions are payload, not identity).
 */
export function buildAggregateBucketFingerprint(input: AggregateBucketIdentityInput): string {
  const version = input.identityVersion ?? HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2;
  const ts = input.providerTimestamp ? canonicalizeBucketTimestamp(input.providerTimestamp) : '';
  return createHash('sha256')
    .update([version, input.providerField, ts, input.interval, input.aggregation].join('|'))
    .digest('hex');
}

/** Historical V1 physical identity: field + providerTimestamp + normalizedValue (no version prefix). */
export function buildLegacyValueInclusiveFingerprint(input: {
  providerField: string;
  providerTimestamp: string | null;
  normalizedValue: unknown;
}): string {
  const ts = input.providerTimestamp ? canonicalizeBucketTimestamp(input.providerTimestamp) : '';
  const value =
    input.normalizedValue === undefined || input.normalizedValue === null
      ? ''
      : typeof input.normalizedValue === 'object'
        ? JSON.stringify(input.normalizedValue)
        : String(input.normalizedValue);

  return createHash('sha256').update([input.providerField, ts, value].join('|')).digest('hex');
}

/** Stable idempotency key for PROVIDER_BUCKET_REVISION evidence (not a physical bucket). */
export function buildProviderBucketRevisionIdentity(input: {
  bucketIdentity: string;
  firstSeenValueHash: string;
  revisedValueHash: string;
}): string {
  return createHash('sha256')
    .update(
      [input.bucketIdentity, input.firstSeenValueHash, input.revisedValueHash].join('|'),
    )
    .digest('hex');
}

/** Stable identity of a persisted HF_HISTORICAL aggregate bucket (executed query contract). */
export function buildPhysicalSampleFingerprint(input: PhysicalSampleIdentityInput): string {
  const version = input.identityVersion ?? HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2;
  if (version === HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1) {
    return buildLegacyValueInclusiveFingerprint({
      providerField: input.providerField,
      providerTimestamp: input.providerTimestamp,
      normalizedValue: input.normalizedValue,
    });
  }
  return buildAggregateBucketFingerprint({
    providerField: input.providerField,
    providerTimestamp: input.providerTimestamp,
    interval: input.interval ?? HF_REQUESTED_INTERVAL,
    aggregation: input.aggregation ?? HF_AGGREGATION_TYPE,
    identityVersion: HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2,
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

export function resolveHfPhysicalIdentityVersion(
  state: { hfPhysicalIdentityVersion?: HfPhysicalIdentityVersion; seenPhysicalSampleFingerprints?: string[] },
): HfPhysicalIdentityVersion {
  if (state.hfPhysicalIdentityVersion) return state.hfPhysicalIdentityVersion;
  if (state.seenPhysicalSampleFingerprints?.length) {
    return HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1;
  }
  return HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2;
}

export function isActiveLegacyIdentitySession(
  state: { hfPhysicalIdentityVersion?: HfPhysicalIdentityVersion; seenPhysicalSampleFingerprints?: string[] },
): boolean {
  return resolveHfPhysicalIdentityVersion(state) === HF_PHYSICAL_IDENTITY_VERSION.LEGACY_VALUE_V1;
}
