/**
 * Containment-aware partial-boundary repair classification.
 *
 * Answers: does a completed provider/DIMO driving segment map to exactly one
 * canonical trip that merely needs its boundaries extended — rather than a
 * missing-trip create or a suppress-as-duplicate decision?
 *
 * Pure functions only — shared by TripReconciliationService and tests.
 */

import type { CoverageAssessment } from './trip-coverage.util';
import { MIN_REPAIR_SPAN_SECONDS } from './trip-coverage.util';

/** Mechanisms that describe driving trips, not energy events. */
export const DRIVING_TRIP_MECHANISMS = new Set([
  'ignitionDetection',
  'frequencyAnalysis',
  'changePointDetection',
  'idling',
]);

export const ENERGY_SEGMENT_MECHANISMS = new Set(['refuel', 'recharge']);

/** Boundary equality tolerance (measurement / clock skew). */
export const BOUNDARY_MATCH_TOLERANCE_MS = 60_000;

/** Default maximum prefix/suffix extension auto-repair will attempt. */
export const DEFAULT_MAX_BOUNDARY_EXTENSION_MS = 2 * 3600_000;

export interface ProviderSegmentBounds {
  segmentId: string;
  mechanism: string;
  startTime: Date;
  endTime: Date;
  isOngoing?: boolean;
  startedBeforeRange?: boolean;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  distanceKm?: number | null;
}

export interface CanonicalTripBounds {
  id: string;
  startTime: Date;
  endTime: Date | null;
  tripStatus: string;
  dimoSegmentId?: string | null;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  distanceKm?: number | null;
}

export type PartialBoundaryClassification =
  | { kind: 'EXACT_MATCH'; tripId: string; reason: string }
  | {
      kind: 'PARTIAL_EXTENSION';
      tripId: string;
      oldStart: Date;
      oldEnd: Date;
      newStart: Date;
      newEnd: Date;
      extendStart: boolean;
      extendEnd: boolean;
      confidence: 'MEDIUM' | 'HIGH';
      reason: string;
    }
  | { kind: 'MISSING_TRIP'; reason: string }
  | { kind: 'AMBIGUOUS'; reason: string };

export interface ClassifyPartialBoundaryOptions {
  maxExtensionMs?: number;
  boundaryToleranceMs?: number;
  /** Optional coverage assessment from TripOverlapDetector for metrics/audit. */
  coverage?: CoverageAssessment;
}

function withinTolerance(a: Date, b: Date, toleranceMs: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= toleranceMs;
}

function isEligibleCanonicalTrip(trip: CanonicalTripBounds): boolean {
  return trip.tripStatus !== 'CANCELLED' && trip.endTime != null;
}

function intersectsProvider(
  trip: CanonicalTripBounds,
  providerStart: number,
  providerEnd: number,
): boolean {
  if (!trip.endTime) return false;
  const tripStart = trip.startTime.getTime();
  const tripEnd = trip.endTime.getTime();
  return tripStart < providerEnd && tripEnd > providerStart;
}

function tripContainedInProvider(
  trip: CanonicalTripBounds,
  providerStart: Date,
  providerEnd: Date,
  toleranceMs: number,
): boolean {
  if (!trip.endTime) return false;
  return (
    trip.startTime.getTime() >= providerStart.getTime() - toleranceMs &&
    trip.endTime.getTime() <= providerEnd.getTime() + toleranceMs
  );
}

function hasConflictingTripInRange(
  trips: CanonicalTripBounds[],
  excludeTripId: string,
  rangeStart: Date,
  rangeEnd: Date,
  toleranceMs: number,
): boolean {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  if (endMs - startMs <= toleranceMs) return false;

  return trips.some((trip) => {
    if (trip.id === excludeTripId || !isEligibleCanonicalTrip(trip)) return false;
    if (!trip.endTime) return false;
    const tripStart = trip.startTime.getTime();
    const tripEnd = trip.endTime.getTime();
    return tripStart < endMs - toleranceMs && tripEnd > startMs + toleranceMs;
  });
}

