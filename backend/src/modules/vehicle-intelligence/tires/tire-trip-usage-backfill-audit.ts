/**
 * Read-only dry-run audit for historical TireTripUsageLedger backfill (Prompt 12).
 * No database writes — projects attribution, km rollups, and conflicts only.
 */
import { createHash } from 'crypto';
import {
  buildSetupPeriodsFromSetups,
  isTripCanonicallyFinalForTireUsage,
  resolveSetupAttributionForTrip,
  type MountPeriodInterval,
} from './tire-trip-usage-attribution';
import {
  computeTripUsageSourceFingerprint,
  deriveTripUsageRoadKm,
  TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
  type TripUsageDrivingImpactSummary,
} from './tire-trip-usage-ledger';

export const TRIP_USAGE_BACKFILL_AUDIT_ID = 'tire-trip-usage-backfill-2026-07';
export const TRIP_USAGE_BACKFILL_AUDIT_VERSION = 'tire-trip-usage-backfill-audit-2026-07-v1';
export const DEFAULT_BACKFILL_LOOKBACK_DAYS = 60;

export type TripUsageBackfillAttributionClass =
  | 'SINGLE_SETUP'
  | 'NO_SETUP'
  | 'MULTIPLE_SETUPS'
  | 'SETUP_CHANGE_IN_TRIP'
  | 'INCOMPLETE_HISTORY'
  | 'TRIP_BEFORE_FIRST_SETUP'
  | 'TRIP_AFTER_SETUP_REMOVAL'
  | 'SKIPPED_NOT_FINAL'
  | 'SKIPPED_NO_DISTANCE'
  | 'SKIPPED_NOT_COMPLETED'
  | 'SKIPPED_CANCELLED'
  | 'SKIPPED_MERGED';

export type TripUsageReprocessingPattern =
  | 'NONE'
  | 'LEDGER_EXISTS_UNCHANGED'
  | 'LEDGER_EXISTS_WOULD_REVISE'
  | 'APPLIED_STATUS_WITHOUT_LEDGER'
  | 'LEDGER_WITHOUT_TRIP_STATUS'
  | 'INVALIDATED_LEDGER_PRESENT';

export interface TripBackfillAuditInput {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  tripStatus: string;
  startTime: string;
  endTime: string | null;
  distanceKm: number | null;
  citySharePercent?: number | null;
  highwaySharePercent?: number | null;
  countrySharePercent?: number | null;
  harshAccelCount?: number;
  harshBrakeCount?: number;
  harshCornerCount?: number;
  tripAnalysisStatus?: string | null;
  analysisStagesJson?: unknown;
  tireUsageAttributionStatus?: string | null;
  mergeParentTripId?: string | null;
  mountPeriods: MountPeriodInterval[];
  setupFallback?: Array<{
    id: string;
    installedAt: string | null;
    removedAt: string | null;
    status: string;
  }>;
  existingLedger?: {
    tireSetupId: string;
    sourceFingerprint: string;
    distanceKm: number;
    invalidatedAt: string | null;
  } | null;
  odometerStartKm?: number | null;
  odometerEndKm?: number | null;
  waypointCount?: number;
  waypointPlausibilityKm?: number | null;
}

export interface TripDistanceAudit {
  authoritativeKm: number | null;
  odometerDeltaKm: number | null;
  waypointPlausibilityKm: number | null;
  odometerDeltaAbs: number | null;
  odometerDeltaPct: number | null;
  odometerConflict: boolean;
  distanceSource: 'trip_distance_km';
  plausibilityOnly: boolean;
  notes: string[];
}

export interface TripBackfillAuditResult {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  anonymizedTripId: string;
  anonymizedVehicleId: string;
  tripStartedAt: string;
  tripEndedAt: string | null;
  attributionClass: TripUsageBackfillAttributionClass;
  attributedSetupId: string | null;
  anonymizedSetupId: string | null;
  attributedSetupStatus: string | null;
  conflictSetupIds: string[];
  eligibleForLedger: boolean;
  attributableKm: number;
  distance: TripDistanceAudit;
  reprocessingPattern: TripUsageReprocessingPattern;
  potentialDuplicate: boolean;
  projectedFingerprint: string | null;
  recommendedAction: string;
  notes: string[];
}

export interface SetupBackfillKmRollup {
  setupId: string;
  anonymizedSetupId: string;
  vehicleId: string;
  anonymizedVehicleId: string;
  setupStatus: string;
  tripCountAttributed: number;
  expectedKmFromBackfill: number;
  existingLedgerKm: number;
  currentTotalKmOnSet: number;
  absoluteDeltaKm: number;
  percentDelta: number | null;
  hasKmDeviation: boolean;
}

