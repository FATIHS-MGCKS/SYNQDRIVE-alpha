import type { EvidenceAvailability, NormalizedPositionObservation, TelemetrySourceFamily } from '../types';
import { buildRowAbsentObservation } from '../grid/densify-grid';

/** 1 Hz position bucket row (EXP021 offline prototype / Phase 5C replay grid). */
export interface MotionCorePositionBucket {
  bucketLabelUtc: string;
  availability: EvidenceAvailability;
  latitude: number | null;
  longitude: number | null;
}

export const MOTION_CORE_GRID_ORDER_VERSION = 'MOTION_CORE_GRID_ORDER_V0_1';

const MS_PER_SECOND = 1000;

export function parseBucketLabelMs(label: string): number {
  const ms = Date.parse(label);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid bucketLabelUtc: ${label}`);
  }
  return ms;
}

export function bucketLabelPlusSeconds(label: string, seconds: number): string {
  return new Date(parseBucketLabelMs(label) + seconds * MS_PER_SECOND).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Input contract guard: label-sorted, duplicate labels collapsed (first wins). */
export function orderMotionCoreGrid(buckets: MotionCorePositionBucket[]): MotionCorePositionBucket[] {
  const seen = new Set<string>();
  const out: MotionCorePositionBucket[] = [];
  for (const b of [...buckets].sort((a, b) => a.bucketLabelUtc.localeCompare(b.bucketLabelUtc))) {
    if (seen.has(b.bucketLabelUtc)) {
      continue;
    }
    seen.add(b.bucketLabelUtc);
    out.push(b);
  }
  return out;
}

export function presentBucketMap(
  buckets: MotionCorePositionBucket[],
): Map<string, MotionCorePositionBucket> {
  const map = new Map<string, MotionCorePositionBucket>();
  for (const b of buckets) {
    if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) {
      map.set(b.bucketLabelUtc, b);
    }
  }
  return map;
}

export function availabilityByLabel(buckets: MotionCorePositionBucket[]): Map<string, EvidenceAvailability> {
  const map = new Map<string, EvidenceAvailability>();
  for (const b of buckets) {
    map.set(b.bucketLabelUtc, b.availability);
  }
  return map;
}

export function motionCoreBucketToObservation(
  bucket: MotionCorePositionBucket,
  sourceFamily: TelemetrySourceFamily = 'API_SYNTHETIC',
): NormalizedPositionObservation {
  if (bucket.availability === 'ROW_ABSENT') {
    return buildRowAbsentObservation(bucket.bucketLabelUtc, sourceFamily);
  }
  const startMs = parseBucketLabelMs(bucket.bucketLabelUtc);
  const intervalEnd = new Date(startMs + MS_PER_SECOND).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const referenceTime = new Date(startMs + 500).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    bucketLabel: bucket.bucketLabelUtc,
    intervalStart: bucket.bucketLabelUtc,
    intervalEnd,
    referenceTime,
    availability: bucket.availability,
    latitude: bucket.latitude ?? undefined,
    longitude: bucket.longitude ?? undefined,
    sourceFamily,
    provenance: { sourceSignal: 'currentLocationCoordinates', derivedFrom: ['motion_core_grid'] },
  };
}

export function motionCoreGridToObservations(
  buckets: MotionCorePositionBucket[],
  sourceFamily: TelemetrySourceFamily = 'API_SYNTHETIC',
): NormalizedPositionObservation[] {
  return orderMotionCoreGrid(buckets).map((b) => motionCoreBucketToObservation(b, sourceFamily));
}

