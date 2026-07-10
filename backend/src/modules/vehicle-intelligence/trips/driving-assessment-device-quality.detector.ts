/**
 * Pure detector for LTE_R1 native driving-event quality (Fahrbewertung only).
 * Phase 0: WOB L 7503 evidence. Phase 2: org-relative LTE_R1 baseline.
 */
import type { OrgLteR1Baseline } from './driving-assessment-org-baseline';
import { evaluateAgainstOrgBaseline } from './driving-assessment-org-baseline';

export type { OrgLteR1Baseline } from './driving-assessment-org-baseline';
export {
  ORG_BASELINE_LOOKBACK_DAYS,
  ORG_BASELINE_MIN_SAMPLE_TRIPS,
  buildOrgLteR1Baseline,
} from './driving-assessment-org-baseline';

export const DEVICE_QUALITY_TIMESTAMP_BUCKET_MS = 2_000;
export const DEVICE_QUALITY_EVALUATION_WINDOW = 3;
export const DEVICE_QUALITY_ACTIVATION_FLAGGED_OF_LAST = 2;
export const DEVICE_QUALITY_RECOVERY_CONSECUTIVE_NORMAL = 3;

export const DEVICE_QUALITY_OBSERVATION_MARKER = 'driving-assessment-device-quality:v1';
export const DEVICE_QUALITY_WORKER_ID = 'driving-assessment-device-quality';

export type DrivingAssessmentQualityStatus = 'NORMAL' | 'DEGRADED' | 'RECOVERING';

export interface NativeEventSample {
  eventType: string;
  recordedAt: Date;
}

export interface TripDeviceQualityMetrics {
  rawNativeCount: number;
  visibleDedupedCount: number;
  eventsPerKm: number | null;
  eventsPerMin: number | null;
  burstDuplicateRatio: number | null;
  medianInterEventGapMs: number | null;
  orgBaselineApplied?: boolean;
}

export interface TripDeviceQualityVerdict {
  flagged: boolean;
  reasons: string[];
  metrics: TripDeviceQualityMetrics;
}

export interface VehicleDeviceQualityTransition {
  nextStatus: DrivingAssessmentQualityStatus;
  consecutiveNormalTrips: number;
  tripFlagged: boolean;
  degradedSince: Date | null;
  recoveredAt: Date | null;
}

function normalizeDedupeEventType(eventType: string): string {
  switch (eventType) {
    case 'HARSH_BRAKING':
    case 'EXTREME_BRAKING':
      return 'braking';
    case 'HARSH_ACCELERATION':
      return 'acceleration';
    case 'HARSH_CORNERING':
      return 'cornering';
    default:
      return `native:${eventType.toLowerCase()}`;
  }
}

export function dedupeNativeEventSamples(events: NativeEventSample[]): NativeEventSample[] {
  const sorted = [...events].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const merged: NativeEventSample[] = [];
  for (const event of sorted) {
    const normType = normalizeDedupeEventType(event.eventType);
    const t = event.recordedAt.getTime();
    let mergedInto = false;
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const existing = merged[i];
      if (normalizeDedupeEventType(existing.eventType) !== normType) continue;
      if (Math.abs(existing.recordedAt.getTime() - t) > DEVICE_QUALITY_TIMESTAMP_BUCKET_MS) break;
      mergedInto = true;
      break;
    }
    if (!mergedInto) merged.push(event);
  }
  return merged;
}

function burstDuplicateCount(events: NativeEventSample[]): number {
  if (events.length < 2) return 0;
  const sorted = [...events].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  let bursts = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const sameType = prev.eventType === cur.eventType;
    const withinBucket =
      Math.abs(cur.recordedAt.getTime() - prev.recordedAt.getTime()) <=
      DEVICE_QUALITY_TIMESTAMP_BUCKET_MS;
    if (sameType && withinBucket) bursts += 1;
  }
  return bursts;
}

function medianInterEventGapMs(events: NativeEventSample[]): number | null {
  if (events.length < 2) return null;
  const sorted = [...events].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(sorted[i].recordedAt.getTime() - sorted[i - 1].recordedAt.getTime());
  }
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? null;
}

export function computeTripDeviceQualityMetrics(input: {
  events: NativeEventSample[];
  distanceKm: number | null;
  durationMin: number | null;
}): TripDeviceQualityMetrics {
  const rawNativeCount = input.events.length;
  const visibleDedupedCount = dedupeNativeEventSamples(input.events).length;
  const bursts = burstDuplicateCount(input.events);
  const distanceKm = input.distanceKm ?? 0;
  const durationMin = input.durationMin ?? 0;

  return {
    rawNativeCount,
    visibleDedupedCount,
    eventsPerKm: distanceKm >= 1 ? rawNativeCount / distanceKm : null,
    eventsPerMin: durationMin >= 1 ? rawNativeCount / durationMin : null,
    burstDuplicateRatio: rawNativeCount > 0 ? bursts / rawNativeCount : null,
    medianInterEventGapMs: medianInterEventGapMs(input.events),
  };
}

/**
 * Trip-level suspicion — tuned for volume spam (primary WOB L 7503 pattern).
 */
