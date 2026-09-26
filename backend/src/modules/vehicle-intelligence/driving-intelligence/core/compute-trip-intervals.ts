import type { DiV0CalibrationBundle } from './calibration/types';
import {
  assessSourceRelationAtLabel,
} from './claims/cross-source-relation';
import {
  clampClaimLevel,
  deriveSpeedEvidenceState,
  deriveSpeedRangeKmh,
  deriveValueConfidence,
  maxClaimForNumericL3,
} from './claims/claim-confidence';
import { evaluateL3AtCenter } from './kinematics/l3-eligibility';
import { classifyMotionState } from './motion/motion-classifier';
import { classifyPositionRows } from './position/hold-release';
import type {
  DiV0IntervalSpeedResult,
  DiV0TripComputeInput,
  DiV0TripComputeOutput,
  DiV0ProvenanceRef,
  NativeEventObservation,
  TelemetrySourceFamily,
} from './types';
import type { DiV0VersionTuple } from './versions';
import { DI_KINEMATIC_ESTIMATE_V0_1, DI_SOURCE_QUALITY_CONTRACT_V0_1 } from './versions';

export interface DiV0ComputeContext {
  versions: DiV0VersionTuple;
  calibration: DiV0CalibrationBundle;
}

function buildProvenance(
  ctx: DiV0ComputeContext,
  sourceFamily: TelemetrySourceFamily,
  derivationMethod: DiV0ProvenanceRef['derivationMethod'],
  supportStart: string | null,
  supportEnd: string | null,
): DiV0ProvenanceRef {
  return {
    sourceFamily,
    sourceSignal: 'currentLocationCoordinates',
    sourceQuality: 'normalized',
    temporalSemantics: 'BUCKET_BOUNDED',
    supportIntervalStart: supportStart,
    supportIntervalEnd: supportEnd,
    derivationMethod,
    derivationVersion: ctx.versions.estimatorVersion,
    structuralVersion: ctx.versions.structuralVersion,
    calibrationVersion: ctx.versions.calibrationVersion,
    sourceFamilyPolicyVersion: ctx.versions.sourceFamilyPolicyVersion,
    derivedFrom: ['LOCATION_DERIVED_SPEED_ESTIMATE'],
  };
}

function r1ByLabel(r1: DiV0TripComputeInput['r1Obd']): Map<string, NonNullable<DiV0TripComputeInput['r1Obd']>[number]> {
  const map = new Map<string, NonNullable<DiV0TripComputeInput['r1Obd']>[number]>();
  for (const row of r1 ?? []) {
    map.set(row.bucketLabel, row);
  }
  return map;
}

/**
 * Pure DI V0 kinematic evaluation over normalized evidence (no I/O).
 */
