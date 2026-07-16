import {
  computeTripUsageBackfillReportHash,
  TRIP_USAGE_BACKFILL_AUDIT_VERSION,
  TRIP_USAGE_BACKFILL_SCHEMA_VERSION,
  type TripBackfillAuditResult,
  type TripUsageBackfillAttributionClass,
} from './tire-trip-usage-backfill-audit';

export const DEFAULT_MAX_BACKFILL_BATCH_SIZE = 50;
export const DEFAULT_RECALCULATE_MAX_SETUPS = 10;

export interface TripUsageBackfillApplyRequest {
  apply: boolean;
  organizationId?: string;
  vehicleId?: string;
  tripIds?: string[];
  expectedAuditVersion: string;
  expectedReportHash?: string;
  confirmGitRef: string;
  confirmSchemaVersion: string;
  confirmBackup: boolean;
  operator: string;
  reason: string;
  maxBatchSize: number;
  recalculate?: boolean;
  recalculateMaxSetups?: number;
}

export type TripUsageBackfillPlanAction =
  | 'APPLY_LEDGER'
  | 'MANUAL_REVIEW'
  | 'SKIP_IDEMPOTENT'
  | 'SKIP_INELIGIBLE';

export interface TripUsageBackfillPlanItem {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  tireSetupId: string | null;
  attributionClass: TripUsageBackfillAttributionClass;
  projectedFingerprint: string | null;
  attributableKm: number;
  action: TripUsageBackfillPlanAction;
  skipReason?: string;
  reviewReasons: string[];
}

export interface TripUsageBackfillApplyPlan {
  dryRun: boolean;
  auditVersion: string;
  reportHash: string;
  autoApplicable: TripUsageBackfillPlanItem[];
  manualReview: TripUsageBackfillPlanItem[];
  skipped: TripUsageBackfillPlanItem[];
}

export interface TripUsageBackfillApplyAuditEntry {
  at: string;
  tripId: string;
  vehicleId: string;
  tireSetupId: string | null;
  action: string;
  operator: string;
  reason: string;
  attributionStatus?: string;
  ledgerAction?: string;
  details?: Record<string, unknown>;
}

export interface TripUsageBackfillApplyResult {
  dryRun: boolean;
  applied: number;
  unchanged: number;
  skipped: number;
  manualReviewCount: number;
  failed: number;
  auditLog: TripUsageBackfillApplyAuditEntry[];
  reconciledSetupIds: string[];
  recalculatedVehicleIds: string[];
  errors: string[];
}

const CONFLICT_CLASSES = new Set<TripUsageBackfillAttributionClass>([
  'MULTIPLE_SETUPS',
  'SETUP_CHANGE_IN_TRIP',
  'INCOMPLETE_HISTORY',
  'NO_SETUP',
  'TRIP_BEFORE_FIRST_SETUP',
  'TRIP_AFTER_SETUP_REMOVAL',
]);

const INELIGIBLE_CLASSES = new Set<TripUsageBackfillAttributionClass>([
  'SKIPPED_NOT_FINAL',
  'SKIPPED_NO_DISTANCE',
  'SKIPPED_NOT_COMPLETED',
  'SKIPPED_CANCELLED',
  'SKIPPED_MERGED',
]);

export function isAutoApplicableTrip(row: TripBackfillAuditResult): boolean {
  if (row.attributionClass !== 'SINGLE_SETUP') return false;
  if (!row.eligibleForLedger) return false;
  if (!row.attributedSetupId) return false;
  if (!row.projectedFingerprint) return false;
  if (row.distance.odometerConflict) return false;
  return true;
}

