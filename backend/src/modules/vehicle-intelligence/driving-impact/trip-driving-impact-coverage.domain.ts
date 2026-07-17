import { createHash } from 'crypto';
import { TripDrivingImpactAnalysisStatus, TripStatus } from '@prisma/client';
import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';

export const TRIP_DRIVING_IMPACT_DISTANCE_POLICY_VERSION = 'trip-distance-km-v1';
export const TRIP_DRIVING_IMPACT_COVERAGE_AUDIT_VERSION =
  'trip-driving-impact-coverage-audit-2026-07-v1';
export const TRIP_DRIVING_IMPACT_COVERAGE_SCHEMA_VERSION =
  '20260717180000_trip_driving_impact_authoritative_coverage';

/** Canonical distance source: finalized VehicleTrip.distanceKm at compute time. */
export const CANONICAL_DISTANCE_SOURCE = 'vehicle_trip.distance_km' as const;

export const DISTANCE_DISCREPANCY_TOLERANCE_KM = 0.5;
export const SOURCE_COMPLETENESS_PARTIAL_THRESHOLD = 0.6;

export type TripDrivingImpactCoverageClass =
  | 'ELIGIBLE_MISSING_TDI'
  | 'JOB_MISSING'
  | 'JOB_FAILED'
  | 'UNSUPPORTED_DATA'
  | 'TRIP_NOT_FINAL'
  | 'LEGACY_GAP'
  | 'RETRY_EXHAUSTED'
  | 'DISTANCE_STALE'
  | 'ALREADY_COMPLETE'
  | 'CROSS_TENANT_SKIP';

export type TripDrivingImpactComputeAction =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'skipped';

export interface TripDrivingImpactCanonicalDistance {
  authoritativeDistanceKm: number;
  source: typeof CANONICAL_DISTANCE_SOURCE;
  tripDistanceKmAtSource: number;
  distanceDiscrepancyKm: number;
}

export interface TripDrivingImpactSourceCompleteness {
  score: number;
  hasBehaviorEvents: boolean;
  hasUsageSplit: boolean;
  hasTripCounts: boolean;
  telemetryInput: 'TELEMETRY_EVENTS' | 'HF_DERIVED' | 'NONE';
}

export interface TripDrivingImpactComputeOutcome {
  processed: boolean;
  action: TripDrivingImpactComputeAction;
  analysisStatus: TripDrivingImpactAnalysisStatus;
  shouldRecalculateBrake: boolean;
  tripId: string;
  sourceFingerprint: string | null;
  authoritativeDistanceKm: number | null;
  sourceCompleteness: number | null;
  distanceDiscrepancyKm: number | null;
  skipReason?: string;
}

export interface TripDrivingImpactAuditInput {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  tripStatus: TripStatus | string;
  startTime: string;
  endTime: string | null;
  distanceKm: number | null;
  behaviorEnrichmentStatus: string | null;
  drivingImpactStatus: string | null;
  drivingImpactComputedAt: string | null;
  tripAnalysisStatus: string | null;
  updatedAt: string;
  existingTdi: {
    tripId: string;
    authoritativeDistanceKm: number | null;
    distanceKm: number;
    sourceFingerprint: string | null;
    analysisStatus: TripDrivingImpactAnalysisStatus | string;
    calculatedAt: string | null;
    tripDistanceKmAtSource: number | null;
  } | null;
}

export interface TripDrivingImpactCoverageAuditResult {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  coverageClass: TripDrivingImpactCoverageClass;
  analysisStatus: TripDrivingImpactAnalysisStatus | 'MISSING';
  authoritativeDistanceKm: number | null;
  tripDistanceKm: number | null;
  distanceDiscrepancyKm: number | null;
  distanceOutlier: boolean;
  autoBackfillEligible: boolean;
  recommendedAction: string;
  notes: string[];
}

function roundKm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function resolveCanonicalTripDistance(input: {
  distanceKm: number | null | undefined;
  tripStatus: TripStatus | string;
  endTime: Date | string | null;
}): TripDrivingImpactCanonicalDistance | null {
  if (String(input.tripStatus).toUpperCase() !== TripStatus.COMPLETED) return null;
  if (!input.endTime) return null;
  const tripDistanceKmAtSource = input.distanceKm;
  if (tripDistanceKmAtSource == null || !Number.isFinite(tripDistanceKmAtSource) || tripDistanceKmAtSource < 0) {
    return null;
  }
  const authoritativeDistanceKm = roundKm(tripDistanceKmAtSource);
  return {
    authoritativeDistanceKm,
    source: CANONICAL_DISTANCE_SOURCE,
    tripDistanceKmAtSource: authoritativeDistanceKm,
    distanceDiscrepancyKm: 0,
  };
}

