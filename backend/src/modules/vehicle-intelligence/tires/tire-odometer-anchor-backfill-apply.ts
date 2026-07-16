import {
  TireOdometerAnchorSource,
  TireOdometerAnchorStatus,
  TireSetupStatus,
} from '@prisma/client';
import type { AnchorBackfillCandidateSource } from './tire-odometer-anchor-backfill-audit';
import {
  BACKFILL_CANDIDATE_VERSION,
  BACKFILL_SCHEMA_VERSION,
  computeManifestHash,
  type AnchorBackfillConfidenceClass,
  type SetupBackfillAuditResult,
} from './tire-odometer-anchor-backfill-audit';

export const DEFAULT_MAX_BATCH_SIZE = 25;
export const DEFAULT_RECALCULATE_MAX_VEHICLES = 10;

export interface BackfillApplyRequest {
  apply: boolean;
  organizationId?: string;
  setupIds?: string[];
  expectedCandidateVersion: string;
  expectedManifestHash?: string;
  confirmGitRef: string;
  confirmSchemaVersion: string;
  confirmBackup: boolean;
  operator: string;
  reason: string;
  maxBatchSize: number;
  applyMeasurementRequiredStatus?: boolean;
  recalculate?: boolean;
  recalculateMaxVehicles?: number;
}

export interface BackfillApplyPlanItem {
  setupId: string;
  vehicleId: string;
  organizationId: string | null;
  confidence: AnchorBackfillConfidenceClass;
  candidateHash: string;
  action:
    | 'APPLY_ANCHOR'
    | 'SET_MEASUREMENT_REQUIRED'
    | 'MANUAL_REVIEW'
    | 'SKIP_ALREADY_ANCHORED'
    | 'SKIP_INELIGIBLE'
    | 'SKIP_IDEMPOTENT';
  candidateOdometerKm: number | null;
  source: AnchorBackfillCandidateSource | null;
  candidateObservedAt: string | null;
  supportingSignals: string[];
  conflicts: string[];
  skipReason?: string;
}

export interface BackfillApplyPlan {
  dryRun: boolean;
  candidateVersion: string;
  manifestHash: string;
  autoApplicable: BackfillApplyPlanItem[];
  manualReview: BackfillApplyPlanItem[];
  measurementRequired: BackfillApplyPlanItem[];
  skipped: BackfillApplyPlanItem[];
}

export interface BackfillApplyResult {
  dryRun: boolean;
  applied: number;
  measurementRequiredStatusSet: number;
  skipped: number;
  manualReviewCount: number;
  auditLog: BackfillApplyAuditEntry[];
  recalculateVehicleIds: string[];
  errors: string[];
}

export interface BackfillApplyAuditEntry {
  at: string;
  setupId: string;
  vehicleId: string;
  action: string;
  candidateHash: string;
  operator: string;
  reason: string;
  details?: Record<string, unknown>;
}

const AUTO_APPLY_CONFIDENCE = new Set<AnchorBackfillConfidenceClass>([
  'EXACT',
  'HIGH_CONFIDENCE',
]);

const MANUAL_ONLY_CONFIDENCE = new Set<AnchorBackfillConfidenceClass>([
  'MEDIUM_CONFIDENCE',
  'LOW_CONFIDENCE',
  'CONFLICTING_DATA',
]);

const TERMINAL_SETUP_STATUSES = new Set<string>([
  TireSetupStatus.REMOVED,
  TireSetupStatus.RETIRED,
  TireSetupStatus.DISCARDED,
  TireSetupStatus.SOLD,
]);

export function isAutoApplicableConfidence(
  confidence: AnchorBackfillConfidenceClass,
): boolean {
  return AUTO_APPLY_CONFIDENCE.has(confidence);
}

export function mapBackfillSourceToAnchorSource(
  source: AnchorBackfillCandidateSource | null,
): TireOdometerAnchorSource {
  switch (source) {
    case 'DOCUMENTED_INSTALL_MEASUREMENT':
    case 'REGISTRATION_MEASUREMENT':
    case 'HANDOVER_PROTOCOL':
    case 'WORKSHOP_TIRE_DOCUMENT':
      return TireOdometerAnchorSource.DOCUMENTED;
    case 'DIMO_HISTORICAL':
      return TireOdometerAnchorSource.PROVIDER_DIMO;
    case 'HIGH_MOBILITY_HISTORICAL':
      return TireOdometerAnchorSource.PROVIDER_HIGH_MOBILITY;
    case 'SNAPSHOT_HISTORY':
      return TireOdometerAnchorSource.VEHICLE_LATEST_STATE;
    case 'TRIP_ODOMETER_BOUNDARY':
      return TireOdometerAnchorSource.HISTORICAL_INFERRED;
    default:
      return TireOdometerAnchorSource.UNKNOWN;
  }
}

