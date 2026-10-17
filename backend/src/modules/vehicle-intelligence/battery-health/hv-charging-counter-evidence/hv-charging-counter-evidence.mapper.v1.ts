import {
  HV_CHARGING_COUNTER_AGGREGATION_MODE,
  HV_CHARGING_COUNTER_AVAILABILITY,
  HV_CHARGING_COUNTER_BUCKET_WIDTH,
  HV_CHARGING_COUNTER_SAMPLE_CLASS,
} from './hv-charging-counter-evidence.constants.v1';
import type {
  HvChargingCounterBucketInputV1,
  HvChargingCounterDimoIntervalRowV1,
} from './hv-charging-counter-evidence.types.v1';

const BUCKET_MS = 60_000;

function parseBucketStart(timestamp: string): Date | null {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

export function mapDimoIntervalRowsToBucketInputsV1(
  rows: HvChargingCounterDimoIntervalRowV1[],
): HvChargingCounterBucketInputV1[] {
  const buckets: HvChargingCounterBucketInputV1[] = [];
  for (const row of rows) {
    const bucketStartAt = parseBucketStart(row.timestamp);
    if (!bucketStartAt) continue;
    const bucketEndAt = new Date(bucketStartAt.getTime() + BUCKET_MS);
    const hasLast =
      row.addedKwhLast != null && Number.isFinite(row.addedKwhLast as number);
    buckets.push({
      bucketStartAt,
      bucketEndAt,
      valueKwh: hasLast ? (row.addedKwhLast as number) : null,
      minKwh:
        row.addedKwhMin != null && Number.isFinite(row.addedKwhMin as number)
          ? (row.addedKwhMin as number)
          : null,
      maxKwh:
        row.addedKwhMax != null && Number.isFinite(row.addedKwhMax as number)
          ? (row.addedKwhMax as number)
          : null,
      availability: hasLast
        ? HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE
        : HV_CHARGING_COUNTER_AVAILABILITY.MISSING,
    });
  }
  return buckets;
}

export function buildHvChargingCounterObservationProvenanceV1(): Record<string, unknown> {
  return {
    sampleClass: HV_CHARGING_COUNTER_SAMPLE_CLASS,
    aggregationMode: HV_CHARGING_COUNTER_AGGREGATION_MODE,
    bucketWidth: HV_CHARGING_COUNTER_BUCKET_WIDTH,
    bucketTimestampSemantics: 'DIMO_QUERY_INTERVAL_BUCKET_START',
    providerTimestampUncertainty: true,
  };
}
