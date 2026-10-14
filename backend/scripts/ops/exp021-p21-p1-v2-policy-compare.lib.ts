import { DI_V0_SPEED_QC_POLICY_V1, DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
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

function isStationaryCandidate(row: DiV0TripSpeedQualityShadowRow): boolean {
  return row.motionState === 'STATIONARY_SUPPORTED' && row.speedEvidenceState === 'STATIONARY_BAND';
}

const DISALLOWED_CENTER_PS = new Set(['FROZEN_UNRESOLVED', 'RELEASE']);

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
  unsafePromotions: number;
  violations: Array<{ referenceTime: string; kind: string; detail: string }>;
  numericValuesUnchanged: boolean;
  numericCoverageUnchanged: boolean;
  regressionPass: boolean;
};

export function runP21V1V2PolicyCompareOnLoadedContext(ctx: P21ForensicLoadedContext): P21V1V2TripCompareResult {
  const buildInput = () => ({
    organizationId: ctx.workItem!.organization_id,
    vehicleId: ctx.workItem!.vehicle_id,
    tripId: ctx.workItem!.trip_id,
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

  const violations: Array<{ referenceTime: string; kind: string; detail: string }> = [];
  let stationaryCandidates = 0;
  let v2Accepted = 0;
  let v2Withheld = 0;
  const withheldReasons: Record<string, number> = {};
  let changesOutside = 0;
  let nullToZero = 0;
  let unsafePromotions = 0;

  for (const row of ctx.shadowIntervals) {
    const center = dateToBucketLabel(row.referenceTime);
    const candidate = isStationaryCandidate(row);
    const v1 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: shadowToQc(row, center),
      positions: ctx.evidence.positions,
      r1Obd: ctx.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V1,
    });
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: shadowToQc(row, center),
      positions: ctx.evidence.positions,
      r1Obd: ctx.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });

    if (v1.qcTrustedSpeedKmh === 0 && row.estimatedSpeedKmh == null) {
      violations.push({ referenceTime: center, kind: 'V1_NULL_TO_ZERO', detail: 'v1 qcTrustedSpeedKmh=0 with null shadow speed' });
    }
    if (v2.qcTrustedSpeedKmh === 0 && row.estimatedSpeedKmh == null && !candidate) {
      nullToZero += 1;
      violations.push({ referenceTime: center, kind: 'NULL_TO_ZERO', detail: 'v2 qcTrustedSpeedKmh=0 with null shadow speed outside stationary band' });
    }

    const speedChanged = v1.qcTrustedSpeedKmh !== v2.qcTrustedSpeedKmh;
    const trustChanged = v1.trustLevel !== v2.trustLevel;
    const reasonsChanged = JSON.stringify(v1.reasonCodes) !== JSON.stringify(v2.reasonCodes);

    if (candidate) {
      stationaryCandidates += 1;
      const accepted = v2.reasonCodes.includes('OK_STATIONARY_NULL_SPEED');
      if (accepted) v2Accepted += 1;
      else {
        v2Withheld += 1;
        const primary = v2.reasonCodes[0] ?? 'UNKNOWN';
        withheldReasons[primary] = (withheldReasons[primary] ?? 0) + 1;
      }
      if (accepted) {
        if (v2.qcTrustedSpeedKmh !== null) {
          violations.push({
            referenceTime: center,
            kind: 'STATIONARY_ACCEPT_NON_NULL',
            detail: `qcTrustedSpeedKmh=${String(v2.qcTrustedSpeedKmh)}`,
          });
        }
        if (DISALLOWED_CENTER_PS.has(row.positionState)) {
          unsafePromotions += 1;
          violations.push({
            referenceTime: center,
            kind: 'UNSAFE_STATIONARY_ACCEPT',
            detail: `positionState=${row.positionState}`,
          });
        }
      }
    } else if (speedChanged || trustChanged || reasonsChanged) {
      changesOutside += 1;
      violations.push({
        referenceTime: center,
        kind: 'CHANGE_OUTSIDE_STATIONARY_CANDIDATE',
        detail: `v1=${v1.trustLevel}/${String(v1.qcTrustedSpeedKmh)} v2=${v2.trustLevel}/${String(v2.qcTrustedSpeedKmh)}`,
      });
    }

    if (
      !candidate &&
      v2.reasonCodes.includes('OK_STATIONARY_NULL_SPEED')
    ) {
      unsafePromotions += 1;
      violations.push({ referenceTime: center, kind: 'STATIONARY_OK_OUTSIDE_BAND', detail: 'OK_STATIONARY_NULL_SPEED without candidate motion' });
    }
  }

  const numericValuesUnchanged =
    projectionV1.speed.qcTrustedMaxKmh === projectionV2.speed.qcTrustedMaxKmh &&
    projectionV1.speed.qcTrustedMeanKmh === projectionV2.speed.qcTrustedMeanKmh &&
    projectionV1.quality.trustedNumericCount === projectionV2.quality.trustedNumericCount;

  const numericCoverageUnchanged =
    projectionV1.quality.trustedNumericCoveragePercent === projectionV2.quality.trustedNumericCoveragePercent;

  if (!numericValuesUnchanged) {
    violations.push({
      referenceTime: 'TRIP_AGGREGATE',
      kind: 'AGGREGATE_NUMERIC_DRIFT',
      detail: `max ${String(projectionV1.speed.qcTrustedMaxKmh)}→${String(projectionV2.speed.qcTrustedMaxKmh)} count ${projectionV1.quality.trustedNumericCount}→${projectionV2.quality.trustedNumericCount}`,
    });
  }
  if (!numericCoverageUnchanged) {
    violations.push({
      referenceTime: 'TRIP_AGGREGATE',
      kind: 'COVERAGE_DRIFT',
      detail: `${String(projectionV1.quality.trustedNumericCoveragePercent)}→${String(projectionV2.quality.trustedNumericCoveragePercent)}`,
    });
  }

  const regressionPass =
    violations.length === 0 && changesOutside === 0 && nullToZero === 0 && unsafePromotions === 0;

  return {
    tripId: ctx.workItem!.trip_id,
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
    stationaryCandidates,
    v2StationaryAccepted: v2Accepted,
    v2StationaryWithheld: v2Withheld,
    withheldReasonBreakdown: withheldReasons,
    trustedNumericCountV1: projectionV1.quality.trustedNumericCount,
    trustedNumericCountV2: projectionV2.quality.trustedNumericCount,
    trustedNumericCoverageV1: projectionV1.quality.trustedNumericCoveragePercent,
    trustedNumericCoverageV2: projectionV2.quality.trustedNumericCoveragePercent,
    qcTrustedMaxV1: projectionV1.speed.qcTrustedMaxKmh,
    qcTrustedMaxV2: projectionV2.speed.qcTrustedMaxKmh,
    changesOutsideAllowedPath: changesOutside,
    nullToZeroConversions: nullToZero,
    unsafePromotions,
    violations,
    numericValuesUnchanged,
    numericCoverageUnchanged,
    regressionPass,
  };
}