export interface TripUsageBackfillAuditReport {
  auditId: string;
  auditVersion: string;
  generatedAt: string;
  mode: 'fixtures' | 'database';
  readOnly: true;
  filters: {
    organizationId: string | null;
    vehicleId: string | null;
    from: string;
    to: string;
    batchSize: number;
    fullSetupHistory: boolean;
    lookbackDays: number;
  };
  summary: {
    tripsScanned: number;
    candidatesEligible: number;
    singleSetupAttribution: number;
    conflicts: number;
    noSetup: number;
    incompleteHistory: number;
    tripBeforeFirstSetup: number;
    tripAfterSetupRemoval: number;
    skippedNotFinal: number;
    skippedNoDistance: number;
    skippedCancelled: number;
    skippedMerged: number;
    potentialDuplicates: number;
    reprocessingCandidates: number;
    odometerConflicts: number;
    setupsWithKmDeviation: number;
    totalExpectedKm: number;
  };
  setupRollups: SetupBackfillKmRollup[];
  trips: TripBackfillAuditResult[];
}

const ODOMETER_CONFLICT_TOLERANCE_KM = 2;
const ODOMETER_CONFLICT_TOLERANCE_PCT = 0.05;
const KM_DEVIATION_TOLERANCE_KM = 1;
const KM_DEVIATION_TOLERANCE_PCT = 0.02;

export function anonymizeEntityId(rawId: string, auditSalt: string, prefix: string): string {
  const digest = createHash('sha256').update(`${auditSalt}:${rawId}`).digest('hex');
  return `${prefix}_${digest.slice(0, 12)}`;
}