function coordinatesNear(
  aLat: number | null | undefined,
  aLng: number | null | undefined,
  bLat: number | null | undefined,
  bLng: number | null | undefined,
  maxMeters = 500,
): boolean | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  return meters <= maxMeters;
}

function assessSamePhysicalDriveEvidence(
  trip: CanonicalTripBounds,
  provider: ProviderSegmentBounds,
  extendStart: boolean,
  extendEnd: boolean,
  toleranceMs: number,
): string | null {
  const oldStart = trip.startTime;
  const oldEnd = trip.endTime as Date;

  if (trip.dimoSegmentId && trip.dimoSegmentId === provider.segmentId) {
    return null;
  }

  const suffixAligned = withinTolerance(oldEnd, provider.endTime, toleranceMs);
  const prefixAligned = withinTolerance(oldStart, provider.startTime, toleranceMs);

  if (extendStart && !extendEnd && !suffixAligned) {
    return 'Suffix-partial trip end does not align with provider segment end';
  }
  if (extendEnd && !extendStart && !prefixAligned) {
    return 'Prefix-partial trip start does not align with provider segment start';
  }
  if (!suffixAligned && !prefixAligned) {
    return 'Canonical trip is interior to provider segment without end alignment';
  }

  if (extendStart) {
    const endCoordMatch = coordinatesNear(
      trip.endLatitude,
      trip.endLongitude,
      provider.endLatitude,
      provider.endLongitude,
    );
    if (endCoordMatch === false) {
      return 'Trip end coordinates contradict provider segment end';
    }
  }

  if (extendEnd) {
    const startCoordMatch = coordinatesNear(
      trip.startLatitude,
      trip.startLongitude,
      provider.startLatitude,
      provider.startLongitude,
    );
    if (startCoordMatch === false) {
      return 'Trip start coordinates contradict provider segment start';
    }
  }

  const providerDistance = provider.distanceKm ?? null;
  const tripDistance = trip.distanceKm ?? null;
  if (
    providerDistance != null &&
    tripDistance != null &&
    tripDistance > providerDistance * 1.25
  ) {
    return 'Canonical trip distance exceeds provider segment distance';
  }

  return null;
}

/**
 * Classify a provider segment against canonical trips for boundary extension.
 */
