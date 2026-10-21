import { createHash } from 'crypto';
import {
  HV_CHARGING_COUNTER_AGGREGATION_MODE,
  HV_CHARGING_COUNTER_BUCKET_WIDTH,
  HV_CHARGING_COUNTER_SIGNAL_ID,
  M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1,
} from './hv-charging-counter-evidence.constants.v1';
import type { HvChargingCounterBucketInputV1 } from './hv-charging-counter-evidence.types.v1';

export type HvChargingCounterCanonicalBucketTupleV1 = readonly [
  string,
  string,
  string,
  string,
  string | null,
  number | null,
  number | null,
  number | null,
  string,
];

export function buildHvChargingCounterCanonicalBucketTupleV1(
  bucket: HvChargingCounterBucketInputV1,
): HvChargingCounterCanonicalBucketTupleV1 {
  return [
    M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1,
    HV_CHARGING_COUNTER_SIGNAL_ID,
    HV_CHARGING_COUNTER_BUCKET_WIDTH,
    HV_CHARGING_COUNTER_AGGREGATION_MODE,
    bucket.bucketStartAt.toISOString(),
    bucket.valueKwh,
    bucket.minKwh,
    bucket.maxKwh,
    bucket.availability,
  ];
}

export function computeHvChargingCounterObservationSetFingerprintV1(
  buckets: HvChargingCounterBucketInputV1[],
): string {
  const sorted = [...buckets].sort(
    (a, b) => a.bucketStartAt.getTime() - b.bucketStartAt.getTime(),
  );
  const payload = sorted.map((bucket) =>
    buildHvChargingCounterCanonicalBucketTupleV1(bucket),
  );
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export function buildHvChargingCounterBatchIdempotencyKeyV1(input: {
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  observationSetFingerprint: string;
}): string {
  const raw = [
    'hv-cc-batch',
    M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1,
    input.organizationId,
    input.vehicleId,
    input.segmentFingerprint,
    input.observationSetFingerprint,
  ].join('\u0000');
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function buildHvChargingCounterObservationIdempotencyKeyV1(input: {
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  bucketStartAt: Date;
  revisionNumber: number;
  valueKwh: number | null;
  availability: string;
}): string {
  const raw = [
    'hv-cc-obs',
    M3_3_HV_CHARGING_ADDED_ENERGY_BUCKET_EVIDENCE_V1,
    input.organizationId,
    input.vehicleId,
    input.segmentFingerprint,
    input.bucketStartAt.toISOString(),
    String(input.revisionNumber),
    input.availability,
    input.valueKwh == null ? 'null' : String(input.valueKwh),
  ].join('\u0000');
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}