function roundKm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function finiteKm(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return roundKm(value);
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return roundKm(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function sumWaypointPlausibilityKm(
  waypoints: Array<{ latitude: number; longitude: number }>,
): number | null {
  if (waypoints.length < 2) return null;
  let total = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const prev = waypoints[i - 1]!;
    const curr = waypoints[i]!;
    total += haversineKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
  }
  return roundKm(total);
}

export function resolveMountPeriodsForTrip(input: TripBackfillAuditInput): {
  periods: MountPeriodInterval[];
  historySource: 'mount_periods' | 'setup_fallback' | 'none';
} {
  if (input.mountPeriods.length > 0) {
    return { periods: input.mountPeriods, historySource: 'mount_periods' };
  }
  if (input.setupFallback && input.setupFallback.length > 0) {
    const periods = buildSetupPeriodsFromSetups(
      input.setupFallback.map((s) => ({
        id: s.id,
        installedAt: parseDate(s.installedAt),
        removedAt: parseDate(s.removedAt),
      })),
    );
    return { periods, historySource: periods.length > 0 ? 'setup_fallback' : 'none' };
  }
  return { periods: [], historySource: 'none' };
}

export function classifyNoSetupReason(args: {
  tripStartedAt: Date;
  tripEndedAt: Date;
  periods: MountPeriodInterval[];
  historySource: 'mount_periods' | 'setup_fallback' | 'none';
  setupFallback?: TripBackfillAuditInput['setupFallback'];
}): TripUsageBackfillAttributionClass {
  const { tripStartedAt, tripEndedAt, periods, historySource, setupFallback } = args;

  if (
    historySource === 'none' &&
    setupFallback &&
    setupFallback.length > 0 &&
    setupFallback.some((s) => !s.installedAt)
  ) {
    return 'INCOMPLETE_HISTORY';
  }

  if (historySource === 'setup_fallback' && periods.length === 0) {
    return 'INCOMPLETE_HISTORY';
  }

  if (periods.length === 0) {
    return 'NO_SETUP';
  }

  const earliestInstall = Math.min(...periods.map((p) => p.installedAt.getTime()));
  if (tripEndedAt.getTime() <= earliestInstall) {
    return 'TRIP_BEFORE_FIRST_SETUP';
  }

  const allRemovedBeforeTrip = periods.every(
    (p) => p.removedAt != null && p.removedAt.getTime() <= tripStartedAt.getTime(),
  );
  if (allRemovedBeforeTrip) {
    return 'TRIP_AFTER_SETUP_REMOVAL';
  }

  return 'NO_SETUP';
}

export function classifyTripUsageBackfillAttribution(
  input: TripBackfillAuditInput,
): {
  attributionClass: TripUsageBackfillAttributionClass;
  attributedSetupId: string | null;
  attributedSetupStatus: string | null;
  conflictSetupIds: string[];
  eligibleForLedger: boolean;
  notes: string[];
} {
  const notes: string[] = [];

  if (input.mergeParentTripId) {
    return {
      attributionClass: 'SKIPPED_MERGED',
      attributedSetupId: null,
      attributedSetupStatus: null,
      conflictSetupIds: [],
      eligibleForLedger: false,
      notes: ['trip_merged_into_parent'],
    };
  }

  if (input.tripStatus === 'CANCELLED') {
    return {
      attributionClass: 'SKIPPED_CANCELLED',
      attributedSetupId: null,
      attributedSetupStatus: null,
      conflictSetupIds: [],
      eligibleForLedger: false,
      notes: ['trip_cancelled'],
    };
  }

  if (input.tripStatus !== 'COMPLETED' || !input.endTime) {
    return {
      attributionClass: 'SKIPPED_NOT_COMPLETED',
      attributedSetupId: null,
      attributedSetupStatus: null,
      conflictSetupIds: [],
      eligibleForLedger: false,
      notes: ['trip_not_completed'],
    };
  }

  const tripStart = parseDate(input.startTime);
  const tripEnd = parseDate(input.endTime);
  if (!tripStart || !tripEnd) {
    return {
      attributionClass: 'SKIPPED_NOT_COMPLETED',
      attributedSetupId: null,
      attributedSetupStatus: null,
      conflictSetupIds: [],
      eligibleForLedger: false,
      notes: ['invalid_trip_interval'],
    };
  }

  if (
    !isTripCanonicallyFinalForTireUsage({
      tripStatus: input.tripStatus,
      endTime: tripEnd,
      tripAnalysisStatus: input.tripAnalysisStatus ?? null,
      analysisStagesJson: input.analysisStagesJson,
    })
  ) {
    return {
      attributionClass: 'SKIPPED_NOT_FINAL',
      attributedSetupId: null,
      attributedSetupStatus: null,
      conflictSetupIds: [],
      eligibleForLedger: false,
      notes: ['trip_analysis_not_terminal'],
    };
  }

  const distance = finiteKm(input.distanceKm);
  if (distance == null || distance <= 0) {
    return {
      attributionClass: 'SKIPPED_NO_DISTANCE',
      attributedSetupId: null,
      attributedSetupStatus: null,
      conflictSetupIds: [],
      eligibleForLedger: false,
      notes: ['missing_or_zero_distance'],
    };
  }

  const { periods, historySource } = resolveMountPeriodsForTrip(input);
  if (historySource === 'setup_fallback') {
    notes.push('mount_periods_missing_used_setup_install_fallback');
  }

  const resolution = resolveSetupAttributionForTrip({
    trip: { tripStartedAt: tripStart, tripEndedAt: tripEnd },
    periods,
  });

  if (resolution.status === 'SINGLE') {
    const setupStatus =
      input.setupFallback?.find((s) => s.id === resolution.tireSetupId)?.status ?? null;
    return {
      attributionClass: 'SINGLE_SETUP',
      attributedSetupId: resolution.tireSetupId,
      attributedSetupStatus: setupStatus,
      conflictSetupIds: [],
      eligibleForLedger: true,
      notes,
    };
  }

  if (resolution.status === 'REQUIRES_REVIEW') {
    const attributionClass =
      resolution.reason === 'setup_change_boundary_within_trip_interval'
        ? 'SETUP_CHANGE_IN_TRIP'
        : 'MULTIPLE_SETUPS';
    return {
      attributionClass,
      attributedSetupId: null,
      attributedSetupStatus: null,
      conflictSetupIds: resolution.tireSetupIds,
      eligibleForLedger: false,
      notes: [...notes, resolution.reason, 'manual_review_required_no_auto_guess'],
    };
  }

  const noSetupClass = classifyNoSetupReason({
    tripStartedAt: tripStart,
    tripEndedAt: tripEnd,
    periods,
    historySource,
    setupFallback: input.setupFallback,
  });

  return {
    attributionClass: noSetupClass,
    attributedSetupId: null,
    attributedSetupStatus: null,
    conflictSetupIds: [],
    eligibleForLedger: false,
    notes,
  };
}

export function auditTripDistanceSources(input: TripBackfillAuditInput): TripDistanceAudit {
  const notes: string[] = [
    'authoritative_distance=trip.distance_km',
    'waypoints_plausibility_only_not_summed',
  ];
  const authoritativeKm = finiteKm(input.distanceKm);

  let odometerDeltaKm: number | null = null;
  const startOdo = finiteKm(input.odometerStartKm);
  const endOdo = finiteKm(input.odometerEndKm);
  if (startOdo != null && endOdo != null && endOdo >= startOdo) {
    odometerDeltaKm = roundKm(endOdo - startOdo);
    notes.push('odometer_delta=energy_event_or_trip_boundary_envelope');
  } else {
    notes.push('odometer_delta_unavailable');
  }

  const waypointPlausibilityKm =
    input.waypointPlausibilityKm != null
      ? finiteKm(input.waypointPlausibilityKm)
      : null;
  if (waypointPlausibilityKm != null) {
    notes.push(`waypoint_points=${input.waypointCount ?? 0}`);
  }

  let odometerDeltaAbs: number | null = null;
  let odometerDeltaPct: number | null = null;
  let odometerConflict = false;

  if (authoritativeKm != null && odometerDeltaKm != null) {
    odometerDeltaAbs = roundKm(Math.abs(authoritativeKm - odometerDeltaKm));
    odometerDeltaPct =
      authoritativeKm > 0 ? roundKm(odometerDeltaAbs / authoritativeKm) : null;
    odometerConflict =
      odometerDeltaAbs > ODOMETER_CONFLICT_TOLERANCE_KM &&
      (odometerDeltaPct ?? 0) > ODOMETER_CONFLICT_TOLERANCE_PCT;
    if (odometerConflict) {
      notes.push('odometer_conflict_with_authoritative_distance');
    }
  }

  return {
    authoritativeKm,
    odometerDeltaKm,
    waypointPlausibilityKm,
    odometerDeltaAbs,
    odometerDeltaPct,
    odometerConflict,
    distanceSource: 'trip_distance_km',
    plausibilityOnly: true,
    notes,
  };
}

function buildProjectedFingerprint(
  input: TripBackfillAuditInput,
  setupId: string,
  distanceKm: number,
): string {
  const road = deriveTripUsageRoadKm({
    distanceKm,
    citySharePercent: input.citySharePercent,
    highwaySharePercent: input.highwaySharePercent,
    countrySharePercent: input.countrySharePercent,
  });
  const drivingImpactSummary: TripUsageDrivingImpactSummary = {
    tripAnalysisStatus: input.tripAnalysisStatus ?? null,
    trigger: 'historical_backfill_audit',
  };
  return computeTripUsageSourceFingerprint({
    sourceVersion: TIRE_TRIP_USAGE_LEDGER_SOURCE_VERSION,
    tripId: input.tripId,
    tireSetupId: setupId,
    tripStartedAt: input.startTime,
    tripEndedAt: input.endTime,
    distanceKm,
    cityKm: road.cityKm,
    ruralKm: road.ruralKm,
    highwayKm: road.highwayKm,
    harshAccelerationCount: input.harshAccelCount ?? 0,
    harshBrakingCount: input.harshBrakeCount ?? 0,
    harshCorneringCount: input.harshCornerCount ?? 0,
    drivingImpactSummary,
  });
}

export function detectReprocessingPattern(args: {
  input: TripBackfillAuditInput;
  attributedSetupId: string | null;
  eligibleForLedger: boolean;
  projectedFingerprint: string | null;
}): TripUsageReprocessingPattern {
  const ledger = args.input.existingLedger;
  if (ledger?.invalidatedAt) {
    return 'INVALIDATED_LEDGER_PRESENT';
  }
  if (ledger && args.projectedFingerprint) {
    if (ledger.sourceFingerprint === args.projectedFingerprint) {
      return 'LEDGER_EXISTS_UNCHANGED';
    }
    return 'LEDGER_EXISTS_WOULD_REVISE';
  }
  if (
    args.input.tireUsageAttributionStatus === 'APPLIED' &&
    !ledger &&
    args.eligibleForLedger
  ) {
    return 'APPLIED_STATUS_WITHOUT_LEDGER';
  }
  if (ledger && args.input.tireUsageAttributionStatus !== 'APPLIED') {
    return 'LEDGER_WITHOUT_TRIP_STATUS';
  }
  return 'NONE';
}

function recommendedActionFor(result: {
  attributionClass: TripUsageBackfillAttributionClass;
  eligibleForLedger: boolean;
  reprocessingPattern: TripUsageReprocessingPattern;
  distance: TripDistanceAudit;
}): string {
  if (!result.eligibleForLedger) {
    if (
      result.attributionClass === 'MULTIPLE_SETUPS' ||
      result.attributionClass === 'SETUP_CHANGE_IN_TRIP'
    ) {
      return 'manual_review_required_do_not_auto_attribute';
    }
    if (result.attributionClass === 'INCOMPLETE_HISTORY') {
      return 'repair_mount_period_history_before_backfill';
    }
    return 'skip_not_eligible_for_ledger';
  }
  if (result.distance.odometerConflict) {
    return 'resolve_odometer_distance_conflict_before_apply';
  }
  if (result.reprocessingPattern === 'LEDGER_EXISTS_UNCHANGED') {
    return 'skip_duplicate_ledger_row_exists';
  }
  if (result.reprocessingPattern === 'LEDGER_EXISTS_WOULD_REVISE') {
    return 'controlled_replay_would_revise_ledger';
  }
  if (result.reprocessingPattern === 'APPLIED_STATUS_WITHOUT_LEDGER') {
    return 'reconcile_missing_ledger_row_before_apply';
  }
  return 'eligible_for_controlled_backfill_apply';
}

export function auditTripBackfillCandidate(
  input: TripBackfillAuditInput,
  auditSalt: string,
): TripBackfillAuditResult {
  const classification = classifyTripUsageBackfillAttribution(input);
  const distance = auditTripDistanceSources(input);
  const attributableKm =
    classification.eligibleForLedger && distance.authoritativeKm != null
      ? distance.authoritativeKm
      : 0;

  const projectedFingerprint =
    classification.attributedSetupId && classification.eligibleForLedger
      ? buildProjectedFingerprint(
          input,
          classification.attributedSetupId,
          distance.authoritativeKm ?? 0,
        )
      : null;

  const reprocessingPattern = detectReprocessingPattern({
    input,
    attributedSetupId: classification.attributedSetupId,
    eligibleForLedger: classification.eligibleForLedger,
    projectedFingerprint,
  });

  const potentialDuplicate = reprocessingPattern === 'LEDGER_EXISTS_UNCHANGED';

  return {
    tripId: input.tripId,
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    anonymizedTripId: anonymizeEntityId(input.tripId, auditSalt, 'trip'),
    anonymizedVehicleId: anonymizeEntityId(input.vehicleId, auditSalt, 'vehicle'),
    tripStartedAt: input.startTime,
    tripEndedAt: input.endTime,
    attributionClass: classification.attributionClass,
    attributedSetupId: classification.attributedSetupId,
    anonymizedSetupId: classification.attributedSetupId
      ? anonymizeEntityId(classification.attributedSetupId, auditSalt, 'setup')
      : null,
    attributedSetupStatus: classification.attributedSetupStatus,
    conflictSetupIds: classification.conflictSetupIds,
    eligibleForLedger: classification.eligibleForLedger,
    attributableKm,
    distance,
    reprocessingPattern,
    potentialDuplicate,
    projectedFingerprint,
    recommendedAction: recommendedActionFor({
      attributionClass: classification.attributionClass,
      eligibleForLedger: classification.eligibleForLedger,
      reprocessingPattern,
      distance,
    }),
    notes: classification.notes,
  };
}

export function buildSetupKmRollups(args: {
  trips: TripBackfillAuditResult[];
  setups: Array<{
    setupId: string;
    vehicleId: string;
    status: string;
    totalKmOnSet: number;
    existingLedgerKm: number;
  }>;
  auditSalt: string;
}): SetupBackfillKmRollup[] {
  const bySetup = new Map<string, SetupBackfillKmRollup>();

  for (const setup of args.setups) {
    bySetup.set(setup.setupId, {
      setupId: setup.setupId,
      anonymizedSetupId: anonymizeEntityId(setup.setupId, args.auditSalt, 'setup'),
      vehicleId: setup.vehicleId,
      anonymizedVehicleId: anonymizeEntityId(setup.vehicleId, args.auditSalt, 'vehicle'),
      setupStatus: setup.status,
      tripCountAttributed: 0,
      expectedKmFromBackfill: 0,
      existingLedgerKm: roundKm(setup.existingLedgerKm),
      currentTotalKmOnSet: roundKm(setup.totalKmOnSet),
      absoluteDeltaKm: 0,
      percentDelta: null,
      hasKmDeviation: false,
    });
  }

  for (const trip of args.trips) {
    if (!trip.attributedSetupId || !trip.eligibleForLedger) continue;
    const row = bySetup.get(trip.attributedSetupId);
    if (!row) continue;
    row.tripCountAttributed += 1;
    row.expectedKmFromBackfill = roundKm(row.expectedKmFromBackfill + trip.attributableKm);
  }

  for (const row of bySetup.values()) {
    const baseline = row.existingLedgerKm > 0 ? row.existingLedgerKm : row.currentTotalKmOnSet;
    row.absoluteDeltaKm = roundKm(Math.abs(row.expectedKmFromBackfill - baseline));
    row.percentDelta =
      baseline > 0 ? roundKm(row.absoluteDeltaKm / baseline) : null;
    row.hasKmDeviation =
      row.tripCountAttributed > 0 &&
      row.absoluteDeltaKm > KM_DEVIATION_TOLERANCE_KM &&
      (row.percentDelta ?? 0) > KM_DEVIATION_TOLERANCE_PCT;
  }

  return [...bySetup.values()].sort((a, b) =>
    b.expectedKmFromBackfill - a.expectedKmFromBackfill,
  );
}

export function auditTripUsageBackfill(
  inputs: TripBackfillAuditInput[],
  opts: {
    mode: 'fixtures' | 'database';
    auditSalt?: string;
    filters: TripUsageBackfillAuditReport['filters'];
    setupRollups?: SetupBackfillKmRollup[];
  },
): TripUsageBackfillAuditReport {
  const auditSalt = opts.auditSalt ?? TRIP_USAGE_BACKFILL_AUDIT_ID;
  const trips = inputs.map((input) => auditTripBackfillCandidate(input, auditSalt));

  const summary = {
    tripsScanned: trips.length,
    candidatesEligible: trips.filter((t) => t.eligibleForLedger).length,
    singleSetupAttribution: trips.filter((t) => t.attributionClass === 'SINGLE_SETUP').length,
    conflicts: trips.filter(
      (t) =>
        t.attributionClass === 'MULTIPLE_SETUPS' ||
        t.attributionClass === 'SETUP_CHANGE_IN_TRIP',
    ).length,
    noSetup: trips.filter((t) => t.attributionClass === 'NO_SETUP').length,
    incompleteHistory: trips.filter((t) => t.attributionClass === 'INCOMPLETE_HISTORY').length,
    tripBeforeFirstSetup: trips.filter(
      (t) => t.attributionClass === 'TRIP_BEFORE_FIRST_SETUP',
    ).length,
    tripAfterSetupRemoval: trips.filter(
      (t) => t.attributionClass === 'TRIP_AFTER_SETUP_REMOVAL',
    ).length,
    skippedNotFinal: trips.filter((t) => t.attributionClass === 'SKIPPED_NOT_FINAL').length,
    skippedNoDistance: trips.filter((t) => t.attributionClass === 'SKIPPED_NO_DISTANCE').length,
    skippedCancelled: trips.filter((t) => t.attributionClass === 'SKIPPED_CANCELLED').length,
    skippedMerged: trips.filter((t) => t.attributionClass === 'SKIPPED_MERGED').length,
    potentialDuplicates: trips.filter((t) => t.potentialDuplicate).length,
    reprocessingCandidates: trips.filter(
      (t) =>
        t.reprocessingPattern === 'LEDGER_EXISTS_WOULD_REVISE' ||
        t.reprocessingPattern === 'APPLIED_STATUS_WITHOUT_LEDGER' ||
        t.reprocessingPattern === 'LEDGER_WITHOUT_TRIP_STATUS',
    ).length,
    odometerConflicts: trips.filter((t) => t.distance.odometerConflict).length,
    setupsWithKmDeviation: (opts.setupRollups ?? []).filter((s) => s.hasKmDeviation).length,
    totalExpectedKm: roundKm(
      trips.filter((t) => t.eligibleForLedger).reduce((acc, t) => acc + t.attributableKm, 0),
    ),
  };

  return {
    auditId: TRIP_USAGE_BACKFILL_AUDIT_ID,
    auditVersion: TRIP_USAGE_BACKFILL_AUDIT_VERSION,
    generatedAt: new Date().toISOString(),
    mode: opts.mode,
    readOnly: true,
    filters: opts.filters,
    summary,
    setupRollups: opts.setupRollups ?? [],
    trips,
  };
}

export function renderTripUsageBackfillAuditMarkdown(
  report: TripUsageBackfillAuditReport,
): string {
  const lines: string[] = [
    '# Tire Trip Usage Ledger — Historical Backfill Dry Run (2026-07)',
    '',
    `**Audit ID:** \`${report.auditId}\``,
    `**Version:** \`${report.auditVersion}\``,
    `**Generated:** ${report.generatedAt}`,
    `**Mode:** ${report.mode} (read-only)`,
    '',
    '## Filters',
    '',
    `| Parameter | Value |`,
    `|-----------|-------|`,
    `| Organization | ${report.filters.organizationId ?? 'all'} |`,
    `| Vehicle | ${report.filters.vehicleId ?? 'all'} |`,
    `| From | ${report.filters.from} |`,
    `| To | ${report.filters.to} |`,
    `| Lookback days | ${report.filters.lookbackDays} |`,
    `| Batch size | ${report.filters.batchSize} |`,
    `| Full setup history | ${report.filters.fullSetupHistory} |`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    `| Trips scanned | ${report.summary.tripsScanned} |`,
    `| Eligible for ledger (single setup) | ${report.summary.candidatesEligible} |`,
    `| Single-setup attribution | ${report.summary.singleSetupAttribution} |`,
    `| Conflicts (multi/boundary) | ${report.summary.conflicts} |`,
    `| No setup match | ${report.summary.noSetup} |`,
    `| Incomplete history | ${report.summary.incompleteHistory} |`,
    `| Trip before first setup | ${report.summary.tripBeforeFirstSetup} |`,
    `| Trip after setup removal | ${report.summary.tripAfterSetupRemoval} |`,
    `| Skipped (not final) | ${report.summary.skippedNotFinal} |`,
    `| Skipped (no distance) | ${report.summary.skippedNoDistance} |`,
    `| Potential duplicates | ${report.summary.potentialDuplicates} |`,
    `| Reprocessing candidates | ${report.summary.reprocessingCandidates} |`,
    `| Odometer conflicts | ${report.summary.odometerConflicts} |`,
    `| Setups with km deviation | ${report.summary.setupsWithKmDeviation} |`,
    `| Total expected km (eligible) | ${report.summary.totalExpectedKm} |`,
    '',
    '## Methodology',
    '',
    '1. **Read-only** — no ledger writes, no aggregate mutation, no tire events.',
    '2. Trips filtered to completed + canonically final analysis (same guards as `TireTripUsageService`).',
    '3. Setup resolution uses **historical mount periods** (fallback: setup install intervals).',
    '4. Conflicts (multi-setup, boundary-in-trip) are flagged — **never auto-guessed**.',
    '5. Distance: `vehicle_trips.distance_km` is authoritative; odometer envelope is cross-check only; waypoint chain is plausibility only (not summed into totals).',
    '6. Output anonymized (`trip_<hash>`, `setup_<hash>`, `vehicle_<hash>`) — no plates/VIN/secrets.',
    '',
    '## Setup km rollups',
    '',
    '| Anonymized setup | Status | Trips | Expected km | Ledger km | totalKmOnSet | |Δ| km | Δ % | deviation |',
    '|------------------|--------|------:|------------:|----------:|-------------:|-------:|----:|-----------|',
  ];

  for (const row of report.setupRollups) {
    lines.push(
      `| ${row.anonymizedSetupId} | ${row.setupStatus} | ${row.tripCountAttributed} | ${row.expectedKmFromBackfill} | ${row.existingLedgerKm} | ${row.currentTotalKmOnSet} | ${row.absoluteDeltaKm} | ${row.percentDelta != null ? (row.percentDelta * 100).toFixed(1) : '—'} | ${row.hasKmDeviation ? 'yes' : 'no'} |`,
    );
  }

  lines.push('', '## Trip attribution sample', '');
  lines.push(
    '| Anonymized trip | Class | Setup | km | odometer Δ | conflict | reprocessing | action |',
    '|-----------------|-------|-------|---:|-----------:|:--------:|--------------|--------|',
  );

  for (const trip of report.trips) {
    lines.push(
      `| ${trip.anonymizedTripId} | ${trip.attributionClass} | ${trip.anonymizedSetupId ?? '—'} | ${trip.attributableKm} | ${trip.distance.odometerDeltaKm ?? '—'} | ${trip.distance.odometerConflict ? 'yes' : 'no'} | ${trip.reprocessingPattern} | ${trip.recommendedAction} |`,
    );
  }

  lines.push('', '## Detail rows', '');
  for (const trip of report.trips) {
    lines.push(`### ${trip.anonymizedTripId}`);
    lines.push('');
    lines.push(`- **attributionClass:** ${trip.attributionClass}`);
    lines.push(`- **eligibleForLedger:** ${trip.eligibleForLedger}`);
    lines.push(`- **attributableKm:** ${trip.attributableKm}`);
    lines.push(`- **authoritativeDistanceKm:** ${trip.distance.authoritativeKm ?? 'null'}`);
    lines.push(`- **odometerDeltaKm:** ${trip.distance.odometerDeltaKm ?? 'null'}`);
    lines.push(`- **waypointPlausibilityKm:** ${trip.distance.waypointPlausibilityKm ?? 'null'} (not summed)`);
    if (trip.conflictSetupIds.length > 0) {
      lines.push(
        `- **conflictSetupIds:** ${trip.conflictSetupIds.map((id) => anonymizeEntityId(id, TRIP_USAGE_BACKFILL_AUDIT_ID, 'setup')).join(', ')}`,
      );
    }
    lines.push(`- **reprocessingPattern:** ${trip.reprocessingPattern}`);
    lines.push(`- **recommendedAction:** ${trip.recommendedAction}`);
    if (trip.notes.length > 0) {
      lines.push(`- **notes:** ${trip.notes.join('; ')}`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '*Read-only dry-run — projects full backfill impact before any controlled apply. Conflicts require manual review.*',
  );

  return lines.join('\n');
}

const FIXTURE_INSTALL = '2026-03-15T10:00:00.000Z';

export function sanitizeTripUsageBackfillReportForExport(
  report: TripUsageBackfillAuditReport,
  auditSalt = report.auditId,
): Omit<TripUsageBackfillAuditReport, 'trips' | 'setupRollups' | 'filters'> & {
  filters: Omit<TripUsageBackfillAuditReport['filters'], 'organizationId' | 'vehicleId'> & {
    organizationId: string | null;
    vehicleId: string | null;
  };
  trips: Array<
    Omit<
      TripBackfillAuditResult,
      'tripId' | 'vehicleId' | 'attributedSetupId' | 'conflictSetupIds' | 'organizationId'
    >
  >;
  setupRollups: Array<Omit<SetupBackfillKmRollup, 'setupId' | 'vehicleId'>>;
} {
  return {
    ...report,
    filters: {
      ...report.filters,
      organizationId: report.filters.organizationId
        ? anonymizeEntityId(report.filters.organizationId, auditSalt, 'org')
        : null,
      vehicleId: report.filters.vehicleId
        ? anonymizeEntityId(report.filters.vehicleId, auditSalt, 'vehicle')
        : null,
    },
    trips: report.trips.map(
      ({ tripId, vehicleId, attributedSetupId, conflictSetupIds, organizationId, ...rest }) =>
        rest,
    ),
    setupRollups: report.setupRollups.map(({ setupId, vehicleId, ...rest }) => rest),
  };
}

export function buildSyntheticTripUsageBackfillFixtures(): TripBackfillAuditInput[] {
  const periodActive = (setupId: string, removedAt: string | null = null): MountPeriodInterval => ({
    tireSetupId: setupId,
    installedAt: new Date(FIXTURE_INSTALL),
    removedAt: removedAt ? new Date(removedAt) : null,
  });

  return [
    {
      tripId: 'fixture-single',
      vehicleId: 'fixture-vehicle-1',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-10T10:00:00.000Z',
      endTime: '2026-07-10T11:00:00.000Z',
      distanceKm: 42,
      citySharePercent: 50,
      highwaySharePercent: 30,
      countrySharePercent: 20,
      harshAccelCount: 1,
      harshBrakeCount: 2,
      harshCornerCount: 0,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [periodActive('fixture-setup-active')],
      setupFallback: [{ id: 'fixture-setup-active', installedAt: FIXTURE_INSTALL, removedAt: null, status: 'ACTIVE' }],
      odometerStartKm: 10000,
      odometerEndKm: 10042,
      waypointCount: 12,
      waypointPlausibilityKm: 41.2,
    },
    {
      tripId: 'fixture-no-setup',
      vehicleId: 'fixture-vehicle-2',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-11T10:00:00.000Z',
      endTime: '2026-07-11T11:00:00.000Z',
      distanceKm: 18,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [],
      setupFallback: [],
    },
    {
      tripId: 'fixture-conflict-multi',
      vehicleId: 'fixture-vehicle-3',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-10T10:00:00.000Z',
      endTime: '2026-07-10T12:00:00.000Z',
      distanceKm: 55,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [
        periodActive('fixture-setup-a', '2026-07-10T11:00:00.000Z'),
        periodActive('fixture-setup-b', null),
      ],
      setupFallback: [
        { id: 'fixture-setup-a', installedAt: FIXTURE_INSTALL, removedAt: '2026-07-10T11:00:00.000Z', status: 'STORED' },
        { id: 'fixture-setup-b', installedAt: '2026-07-10T11:00:00.000Z', removedAt: null, status: 'ACTIVE' },
      ],
    },
    {
      tripId: 'fixture-boundary-overlap',
      vehicleId: 'fixture-vehicle-3',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-10T10:30:00.000Z',
      endTime: '2026-07-10T11:30:00.000Z',
      distanceKm: 30,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [
        periodActive('fixture-setup-a', '2026-07-10T11:00:00.000Z'),
        {
          tireSetupId: 'fixture-setup-b',
          installedAt: new Date('2026-07-10T11:00:00.000Z'),
          removedAt: null,
        },
      ],
    },
    {
      tripId: 'fixture-reprocessed',
      vehicleId: 'fixture-vehicle-1',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-09T08:00:00.000Z',
      endTime: '2026-07-09T09:00:00.000Z',
      distanceKm: 45,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      tireUsageAttributionStatus: 'APPLIED',
      mountPeriods: [periodActive('fixture-setup-active')],
      existingLedger: {
        tireSetupId: 'fixture-setup-active',
        sourceFingerprint: 'stale-fingerprint-not-matching',
        distanceKm: 40,
        invalidatedAt: null,
      },
      odometerStartKm: 9000,
      odometerEndKm: 9045,
    },
    {
      tripId: 'fixture-odometer-conflict',
      vehicleId: 'fixture-vehicle-4',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-08T14:00:00.000Z',
      endTime: '2026-07-08T15:00:00.000Z',
      distanceKm: 50,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [periodActive('fixture-setup-stored', '2026-07-20T00:00:00.000Z')],
      setupFallback: [
        { id: 'fixture-setup-stored', installedAt: FIXTURE_INSTALL, removedAt: '2026-07-20T00:00:00.000Z', status: 'STORED' },
      ],
      odometerStartKm: 12000,
      odometerEndKm: 12010,
      waypointPlausibilityKm: 48,
      waypointCount: 8,
    },
    {
      tripId: 'fixture-stored-setup',
      vehicleId: 'fixture-vehicle-4',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-07T09:00:00.000Z',
      endTime: '2026-07-07T10:00:00.000Z',
      distanceKm: 22,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [periodActive('fixture-setup-stored', '2026-07-20T00:00:00.000Z')],
      setupFallback: [
        { id: 'fixture-setup-stored', installedAt: FIXTURE_INSTALL, removedAt: '2026-07-20T00:00:00.000Z', status: 'STORED' },
      ],
      odometerStartKm: 11900,
      odometerEndKm: 11922,
    },
    {
      tripId: 'fixture-before-first-setup',
      vehicleId: 'fixture-vehicle-5',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-02-01T10:00:00.000Z',
      endTime: '2026-02-01T11:00:00.000Z',
      distanceKm: 15,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [periodActive('fixture-setup-future')],
    },
    {
      tripId: 'fixture-incomplete-history',
      vehicleId: 'fixture-vehicle-6',
      organizationId: 'fixture-org',
      tripStatus: 'COMPLETED',
      startTime: '2026-07-05T10:00:00.000Z',
      endTime: '2026-07-05T11:00:00.000Z',
      distanceKm: 12,
      tripAnalysisStatus: 'COMPLETED',
      analysisStagesJson: {
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      },
      mountPeriods: [],
      setupFallback: [{ id: 'fixture-setup-missing-install', installedAt: null, removedAt: null, status: 'ACTIVE' }],
    },
  ];
}

export function buildSyntheticTripUsageBackfillReport(auditSalt = TRIP_USAGE_BACKFILL_AUDIT_ID) {
  const fixtures = buildSyntheticTripUsageBackfillFixtures();
  const audited = fixtures.map((f) => auditTripBackfillCandidate(f, auditSalt));
  const setupRollups = buildSetupKmRollups({
    trips: audited,
    setups: [
      {
        setupId: 'fixture-setup-active',
        vehicleId: 'fixture-vehicle-1',
        status: 'ACTIVE',
        totalKmOnSet: 80,
        existingLedgerKm: 40,
      },
      {
        setupId: 'fixture-setup-stored',
        vehicleId: 'fixture-vehicle-4',
        status: 'STORED',
        totalKmOnSet: 22,
        existingLedgerKm: 0,
      },
    ],
    auditSalt,
  });
  const now = new Date();
  const from = new Date(now.getTime() - DEFAULT_BACKFILL_LOOKBACK_DAYS * 86_400_000);
  return auditTripUsageBackfill(fixtures, {
    mode: 'fixtures',
    auditSalt,
    filters: {
      organizationId: null,
      vehicleId: null,
      from: from.toISOString(),
      to: now.toISOString(),
      batchSize: 100,
      fullSetupHistory: true,
      lookbackDays: DEFAULT_BACKFILL_LOOKBACK_DAYS,
    },
    setupRollups,
  });
}