export function computeDistanceDiscrepancyKm(
  tripDistanceKm: number | null | undefined,
  authoritativeDistanceKm: number | null | undefined,
): number {
  if (tripDistanceKm == null || authoritativeDistanceKm == null) return 0;
  return roundKm(Math.abs(tripDistanceKm - authoritativeDistanceKm));
}

export function isDistanceOutlier(discrepancyKm: number): boolean {
  return discrepancyKm > DISTANCE_DISCREPANCY_TOLERANCE_KM;
}

export function buildSourceVersion(modelVersion: string = C.MODEL_VERSION): string {
  return `${modelVersion}:${TRIP_DRIVING_IMPACT_DISTANCE_POLICY_VERSION}`;
}

export function assessSourceCompleteness(input: {
  useTelemetryDrivingEvents: boolean;
  brakingEventCount: number;
  citySharePct: number | null;
  highwaySharePct: number | null;
  hasTripCounts: boolean;
}): TripDrivingImpactSourceCompleteness {
  const hasBehaviorEvents = input.brakingEventCount > 0;
  const hasUsageSplit = input.citySharePct != null || input.highwaySharePct != null;
  const telemetryInput = input.useTelemetryDrivingEvents
    ? 'TELEMETRY_EVENTS'
    : hasBehaviorEvents
      ? 'HF_DERIVED'
      : 'NONE';

  let score = 0;
  if (input.hasTripCounts) score += 0.35;
  if (hasUsageSplit) score += 0.25;
  if (hasBehaviorEvents) score += 0.3;
  if (telemetryInput !== 'NONE') score += 0.1;

  return {
    score: Math.round(score * 1000) / 1000,
    hasBehaviorEvents,
    hasUsageSplit,
    hasTripCounts: input.hasTripCounts,
    telemetryInput,
  };
}

export function resolveAnalysisStatus(input: {
  canonicalDistance: TripDrivingImpactCanonicalDistance | null;
  sourceCompleteness: TripDrivingImpactSourceCompleteness;
  computeFailed?: boolean;
  existingStatus?: TripDrivingImpactAnalysisStatus | null;
  tripDistanceChanged?: boolean;
}): TripDrivingImpactAnalysisStatus {
  if (input.computeFailed) return TripDrivingImpactAnalysisStatus.FAILED;
  if (!input.canonicalDistance) return TripDrivingImpactAnalysisStatus.UNSUPPORTED;
  if (input.canonicalDistance.authoritativeDistanceKm < C.MINIMUM_RELIABLE_TRIP_KM) {
    return TripDrivingImpactAnalysisStatus.UNSUPPORTED;
  }
  if (input.tripDistanceChanged && input.existingStatus === TripDrivingImpactAnalysisStatus.COMPLETE) {
    return TripDrivingImpactAnalysisStatus.STALE;
  }
  if (input.sourceCompleteness.score < SOURCE_COMPLETENESS_PARTIAL_THRESHOLD) {
    return TripDrivingImpactAnalysisStatus.PARTIAL;
  }
  return TripDrivingImpactAnalysisStatus.COMPLETE;
}

export function isAuthoritativeForBrakeWear(
  status: TripDrivingImpactAnalysisStatus | string | null | undefined,
): boolean {
  return (
    status === TripDrivingImpactAnalysisStatus.COMPLETE ||
    status === TripDrivingImpactAnalysisStatus.PARTIAL
  );
}