export function mapConfidenceToAnchorScore(
  confidence: AnchorBackfillConfidenceClass,
): number {
  switch (confidence) {
    case 'EXACT':
      return 92;
    case 'HIGH_CONFIDENCE':
      return 88;
    case 'MEDIUM_CONFIDENCE':
      return 65;
    case 'LOW_CONFIDENCE':
      return 35;
    default:
      return 10;
  }
}

export function validateBackfillApplyRequest(
  request: BackfillApplyRequest,
  opts?: { actualGitRef?: string },
): void {
  if (!request.apply) return;

  if (!request.organizationId && (!request.setupIds || request.setupIds.length === 0)) {
    throw new Error('Apply requires --organization-id or explicit --setup-id selection.');
  }
  if (!request.expectedCandidateVersion) {
    throw new Error('Apply requires --expected-candidate-version.');
  }
  if (request.expectedCandidateVersion !== BACKFILL_CANDIDATE_VERSION) {
    throw new Error(
      `Candidate version mismatch: expected ${BACKFILL_CANDIDATE_VERSION}, got ${request.expectedCandidateVersion}`,
    );
  }
  if (!request.confirmGitRef?.trim()) {
    throw new Error('Apply requires --confirm-git-ref.');
  }
  if (opts?.actualGitRef && request.confirmGitRef.trim() !== opts.actualGitRef.trim()) {
    throw new Error('Git ref confirmation does not match current HEAD.');
  }
  if (request.confirmSchemaVersion !== BACKFILL_SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: expected ${BACKFILL_SCHEMA_VERSION}, got ${request.confirmSchemaVersion}`,
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
    const max = request.recalculateMaxVehicles ?? DEFAULT_RECALCULATE_MAX_VEHICLES;
    if (!Number.isFinite(max) || max < 1) {
      throw new Error('Recalculate requires --recalculate-max-vehicles > 0.');
    }
  }
}

export function planBackfillApply(args: {
  auditRows: SetupBackfillAuditResult[];
  request: BackfillApplyRequest;
  setupStatusById?: Record<string, string>;
  alreadyAnchoredSetupIds?: Set<string>;
  existingBackfillHashes?: Set<string>;
}): BackfillApplyPlan {
  const { auditRows, request } = args;
  const scoped = auditRows.filter((row) => {
    if (request.organizationId && row.organizationId !== request.organizationId) return false;
    if (request.setupIds?.length && !request.setupIds.includes(row.setupId)) return false;
    return true;
  });

  const manifestHash = computeManifestHash(
    scoped.map((r) => ({ setupId: r.setupId, candidateHash: r.candidateHash })),
  );

  if (
    request.apply &&
    request.expectedManifestHash &&
    request.expectedManifestHash !== manifestHash
  ) {
    throw new Error(
      `Manifest hash mismatch: expected ${request.expectedManifestHash}, computed ${manifestHash}`,
    );
  }

  const autoApplicable: BackfillApplyPlanItem[] = [];
  const manualReview: BackfillApplyPlanItem[] = [];
  const measurementRequired: BackfillApplyPlanItem[] = [];
  const skipped: BackfillApplyPlanItem[] = [];

  for (const row of scoped) {
    const status = args.setupStatusById?.[row.setupId] ?? 'ACTIVE';
    const base = {
      setupId: row.setupId,
      vehicleId: row.vehicleId,
      organizationId: row.organizationId,
      confidence: row.confidence,
      candidateHash: row.candidateHash,
      candidateOdometerKm: row.candidateOdometerKm,
      source: row.source,
      candidateObservedAt: row.candidateObservedAt,
      supportingSignals: row.supportingSignals,
      conflicts: row.conflicts,
    };

    if (TERMINAL_SETUP_STATUSES.has(status)) {
      skipped.push({
        ...base,
        action: 'SKIP_INELIGIBLE',
        skipReason: `terminal_setup_status_${status}`,
      });
      continue;
    }

    if (args.alreadyAnchoredSetupIds?.has(row.setupId)) {
      skipped.push({
        ...base,
        action: 'SKIP_ALREADY_ANCHORED',
        skipReason: 'setup_already_has_traceable_anchor',
      });
      continue;
    }

    if (args.existingBackfillHashes?.has(`${row.setupId}:${row.candidateHash}`)) {
      skipped.push({
        ...base,
        action: 'SKIP_IDEMPOTENT',
        skipReason: 'candidate_hash_already_applied',
      });
      continue;
    }

    if (row.confidence === 'NO_SAFE_CANDIDATE') {
      if (request.applyMeasurementRequiredStatus) {
        measurementRequired.push({ ...base, action: 'SET_MEASUREMENT_REQUIRED' });
      } else {
        manualReview.push({ ...base, action: 'MANUAL_REVIEW' });
      }
      continue;
    }

    if (MANUAL_ONLY_CONFIDENCE.has(row.confidence)) {
      manualReview.push({ ...base, action: 'MANUAL_REVIEW' });
      continue;
    }

    if (isAutoApplicableConfidence(row.confidence)) {
      autoApplicable.push({ ...base, action: 'APPLY_ANCHOR' });
      continue;
    }

    manualReview.push({ ...base, action: 'MANUAL_REVIEW' });
  }

  const plannedWrites = [
    ...autoApplicable,
    ...(request.applyMeasurementRequiredStatus ? measurementRequired : []),
  ];
  if (request.apply && plannedWrites.length > request.maxBatchSize) {
    throw new Error(
      `Batch limit exceeded: ${plannedWrites.length} planned writes > max ${request.maxBatchSize}`,
    );
  }

  return {
    dryRun: !request.apply,
    candidateVersion: BACKFILL_CANDIDATE_VERSION,
    manifestHash,
    autoApplicable,
    manualReview,
    measurementRequired,
    skipped,
  };
}

export function buildBackfillEventPayload(args: {
  item: BackfillApplyPlanItem;
  operator: string;
  reason: string;
  auditLog: BackfillApplyAuditEntry[];
}): Record<string, unknown> {
  return {
    command: 'odometerAnchorBackfill',
    candidateHash: args.item.candidateHash,
    candidateOdometerKm: args.item.candidateOdometerKm,
    candidateSource: args.item.source,
    candidateObservedAt: args.item.candidateObservedAt,
    confidence: args.item.confidence,
    supportingSignals: args.item.supportingSignals,
    conflicts: args.item.conflicts,
    candidateEvidenceSummary: {
      source: args.item.source,
      observedAt: args.item.candidateObservedAt,
      odometerKm: args.item.candidateOdometerKm,
      signals: args.item.supportingSignals,
    },
    operator: args.operator,
    reason: args.reason,
    auditLog: args.auditLog,
  };
}

export function buildAnchorApplyUpdate(item: BackfillApplyPlanItem): {
  installedOdometerKm: number;
  installedOdometerSource: TireOdometerAnchorSource;
  installedOdometerCapturedAt: Date;
  odometerAnchorStatus: TireOdometerAnchorStatus;
  odometerAnchorConfidence: number;
} {
  if (item.candidateOdometerKm == null || item.source == null) {
    throw new Error(`Setup ${item.setupId} missing candidate odometer for anchor apply.`);
  }
  return {
    installedOdometerKm: item.candidateOdometerKm,
    installedOdometerSource: mapBackfillSourceToAnchorSource(item.source),
    installedOdometerCapturedAt: new Date(item.candidateObservedAt ?? new Date().toISOString()),
    odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
    odometerAnchorConfidence: mapConfidenceToAnchorScore(item.confidence),
  };
}

export function buildMeasurementRequiredUpdate(): {
  installedOdometerKm: null;
  installedOdometerSource: null;
  installedOdometerCapturedAt: null;
  odometerAnchorStatus: TireOdometerAnchorStatus;
  odometerAnchorConfidence: number;
} {
  return {
    installedOdometerKm: null,
    installedOdometerSource: null,
    installedOdometerCapturedAt: null,
    odometerAnchorStatus: TireOdometerAnchorStatus.MEASUREMENT_REQUIRED,
    odometerAnchorConfidence: 10,
  };
}
