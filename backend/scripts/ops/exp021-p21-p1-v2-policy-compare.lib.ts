import { DI_V0_SPEED_QC_POLICY_V1, DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_SPEED_QC_REASON } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-reason-codes';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import type { DiV0SpeedQcIntervalVerdict } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';

export {
  EXP021_P21_MULTI_TRIP_SELECTION_RULE_V1,
  EXP021_P21_REFERENCE_TRIP_EXCLUDED,
  type P21InventoryRow,
  durationBucket,
  selectTripsForMultiCompare,
  tripUtcDateLabel,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/exp021-p21-p1-v2-multi-trip-selection';

/** Merged main SHA where V2 QC policy shipped (#2021). */
export const EXP021_P1_V2_POLICY_IMPLEMENTATION_SHA =
  'f7a285b59fd1f70e57b5fd72c04406286e1b96f1' as const;

const DISALLOWED_CENTER_PS = new Set(['FROZEN_UNRESOLVED', 'RELEASE']);

const SUPPORT_COMPROMISED_FLAGS = new Set([
  'L3_SUPPORT_CROSSES_GAP',
  'L3_SUPPORT_CROSSES_HOLD',
  'L3_SUPPORT_CROSSES_RELEASE',
  'L3_SUPPORT_DUPLICATE_BUCKET_LABEL',
  'L3_SUPPORT_NONPOSITIVE_TIME_DELTA',
]);

function shadowToQc(row: DiV0TripSpeedQualityShadowRow, center: string) {
  return {
    intervalStart: center,
    intervalEnd: center,
    referenceTime: center,
    estimatedSpeedKmh: row.estimatedSpeedKmh,
    speedEvidenceState: (row.speedEvidenceState ?? 'NONE') as 'NONE',
    valueConfidence: row.valueConfidence as 'HIGH',
    sourceRelation: row.sourceRelation as never,
    motionState: row.motionState as never,
    positionState: row.positionState as never,
    abstentionReason: row.abstentionReason as never,
    sourceQualityFlags: Array.isArray(row.sourceQualityFlags) ? row.sourceQualityFlags.map(String) : [],
    evidenceSources: [],
  };
}

export function isStationaryBandCandidate(row: DiV0TripSpeedQualityShadowRow): boolean {
  return row.motionState === 'STATIONARY_SUPPORTED' && row.speedEvidenceState === 'STATIONARY_BAND';
}

/** Allowed V2-only change path: null S1 speed + stationary band semantics. */
export function isContractualStationaryNullPath(row: DiV0TripSpeedQualityShadowRow): boolean {
  return isStationaryBandCandidate(row) && row.estimatedSpeedKmh === null;
}

function finiteTrustedSpeed(speed: number | null): number | null {
  if (speed == null || !Number.isFinite(speed)) return null;
  return speed;
}

export type IntervalViolation = {
  tripId: string;
  referenceTime: string;
  kind: string;
  detail: string;
};

export type IntervalAuditCounters = {
  stationaryCandidates: number;
  contractualNullPathIntervals: number;
  v2StationaryAccepted: number;
  v2StationaryWithheld: number;
  withheldReasonBreakdown: Record<string, number>;
  nullToZeroConversions: number;
  changesOutsideAllowedPath: number;
  intervalwiseQcSpeedMismatches: number;
  acceptanceContractViolations: number;
  releaseFrozenIntervalsObserved: number;
  releaseFrozenV2Accepted: number;
};

export type IntervalAuditInput = {
  tripId: string;
  referenceTime: string;
  row: DiV0TripSpeedQualityShadowRow;
  v1: DiV0SpeedQcIntervalVerdict;
  v2: DiV0SpeedQcIntervalVerdict;
};

/**
 * Interval-level V1/V2 regression contract (no second QC engine).
 */
export function auditP21V1V2Interval(input: IntervalAuditInput): {
  violations: IntervalViolation[];
  counters: Partial<IntervalAuditCounters>;
} {
  const { tripId, referenceTime, row, v1, v2 } = input;
  const violations: IntervalViolation[] = [];
  const counters: Partial<IntervalAuditCounters> = {};

  const push = (kind: string, detail: string) => {
    violations.push({ tripId, referenceTime, kind, detail });
  };

  const v1Fin = finiteTrustedSpeed(v1.qcTrustedSpeedKmh);
  const v2Fin = finiteTrustedSpeed(v2.qcTrustedSpeedKmh);
  const shadowSpeed = row.estimatedSpeedKmh;

  if (v1.qcTrustedSpeedKmh === 0 && shadowSpeed == null) {
    push('V1_NULL_TO_ZERO', 'v1 qcTrustedSpeedKmh=0 with null shadow estimatedSpeedKmh');
  }
  if (v2.qcTrustedSpeedKmh === 0 && shadowSpeed == null) {
    counters.nullToZeroConversions = 1;
    push('NULL_TO_ZERO', 'v2 qcTrustedSpeedKmh=0 with null shadow estimatedSpeedKmh');
  }

  const bandCandidate = isStationaryBandCandidate(row);
  const nullPath = isContractualStationaryNullPath(row);

  if (bandCandidate) counters.stationaryCandidates = 1;
  if (nullPath) counters.contractualNullPathIntervals = 1;

  if (row.positionState === 'FROZEN_UNRESOLVED' || row.positionState === 'RELEASE') {
    counters.releaseFrozenIntervalsObserved = 1;
  }

  const v2Accepted = v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED);
  if (v2Accepted) {
    counters.v2StationaryAccepted = 1;
    const contractOk = assertV2StationaryAcceptanceContract(row, v2);
    if (!contractOk.ok) {
      counters.acceptanceContractViolations = 1;
      push('ACCEPTANCE_CONTRACT', contractOk.detail);
    }
    if (row.positionState === 'FROZEN_UNRESOLVED' || row.positionState === 'RELEASE') {
      counters.releaseFrozenV2Accepted = 1;
      push('RELEASE_FROZEN_ACCEPT', `shadow positionState=${row.positionState}`);
    }
  } else if (bandCandidate) {
    counters.v2StationaryWithheld = 1;
    const primary = v2.reasonCodes[0] ?? 'UNKNOWN';
    counters.withheldReasonBreakdown = { [primary]: 1 };
  }

  if (!nullPath && v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED)) {
    push('STATIONARY_OK_OUTSIDE_CONTRACT', 'OK_STATIONARY_NULL_SPEED without contractual null stationary path');
  }

  const qcSpeedEqual = v1.qcTrustedSpeedKmh === v2.qcTrustedSpeedKmh;
  const trustEqual = v1.trustLevel === v2.trustLevel;
  const reasonsEqual = JSON.stringify(v1.reasonCodes) === JSON.stringify(v2.reasonCodes);
  const verdictEqual = qcSpeedEqual && trustEqual && reasonsEqual;

  if (!verdictEqual) {
    if (nullPath) {
      if (!qcSpeedEqual) {
        if (v1Fin !== v2Fin) {
          counters.intervalwiseQcSpeedMismatches = 1;
          push(
            'QC_TRUSTED_SPEED_MISMATCH',
            `finite v1=${String(v1.qcTrustedSpeedKmh)} v2=${String(v2.qcTrustedSpeedKmh)} on contractual null path`,
          );
        } else if (v1.qcTrustedSpeedKmh !== v2.qcTrustedSpeedKmh) {
          counters.intervalwiseQcSpeedMismatches = 1;
          push(
            'QC_TRUSTED_SPEED_MISMATCH',
            `non-finite qc mismatch v1=${String(v1.qcTrustedSpeedKmh)} v2=${String(v2.qcTrustedSpeedKmh)}`,
          );
        }
      }
      if (v2Accepted && v2.qcTrustedSpeedKmh !== null) {
        counters.acceptanceContractViolations = 1;
        push('ACCEPTANCE_CONTRACT', `accepted but qcTrustedSpeedKmh=${String(v2.qcTrustedSpeedKmh)}`);
      }
    } else {
      counters.changesOutsideAllowedPath = 1;
      counters.intervalwiseQcSpeedMismatches = qcSpeedEqual ? 0 : 1;
      push(
        'CHANGE_OUTSIDE_ALLOWED_PATH',
        `v1=${v1.trustLevel}/${String(v1.qcTrustedSpeedKmh)} v2=${v2.trustLevel}/${String(v2.qcTrustedSpeedKmh)} shadowSpeed=${String(shadowSpeed)}`,
      );
    }
  }

  if (v1Fin !== null && v2Fin !== null && v1Fin !== v2Fin) {
    counters.intervalwiseQcSpeedMismatches = 1;
    push('QC_TRUSTED_SPEED_MISMATCH', `numeric v1=${v1Fin} v2=${v2Fin}`);
  }

  return { violations, counters };
}