export function buildTripDrivingImpactSourceFingerprint(input: {
  tripId: string;
  vehicleId: string;
  authoritativeDistanceKm: number;
  sourceVersion: string;
  hardAccelerationCount: number;
  hardBrakingCount: number;
  fullBrakingCount: number;
  brakingEventCount: number;
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
  behaviorEnrichmentStatus: string | null;
  telemetryInput: string;
  tripUpdatedAt: string;
}): string {
  const payload = [
    input.tripId,
    input.vehicleId,
    roundKm(input.authoritativeDistanceKm),
    input.sourceVersion,
    input.hardAccelerationCount,
    input.hardBrakingCount,
    input.fullBrakingCount,
    input.brakingEventCount,
    input.citySharePct ?? 'null',
    input.highwaySharePct ?? 'null',
    input.countryRoadSharePct ?? 'null',
    input.behaviorEnrichmentStatus ?? 'null',
    input.telemetryInput,
    input.tripUpdatedAt,
  ].join(':');
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

export function mapAnalysisStatusToDrivingImpactStatus(
  status: TripDrivingImpactAnalysisStatus,
): 'PENDING' | 'READY' | 'SKIPPED' | 'FAILED' {
  switch (status) {
    case TripDrivingImpactAnalysisStatus.COMPLETE:
    case TripDrivingImpactAnalysisStatus.PARTIAL:
      return 'READY';
    case TripDrivingImpactAnalysisStatus.UNSUPPORTED:
      return 'SKIPPED';
    case TripDrivingImpactAnalysisStatus.FAILED:
      return 'FAILED';
    case TripDrivingImpactAnalysisStatus.STALE:
    case TripDrivingImpactAnalysisStatus.PENDING:
    default:
      return 'PENDING';
  }
}

export function auditTripDrivingImpactCoverage(
  input: TripDrivingImpactAuditInput,
): TripDrivingImpactCoverageAuditResult {
  const notes: string[] = [];
  const tripDistanceKm = input.distanceKm != null ? roundKm(input.distanceKm) : null;
  const canonical = resolveCanonicalTripDistance({
    distanceKm: input.distanceKm,
    tripStatus: input.tripStatus,
    endTime: input.endTime,
  });

  if (input.existingTdi) {
    const discrepancy = computeDistanceDiscrepancyKm(
      tripDistanceKm,
      input.existingTdi.authoritativeDistanceKm ?? input.existingTdi.distanceKm,
    );
    const outlier = isDistanceOutlier(discrepancy);
    if (outlier) {
      notes.push(`distance_discrepancy_${discrepancy}_km`);
    }

    if (
      input.existingTdi.analysisStatus === TripDrivingImpactAnalysisStatus.COMPLETE ||
      input.existingTdi.analysisStatus === TripDrivingImpactAnalysisStatus.PARTIAL
    ) {
      if (outlier) {
        return {
          tripId: input.tripId,
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          coverageClass: 'DISTANCE_STALE',
          analysisStatus: TripDrivingImpactAnalysisStatus.STALE,
          authoritativeDistanceKm: input.existingTdi.authoritativeDistanceKm,
          tripDistanceKm,
          distanceDiscrepancyKm: discrepancy,
          distanceOutlier: true,
          autoBackfillEligible: true,
          recommendedAction: 'recompute_tdi_and_recalc_brake',
          notes,
        };
      }
      return {
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        coverageClass: 'ALREADY_COMPLETE',
        analysisStatus: input.existingTdi.analysisStatus as TripDrivingImpactAnalysisStatus,
        authoritativeDistanceKm: input.existingTdi.authoritativeDistanceKm,
        tripDistanceKm,
        distanceDiscrepancyKm: discrepancy,
        distanceOutlier: outlier,
        autoBackfillEligible: false,
        recommendedAction: 'no_op',
        notes,
      };
    }
  }

  if (String(input.tripStatus).toUpperCase() !== TripStatus.COMPLETED || !input.endTime) {
    return {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      coverageClass: 'TRIP_NOT_FINAL',
      analysisStatus: 'MISSING',
      authoritativeDistanceKm: null,
      tripDistanceKm,
      distanceDiscrepancyKm: null,
      distanceOutlier: false,
      autoBackfillEligible: false,
      recommendedAction: 'wait_for_trip_finalization',
      notes: ['trip_not_completed'],
    };
  }

  if (!canonical || canonical.authoritativeDistanceKm < C.MINIMUM_RELIABLE_TRIP_KM) {
    return {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      coverageClass: 'UNSUPPORTED_DATA',
      analysisStatus: TripDrivingImpactAnalysisStatus.UNSUPPORTED,
      authoritativeDistanceKm: canonical?.authoritativeDistanceKm ?? null,
      tripDistanceKm,
      distanceDiscrepancyKm: null,
      distanceOutlier: false,
      autoBackfillEligible: false,
      recommendedAction: 'unsupported_trip_distance',
      notes: ['below_minimum_reliable_trip_km'],
    };
  }

  const behaviorStatus = String(input.behaviorEnrichmentStatus ?? '').toUpperCase();
  if (behaviorStatus === 'FAILED_PERMANENT') {
    return {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      coverageClass: 'JOB_FAILED',
      analysisStatus: TripDrivingImpactAnalysisStatus.FAILED,
      authoritativeDistanceKm: canonical.authoritativeDistanceKm,
      tripDistanceKm,
      distanceDiscrepancyKm: null,
      distanceOutlier: false,
      autoBackfillEligible: false,
      recommendedAction: 'manual_review_behavior_failure',
      notes: ['behavior_enrichment_failed_permanent'],
    };
  }

  if (behaviorStatus === 'FAILED_TRANSIENT') {
    return {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      coverageClass: 'RETRY_EXHAUSTED',
      analysisStatus: TripDrivingImpactAnalysisStatus.FAILED,
      authoritativeDistanceKm: canonical.authoritativeDistanceKm,
      tripDistanceKm,
      distanceDiscrepancyKm: null,
      distanceOutlier: false,
      autoBackfillEligible: true,
      recommendedAction: 'retry_behavior_enrichment',
      notes: ['behavior_enrichment_failed_transient'],
    };
  }

  if (behaviorStatus === 'SKIPPED_NO_HF_DATA') {
    return {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      coverageClass: 'UNSUPPORTED_DATA',
      analysisStatus: TripDrivingImpactAnalysisStatus.UNSUPPORTED,
      authoritativeDistanceKm: canonical.authoritativeDistanceKm,
      tripDistanceKm,
      distanceDiscrepancyKm: null,
      distanceOutlier: false,
      autoBackfillEligible: false,
      recommendedAction: 'no_tdi_without_assessable_behavior',
      notes: ['behavior_enrichment_skipped'],
    };
  }

  if (!input.existingTdi && input.drivingImpactStatus === 'PENDING' && !input.drivingImpactComputedAt) {
    if (behaviorStatus === 'COMPLETED') {
      return {
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        coverageClass: 'JOB_MISSING',
        analysisStatus: 'MISSING',
        authoritativeDistanceKm: canonical.authoritativeDistanceKm,
        tripDistanceKm,
        distanceDiscrepancyKm: null,
        distanceOutlier: false,
        autoBackfillEligible: true,
        recommendedAction: 'enqueue_driving_impact_compute',
        notes: ['behavior_complete_missing_tdi'],
      };
    }
  }

  if (!input.existingTdi) {
  const isLegacy =
    input.drivingImpactComputedAt != null ||
    input.drivingImpactStatus === 'READY' ||
    input.drivingImpactStatus === 'SKIPPED';
    if (isLegacy) {
      return {
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        coverageClass: 'LEGACY_GAP',
        analysisStatus: 'MISSING',
        authoritativeDistanceKm: canonical.authoritativeDistanceKm,
        tripDistanceKm,
        distanceDiscrepancyKm: null,
        distanceOutlier: false,
        autoBackfillEligible: true,
        recommendedAction: 'backfill_tdi_from_completed_trip',
        notes: ['legacy_status_without_tdi_row'],
      };
    }

    return {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      coverageClass: 'ELIGIBLE_MISSING_TDI',
      analysisStatus: 'MISSING',
      authoritativeDistanceKm: canonical.authoritativeDistanceKm,
      tripDistanceKm,
      distanceDiscrepancyKm: null,
      distanceOutlier: false,
      autoBackfillEligible: behaviorStatus === 'COMPLETED',
      recommendedAction:
        behaviorStatus === 'COMPLETED'
          ? 'enqueue_driving_impact_compute'
          : 'wait_for_behavior_enrichment',
      notes: ['missing_tdi_row'],
    };
  }

  return {
    tripId: input.tripId,
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    coverageClass: 'ELIGIBLE_MISSING_TDI',
    analysisStatus: TripDrivingImpactAnalysisStatus.PENDING,
    authoritativeDistanceKm: canonical.authoritativeDistanceKm,
    tripDistanceKm,
    distanceDiscrepancyKm: null,
    distanceOutlier: false,
    autoBackfillEligible: true,
    recommendedAction: 'recompute_tdi',
    notes,
  };
}

export function computeTripDrivingImpactCoverageReportHash(
  rows: Array<Pick<TripDrivingImpactCoverageAuditResult, 'tripId' | 'autoBackfillEligible' | 'coverageClass'>>,
): string {
  const applicable = rows
    .filter((r) => r.autoBackfillEligible)
    .sort((a, b) => a.tripId.localeCompare(b.tripId))
    .map((r) => `${r.tripId}:${r.coverageClass}`)
    .join('|');
  return createHash('sha256').update(applicable).digest('hex').slice(0, 16);
}
