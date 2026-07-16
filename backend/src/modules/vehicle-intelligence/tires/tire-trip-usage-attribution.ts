/**
 * Canonical trip finalization semantics for tire usage attribution (Prompt 10).
 *
 * Trip lifecycle and analysis pipeline are intentionally separate:
 * - Trip COMPLETED + endTime → trip ended (not yet usage-final)
 * - analysis stages running → provisional
 * - tripAnalysisStatus COMPLETED|SKIPPED + analysisCompletedAt → canonically final for usage
 */
import type { TripAnalysisStatus } from '../trips/trip-analysis-status';
import { areAnalysisStagesComplete, parseAnalysisStagesJson } from '../trips/trip-analysis-status';

export type TireTripUsageAttributionStatus =
  | 'APPLIED'
  | 'UNCHANGED'
  | 'INVALIDATED'
  | 'REQUIRES_REVIEW'
  | 'SKIPPED_NOT_FINAL'
  | 'SKIPPED_NO_DISTANCE'
  | 'SKIPPED_NO_SETUP'
  | 'SKIPPED_ORG_MISMATCH'
  | 'SKIPPED_TRIP_NOT_COMPLETED';

export const TIRE_TRIP_USAGE_ATTRIBUTION_REASON = {
  TRIP_SPANS_MULTIPLE_SETUP_PERIODS: 'trip_spans_multiple_setup_periods',
  SETUP_CHANGE_BOUNDARY_IN_TRIP: 'setup_change_boundary_within_trip_interval',
  NO_MOUNT_PERIOD_MATCH: 'no_mount_period_match_for_trip_interval',
} as const;

export interface MountPeriodInterval {
  tireSetupId: string;
  installedAt: Date;
  removedAt: Date | null;
}

export interface TripInterval {
  tripStartedAt: Date;
  tripEndedAt: Date;
}

export type SetupAttributionResolution =
  | { status: 'SINGLE'; tireSetupId: string }
  | {
      status: 'REQUIRES_REVIEW';
      tireSetupIds: string[];
      reason: string;
    }
  | { status: 'NO_SETUP' };

const FAR_FUTURE = new Date('2099-12-31T23:59:59.999Z');

export function isTripEnded(trip: {
  tripStatus: string;
  endTime: Date | null;
}): boolean {
  return trip.tripStatus === 'COMPLETED' && trip.endTime != null;
}

export function isTripAnalysisTerminal(
  tripAnalysisStatus: string | null | undefined,
): tripAnalysisStatus is TripAnalysisStatus {
  return tripAnalysisStatus === 'COMPLETED' || tripAnalysisStatus === 'SKIPPED';
}

/**
 * A trip is canonically final for tire usage when post-trip analysis reached a terminal state.
 * This is the single hook point — not route enrich alone, not behavior-only partial state.
 */
export function isTripCanonicallyFinalForTireUsage(trip: {
  tripStatus: string;
  endTime: Date | null;
  tripAnalysisStatus: string | null;
  analysisStagesJson?: unknown;
}): boolean {
  if (!isTripEnded(trip)) return false;
  if (!isTripAnalysisTerminal(trip.tripAnalysisStatus)) return false;
  const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
  return areAnalysisStagesComplete(stages);
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date | null,
): boolean {
  const bEffectiveEnd = bEnd ?? FAR_FUTURE;
  return aStart < bEffectiveEnd && aEnd > bStart;
}

/**
 * Resolve historical tire setup from mount/install periods at trip time.
 * Never uses the currently active setup at processing time.
 */
export function resolveSetupAttributionForTrip(args: {
  trip: TripInterval;
  periods: MountPeriodInterval[];
}): SetupAttributionResolution {
  const overlapping = args.periods.filter((period) =>
    intervalsOverlap(
      args.trip.tripStartedAt,
      args.trip.tripEndedAt,
      period.installedAt,
      period.removedAt,
    ),
  );

  const setupIds = [...new Set(overlapping.map((p) => p.tireSetupId))];
  if (setupIds.length === 0) {
    return { status: 'NO_SETUP' };
  }

  const boundaryInsideTrip = args.periods.some((period) => {
    const installInside =
      period.installedAt > args.trip.tripStartedAt &&
      period.installedAt < args.trip.tripEndedAt;
    const removeInside =
      period.removedAt != null &&
      period.removedAt > args.trip.tripStartedAt &&
      period.removedAt < args.trip.tripEndedAt;
    return installInside || removeInside;
  });

  if (setupIds.length > 1 || boundaryInsideTrip) {
    return {
      status: 'REQUIRES_REVIEW',
      tireSetupIds: setupIds,
      reason: boundaryInsideTrip
        ? TIRE_TRIP_USAGE_ATTRIBUTION_REASON.SETUP_CHANGE_BOUNDARY_IN_TRIP
        : TIRE_TRIP_USAGE_ATTRIBUTION_REASON.TRIP_SPANS_MULTIPLE_SETUP_PERIODS,
    };
  }

  return { status: 'SINGLE', tireSetupId: setupIds[0]! };
}

export function buildSetupPeriodsFromSetups(
  setups: Array<{
    id: string;
    installedAt: Date | null;
    removedAt: Date | null;
  }>,
): MountPeriodInterval[] {
  return setups
    .filter((s) => s.installedAt != null)
    .map((s) => ({
      tireSetupId: s.id,
      installedAt: s.installedAt!,
      removedAt: s.removedAt,
    }));
}

export interface TripUsageAggregateDelta {
  distanceKm: number;
  cityKm: number;
  ruralKm: number;
  highwayKm: number;
  harshAccelerationCount: number;
  harshBrakingCount: number;
  harshCorneringCount: number;
}

export function computeTripUsageAggregateDelta(
  previous: TripUsageAggregateDelta | null,
  next: TripUsageAggregateDelta,
): TripUsageAggregateDelta {
  if (!previous) return next;
  return {
    distanceKm: next.distanceKm - previous.distanceKm,
    cityKm: next.cityKm - previous.cityKm,
    ruralKm: next.ruralKm - previous.ruralKm,
    highwayKm: next.highwayKm - previous.highwayKm,
    harshAccelerationCount: next.harshAccelerationCount - previous.harshAccelerationCount,
    harshBrakingCount: next.harshBrakingCount - previous.harshBrakingCount,
    harshCorneringCount: next.harshCorneringCount - previous.harshCorneringCount,
  };
}

export function ledgerRowToAggregateDelta(row: {
  distanceKm: number;
  cityKm: number;
  ruralKm: number;
  highwayKm: number;
  harshAccelerationCount: number;
  harshBrakingCount: number;
  harshCorneringCount: number;
}): TripUsageAggregateDelta {
  return {
    distanceKm: row.distanceKm,
    cityKm: row.cityKm,
    ruralKm: row.ruralKm,
    highwayKm: row.highwayKm,
    harshAccelerationCount: row.harshAccelerationCount,
    harshBrakingCount: row.harshBrakingCount,
    harshCorneringCount: row.harshCorneringCount,
  };
}
