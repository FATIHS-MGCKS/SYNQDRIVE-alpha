import { createHash } from 'crypto';
import { buildExp021BucketIdentity } from './reference-capture-settlement-shadow-bucket-identity';

export type BucketValueSnapshots = Record<string, string>;

export type ValueRevisionRecord = {
  bucketIdentity: string;
  field: string;
  priorValue: string;
  revisedValue: string;
  firstSeenAgeMs: number;
  revisionAgeMs: number;
};

export type ValueSnapshotComparison = {
  addedBucketIdentities: string[];
  removedBucketIdentities: string[];
  stableBucketIdentities: string[];
  revisedBuckets: Array<{
    bucketIdentity: string;
    field: string;
    priorValue: string;
    revisedValue: string;
  }>;
  revisionCount: number;
};

/** Normalize provider signal values for stable cross-age comparison. */
export function normalizeSignalValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, '');
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export function buildBucketValueSnapshots(args: {
  rows: Array<Record<string, unknown>>;
  providerFields: string[];
}): BucketValueSnapshots {
  const snapshots: BucketValueSnapshots = {};
  for (const row of args.rows) {
    const rawTs = row.timestamp;
    if (rawTs == null) continue;
    const providerTimestampIso =
      rawTs instanceof Date ? rawTs.toISOString() : new Date(String(rawTs)).toISOString();
    if (!Number.isFinite(Date.parse(providerTimestampIso))) continue;

    for (const providerField of args.providerFields) {
      if (!(providerField in row)) continue;
      const value = row[providerField];
      if (value == null) continue;
      const bucketIdentity = buildExp021BucketIdentity(providerField, providerTimestampIso);
      snapshots[bucketIdentity] = normalizeSignalValue(value);
    }
  }
  return snapshots;
}

/** Content-only hash — excludes query age, schedule drift, and observation metadata. */
export function hashBucketValueContent(snapshots: BucketValueSnapshots): string {
  const canonical = Object.keys(snapshots)
    .sort()
    .map((key) => `${key}=${snapshots[key]}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

export function compareValueSnapshots(
  current: BucketValueSnapshots,
  prior: BucketValueSnapshots,
): ValueSnapshotComparison {
  const currentKeys = Object.keys(current);
  const priorKeys = Object.keys(prior);
  const priorSet = new Set(priorKeys);
  const currentSet = new Set(currentKeys);

  const addedBucketIdentities = currentKeys.filter((id) => !priorSet.has(id));
  const removedBucketIdentities = priorKeys.filter((id) => !currentSet.has(id));
  const stableBucketIdentities: string[] = [];
  const revisedBuckets: ValueSnapshotComparison['revisedBuckets'] = [];

  for (const bucketIdentity of currentKeys) {
    if (!priorSet.has(bucketIdentity)) continue;
    const priorValue = prior[bucketIdentity];
    const revisedValue = current[bucketIdentity];
    if (priorValue === revisedValue) {
      stableBucketIdentities.push(bucketIdentity);
    } else {
      const field = bucketIdentity.split('|')[0] ?? bucketIdentity;
      revisedBuckets.push({
        bucketIdentity,
        field,
        priorValue,
        revisedValue,
      });
    }
  }

  return {
    addedBucketIdentities,
    removedBucketIdentities,
    stableBucketIdentities,
    revisedBuckets,
    revisionCount: revisedBuckets.length,
  };
}

export function parseFieldFromBucketIdentity(bucketIdentity: string): string {
  const idx = bucketIdentity.indexOf('|');
  return idx >= 0 ? bucketIdentity.slice(0, idx) : bucketIdentity;
}