export function validateTripUsageBackfillApplyRequest(
  request: TripUsageBackfillApplyRequest,
  opts?: { actualGitRef?: string },
): void {
  if (!request.apply) return;

  if (!request.organizationId && !request.vehicleId && (!request.tripIds || request.tripIds.length === 0)) {
    throw new Error('Apply requires --organization-id, --vehicle-id, or explicit --trip-id selection.');
  }
  if (!request.expectedAuditVersion) {
    throw new Error('Apply requires --expected-audit-version.');
  }
  if (request.expectedAuditVersion !== TRIP_USAGE_BACKFILL_AUDIT_VERSION) {
    throw new Error(
      `Audit version mismatch: expected ${TRIP_USAGE_BACKFILL_AUDIT_VERSION}, got ${request.expectedAuditVersion}`,
    );
  }
  if (!request.confirmGitRef?.trim()) {
    throw new Error('Apply requires --confirm-git-ref.');
  }
  if (opts?.actualGitRef && request.confirmGitRef.trim() !== opts.actualGitRef.trim()) {
    throw new Error('Git ref confirmation does not match current HEAD.');
  }
  if (request.confirmSchemaVersion !== TRIP_USAGE_BACKFILL_SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: expected ${TRIP_USAGE_BACKFILL_SCHEMA_VERSION}, got ${request.confirmSchemaVersion}`,
    );
  }
  if (!request.confirmBackup) {
    throw new Error('Apply requires --confirm-backup.');
  }
  if (!request.operator?.trim()) {
    throw new Error('Apply requires --operator.');
  }
  if (!request.reason?.trim()) {
    throw new Error('Apply requires --reason.');
  }
  if (!Number.isFinite(request.maxBatchSize) || request.maxBatchSize < 1) {
    throw new Error('Apply requires --max-batch-size > 0.');
  }
  if (request.recalculate) {
    const max = request.recalculateMaxSetups ?? DEFAULT_RECALCULATE_MAX_SETUPS;
    if (!Number.isFinite(max) || max < 1) {
      throw new Error('Recalculate requires --recalculate-max-setups > 0.');
    }
  }
}

export function planTripUsageBackfillApply(args: {
  auditTrips: TripBackfillAuditResult[];
  request: TripUsageBackfillApplyRequest;
  alreadyAppliedFingerprints?: Set<string>;
}): TripUsageBackfillApplyPlan {
  const { auditTrips, request } = args;

  const scoped = auditTrips.filter((row) => {
    if (request.organizationId && row.organizationId !== request.organizationId) return false;
    if (request.vehicleId && row.vehicleId !== request.vehicleId) return false;
    if (request.tripIds?.length && !request.tripIds.includes(row.tripId)) return false;
    return true;
  });

  const reportHash = computeTripUsageBackfillReportHash(scoped);

  if (request.apply && request.expectedReportHash && request.expectedReportHash !== reportHash) {
    throw new Error(
      `Report hash mismatch: expected ${request.expectedReportHash}, computed ${reportHash}`,
    );
  }

  const autoApplicable: TripUsageBackfillPlanItem[] = [];
  const manualReview: TripUsageBackfillPlanItem[] = [];
  const skipped: TripUsageBackfillPlanItem[] = [];

  for (const row of scoped) {
    const base: Omit<TripUsageBackfillPlanItem, 'action' | 'skipReason' | 'reviewReasons'> = {
      tripId: row.tripId,
      vehicleId: row.vehicleId,
      organizationId: row.organizationId,
      tireSetupId: row.attributedSetupId,
      attributionClass: row.attributionClass,
      projectedFingerprint: row.projectedFingerprint,
      attributableKm: row.attributableKm,
    };

    const fingerprintKey =
      row.attributedSetupId && row.projectedFingerprint
        ? `${row.tripId}:${row.attributedSetupId}:${row.projectedFingerprint}`
        : null;

    if (CONFLICT_CLASSES.has(row.attributionClass)) {
      manualReview.push({
        ...base,
        action: 'MANUAL_REVIEW',
        reviewReasons: [row.attributionClass, ...row.notes],
      });
      continue;
    }

    if (INELIGIBLE_CLASSES.has(row.attributionClass) || !row.eligibleForLedger) {
      skipped.push({
        ...base,
        action: 'SKIP_INELIGIBLE',
        skipReason: row.attributionClass,
        reviewReasons: [],
      });
      continue;
    }

    if (row.distance.odometerConflict) {
      manualReview.push({
        ...base,
        action: 'MANUAL_REVIEW',
        reviewReasons: ['odometer_conflict', ...row.distance.notes],
      });
      continue;
    }

    if (row.reprocessingPattern === 'INVALIDATED_LEDGER_PRESENT') {
      manualReview.push({
        ...base,
        action: 'MANUAL_REVIEW',
        reviewReasons: ['invalidated_ledger_present'],
      });
      continue;
    }

    if (
      row.potentialDuplicate ||
      row.reprocessingPattern === 'LEDGER_EXISTS_UNCHANGED' ||
      (fingerprintKey && args.alreadyAppliedFingerprints?.has(fingerprintKey))
    ) {
      skipped.push({
        ...base,
        action: 'SKIP_IDEMPOTENT',
        skipReason: 'ledger_fingerprint_unchanged',
        reviewReasons: [],
      });
      continue;
    }

    if (isAutoApplicableTrip(row)) {
      autoApplicable.push({
        ...base,
        action: 'APPLY_LEDGER',
        reviewReasons: [],
      });
      continue;
    }

    manualReview.push({
      ...base,
      action: 'MANUAL_REVIEW',
      reviewReasons: [row.recommendedAction, ...row.notes],
    });
  }

  const limitedAuto = autoApplicable.slice(0, request.maxBatchSize);
  const overflowManual = autoApplicable.slice(request.maxBatchSize).map((item) => ({
    ...item,
    action: 'MANUAL_REVIEW' as const,
    reviewReasons: ['exceeds_max_batch_size'],
  }));

  return {
    dryRun: !request.apply,
    auditVersion: TRIP_USAGE_BACKFILL_AUDIT_VERSION,
    reportHash,
    autoApplicable: limitedAuto,
    manualReview: [...manualReview, ...overflowManual],
    skipped,
  };
}

export function buildBackfillApplyAuditEntry(args: {
  tripId: string;
  vehicleId: string;
  tireSetupId: string | null;
  action: string;
  operator: string;
  reason: string;
  attributionStatus?: string;
  ledgerAction?: string;
  details?: Record<string, unknown>;
}): TripUsageBackfillApplyAuditEntry {
  return {
    at: new Date().toISOString(),
    tripId: args.tripId,
    vehicleId: args.vehicleId,
    tireSetupId: args.tireSetupId,
    action: args.action,
    operator: args.operator,
    reason: args.reason,
    attributionStatus: args.attributionStatus,
    ledgerAction: args.ledgerAction,
    details: args.details,
  };
}
