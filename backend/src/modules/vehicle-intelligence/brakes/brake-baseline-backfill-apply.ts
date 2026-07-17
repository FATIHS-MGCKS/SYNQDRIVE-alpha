import { createHash } from 'crypto';
import { BrakeComponentInstallationType } from '@prisma/client';
import {
  auditComponentBaseline,
  auditVehicleBrakeBaseline,
  analyzeOdometerAnchor,
  BRAKE_BASELINE_BACKFILL_SCHEMA_VERSION,
  BRAKE_BASELINE_CANDIDATE_VERSION,
  type BrakeBaselineCandidateClass,
  type BrakeBaselineCandidateSource,
  type BrakeBaselineComponent,
  type BrakeBaselineConfidence,
  type BrakeThicknessSignal,
  type VehicleBrakeBaselineAuditInput,
} from './brake-baseline-candidate-audit';
import { componentToLifecycleScope } from './brake-component-lifecycle.scope';

export const DEFAULT_MAX_BRAKE_BASELINE_BATCH_SIZE = 25;
export const DEFAULT_RECALCULATE_MAX_VEHICLES = 10;

export interface BrakeBaselineBackfillApplyRequest {
  apply: boolean;
  organizationId?: string;
  vehicleId?: string;
  components?: BrakeBaselineComponent[];
  expectedAuditVersion: string;
  expectedReportHash?: string;
  confirmGitRef: string;
  confirmSchemaVersion: string;
  confirmBackup: boolean;
  operator: string;
  reason: string;
  maxBatchSize: number;
  recalculate?: boolean;
  recalculateMaxVehicles?: number;
}

export type BrakeBaselineBackfillPlanAction =
  | 'APPLY_BASELINE'
  | 'MANUAL_REVIEW'
  | 'SKIP_IDEMPOTENT'
  | 'SKIP_INELIGIBLE';

export interface BrakeBaselineApplyAuditRow {
  vehicleId: string;
  organizationId: string | null;
  component: BrakeBaselineComponent;
  candidateClass: BrakeBaselineCandidateClass;
  source: BrakeBaselineCandidateSource | null;
  thicknessMm: number | null;
  timestamp: string | null;
  odometerKm: number | null;
  confidence: BrakeBaselineConfidence;
  conflicts: string[];
  autoApplicable: boolean;
  rawRefId: string | null;
  referenceSpecPresent: boolean;
  idempotencyFingerprint: string;
  uncertainState?: 'UNKNOWN_HISTORY' | 'MEASUREMENT_REQUIRED';
}

export interface BrakeBaselineBackfillPlanItem {
  vehicleId: string;
  organizationId: string | null;
  component: BrakeBaselineComponent;
  candidateClass: BrakeBaselineCandidateClass;
  source: BrakeBaselineCandidateSource | null;
  thicknessMm: number | null;
  timestamp: string | null;
  odometerKm: number | null;
  confidence: BrakeBaselineConfidence;
  action: BrakeBaselineBackfillPlanAction;
  skipReason?: string;
  reviewReasons: string[];
  idempotencyFingerprint: string;
  rawRefId: string | null;
  lifecycleOperation: 'register_measured' | 'register_documented' | null;
}

export interface BrakeBaselineBackfillApplyPlan {
  dryRun: boolean;
  auditVersion: string;
  reportHash: string;
  autoApplicable: BrakeBaselineBackfillPlanItem[];
  manualReview: BrakeBaselineBackfillPlanItem[];
  skipped: BrakeBaselineBackfillPlanItem[];
}

export interface BrakeBaselineBackfillApplyAuditEntry {
  at: string;
  vehicleId: string;
  organizationId: string | null;
  component: BrakeBaselineComponent;
  action: string;
  operator: string;
  reason: string;
  lifecycleOperation?: string;
  installationId?: string;
  serviceEventId?: string;
  details?: Record<string, unknown>;
}

export interface BrakeBaselineBackfillApplyResult {
  dryRun: boolean;
  applied: number;
  unchanged: number;
  skipped: number;
  manualReviewCount: number;
  failed: number;
  auditLog: BrakeBaselineBackfillApplyAuditEntry[];
  recalculatedVehicleIds: string[];
  errors: string[];
}

const NON_AUTO_CLASSES = new Set<BrakeBaselineCandidateClass>([
  'SPEC_ONLY',
  'REGISTRATION_ASSERTION_ONLY',
  'CONFLICTING_DATA',
  'NO_SAFE_BASELINE',
]);