export function assertV2StationaryAcceptanceContract(
  row: DiV0TripSpeedQualityShadowRow,
  v2: DiV0SpeedQcIntervalVerdict,
): { ok: true } | { ok: false; detail: string } {
  if (!v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED)) {
    return { ok: false, detail: 'missing OK_STATIONARY_NULL_SPEED' };
  }
  if (v2.trustLevel !== 'TRUSTED_LIMITED') {
    return { ok: false, detail: `trustLevel=${v2.trustLevel}` };
  }
  if (v2.qcTrustedSpeedKmh !== null) {
    return { ok: false, detail: `qcTrustedSpeedKmh=${String(v2.qcTrustedSpeedKmh)}` };
  }
  if (row.estimatedSpeedKmh !== null) {
    return { ok: false, detail: `estimatedSpeedKmh=${String(row.estimatedSpeedKmh)}` };
  }
  if (!isStationaryBandCandidate(row)) {
    return { ok: false, detail: 'not STATIONARY_SUPPORTED+STATIONARY_BAND' };
  }
  if (row.sourceRelation === 'CONFLICTING' || row.sourceRelation === 'CONFLICT_EXPLAINED') {
    return { ok: false, detail: `sourceRelation=${row.sourceRelation}` };
  }
  if (DISALLOWED_CENTER_PS.has(row.positionState)) {
    return { ok: false, detail: `positionState=${row.positionState}` };
  }
  const flags = Array.isArray(row.sourceQualityFlags) ? row.sourceQualityFlags.map(String) : [];
  const compromised = flags.filter((f) => SUPPORT_COMPROMISED_FLAGS.has(f));
  if (compromised.length > 0) {
    return { ok: false, detail: `compromisedFlags=${compromised.join(',')}` };
  }
  if (v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT)) {
    return { ok: false, detail: 'CROSS_SOURCE_CONFLICT on accept' };
  }
  if (v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED)) {
    return { ok: false, detail: 'SUPPORT_WINDOW_COMPROMISED on accept' };
  }
  return { ok: true };
}

