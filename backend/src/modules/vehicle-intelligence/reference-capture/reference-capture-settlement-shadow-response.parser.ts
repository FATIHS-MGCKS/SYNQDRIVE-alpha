import { createHash } from 'crypto';
import {
  buildExp021BucketFingerprint,
  buildExp021BucketIdentity,
} from './reference-capture-settlement-shadow-bucket-identity';
import { HF_AGGREGATION_TYPE, HF_REQUESTED_INTERVAL } from './reference-capture-hf-watermark-policy';

function extractProviderTimestamp(value: Record<string, unknown>): Date | null {
  const raw = value.timestamp;
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export type ParsedShadowSignalRow = {
  providerField: string;
  providerTimestampIso: string;
  bucketIdentity: string;
  bucketFingerprint: string;
};

export function parseShadowSignalsResponse(args: {
  rows: Array<Record<string, unknown>>;
  providerFields: string[];
}): {
  parsedRows: ParsedShadowSignalRow[];
  fieldSampleCounts: Record<string, number>;
  uniqueBucketIdentities: string[];
  uniqueTemporalStarts: string[];
} {
  const parsedRows: ParsedShadowSignalRow[] = [];
  const fieldSampleCounts: Record<string, number> = {};
  const identitySet = new Set<string>();
  const temporalSet = new Set<string>();

  for (const row of args.rows) {
    const providerTimestamp = extractProviderTimestamp(row);
    if (!providerTimestamp) continue;
    const providerTimestampIso = providerTimestamp.toISOString();

    for (const providerField of args.providerFields) {
      if (!(providerField in row)) continue;
      if (row[providerField] == null) continue;

      fieldSampleCounts[providerField] = (fieldSampleCounts[providerField] ?? 0) + 1;
      const bucketIdentity = buildExp021BucketIdentity(providerField, providerTimestampIso);
      const bucketFingerprint = buildExp021BucketFingerprint(providerField, providerTimestampIso);
      identitySet.add(bucketIdentity);
      temporalSet.add(providerTimestampIso);
      parsedRows.push({
        providerField,
        providerTimestampIso,
        bucketIdentity,
        bucketFingerprint,
      });
    }
  }

  return {
    parsedRows,
    fieldSampleCounts,
    uniqueBucketIdentities: [...identitySet].sort(),
    uniqueTemporalStarts: [...temporalSet].sort(),
  };
}

export function hashCanonicalShadowResponse(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function compareBucketSets(
  current: string[],
  prior: string[],
): {
  newBucketIdentities: string[];
  missingBucketIdentities: string[];
  revisionCount: number;
} {
  const priorSet = new Set(prior);
  const currentSet = new Set(current);
  const newBucketIdentities = current.filter((id) => !priorSet.has(id));
  const missingBucketIdentities = prior.filter((id) => !currentSet.has(id));
  // VALUE_REVISION_DETECTION: NOT_IMPLEMENTED — identity-only comparison; same bucket key with revised value is not detected.
  return {
    newBucketIdentities,
    missingBucketIdentities,
    revisionCount: 0,
  };
}

export const SHADOW_AGGREGATION_INTERVAL = HF_REQUESTED_INTERVAL;
export const SHADOW_AGGREGATION_TYPE = HF_AGGREGATION_TYPE;