const AUTO_CLASSES = new Set<BrakeBaselineCandidateClass>([
  'EXACT_MEASURED',
  'CONFIRMED_REPLACEMENT',
  'HIGH_CONFIDENCE_DOCUMENTED',
]);

export function buildBrakeBaselineApplyAuditRows(
  inputs: VehicleBrakeBaselineAuditInput[],
  auditSalt: string,
): BrakeBaselineApplyAuditRow[] {
  const rows: BrakeBaselineApplyAuditRow[] = [];

  for (const input of inputs) {
    const vehicle = auditVehicleBrakeBaseline(input, auditSalt);
    if (!vehicle) continue;

    const baselineTimestamp =
      input.brakeHealthCurrent?.anchorServiceDate ??
      input.referenceSpec?.createdAt ??
      input.registeredAt;
    const odometerAnchor = analyzeOdometerAnchor(input, baselineTimestamp);

    for (const component of vehicle.components) {
      const winningSignal = findWinningSignal(input, component.component, component.candidateClass);
      const fingerprint = buildComponentIdempotencyFingerprint({
        vehicleId: input.vehicleId,
        component: component.component,
        candidateClass: component.candidateClass,
        thicknessMm: component.thicknessMm,
        timestamp: component.timestamp,
        odometerKm: component.odometerKm,
        source: component.source,
        rawRefId: winningSignal?.rawRefId ?? null,
      });

      rows.push({
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        component: component.component,
        candidateClass: component.candidateClass,
        source: component.source,
        thicknessMm: component.thicknessMm,
        timestamp: component.timestamp,
        odometerKm: component.odometerKm,
        confidence: component.confidence,
        conflicts: component.conflicts,
        autoApplicable: component.autoApplicable,
        rawRefId: winningSignal?.rawRefId ?? null,
        referenceSpecPresent: input.referenceSpec != null,
        idempotencyFingerprint: fingerprint,
        uncertainState: uncertainStateFor(component.candidateClass, component.thicknessMm),
      });
    }
  }

  return rows;
}

export function computeBrakeBaselineReportHash(
  rows: Array<Pick<BrakeBaselineApplyAuditRow, 'vehicleId' | 'component' | 'autoApplicable' | 'idempotencyFingerprint'>>,
): string {
  const applicable = rows
    .filter((row) => row.autoApplicable)
    .sort((a, b) =>
      `${a.vehicleId}:${a.component}`.localeCompare(`${b.vehicleId}:${b.component}`),
    )
    .map((row) => `${row.vehicleId}:${row.component}:${row.idempotencyFingerprint}`)
    .join('|');
  return createHash('sha256').update(applicable).digest('hex').slice(0, 16);
}

export function isAutoApplicableBrakeBaselineRow(row: BrakeBaselineApplyAuditRow): boolean {
  if (!row.autoApplicable) return false;
  if (!AUTO_CLASSES.has(row.candidateClass)) return false;
  if (NON_AUTO_CLASSES.has(row.candidateClass)) return false;
  if (row.source === 'BHC_EXISTING_ANCHOR') return false;
  if (row.candidateClass === 'EXACT_MEASURED' && row.thicknessMm == null) return false;
  if (row.odometerKm == null) return false;
  if (row.timestamp == null) return false;
  if (row.conflicts.some((c) => c.includes('odometer_spread') || c.includes('odometer_rollback'))) {
    return false;
  }
  return true;
}