export function classifyPartialBoundaryRepair(
  provider: ProviderSegmentBounds,
  trips: CanonicalTripBounds[],
  options?: ClassifyPartialBoundaryOptions,
): PartialBoundaryClassification {
  const toleranceMs = options?.boundaryToleranceMs ?? BOUNDARY_MATCH_TOLERANCE_MS;
  const maxExtensionMs = options?.maxExtensionMs ?? DEFAULT_MAX_BOUNDARY_EXTENSION_MS;

  if (provider.isOngoing) {
    return {
      kind: 'AMBIGUOUS',
      reason: 'Provider segment is ongoing — wait for authoritative completion',
    };
  }

  if (ENERGY_SEGMENT_MECHANISMS.has(provider.mechanism)) {
    return {
      kind: 'AMBIGUOUS',
      reason: `Provider mechanism ${provider.mechanism} is not a driving trip`,
    };
  }

  if (!DRIVING_TRIP_MECHANISMS.has(provider.mechanism)) {
    return {
      kind: 'AMBIGUOUS',
      reason: `Unknown or non-driving provider mechanism: ${provider.mechanism}`,
    };
  }

  const providerStart = provider.startTime;
  const providerEnd = provider.endTime;
  const durationMs = providerEnd.getTime() - providerStart.getTime();
  if (durationMs <= 0) {
    return { kind: 'AMBIGUOUS', reason: 'Provider segment has zero or negative duration' };
  }

  const eligible = trips.filter(isEligibleCanonicalTrip);
  const intersecting = eligible.filter((trip) =>
    intersectsProvider(trip, providerStart.getTime(), providerEnd.getTime()),
  );

  if (intersecting.length === 0) {
    return {
      kind: 'MISSING_TRIP',
      reason: 'No canonical trip intersects the provider segment',
    };
  }

  if (intersecting.length > 1) {
    return {
      kind: 'AMBIGUOUS',
      reason: `Provider segment overlaps ${intersecting.length} canonical trips — containment merge not automatic`,
    };
  }

  const trip = intersecting[0];
  const oldStart = trip.startTime;
  const oldEnd = trip.endTime as Date;

  if (
    withinTolerance(oldStart, providerStart, toleranceMs) &&
    withinTolerance(oldEnd, providerEnd, toleranceMs)
  ) {
    return {
      kind: 'EXACT_MATCH',
      tripId: trip.id,
      reason: 'Canonical trip already matches provider boundaries',
    };
  }

  const extendStart = providerStart.getTime() < oldStart.getTime() - toleranceMs;
  const extendEnd = providerEnd.getTime() > oldEnd.getTime() + toleranceMs;

  if (!extendStart && !extendEnd) {
    return {
      kind: 'EXACT_MATCH',
      tripId: trip.id,
      reason: 'Canonical trip boundaries within tolerance of provider segment',
    };
  }

  // Trip must be substantially contained in the provider envelope (suffix/prefix/both partial).
  if (!tripContainedInProvider(trip, providerStart, providerEnd, toleranceMs)) {
    return {
      kind: 'AMBIGUOUS',
      reason: 'Canonical trip is not substantially contained within the provider segment',
    };
  }

  const startGapMs = extendStart ? oldStart.getTime() - providerStart.getTime() : 0;
  const endGapMs = extendEnd ? providerEnd.getTime() - oldEnd.getTime() : 0;

  if (startGapMs > maxExtensionMs || endGapMs > maxExtensionMs) {
    return {
      kind: 'AMBIGUOUS',
      reason: `Extension gap exceeds maximum (${maxExtensionMs}ms)`,
    };
  }

  // Uncovered prefix/suffix must be material (same floor as missing-trip repair spans).
  if (extendStart && startGapMs / 1000 < MIN_REPAIR_SPAN_SECONDS) {
    return {
      kind: 'EXACT_MATCH',
      tripId: trip.id,
      reason: 'Start extension below minimum repair span — treated as exact match',
    };
  }
  if (extendEnd && endGapMs / 1000 < MIN_REPAIR_SPAN_SECONDS) {
    return {
      kind: 'EXACT_MATCH',
      tripId: trip.id,
      reason: 'End extension below minimum repair span — treated as exact match',
    };
  }

  if (extendStart) {
    const conflict = hasConflictingTripInRange(
      eligible,
      trip.id,
      providerStart,
      oldStart,
      toleranceMs,
    );
    if (conflict) {
      return {
        kind: 'AMBIGUOUS',
        reason: 'Another canonical trip occupies the proposed start extension range',
      };
    }
  }

  if (extendEnd) {
    const conflict = hasConflictingTripInRange(
      eligible,
      trip.id,
      oldEnd,
      providerEnd,
      toleranceMs,
    );
    if (conflict) {
      return {
        kind: 'AMBIGUOUS',
        reason: 'Another canonical trip occupies the proposed end extension range',
      };
    }
  }

  const sameDriveConflict = assessSamePhysicalDriveEvidence(
    trip,
    provider,
    extendStart,
    extendEnd,
    toleranceMs,
  );
  if (sameDriveConflict) {
    return { kind: 'AMBIGUOUS', reason: sameDriveConflict };
  }

  const confidence: 'MEDIUM' | 'HIGH' =
    durationMs >= 10 * 60_000 && (extendStart ? startGapMs : endGapMs) <= 45 * 60_000
      ? 'HIGH'
      : 'MEDIUM';

  const parts: string[] = [];
  if (extendStart) parts.push('prefix extension');
  if (extendEnd) parts.push('suffix extension');

  return {
    kind: 'PARTIAL_EXTENSION',
    tripId: trip.id,
    oldStart,
    oldEnd,
    newStart: extendStart ? providerStart : oldStart,
    newEnd: extendEnd ? providerEnd : oldEnd,
    extendStart,
    extendEnd,
    confidence,
    reason: `Single contained canonical trip requires ${parts.join(' and ')} to match provider segment`,
  };
}