export function computeDiV0TripIntervals(
  input: DiV0TripComputeInput,
  ctx: DiV0ComputeContext,
): DiV0TripComputeOutput {
  const warnings: string[] = [];
  if (input.sourceFamily === 'UNKNOWN') {
    return {
      intervals: [],
      nativeEvents: input.nativeEvents ?? [],
      warnings: ['UNSUPPORTED_SOURCE_FAMILY'],
    };
  }
  if (ctx.versions.structuralVersion !== DI_SOURCE_QUALITY_CONTRACT_V0_1) {
    throw new Error(`Unsupported structuralVersion: ${ctx.versions.structuralVersion}`);
  }
  if (ctx.versions.estimatorVersion !== DI_KINEMATIC_ESTIMATE_V0_1) {
    throw new Error(`Unsupported estimatorVersion: ${ctx.versions.estimatorVersion}`);
  }

  const classified = classifyPositionRows(input.positions, ctx.calibration);
  const r1Map = r1ByLabel(input.r1Obd);
  const intervals: DiV0IntervalSpeedResult[] = [];

  for (let i = 0; i < classified.length; i++) {
    const row = classified[i];
    const obs = row.observation;
    const l3 = evaluateL3AtCenter(classified, i);
    const r1 = r1Map.get(obs.bucketLabel);
    const sourceRelation = assessSourceRelationAtLabel(l3.speedKmh, r1, ctx.calibration);
    const flags = [...l3.flags];
    if (r1?.speedKmh != null) {
      flags.push('R1_INTERVAL_ONLY');
    }
    if (input.sourceFamily === 'RUPTELA_R1' && r1 == null) {
      flags.push('R1_ABSENT_AT_LABEL');
    }

    const intervalLb =
      row.positionState === 'FROZEN_MOVEMENT_SUPPORTED' ? ctx.calibration.holdMovementLowerBoundMinKmh : null;

    const motionState = classifyMotionState(
      {
        row,
        l3SpeedKmh: l3.speedKmh,
        l3Eligible: l3.eligible,
        abstentionReason: l3.abstentionReason,
        intervalMeanSpeedLowerBoundKmh: intervalLb,
      },
      ctx.calibration,
    );

    let estimatedSpeedKmh =
      motionState === 'MOVING_SPEED_ESTIMATED' && l3.eligible ? l3.speedKmh : null;
    if (estimatedSpeedKmh != null && !Number.isFinite(estimatedSpeedKmh)) {
      estimatedSpeedKmh = null;
    }

    if (row.positionState === 'RELEASE' && estimatedSpeedKmh != null) {
      throw new Error('RELEASE_SAFETY_VIOLATION: numeric speed on RELEASE row');
    }

    const valueConfidence = deriveValueConfidence(l3.speedKmh, sourceRelation, ctx.calibration, flags);
    const speedRangeKmh = deriveSpeedRangeKmh(estimatedSpeedKmh, valueConfidence, ctx.calibration);
    const speedEvidenceState = deriveSpeedEvidenceState(motionState, estimatedSpeedKmh, valueConfidence);

    let claimLevel = 'L0' as DiV0IntervalSpeedResult['claimLevel'];
    if (estimatedSpeedKmh != null) {
      claimLevel = clampClaimLevel('L2', maxClaimForNumericL3());
    } else if (motionState === 'MOVING_SPEED_UNKNOWN') {
      claimLevel = 'L2';
    } else if (motionState === 'STATIONARY_SUPPORTED') {
      claimLevel = 'L1';
    } else if (motionState === 'TRANSITION_UNCERTAIN') {
      claimLevel = row.positionState === 'RELEASE' ? 'L0' : 'L1';
    }

    const evidenceSources: string[] = [];
    if (l3.eligible) {
      evidenceSources.push('L3');
    }
    if (isFrozen(row.positionState)) {
      evidenceSources.push('HOLD_GEOMETRY');
    }
    if (r1?.speedKmh != null) {
      evidenceSources.push('R1_INTERVAL');
    }

    intervals.push({
      intervalStart: obs.intervalStart,
      intervalEnd: obs.intervalEnd,
      referenceTime: obs.referenceTime,
      motionState,
      estimatedSpeedKmh,
      speedRangeKmh,
      speedEvidenceState,
      positionState: row.positionState,
      causalPositionState: row.causalPositionState,
      temporalConfidence: 'BUCKET_BOUNDED',
      valueConfidence,
      sourceRelation,
      evidenceSources,
      sourceQualityFlags: flags,
      abstentionReason: l3.eligible ? null : l3.abstentionReason,
      claimLevel,
      provenance: buildProvenance(
        ctx,
        input.sourceFamily,
        l3.eligible ? 'L3_CENTERED_PATH' : 'NONE',
        l3.supportIntervalStart,
        l3.supportIntervalEnd,
      ),
      intervalMeanSpeedLowerBoundKmh: intervalLb,
    });
  }

  const nativeEvents: NativeEventObservation[] = (input.nativeEvents ?? []).map((e) => ({
    ...e,
    calibrationState: e.calibrationState ?? 'UNCALIBRATED',
    temporalConfidence: e.temporalConfidence ?? 'UNKNOWN',
  }));

  return { intervals, nativeEvents, warnings };
}

function isFrozen(state: DiV0IntervalSpeedResult['positionState']): boolean {
  return (
    state === 'FROZEN_UNRESOLVED' ||
    state === 'FROZEN_MOVEMENT_SUPPORTED' ||
    state === 'FROZEN_STOP_SUPPORTED'
  );
}