export type P21V1V2TripCompareResult = {
  tripId: string;
  vehicleId: string;
  workItemId: string;
  shadowRunId: string;
  pinnedSnapshotHash: string;
  tripDateUtc: string;
  intervalCount: number;
  dbSession: { transactionReadOnly: string; transactionIsolation: string };
  stationaryCandidates: number;
  contractualNullPathIntervals: number;
  v2StationaryAccepted: number;
  v2StationaryWithheld: number;
  withheldReasonBreakdown: Record<string, number>;
  trustedNumericCountV1: number;
  trustedNumericCountV2: number;
  trustedNumericCoverageV1: number | null;
  trustedNumericCoverageV2: number | null;
  qcTrustedMaxV1: number | null;
  qcTrustedMaxV2: number | null;
  changesOutsideAllowedPath: number;
  nullToZeroConversions: number;
  intervalwiseQcSpeedMismatches: number;
  acceptanceContractViolations: number;
  releaseFrozenIntervalsObserved: number;
  releaseFrozenV2Accepted: number;
  releaseFrozenAcceptedViolations: number;
  violations: IntervalViolation[];
  intervalwiseNumericComparisonComplete: boolean;
  numericCoverageUnchanged: boolean;
  aggregateNumericSummaryUnchanged: boolean;
  regressionPass: boolean;
};