export function validateBrakeBaselineBackfillApplyRequest(
  request: BrakeBaselineBackfillApplyRequest,
  opts?: { actualGitRef?: string },
): void {
  if (!request.apply) return;

  if (!request.organizationId && !request.vehicleId) {
    throw new Error('Apply requires --organization-id or explicit --vehicle-id selection.');
  }
  if (!request.expectedAuditVersion) {
    throw new Error('Apply requires --expected-audit-version.');
  }
  if (request.expectedAuditVersion !== BRAKE_BASELINE_CANDIDATE_VERSION) {
    throw new Error(
      `Audit version mismatch: expected ${BRAKE_BASELINE_CANDIDATE_VERSION}, got ${request.expectedAuditVersion}`,
    );
  }
  if (!request.confirmGitRef?.trim()) {
    throw new Error('Apply requires --confirm-git-ref.');
  }
  if (opts?.actualGitRef && request.confirmGitRef.trim() !== opts.actualGitRef.trim()) {
    throw new Error('Git ref confirmation does not match current HEAD.');
  }
  if (request.confirmSchemaVersion !== BRAKE_BASELINE_BACKFILL_SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: expected ${BRAKE_BASELINE_BACKFILL_SCHEMA_VERSION}, got ${request.confirmSchemaVersion}`,
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

export function planBrakeBaselineBackfillApply(args: {
  auditRows: BrakeBaselineApplyAuditRow[];
  request: BrakeBaselineBackfillApplyRequest;
  alreadyAppliedFingerprints?: Set<string>;
  existingInstallationFingerprints?: Set<string>;
}): BrakeBaselineBackfillApplyPlan {
  const { auditRows, request } = args;

  const scoped = auditRows.filter((row) => {
    if (request.organizationId && row.organizationId !== request.organizationId) return false;
    if (request.vehicleId && row.vehicleId !== request.vehicleId) return false;
    if (request.components?.length && !request.components.includes(row.component)) return false;
    return true;
  });

  const reportHash = computeBrakeBaselineReportHash(scoped);

  if (request.apply && request.expectedReportHash && request.expectedReportHash !== reportHash) {
    throw new Error(
      `Report hash mismatch: expected ${request.expectedReportHash}, computed ${reportHash}`,
    );
  }

  const autoApplicable: BrakeBaselineBackfillPlanItem[] = [];
  const manualReview: BrakeBaselineBackfillPlanItem[] = [];
  const skipped: BrakeBaselineBackfillPlanItem[] = [];

  for (const row of scoped) {
    const base = toPlanItemBase(row);

    if (NON_AUTO_CLASSES.has(row.candidateClass)) {
      manualReview.push({
        ...base,
        action: 'MANUAL_REVIEW',
        reviewReasons: [
          row.uncertainState ?? row.candidateClass,
          ...row.conflicts,
        ],
      });
      continue;
    }

    if (row.source === 'BHC_EXISTING_ANCHOR') {
      skipped.push({
        ...base,
        action: 'SKIP_INELIGIBLE',
        skipReason: 'bhc_existing_anchor_not_blindly_adopted',
        reviewReasons: [],
      });
      continue;
    }

    if (
      args.alreadyAppliedFingerprints?.has(row.idempotencyFingerprint) ||
      args.existingInstallationFingerprints?.has(row.idempotencyFingerprint)
    ) {
      skipped.push({
        ...base,
        action: 'SKIP_IDEMPOTENT',
        skipReason: 'baseline_fingerprint_unchanged',
        reviewReasons: [],
      });
      continue;
    }

    if (!isAutoApplicableBrakeBaselineRow(row)) {
      if (row.candidateClass === 'NO_SAFE_BASELINE' || row.thicknessMm == null) {
        manualReview.push({
          ...base,
          action: 'MANUAL_REVIEW',
          reviewReasons: [
            row.uncertainState ?? 'MEASUREMENT_REQUIRED',
            'no_invented_historical_thickness',
          ],
        });
      } else {
        manualReview.push({
          ...base,
          action: 'MANUAL_REVIEW',
          reviewReasons: [row.candidateClass, ...row.conflicts],
        });
      }
      continue;
    }

    autoApplicable.push({
      ...base,
      action: 'APPLY_BASELINE',
      lifecycleOperation: lifecycleOperationFor(row.candidateClass),
      reviewReasons: [],
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
    auditVersion: BRAKE_BASELINE_CANDIDATE_VERSION,
    reportHash,
    autoApplicable: limitedAuto,
    manualReview: [...manualReview, ...overflowManual],
    skipped,
  };
}

export function buildBackfillApplyAuditEntry(args: {
  vehicleId: string;
  organizationId: string | null;
  component: BrakeBaselineComponent;
  action: string;
  operator: string;
  reason: string;
  lifecycleOperation?: string;
  installationId?: string;
  serviceEventId?: string;
  details?: Record<string, unknown>;
}): BrakeBaselineBackfillApplyAuditEntry {
  return {
    at: new Date().toISOString(),
    vehicleId: args.vehicleId,
    organizationId: args.organizationId,
    component: args.component,
    action: args.action,
    operator: args.operator,
    reason: args.reason,
    lifecycleOperation: args.lifecycleOperation,
    installationId: args.installationId,
    serviceEventId: args.serviceEventId,
    details: args.details,
  };
}

export function buildBrakeBaselineBackfillIdempotencyKey(fingerprint: string): string {
  return `brake-baseline-backfill:${fingerprint}`;
}

export function componentTypeFromBaseline(
  component: BrakeBaselineComponent,
): BrakeComponentInstallationType {
  return component as BrakeComponentInstallationType;
}

export function scopeForBaselineComponent(component: BrakeBaselineComponent) {
  return [componentToLifecycleScope(componentTypeFromBaseline(component))];
}

function toPlanItemBase(
  row: BrakeBaselineApplyAuditRow,
): Omit<BrakeBaselineBackfillPlanItem, 'action' | 'skipReason' | 'reviewReasons'> {
  return {
    vehicleId: row.vehicleId,
    organizationId: row.organizationId,
    component: row.component,
    candidateClass: row.candidateClass,
    source: row.source,
    thicknessMm: row.thicknessMm,
    timestamp: row.timestamp,
    odometerKm: row.odometerKm,
    confidence: row.confidence,
    idempotencyFingerprint: row.idempotencyFingerprint,
    rawRefId: row.rawRefId,
    lifecycleOperation: null,
  };
}

function lifecycleOperationFor(
  candidateClass: BrakeBaselineCandidateClass,
): 'register_measured' | 'register_documented' {
  if (candidateClass === 'EXACT_MEASURED') return 'register_measured';
  return 'register_documented';
}

function uncertainStateFor(
  candidateClass: BrakeBaselineCandidateClass,
  thicknessMm: number | null,
): 'UNKNOWN_HISTORY' | 'MEASUREMENT_REQUIRED' | undefined {
  if (candidateClass === 'NO_SAFE_BASELINE') return 'UNKNOWN_HISTORY';
  if (
    candidateClass === 'SPEC_ONLY' ||
    candidateClass === 'REGISTRATION_ASSERTION_ONLY' ||
    thicknessMm == null
  ) {
    return 'MEASUREMENT_REQUIRED';
  }
  return undefined;
}

export function buildComponentIdempotencyFingerprint(args: {
  vehicleId: string;
  component: BrakeBaselineComponent;
  candidateClass: BrakeBaselineCandidateClass;
  thicknessMm: number | null;
  timestamp: string | null;
  odometerKm: number | null;
  source: BrakeBaselineCandidateSource | null;
  rawRefId: string | null;
}): string {
  const payload = [
    args.vehicleId,
    args.component,
    args.candidateClass,
    args.thicknessMm ?? 'null',
    args.timestamp ?? 'null',
    args.odometerKm ?? 'null',
    args.source ?? 'null',
    args.rawRefId ?? 'null',
  ].join(':');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function findWinningSignal(
  input: VehicleBrakeBaselineAuditInput,
  component: BrakeBaselineComponent,
  candidateClass: BrakeBaselineCandidateClass,
): BrakeThicknessSignal | null {
  const baselineTimestamp =
    input.brakeHealthCurrent?.anchorServiceDate ??
    input.referenceSpec?.createdAt ??
    input.registeredAt;
  const audited = auditComponentBaseline(
    input,
    component,
    analyzeOdometerAnchor(input, baselineTimestamp),
  );

  const signals = input.thicknessSignals.filter((s) => s.component === component);
  if (signals.length === 0) return null;

  switch (candidateClass) {
    case 'EXACT_MEASURED':
      return (
        signals.find(
          (s) =>
            (s.source === 'BRAKE_EVIDENCE_MEASUREMENT' || s.source === 'SERVICE_EVENT_MEASUREMENT') &&
            s.thicknessMm === audited.thicknessMm,
        ) ?? signals[0]
      );
    case 'CONFIRMED_REPLACEMENT':
      return (
        signals.find((s) => s.source === 'SERVICE_EVENT_REPLACEMENT' || s.isDocumentedReplacement) ??
        null
      );
    case 'HIGH_CONFIDENCE_DOCUMENTED':
      return (
        signals.find(
          (s) =>
            (s.source === 'AI_DOCUMENT_CONFIRMED' || s.source === 'WORKSHOP_DOCUMENT_CONFIRMED') &&
            s.confidence === 'HIGH',
        ) ?? null
      );
    default:
      return signals[0] ?? null;
  }
}