export function evaluateTripDeviceQuality(input: {
  events: NativeEventSample[];
  distanceKm: number | null;
  durationMin: number | null;
  orgBaseline?: OrgLteR1Baseline | null;
}): TripDeviceQualityVerdict {
  const metrics = computeTripDeviceQualityMetrics(input);
  const reasons: string[] = [];

  if (metrics.eventsPerKm != null && metrics.eventsPerKm >= 2) {
    reasons.push(`events_per_km=${metrics.eventsPerKm.toFixed(2)}`);
  }
  if (metrics.rawNativeCount >= 8 && (input.durationMin ?? 0) >= 3) {
    reasons.push(`raw_events=${metrics.rawNativeCount}`);
  }
  if (metrics.eventsPerMin != null && metrics.eventsPerMin >= 1.5 && (input.durationMin ?? 0) >= 5) {
    reasons.push(`events_per_min=${metrics.eventsPerMin.toFixed(2)}`);
  }
  if (
    metrics.rawNativeCount >= 5 &&
    metrics.medianInterEventGapMs != null &&
    metrics.medianInterEventGapMs <= 20_000
  ) {
    reasons.push(`median_gap_ms=${metrics.medianInterEventGapMs}`);
  }
  if (
    metrics.visibleDedupedCount > 0 &&
    metrics.rawNativeCount / metrics.visibleDedupedCount >= 2
  ) {
    reasons.push(`raw_visible_ratio=${(metrics.rawNativeCount / metrics.visibleDedupedCount).toFixed(2)}`);
  }

  const orgReasons = input.orgBaseline
    ? evaluateAgainstOrgBaseline({
        eventsPerKm: metrics.eventsPerKm,
        rawNativeCount: metrics.rawNativeCount,
        medianInterEventGapMs: metrics.medianInterEventGapMs,
        durationMin: input.durationMin,
        baseline: input.orgBaseline,
      })
    : [];

  const mergedReasons = [...reasons];
  for (const reason of orgReasons) {
    if (!mergedReasons.includes(reason)) mergedReasons.push(reason);
  }

  if (orgReasons.length > 0) {
    metrics.orgBaselineApplied = true;
  }

  return {
    flagged: mergedReasons.length > 0,
    reasons: mergedReasons,
    metrics,
  };
}

export function transitionVehicleDeviceQualityState(input: {
  currentStatus: DrivingAssessmentQualityStatus;
  consecutiveNormalTrips: number;
  degradedSince: Date | null;
  recentTripFlagged: boolean[];
  now?: Date;
}): VehicleDeviceQualityTransition {
  const now = input.now ?? new Date();
  const window = input.recentTripFlagged.slice(0, DEVICE_QUALITY_EVALUATION_WINDOW);
  const flaggedCount = window.filter(Boolean).length;
  const tripFlagged = window[0] === true;

  if (input.currentStatus === 'NORMAL') {
    if (flaggedCount >= DEVICE_QUALITY_ACTIVATION_FLAGGED_OF_LAST) {
      return {
        nextStatus: 'DEGRADED',
        consecutiveNormalTrips: 0,
        tripFlagged,
        degradedSince: now,
        recoveredAt: null,
      };
    }
    return {
      nextStatus: 'NORMAL',
      consecutiveNormalTrips: tripFlagged ? 0 : input.consecutiveNormalTrips + 1,
      tripFlagged,
      degradedSince: null,
      recoveredAt: null,
    };
  }

  if (input.currentStatus === 'DEGRADED') {
    if (!tripFlagged) {
      const consecutive = input.consecutiveNormalTrips + 1;
      if (consecutive >= DEVICE_QUALITY_RECOVERY_CONSECUTIVE_NORMAL) {
        return {
          nextStatus: 'NORMAL',
          consecutiveNormalTrips: consecutive,
          tripFlagged,
          degradedSince: null,
          recoveredAt: now,
        };
      }
      return {
        nextStatus: 'RECOVERING',
        consecutiveNormalTrips: consecutive,
        tripFlagged,
        degradedSince: input.degradedSince,
        recoveredAt: null,
      };
    }
    return {
      nextStatus: 'DEGRADED',
      consecutiveNormalTrips: 0,
      tripFlagged,
      degradedSince: input.degradedSince ?? now,
      recoveredAt: null,
    };
  }

  // RECOVERING
  if (tripFlagged) {
    return {
      nextStatus: 'DEGRADED',
      consecutiveNormalTrips: 0,
      tripFlagged,
      degradedSince: now,
      recoveredAt: null,
    };
  }

  const consecutive = input.consecutiveNormalTrips + 1;
  if (consecutive >= DEVICE_QUALITY_RECOVERY_CONSECUTIVE_NORMAL) {
    return {
      nextStatus: 'NORMAL',
      consecutiveNormalTrips: consecutive,
      tripFlagged,
      degradedSince: null,
      recoveredAt: now,
    };
  }

  return {
    nextStatus: 'RECOVERING',
    consecutiveNormalTrips: consecutive,
    tripFlagged,
    degradedSince: input.degradedSince,
    recoveredAt: null,
  };
}

export function shouldWarnOnTrip(input: {
  vehicleStatus: DrivingAssessmentQualityStatus;
  tripFlagged: boolean;
}): boolean {
  return (
    input.tripFlagged ||
    input.vehicleStatus === 'DEGRADED' ||
    input.vehicleStatus === 'RECOVERING'
  );
}