function mergeCounters(acc: IntervalAuditCounters, part: Partial<IntervalAuditCounters>): void {
  acc.stationaryCandidates += part.stationaryCandidates ?? 0;
  acc.contractualNullPathIntervals += part.contractualNullPathIntervals ?? 0;
  acc.v2StationaryAccepted += part.v2StationaryAccepted ?? 0;
  acc.v2StationaryWithheld += part.v2StationaryWithheld ?? 0;
  acc.nullToZeroConversions += part.nullToZeroConversions ?? 0;
  acc.changesOutsideAllowedPath += part.changesOutsideAllowedPath ?? 0;
  acc.intervalwiseQcSpeedMismatches += part.intervalwiseQcSpeedMismatches ?? 0;
  acc.acceptanceContractViolations += part.acceptanceContractViolations ?? 0;
  acc.releaseFrozenIntervalsObserved += part.releaseFrozenIntervalsObserved ?? 0;
  acc.releaseFrozenV2Accepted += part.releaseFrozenV2Accepted ?? 0;
  if (part.withheldReasonBreakdown) {
    for (const [k, v] of Object.entries(part.withheldReasonBreakdown)) {
      acc.withheldReasonBreakdown[k] = (acc.withheldReasonBreakdown[k] ?? 0) + v;
    }
  }
}

export function runP21V1V2PolicyCompareOnLoadedContext(ctx: P21ForensicLoadedContext): P21V1V2TripCompareResult {
  const tripId = ctx.workItem!.trip_id;
  const buildInput = () => ({
    organizationId: ctx.workItem!.organization_id,
    vehicleId: ctx.workItem!.vehicle_id,
    tripId,
    workItemId: ctx.workItem!.id,
    shadowRunId: ctx.shadowRun.id,
    pinnedSnapshotHash: ctx.pinnedSnapshotHash,
    boundaryFingerprint: ctx.workItem!.boundary_fingerprint,
    sourceFamily: ctx.workItem!.source_family as never,
    combinedInputIdentity: ctx.workItem!.combined_input_identity,
    shadowInputEvidenceVersion: ctx.shadowRun.inputEvidenceVersion,
    workItemCompletedAt: ctx.workItem!.completed_at,
    snapshotVerified: true,
    evidence: ctx.evidence,
    shadowIntervals: ctx.shadowIntervals,
  });

  const projectionV1 = buildDiV0TripSpeedQualityProjectionV1(buildInput());
  const projectionV2 = buildDiV0TripSpeedQualityProjectionV1({
    ...buildInput(),
    qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
  });

  const violations: IntervalViolation[] = [];
  const counters: IntervalAuditCounters = {
    stationaryCandidates: 0,
    contractualNullPathIntervals: 0,
    v2StationaryAccepted: 0,
    v2StationaryWithheld: 0,
    withheldReasonBreakdown: {},
    nullToZeroConversions: 0,
    changesOutsideAllowedPath: 0,
    intervalwiseQcSpeedMismatches: 0,
    acceptanceContractViolations: 0,
    releaseFrozenIntervalsObserved: 0,
    releaseFrozenV2Accepted: 0,
  };

  for (const row of ctx.shadowIntervals) {
    const center = dateToBucketLabel(row.referenceTime);
    const shadow = shadowToQc(row, center);
    const v1 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow,
      positions: ctx.evidence.positions,
      r1Obd: ctx.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V1,
    });
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow,
      positions: ctx.evidence.positions,
      r1Obd: ctx.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });

    const audit = auditP21V1V2Interval({ tripId, referenceTime: center, row, v1, v2 });
    violations.push(...audit.violations);
    mergeCounters(counters, audit.counters);
  }

  const aggregateNumericSummaryUnchanged =
    projectionV1.speed.qcTrustedMaxKmh === projectionV2.speed.qcTrustedMaxKmh &&
    projectionV1.speed.qcTrustedMeanKmh === projectionV2.speed.qcTrustedMeanKmh &&
    projectionV1.quality.trustedNumericCount === projectionV2.quality.trustedNumericCount;

  const numericCoverageUnchanged =
    projectionV1.quality.trustedNumericCoveragePercent === projectionV2.quality.trustedNumericCoveragePercent;

  const intervalwiseNumericComparisonComplete =
    counters.intervalwiseQcSpeedMismatches === 0 &&
    counters.changesOutsideAllowedPath === 0 &&
    counters.nullToZeroConversions === 0;

  const releaseFrozenAcceptedViolations = counters.releaseFrozenV2Accepted;

  const regressionPass =
    violations.length === 0 &&
    intervalwiseNumericComparisonComplete &&
    counters.acceptanceContractViolations === 0 &&
    releaseFrozenAcceptedViolations === 0;

  return {
    tripId,
    vehicleId: ctx.workItem!.vehicle_id,
    workItemId: ctx.workItem!.id,
    shadowRunId: ctx.shadowRun.id,
    pinnedSnapshotHash: ctx.pinnedSnapshotHash,
    tripDateUtc: 'unknown',
    intervalCount: ctx.shadowIntervals.length,
    dbSession: {
      transactionReadOnly: ctx.dbTransactionReadOnly,
      transactionIsolation: ctx.dbTransactionIsolation,
    },
    stationaryCandidates: counters.stationaryCandidates,
    contractualNullPathIntervals: counters.contractualNullPathIntervals,
    v2StationaryAccepted: counters.v2StationaryAccepted,
    v2StationaryWithheld: counters.v2StationaryWithheld,
    withheldReasonBreakdown: counters.withheldReasonBreakdown,
    trustedNumericCountV1: projectionV1.quality.trustedNumericCount,
    trustedNumericCountV2: projectionV2.quality.trustedNumericCount,
    trustedNumericCoverageV1: projectionV1.quality.trustedNumericCoveragePercent,
    trustedNumericCoverageV2: projectionV2.quality.trustedNumericCoveragePercent,
    qcTrustedMaxV1: projectionV1.speed.qcTrustedMaxKmh,
    qcTrustedMaxV2: projectionV2.speed.qcTrustedMaxKmh,
    changesOutsideAllowedPath: counters.changesOutsideAllowedPath,
    nullToZeroConversions: counters.nullToZeroConversions,
    intervalwiseQcSpeedMismatches: counters.intervalwiseQcSpeedMismatches,
    acceptanceContractViolations: counters.acceptanceContractViolations,
    releaseFrozenIntervalsObserved: counters.releaseFrozenIntervalsObserved,
    releaseFrozenV2Accepted: counters.releaseFrozenV2Accepted,
    releaseFrozenAcceptedViolations,
    violations,
    intervalwiseNumericComparisonComplete,
    numericCoverageUnchanged,
    aggregateNumericSummaryUnchanged,
    regressionPass,
  };
}

/** Gate helper for batch runner (no PASS on empty or failed session/manifest). */
export function computeMultiTripRegressionVerdict(input: {
  manifestTripCount: number;
  evaluatedTripCount: number;
  excludedCount: number;
  readOnlyObserved: boolean;
  repeatableReadObserved: boolean;
  manifestIdentityOk: boolean;
  allTripsRegressionPass: boolean;
}): 'PASS' | 'PARTIAL' | 'FAIL' | 'INSUFFICIENT_EXISTING_EVIDENCE' | 'GATE_FAIL' {
  if (input.manifestTripCount === 0) return 'INSUFFICIENT_EXISTING_EVIDENCE';
  if (!input.readOnlyObserved || !input.repeatableReadObserved || !input.manifestIdentityOk) {
    return 'GATE_FAIL';
  }
  if (input.evaluatedTripCount === 0) return 'GATE_FAIL';
  if (input.evaluatedTripCount !== input.manifestTripCount || input.excludedCount > 0) {
    return input.evaluatedTripCount > 0 && input.allTripsRegressionPass ? 'PARTIAL' : 'FAIL';
  }
  return input.allTripsRegressionPass ? 'PASS' : 'FAIL';
}
